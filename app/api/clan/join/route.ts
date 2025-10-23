/**
 * Clan Join API Route
 * POST /api/clan/join
 * 
 * Accepts a clan invitation and adds the player to the clan.
 * Validates invitation exists, not expired, and player not already in a clan.
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import clientPromise from '@/lib/mongodb';
import { joinClan, initializeClanService } from '@/lib/clanService';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

/**
 * POST /api/clan/join
 * Accept a clan invitation
 * 
 * Request body:
 * {
 *   invitationId: string  // Invitation ID to accept
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   clan: Clan            // Joined clan object
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication via JWT cookie
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    let username: string;
    try {
      const verified = await jwtVerify(token, JWT_SECRET);
      username = verified.payload.username as string;
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { invitationId } = body;

    // Validate required fields
    if (!invitationId) {
      return NextResponse.json(
        { success: false, error: 'Invitation ID is required' },
        { status: 400 }
      );
    }

    // Get database connection
    const client = await clientPromise;
    const db = client.db('darkframe');

    // Initialize clan service
    initializeClanService(client, db);

    // Get player by username
    const player = await db.collection('players').findOne({ username });
    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    const playerId = player._id.toString();

    // Accept invitation
    const result = await joinClan(invitationId, playerId);

    return NextResponse.json({
      success: true,
      clan: result.clan,
      message: `Welcome to ${result.clan.name}!`,
    });

  } catch (error: any) {
    console.error('Clan join error:', error);

    // Handle specific errors
    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { success: false, error: 'Invitation not found or expired' },
        { status: 404 }
      );
    }

    if (error.message?.includes('already in a clan')) {
      return NextResponse.json(
        { success: false, error: 'You are already in a clan' },
        { status: 400 }
      );
    }

    if (error.message?.includes('full')) {
      return NextResponse.json(
        { success: false, error: 'Clan is full' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to join clan' },
      { status: 500 }
    );
  }
}
