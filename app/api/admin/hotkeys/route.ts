// ============================================================
// FILE: app/api/admin/hotkeys/route.ts
// CREATED: 2025-01-23
// ============================================================
// OVERVIEW:
// Admin API endpoint for managing global hotkey configuration.
// Supports GET (retrieve), PUT (update), and POST (reset to defaults).
// Requires admin authentication for all operations.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { DEFAULT_HOTKEYS, HotkeyConfig, HotkeySettings } from '@/types/hotkey.types';
import {
  withRequestLogging,
  createRouteLogger,
  createRateLimiter,
  ENDPOINT_RATE_LIMITS,
  createErrorResponse,
  createErrorFromException,
  ErrorCode,
} from '@/lib';

const HOTKEY_COLLECTION = 'hotkey_settings';

const rateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.admin);
const putRateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.adminBot);
const postRateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.adminBot);

/**
 * GET /api/admin/hotkeys
 * Retrieve current hotkey configuration
 */
export const GET = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('admin/hotkeys');
  const endTimer = log.time('get-hotkeys');

  try {
    const db = await getDatabase();
    
    // Get current hotkey settings or return defaults
    const settings = await db.collection<HotkeySettings>(HOTKEY_COLLECTION).findOne({});
    
    if (!settings) {
      // Return default hotkeys if no configuration exists
      log.info('Returned default hotkeys (no custom config)');
      return NextResponse.json({
        success: true,
        hotkeys: DEFAULT_HOTKEYS,
        version: 1,
        isDefault: true,
      });
    }
    
    log.info('Hotkey config retrieved', {
      version: settings.version,
      modifiedBy: settings.modifiedBy,
      hotkeyCount: settings.hotkeys.length,
    });

    return NextResponse.json({
      success: true,
      hotkeys: settings.hotkeys,
      version: settings.version,
      lastModified: settings.lastModified,
      modifiedBy: settings.modifiedBy,
      isDefault: false,
    });
  } catch (error) {
    log.error('Failed to fetch hotkey settings', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));

/**
 * PUT /api/admin/hotkeys
 * Update hotkey configuration (admin only)
 */
export const PUT = withRequestLogging(putRateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('admin/hotkeys');
  const endTimer = log.time('update-hotkeys');

  try {
    // Authenticate admin user
    const user = await getAuthenticatedUser();
    if (!user) {
      return createErrorResponse(ErrorCode.AUTH_UNAUTHORIZED);
    }
    
    if (user.isAdmin !== true) {
      return createErrorResponse(ErrorCode.ADMIN_ACCESS_REQUIRED);
    }
    
    const { hotkeys } = await request.json();
    
    // Validate hotkeys array
    if (!Array.isArray(hotkeys) || hotkeys.length === 0) {
      return createErrorResponse(ErrorCode.VALIDATION_MISSING_FIELD, 'Hotkeys must be a non-empty array');
    }
    
    // Validate each hotkey has required fields
    for (const hotkey of hotkeys) {
      if (!hotkey.action || !hotkey.key || !hotkey.displayName || !hotkey.category) {
        return createErrorResponse(
          ErrorCode.VALIDATION_MISSING_FIELD, 
          'Each hotkey must have action, key, displayName, and category'
        );
      }
    }
    
    const db = await getDatabase();
    const existingSettings = await db.collection<HotkeySettings>(HOTKEY_COLLECTION).findOne({});
    
    const newSettings: HotkeySettings = {
      version: (existingSettings?.version || 0) + 1,
      lastModified: new Date(),
      modifiedBy: user.username,
      hotkeys: hotkeys as HotkeyConfig[],
    };
    
    // Upsert hotkey settings
    await db.collection<HotkeySettings>(HOTKEY_COLLECTION).updateOne(
      {},
      { $set: newSettings },
      { upsert: true }
    );
    
    log.info('Hotkey settings updated', {
      adminUsername: user.username,
      version: newSettings.version,
      hotkeyCount: hotkeys.length,
    });
    
    return NextResponse.json({
      success: true,
      message: 'Hotkey settings updated successfully',
      version: newSettings.version,
    });
  } catch (error) {
    log.error('Failed to update hotkey settings', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));

/**
 * POST /api/admin/hotkeys/reset
 * Reset hotkeys to default configuration (admin only)
 */
export const POST = withRequestLogging(postRateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('admin/hotkeys');
  const endTimer = log.time('reset-hotkeys');

  try {
    // Authenticate admin user
    const user = await getAuthenticatedUser();
    if (!user) {
      return createErrorResponse(ErrorCode.AUTH_UNAUTHORIZED);
    }
    
    if (user.isAdmin !== true) {
      return createErrorResponse(ErrorCode.ADMIN_ACCESS_REQUIRED);
    }
    
    const db = await getDatabase();
    
    const resetSettings: HotkeySettings = {
      version: 1,
      lastModified: new Date(),
      modifiedBy: user.username,
      hotkeys: DEFAULT_HOTKEYS,
    };
    
    // Replace with default settings
    await db.collection<HotkeySettings>(HOTKEY_COLLECTION).updateOne(
      {},
      { $set: resetSettings },
      { upsert: true }
    );
    
    log.info('Hotkey settings reset to defaults', {
      adminUsername: user.username,
      hotkeyCount: DEFAULT_HOTKEYS.length,
    });
    
    return NextResponse.json({
      success: true,
      message: 'Hotkey settings reset to defaults',
      hotkeys: DEFAULT_HOTKEYS,
    });
  } catch (error) {
    log.error('Failed to reset hotkey settings', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - GET: Returns current hotkeys or defaults if none exist
// - PUT: Updates hotkeys (admin only), increments version
// - POST: Resets to DEFAULT_HOTKEYS (admin only)
// - All write operations require admin authentication
// - Version tracking for configuration changes
// - Validates hotkey structure before saving
// - Single document in hotkey_settings collection
// ============================================================
// END OF FILE
// ============================================================
