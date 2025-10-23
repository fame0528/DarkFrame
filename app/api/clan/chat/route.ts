/**
 * Clan Chat API Routes
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * API endpoints for clan chat functionality. Handles message sending, history
 * retrieval, editing, and moderation with JWT authentication and role-based
 * permissions.
 * 
 * Endpoints:
 * - GET /api/clan/chat?clanId={id}&limit={50}&before={timestamp}
 *   Retrieve chat history with pagination
 * 
 * - POST /api/clan/chat
 *   Send new message
 * 
 * - PUT /api/clan/chat
 *   Edit own message
 * 
 * - DELETE /api/clan/chat?messageId={id}
 *   Delete message (moderation)
 * 
 * @module app/api/clan/chat/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { MongoClient, Db } from 'mongodb';
import {
  initializeChatService,
  sendMessage,
  getMessages,
  editMessage,
  deleteMessage,
  getMessagesSince,
  MessageType,
} from '@/lib/clanChatService';

const MONGODB_URI = process.env.MONGODB_URI!;
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret-key');

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db('darkframe');

  cachedClient = client;
  cachedDb = db;

  // Initialize chat service
  initializeChatService(client, db);

  return { client, db };
}

/**
 * Extract and verify JWT from cookies
 */
async function verifyAuth(request: NextRequest): Promise<string | null> {
  try {
    const token = request.cookies.get('auth-token')?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.userId as string;
  } catch {
    return null;
  }
}

// ============================================================================
// GET - Retrieve Chat Messages
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    // Authenticate
    const playerId = await verifyAuth(request);
    if (!playerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Extract query parameters
    const { searchParams } = new URL(request.url);
    const clanId = searchParams.get('clanId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const beforeParam = searchParams.get('before');
    const sinceParam = searchParams.get('since');

    if (!clanId) {
      return NextResponse.json({ error: 'Clan ID required' }, { status: 400 });
    }

    // Verify player is in clan
    const db = cachedDb!;
    const clansCollection = db.collection('clans');
    const clan = await clansCollection.findOne({ _id: clanId } as any);
    
    if (!clan) {
      return NextResponse.json({ error: 'Clan not found' }, { status: 404 });
    }

    const isMember = clan.members.some((m: any) => m.playerId === playerId);
    if (!isMember) {
      return NextResponse.json({ error: 'Not a member of this clan' }, { status: 403 });
    }

    let messages;

    // Handle 'since' parameter for real-time updates
    if (sinceParam) {
      const since = new Date(sinceParam);
      if (isNaN(since.getTime())) {
        return NextResponse.json({ error: 'Invalid since timestamp' }, { status: 400 });
      }
      messages = await getMessagesSince(clanId, since);
    } else {
      // Regular pagination with 'before'
      const before = beforeParam ? new Date(beforeParam) : undefined;
      if (beforeParam && before && isNaN(before.getTime())) {
        return NextResponse.json({ error: 'Invalid before timestamp' }, { status: 400 });
      }
      messages = await getMessages(clanId, limit, before);
    }

    return NextResponse.json({
      success: true,
      messages,
      count: messages.length,
    });
  } catch (error: any) {
    console.error('Error retrieving chat messages:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve messages' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - Send Chat Message
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    // Authenticate
    const playerId = await verifyAuth(request);
    if (!playerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { clanId, message, type } = body;

    if (!clanId || !message) {
      return NextResponse.json(
        { error: 'Clan ID and message are required' },
        { status: 400 }
      );
    }

    // Validate message type
    const messageType = type || MessageType.USER;
    if (!Object.values(MessageType).includes(messageType)) {
      return NextResponse.json({ error: 'Invalid message type' }, { status: 400 });
    }

    // Only leaders can send announcements
    if (messageType === MessageType.ANNOUNCEMENT) {
      const db = cachedDb!;
      const clansCollection = db.collection('clans');
      const clan = await clansCollection.findOne({ _id: clanId } as any);
      
      if (!clan) {
        return NextResponse.json({ error: 'Clan not found' }, { status: 404 });
      }

      const member = clan.members.find((m: any) => m.playerId === playerId);
      if (!member || member.role !== 'LEADER') {
        return NextResponse.json(
          { error: 'Only leaders can send announcements' },
          { status: 403 }
        );
      }
    }

    // Send message
    const chatMessage = await sendMessage(clanId, playerId, message, messageType);

    return NextResponse.json({
      success: true,
      message: chatMessage,
    });
  } catch (error: any) {
    console.error('Error sending chat message:', error);
    
    // Handle specific error cases
    if (error.message.includes('Recruits must wait')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    
    if (error.message.includes('Rate limit exceeded')) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    
    if (error.message.includes('too long')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: error.message || 'Failed to send message' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT - Edit Chat Message
// ============================================================================

export async function PUT(request: NextRequest) {
  try {
    await connectToDatabase();

    // Authenticate
    const playerId = await verifyAuth(request);
    if (!playerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { messageId, message } = body;

    if (!messageId || !message) {
      return NextResponse.json(
        { error: 'Message ID and new message text are required' },
        { status: 400 }
      );
    }

    // Edit message
    const updatedMessage = await editMessage(messageId, playerId, message);

    return NextResponse.json({
      success: true,
      message: updatedMessage,
    });
  } catch (error: any) {
    console.error('Error editing chat message:', error);
    
    // Handle specific error cases
    if (error.message.includes('Can only edit your own')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    
    if (error.message.includes('within')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    
    if (error.message.includes('too long')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: error.message || 'Failed to edit message' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Delete Chat Message
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    await connectToDatabase();

    // Authenticate
    const playerId = await verifyAuth(request);
    if (!playerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Extract query parameters
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get('messageId');
    const clanId = searchParams.get('clanId');

    if (!messageId || !clanId) {
      return NextResponse.json(
        { error: 'Message ID and Clan ID are required' },
        { status: 400 }
      );
    }

    // Delete message
    await deleteMessage(messageId, clanId, playerId);

    return NextResponse.json({
      success: true,
      message: 'Message deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting chat message:', error);
    
    // Handle specific error cases
    if (error.message.includes('Can only delete your own')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error.message || 'Failed to delete message' },
      { status: 500 }
    );
  }
}

export const runtime = 'edge';
