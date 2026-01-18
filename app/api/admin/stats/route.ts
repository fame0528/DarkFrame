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
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import {
  withRequestLogging,
  createRouteLogger,
  createRateLimiter,
  ENDPOINT_RATE_LIMITS,
  createErrorResponse,
  createErrorFromException,
  ErrorCode,
} from '@/lib';

const rateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.admin);

/**
 * GET /api/admin/stats
 * 
 * Get game statistics for admin panel
 * Requires level 10+
 */
export const GET = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('admin/stats');
  const endTimer = log.time('get-admin-stats');

  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return createErrorResponse(ErrorCode.AUTH_UNAUTHORIZED);
    }

    // Check admin access (isAdmin flag required)
    if (user.isAdmin !== true) {
      return createErrorResponse(ErrorCode.ADMIN_ACCESS_REQUIRED);
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

    log.info('Admin stats retrieved', {
      totalPlayers,
      activePlayers24h,
      totalBases,
      totalFactories,
    });

    return NextResponse.json({
      success: true,
      data: stats
    });

  } catch (error) {
    log.error('Failed to load admin stats', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));

// ============================================================
// END OF FILE
// ============================================================
