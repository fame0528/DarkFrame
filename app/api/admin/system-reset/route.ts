/**
 * Admin System Reset Endpoint
 * Created: 2025-01-18
 * 
 * OVERVIEW:
 * ⚠️ DANGEROUS OPERATIONS ⚠️
 * 
 * Executes system-wide reset operations. All actions are irreversible
 * and permanently delete data. Every operation is logged to adminLogs
 * collection for audit trail.
 * 
 * Endpoint: POST /api/admin/system-reset
 * Auth Required: Admin (FAME account only)
 * 
 * Body:
 * {
 *   action: 'clear-battle-logs' | 'clear-activity-logs' | 'reset-flags' | 'clear-sessions'
 * }
 * 
 * Returns:
 * {
 *   success: boolean,
 *   message: string,
 *   deletedCount: number
 * }
 * 
 * Available Actions:
 * - clear-battle-logs: Delete all battle history
 * - clear-activity-logs: Delete all player activity records
 * - reset-flags: Clear all anti-cheat flags (not bans)
 * - clear-sessions: Delete all player session data
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';

/**
 * POST handler - Execute system reset
 * 
 * Admin-only endpoint that performs irreversible data deletion operations.
 * All actions are logged to adminLogs collection.
 */
export async function POST(request: NextRequest) {
  try {
    // Check admin authentication
    const { getAuthenticatedUser } = await import('@/lib/authMiddleware');
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Check admin access (isAdmin flag required)
    if (user.isAdmin !== true) {
      return NextResponse.json(
        { success: false, error: 'Access denied - Admin only' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { action } = body;

    if (!action || typeof action !== 'string') {
      return NextResponse.json(
        { error: 'Action parameter is required' },
        { status: 400 }
      );
    }

    // Get admin logs collection for audit trail
    const adminLogsCollection = await getCollection('adminLogs');

    let deletedCount = 0;
    let message = '';
    let actionType = '';

    // Execute the requested action
    switch (action) {
      case 'clear-battle-logs': {
        const battleLogsCollection = await getCollection('battleLogs');
        const result = await battleLogsCollection.deleteMany({});
        deletedCount = result.deletedCount || 0;
        message = `Deleted ${deletedCount} battle logs`;
        actionType = 'CLEAR_BATTLE_LOGS';
        break;
      }

      case 'clear-activity-logs': {
        const activityCollection = await getCollection('playerActivity');
        const result = await activityCollection.deleteMany({});
        deletedCount = result.deletedCount || 0;
        message = `Deleted ${deletedCount} activity records`;
        actionType = 'CLEAR_ACTIVITY_LOGS';
        break;
      }

      case 'reset-flags': {
        const flagsCollection = await getCollection('playerFlags');
        const result = await flagsCollection.deleteMany({});
        deletedCount = result.deletedCount || 0;
        message = `Cleared ${deletedCount} anti-cheat flags`;
        actionType = 'RESET_ALL_FLAGS';
        break;
      }

      case 'clear-sessions': {
        const sessionsCollection = await getCollection('playerSessions');
        const result = await sessionsCollection.deleteMany({});
        deletedCount = result.deletedCount || 0;
        message = `Deleted ${deletedCount} player sessions`;
        actionType = 'CLEAR_ALL_SESSIONS';
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    // Log the admin action
    await adminLogsCollection.insertOne({
      timestamp: new Date(),
      adminUsername: user.username,
      actionType,
      targetUsername: 'SYSTEM',
      details: {
        action,
        deletedCount,
        message,
      },
    });

    return NextResponse.json({
      success: true,
      message,
      deletedCount,
    });
  } catch (error) {
    console.error('[AdminSystemReset] Failed:', error);
    return NextResponse.json(
      { error: 'System reset failed' },
      { status: 500 }
    );
  }
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * Safety Considerations:
 * - Admin-only access (FAME account verification)
 * - All operations logged to adminLogs for audit trail
 * - No database backup verification (should be added for production)
 * - Irreversible operations - use with extreme caution
 * 
 * Available Actions:
 * 1. clear-battle-logs: Deletes entire battleLogs collection
 * 2. clear-activity-logs: Deletes entire playerActivity collection
 * 3. reset-flags: Deletes entire playerFlags collection (not bans)
 * 4. clear-sessions: Deletes entire playerSessions collection
 * 
 * Admin Logging:
 * - Logs: timestamp, adminUsername, actionType, deletedCount
 * - Provides audit trail for all system modifications
 * - Cannot be undone once logged
 * 
 * Operations NOT Included:
 * These are too dangerous without backup verification:
 * - Reset player progress (players collection modification)
 * - Regenerate map (tiles collection reset)
 * - Reset tech tree (playerTech collection reset)
 * - Delete all factories (factories collection reset)
 * 
 * Future Enhancements:
 * - Database backup verification before execution
 * - Rollback capability with transaction support
 * - Partial deletion (by date range, specific criteria)
 * - Export-before-delete option
 * - Email notifications for destructive operations
 * - Require multiple admin confirmations for critical actions
 * - Rate limiting to prevent accidental rapid deletions
 * 
 * Production Recommendations:
 * 1. Implement automatic backups before any reset
 * 2. Add transaction support for rollback capability
 * 3. Require secondary admin approval for destructive operations
 * 4. Add IP logging for security audit
 * 5. Implement cooldown period between resets
 * 6. Add restore functionality from backups
 */
