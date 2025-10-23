/**
 * @file app/api/admin/rp-economy/stats/route.ts
 * @created 2025-10-20
 * @overview API endpoint for RP economy statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { Player } from '@/types';
import { getAuthenticatedUser } from '@/lib/authService';

/**
 * GET /api/admin/rp-economy/stats
 * Returns overall RP economy statistics
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const adminUser = await getAuthenticatedUser();
    if (!adminUser?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Calculate economy stats
    const playersCollection = await getCollection<Player>('players');
    const players = await playersCollection.find({}).toArray();
    
    const totalRP = players.reduce((sum: number, p: Player) => sum + (p.researchPoints || 0), 0);
    const vipPlayers = players.filter((p: Player) => p.isVIP && p.vipExpiresAt && new Date(p.vipExpiresAt) > new Date()).length;
    
    // Calculate total generated and spent from rpHistory
    let totalGenerated = 0;
    let totalSpent = 0;
    
    for (const player of players) {
      if (player.rpHistory && Array.isArray(player.rpHistory)) {
        for (const entry of player.rpHistory) {
          if (entry.amount > 0) {
            totalGenerated += entry.amount;
          } else {
            totalSpent += Math.abs(entry.amount);
          }
        }
      }
    }

    // Get active earners in last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeEarners24h = players.filter((p: Player) => {
      if (!p.rpHistory || !Array.isArray(p.rpHistory)) return false;
      return p.rpHistory.some((entry: any) => 
        entry.amount > 0 && 
        entry.timestamp && 
        new Date(entry.timestamp) > oneDayAgo
      );
    }).length;

    // Calculate daily generation (last 24 hours)
    let dailyGeneration = 0;
    for (const player of players) {
      if (player.rpHistory && Array.isArray(player.rpHistory)) {
        for (const entry of player.rpHistory) {
          if (entry.amount > 0 && entry.timestamp && new Date(entry.timestamp) > oneDayAgo) {
            dailyGeneration += entry.amount;
          }
        }
      }
    }

    // Calculate average and median balance
    const balances = players.map((p: Player) => p.researchPoints || 0).sort((a: number, b: number) => a - b);
    const averageBalance = Math.round(totalRP / players.length);
    const medianBalance = balances.length > 0 ? balances[Math.floor(balances.length / 2)] : 0;

    return NextResponse.json({
      totalRP,
      totalGenerated,
      totalSpent,
      dailyGeneration,
      activeEarners24h,
      averageBalance,
      medianBalance,
      vipPlayers
    });

  } catch (error) {
    console.error('Error fetching RP economy stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
