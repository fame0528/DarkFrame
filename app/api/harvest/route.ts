/**
 * @file app/api/harvest/route.ts
 * @created 2025-10-16
 * @overview Harvest API endpoint for resource and cave tiles
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { harvestResourceTile, getHarvestStatus } from '@/lib/harvestService';
import { harvestCaveTile, harvestForestTile } from '@/lib/caveItemService';
import { Player, Tile, TerrainType } from '@/types';
import { awardXP, XPAction } from '@/lib/xpService';
import { checkDiscoveryDrop } from '@/lib/discoveryService';
import { trackResourcesGathered, trackCaveExplored } from '@/lib/statTrackingService';
import { logger } from '@/lib/logger';
import { logHarvest, logCaveExplore } from '@/lib/activityLogger';
import { updateSession } from '@/lib/sessionTracker';
import { detectResourceHack, detectCooldownViolation } from '@/lib/antiCheatDetector';

/**
 * POST /api/harvest
 * 
 * Harvest the tile at player's current position
 * 
 * Request body:
 * {
 *   username: string
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   message: string,
 *   metalGained?: number,
 *   energyGained?: number,
 *   item?: InventoryItem,
 *   player: Player,
 *   tile: Tile,
 *   harvestStatus: {
 *     canHarvest: boolean,
 *     timeUntilReset: number,
 *     resetPeriod: string
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username } = body;
    
    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      );
    }
    
    // Get player
    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username });
    
    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }
    
    // Get tile at player's current position
    const tilesCollection = await getCollection<Tile>('tiles');
    const tile = await tilesCollection.findOne({
      x: player.currentPosition.x,
      y: player.currentPosition.y
    });
    
    if (!tile) {
      return NextResponse.json(
        { success: false, error: 'Tile not found' },
        { status: 404 }
      );
    }
    
    // Check tile type and harvest accordingly
    let result;
    
    if (tile.terrain === TerrainType.Metal || tile.terrain === TerrainType.Energy) {
      // Harvest resource tile
      result = await harvestResourceTile(username, tile);
    } else if (tile.terrain === TerrainType.Cave) {
      // Harvest cave tile
      result = await harvestCaveTile(username, tile);
    } else if (tile.terrain === TerrainType.Forest) {
      // Harvest forest tile (BETTER loot than caves!)
      result = await harvestForestTile(username, tile);
    } else {
      return NextResponse.json(
        { 
          success: false, 
          error: `This tile (${tile.terrain}) cannot be harvested` 
        },
        { status: 400 }
      );
    }
    
    // Get updated harvest status
    const harvestStatus = await getHarvestStatus(username, tile);
    
    // Check for discovery drop on cave harvests
    let discoveryResult;
    if (result.success && (tile.terrain === TerrainType.Cave || tile.terrain === TerrainType.Forest)) {
      discoveryResult = await checkDiscoveryDrop(username, { x: tile.x, y: tile.y });
    }
    
    // Award XP for successful harvest
    let xpResult;
    if (result.success) {
      // Track resources gathered for achievements
      if ('metalGained' in result || 'energyGained' in result) {
        const totalGained = (result.metalGained || 0) + (result.energyGained || 0);
        await trackResourcesGathered(username, totalGained);
      }
      
      // Track cave exploration for achievements
      if (tile.terrain === TerrainType.Cave || tile.terrain === TerrainType.Forest) {
        await trackCaveExplored(username);
      }
      
      // Log activity for admin tracking
      const sessionId = request.cookies.get('sessionId')?.value || 'unknown';
      
      if (tile.terrain === TerrainType.Cave || tile.terrain === TerrainType.Forest) {
        // Log cave/forest exploration
        await logCaveExplore(
          username,
          sessionId,
          { x: tile.x, y: tile.y },
          'item' in result && result.item ? [result.item.name] : []
        );
      } else if ('metalGained' in result || 'energyGained' in result) {
        // Log resource harvest (only for resource tiles)
        const harvestDuration = 5; // Default cooldown
        const metalGained = 'metalGained' in result ? result.metalGained : 0;
        const energyGained = 'energyGained' in result ? result.energyGained : 0;
        
        await logHarvest(
          username,
          sessionId,
          {
            metal: metalGained || 0,
            energy: energyGained || 0
          },
          { x: tile.x, y: tile.y },
          harvestDuration
        );
        
        // Update session with resources gained
        await updateSession(sessionId, {
          metal: metalGained || 0,
          energy: energyGained || 0
        });
        
        // Anti-cheat: Check for resource hacking
        const totalGained = (metalGained || 0) + (energyGained || 0);
        if (totalGained > 0) {
          const resourceCheck = await detectResourceHack(
            username,
            (metalGained || 0) > (energyGained || 0) ? 'metal' : 'energy',
            totalGained,
            (player as any).tier || 1
          );
          
          if (resourceCheck.suspicious) {
            console.warn(`⚠️ Resource hack detected for ${username}:`, resourceCheck.evidence);
          }
        }
        
        // Anti-cheat: Check for cooldown violations
        const cooldownCheck = await detectCooldownViolation(
          username,
          'harvest',
          Date.now()
        );
        
        if (cooldownCheck.suspicious) {
          console.warn(`⚠️ Cooldown violation detected for ${username}:`, cooldownCheck.evidence);
        }
      }
      
      if (tile.terrain === TerrainType.Cave) {
        // Cave exploration XP
        xpResult = await awardXP(username, XPAction.CAVE_EXPLORATION);
        
        // Bonus XP if rare/legendary item found
        if ('item' in result && result.item) {
          const itemRarity = result.item.rarity;
          if (itemRarity === 'LEGENDARY') {
            await awardXP(username, XPAction.CAVE_ITEM_LEGENDARY);
          } else if (itemRarity === 'RARE') {
            await awardXP(username, XPAction.CAVE_ITEM_RARE);
          }
        }
      } else {
        // Resource harvesting XP
        xpResult = await awardXP(username, XPAction.HARVEST_RESOURCE);
      }
    }
    
    // Get updated player data (includes new XP/level and discoveries)
    const updatedPlayer = await playersCollection.findOne({ username });
    
    return NextResponse.json({
      success: result.success,
      message: result.message,
      metalGained: 'metalGained' in result ? result.metalGained : undefined,
      energyGained: 'energyGained' in result ? result.energyGained : undefined,
      item: 'item' in result ? result.item : undefined,
      bonusApplied: 'bonusApplied' in result ? result.bonusApplied : undefined,
      xpAwarded: xpResult?.xpAwarded,
      levelUp: xpResult?.levelUp,
      newLevel: xpResult?.newLevel,
      discovery: discoveryResult?.isNew ? discoveryResult.discovery : undefined,
      totalDiscoveries: discoveryResult?.totalDiscoveries,
      player: updatedPlayer,
      tile,
      harvestStatus
    });
    
  } catch (error) {
    logger.error('Error in harvest API', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process harvest request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Unified endpoint for metal, energy, and cave harvesting
// - Returns updated player data and harvest status
// - Validates player position and tile type
// - Handles errors gracefully with detailed messages
// ============================================================
// END OF FILE
// ============================================================
