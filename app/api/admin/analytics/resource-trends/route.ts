/**
 * 📅 Created: 2025-01-18
 * 🎯 OVERVIEW:
 * Resource Trends Analytics Endpoint
 * 
 * Provides time-series data for resource accumulation across all players.
 * Tracks metal and energy gains over time for trend analysis.
 * Used by resource gains area chart on admin dashboard.
 * 
 * GET /api/admin/analytics/resource-trends
 * - Admin-only access (rank >= 5)
 * - Query params: period (24h, 7d, 30d)
 * - Returns: Time-series data with metal/energy totals per interval
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

    const client = await clientPromise;
    const db = client.db('game');
    const sessions = db.collection('playerSessions');

    // Calculate time range
    const now = new Date();
    const periodHours: Record<string, number> = {
      '24h': 24,
      '7d': 168,
      '30d': 720
    };

    const hoursBack = periodHours[period] || 168;
    const startTime = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);

    // Determine grouping interval (hourly for 24h, daily for longer)
    const isHourly = period === '24h';
    const intervalMs = isHourly ? 3600000 : 86400000; // 1 hour or 1 day

    // Aggregate resource gains from sessions
    const pipeline = [
      {
        $match: {
          startTime: { $gte: startTime }
        }
      },
      {
        $group: {
          _id: {
            $subtract: [
              { $toLong: '$startTime' },
              { $mod: [{ $toLong: '$startTime' }, intervalMs] }
            ]
          },
          metalGained: { $sum: '$resourcesGained.metal' },
          energyGained: { $sum: '$resourcesGained.energy' },
          sessionCount: { $sum: 1 },
          uniquePlayers: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          timestamp: '$_id',
          metal: '$metalGained',
          energy: '$energyGained',
          sessions: '$sessionCount',
          uniquePlayers: { $size: '$uniquePlayers' }
        }
      },
      { $sort: { timestamp: 1 } }
    ];

    const results = await sessions.aggregate(pipeline).toArray();

    // Fill in gaps with zero values for smooth chart
    const filledData: any[] = [];
    const currentTime = startTime.getTime();
    const endTime = now.getTime();

    for (let t = currentTime; t <= endTime; t += intervalMs) {
      const existing = results.find((r: any) => r.timestamp === t);
      filledData.push({
        timestamp: t,
        date: new Date(t).toISOString(),
        metal: existing?.metal || 0,
        energy: existing?.energy || 0,
        total: (existing?.metal || 0) + (existing?.energy || 0),
        sessions: existing?.sessions || 0,
        uniquePlayers: existing?.uniquePlayers || 0
      });
    }

    // Calculate statistics
    const totalMetal = filledData.reduce((sum, d) => sum + d.metal, 0);
    const totalEnergy = filledData.reduce((sum, d) => sum + d.energy, 0);
    const totalResources = totalMetal + totalEnergy;
    const avgMetalPerInterval = filledData.length > 0 ? totalMetal / filledData.length : 0;
    const avgEnergyPerInterval = filledData.length > 0 ? totalEnergy / filledData.length : 0;
    const peakResources = Math.max(...filledData.map(d => d.total), 0);

    // Get top resource gatherers
    const topGatherers = await sessions.aggregate([
      {
        $match: {
          startTime: { $gte: startTime }
        }
      },
      {
        $group: {
          _id: '$userId',
          totalMetal: { $sum: '$resourcesGained.metal' },
          totalEnergy: { $sum: '$resourcesGained.energy' },
          totalResources: {
            $sum: {
              $add: ['$resourcesGained.metal', '$resourcesGained.energy']
            }
          },
          sessionCount: { $sum: 1 }
        }
      },
      { $sort: { totalResources: -1 } },
      { $limit: 10 }
    ]).toArray();

    return NextResponse.json({
      success: true,
      period,
      intervalType: isHourly ? 'hourly' : 'daily',
      data: filledData,
      topGatherers: topGatherers.map((g: any) => ({
        username: g._id,
        metal: g.totalMetal || 0,
        energy: g.totalEnergy || 0,
        total: g.totalResources || 0,
        sessions: g.sessionCount
      })),
      stats: {
        totalMetal,
        totalEnergy,
        totalResources,
        avgMetalPerInterval: Math.round(avgMetalPerInterval),
        avgEnergyPerInterval: Math.round(avgEnergyPerInterval),
        peakResources,
        dataPoints: filledData.length
      }
    });

  } catch (error) {
    console.error('Resource trends fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch resource trends'
      },
      { status: 500 }
    );
  }
}

/**
 * 📝 IMPLEMENTATION NOTES:
 * - Aggregates resource gains from playerSessions collection
 * - Tracks both metal and energy separately
 * - Fills gaps with zero values for smooth area chart
 * - Provides top gatherers leaderboard
 * - Returns statistics for dashboard summary
 * 
 * 🔐 SECURITY:
 * - Admin-only access (rank >= 5)
 * - No sensitive data exposure
 * - Efficient MongoDB aggregation
 * 
 * 📊 QUERY PARAMS:
 * - period: '24h' | '7d' | '30d' (default: 7d)
 * 
 * 📈 RESPONSE STRUCTURE:
 * {
 *   data: [{ timestamp, date, metal, energy, total, sessions }],
 *   topGatherers: [{ username, metal, energy, total, sessions }],
 *   stats: { totalMetal, totalEnergy, avgPerInterval, peakResources }
 * }
 */
