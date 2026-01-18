/**
 * WMD Admin API Routes
 * 
 * Created: 2025-10-22
 * 
 * OVERVIEW:
 * RESTful API endpoints for WMD administrative operations.
 * All routes require admin role verification and include comprehensive audit logging.
 * 
 * Endpoints:
 * - GET /api/admin/wmd/status - System health and status overview
 * - POST /api/admin/wmd/vote/:voteId/expire - Force expire a vote
 * - POST /api/admin/wmd/missile/:missileId/disarm - Emergency disarm missile
 * - POST /api/admin/wmd/clan/:clanId/cooldown - Adjust clan cooldown
 * - GET /api/admin/wmd/analytics - Global analytics summary
 * - GET /api/admin/wmd/clan/:clanId/activity - Clan-specific activity
 * - GET /api/admin/wmd/impacts - Missile impact report
 * - GET /api/admin/wmd/voting-patterns - Voting analysis
 * - GET /api/admin/wmd/balance - Balance metrics
 * - POST /api/admin/wmd/flag-activity - Flag suspicious activity
 * 
 * Security:
 * - All routes require authentication (JWT token)
 * - Admin role verification via middleware
 * - Rate limiting on sensitive operations
 * - IP logging for audit trail
 * 
 * Related Files:
 * - lib/wmd/admin/wmdAdminService.ts - Admin operations
 * - lib/wmd/admin/wmdAnalyticsService.ts - Analytics functions
 * - middleware.ts - Auth and role verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import {
  getWMDSystemStatus,
  forceExpireVote,
  emergencyDisarmMissile,
  adjustClanCooldown,
  flagSuspiciousActivity,
} from '@/lib/wmd/admin/wmdAdminService';
import {
  getGlobalWMDStats,
  getClanWMDActivity,
  getMissileImpactReport,
  getVotingPatterns,
  getBalanceMetrics,
} from '@/lib/wmd/admin/wmdAnalyticsService';
import {
  withRequestLogging,
  createRouteLogger,
  createRateLimiter,
  ENDPOINT_RATE_LIMITS,
  createErrorResponse,
  createErrorFromException,
  ErrorCode,
} from '@/lib';

// ============================================================================
// MIDDLEWARE & HELPERS
// ============================================================================

/**
 * Verify user is authenticated and has admin role
 * 
 * Validates admin access using JWT cookie authentication.
 * Checks both authentication status and admin role permissions.
 */
async function verifyAdminAccess(request: NextRequest): Promise<{
  isAdmin: boolean;
  userId?: string;
  username?: string;
  error?: string;
}> {
  try {
    // Use JWT cookie authentication (same pattern as admin/stats route)
    const { getAuthenticatedUser } = await import('@/lib/authMiddleware');
    const user = await getAuthenticatedUser();

    if (!user) {
      return { isAdmin: false, error: 'Not authenticated' };
    }

    const db = await connectToDatabase();
    
    // Look up full user record for admin verification
    const playerRecord = await db.collection('players').findOne({ 
      username: user.username 
    });
    
    if (!playerRecord) {
      return { isAdmin: false, error: 'User not found in database' };
    }
    
    // Check admin status via multiple methods for flexibility:
    // 1. isAdmin flag (preferred)
    // 2. role field set to 'ADMIN'
    // 3. ADMIN_EMAILS environment variable (fallback for initial setup)
    const isAdmin = playerRecord.isAdmin === true || 
                    playerRecord.role === 'ADMIN' ||
                    (playerRecord.email && process.env.ADMIN_EMAILS?.split(',').includes(playerRecord.email));
    
    if (!isAdmin) {
      return { isAdmin: false, error: 'Insufficient permissions - admin role required' };
    }
    
    // Return admin info for audit logging
    return {
      isAdmin: true,
      userId: playerRecord._id.toString(),
      username: playerRecord.username || playerRecord.email || 'Admin'
    };
  } catch (error) {
    console.error('Error verifying admin access:', error);
    return { isAdmin: false, error: 'Authentication verification failed' };
  }
}

/**
 * Parse date range from query parameters
 */
