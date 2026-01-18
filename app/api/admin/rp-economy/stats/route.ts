/**
 * @file app/api/admin/rp-economy/stats/route.ts
 * @created 2025-10-20
 * @overview API endpoint for RP economy statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { Player } from '@/types';
import { getAuthenticatedUser } from '@/lib/authService';
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
 * GET /api/admin/rp-economy/stats
 * Returns overall RP economy statistics
 */
export const GET = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('admin/rp-economy/stats');
  const endTimer = log.time('get-rp-economy-stats');

  try {
    // Verify admin authentication
    const adminUser = await getAuthenticatedUser();
    if (!adminUser?.isAdmin) {
      return createErrorResponse(ErrorCode.ADMIN_ACCESS_REQUIRED);
    }

    // Calculate economy stats
    const playersCollection = await getCollection<Player>('players');
    const players = await playersCollection.find({}).toArray();
    
    const totalRP = players.reduce((sum: number, p: Player) => sum + (p.researchPoints || 0), 0);
    const vipPlayers = players.filter((p: Player) => p.vip && p.vipExpiration && new Date(p.vipExpiration) > new Date()).length;
    
    // Calculate total generated and spent from rpHistory
    let totalGenerated = 0;
    let totalSpent = 0;
    
    for (const player of players) {
      if (player.rpHistory && Array.isArray(player.rpHistory)) {
        for (const entry of player.rpHistory) {
          if (entry.amount > 0) {
            totalGenerated += entry.amount;
          } else {
            totalSpent += Math.abs(entry.amount);
          }
        }
      }
    }

    // Get active earners in last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeEarners24h = players.filter((p: Player) => {
      if (!p.rpHistory || !Array.isArray(p.rpHistory)) return false;
      return p.rpHistory.some((entry: any) => 
        entry.amount > 0 && 
        entry.timestamp && 
        new Date(entry.timestamp) > oneDayAgo
      );
    }).length;

    // Calculate daily generation (last 24 hours)
    let dailyGeneration = 0;
    for (const player of players) {
      if (player.rpHistory && Array.isArray(player.rpHistory)) {
        for (const entry of player.rpHistory) {
          if (entry.amount > 0 && entry.timestamp && new Date(entry.timestamp) > oneDayAgo) {
            dailyGeneration += entry.amount;
          }
        }
      }
    }

    // Calculate average and median balance
    const balances = players.map((p: Player) => p.researchPoints || 0).sort((a: number, b: number) => a - b);
    const averageBalance = Math.round(totalRP / players.length);
    const medianBalance = balances.length > 0 ? balances[Math.floor(balances.length / 2)] : 0;

    log.info('RP economy stats retrieved', {
      totalRP,
      dailyGeneration,
      activeEarners24h,
      vipPlayers,
    });

    return NextResponse.json({
      totalRP,
      totalGenerated,
      totalSpent,
      dailyGeneration,
      activeEarners24h,
      averageBalance,
      medianBalance,
      vipPlayers
    });

  } catch (error) {
    log.error('Failed to fetch RP economy stats', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));
