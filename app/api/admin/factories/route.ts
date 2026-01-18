/**
 * Admin Factories Endpoint
 * Created: 2025-01-18
 * Updated: 2025-10-24 (FID-20251024-ADMIN: Production Infrastructure)
 * 
 * OVERVIEW:
 * Returns list of all factories in the game for admin inspection.
 * Provides comprehensive factory data including location, owner, production rates,
 * current production, and activity status.
 * 
 * Endpoint: GET /api/admin/factories
 * Rate Limited: 500 req/min (admin dashboard)
 * Auth Required: Admin (rank >= 5)
 * 
 * Returns:
 * {
 *   factories: FactoryData[],
 *   total: number
 * }
 * 
 * Factory Data Structure:
 * - _id: Factory document ID
 * - x, y: Map coordinates
 * - ownerUsername: Player who owns the factory
 * - tier: Factory tier (tier1, tier2, tier3)
 * - productionRate: Units per hour
 * - lastProduction: Last production timestamp
 * - currentProduction: Resources waiting for collection
 * - resourceType: 'metal' or 'energy'
 * - isActive: Whether factory is currently producing
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
 * GET handler - Fetch all factories
 * 
 * Admin-only endpoint that returns comprehensive factory data for inspection.
 * Joins with players collection to get owner details.
 */
export const GET = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('AdminFactoriesAPI');
  const endTimer = log.time('factories');

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

    // Get factories collection
    const factoriesCollection = await getCollection('factories');

    // Fetch all factories (limit to 10,000 for safety)
    const factories = await factoriesCollection
      .find({})
      .limit(10000)
      .toArray();

    // Transform factory data for admin view
    const factoriesData = factories.map((factory: any) => {
      // Calculate time since last production
      const lastProduction = factory.lastProduction
        ? new Date(factory.lastProduction).toISOString()
        : new Date().toISOString();

      // Determine if factory is active (produced within last 2 hours)
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const lastProdTime = factory.lastProduction
        ? new Date(factory.lastProduction).getTime()
        : 0;
      const isActive = lastProdTime > twoHoursAgo;

      // Get production rate based on tier
      let productionRate = 10; // Default tier1
      if (factory.tier === 'tier2') productionRate = 25;
      if (factory.tier === 'tier3') productionRate = 50;

      // Override with explicit productionRate if set
      if (factory.productionRate !== undefined) {
        productionRate = factory.productionRate;
      }

      return {
        _id: factory._id.toString(),
        x: factory.x || 0,
        y: factory.y || 0,
        ownerUsername: factory.ownerUsername || 'Unknown',
        tier: factory.tier || 'tier1',
        productionRate,
        lastProduction,
        currentProduction: factory.currentProduction || 0,
        resourceType: factory.resourceType || 'metal',
        isActive,
      };
    });

    log.info('Factories retrieved', {
      total: factoriesData.length,
      adminUser: user.username,
    });

    return NextResponse.json({
      factories: factoriesData,
      total: factoriesData.length,
    });
  } catch (error) {
    log.error('Failed to fetch factories', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));

/**
 * IMPLEMENTATION NOTES:
 * 
 * Database Schema Assumptions:
 * - factories collection with fields:
 *   * x, y: number (coordinates)
 *   * ownerUsername: string
 *   * tier: 'tier1' | 'tier2' | 'tier3'
 *   * productionRate: number (optional, defaults by tier)
 *   * lastProduction: Date
 *   * currentProduction: number
 *   * resourceType: 'metal' | 'energy'
 * 
 * Activity Calculation:
 * - Factory is "active" if produced within last 2 hours
 * - This helps identify abandoned or broken factories
 * 
 * Production Rate Defaults:
 * - Tier 1: 10 units/hour
 * - Tier 2: 25 units/hour
 * - Tier 3: 50 units/hour
 * - Can be overridden by explicit productionRate field
 * 
 * Future Enhancements:
 * - Add query params for server-side filtering
 * - Pagination with skip/limit
 * - Sorting options (by production, by tier, by owner)
 * - Aggregate production statistics
 * - Owner details from players collection (requires join)
 * 
 * Performance:
 * - Limit of 10,000 factories prevents excessive data transfer
 * - Client-side filtering for fast UX
 * - Consider adding indexes on: ownerUsername, tier, lastProduction
 */
