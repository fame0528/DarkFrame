/**
 * @fileoverview Bounty Board API - Daily bot defeat challenges with rewards
 * @module app/api/bounty-board/route
 * @created 2025-10-18
 * 
 * OVERVIEW:
 * API endpoints for the bounty board system. Players receive 3 daily bounties
 * (easy, medium, hard) that refresh at midnight UTC. Defeating specific bot
 * types/tiers grants rewards of metal and energy.
 * 
 * Endpoints:
 * - GET: Fetch current bounties and statistics
 * - POST: Claim completed bounty rewards
 * 
 * Features:
 * - Auto-refresh at midnight
 * - Progressive difficulty rewards
 * - Completion tracking
 * - Reward claiming with validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { getBounties, getBountyStats, claimBountyReward } from '@/lib/bountyBoardService';

// ============================================================================
// GET - Fetch Bounties and Statistics
// ============================================================================

/**
 * GET /api/bounty-board
 * Returns current bounties and stats for the authenticated player
 * Auto-refreshes bounties if new day
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const tokenPayload = await getAuthenticatedUser();
    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get bounties (auto-refreshes if needed)
    const bounties = await getBounties(tokenPayload.username);
    const stats = await getBountyStats(tokenPayload.username);

    return NextResponse.json({
      success: true,
      data: {
        bounties: bounties.bounties,
        lastRefresh: bounties.lastRefresh,
        unclaimedRewards: bounties.unclaimedRewards,
        stats,
      },
    });
  } catch (error) {
    console.error('Bounty board fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to load bounty board',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - Claim Bounty Reward
// ============================================================================

/**
 * POST /api/bounty-board
 * Claims rewards for a completed bounty
 * 
 * Request body:
 * {
 *   bountyId: string // Bounty ID to claim
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const tokenPayload = await getAuthenticatedUser();
    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { bountyId } = body;

    // Validate input
    if (!bountyId || typeof bountyId !== 'string') {
      return NextResponse.json(
        { error: 'Valid bounty ID is required' },
        { status: 400 }
      );
    }

    // Claim reward
    const result = await claimBountyReward(tokenPayload.username, bountyId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    // Return success with rewards
    return NextResponse.json({
      success: true,
      message: result.message,
      metalGained: result.metalGained,
      energyGained: result.energyGained,
    });
  } catch (error) {
    console.error('Bounty reward claim error:', error);
    return NextResponse.json(
      {
        error: 'Failed to claim bounty reward',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// IMPLEMENTATION NOTES
// ============================================================================

/**
 * INTEGRATION:
 * - Bounties auto-refresh when GET is called after midnight
 * - Progress updates happen via recordBotDefeat() in combat service
 * - Claims validate completion and prevent double-claiming
 * 
 * SECURITY:
 * - User authentication required for all operations
 * - Bounty ownership validated via username
 * - Reward amounts defined server-side (no client input)
 * 
 * FUTURE ENHANCEMENTS:
 * - DELETE endpoint to reroll bounties (premium feature)
 * - PATCH endpoint to "pin" favorite bounty types
 * - Bounty history tracking
 */
