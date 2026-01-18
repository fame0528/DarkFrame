/**
 * @file app/api/admin/vip/revoke/route.ts
 * @created 2025-10-19
 * @overview Admin API - Revoke VIP status from user
 */

import { NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import {
  withRequestLogging,
  createRouteLogger,
  createRateLimiter,
  ENDPOINT_RATE_LIMITS,
  RevokeVIPSchema,
  createErrorResponse,
  createErrorFromException,
  createValidationErrorResponse,
  ErrorCode
} from '@/lib';
import { ZodError } from 'zod';

const rateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.adminVIPRevoke);

export const POST = withRequestLogging(rateLimiter(async (request: Request) => {
  const log = createRouteLogger('AdminVIPRevokeAPI');
  const endTimer = log.time('revokeVIP');
  
  try {
    const body = await request.json();
    const validated = RevokeVIPSchema.parse(body);

    // TODO: Add admin authentication check
    // const adminUsername = request.headers.get('x-admin-username');
    // if (!await isAdmin(adminUsername)) {
    //   return createErrorResponse(ErrorCode.AUTH_UNAUTHORIZED);
    // }

    log.debug('VIP revoke request', { username: validated.username });

    const playersCollection = await getCollection('players');
    
    // Find the user
    const user = await playersCollection.findOne({ username: validated.username });
    if (!user) {
      log.warn('User not found for VIP revoke', { username: validated.username });
      return createErrorResponse(ErrorCode.VALIDATION_FAILED, {
        message: 'User not found'
      });
    }

    // Remove VIP status
    const result = await playersCollection.updateOne(
      { username: validated.username },
      {
        $set: {
          vip: false
        },
        $unset: {
          vipExpiration: '',
          vipTier: '',
          stripeCustomerId: '',
          stripeSubscriptionId: ''
        }
      }
    );

    if (result.modifiedCount === 0) {
      log.error('Failed to revoke VIP', new Error('Database update failed'), { 
        username: validated.username 
      });
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, {
        message: 'Failed to revoke VIP'
      });
    }

    // TODO: Log VIP revoke in analytics
    // await logVIPRevoke({ username, revokedBy: adminUsername, revokedAt: new Date() });

    log.info('VIP revoked successfully', { username: validated.username });

    return NextResponse.json({
      success: true,
      message: `VIP revoked from ${validated.username}`
    });

  } catch (error) {
    if (error instanceof ZodError) {
      log.warn('VIP revoke validation failed', { issues: error.issues });
      return createValidationErrorResponse(error);
    }

    log.error('Error revoking VIP', error as Error);
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));
