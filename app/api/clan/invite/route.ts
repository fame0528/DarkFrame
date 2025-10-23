/**
 * Clan Invite API Route
 * POST /api/clan/invite
 * 
 * Sends a clan invitation to another player.
 * Validates sender has permission and clan has space.
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import clientPromise from '@/lib/mongodb';
import { invitePlayerToClan, getClanByPlayerId, initializeClanService } from '@/lib/clanService';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

/**
 * POST /api/clan/invite
 * Invite a player to the clan
 * 
 * Request body:
 * {
 *   targetUsername: string  // Username to invite
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   invitation: ClanInvitation
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
    const { targetUsername } = body;

    // Validate required fields
    if (!targetUsername) {
      return NextResponse.json(
        { success: false, error: 'Target username is required' },
        { status: 400 }
      );
    }

    // Get database connection
    const client = await clientPromise;
    const db = client.db('darkframe');

    // Initialize clan service
    initializeClanService(client, db);

    // Get inviter player by username
    const inviter = await db.collection('players').findOne({ username });
    if (!inviter) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    const inviterId = inviter._id.toString();

    // Get inviter's clan
    const clan = await getClanByPlayerId(inviterId);
    if (!clan) {
      return NextResponse.json(
        { success: false, error: 'You are not in a clan' },
        { status: 400 }
      );
    }

    const clanId = clan._id!.toString();

    // Get target player
    const targetPlayer = await db.collection('players').findOne({ username: targetUsername });
    if (!targetPlayer) {
      return NextResponse.json(
        { success: false, error: 'Target player not found' },
        { status: 404 }
      );
    }

    const invitedPlayerId = targetPlayer._id.toString();

    // Send invitation
    const invitation = await invitePlayerToClan(clanId, inviterId, invitedPlayerId);

    return NextResponse.json({
      success: true,
      invitation,
      message: `Invitation sent to ${targetUsername}`,
    });

  } catch (error: any) {
    console.error('Clan invite error:', error);

    // Handle specific errors
    if (error.message?.includes('permission')) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to invite members' },
        { status: 403 }
      );
    }

    if (error.message?.includes('full')) {
      return NextResponse.json(
        { success: false, error: 'Clan is full' },
        { status: 400 }
      );
    }

    if (error.message?.includes('already in a clan')) {
      return NextResponse.json(
        { success: false, error: 'Player is already in a clan' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to send invitation' },
      { status: 500 }
    );
  }
}
