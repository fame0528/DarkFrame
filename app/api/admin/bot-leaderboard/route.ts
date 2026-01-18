/**
 * @fileoverview Admin Bot Leaderboard API - Separate bot rankings
 * @module app/api/admin/bot-leaderboard/route
 * @created 2025-10-18
 * @updated 2025-10-24 (FID-20251024-ADMIN: Production Infrastructure)
 * 
 * OVERVIEW:
 * Admin-only endpoint for viewing bot-specific leaderboards.
 * Shows rankings for bots by various metrics (strength, resources, defeats, reputation).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
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

// ============================================================================
// GET - Bot Leaderboard
// ============================================================================

/**
 * GET /api/admin/bot-leaderboard?metric=strength
 * Rate Limited: 500 req/min (admin dashboard)
 * Returns bot rankings by specified metric
 * Requires admin privileges (rank >= 5)
 * 
 * Query params:
 * - metric: 'strength' | 'resources' | 'defeats' | 'reputation' (default: strength)
 * - limit: number (default: 100, max: 500)
 */
export const GET = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('AdminBotLeaderboardAPI');
  const endTimer = log.time('bot-leaderboard');

  try {
    // Authenticate user
    const tokenPayload = await getAuthenticatedUser();
    if (!tokenPayload) {
      return createErrorResponse(ErrorCode.AUTH_UNAUTHORIZED, {
        message: 'Authentication required',
      });
    }

    // Check admin privileges
    const client = await clientPromise;
    const db = client.db('game');
    const player = await db.collection('players').findOne({ username: tokenPayload.username });

    if (!player || !player.rank || player.rank < 5) {
      return createErrorResponse(ErrorCode.ADMIN_ACCESS_REQUIRED, {
        message: 'Admin privileges required (rank 5+)',
      });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const metric = searchParams.get('metric') || 'strength';
    const limitParam = searchParams.get('limit') || '100';
    const limit = Math.min(parseInt(limitParam, 10), 500);

    if (isNaN(limit) || limit < 1) {
      return NextResponse.json(
        { error: 'Invalid limit parameter' },
        { status: 400 }
      );
    }

    // Validate metric
    const validMetrics = ['strength', 'resources', 'defeats', 'reputation'];
    if (!validMetrics.includes(metric)) {
      return createErrorResponse(ErrorCode.VALIDATION_INVALID_FORMAT, {
        message: `Invalid metric. Must be one of: ${validMetrics.join(', ')}`,
      });
    }

    // Get all bots
    const bots = await db.collection('players')
      .find({ isBot: true })
      .toArray();

    // Rank bots based on metric
    let rankedBots: Array<{
      rank: number;
      username: string;
      specialization: string;
      tier: number;
      score: number;
      details: Record<string, unknown>;
    }> = [];

    switch (metric) {
      case 'strength': {
        // Rank by total attack + defense
        const scored = bots.map(bot => ({
          username: bot.username,
          specialization: bot.botConfig?.specialization || 'Unknown',
          tier: bot.botConfig?.tier || 1,
          score: (bot.totalAttack || 0) + (bot.totalDefense || 0),
          details: {
            totalAttack: bot.totalAttack || 0,
            totalDefense: bot.totalDefense || 0,
            totalPower: (bot.totalAttack || 0) + (bot.totalDefense || 0),
          },
        }));

        scored.sort((a, b) => b.score - a.score);
        rankedBots = scored.slice(0, limit).map((bot, index) => ({
          rank: index + 1,
          ...bot,
        }));
        break;
      }

      case 'resources': {
        // Rank by total resources (metal + energy)
        const scored = bots.map(bot => ({
          username: bot.username,
          specialization: bot.botConfig?.specialization || 'Unknown',
          tier: bot.botConfig?.tier || 1,
          score: (bot.resources?.metal || 0) + (bot.resources?.energy || 0),
          details: {
            metal: bot.resources?.metal || 0,
            energy: bot.resources?.energy || 0,
            totalResources: (bot.resources?.metal || 0) + (bot.resources?.energy || 0),
          },
        }));

        scored.sort((a, b) => b.score - a.score);
        rankedBots = scored.slice(0, limit).map((bot, index) => ({
          rank: index + 1,
          ...bot,
        }));
        break;
      }

      case 'defeats': {
        // Rank by times defeated (tracked in bot scanner)
        // This requires aggregating player defeat counts
        const trackedBots = await db.collection('botTracking')
          .find()
          .toArray();

        const defeatCounts: Record<string, number> = {};
        for (const track of trackedBots) {
          const botUsername = track.botUsername;
          defeatCounts[botUsername] = (defeatCounts[botUsername] || 0) + (track.defeats || 0);
        }

        const scored = bots.map(bot => ({
          username: bot.username,
          specialization: bot.botConfig?.specialization || 'Unknown',
          tier: bot.botConfig?.tier || 1,
          score: defeatCounts[bot.username] || 0,
          details: {
            timesDefeated: defeatCounts[bot.username] || 0,
            isSpecialBase: bot.botConfig?.isSpecialBase || false,
          },
        }));

        scored.sort((a, b) => b.score - a.score);
        rankedBots = scored.slice(0, limit).map((bot, index) => ({
          rank: index + 1,
          ...bot,
        }));
        break;
      }

      case 'reputation': {
        // Rank by highest reputation (most notorious)
        const reputationOrder = { legendary: 4, infamous: 3, notorious: 2, unknown: 1 };

        const scored = bots.map(bot => {
          const reputation = bot.botConfig?.reputation || 'unknown';
          return {
            username: bot.username,
            specialization: bot.botConfig?.specialization || 'Unknown',
            tier: bot.botConfig?.tier || 1,
            score: reputationOrder[reputation as keyof typeof reputationOrder] || 0,
            details: {
              reputation,
              defeatsRequired: reputation === 'legendary' ? 31 : reputation === 'infamous' ? 16 : reputation === 'notorious' ? 6 : 0,
            },
          };
        });

        scored.sort((a, b) => b.score - a.score);
        rankedBots = scored.slice(0, limit).map((bot, index) => ({
          rank: index + 1,
          ...bot,
        }));
        break;
      }
    }

    log.info('Bot leaderboard retrieved', {
      metric,
      totalBots: bots.length,
      returnedCount: rankedBots.length,
      adminUser: tokenPayload.username,
    });

    return NextResponse.json({
      success: true,
      data: {
        metric,
        leaderboard: rankedBots,
        totalBots: bots.length,
        limit,
      },
    });
  } catch (error) {
    log.error('Failed to fetch bot leaderboard', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));

// ============================================================================
// IMPLEMENTATION NOTES
// ============================================================================

/**
 * ADMIN PERMISSIONS:
 * - Requires rank >= 5 to view bot leaderboards
 * - Bots excluded from main player leaderboard
 * - Separate metrics for different bot rankings
 * 
 * METRICS:
 * - strength: Total attack + defense power
 * - resources: Total metal + energy
 * - defeats: Times defeated by players (most challenged bots)
 * - reputation: Highest reputation tier (legendary > infamous > notorious > unknown)
 * 
 * USAGE:
 * Get top 100 bots by strength:
 * GET /api/admin/bot-leaderboard?metric=strength
 * 
 * Get top 50 bots by resources:
 * GET /api/admin/bot-leaderboard?metric=resources&limit=50
 * 
 * Get most defeated bots:
 * GET /api/admin/bot-leaderboard?metric=defeats
 * 
 * FUTURE ENHANCEMENTS:
 * - Historical trends (bot strength over time)
 * - Specialization-specific leaderboards
 * - Combat statistics (wins/losses)
 * - Territory control metrics
 */
