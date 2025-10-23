/**
 * @file app/api/admin/player-sessions/route.ts
 * @created 2025-10-18
 * @overview Get session history for a specific player
 * 
 * OVERVIEW:
 * Returns detailed session records including start/end times, durations,
 * activity counts, and resource gains per session. Used by admin dashboard
 * to analyze player engagement patterns and detect session abuse.
 * 
 * Access: Admin only (rank >= 5)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { PlayerSession } from '@/types';
import { getAuthenticatedUser } from '@/lib/authMiddleware';

/**
 * GET /api/admin/player-sessions?userId=PlayerOne&limit=20&includeActive=true
 * 
 * Get session history for a specific player
 * 
 * Query params:
 * - userId: Player username (required)
 * - limit: Number of sessions to return (default: 20, max: 100)
 * - includeActive: Include ongoing sessions (default: true)
 * - hoursAgo: Only get sessions from last X hours (optional)
 * 
 * Returns:
 * - sessions: Array of PlayerSession records
 * - totalSessions: Total sessions found
 * - activeSessions: Number of currently active sessions
 * - totalPlayTime: Sum of all session durations (seconds)
 * - averageDuration: Average session length (seconds)
 * 
 * @example
 * GET /api/admin/player-sessions?userId=PlayerOne&limit=20
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user || (user.rank ?? 0) < 5) {
      return NextResponse.json(
        { success: false, error: 'Admin access required (rank 5+)' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const limitStr = searchParams.get('limit') || '20';
    const includeActiveStr = searchParams.get('includeActive') || 'true';
    const hoursAgoStr = searchParams.get('hoursAgo');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId parameter required' },
        { status: 400 }
      );
    }

    const limit = Math.min(parseInt(limitStr), 100);
    const includeActive = includeActiveStr === 'true';

    const sessionCollection = await getCollection<PlayerSession>('playerSessions');

    // Build query filter
    const filter: any = { userId };

    if (!includeActive) {
      filter.endTime = { $exists: true };
    }

    if (hoursAgoStr) {
      const hoursAgo = parseInt(hoursAgoStr);
      const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
      filter.startTime = { $gte: cutoffTime };
    }

    // Get sessions
    const sessions = await sessionCollection
      .find(filter)
      .sort({ startTime: -1 })
      .limit(limit)
      .toArray();

    // Count active sessions
    const activeSessions = sessions.filter(s => !s.endTime).length;

    // Calculate total play time and average
    const completedSessions = sessions.filter(s => s.duration !== undefined);
    const totalPlayTime = completedSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const averageDuration = completedSessions.length > 0 
      ? Math.floor(totalPlayTime / completedSessions.length) 
      : 0;

    // Get total session count (not limited)
    const totalSessions = await sessionCollection.countDocuments(filter);

    return NextResponse.json({
      success: true,
      sessions,
      totalSessions,
      activeSessions,
      totalPlayTime,
      averageDuration,
    });
  } catch (error) {
    console.error('Player sessions API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch player sessions' },
      { status: 500 }
    );
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Admin only access (rank >= 5)
// - Returns both completed and active sessions by default
// - Includes aggregated metrics for quick analysis
// - Sorted by start time descending (newest first)
// - Can filter by time period for recent analysis
// - Used by admin dashboard to monitor engagement patterns
// - Helps detect session abuse (>14 hour continuous play)
// ============================================================
