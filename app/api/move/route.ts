/**
 * @file app/api/move/route.ts
 * @created 2025-10-16
 * @overview Player movement API endpoint
 * 
 * OVERVIEW:
 * POST endpoint for player movement in 9 directions with wrap-around.
 * Returns updated player data and new tile information.
 */

import { NextRequest, NextResponse } from 'next/server';
import { movePlayer } from '@/lib/movementService';
import { MoveRequest, ApiResponse, ApiError, MoveResponse, MovementDirection, Player } from '@/types';
import { logMovement } from '@/lib/activityLogger';
import { updateSession } from '@/lib/sessionTracker';
import { getCollection } from '@/lib/mongodb';
import { detectSpeedHack } from '@/lib/antiCheatDetector';

/**
 * POST /api/move
 * 
 * Move player in specified direction
 * 
 * Request body:
 * ```json
 * {
 *   "username": "Commander42",
 *   "direction": "N"
 * }
 * ```
 * 
 * Response:
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "player": { ... },
 *     "currentTile": { ... }
 *   }
 * }
 * ```
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: MoveRequest = await request.json();
    
    // Validate request
    if (!body.username) {
      const errorResponse: ApiError = {
        success: false,
        error: 'Username is required'
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }
    
    if (!body.direction) {
      const errorResponse: ApiError = {
        success: false,
        error: 'Direction is required'
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }
    
    // Validate direction
    const validDirections = Object.values(MovementDirection);
    if (!validDirections.includes(body.direction)) {
      const errorResponse: ApiError = {
        success: false,
        error: 'Invalid direction'
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }
    
    // Get player's current position before moving
    const playersCollection = await getCollection<Player>('players');
    const playerBefore = await playersCollection.findOne({ username: body.username });
    const oldPosition = playerBefore ? { x: playerBefore.currentPosition.x, y: playerBefore.currentPosition.y } : null;
    
    // Move player
    const { player, tile } = await movePlayer(body.username, body.direction);
    
    // If player holds the flag, update flag position AND add trail tile
    const flagsCollection = await getCollection('flags');
    const flagDoc = await flagsCollection.findOne({});
    
    if (flagDoc?.currentHolder?.username === player.username) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 8 * 60 * 1000); // 8 minutes from now
      
      await flagsCollection.updateOne(
        {},
        {
          $set: {
            'currentHolder.position': player.currentPosition,
            lastUpdate: new Date()
          },
          $push: {
            trail: {
              $each: [{
                x: player.currentPosition.x,
                y: player.currentPosition.y,
                timestamp: now,
                expiresAt: expiresAt
              }],
              $slice: -200 // Keep only last 200 trail tiles (performance optimization)
            }
          } as any
        }
      );
      
      // Clean up expired trail tiles (older than 8 minutes)
      await flagsCollection.updateOne(
        {},
        {
          $pull: {
            trail: {
              expiresAt: { $lt: now }
            }
          } as any
        }
      );
    }
    
    // Log movement activity
    const sessionId = request.cookies.get('sessionId')?.value;
    if (sessionId && oldPosition) {
      await logMovement(
        body.username,
        sessionId,
        oldPosition,
        { x: player.currentPosition.x, y: player.currentPosition.y }
      );
      await updateSession(sessionId); // Increment action count
      
      // Anti-cheat: Check for speed hacking
      const speedCheck = await detectSpeedHack(
        body.username,
        oldPosition,
        { x: player.currentPosition.x, y: player.currentPosition.y },
        Date.now()
      );
      
      if (speedCheck.suspicious) {
        console.warn(`⚠️ Speed hack detected for ${body.username}:`, speedCheck.evidence);
      }
    }
    
    // Build response
    const responseData: MoveResponse = {
      player,
      currentTile: tile
    };
    
    const successResponse: ApiResponse<MoveResponse> = {
      success: true,
      data: responseData
    };
    
    return NextResponse.json(successResponse);
    
  } catch (error) {
    console.error('❌ Movement error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Movement failed';
    
    const errorResponse: ApiError = {
      success: false,
      error: errorMessage
    };
    
    return NextResponse.json(errorResponse, { status: 400 });
  }
}

// ============================================================
// END OF FILE
// ============================================================
