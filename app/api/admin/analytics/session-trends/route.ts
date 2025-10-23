/**
 * 📅 Created: 2025-01-18
 * 🎯 OVERVIEW:
 * Session Trends Analytics Endpoint
 * 
 * Provides session duration distribution data for player engagement analysis.
 * Categorizes sessions into duration buckets for bar chart visualization.
 * Used by session distribution chart on admin dashboard.
 * 
 * GET /api/admin/analytics/session-trends
 * - Admin-only access (rank >= 5)
 * - Query params: period (24h, 7d, 30d)
 * - Returns: Session duration buckets with player counts
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

    // Define duration buckets (in milliseconds)
    const buckets = [
      { label: '0-1h', min: 0, max: 3600000, color: '#22c55e' },
      { label: '1-2h', min: 3600000, max: 7200000, color: '#84cc16' },
      { label: '2-4h', min: 7200000, max: 14400000, color: '#eab308' },
      { label: '4-8h', min: 14400000, max: 28800000, color: '#f97316' },
      { label: '8-14h', min: 28800000, max: 50400000, color: '#ef4444' },
      { label: '14h+', min: 50400000, max: Infinity, color: '#dc2626' }
    ];

    // Get all sessions in period
    const allSessions = await sessions.find({
      startTime: { $gte: startTime }
    }).toArray();

    // Calculate duration for each session
    const sessionsWithDuration = allSessions.map((session: any) => {
      const start = new Date(session.startTime).getTime();
      const end = session.endTime 
        ? new Date(session.endTime).getTime()
        : now.getTime();
      const duration = end - start;
      
      return {
        userId: session.userId,
        duration,
        startTime: session.startTime,
        endTime: session.endTime
      };
    });

    // Categorize sessions into buckets
    const bucketData = buckets.map(bucket => {
      const sessionsInBucket = sessionsWithDuration.filter(
        s => s.duration >= bucket.min && s.duration < bucket.max
      );

      const uniquePlayers = new Set(sessionsInBucket.map(s => s.userId));

      return {
        label: bucket.label,
        range: bucket.label,
        count: sessionsInBucket.length,
        uniquePlayers: uniquePlayers.size,
        color: bucket.color,
        avgDuration: sessionsInBucket.length > 0
          ? sessionsInBucket.reduce((sum, s) => sum + s.duration, 0) / sessionsInBucket.length
          : 0
      };
    });

    // Calculate statistics
    const totalSessions = sessionsWithDuration.length;
    const activeSessions = allSessions.filter((s: any) => !s.endTime).length;
    const completedSessions = totalSessions - activeSessions;
    
    const avgDuration = totalSessions > 0
      ? sessionsWithDuration.reduce((sum, s) => sum + s.duration, 0) / totalSessions
      : 0;
    
    const longestSession = Math.max(
      ...sessionsWithDuration.map(s => s.duration),
      0
    );

    const uniquePlayers = new Set(allSessions.map((s: any) => s.userId));

    // Get recent active sessions
    const activePlayers = await sessions.find({
      endTime: { $exists: false }
    }).sort({ startTime: -1 }).limit(10).toArray();

    return NextResponse.json({
      success: true,
      period,
      buckets: bucketData,
      activePlayers: activePlayers.map((s: any) => ({
        username: s.userId,
        startTime: s.startTime,
        duration: now.getTime() - new Date(s.startTime).getTime(),
        actionsPerformed: s.actionsPerformed || 0
      })),
      stats: {
        totalSessions,
        activeSessions,
        completedSessions,
        uniquePlayers: uniquePlayers.size,
        avgDuration: Math.round(avgDuration),
        avgDurationHours: (avgDuration / 3600000).toFixed(2),
        longestSession: Math.round(longestSession),
        longestSessionHours: (longestSession / 3600000).toFixed(2)
      }
    });

  } catch (error) {
    console.error('Session trends fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch session trends'
      },
      { status: 500 }
    );
  }
}

/**
 * 📝 IMPLEMENTATION NOTES:
 * - Categorizes sessions into 6 duration buckets
 * - Color-coded from green (short) to red (long)
 * - Tracks both active and completed sessions
 * - Provides recent active players list
 * - Returns duration in milliseconds and hours
 * 
 * 🔐 SECURITY:
 * - Admin-only access (rank >= 5)
 * - No sensitive data exposure
 * - Efficient in-memory bucketing
 * 
 * 📊 QUERY PARAMS:
 * - period: '24h' | '7d' | '30d' (default: 7d)
 * 
 * 📈 RESPONSE STRUCTURE:
 * {
 *   buckets: [{ label, count, uniquePlayers, color, avgDuration }],
 *   activePlayers: [{ username, startTime, duration, actions }],
 *   stats: { totalSessions, activeSessions, avgDuration, longestSession }
 * }
 * 
 * 🎨 BUCKET COLORS:
 * - 0-1h: Green (#22c55e) - Normal engagement
 * - 1-2h: Lime (#84cc16) - Good engagement
 * - 2-4h: Yellow (#eab308) - High engagement
 * - 4-8h: Orange (#f97316) - Very high engagement
 * - 8-14h: Red (#ef4444) - Excessive (monitor)
 * - 14h+: Dark Red (#dc2626) - Critical (potential bot)
 */
