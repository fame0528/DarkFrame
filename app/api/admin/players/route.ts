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
 * GET /api/admin/players
 * 
 * Get list of all players for admin panel
 * Requires level 10+
 */
export const GET = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('admin/players');
  const endTimer = log.time('get-players');

  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return createErrorResponse(ErrorCode.AUTH_UNAUTHORIZED);
    }

    // Check admin access (isAdmin flag required)
    if (user.isAdmin !== true) {
      return createErrorResponse(ErrorCode.ADMIN_ACCESS_REQUIRED);
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

    log.info('Player list retrieved', {
      totalPlayers: playerList.length,
      requestedBy: user.username,
    });

    return NextResponse.json({
      success: true,
      data: playerList
    });

  } catch (error) {
    log.error('Failed to load player list', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));

// ============================================================
// END OF FILE
// ============================================================
