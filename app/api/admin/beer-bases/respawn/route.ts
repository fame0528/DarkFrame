/**
 * 📅 Created: 2025-01-18
 * 🎯 OVERVIEW:
 * Beer Base Respawn Admin Endpoint
 * 
 * Allows administrators to force respawn all beer bases on the map.
 * Beer bases are special bot structures that provide beer resources.
 * This endpoint deletes existing beer bases and creates new ones
 * based on current bot population and configuration.
 * 
 * POST /api/admin/beer-bases/respawn
 * - Requires admin access (rank >= 5)
 * - Returns count of beer bases created
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authService';
import clientPromise from '@/lib/mongodb';

export async function POST(req: NextRequest) {
  try {
    // Admin authentication check
    const user = await getAuthenticatedUser();
    if (!user || !user.rank || user.rank < 5) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const client = await clientPromise;
    const db = client.db('game');
    const players = db.collection('players');
    const tiles = db.collection('tiles');
    const config = db.collection('botConfig');

    // Get bot config to determine beer base percentage
    const botConfig = await config.findOne({});
    const beerBasePercent = botConfig?.beerBasePercent || 0.07;

    // Delete all existing beer bases (bot-owned bases)
    const deleteResult = await tiles.deleteMany({ 
      terrain: 'Base',
      owner: { $regex: /^BOT_/i }
    });

    // Count all bots
    const botCount = await players.countDocuments({
      username: { $regex: /^BOT_/i }
    });

    // Calculate number of beer bases to create
    const beerBaseCount = Math.floor(botCount * beerBasePercent);

    // Get random bots to place beer bases
    const bots = await players
      .find({ username: { $regex: /^BOT_/i } })
      .limit(beerBaseCount)
      .toArray();

    // Create beer bases at bot positions
    let createdCount = 0;
    for (const bot of bots) {
      const botData = bot as any;
      
      // Check if there's already a tile at this position
      const existingTile = await tiles.findOne({ 
        x: botData.position?.x || 0, 
        y: botData.position?.y || 0 
      });

      if (existingTile) {
        // Update existing tile to beer base
        await tiles.updateOne(
          { x: botData.position?.x || 0, y: botData.position?.y || 0 },
          { 
            $set: { 
              terrain: 'Base',
              owner: botData.username,
              beerProduction: 5 // Base beer production rate
            } 
          }
        );
      } else {
        // Create new beer base tile
        await tiles.insertOne({
          x: botData.position?.x || 0,
          y: botData.position?.y || 0,
          terrain: 'Base',
          owner: botData.username,
          beerProduction: 5,
          createdAt: new Date()
        });
      }
      createdCount++;
    }

    return NextResponse.json({
      success: true,
      count: createdCount,
      deleted: deleteResult.deletedCount,
      totalBots: botCount,
      message: `Respawned ${createdCount} beer bases (${(beerBasePercent * 100).toFixed(1)}% of ${botCount} bots)`
    });

  } catch (error) {
    console.error('Beer base respawn error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to respawn beer bases'
      },
      { status: 500 }
    );
  }
}

/**
 * 📝 IMPLEMENTATION NOTES:
 * - Beer bases are bot-owned base tiles that produce beer resources
 * - Uses beerBasePercent from bot config to determine quantity
 * - Deletes old beer bases before creating new ones
 * - Places beer bases at random bot positions
 * - Default beer production rate: 5 per hour
 * 
 * 🔐 SECURITY:
 * - Admin-only access (rank >= 5 required)
 * - Validates user authentication
 * - Safe deletion using MongoDB filters
 * 
 * 🚀 FUTURE ENHANCEMENTS:
 * - Configurable beer production rates
 * - Strategic placement based on bot specialization
 * - Beer base upgrade system
 * - Beer base defense mechanisms
 */
