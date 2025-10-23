/**
 * @file app/api/auction/create/route.ts
 * @created 2025-01-17
 * @overview Create new auction listing
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/authMiddleware';
import { createAuctionListing } from '@/lib/auctionService';
import { CreateAuctionRequest } from '@/types/auction.types';
import { logger } from '@/lib/logger';

/**
 * POST /api/auction/create
 * 
 * Create a new auction listing
 * 
 * Request body:
 * {
 *   item: AuctionItem,
 *   startingBid: number,
 *   buyoutPrice?: number,
 *   reservePrice?: number,
 *   duration: 12 | 24 | 48,
 *   clanOnly?: boolean
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   message: string,
 *   auction?: AuctionListing
 * }
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
    const body: CreateAuctionRequest = await request.json();

    // Validate request
    if (!body.item || !body.startingBid || !body.duration) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: item, startingBid, duration' },
        { status: 400 }
      );
    }

    // Create auction
    const result = await createAuctionListing(username, body);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);

  } catch (error) {
    logger.error('Error in create auction API', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to create auction',
        error: 'SERVER_ERROR'
      },
      { status: 500 }
    );
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Validates authentication and request body
// - Calls auctionService to create listing
// - Returns created auction on success
// - Listing fee is deducted upfront
// ============================================================
// END OF FILE
// ============================================================
