/**
 * 📅 Created: 2025-01-18
 * 🎯 OVERVIEW:
 * Give Resources Admin Endpoint
 * 
 * Allows admins to give metal/energy to any player.
 * Logs action in adminLogs collection for audit trail.
 * 
 * POST /api/admin/give-resources
 * Body: { username, metal, energy }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authService';
import clientPromise from '@/lib/mongodb';

export async function POST(request: NextRequest) {
  try {
    // Admin authentication
    const adminUser = await getAuthenticatedUser();
    if (!adminUser || !adminUser.rank || adminUser.rank < 5) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { username, metal = 0, energy = 0 } = body;

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username required' },
        { status: 400 }
      );
    }

    if (metal < 0 || energy < 0) {
      return NextResponse.json(
        { success: false, error: 'Resource amounts must be positive' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('game');

    // Check if player exists
    const player = await db.collection('players').findOne({ username });
    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    // Update player resources
    const result = await db.collection('players').updateOne(
      { username },
      {
        $inc: {
          metal: metal,
          energy: energy
        }
      }
    );

    // Log admin action
    await db.collection('adminLogs').insertOne({
      timestamp: new Date(),
      adminUsername: adminUser.username,
      actionType: 'GIVE_RESOURCES',
      targetUsername: username,
      details: {
        metal,
        energy,
        previousMetal: player.metal || 0,
        previousEnergy: player.energy || 0
      }
    });

    return NextResponse.json({
      success: true,
      message: `Gave ${metal} metal and ${energy} energy to ${username}`,
      newResources: {
        metal: (player.metal || 0) + metal,
        energy: (player.energy || 0) + energy
      }
    });

  } catch (error) {
    console.error('Give resources error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to give resources'
      },
      { status: 500 }
    );
  }
}

/**
 * 📝 IMPLEMENTATION NOTES:
 * - Admin-only access (rank >= 5)
 * - Uses $inc for atomic resource update
 * - Logs action in adminLogs collection
 * - Validates resource amounts (non-negative)
 * 
 * 🔐 SECURITY:
 * - Admin authentication required
 * - Input validation (positive amounts)
 * - Audit trail logging
 * 
 * 📊 ADMIN LOG STRUCTURE:
 * {
 *   timestamp: Date,
 *   adminUsername: string,
 *   actionType: 'GIVE_RESOURCES',
 *   targetUsername: string,
 *   details: { metal, energy, previousMetal, previousEnergy }
 * }
 */
