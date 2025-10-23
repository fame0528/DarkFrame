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

const HOTKEY_COLLECTION = 'hotkey_settings';

/**
 * GET /api/admin/hotkeys
 * Retrieve current hotkey configuration
 */
export async function GET(request: NextRequest) {
  try {
    const db = await getDatabase();
    
    // Get current hotkey settings or return defaults
    const settings = await db.collection<HotkeySettings>(HOTKEY_COLLECTION).findOne({});
    
    if (!settings) {
      // Return default hotkeys if no configuration exists
      return NextResponse.json({
        success: true,
        hotkeys: DEFAULT_HOTKEYS,
        version: 1,
        isDefault: true,
      });
    }
    
    return NextResponse.json({
      success: true,
      hotkeys: settings.hotkeys,
      version: settings.version,
      lastModified: settings.lastModified,
      modifiedBy: settings.modifiedBy,
      isDefault: false,
    });
  } catch (error) {
    console.error('❌ Error fetching hotkey settings:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to retrieve hotkey settings', error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/hotkeys
 * Update hotkey configuration (admin only)
 */
export async function PUT(request: NextRequest) {
  try {
    // Authenticate admin user
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Please log in' },
        { status: 401 }
      );
    }
    
    if (user.isAdmin !== true) {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }
    
    const { hotkeys } = await request.json();
    
    // Validate hotkeys array
    if (!Array.isArray(hotkeys) || hotkeys.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid hotkeys: must be a non-empty array' },
        { status: 400 }
      );
    }
    
    // Validate each hotkey has required fields
    for (const hotkey of hotkeys) {
      if (!hotkey.action || !hotkey.key || !hotkey.displayName || !hotkey.category) {
        return NextResponse.json(
          { success: false, message: 'Invalid hotkey: missing required fields (action, key, displayName, category)' },
          { status: 400 }
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
    
    console.log(`✅ Hotkey settings updated by admin: ${user.username} (version ${newSettings.version})`);
    
    return NextResponse.json({
      success: true,
      message: 'Hotkey settings updated successfully',
      version: newSettings.version,
    });
  } catch (error) {
    console.error('❌ Error updating hotkey settings:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update hotkey settings', error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/hotkeys/reset
 * Reset hotkeys to default configuration (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate admin user
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Please log in' },
        { status: 401 }
      );
    }
    
    if (user.isAdmin !== true) {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Admin access required' },
        { status: 403 }
      );
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
    
    console.log(`✅ Hotkey settings reset to defaults by admin: ${user.username}`);
    
    return NextResponse.json({
      success: true,
      message: 'Hotkey settings reset to defaults',
      hotkeys: DEFAULT_HOTKEYS,
    });
  } catch (error) {
    console.error('❌ Error resetting hotkey settings:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to reset hotkey settings', error: String(error) },
      { status: 500 }
    );
  }
}

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
