/**
 * 📅 Created: 2025-01-18
 * 🎯 OVERVIEW:
 * Ban Player Admin Endpoint
 * 
 * POST /api/admin/ban-player
 * - Permanently bans a player account
 * - Prevents future logins
 * - Requires ban reason and optional duration
 * - Logs all ban actions for accountability
 * - Admin-only access (rank >= 5)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authService';
import clientPromise from '@/lib/mongodb';

export async function POST(request: NextRequest) {
  try {
    // Admin authentication check
    const user = await getAuthenticatedUser();
    if (!user || !user.rank || user.rank < 5) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { username, reason, durationDays, autoResolveFlags } = body;

    // Validation
    if (!username || !reason) {
      return NextResponse.json(
        { success: false, error: 'Username and reason are required' },
        { status: 400 }
      );
    }

    if (reason.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: 'Ban reason must be at least 10 characters' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('game');
    const players = db.collection('players');
    const bans = db.collection('bans');
    const flags = db.collection('playerFlags');

    // Check if player exists
    const player = await players.findOne({ username });
    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    // Prevent banning admins
    if (player.rank && player.rank >= 5) {
      return NextResponse.json(
        { success: false, error: 'Cannot ban admin accounts' },
        { status: 403 }
      );
    }

    // Calculate ban expiration if duration specified
    const bannedAt = new Date();
    const expiresAt = durationDays 
      ? new Date(bannedAt.getTime() + durationDays * 24 * 60 * 60 * 1000)
      : null; // null = permanent ban

    // Create ban record
    const banRecord = {
      username,
      bannedBy: user.username,
      bannedAt,
      expiresAt,
      reason: reason.trim(),
      isPermanent: !durationDays,
      active: true
    };

    await bans.insertOne(banRecord);

    // Update player account
    await players.updateOne(
      { username },
      {
        $set: {
          banned: true,
          bannedAt,
          bannedBy: user.username,
          banReason: reason.trim(),
          banExpiresAt: expiresAt
        }
      }
    );

    // Optionally resolve all active flags
    if (autoResolveFlags) {
      await flags.updateMany(
        { username, resolved: false },
        {
          $set: {
            resolved: true,
            resolvedBy: user.username,
            resolvedAt: new Date(),
            adminNotes: `Auto-resolved via player ban: ${reason.trim()}`
          }
        }
      );
    }

    // Log admin action
    const adminLogs = db.collection('adminLogs');
    await adminLogs.insertOne({
      adminUsername: user.username,
      action: 'BAN_PLAYER',
      targetUsername: username,
      reason: reason.trim(),
      durationDays: durationDays || 'permanent',
      timestamp: new Date(),
      metadata: {
        playerTier: player.tier,
        playerRank: player.rank,
        playerResources: player.resources,
        autoResolvedFlags: autoResolveFlags
      }
    });

    return NextResponse.json({
      success: true,
      message: `Player ${username} has been banned`,
      data: {
        username,
        bannedBy: user.username,
        bannedAt,
        expiresAt,
        isPermanent: !durationDays,
        reason: reason.trim(),
        flagsResolved: autoResolveFlags
      }
    });

  } catch (error) {
    console.error('Ban player error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to ban player'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/ban-player - Unban a player
 * Removes ban and restores account access
 */
export async function DELETE(request: NextRequest) {
  try {
    // Admin authentication check
    const user = await getAuthenticatedUser();
    if (!user || !user.rank || user.rank < 5) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('game');
    const players = db.collection('players');
    const bans = db.collection('bans');

    // Update player account
    const result = await players.updateOne(
      { username },
      {
        $set: {
          banned: false,
          unbannedAt: new Date(),
          unbannedBy: user.username
        },
        $unset: {
          bannedAt: '',
          bannedBy: '',
          banReason: '',
          banExpiresAt: ''
        }
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    // Deactivate ban records
    await bans.updateMany(
      { username, active: true },
      {
        $set: {
          active: false,
          unbannedAt: new Date(),
          unbannedBy: user.username
        }
      }
    );

    // Log admin action
    const adminLogs = db.collection('adminLogs');
    await adminLogs.insertOne({
      adminUsername: user.username,
      action: 'UNBAN_PLAYER',
      targetUsername: username,
      timestamp: new Date()
    });

    return NextResponse.json({
      success: true,
      message: `Player ${username} has been unbanned`,
      data: {
        username,
        unbannedBy: user.username,
        unbannedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Unban player error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to unban player'
      },
      { status: 500 }
    );
  }
}

/**
 * 📝 IMPLEMENTATION NOTES:
 * - Creates ban record in separate collection for history
 * - Updates player account to prevent login
 * - Supports both permanent and temporary bans
 * - Option to auto-resolve flags when banning
 * - Prevents banning of admin accounts
 * - Comprehensive audit logging
 * 
 * 🔐 SECURITY:
 * - Admin-only access (rank >= 5)
 * - Cannot ban admin accounts (rank >= 5)
 * - Requires meaningful ban reason
 * - All actions logged for accountability
 * 
 * 📊 REQUEST BODY (POST):
 * {
 *   username: string,
 *   reason: string (min 10 characters),
 *   durationDays?: number (null/undefined = permanent),
 *   autoResolveFlags?: boolean (default: false)
 * }
 * 
 * 📊 QUERY PARAMS (DELETE):
 * ?username=string
 * 
 * 🚀 FUTURE ENHANCEMENTS:
 * - IP banning for severe cases
 * - Automatic ban expiration job
 * - Ban appeal system
 * - Warning system before bans
 * - Progressive ban durations for repeat offenders
 * - Discord webhook notifications
 */
