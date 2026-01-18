/**
 * 📅 Created: 2025-01-18
 * 📅 Updated: 2025-10-24 (FID-20251024-ADMIN: Production Infrastructure)
 * 🎯 OVERVIEW:
 * Clear Flag Admin Endpoint
 * 
 * POST /api/admin/clear-flag
 * Rate Limited: 30 req/hour (admin bot management)
 * - Marks a specific anti-cheat flag as resolved
 * - Requires admin notes explaining resolution
 * - Records which admin cleared the flag and when
 * - Admin-only access (rank >= 5)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authService';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
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
import { ClearFlagSchema } from '@/lib/validation/schemas';
import { ZodError } from 'zod';

const rateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.adminBot);

export const POST = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('AdminClearFlagAPI');
  const endTimer = log.time('clear-flag');

  try {
    // Admin authentication check
    const user = await getAuthenticatedUser();
    if (!user || !user.rank || user.rank < 5) {
      return createErrorResponse(ErrorCode.ADMIN_ACCESS_REQUIRED, {
        message: 'Admin access required (rank 5+)',
      });
    }

    const body = await request.json();
    const validated = ClearFlagSchema.parse(body);
    const { flagId, adminNotes } = validated;

    const client = await clientPromise;
    const db = client.db('game');
    const flags = db.collection('playerFlags');

    // Find and update flag
    const result = await flags.findOneAndUpdate(
      { _id: new ObjectId(flagId) },
      {
        $set: {
          resolved: true,
          resolvedBy: user.username,
          resolvedAt: new Date(),
          adminNotes: adminNotes.trim()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return createErrorResponse(ErrorCode.ADMIN_FLAG_NOT_FOUND, {
        message: 'Flag not found',
        flagId,
      });
    }

    // Log admin action
    const adminLogs = db.collection('adminLogs');
    await adminLogs.insertOne({
      adminUsername: user.username,
      action: 'CLEAR_FLAG',
      targetUsername: result.username,
      flagType: result.flagType,
      flagSeverity: result.severity,
      flagId: flagId,
      notes: adminNotes.trim(),
      timestamp: new Date()
    });

    log.info('Flag cleared successfully', {
      flagId,
      username: result.username,
      flagType: result.flagType,
      severity: result.severity,
      adminUser: user.username,
    });

    return NextResponse.json({
      success: true,
      message: 'Flag cleared successfully',
      data: {
        flagId: result._id,
        username: result.username,
        flagType: result.flagType,
        severity: result.severity,
        resolvedBy: user.username,
        resolvedAt: result.resolvedAt,
        adminNotes: result.adminNotes
      }
    });

  } catch (error) {
    if (error instanceof ZodError) {
      return createValidationErrorResponse(error);
    }
    log.error('Failed to clear flag', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));

/**
 * 📝 IMPLEMENTATION NOTES:
 * - Marks flag as resolved, not deleted (maintains history)
 * - Requires meaningful admin notes for accountability
 * - Logs all admin actions in adminLogs collection
 * - Returns updated flag data for UI refresh
 * 
 * 🔐 SECURITY:
 * - Admin-only access (rank >= 5)
 * - Validates flag ID and notes
 * - Audit trail via admin logs
 * 
 * 📊 REQUEST BODY:
 * {
 *   flagId: string,
 *   adminNotes: string (min 10 characters)
 * }
 * 
 * 🚀 FUTURE ENHANCEMENTS:
 * - Bulk flag clearing for same issue
 * - Flag reinstatement if player reoffends
 * - Automatic notifications to player
 * - Admin action history view
 */
