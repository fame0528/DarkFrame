/**
 * @file app/api/tile/route.ts
 * @created 2025-10-16
 * @overview Tile data retrieval API endpoint
 * 
 * OVERVIEW:
 * GET endpoint for fetching tile data by coordinates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTileAt } from '@/lib/movementService';
import { ApiResponse, ApiError } from '@/types';

/**
 * GET /api/tile?x=75&y=100
 * 
 * Get tile data by coordinates
 * 
 * Response:
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "x": 75,
 *     "y": 100,
 *     "terrain": "Metal",
 *     "occupiedByBase": false
 *   }
 * }
 * ```
 */
export async function GET(request: NextRequest) {
  try {
    // Get coordinates from query parameters
    const { searchParams } = new URL(request.url);
    const xParam = searchParams.get('x');
    const yParam = searchParams.get('y');
    
    // Validate request
    if (!xParam || !yParam) {
      const errorResponse: ApiError = {
        success: false,
        error: 'Coordinates (x, y) are required'
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }
    
    const x = parseInt(xParam, 10);
    const y = parseInt(yParam, 10);
    
    // Validate coordinate ranges
    if (isNaN(x) || isNaN(y) || x < 1 || x > 150 || y < 1 || y > 150) {
      const errorResponse: ApiError = {
        success: false,
        error: 'Coordinates must be numbers between 1 and 150'
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }
    
    // Get tile
    const tile = await getTileAt(x, y);
    
    if (!tile) {
      const errorResponse: ApiError = {
        success: false,
        error: 'Tile not found'
      };
      return NextResponse.json(errorResponse, { status: 404 });
    }
    
    // If tile is occupied by a base, fetch the owner's username
    if (tile.occupiedByBase) {
      try {
        const { getDatabase } = await import('@/lib/mongodb');
        const db = await getDatabase();
        const playersCollection = db.collection('players');
        
        const baseOwner = await playersCollection.findOne(
          { 'base.x': x, 'base.y': y },
          { projection: { username: 1, baseGreeting: 1 } }
        );
        
        if (baseOwner) {
          (tile as any).baseOwner = baseOwner.username;
          (tile as any).baseGreeting = baseOwner.baseGreeting || '';
        }
      } catch (error) {
        console.error('❌ Error fetching base owner:', error);
        // Continue without base owner - non-critical
      }
    }
    
    // Build response
    const successResponse: ApiResponse = {
      success: true,
      data: tile
    };
    
    return NextResponse.json(successResponse);
    
  } catch (error) {
    console.error('❌ Tile fetch error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch tile';
    
    const errorResponse: ApiError = {
      success: false,
      error: errorMessage
    };
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

// ============================================================
// END OF FILE
// ============================================================
