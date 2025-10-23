/**
 * @fileoverview Clan Territory Claim API Route
 * @module app/api/clan/territory/claim/route
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * POST endpoint for claiming territory tiles for a clan. Validates adjacency requirements,
 * resource costs, territory limits, and permissions. Integrates with territory service for
 * claiming logic and cost calculation with perk-based reductions.
 * 
 * Endpoint: POST /api/clan/territory/claim
 * Body: { tileX: number, tileY: number }
 * 
 * Business Rules:
 * - First territory can be claimed anywhere
 * - Subsequent territories must be adjacent to existing clan territory (±1 x OR ±1 y)
 * - Cost: 500 Metal + 500 Energy (reduced by territory_cost perks)
 * - Max 100 territories per clan (configurable)
 * - Permissions: Officer, Co-Leader, or Leader only
 * - Cannot claim tiles already owned by any clan (including own clan)
 * 
 * Response:
 * - Success: { success: true, territory, cost, defenseBonus, message }
 * - Error: Specific validation error messages
 * 
 * Dependencies:
 * - JWT authentication (cookie-based)
 * - Territory service for claiming logic
 * - MongoDB for player and clan data
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import clientPromise from '@/lib/mongodb';
import { claimTerritory } from '@/lib/territoryService';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-min-32-characters-long'
);

/**
 * POST /api/clan/territory/claim
 * 
 * Claim a territory tile for the player's clan
 * 
 * Request Body:
 * - tileX: number - X coordinate of tile to claim
 * - tileY: number - Y coordinate of tile to claim
 * 
 * Response:
 * - 200: { success: true, territory, cost, defenseBonus, message }
 * - 400: Validation errors (not in clan, invalid coords, already claimed, not adjacent, limit reached, insufficient resources)
 * - 401: Authentication required
 * - 403: Insufficient permissions (not Officer/Co-Leader/Leader)
 * - 404: Player not found
 * - 500: Server error
 * 
 * @param request - Next.js request object
 * @returns JSON response with claim result
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
    const { tileX, tileY } = body;

    // Validate input
    if (typeof tileX !== 'number' || typeof tileY !== 'number') {
      return NextResponse.json(
        { success: false, message: 'Invalid coordinates. tileX and tileY must be numbers.' },
        { status: 400 }
      );
    }

    if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) {
      return NextResponse.json(
        { success: false, message: 'Coordinates must be integers' },
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
        { success: false, message: 'You must be in a clan to claim territory' },
        { status: 400 }
      );
    }

    // Claim territory via service
    const result = await claimTerritory(
      player.clanId,
      username, // playerId is username
      tileX,
      tileY
    );

    return NextResponse.json({
      success: true,
      territory: result.territory,
      cost: result.cost,
      defenseBonus: result.defenseBonus,
      message: `Successfully claimed territory at (${tileX}, ${tileY})`,
    });

  } catch (error: any) {
    console.error('Error claiming territory:', error);

    // Handle specific error messages from service
    if (error.message.includes('permission') || error.message.includes('Officer')) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 403 }
      );
    }

    if (
      error.message.includes('already claimed') ||
      error.message.includes('adjacent') ||
      error.message.includes('limit') ||
      error.message.includes('Insufficient')
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
      { success: false, message: 'Failed to claim territory' },
      { status: 500 }
    );
  }
}

/**
 * Implementation Notes:
 * 
 * Coordinate Validation:
 * - Validates both tileX and tileY are numbers
 * - Ensures they are integers (no decimal coordinates)
 * - Service layer handles range validation
 * 
 * Permission Checks:
 * - Performed in service layer (claimTerritory)
 * - Returns 403 for permission errors
 * - Specific error messages help UI show proper feedback
 * 
 * Error Handling:
 * - Categorizes errors by HTTP status code
 * - 400: Validation/business rule violations
 * - 403: Permission denied
 * - 404: Resource not found
 * - 500: Unexpected server errors
 * 
 * Response Format:
 * Success includes:
 * - territory: { tileX, tileY, clanId, clanTag, claimedAt, claimedBy, defenseBonus }
 * - cost: { metal: number, energy: number } (actual cost after reductions)
 * - defenseBonus: number (percentage bonus from adjacent tiles)
 * - message: string (user-friendly confirmation)
 * 
 * Future Enhancements:
 * - Add rate limiting (max claims per hour)
 * - Territory claiming cooldown
 * - Batch territory claiming
 * - Territory claiming during wars (special rules)
 * - Map visualization integration (show claimable tiles)
 */
