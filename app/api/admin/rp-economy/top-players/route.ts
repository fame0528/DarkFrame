/**
 * @file app/api/admin/rp-economy/top-players/route.ts
 * @created 2025-10-20
 * @overview API endpoint for top RP earners and spenders
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';
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
 * GET /api/admin/rp-economy/top-players
 * Returns top RP earners and spenders
 */
export const GET = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('admin/rp-economy/top-players');
  const endTimer = log.time('get-top-players');

  try {
    // Verify admin authentication
    const adminUser = await getAuthenticatedUser();
    if (!adminUser?.isAdmin) {
      return createErrorResponse(ErrorCode.ADMIN_ACCESS_REQUIRED);
    }

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || '7d';

    // Calculate date filter
    const now = new Date();
    let dateFilter: Date | null = null;
    
    if (period === '24h') {
      dateFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (period === '7d') {
      dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const rpTransactionsCollection = await getCollection('rpTransactions');

    // Top Earners (positive amounts)
    const earnersFilter: any = { amount: { $gt: 0 } };
    if (dateFilter) {
      earnersFilter.timestamp = { $gte: dateFilter };
    }

    const topEarnersData = await rpTransactionsCollection.aggregate([
      { $match: earnersFilter },
      {
        $group: {
          _id: '$username',
          totalRP: { $sum: '$amount' }
        }
      },
      { $sort: { totalRP: -1 } },
      { $limit: 10 }
    ]).toArray();

    // Top Spenders (negative amounts)
    const spendersFilter: any = { amount: { $lt: 0 } };
    if (dateFilter) {
      spendersFilter.timestamp = { $gte: dateFilter };
    }

    const topSpendersData = await rpTransactionsCollection.aggregate([
      { $match: spendersFilter },
      {
        $group: {
          _id: '$username',
          totalRP: { $sum: { $abs: '$amount' } }
        }
      },
      { $sort: { totalRP: -1 } },
      { $limit: 10 }
    ]).toArray();

    // Get player VIP status
    const playersCollection = await getCollection('players');
    const allUsernames = [
      ...topEarnersData.map((e: any) => e._id),
      ...topSpendersData.map((s: any) => s._id)
    ];

    const players = await playersCollection.find({
      username: { $in: allUsernames }
    }).toArray();

    const playerVIPMap = new Map(
      players.map((p: any) => [
        p.username,
        !!(p.vip && p.vipExpiration && new Date(p.vipExpiration) > new Date())
      ])
    );

    // Format results
    const topEarners = topEarnersData.map((item: any) => ({
      username: item._id,
      amount: item.totalRP,
      isVIP: playerVIPMap.get(item._id) || false
    }));

    const topSpenders = topSpendersData.map((item: any) => ({
      username: item._id,
      amount: item.totalRP,
      isVIP: playerVIPMap.get(item._id) || false
    }));

    log.info('Top players retrieved', {
      topEarnersCount: topEarners.length,
      topSpendersCount: topSpenders.length,
      period,
    });

    return NextResponse.json({ topEarners, topSpenders });

  } catch (error) {
    log.error('Failed to fetch top players', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));
