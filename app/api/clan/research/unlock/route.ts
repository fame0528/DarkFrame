/**
 * Clan Research Unlock API Route
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * POST endpoint for unlocking research nodes in clan tech tree.
 * Only Leader, Co-Leader, and Officer roles can unlock research.
 * Validates prerequisites, level requirements, and RP cost.
 * 
 * Features:
 * - Research node unlocking with prerequisite validation
 * - Permission checking (Leader/Co-Leader/Officer only)
 * - Clan level requirement validation
 * - RP balance checking and deduction
 * - Returns total bonuses after unlock
 * - Activity logging for research unlocks
 * 
 * Integration:
 * - JWT authentication required
 * - Updates clan.research.researchPoints (deduct cost)
 * - Updates clan.research.unlockedResearch (add node ID)
 * - Logs to clan_activities collection
 * 
 * @module app/api/clan/research/unlock/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import clientPromise from '@/lib/mongodb';
import { unlockResearch, initializeClanResearchService } from '@/lib/clanResearchService';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-min-32-chars-long!!'
);

/**
 * POST /api/clan/research/unlock
 * Unlock a research node in the clan tech tree
 * 
 * Request body:
 * - researchId: string (research node ID to unlock)
 * 
 * Response:
 * - success: boolean
 * - research: ResearchNode (unlocked research details)
 * - totalBonuses: Record<string, number> (updated total bonuses)
 * - message: string
 * 
 * Errors:
 * - 401: No authentication
 * - 403: Insufficient permissions (not Leader/Officer)
 * - 400: Invalid researchId, already unlocked, prerequisites not met,
 *        insufficient RP, level requirement not met
 * - 404: Player not found, research not found
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
    const { researchId } = body;

    // Validate researchId
    if (!researchId || typeof researchId !== 'string') {
      return NextResponse.json(
        { error: 'Research ID is required' },
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

    // Unlock research
    try {
      const result = await unlockResearch(player.clanId, username, researchId);

      return NextResponse.json({
        success: true,
        research: result.research,
        totalBonuses: result.totalBonuses,
        message: `Successfully unlocked ${result.research.name}`,
      });
    } catch (err: any) {
      // Handle specific errors
      if (err.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Research node not found' },
          { status: 404 }
        );
      }
      if (err.message.includes('not a member')) {
        return NextResponse.json(
          { error: 'You are not a member of this clan' },
          { status: 400 }
        );
      }
      if (err.message.includes('Insufficient permissions')) {
        return NextResponse.json(
          { error: 'Only Leaders, Co-Leaders, and Officers can unlock research' },
          { status: 403 }
        );
      }
      if (err.message.includes('already unlocked')) {
        return NextResponse.json(
          { error: 'Research already unlocked' },
          { status: 400 }
        );
      }
      if (err.message.includes('level') && err.message.includes('required')) {
        return NextResponse.json(
          { error: err.message },
          { status: 400 }
        );
      }
      if (err.message.includes('Prerequisite not met')) {
        return NextResponse.json(
          { error: err.message },
          { status: 400 }
        );
      }
      if (err.message.includes('Insufficient research points')) {
        return NextResponse.json(
          { error: err.message },
          { status: 400 }
        );
      }
      throw err; // Re-throw unexpected errors
    }
  } catch (error: any) {
    console.error('Error unlocking research:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to unlock research' },
      { status: 500 }
    );
  }
}