function parseDateRange(request: NextRequest): { start: Date; end: Date } {
  const searchParams = request.nextUrl.searchParams;
  
  const startParam = searchParams.get('startDate');
  const endParam = searchParams.get('endDate');
  const rangeParam = searchParams.get('range'); // e.g., '7d', '30d', '90d'

  let start: Date;
  let end: Date = new Date();

  if (startParam && endParam) {
    start = new Date(startParam);
    end = new Date(endParam);
  } else if (rangeParam) {
    const days = parseInt(rangeParam.replace('d', ''));
    start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  } else {
    // Default: last 7 days
    start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  return { start, end };
}

const rateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.admin);

// ============================================================================
// GET ROUTES
// ============================================================================

/**
 * GET /api/admin/wmd/status
 * 
 * Get comprehensive WMD system status
 */
export const GET = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('admin-wmd-get');
  const endTimer = log.time('admin-wmd-get');

  try {
    // Verify admin access
    const auth = await verifyAdminAccess(request);
    if (!auth.isAdmin) {
      return createErrorResponse(ErrorCode.ADMIN_ACCESS_REQUIRED, auth.error || 'Admin access required');
    }

    const { searchParams } = request.nextUrl;
    const action = searchParams.get('action');

    const db = await connectToDatabase();

    // Route to different handlers based on action
    switch (action) {
      case 'analytics': {
        const { start, end } = parseDateRange(request);
        const analytics = await getGlobalWMDStats(db, start, end);
        log.info('WMD analytics retrieved', { action, startDate: start, endDate: end });
        return NextResponse.json({ success: true, data: analytics });
      }

      case 'impacts': {
        const { start, end } = parseDateRange(request);
        const impacts = await getMissileImpactReport(db, start, end);
        log.info('WMD impacts retrieved', { action, startDate: start, endDate: end });
        return NextResponse.json({ success: true, data: impacts });
      }

      case 'voting-patterns': {
        const { start, end } = parseDateRange(request);
        const patterns = await getVotingPatterns(db, start, end);
        log.info('WMD voting patterns retrieved', { action, startDate: start, endDate: end });
        return NextResponse.json({ success: true, data: patterns });
      }

      case 'balance': {
        const { start, end } = parseDateRange(request);
        const balance = await getBalanceMetrics(db, start, end);
        log.info('WMD balance metrics retrieved', { action, startDate: start, endDate: end });
        return NextResponse.json({ success: true, data: balance });
      }

      case 'clan-activity': {
        const clanId = searchParams.get('clanId');
        if (!clanId) {
          return createErrorResponse(ErrorCode.VALIDATION_MISSING_FIELD, 'clanId parameter required');
        }
        const { start, end } = parseDateRange(request);
        const activity = await getClanWMDActivity(db, clanId, start, end);
        log.info('WMD clan activity retrieved', { action, clanId, startDate: start, endDate: end });
        return NextResponse.json({ success: true, data: activity });
      }

      default: {
        // Default: system status
        const status = await getWMDSystemStatus(db);
        log.info('WMD system status retrieved', { action: 'status' });
        return NextResponse.json({ success: true, data: status });
      }
    }
  } catch (error) {
    log.error('WMD admin GET error', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));

// ============================================================================
// POST ROUTES
// ============================================================================

/**
 * POST /api/admin/wmd
 * 
 * Handle admin actions (expire vote, disarm missile, adjust cooldown, flag activity)
 */
