/**
 * 📅 Created: 2025-01-18
 * 🎯 OVERVIEW:
 * Individual Player Data Endpoint
 * 
 * Returns detailed information for a specific player.
 * Admin-only access for player management features.
 * 
 * GET /api/admin/players/[username]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authService';
import clientPromise from '@/lib/mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: { username: string } }
) {
  try {
    // Admin authentication
    const user = await getAuthenticatedUser();
    if (!user || !user.rank || user.rank < 5) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { username } = params;

    const client = await clientPromise;
    const db = client.db('game');

    // Get player data
    const player = await db.collection('players').findOne({ username });

    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    // Get additional stats
    const sessions = await db.collection('playerSessions')
      .find({ userId: username })
      .sort({ startTime: -1 })
      .limit(1)
      .toArray();

    const lastActive = sessions.length > 0 ? sessions[0].startTime : player.lastLogin;

    const responseData = {
      username: player.username,
      level: player.level || 1,
      rank: player.rank || 0,
      xp: player.xp || 0,
      resources: {
        metal: player.metal || 0,
        energy: player.energy || 0
      },
      position: {
        x: player.x || 0,
        y: player.y || 0
      },
      baseLocation: player.baseLocation || `(${player.x || 0}, ${player.y || 0})`,
      isBot: player.isBot || false,
      createdAt: player.createdAt,
      lastActive,
      totalPlayTime: player.totalPlayTime || 0,
      achievements: player.achievements || []
    };

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Player fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch player'
      },
      { status: 500 }
    );
  }
}

/**
 * 📝 IMPLEMENTATION NOTES:
 * - Admin-only access (rank >= 5)
 * - Returns comprehensive player data
 * - Includes last active timestamp from sessions
 * - Handles missing player gracefully
 * 
 * 🔐 SECURITY:
 * - Admin authentication required
 * - No sensitive data exposure
 * - Safe error handling
 */
