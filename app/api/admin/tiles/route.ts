/**
 * 📅 Created: 2025-01-18
 * 🎯 OVERVIEW:
 * Admin Tiles Endpoint
 * 
 * Returns all map tiles for admin inspection.
 * Includes tile type, owner, structures, and resources.
 * 
 * GET /api/admin/tiles
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authService';
import clientPromise from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    // Admin authentication
    const user = await getAuthenticatedUser();
    if (!user || !user.rank || user.rank < 5) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const client = await clientPromise;
    const db = client.db('game');

    // Get all tiles
    const tiles = await db.collection('tiles')
      .find({})
      .limit(10000) // Limit to prevent memory issues
      .toArray();

    // Transform tiles for admin view
    const transformedTiles = tiles.map((tile: any) => ({
      x: tile.x,
      y: tile.y,
      type: tile.type || 'Wasteland',
      ownedBy: tile.ownedBy || null,
      structure: tile.structure || null,
      resources: tile.resources || {},
      isPlayerBase: tile.isPlayerBase || false,
      isFactory: tile.isFactory || false,
      isCave: tile.type === 'Cave',
      discoveredBy: tile.discoveredBy || []
    }));

    return NextResponse.json({
      success: true,
      tiles: transformedTiles,
      total: transformedTiles.length
    });

  } catch (error) {
    console.error('Tiles fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch tiles'
      },
      { status: 500 }
    );
  }
}

/**
 * 📝 IMPLEMENTATION NOTES:
 * - Admin-only access (rank >= 5)
 * - Returns all tiles with limit of 10,000
 * - Transforms data for admin view
 * - Includes special properties (bases, factories)
 * 
 * 🔐 SECURITY:
 * - Admin authentication required
 * - Result limit to prevent DoS
 * - No sensitive data exposure
 * 
 * 📊 RESPONSE STRUCTURE:
 * {
 *   success: true,
 *   tiles: [{ x, y, type, ownedBy, structure, resources, flags }],
 *   total: number
 * }
 */
