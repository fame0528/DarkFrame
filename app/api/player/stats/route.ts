// ============================================================
// FILE: app/api/player/stats/route.ts
// CREATED: 2025-01-23 (FID-20250123-001)
// ============================================================
// OVERVIEW:
// API endpoint for fetching authenticated player's personal statistics.
// Returns player.stats object containing:
// - battlesWon, totalUnitsBuilt, totalResourcesGathered
// - totalResourcesBanked, shrineTradeCount, cavesExplored
//
// Authentication: Uses Next.js middleware for player session
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { getAuthenticatedUser } from '@/lib/authMiddleware';

/**
 * GET /api/player/stats
 * Fetches personal statistics for the authenticated player
 * 
 * @returns PlayerStats object with 6 metrics
 * @example
 * Response: {
 *   success: true,
 *   stats: {
 *     battlesWon: 5,
 *     totalUnitsBuilt: 120,
 *     totalResourcesGathered: 15000,
 *     totalResourcesBanked: 8000,
 *     shrineTradeCount: 3,
 *     cavesExplored: 7
 *   },
 *   username: "FAME",
 *   level: 4
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user from cookie
    const user = await getAuthenticatedUser();
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const username = user.username;

    // Connect to database
    const db = await getDatabase();
    const playersCollection = db.collection('players');

    // Fetch player's stats
    const player = await playersCollection.findOne(
      { username },
      { 
        projection: { 
          stats: 1, 
          username: 1, 
          level: 1,
          totalPower: 1,
          resources: 1
        } 
      }
    );

    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    // Return player stats with defaults if any fields are missing
    const stats = {
      battlesWon: player.stats?.battlesWon ?? 0,
      totalUnitsBuilt: player.stats?.totalUnitsBuilt ?? 0,
      totalResourcesGathered: player.stats?.totalResourcesGathered ?? 0,
      totalResourcesBanked: player.stats?.totalResourcesBanked ?? 0,
      shrineTradeCount: player.stats?.shrineTradeCount ?? 0,
      cavesExplored: player.stats?.cavesExplored ?? 0,
    };

    return NextResponse.json({
      success: true,
      stats,
      username: player.username,
      level: player.level ?? 1,
      totalPower: player.totalPower ?? 0,
      resources: {
        metal: player.resources?.metal ?? 0,
        energy: player.resources?.energy ?? 0,
      }
    });

  } catch (error) {
    console.error('❌ Player stats API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch player statistics' },
      { status: 500 }
    );
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Uses cookie-based authentication (getAuthenticatedUser)
// - Returns PlayerStats with safe defaults (?? 0)
// - Includes player context (username, level, power, resources)
// - Resources: metal and energy ONLY (no gold - ECHO compliance)
// - All fields use optional chaining for safety
// - Same auth pattern as other API routes (bot-magnet, admin, etc.)
// ============================================================
// END OF FILE
// ============================================================
