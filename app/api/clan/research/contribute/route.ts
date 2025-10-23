/**
 * Clan Research Contribution API Route
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * POST endpoint for contributing research points (RP) from player to clan pool.
 * Any clan member can contribute their personal RP to the shared research fund.
 * Validates player membership, RP balance, and contribution amount.
 * 
 * Features:
 * - RP contribution from player to clan
 * - Balance validation (player must have sufficient RP)
 * - Membership validation (player must be in clan)
 * - Activity logging for all contributions
 * - Returns updated clan RP total
 * 
 * Integration:
 * - JWT authentication required
 * - Updates player.researchPoints (deduct)
 * - Updates clan.research.researchPoints (add)
 * - Logs to clan_activities collection
 * 
 * @module app/api/clan/research/contribute/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import clientPromise from '@/lib/mongodb';
import { contributeRP, initializeClanResearchService } from '@/lib/clanResearchService';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-min-32-chars-long!!'
);

/**
 * POST /api/clan/research/contribute
 * Contribute RP to clan research pool
 * 
 * Request body:
 * - amount: number (RP to contribute, must be > 0)
 * 
 * Response:
 * - success: boolean
 * - newTotal: number (updated clan RP total)
 * - contributed: number (amount contributed)
 * - message: string
 * 
 * Errors:
 * - 401: No authentication
 * - 400: Invalid amount, not in clan, insufficient RP
 * - 404: Player not found
 * - 500: Server error
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const verified = await jwtVerify(token, JWT_SECRET);
    const username = verified.payload.username as string;

    // Get request body
    const body = await request.json();
    const { amount } = body;

    // Validate amount
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid contribution amount (must be positive number)' },
        { status: 400 }
      );
    }

    // Get database
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || 'darkframe');
    initializeClanResearchService(client, db);

    // Get player
    const player = await db.collection('players').findOne({ username });
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Check if player is in a clan
    if (!player.clanId) {
      return NextResponse.json(
        { error: 'You are not in a clan' },
        { status: 400 }
      );
    }

    // Contribute RP
    try {
      const result = await contributeRP(player.clanId, username, amount);

      return NextResponse.json({
        success: true,
        newTotal: result.newTotal,
        contributed: result.contributed,
        message: `Successfully contributed ${amount} RP to clan research fund`,
      });
    } catch (err: any) {
      // Handle specific errors
      if (err.message.includes('not a member')) {
        return NextResponse.json(
          { error: 'You are not a member of this clan' },
          { status: 400 }
        );
      }
      if (err.message.includes('Insufficient research points')) {
        return NextResponse.json(
          { error: `Insufficient RP (you have ${player.researchPoints || 0})` },
          { status: 400 }
        );
      }
      throw err; // Re-throw unexpected errors
    }
  } catch (error: any) {
    console.error('Error contributing RP:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to contribute RP' },
      { status: 500 }
    );
  }
}
