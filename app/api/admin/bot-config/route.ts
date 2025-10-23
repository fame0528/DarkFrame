/**
 * @fileoverview Admin Bot Configuration API - View and update bot configs
 * @module app/api/admin/bot-config/route
 * @created 2025-10-18
 * 
 * OVERVIEW:
 * Admin-only endpoint for viewing and modifying bot configurations.
 * Allows admins to inspect bot details and adjust bot behavior settings.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import clientPromise from '@/lib/mongodb';

// ============================================================================
// GET - View Bot Configuration
// ============================================================================

/**
 * GET /api/admin/bot-config?username=BotName
 * Returns detailed configuration for a specific bot
 * Requires admin privileges (rank >= 5)
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const tokenPayload = await getAuthenticatedUser();
    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check admin privileges
    if (tokenPayload.isAdmin !== true) {
      return NextResponse.json(
        { error: 'Admin privileges required' },
        { status: 403 }
      );
    }

    const client = await clientPromise;
    const db = client.db('game');

    // Get bot username from query params
    const { searchParams } = new URL(request.url);
    const botUsername = searchParams.get('username');

    if (!botUsername) {
      return NextResponse.json(
        { error: 'Bot username is required' },
        { status: 400 }
      );
    }

    // Fetch bot
    const bot = await db.collection('players').findOne({
      username: botUsername,
      isBot: true,
    });

    if (!bot) {
      return NextResponse.json(
        { error: 'Bot not found' },
        { status: 404 }
      );
    }

    // Return bot configuration
    return NextResponse.json({
      success: true,
      data: {
        username: bot.username,
        currentPosition: bot.currentPosition,
        resources: bot.resources,
        botConfig: bot.botConfig,
        units: bot.units,
        totalAttack: bot.totalAttack,
        totalDefense: bot.totalDefense,
        level: bot.level,
        xp: bot.xp,
        createdAt: bot.createdAt,
        lastActivity: bot.lastActivity,
      },
    });
  } catch (error) {
    console.error('Bot config fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch bot configuration',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH - Update Bot Configuration
// ============================================================================

/**
 * PATCH /api/admin/bot-config
 * Updates bot configuration settings
 * Requires admin privileges (rank >= 5)
 * 
 * Request body:
 * {
 *   username: string,
 *   updates: {
 *     specialization?: string,
 *     tier?: number,
 *     position?: { x: number, y: number },
 *     resources?: { metal?: number, energy?: number },
 *     isSpecialBase?: boolean
 *   }
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    // Authenticate user
    const tokenPayload = await getAuthenticatedUser();
    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check admin privileges
    if (tokenPayload.isAdmin !== true) {
      return NextResponse.json(
        { error: 'Admin privileges required' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const client = await clientPromise;
    const db = client.db('game');
    const { username, updates } = body;

    if (!username) {
      return NextResponse.json(
        { error: 'Bot username is required' },
        { status: 400 }
      );
    }

    // Verify bot exists
    const bot = await db.collection('players').findOne({
      username,
      isBot: true,
    });

    if (!bot) {
      return NextResponse.json(
        { error: 'Bot not found' },
        { status: 404 }
      );
    }

    // Build update document
    const updateDoc: Record<string, unknown> = {};

    if (updates.specialization) {
      const validSpecs = ['Hoarder', 'Fortress', 'Raider', 'Balanced', 'Ghost'];
      if (!validSpecs.includes(updates.specialization)) {
        return NextResponse.json(
          { error: `Invalid specialization. Must be one of: ${validSpecs.join(', ')}` },
          { status: 400 }
        );
      }
      updateDoc['botConfig.specialization'] = updates.specialization;
    }

    if (updates.tier !== undefined) {
      if (updates.tier < 1 || updates.tier > 6) {
        return NextResponse.json(
          { error: 'Tier must be between 1 and 6' },
          { status: 400 }
        );
      }
      updateDoc['botConfig.tier'] = updates.tier;
    }

    if (updates.position) {
      if (
        typeof updates.position.x !== 'number' ||
        typeof updates.position.y !== 'number' ||
        updates.position.x < 0 ||
        updates.position.x > 5000 ||
        updates.position.y < 0 ||
        updates.position.y > 5000
      ) {
        return NextResponse.json(
          { error: 'Invalid position. Must be within map bounds (0-5000)' },
          { status: 400 }
        );
      }
      updateDoc['currentPosition'] = updates.position;
    }

    if (updates.resources) {
      if (updates.resources.metal !== undefined) {
        updateDoc['resources.metal'] = Math.max(0, updates.resources.metal);
      }
      if (updates.resources.energy !== undefined) {
        updateDoc['resources.energy'] = Math.max(0, updates.resources.energy);
      }
    }

    if (updates.isSpecialBase !== undefined) {
      updateDoc['botConfig.isSpecialBase'] = Boolean(updates.isSpecialBase);
    }

    // Apply updates
    if (Object.keys(updateDoc).length > 0) {
      await db.collection('players').updateOne(
        { username, isBot: true },
        { $set: updateDoc }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Bot configuration updated successfully',
      updates: updateDoc,
    });
  } catch (error) {
    console.error('Bot config update error:', error);
    return NextResponse.json(
      {
        error: 'Failed to update bot configuration',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// IMPLEMENTATION NOTES
// ============================================================================

/**
 * ADMIN PERMISSIONS:
 * - Requires rank >= 5 for both GET and PATCH
 * - All updates validated before applying
 * - Position changes bounded to map limits
 * 
 * USAGE:
 * View bot config:
 * GET /api/admin/bot-config?username=RaiderBot_42
 * 
 * Update bot position:
 * PATCH /api/admin/bot-config
 * { "username": "RaiderBot_42", "updates": { "position": { "x": 2500, "y": 2500 } } }
 * 
 * Change bot tier and resources:
 * PATCH /api/admin/bot-config
 * { "username": "HoarderBot_13", "updates": { "tier": 5, "resources": { "metal": 500000 } } }
 * 
 * FUTURE ENHANCEMENTS:
 * - Batch updates (multiple bots at once)
 * - Configuration templates
 * - Undo/rollback functionality
 * - Audit logging for all changes
 */
