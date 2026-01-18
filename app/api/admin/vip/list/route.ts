/**
 * @file app/api/admin/vip/list/route.ts
 * @created 2025-10-19
 * @overview Admin API - List all users with VIP status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
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

export const GET = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('admin/vip/list');
  const endTimer = log.time('list-vip-users');

  try {
    // Admin authentication check
    const user = await getAuthenticatedUser();
    if (!user?.isAdmin) {
      return createErrorResponse(ErrorCode.ADMIN_ACCESS_REQUIRED);
    }

    const playersCollection = await getCollection('players');
    
    // Fetch all users with relevant fields
    const users = await playersCollection
      .find({})
      .project({
        username: 1,
        email: 1,
        vip: 1,
        vipExpiration: 1,
        createdAt: 1
      })
      .sort({ username: 1 })
      .toArray();

    const vipUsers = users.filter(u => u.vip);

    log.info('VIP users list retrieved', {
      totalUsers: users.length,
      vipUsers: vipUsers.length,
    });

    return NextResponse.json({
      success: true,
      users: users.map(user => ({
        username: user.username,
        email: user.email,
        vip: user.vip || false,
        vipExpiration: user.vipExpiration || null,
        createdAt: user.createdAt || null
      }))
    });

  } catch (error) {
    log.error('Failed to fetch users', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));
