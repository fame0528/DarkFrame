/**
 * @file app/api/admin/fix-base/route.ts
 * @created 2025-10-18
 * @overview Admin-only endpoint to fix base tiles
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { Player, Tile, TerrainType } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    
    if (!user || user.isAdmin !== true) {
      return NextResponse.json(
        { success: false, error: 'Admin only' },
        { status: 403 }
      );
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
        console.log(`✅ Fixed ${player.username}'s base at (${x}, ${y})`);
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Fixed ${fixedCount} base tiles` 
    });
    
  } catch (error) {
    console.error('Fix base error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fix bases' },
      { status: 500 }
    );
  }
}
