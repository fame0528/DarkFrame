/**
 * @file app/api/auction/bid/route.ts
 * @created 2025-01-17
 * @overview Place bid on auction listing
 * 
 * OVERVIEW:
 * Handles bid placement on active auctions. Validates bid amount meets minimum
 * increment requirements (100 units above current highest bid). Prevents self-bidding.
 * Automatically outbids previous highest bidder.
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/authMiddleware';
import { placeBid } from '@/lib/auctionService';
import { PlaceBidRequest } from '@/types/auction.types';
import { logger } from '@/lib/logger';

/**
 * POST /api/auction/bid
 * 
 * Place a bid on an auction
 * 
 * Request body:
 * ```json
 * {
 *   "auctionId": "string",
 *   "bidAmount": number
 * }
 * ```
 * 
 * Success Response:
 * ```json
 * {
 *   "success": true,
 *   "message": "Bid placed successfully",
 *   "auction": AuctionListing
 * }
 * ```
 * 
 * Error Responses:
 * - 401: Authentication required
 * - 400: Invalid bid (self-bid, too low, auction inactive, etc.)
 * - 500: Server error
 */
export async function POST(request: Request) {
  try {
    // Verify authentication
    const authResult = await verifyAuth();
    if (!authResult || !authResult.username) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      );
    }

    const username = authResult.username;

    // Parse request body
    const body: PlaceBidRequest = await request.json();

    // Validate request
    if (!body.auctionId || !body.bidAmount) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: auctionId, bidAmount' },
        { status: 400 }
      );
    }

    if (typeof body.bidAmount !== 'number' || body.bidAmount <= 0) {
      return NextResponse.json(
        { success: false, message: 'Bid amount must be a positive number' },
        { status: 400 }
      );
    }

    // Place bid
    const result = await placeBid(username, body);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);

  } catch (error) {
    logger.error('Error in place bid API', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to place bid',
        error: 'SERVER_ERROR'
      },
      { status: 500 }
    );
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Validates authentication and bid amount
// - Minimum bid increment: 100 units
// - Prevents self-bidding (cannot bid on own auction)
// - Updates highest bidder automatically
// - Previous high bidder marked as not winning
// ============================================================
// END OF FILE
// ============================================================
