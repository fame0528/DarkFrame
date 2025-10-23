/**
 * Clan Leave API Route
 * POST /api/clan/leave
 * 
 * Allows a player to voluntarily leave their clan.
 * Leader must transfer leadership before leaving.
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import clientPromise from '@/lib/mongodb';
import { leaveClan, getClanByPlayerId, initializeClanService } from '@/lib/clanService';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

/**
 * POST /api/clan/leave
 * Leave current clan
 * 
 * Request body: {} (empty, uses authenticated player)
 * 
 * Response:
 * {
 *   success: true,
 *   message: string
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

    // Get player's current clan
    const clan = await getClanByPlayerId(playerId);
    if (!clan) {
      return NextResponse.json(
        { success: false, error: 'You are not in a clan' },
        { status: 400 }
      );
    }

    const clanId = clan._id!.toString();

    // Leave clan
    await leaveClan(clanId, playerId);

    return NextResponse.json({
      success: true,
      message: `You have left ${clan.name}`,
    });

  } catch (error: any) {
    console.error('Clan leave error:', error);

    // Handle specific errors
    if (error.message?.includes('leader')) {
      return NextResponse.json(
        { success: false, error: 'Leaders must transfer leadership before leaving' },
        { status: 400 }
      );
    }

    if (error.message?.includes('not in clan')) {
      return NextResponse.json(
        { success: false, error: 'You are not in a clan' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to leave clan' },
      { status: 500 }
    );
  }
}
