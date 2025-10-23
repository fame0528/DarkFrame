/**
 * @file app/api/player/route.ts
 * @created 2025-10-16
 * @overview Player data retrieval API endpoint
 * 
 * OVERVIEW:
 * GET endpoint for fetching player data by username.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPlayer } from '@/lib/playerService';
import { ApiResponse, ApiError } from '@/types';
import { calculateBalanceEffects } from '@/lib/balanceService';
import { getXPProgress } from '@/lib/xpService';
import { logger } from '@/lib/logger';

/**
 * GET /api/player?username=Commander42
 * 
 * Get player data by username
 * 
 * Response:
 * ```json
 * {
 *   "success": true,
 *   "data": { ... }
 * }
 * ```
 */
export async function GET(request: NextRequest) {
  try {
    // Get username from query parameters
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    
    // Validate request
    if (!username) {
      const errorResponse: ApiError = {
        success: false,
        error: 'Username is required'
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }
    
    // Get player
    const player = await getPlayer(username);
    
    if (!player) {
      const errorResponse: ApiError = {
        success: false,
        error: 'Player not found'
      };
      return NextResponse.json(errorResponse, { status: 404 });
    }
    
    // Calculate balance effects based on current STR/DEF
    const balanceEffects = calculateBalanceEffects(
      player.totalStrength || 0,
      player.totalDefense || 0
    );
    
    // Calculate XP progress
    const xpProgress = getXPProgress(player.xp || 0);
    
    // Add balance effects and XP progress to player data
    const playerWithBalance = {
      ...player,
      balanceEffects,
      xpProgress
    };
    
    // Build response
    const successResponse: ApiResponse = {
      success: true,
      data: playerWithBalance
    };
    
    return NextResponse.json(successResponse);
    
  } catch (error) {
    logger.error('Player fetch error', error instanceof Error ? error : new Error(String(error)));
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch player';
    
    const errorResponse: ApiError = {
      success: false,
      error: errorMessage
    };
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

// ============================================================
// END OF FILE
// ============================================================
