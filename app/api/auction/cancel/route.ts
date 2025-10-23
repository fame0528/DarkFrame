/**
 * @file app/api/auction/cancel/route.ts
 * @created 2025-01-17
 * @overview Cancel active auction listing
 * 
 * OVERVIEW:
 * Handles auction cancellation by seller. Only allows cancellation if no bids
 * have been placed. Returns locked item to seller. Listing fee is non-refundable.
 * Updates auction status to Cancelled.
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/authMiddleware';
import { cancelAuction } from '@/lib/auctionService';
import { logger } from '@/lib/logger';

/**
 * POST /api/auction/cancel
 * 
 * Cancel an active auction listing
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
 *   "message": "Auction cancelled successfully. Item returned (listing fee non-refundable)"
 * }
 * ```
 * 
 * Error Responses:
 * - 401: Authentication required
 * - 400: Cannot cancel (not owner, has bids, already ended, etc.)
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
    const body = await request.json();

    // Validate request
    if (!body.auctionId) {
      return NextResponse.json(
        { success: false, message: 'Missing required field: auctionId' },
        { status: 400 }
      );
    }

    // Cancel auction
    const result = await cancelAuction(username, body.auctionId);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);

  } catch (error) {
    logger.error('Error in cancel auction API', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to cancel auction',
        error: 'SERVER_ERROR'
      },
      { status: 500 }
    );
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Validates authentication and ownership
// - Only seller can cancel their own auction
// - Cannot cancel if any bids have been placed
// - Cannot cancel if auction already ended (Sold, Expired, Cancelled)
// - Item returned to seller's inventory/units
// - Listing fee is NOT refundable (intentional design)
// - Auction status updated to "Cancelled"
// ============================================================
// END OF FILE
// ============================================================
