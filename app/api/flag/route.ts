/**
 * @file app/api/flag/route.ts
 * @created 2025-10-20
 * @overview Flag Bearer API endpoint
 * 
 * OVERVIEW:
 * Provides REST API for Flag Bearer data retrieval and attack actions.
 * Returns current Flag Bearer information including position, hold duration,
 * and player stats. Handles attack requests with range validation.
 * 
 * Endpoints:
 * - GET /api/flag - Get current Flag Bearer data
 * - POST /api/flag/attack - Attack the Flag Bearer
 */

import { NextRequest, NextResponse } from 'next/server';
import { type FlagBearer, type FlagAPIResponse, type FlagAttackRequest, type FlagAttackResponse } from '@/types/flag.types';

/**
 * GET /api/flag
 * 
 * Retrieve current Flag Bearer information
 * 
 * @returns FlagAPIResponse<FlagBearer | null>
 * 
 * @example
 * ```ts
 * const response = await fetch('/api/flag');
 * const data: FlagAPIResponse<FlagBearer> = await response.json();
 * 
 * if (data.success && data.data) {
 *   console.log('Flag Bearer:', data.data.username);
 * }
 * ```
 */
export async function GET(request: NextRequest): Promise<NextResponse<FlagAPIResponse<FlagBearer | null>>> {
  try {
    // TODO: Replace with actual database query
    // This is a mock implementation for testing
    
    // Check if there's a current Flag Bearer
    const hasBearer = Math.random() > 0.3; // 70% chance of having a bearer (for testing)
    
    if (!hasBearer) {
      return NextResponse.json({
        success: true,
        data: null,
        timestamp: new Date()
      });
    }
    
    // Mock Flag Bearer data
    const mockBearer: FlagBearer = {
      playerId: 'player-123',
      username: 'DarkLord42',
      level: 47,
      position: {
        x: Math.floor(Math.random() * 150) + 1, // Random position 1-150
        y: Math.floor(Math.random() * 150) + 1
      },
      claimedAt: new Date(Date.now() - 1200000), // 20 minutes ago
      holdDuration: 1200, // 20 minutes in seconds
      currentHP: 8500,
      maxHP: 12000
    };
    
    return NextResponse.json({
      success: true,
      data: mockBearer,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('[Flag API] Error fetching Flag Bearer:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch Flag Bearer data',
      timestamp: new Date()
    }, { status: 500 });
  }
}

/**
 * POST /api/flag/attack
 * 
 * Attack the current Flag Bearer
 * 
 * Request body: FlagAttackRequest
 * {
 *   targetPlayerId: string,
 *   attackerPosition: { x: number, y: number }
 * }
 * 
 * @returns FlagAPIResponse<FlagAttackResponse>
 * 
 * @example
 * ```ts
 * const response = await fetch('/api/flag/attack', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     targetPlayerId: 'player-123',
 *     attackerPosition: { x: 50, y: 50 }
 *   })
 * });
 * 
 * const result: FlagAPIResponse<FlagAttackResponse> = await response.json();
 * if (result.success && result.data?.success) {
 *   console.log('Attack successful! Damage:', result.data.damage);
 * }
 * ```
 */
export async function POST(request: NextRequest): Promise<NextResponse<FlagAPIResponse<FlagAttackResponse>>> {
  try {
    const body: FlagAttackRequest = await request.json();
    
    // Validate request
    if (!body.targetPlayerId || !body.attackerPosition) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: targetPlayerId and attackerPosition',
        timestamp: new Date()
      }, { status: 400 });
    }
    
    // TODO: Implement actual attack logic
    // - Verify attacker is authenticated
    // - Check attack range (must be within 5 tiles)
    // - Verify attack cooldown
    // - Calculate damage
    // - Update bearer HP
    // - Handle bearer defeat (flag transfer)
    // - Broadcast WebSocket event
    
    // Mock attack response (for testing)
    const mockAttackResponse: FlagAttackResponse = {
      success: true,
      damage: 100,
      bearerDefeated: false
    };
    
    return NextResponse.json({
      success: true,
      data: mockAttackResponse,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('[Flag API] Error processing attack:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process attack',
      timestamp: new Date()
    }, { status: 500 });
  }
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. **GET /api/flag:**
 *    - Returns current Flag Bearer or null if unclaimed
 *    - Includes all bearer info (position, hold duration, HP)
 *    - Called on component mount and periodically
 *    - Should be fast (<100ms) for real-time UX
 * 
 * 2. **POST /api/flag/attack:**
 *    - Validates attacker authentication
 *    - Checks attack range (must be within 5 tiles)
 *    - Verifies cooldown (60 seconds between attacks)
 *    - Calculates damage and updates bearer HP
 *    - Handles bearer defeat and flag transfer
 *    - Broadcasts WebSocket event to all players
 * 
 * 3. **Future Enhancements:**
 *    - Database integration (replace mocks)
 *    - Authentication middleware
 *    - Rate limiting for attack spam prevention
 *    - Leaderboard for longest flag holds
 *    - Battle log for attack history
 * 
 * 4. **Security:**
 *    - Validate all input coordinates (1-150 range)
 *    - Verify attacker owns the session
 *    - Prevent self-attacks
 *    - Rate limit API calls
 *    - Sanitize error messages (no internal details)
 * 
 * 5. **Performance:**
 *    - Cache Flag Bearer data (5 second TTL)
 *    - Optimize distance calculations (done once per request)
 *    - Batch WebSocket broadcasts
 *    - Database indexes on playerId, position
 */
