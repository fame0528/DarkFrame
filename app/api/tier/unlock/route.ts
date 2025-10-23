/**
 * @file app/api/tier/unlock/route.ts
 * @created 2025-10-17
 * @overview API endpoint for unlocking unit tiers with Research Points
 * 
 * OVERVIEW:
 * POST endpoint for spending RP to unlock higher unit tiers. Validates player
 * level requirements, RP availability, and prevents duplicate unlocks.
 * 
 * REQUEST BODY:
 * {
 *   "tier": number  // Tier to unlock (2-5, Tier 1 is always unlocked)
 * }
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "message": "Tier 2 unlocked! You can now build advanced units.",
 *   "tierUnlocked": 2,
 *   "rpSpent": 5,
 *   "rpRemaining": 0,
 *   "unlockedTiers": [1, 2]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/authMiddleware';
import { unlockTier, getTierUnlockStatus } from '@/lib/tierUnlockService';
import { UnitTier } from '@/types';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth();
    if (!authResult || !authResult.username) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const username = authResult.username;

    // Parse request body
    const body = await request.json();
    const { tier } = body;

    // Validate tier
    if (typeof tier !== 'number' || tier < 1 || tier > 5) {
      return NextResponse.json(
        { success: false, error: 'Tier must be a number between 1 and 5' },
        { status: 400 }
      );
    }

    // Tier 1 is always unlocked
    if (tier === 1) {
      return NextResponse.json(
        { success: false, error: 'Tier 1 is already unlocked by default' },
        { status: 400 }
      );
    }

    // Attempt to unlock tier
    const result = await unlockTier(username, tier as UnitTier);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Tier unlock error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred while unlocking tier',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tier/unlock
 * Get player's tier unlock status
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth();
    if (!authResult || !authResult.username) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const username = authResult.username;

    // Get tier unlock status
    const status = await getTierUnlockStatus(username);

    return NextResponse.json({
      success: true,
      ...status
    });

  } catch (error) {
    console.error('Get tier status error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred while fetching tier status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
