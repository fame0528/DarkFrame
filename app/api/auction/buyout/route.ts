/**
 * @file app/api/auction/buyout/route.ts
 * @created 2025-01-17
 * @overview Instant purchase via buyout price
 * 
 * OVERVIEW:
 * Handles instant auction purchases at buyout price. Validates buyer has sufficient
 * funds, calculates 5% sale fee, transfers item to buyer, transfers payment minus
 * fee to seller. Creates trade history record. Automatically ends auction.
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/authMiddleware';
import { buyoutAuction } from '@/lib/auctionService';
import { BuyoutAuctionRequest } from '@/types/auction.types';
import { logger } from '@/lib/logger';

/**
 * POST /api/auction/buyout
 * 
 * Instantly purchase auction via buyout price
 * 
 * Request body:
 * ```json
 * {
 *   "auctionId": "string"
 * }
 * ```
 * 
 * Success Response:
 * ```json
 * {
 *   "success": true,
 *   "message": "Auction purchased successfully",
 *   "trade": TradeHistory
 * }
 * ```
 * 
 * Error Responses:
 * - 401: Authentication required
 * - 400: Invalid buyout (self-purchase, no buyout price, insufficient funds, etc.)
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
    const body: BuyoutAuctionRequest = await request.json();

    // Validate request
    if (!body.auctionId) {
      return NextResponse.json(
        { success: false, message: 'Missing required field: auctionId' },
        { status: 400 }
      );
    }

    // Execute buyout
    const result = await buyoutAuction(username, body.auctionId);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);

  } catch (error) {
    logger.error('Error in buyout auction API', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to buyout auction',
        error: 'SERVER_ERROR'
      },
      { status: 500 }
    );
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Validates authentication and auction existence
// - Prevents self-purchase (cannot buy own listing)
// - Requires buyout price to be set on auction
// - 5% sale fee deducted from seller's payment
// - Item transferred immediately to buyer
// - Payment transferred immediately to seller (minus fee)
// - Creates permanent trade history record
// - Auction status updated to "Sold"
// ============================================================
// END OF FILE
// ============================================================
