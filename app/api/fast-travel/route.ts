/**
 * @file app/api/fast-travel/route.ts
 * @created 2025-01-18
 * 
 * OVERVIEW:
 * API endpoints for Fast Travel Network functionality.
 * 
 * ENDPOINTS:
 * - GET: Get waypoints and travel status
 * - POST: Set or travel to waypoint
 * - DELETE: Delete waypoint
 * 
 * AUTH: All endpoints require authentication
 * TECH: All endpoints require 'fast-travel-network' technology
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { getCollection } from '@/lib/mongodb';
import { type Player } from '@/types/game.types';
import {
  setWaypoint,
  deleteWaypoint,
  travelToWaypoint,
  getFastTravelStatus,
} from '@/lib/fastTravelService';

/**
 * GET - Get fast travel status and waypoints
 */
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = await getAuthenticatedUser();

    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username: tokenPayload.username });

    if (!player || !player._id) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    const status = await getFastTravelStatus(player._id);

    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (error) {
    console.error('Error getting fast travel status:', error);
    return NextResponse.json(
      { error: 'Failed to get fast travel status' },
      { status: 500 }
    );
  }
}

/**
 * POST - Set waypoint or travel to waypoint
 */
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = await getAuthenticatedUser();

    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username: tokenPayload.username });

    if (!player || !player._id) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { action, name, x, y } = body;

    if (action === 'set') {
      // Set waypoint
      if (!name || typeof x !== 'number' || typeof y !== 'number') {
        return NextResponse.json(
          { error: 'Invalid waypoint data. Name, x, and y required.' },
          { status: 400 }
        );
      }

      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        return NextResponse.json(
          { error: 'Coordinates must be integers' },
          { status: 400 }
        );
      }

      if (name.length < 1 || name.length > 20) {
        return NextResponse.json(
          { error: 'Waypoint name must be 1-20 characters' },
          { status: 400 }
        );
      }

      const result = await setWaypoint(player._id, { name, x, y });

      if (!result.success) {
        return NextResponse.json(
          { error: result.message },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message: result.message,
        waypoints: result.waypoints,
      });
    } else if (action === 'travel') {
      // Travel to waypoint
      if (!name) {
        return NextResponse.json(
          { error: 'Waypoint name required for travel' },
          { status: 400 }
        );
      }

      const result = await travelToWaypoint(player._id, name);

      if (!result.success) {
        return NextResponse.json(
          { error: result.message },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message: result.message,
        position: result.position,
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Must be "set" or "travel"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error with fast travel:', error);
    return NextResponse.json(
      { error: 'Failed to process fast travel request' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete waypoint
 */
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = await getAuthenticatedUser();

    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username: tokenPayload.username });

    if (!player || !player._id) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Waypoint name required' },
        { status: 400 }
      );
    }

    const result = await deleteWaypoint(player._id, name);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      waypoints: result.waypoints,
    });
  } catch (error) {
    console.error('Error deleting waypoint:', error);
    return NextResponse.json(
      { error: 'Failed to delete waypoint' },
      { status: 500 }
    );
  }
}

/**
 * IMPLEMENTATION NOTES:
 * - GET: Returns travel status, waypoints, cooldown info
 * - POST action=set: Create or update waypoint (no cooldown)
 * - POST action=travel: Teleport to waypoint (12hr cooldown)
 * - DELETE: Remove waypoint by name
 * - All endpoints require authentication
 * - Tech requirement enforced in service layer
 * - Waypoint names: 1-20 characters
 * - Coordinates: integers only
 * - Max 5 waypoints per player
 */
