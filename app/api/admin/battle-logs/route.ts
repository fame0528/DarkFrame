/**
 * Admin Battle Logs Endpoint
 * Created: 2025-01-18
 * Updated: 2025-10-24 (FID-20251024-ADMIN: Production Infrastructure)
 * 
 * OVERVIEW:
 * Returns list of all battle logs in the game for admin inspection.
 * Provides comprehensive combat data including attacker, defender, outcome,
 * resources transferred, XP gained, and timestamps.
 * 
 * Endpoint: GET /api/admin/battle-logs
 * Rate Limited: 500 req/min (admin dashboard)
 * Auth Required: Admin (FAME account only)
 * 
 * Returns:
 * {
 *   logs: BattleLog[],
 *   total: number
 * }
 * 
 * Battle Log Data Structure:
 * - _id: Log document ID
 * - timestamp: Battle timestamp (ISO string)
 * - attackerUsername: Username of attacker
 * - defenderUsername: Username of defender
 * - outcome: 'attacker_win' | 'defender_win' | 'draw'
 * - resourcesTransferred: {metal, energy}
 * - xpGained: XP awarded to winner
 * - location: {x, y} coordinates
 * - attackerLosses: Units lost by attacker (optional)
 * - defenderLosses: Units lost by defender (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import {
  withRequestLogging,
  createRouteLogger,
  createRateLimiter,
  ENDPOINT_RATE_LIMITS,
  createErrorResponse,
  createErrorFromException,
  ErrorCode,
} from '@/lib';

const rateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.admin);

/**
 * GET handler - Fetch all battle logs
 * 
 * Admin-only endpoint that returns comprehensive battle log data for inspection.
 * Sorted by timestamp (newest first).
 */
export const GET = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('AdminBattleLogsAPI');
  const endTimer = log.time('battle-logs');

  try {
    // Check admin authentication
    const { getAuthenticatedUser } = await import('@/lib/authMiddleware');
    const user = await getAuthenticatedUser();

    if (!user) {
      return createErrorResponse(ErrorCode.AUTH_UNAUTHORIZED, {
        message: 'Authentication required',
      });
    }

    // Check admin access (isAdmin flag required)
    if (user.isAdmin !== true) {
      return createErrorResponse(ErrorCode.ADMIN_ACCESS_REQUIRED, {
        message: 'Admin access required',
      });
    }

    // Get battle logs collection
    const battleLogsCollection = await getCollection('battleLogs');

    // Fetch all battle logs (limit to 10,000 for safety, sorted by newest first)
    const logs = await battleLogsCollection
      .find({})
      .sort({ timestamp: -1 })
      .limit(10000)
      .toArray();

    // Transform battle log data for admin view
    const logsData = logs.map((log: any) => {
      // Get timestamp as ISO string
      const timestamp = log.timestamp
        ? new Date(log.timestamp).toISOString()
        : new Date().toISOString();

      // Calculate resources transferred (default to 0 if not present)
      const resourcesTransferred = {
        metal: log.resourcesTransferred?.metal || log.metalTransferred || 0,
        energy: log.resourcesTransferred?.energy || log.energyTransferred || 0,
      };

      // Get XP gained (default to 0)
      const xpGained = log.xpGained || log.xp || 0;

      // Get location coordinates
      const location = {
        x: log.location?.x || log.x || 0,
        y: log.location?.y || log.y || 0,
      };

      // Determine outcome if not explicitly set
      let outcome = log.outcome || 'draw';
      if (!log.outcome && log.winner) {
        if (log.winner === log.attackerUsername) {
          outcome = 'attacker_win';
        } else if (log.winner === log.defenderUsername) {
          outcome = 'defender_win';
        }
      }

      return {
        _id: log._id.toString(),
        timestamp,
        attackerUsername: log.attackerUsername || log.attacker || 'Unknown',
        defenderUsername: log.defenderUsername || log.defender || 'Unknown',
        outcome,
        resourcesTransferred,
        xpGained,
        location,
        attackerLosses: log.attackerLosses,
        defenderLosses: log.defenderLosses,
      };
    });

    log.info('Battle logs retrieved', {
      total: logsData.length,
      adminUser: user.username,
    });

    return NextResponse.json({
      logs: logsData,
      total: logsData.length,
    });
  } catch (error) {
    log.error('Failed to fetch battle logs', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));

/**
 * IMPLEMENTATION NOTES:
 * 
 * Database Schema Assumptions:
 * - battleLogs collection with fields:
 *   * timestamp: Date
 *   * attackerUsername: string (or attacker)
 *   * defenderUsername: string (or defender)
 *   * outcome: string (or winner field to determine)
 *   * resourcesTransferred: {metal, energy} (or separate fields)
 *   * xpGained: number (or xp)
 *   * location: {x, y} (or separate x, y fields)
 *   * attackerLosses: number (optional)
 *   * defenderLosses: number (optional)
 * 
 * Data Transformation:
 * - Handles multiple field name variations (legacy support)
 * - Converts timestamps to ISO strings for consistency
 * - Determines outcome from winner field if outcome not set
 * - Provides defaults for missing fields (0 for numbers)
 * 
 * Sorting:
 * - Newest battles first (timestamp: -1)
 * - Makes it easy to see recent combat activity
 * 
 * Future Enhancements:
 * - Query params for server-side filtering
 * - Pagination with skip/limit params
 * - Aggregation for statistics (win rates, resource totals)
 * - Battle detail endpoint for individual log inspection
 * - Real-time updates via WebSocket or polling
 * 
 * Performance:
 * - Limit of 10,000 logs prevents excessive data transfer
 * - Client-side filtering for fast UX
 * - Consider adding indexes on: timestamp, attackerUsername, defenderUsername
 * - For production, implement server-side pagination
 */
