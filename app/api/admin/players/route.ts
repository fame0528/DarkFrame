/**
 * @file app/api/admin/players/route.ts
 * @created 2025-10-18
 * @overview Admin player list API endpoint
 * 
 * OVERVIEW:
 * Returns list of all players with basic info for admin panel.
 * Access restricted to level 10+ players.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { Player } from '@/types';

/**
 * GET /api/admin/players
 * 
 * Get list of all players for admin panel
 * Requires level 10+
 */
export async function GET(request: NextRequest) {
  try {
    // Check admin access via cookie
    const { getAuthenticatedUser } = await import('@/lib/authMiddleware');
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Check admin access (isAdmin flag required)
    if (user.isAdmin !== true) {
      return NextResponse.json(
        { success: false, error: 'Access denied - Admin only' },
        { status: 403 }
      );
    }

    // Get all players with limited fields
    const playersCollection = await getCollection<Player>('players');
    const players = await playersCollection
      .find({})
      .project({
        username: 1,
        level: 1,
        rank: 1,
        'resources.metal': 1,
        'resources.energy': 1,
        'base.x': 1,
        'base.y': 1,
        createdAt: 1
      })
      .sort({ level: -1, username: 1 })
      .toArray();

    // Format player data
    const playerList = players.map(p => ({
      username: p.username,
      level: p.level || 1,
      rank: p.rank || 1,
      metal: p.resources?.metal || 0,
      energy: p.resources?.energy || 0,
      baseLocation: `(${p.base.x}, ${p.base.y})`,
      lastActive: p.createdAt ? new Date(p.createdAt).toISOString() : undefined
    }));

    return NextResponse.json({
      success: true,
      data: playerList
    });

  } catch (error) {
    console.error('❌ Error loading player list:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load players' },
      { status: 500 }
    );
  }
}

// ============================================================
// END OF FILE
// ============================================================
