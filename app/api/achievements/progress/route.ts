/**
 * @file app/api/achievements/progress/route.ts
 * @created 2025-01-17
 * @overview Get player's achievement progress and unlocked prestige units
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAchievementProgress, getUnlockedPrestigeUnits } from '@/lib/achievementService';
import { logger } from '@/lib/logger';

/**
 * GET /api/achievements/progress?username=player
 * 
 * Retrieve player's achievement progress
 * 
 * Query params:
 * - username: string (required)
 * 
 * Response:
 * {
 *   success: boolean,
 *   data?: {
 *     totalUnlocked: number,
 *     totalAvailable: number,
 *     progressPercent: number,
 *     byCategory: { combat: {unlocked, total}, ... },
 *     achievements: Array<Achievement with progress>,
 *     unlockedPrestigeUnits: string[],
 *     completionStatus: 'COMPLETE' | 'IN_PROGRESS'
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      );
    }

    const progress = await getAchievementProgress(username);

    if (!progress) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    // Get unlocked prestige units
    const unlockedPrestigeUnits = await getUnlockedPrestigeUnits(username);

    return NextResponse.json({
      success: true,
      data: {
        ...progress,
        unlockedPrestigeUnits
      }
    });

  } catch (error) {
    logger.error('Error getting achievement progress', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get achievement progress',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Returns complete achievement progress for player
// - Includes progress percentage for each achievement
// - Lists unlocked prestige units
// - Shows category breakdown (combat/economic/exploration/progression)
// ============================================================
// END OF FILE
// ============================================================
