/**
 * @file app/api/combat/infantry/route.ts
 * @created 2025-10-19
 * @overview Infantry Battle API - Player vs Player direct combat
 * 
 * OVERVIEW:
 * POST endpoint for initiating Infantry battles (direct player vs player combat).
 * Attacker selects units to bring, defender uses ALL units to defend.
 * Winner captures 10-15% of defeated units. Both sides earn XP.
 * 
 * REQUEST BODY:
 * {
 *   "targetUsername": string,  // Player to attack
 *   "unitIds": string[]        // Unit IDs to bring to battle
 * }
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "message": "Battle complete message",
 *   "battleLog": BattleLog,
 *   "attackerLevelUp": boolean,
 *   "defenderLevelUp": boolean
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/authMiddleware';
import { executeInfantryAttack } from '@/lib/battleService';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth();
    if (!authResult || !authResult.username) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const attackerId = authResult.username;

    // Parse request body
    const body = await request.json();
    const { targetUsername, unitIds } = body;

    // Validate inputs
    if (!targetUsername || typeof targetUsername !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Target username is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(unitIds) || unitIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Must select at least one unit for attack' },
        { status: 400 }
      );
    }

    // Prevent self-attack
    if (targetUsername === attackerId) {
      return NextResponse.json(
        { success: false, error: 'Cannot attack yourself' },
        { status: 400 }
      );
    }

    // Execute infantry battle
    const result = await executeInfantryAttack(attackerId, targetUsername, unitIds);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Infantry battle error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred during infantry battle',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
