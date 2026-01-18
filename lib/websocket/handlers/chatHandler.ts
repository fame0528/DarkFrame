/**
 * Chat Event Handler
 * Created: 2025-10-19
 * 
 * OVERVIEW:
 * Handles real-time chat events for clan communication including messages,
 * typing indicators, and presence status.
 */

import type { Server, Socket } from 'socket.io';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import type { AuthenticatedUser } from '../auth';
import {
  broadcastChatMessage,
  broadcastTypingIndicator,
  broadcastMemberOnlineStatus,
} from '../broadcast';
import type { ChatMessagePayload, ChatTypingPayload } from '@/types/websocket';

/**
 * Handles sending a chat message
 */
export async function handleSendMessage(
  io: Server,
  socket: Socket,
  data: {
    channelId: string;
    content: string;
    mentions?: string[];
  },
  callback?: (response: { success: boolean; messageId?: string; error?: string }) => void
): Promise<void> {
  const user = socket.data.user as AuthenticatedUser | undefined;

  if (!user) {
    callback?.({ success: false, error: 'Unauthorized' });
    return;
  }
  
  try {
    const db = await connectToDatabase();
    
    // Insert message into database
    const messageId = new ObjectId();
    await db.collection('clan_messages').insertOne({
      _id: messageId,
      channelId: data.channelId,
      clanId: user.clanId, // legacy compatibility if needed
      userId: user.userId,
      username: user.username,
      content: data.content,
      mentions: data.mentions || [],
      timestamp: Date.now(),
      edited: false,
    });
    
    // Broadcast message
    const payload: ChatMessagePayload = {
      messageId: messageId.toString(),
      channelId: data.channelId,
      userId: user.userId,
      username: user.username,
      level: (user as any).level ?? 1,
      isVIP: Boolean((user as any).isVIP ?? (user as any).vip ?? false),
      content: data.content,
      timestamp: Date.now(),
      mentions: data.mentions,
    };
    
    await broadcastChatMessage(io, payload);
    
    callback?.({ success: true, messageId: messageId.toString() });
    
  } catch (error) {
    console.error('[Chat Handler] Failed to send message:', error);
    callback?.({ success: false, error: 'Failed to send message' });
  }
}

/**
 * Handles typing indicator
 */
export async function handleTyping(
  io: Server,
  socket: Socket,
  data: { channelId: string },
  isTyping: boolean
): Promise<void> {
  const user = socket.data.user as AuthenticatedUser | undefined;
  
  if (!user) return;
  
  const payload: ChatTypingPayload = {
    channelId: data.channelId,
    userId: user.userId,
    username: user.username,
    isTyping,
    timestamp: Date.now(),
  };
  
  await broadcastTypingIndicator(io, payload);
}