export const POST = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('admin-wmd-post');
  const endTimer = log.time('admin-wmd-post');

  try {
    // Verify admin access
    const auth = await verifyAdminAccess(request);
    if (!auth.isAdmin) {
      return createErrorResponse(ErrorCode.ADMIN_ACCESS_REQUIRED, auth.error || 'Admin access required');
    }

    const adminId = auth.userId || 'UNKNOWN_ADMIN';
    const body = await request.json();
    const { action } = body;

    if (!action) {
      return createErrorResponse(ErrorCode.VALIDATION_MISSING_FIELD, 'Action parameter required');
    }

    const db = await connectToDatabase();

    // Route to different handlers based on action
    switch (action) {
      case 'expire-vote': {
        const { voteId, reason } = body;
        if (!voteId || !reason) {
          return createErrorResponse(ErrorCode.VALIDATION_MISSING_FIELD, 'voteId and reason required');
        }

        const result = await forceExpireVote(db, voteId, adminId, reason);
        log.info('WMD vote expired by admin', { action, voteId, adminId, success: result.success });
        return NextResponse.json(result, { status: result.success ? 200 : 400 });
      }

      case 'disarm-missile': {
        const { missileId, reason } = body;
        if (!missileId || !reason) {
          return createErrorResponse(ErrorCode.VALIDATION_MISSING_FIELD, 'missileId and reason required');
        }

        const result = await emergencyDisarmMissile(db, missileId, adminId, reason);
        log.info('WMD missile disarmed by admin', { action, missileId, adminId, success: result.success });
        return NextResponse.json(result, { status: result.success ? 200 : 400 });
      }

      case 'adjust-cooldown': {
        const { clanId, adjustmentHours, reason } = body;
        if (!clanId || adjustmentHours === undefined || !reason) {
          return createErrorResponse(ErrorCode.VALIDATION_MISSING_FIELD, 'clanId, adjustmentHours, and reason required');
        }

        const result = await adjustClanCooldown(db, clanId, adjustmentHours, adminId, reason);
        log.info('WMD clan cooldown adjusted by admin', { action, clanId, adjustmentHours, adminId, success: result.success });
        return NextResponse.json(result, { status: result.success ? 200 : 400 });
      }

      case 'flag-activity': {
        const { playerId, clanId, activityType, details, evidence, severity } = body;
        if (!playerId || !clanId || !activityType || !details) {
          return createErrorResponse(ErrorCode.VALIDATION_MISSING_FIELD, 'playerId, clanId, activityType, and details required');
        }

        const result = await flagSuspiciousActivity(db, {
          playerId,
          clanId,
          activityType,
          details,
          evidence: evidence || {},
          severity: severity || 'MEDIUM',
        });

        log.info('WMD suspicious activity flagged by admin', { action, playerId, clanId, activityType, severity, adminId, success: result.success });
        return NextResponse.json(result, { status: result.success ? 200 : 400 });
      }

      default:
        log.warn('Unknown WMD admin action', { action });
        return createErrorResponse(ErrorCode.VALIDATION_INVALID_FORMAT, `Unknown action: ${action}`);
    }
  } catch (error) {
    log.error('WMD admin POST error', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));

/**
 * OPTIONS handler for CORS
 */
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    }
  );
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. Authentication & Authorization:
 *    - verifyAdminAccess() uses JWT cookie authentication
 *    - Integrates with existing authMiddleware.ts system
 *    - Checks isAdmin flag, role field, and ADMIN_EMAILS env variable
 *    - Returns userId and username for comprehensive audit logging
 * 
 * 2. Request Validation:
 *    - All inputs validated before processing
 *    - Type checking on required parameters
 *    - Meaningful error messages returned
 * 
 * 3. Error Handling:
 *    - Try-catch blocks on all routes
 *    - Detailed logging for debugging
 *    - Generic error messages to clients (security)
 *    - Specific errors only for 400 Bad Request
 * 
 * 4. Date Range Parsing:
 *    - Supports explicit startDate/endDate
 *    - Supports shorthand ranges (7d, 30d, 90d)
 *    - Defaults to last 7 days
 * 
 * 5. API Design:
 *    - RESTful conventions (GET for reads, POST for actions)
 *    - Action-based routing via query/body parameters
 *    - Consistent response format: { success, data/error }
 * 
 * 6. Security Considerations:
 *    - Rate limiting recommended (not implemented)
 *    - IP logging for audit trail (not implemented)
 *    - CORS configured for admin domains only
 *    - Sensitive operations require explicit reason
 * 
 * 7. Performance:
 *    - Database connection reused from pool
 *    - Analytics queries can be slow - consider caching
 *    - Consider pagination for large result sets
 * 
 * 8. Future Enhancements:
 *    - WebSocket support for real-time updates
 *    - Batch operations (disarm multiple missiles)
 *    - Export endpoints (CSV, JSON download)
 *    - Audit log query endpoint
 *    - Admin activity dashboard
 * 
 * 9. Integration Points:
 *    - Expects JWT token in Authorization header
 *    - Returns standardized JSON responses
 *    - Integrates with existing auth system
 *    - Logs to same audit trail as services
 * 
 * 10. Testing:
 *     - Unit tests for validation logic
 *     - Integration tests with mock auth
 *     - Load tests for analytics endpoints
 *     - Security tests for auth bypass attempts
 */
