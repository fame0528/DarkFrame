/**
 * @file app/api/admin/rp-economy/generation-by-source/route.ts
 * @created 2025-10-20
 * @overview API endpoint for RP generation breakdown by source
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
 * GET /api/admin/rp-economy/generation-by-source
 * Returns RP generation breakdown by source type
 */
export const GET = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('admin/rp-economy/generation-by-source');
  const endTimer = log.time('get-generation-by-source');

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

    // Build aggregation pipeline
    const rpTransactionsCollection = await getCollection('rpTransactions');
    const pipeline: any[] = [
      { $match: { amount: { $gt: 0 } } } // Only positive (generation) transactions
    ];

    if (dateFilter) {
      pipeline[0].$match.timestamp = { $gte: dateFilter };
    }

    pipeline.push(
      {
        $group: {
          _id: '$source',
          totalRP: { $sum: '$amount' },
          transactionCount: { $sum: 1 },
          averageAmount: { $avg: '$amount' }
        }
      },
      {
        $sort: { totalRP: -1 }
      }
    );

    const results = await rpTransactionsCollection.aggregate(pipeline).toArray();

    // Calculate totals for percentage
    const totalGeneration = results.reduce((sum: number, item: any) => sum + item.totalRP, 0);

    // Format results
    const sources = results.map((item: any) => ({
      source: item._id,
      totalRP: item.totalRP,
      transactionCount: item.transactionCount,
      averageAmount: Math.round(item.averageAmount),
      percentOfTotal: totalGeneration > 0 ? (item.totalRP / totalGeneration) * 100 : 0
    }));

    log.info('RP generation by source retrieved', {
      sourceCount: sources.length,
      totalGeneration,
      period,
    });

    return NextResponse.json({ sources });

  } catch (error) {
    log.error('Failed to fetch generation by source', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));
