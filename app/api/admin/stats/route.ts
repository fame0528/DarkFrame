/**
 * @file app/api/admin/stats/route.ts
 * @created 2025-10-18
 * @overview Admin statistics API endpoint
 * 
 * OVERVIEW:
 * Returns game-wide statistics for admin dashboard.
 * Access restricted to level 10+ players.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { Player, Tile, TerrainType } from '@/types';

/**
 * GET /api/admin/stats
 * 
 * Get game statistics for admin panel
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

    const playersCollection = await getCollection<Player>('players');

    // Gather statistics
    const tilesCollection = await getCollection<Tile>('tiles');

    const [
      totalPlayers,
      totalBases,
      totalFactories,
      mapStats
    ] = await Promise.all([
      playersCollection.countDocuments(),
      tilesCollection.countDocuments({ occupiedByBase: true }),
      tilesCollection.countDocuments({ terrain: TerrainType.Factory }),
      Promise.all([
        tilesCollection.countDocuments({ terrain: TerrainType.Wasteland }),
        tilesCollection.countDocuments({ terrain: TerrainType.Metal }),
        tilesCollection.countDocuments({ terrain: TerrainType.Energy }),
        tilesCollection.countDocuments({ terrain: TerrainType.Cave }),
        tilesCollection.countDocuments({ terrain: TerrainType.Forest }),
        tilesCollection.countDocuments({ terrain: TerrainType.Bank }),
        tilesCollection.countDocuments({ terrain: TerrainType.Shrine })
      ])
    ]);

    // Active players in last 1h, 24h, 7d (uses lastActive field on players)
    const now = new Date();
    const cutoff1h = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [activePlayers1h, activePlayers24h, activePlayers7d] = await Promise.all([
      playersCollection.countDocuments({ lastActive: { $gte: cutoff1h } }),
      playersCollection.countDocuments({ lastActive: { $gte: cutoff24h } }),
      playersCollection.countDocuments({ lastActive: { $gte: cutoff7d } })
    ]);

    const stats = {
      totalPlayers,
      totalBases,
      totalFactories,
      activePlayers1h,
      activePlayers24h,
      activePlayers7d,
      mapStats: {
        wastelands: mapStats[0],
        metal: mapStats[1],
        energy: mapStats[2],
        caves: mapStats[3],
        forests: mapStats[4],
        banks: mapStats[5],
        shrines: mapStats[6]
      }
    };

    return NextResponse.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Error loading admin stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load statistics' },
      { status: 500 }
    );
  }
}

// ============================================================
// END OF FILE
// ============================================================
