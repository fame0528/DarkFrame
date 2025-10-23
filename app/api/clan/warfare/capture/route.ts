/**
 * @fileoverview Clan Territory Capture API Route
 * @module app/api/clan/warfare/capture/route
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * POST endpoint for capturing enemy territory during an active war. Validates war status,
 * territory ownership, and permissions. Integrates with warfare service for capture logic
 * including success rate calculation based on defense bonuses.
 * 
 * Endpoint: POST /api/clan/warfare/capture
 * Body: { targetClanId: string, tileX: number, tileY: number }
 * 
 * Business Rules:
 * - Active war must exist between attacker and defender clans
 * - Territory must be owned by target clan
 * - Capture success rate: 70% base, reduced by defense bonuses
 * - Defense bonus impact: 50% of enemy defense bonus reduces capture rate
 * - Minimum 30% capture rate guaranteed
 * - Permissions: Officer, Co-Leader, or Leader only
 * - Failed captures are logged but don't transfer territory
 * 
 * Response:
 * - Success: { success: true, territory, defenseBonus, message }
 * - Failed capture: { success: false, defenseBonus, message }
 * - Error: Specific validation error messages
 * 
 * Dependencies:
 * - JWT authentication (cookie-based)
 * - Warfare service for capture logic
 * - MongoDB for player and clan data
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import clientPromise from '@/lib/mongodb';
import { captureTerritory } from '@/lib/clanWarfareService';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-min-32-characters-long'
);

/**
 * POST /api/clan/warfare/capture
 * 
 * Attempt to capture enemy territory during active war
 * 
 * Request Body:
 * - targetClanId: string - MongoDB ObjectId of enemy clan
 * - tileX: number - X coordinate of territory to capture
 * - tileY: number - Y coordinate of territory to capture
 * 
 * Response:
 * - 200: { success: true/false, territory?, defenseBonus, message }
 * - 400: Validation errors (not in clan, no active war, territory not owned by target, invalid coords)
 * - 401: Authentication required
 * - 403: Insufficient permissions (not Officer/Co-Leader/Leader)
 * - 404: Player or clan not found
 * - 500: Server error
 * 
 * @param request - Next.js request object
 * @returns JSON response with capture result
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
    const { targetClanId, tileX, tileY } = body;

    // Validate input
    if (!targetClanId || typeof targetClanId !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Invalid targetClanId. Must be a string.' },
        { status: 400 }
      );
    }

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
        { success: false, message: 'You must be in a clan to capture territory' },
        { status: 400 }
      );
    }

    // Attempt territory capture via service
    const result = await captureTerritory(
      player.clanId,
      targetClanId,
      tileX,
      tileY,
      username // playerId is username
    );

    // Return result (success can be true or false)
    return NextResponse.json({
      success: result.success,
      territory: result.territory,
      defenseBonus: result.defenseBonus,
      message: result.message,
    });

  } catch (error: any) {
    console.error('Error capturing territory:', error);

    // Handle specific error messages from service
    if (error.message.includes('permission') || error.message.includes('Officer')) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 403 }
      );
    }

    if (
      error.message.includes('No active war') ||
      error.message.includes('not owned by target') ||
      error.message.includes('territory not owned')
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
      { success: false, message: 'Failed to capture territory' },
      { status: 500 }
    );
  }
}

/**
 * Implementation Notes:
 * 
 * Success vs Capture Success:
 * - API call can succeed (200 OK) even if capture fails (defenses held)
 * - result.success indicates whether territory was actually captured
 * - Both outcomes return 200 status code with different success values
 * 
 * Capture Mechanics:
 * - Base 70% success rate
 * - Enemy defense bonus reduces rate: successRate = 0.7 - (defenseBonus / 100) * 0.5
 * - Example: 40% defense → 70% - (40 * 0.5) = 50% capture rate
 * - Minimum 30% capture rate (max defense 50% → 45% capture rate)
 * 
 * Response Handling:
 * Successful Capture (success: true):
 * - territory: { tileX, tileY, clanId }
 * - defenseBonus: Enemy's defense percentage
 * - message: "Successfully captured territory (x, y)!"
 * 
 * Failed Capture (success: false):
 * - territory: undefined
 * - defenseBonus: Enemy's defense percentage that caused failure
 * - message: "Failed to capture territory. Enemy defense bonus: X%"
 * 
 * Error Categorization:
 * - 400: Business rule violations (no war, wrong territory, invalid input)
 * - 403: Permission denied (not Officer+)
 * - 404: Resource not found (player, clans)
 * - 500: Unexpected server errors
 * 
 * Coordinate Validation:
 * - Validates both tileX and tileY are integers
 * - Service layer checks territory exists at coordinates
 * - Service validates territory ownership
 * 
 * War Validation:
 * - Service checks for ACTIVE war (not DECLARED or ENDED)
 * - Both attacker→defender and defender→attacker wars are checked
 * - Clear error message if no active war exists
 * 
 * Future Enhancements:
 * - Battle simulation for capture attempts (unit-based combat)
 * - Multiple capture attempts per turn/timeframe
 * - Capture cooldowns (prevent spam)
 * - Territory value system (strategic vs resource territories)
 * - Siege mechanics (weaken defenses over time)
 * - Counter-attack opportunities for defenders
 */
