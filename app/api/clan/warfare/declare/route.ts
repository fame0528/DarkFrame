/**
 * @fileoverview Clan War Declaration API Route
 * @module app/api/clan/warfare/declare/route
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * POST endpoint for declaring war on another clan. Validates level requirements, resource costs,
 * existing wars, and cooldown periods. Integrates with warfare service for declaration logic and
 * cost calculation with perk-based reductions.
 * 
 * Endpoint: POST /api/clan/warfare/declare
 * Body: { targetClanId: string }
 * 
 * Business Rules:
 * - Declaring clan must be level 5+
 * - Cost: 2000 Metal + 2000 Energy (reduced by territory_cost perks)
 * - Only 1 active war between clan pair allowed
 * - 48-hour cooldown after war ends before same clans can war again
 * - Permissions: Officer, Co-Leader, or Leader only
 * - Cannot declare war on own clan
 * 
 * Response:
 * - Success: { success: true, war, cost, message }
 * - Error: Specific validation error messages
 * 
 * Dependencies:
 * - JWT authentication (cookie-based)
 * - Warfare service for war declaration logic
 * - MongoDB for player and clan data
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import clientPromise from '@/lib/mongodb';
import { declareWar } from '@/lib/clanWarfareService';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-min-32-characters-long'
);

/**
 * POST /api/clan/warfare/declare
 * 
 * Declare war on another clan
 * 
 * Request Body:
 * - targetClanId: string - MongoDB ObjectId of target clan
 * 
 * Response:
 * - 200: { success: true, war, cost, message }
 * - 400: Validation errors (not in clan, invalid target, level too low, existing war, cooldown active, insufficient resources)
 * - 401: Authentication required
 * - 403: Insufficient permissions (not Officer/Co-Leader/Leader)
 * - 404: Player or target clan not found
 * - 500: Server error
 * 
 * @param request - Next.js request object
 * @returns JSON response with war declaration result
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const token = request.cookies.get('token')?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      );
    }

    const verified = await jwtVerify(token, JWT_SECRET);
    const username = verified.payload.username as string;

    // Parse request body
    const body = await request.json();
    const { targetClanId } = body;

    // Validate input
    if (!targetClanId || typeof targetClanId !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Invalid targetClanId. Must be a string.' },
        { status: 400 }
      );
    }

    // Get player from database
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || 'darkframe');
    const playersCollection = db.collection('players');

    const player = await playersCollection.findOne({ username });

    if (!player) {
      return NextResponse.json(
        { success: false, message: 'Player not found' },
        { status: 404 }
      );
    }

    // Check if player is in a clan
    if (!player.clanId) {
      return NextResponse.json(
        { success: false, message: 'You must be in a clan to declare war' },
        { status: 400 }
      );
    }

    // Declare war via service
    const result = await declareWar(
      player.clanId,
      targetClanId,
      username // playerId is username
    );

    return NextResponse.json({
      success: true,
      war: result.war,
      cost: result.cost,
      message: result.message,
    });

  } catch (error: any) {
    console.error('Error declaring war:', error);

    // Handle specific error messages from service
    if (error.message.includes('permission') || error.message.includes('Officer')) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 403 }
      );
    }

    if (
      error.message.includes('level') ||
      error.message.includes('war already exists') ||
      error.message.includes('cooldown') ||
      error.message.includes('Insufficient') ||
      error.message.includes('own clan')
    ) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    if (error.message.includes('not found')) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'Failed to declare war' },
      { status: 500 }
    );
  }
}

/**
 * Implementation Notes:
 * 
 * Target Clan Validation:
 * - Validates targetClanId is a string
 * - Service layer handles MongoDB ObjectId conversion
 * - Service validates target clan exists
 * 
 * Permission Checks:
 * - Performed in service layer (declareWar)
 * - Returns 403 for permission errors
 * - Specific error messages for UI feedback
 * 
 * Level Requirement:
 * - Clan must be level 5+ to declare war
 * - Checked in service layer
 * - Error message includes current level for context
 * 
 * Cooldown Handling:
 * - 48-hour cooldown after previous war with same clan
 * - Error message includes hours remaining
 * - Prevents war spam between same clans
 * 
 * Error Categorization:
 * - 400: Business rule violations (level, cooldown, resources)
 * - 403: Permission denied (not Officer+)
 * - 404: Resource not found (player, clan)
 * - 500: Unexpected server errors
 * 
 * Response Format:
 * Success includes:
 * - war: Complete ClanWar object with warId, status, costs, stats
 * - cost: { metal: number, energy: number } (actual cost after perk reductions)
 * - message: User-friendly confirmation with target clan tag
 * 
 * Future Enhancements:
 * - War proposals (target must accept)
 * - Alliance system (multi-clan wars)
 * - War objectives (capture X territories, win Y battles)
 * - War rewards (resources, perks, monuments)
 * - Scheduled wars (declare for future start time)
 */
