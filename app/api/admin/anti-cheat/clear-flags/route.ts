/**
 * 📅 Created: 2025-01-18
 * 🎯 OVERVIEW:
 * Clear Player Flags Endpoint
 * 
 * Allows admins to clear all anti-cheat flags for a player.
 * Logs action in adminLogs collection for audit trail.
 * Does not remove bans - use unban endpoint for that.
 * 
 * POST /api/admin/anti-cheat/clear-flags
 * Body: { username }
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
    const { username } = body;

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username required' },
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

    // Get current flags for logging
    const currentFlags = await db.collection('playerFlags')
      .find({ username })
      .toArray();

    // Delete all flags for this player
    const result = await db.collection('playerFlags').deleteMany({ username });

    // Log admin action
    await db.collection('adminLogs').insertOne({
      timestamp: new Date(),
      adminUsername: adminUser.username,
      actionType: 'CLEAR_FLAGS',
      targetUsername: username,
      details: {
        flagsCleared: result.deletedCount,
        previousFlags: currentFlags.map(f => ({
          flagType: f.flagType,
          severity: f.severity,
          timestamp: f.timestamp
        }))
      }
    });

    return NextResponse.json({
      success: true,
      message: `Cleared ${result.deletedCount} flags for ${username}`,
      flagsCleared: result.deletedCount
    });

  } catch (error) {
    console.error('Clear flags error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to clear flags'
      },
      { status: 500 }
    );
  }
}

/**
 * 📝 IMPLEMENTATION NOTES:
 * - Admin-only access (rank >= 5)
 * - Deletes all playerFlags documents for username
 * - Logs action with previous flags for audit trail
 * - Does not affect bans (separate collection)
 * 
 * 🔐 SECURITY:
 * - Admin authentication required
 * - Player existence validation
 * - Audit trail logging
 * 
 * 📊 ADMIN LOG STRUCTURE:
 * {
 *   timestamp: Date,
 *   adminUsername: string,
 *   actionType: 'CLEAR_FLAGS',
 *   targetUsername: string,
 *   details: { flagsCleared: number, previousFlags: [] }
 * }
 * 
 * ⚠️ NOTE:
 * - This does not unban players
 * - Use /api/admin/anti-cheat/unban to remove bans
 * - Flags may be re-added if suspicious activity continues
 */
