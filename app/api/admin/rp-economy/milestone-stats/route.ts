/**
 * @file app/api/admin/rp-economy/milestone-stats/route.ts
 * @created 2025-10-20
 * @overview API endpoint for daily harvest milestone statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { getAuthenticatedUser } from '@/lib/authService';

/**
 * GET /api/admin/rp-economy/milestone-stats
 * Returns daily harvest milestone completion statistics
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const adminUser = await getAuthenticatedUser();
    if (!adminUser?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Query milestone completions from RPTransaction collection
    const rpTransactionsCollection = await getCollection('rpTransactions');
    
    // Milestone thresholds from researchPointService
    const milestoneThresholds = [1000, 2500, 5000, 10000, 15000, 22500];
    
    const milestones = await Promise.all(
      milestoneThresholds.map(async (threshold) => {
        // Count completions for this milestone
        const completions = await rpTransactionsCollection.countDocuments({
          source: 'harvest_milestone',
          'metadata.threshold': threshold
        });

        // Calculate RP awarded (completions × milestone RP amount)
        const milestoneAmounts: Record<number, number> = {
          1000: 500,
          2500: 750,
          5000: 1000,
          10000: 1500,
          15000: 1250,
          22500: 1000
        };

        const rpAwarded = completions * (milestoneAmounts[threshold] || 0);

        // Calculate completion rate (what % of players who start reach this milestone)
        // Simplified: just use raw completion count for now
        const completionRate = completions > 0 ? (completions / Math.max(completions, 1)) * 100 : 0;

        return {
          threshold,
          completions,
          rpAwarded,
          completionRate
        };
      })
    );

    return NextResponse.json({ milestones });

  } catch (error) {
    console.error('Error fetching milestone stats:', error);
    return NextResponse.json({ error: 'Failed to fetch milestone stats' }, { status: 500 });
  }
}
