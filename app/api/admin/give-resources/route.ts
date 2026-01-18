/**
 * 📅 Created: 2025-01-18
 * 🎯 OVERVIEW:
 * Give Resources Admin Endpoint
 * 
 * Allows admins to give metal/energy to any player.
 * Logs action in adminLogs collection for audit trail.
 * 
 * POST /api/admin/give-resources
 * Body: { username, metal, energy }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authService';
import clientPromise from '@/lib/mongodb';
import { 
  withRequestLogging, 
  createRouteLogger, 
  createRateLimiter,
  ENDPOINT_RATE_LIMITS,
  GiveResourcesSchema,
  createErrorResponse,
  createErrorFromException,
  createValidationErrorResponse,
  ErrorCode
} from '@/lib';
import { ZodError } from 'zod';

const rateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.adminBot);

export const POST = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('AdminGiveResourcesAPI');
  const endTimer = log.time('giveResources');

  try {
    // Admin authentication
    const adminUser = await getAuthenticatedUser();
    if (!adminUser || !adminUser.rank || adminUser.rank < 5) {
      log.warn('Unauthorized admin access attempt', { username: adminUser?.username });
      return createErrorResponse(ErrorCode.AUTH_UNAUTHORIZED, {
        message: 'Admin access required (rank 5+)'
      });
    }

    const body = await request.json();
    const validated = GiveResourcesSchema.parse(body);

    log.debug('Give resources request', { 
      username: validated.username, 
      metal: validated.metal, 
      energy: validated.energy,
      adminUsername: adminUser.username
    });

    const client = await clientPromise;
    const db = client.db('game');

    // Check if player exists
    const player = await db.collection('players').findOne({ username: validated.username });
    if (!player) {
      log.warn('Player not found for resource grant', { username: validated.username });
      return createErrorResponse(ErrorCode.VALIDATION_FAILED, {
        message: 'Player not found'
      });
    }

    // Update player resources atomically
    const result = await db.collection('players').updateOne(
      { username: validated.username },
      {
        $inc: {
          metal: validated.metal,
          energy: validated.energy
        }
      }
    );

    if (result.modifiedCount === 0) {
      log.error('Failed to update player resources', new Error('Database update failed'), {
        username: validated.username,
        metal: validated.metal,
        energy: validated.energy
      });
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, {
        message: 'Failed to give resources'
      });
    }

    // Log admin action for audit trail
    await db.collection('adminLogs').insertOne({
      timestamp: new Date(),
      adminUsername: adminUser.username,
      actionType: 'GIVE_RESOURCES',
      targetUsername: validated.username,
      details: {
        metal: validated.metal,
        energy: validated.energy,
        previousMetal: player.metal || 0,
        previousEnergy: player.energy || 0
      }
    });

    const newResources = {
      metal: (player.metal || 0) + validated.metal,
      energy: (player.energy || 0) + validated.energy
    };

    log.info('Resources granted successfully', { 
      username: validated.username,
      granted: { metal: validated.metal, energy: validated.energy },
      newTotals: newResources,
      adminUsername: adminUser.username
    });

    return NextResponse.json({
      success: true,
      message: `Gave ${validated.metal} metal and ${validated.energy} energy to ${validated.username}`,
      newResources
    });

  } catch (error) {
    if (error instanceof ZodError) {
      log.warn('Give resources validation failed', { issues: error.issues });
      return createValidationErrorResponse(error);
    }

    log.error('Error giving resources', error as Error);
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));

/**
 * 📝 IMPLEMENTATION NOTES:
 * - Admin-only access (rank >= 5)
 * - Uses $inc for atomic resource update
 * - Logs action in adminLogs collection
 * - Validates resource amounts (non-negative)
 * 
 * 🔐 SECURITY:
 * - Admin authentication required
 * - Input validation (positive amounts)
 * - Audit trail logging
 * 
 * 📊 ADMIN LOG STRUCTURE:
 * {
 *   timestamp: Date,
 *   adminUsername: string,
 *   actionType: 'GIVE_RESOURCES',
 *   targetUsername: string,
 *   details: { metal, energy, previousMetal, previousEnergy }
 * }
 */
