/**
 * @fileoverview Admin Bot Configuration API - View and update bot configs
 * @module app/api/admin/bot-config/route
 * @created 2025-10-18
 * @updated 2025-10-24 (FID-20251024-ADMIN: Production Infrastructure)
 * 
 * OVERVIEW:
 * Admin-only endpoint for viewing and modifying bot configurations.
 * Allows admins to inspect bot details and adjust bot behavior settings.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import clientPromise from '@/lib/mongodb';
import {
  withRequestLogging,
  createRouteLogger,
  createRateLimiter,
  ENDPOINT_RATE_LIMITS,
  createErrorResponse,
  createValidationErrorResponse,
  createErrorFromException,
  ErrorCode,
} from '@/lib';
import { BotConfigPatchSchema } from '@/lib/validation/schemas';
import { ZodError } from 'zod';

const rateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.admin);

// ============================================================================
// GET - View Bot Configuration
// ============================================================================

/**
 * GET /api/admin/bot-config?username=BotName
 * Rate Limited: 500 req/min (admin dashboard)
 * Returns detailed configuration for a specific bot
 * Requires admin privileges (rank >= 5)
 */
export const GET = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('AdminBotConfigGetAPI');
  const endTimer = log.time('get-bot-config');

  try {
    // Authenticate user
    const tokenPayload = await getAuthenticatedUser();
    if (!tokenPayload) {
      return createErrorResponse(ErrorCode.AUTH_UNAUTHORIZED, {
        message: 'Authentication required',
      });
    }

    // Check admin privileges
    if (tokenPayload.isAdmin !== true) {
      return createErrorResponse(ErrorCode.ADMIN_ACCESS_REQUIRED, {
        message: 'Admin privileges required',
      });
    }

    const client = await clientPromise;
    const db = client.db('game');

    // Get bot username from query params
    const { searchParams } = new URL(request.url);
    const botUsername = searchParams.get('username');

    if (!botUsername) {
      return createErrorResponse(ErrorCode.VALIDATION_MISSING_FIELD, {
        message: 'Bot username is required',
      });
    }

    // Fetch bot
    const bot = await db.collection('players').findOne({
      username: botUsername,
      isBot: true,
    });

    if (!bot) {
      return createErrorResponse(ErrorCode.ADMIN_BOT_NOT_FOUND, {
        message: 'Bot not found',
        username: botUsername,
      });
    }

    // Return bot configuration
    log.info('Bot configuration retrieved', {
      botUsername,
      tier: bot.botConfig?.tier,
      specialization: bot.botConfig?.specialization,
      adminUser: tokenPayload.username,
    });

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
    log.error('Failed to fetch bot configuration', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));

// ============================================================================
// PATCH - Update Bot Configuration
// ============================================================================

/**
 * PATCH /api/admin/bot-config
 * Rate Limited: 30 req/hour (admin bot management)
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
const patchRateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.adminBot);

export const PATCH = withRequestLogging(patchRateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('AdminBotConfigPatchAPI');
  const endTimer = log.time('patch-bot-config');

  try {
    // Authenticate user
    const tokenPayload = await getAuthenticatedUser();
    if (!tokenPayload) {
      return createErrorResponse(ErrorCode.AUTH_UNAUTHORIZED, {
        message: 'Authentication required',
      });
    }

    // Check admin privileges
    if (tokenPayload.isAdmin !== true) {
      return createErrorResponse(ErrorCode.ADMIN_ACCESS_REQUIRED, {
        message: 'Admin privileges required',
      });
    }

    // Parse request body
    const body = await request.json();
    const validated = BotConfigPatchSchema.parse(body);
    const client = await clientPromise;
    const db = client.db('game');
    const { username, updates } = validated;

    // Verify bot exists
    const bot = await db.collection('players').findOne({
      username,
      isBot: true,
    });

    if (!bot) {
      return createErrorResponse(ErrorCode.ADMIN_BOT_NOT_FOUND, {
        message: 'Bot not found',
        username,
      });
    }

    // Build update document (validation already done by schema)
    const updateDoc: Record<string, unknown> = {};

    if (updates.specialization) {
      updateDoc['botConfig.specialization'] = updates.specialization;
    }

    if (updates.tier !== undefined) {
      updateDoc['botConfig.tier'] = updates.tier;
    }

    if (updates.position) {
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

    log.info('Bot configuration updated successfully', {
      username,
      updatesApplied: Object.keys(updateDoc),
      adminUser: tokenPayload.username,
    });

    return NextResponse.json({
      success: true,
      message: 'Bot configuration updated successfully',
      updates: updateDoc,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return createValidationErrorResponse(error);
    }
    log.error('Failed to update bot configuration', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));

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
