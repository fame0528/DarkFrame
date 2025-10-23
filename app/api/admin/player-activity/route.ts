/**
 * @file app/api/admin/player-activity/route.ts
 * @created 2025-10-18
 * @overview Get detailed activity logs for a specific player
 * 
 * OVERVIEW:
 * Returns paginated activity history for a player including all actions,
 * timestamps, metadata, and session information. Used by admin dashboard
 * to monitor individual player behavior and investigate flags.
 * 
 * Access: Admin only (rank >= 5)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { PlayerActivity } from '@/types';
import { getAuthenticatedUser } from '@/lib/authMiddleware';

/**
 * GET /api/admin/player-activity?userId=PlayerOne&limit=100&page=1
 * 
 * Get activity history for a specific player
 * 
 * Query params:
 * - userId: Player username (required)
 * - limit: Records per page (default: 50, max: 500)
 * - page: Page number (default: 1)
 * - action: Filter by action type (optional)
 * - hoursAgo: Only get activities from last X hours (optional)
 * 
 * Returns:
 * - activities: Array of PlayerActivity records
 * - totalCount: Total matching records
 * - page: Current page
 * - totalPages: Total pages available
 * 
 * @example
 * GET /api/admin/player-activity?userId=PlayerOne&limit=50&page=1
 * GET /api/admin/player-activity?userId=PlayerOne&action=harvest&hoursAgo=24
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
    const limitStr = searchParams.get('limit') || '50';
    const pageStr = searchParams.get('page') || '1';
    const actionFilter = searchParams.get('action');
    const hoursAgoStr = searchParams.get('hoursAgo');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId parameter required' },
        { status: 400 }
      );
    }

    const limit = Math.min(parseInt(limitStr), 500);
    const page = Math.max(parseInt(pageStr), 1);
    const skip = (page - 1) * limit;

    const activityCollection = await getCollection<PlayerActivity>('playerActivity');

    // Build query filter
    const filter: any = { userId };

    if (actionFilter) {
      filter.action = actionFilter;
    }

    if (hoursAgoStr) {
      const hoursAgo = parseInt(hoursAgoStr);
      const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
      filter.timestamp = { $gte: cutoffTime };
    }

    // Get total count
    const totalCount = await activityCollection.countDocuments(filter);

    // Get paginated activities
    const activities = await activityCollection
      .find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      success: true,
      activities,
      totalCount,
      page,
      totalPages,
      limit,
    });
  } catch (error) {
    console.error('Player activity API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch player activity' },
      { status: 500 }
    );
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Admin only access (rank >= 5)
// - Pagination to handle large activity histories
// - Optional filtering by action type and time period
// - Sorted by timestamp descending (newest first)
// - Returns metadata for detailed investigation
// - Used by admin dashboard player detail view
// ============================================================
