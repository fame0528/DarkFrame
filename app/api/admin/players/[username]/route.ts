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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> }
): Promise<NextResponse> {
  const log = createRouteLogger('admin-player-detail');
  const endTimer = log.time('admin-player-detail');

  try {
    // Admin authentication
    const user = await getAuthenticatedUser();
    if (!user || !user.rank || user.rank < 5) {
      return createErrorResponse(ErrorCode.ADMIN_ACCESS_REQUIRED, 'Admin access required (rank 5+)');
    }

  const { username } = await context.params;

    const client = await clientPromise;
    const db = client.db('game');

    // Get player data
    const player = await db.collection('players').findOne({ username });

    if (!player) {
      log.warn('Player not found', { username });
      return createErrorResponse(ErrorCode.RESOURCE_NOT_FOUND, 'Player not found');
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

    log.info('Player data retrieved', { 
      username, 
      level: responseData.level, 
      isBot: responseData.isBot,
      sessionCount: sessions.length 
    });

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    log.error('Player fetch error', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
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
