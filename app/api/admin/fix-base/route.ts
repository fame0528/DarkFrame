/**
 * @file app/api/admin/fix-base/route.ts
 * @created 2025-10-18
 * @updated 2025-10-24 (FID-20251024-ADMIN: Production Infrastructure)
 * @overview Admin-only endpoint to fix base tiles
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { Player, Tile, TerrainType } from '@/types';
import {
  withRequestLogging,
  createRouteLogger,
  createRateLimiter,
  ENDPOINT_RATE_LIMITS,
  createErrorResponse,
  createErrorFromException,
  ErrorCode,
} from '@/lib';

const rateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.adminBot);

export const POST = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('AdminFixBaseAPI');
  const endTimer = log.time('fix-base');

  try {
    const user = await getAuthenticatedUser();
    
    if (!user || user.isAdmin !== true) {
      return createErrorResponse(ErrorCode.ADMIN_ACCESS_REQUIRED, {
        message: 'Admin access required',
      });
    }
    
    const playersCollection = await getCollection<Player>('players');
    const tilesCollection = await getCollection<Tile>('tiles');
    
    const players = await playersCollection.find({}).toArray();
    let fixedCount = 0;
    
    for (const player of players) {
      const { x, y } = player.base;
      
      const result = await tilesCollection.updateOne(
        { x, y },
        { 
          $set: { 
            terrain: TerrainType.Wasteland,
            occupiedByBase: true
          } 
        }
      );
      
      if (result.modifiedCount > 0) {
        fixedCount++;
        log.debug(`Fixed ${player.username}'s base at (${x}, ${y})`);
      }
    }
    
    log.info('Base tiles fixed', {
      fixedCount,
      adminUser: user.username,
    });

    return NextResponse.json({ 
      success: true, 
      message: `Fixed ${fixedCount} base tiles` 
    });
    
  } catch (error) {
    log.error('Failed to fix bases', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));
