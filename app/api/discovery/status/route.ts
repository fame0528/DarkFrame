/**
 * @file app/api/discovery/status/route.ts
 * @created 2025-01-17
 * @overview Get player's discovery progress and statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDiscoveryProgress } from '@/lib/discoveryService';
import { logger } from '@/lib/logger';

/**
 * GET /api/discovery/status?username=player
 * 
 * Retrieve player's discovery progress
 * 
 * Query params:
 * - username: string (required)
 * 
 * Response:
 * {
 *   success: boolean,
 *   data?: {
 *     totalDiscovered: number,
 *     totalAvailable: number,
 *     progressPercent: number,
 *     byCategory: { industrial: number, combat: number, strategic: number },
 *     discoveries: Array<Discovery>,
 *     undiscovered: Array<{id, name, category, icon, description}>,
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

    const progress = await getDiscoveryProgress(username);

    if (!progress) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: progress
    });

  } catch (error) {
    logger.error('Error getting discovery status', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get discovery status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Returns complete discovery progress for player
// - Includes both discovered and undiscovered technologies
// - Categorizes discoveries by type (industrial/combat/strategic)
// - Shows progress percentage toward 15/15 completion
// ============================================================
// END OF FILE
// ============================================================
