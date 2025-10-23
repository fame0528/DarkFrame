/**
 * 📅 Created: 2025-01-18
 * 🎯 OVERVIEW:
 * Activity Trends Analytics Endpoint
 * 
 * Provides time-series data for player activity over configurable periods.
 * Returns aggregated action counts per hour/day for graphing.
 * Used by activity timeline chart on admin dashboard.
 * 
 * GET /api/admin/analytics/activity-trends
 * - Admin-only access (rank >= 5)
 * - Query params: period (24h, 7d, 30d), actionType (optional filter)
 * - Returns: Time-series data with timestamps and action counts
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authService';
import clientPromise from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    // Admin authentication check
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (user.isAdmin !== true) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '7d'; // 24h, 7d, 30d
    const actionType = searchParams.get('actionType'); // Optional filter

    const client = await clientPromise;
    const db = client.db('game');
    const activities = db.collection('playerActivity');

    // Calculate time range
    const now = new Date();
    const periodHours: Record<string, number> = {
      '24h': 24,
      '7d': 168,
      '30d': 720
    };

    const hoursBack = periodHours[period] || 168;
    const startTime = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);

    // Build aggregation pipeline
    const matchStage: any = {
      timestamp: { $gte: startTime.getTime() }
    };

    if (actionType) {
      matchStage.actionType = actionType;
    }

    // Determine grouping interval (hourly for 24h, daily for longer)
    const isHourly = period === '24h';
    const intervalMs = isHourly ? 3600000 : 86400000; // 1 hour or 1 day

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: {
            $subtract: [
              '$timestamp',
              { $mod: ['$timestamp', intervalMs] }
            ]
          },
          actionType: { $first: '$actionType' },
          count: { $sum: 1 },
          uniquePlayers: { $addToSet: '$username' }
        }
      },
      {
        $project: {
          timestamp: '$_id',
          count: 1,
          uniquePlayerCount: { $size: '$uniquePlayers' }
        }
      },
      { $sort: { timestamp: 1 } }
    ];

    const results = await activities.aggregate(pipeline).toArray();

    // Fill in gaps with zero counts for smooth chart
    const filledData: any[] = [];
    const currentTime = startTime.getTime();
    const endTime = now.getTime();

    for (let t = currentTime; t <= endTime; t += intervalMs) {
      const existing = results.find((r: any) => r.timestamp === t);
      filledData.push({
        timestamp: t,
        date: new Date(t).toISOString(),
        count: existing?.count || 0,
        uniquePlayers: existing?.uniquePlayerCount || 0
      });
    }

    // Get breakdown by action type
    const typeBreakdown = await activities.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$actionType',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    // Calculate statistics
    const totalActions = results.reduce((sum: number, r: any) => sum + (r.count || 0), 0);
    const avgActionsPerInterval = filledData.length > 0 ? totalActions / filledData.length : 0;
    const peakActivity = Math.max(...filledData.map((d: any) => d.count), 0);

    return NextResponse.json({
      success: true,
      period,
      intervalType: isHourly ? 'hourly' : 'daily',
      data: filledData,
      breakdown: typeBreakdown.map((t: any) => ({
        actionType: t._id,
        count: t.count
      })),
      stats: {
        totalActions,
        avgActionsPerInterval: Math.round(avgActionsPerInterval),
        peakActivity,
        dataPoints: filledData.length
      }
    });

  } catch (error) {
    console.error('Activity trends fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch activity trends'
      },
      { status: 500 }
    );
  }
}

/**
 * 📝 IMPLEMENTATION NOTES:
 * - Aggregates activity by hour (24h) or day (7d, 30d)
 * - Fills gaps with zero counts for smooth charts
 * - Provides breakdown by action type
 * - Counts unique players per interval
 * - Returns statistics for dashboard summary
 * 
 * 🔐 SECURITY:
 * - Admin-only access (rank >= 5)
 * - No sensitive data exposure
 * - Efficient MongoDB aggregation
 * 
 * 📊 QUERY PARAMS:
 * - period: '24h' | '7d' | '30d' (default: 7d)
 * - actionType: Optional filter for specific action type
 * 
 * 📈 RESPONSE STRUCTURE:
 * {
 *   data: [{ timestamp, date, count, uniquePlayers }],
 *   breakdown: [{ actionType, count }],
 *   stats: { totalActions, avgActionsPerInterval, peakActivity }
 * }
 */
