/**
 * @file lib/harvestService.ts
 * @created 2025-10-16
 * @overview Resource harvesting service with reset period tracking
 * 
 * OVERVIEW:
 * Handles metal/energy/cave tile harvesting with per-player tracking and 12-hour
 * split reset cycles. Implements diminishing returns for digger items and
 * applies gathering bonuses to final harvest amounts.
 */

import { getCollection } from './mongodb';
import { 
  Player, 
  Tile, 
  TerrainType, 
  GAME_CONSTANTS,
  HarvestRecord 
} from '@/types';
import { getHarvestSuccessMessage } from './harvestMessages';

/**
 * Harvest result interface
 */
export interface HarvestResult {
  success: boolean;
  message: string;
  metalGained?: number;
  energyGained?: number;
  itemFound?: any; // Will be defined in CaveItemService
  updatedPlayer?: Player;
}

/**
 * Get current reset period identifier for a tile
 * 
 * Tiles 1-75 reset at midnight (12:00 AM)
 * Tiles 76-150 reset at noon (12:00 PM)
 * 
 * @param x - Tile X coordinate
 * @returns Reset period string like "2025-10-16-AM" or "2025-10-16-PM"
 * 
 * @example
 * ```typescript
 * getCurrentResetPeriod(50); // "2025-10-16-AM"
 * getCurrentResetPeriod(100); // "2025-10-16-PM"
 * ```
 */
export function getCurrentResetPeriod(x: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateString = `${year}-${month}-${day}`;
  
  if (x >= 1 && x <= 75) {
    // These tiles reset at midnight
    return `${dateString}-AM`;
  } else {
    // These tiles reset at noon
    return `${dateString}-PM`;
  }
}

/**
 * Get time until next reset for a tile
 * 
 * @param x - Tile X coordinate
 * @returns Milliseconds until next reset
 * 
 * @example
 * ```typescript
 * const ms = getTimeUntilReset(50);
 * const hours = Math.floor(ms / (1000 * 60 * 60));
 * ```
 */
export function getTimeUntilReset(x: number): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (x >= 1 && x <= 75) {
    // Reset at midnight
    const nextReset = new Date(now);
    nextReset.setHours(0, 0, 0, 0);
    
    // If it's already past midnight, next reset is tomorrow midnight
    if (nextReset <= now) {
      nextReset.setDate(nextReset.getDate() + 1);
    }
    
    return nextReset.getTime() - now.getTime();
  } else {
    // Reset at noon
    const nextReset = new Date(now);
    nextReset.setHours(12, 0, 0, 0);
    
    // If it's already past noon, next reset is tomorrow noon
    if (nextReset <= now) {
      nextReset.setDate(nextReset.getDate() + 1);
    }
    
    return nextReset.getTime() - now.getTime();
  }
}

/**
 * Check if a player can harvest a specific tile
 * 
 * Verifies:
 * - Player hasn't harvested this tile in current reset period
 * - Tile is harvestable type (Metal, Energy, or Cave)
 * 
 * @param playerId - Player's username
 * @param tile - Tile to check
 * @returns True if player can harvest, false otherwise
 */
export async function canHarvestTile(
  playerId: string,
  tile: Tile
): Promise<boolean> {
  try {
    // Check if tile is harvestable type
    if (![TerrainType.Metal, TerrainType.Energy, TerrainType.Cave].includes(tile.terrain)) {
      return false;
    }
    
    // Get current reset period
    const currentPeriod = getCurrentResetPeriod(tile.x);
    
    // Check if player has already harvested this tile in current period
    const tilesCollection = await getCollection<Tile>('tiles');
    const tileDoc = await tilesCollection.findOne({ x: tile.x, y: tile.y });
    
    if (!tileDoc || !tileDoc.lastHarvestedBy) {
      return true; // No harvest records, can harvest
    }
    
    const existingHarvest = tileDoc.lastHarvestedBy.find(
      (record: HarvestRecord) => 
        record.playerId === playerId && record.resetPeriod === currentPeriod
    );
    
    return !existingHarvest; // Can harvest if no record found
    
  } catch (error) {
    console.error('❌ Error checking harvest eligibility:', error);
    throw error;
  }
}

/**
 * Calculate harvest amount with bonuses
 * 
 * Applies permanent digger bonuses and temporary boosts
 * 
 * @param baseAmount - Random base amount (800-1500)
 * @param permanentBonus - Percentage bonus from diggers (e.g., 25 = +25%)
 * @param temporaryBonus - Percentage bonus from active boost (e.g., 50 = +50%)
 * @returns Final harvest amount after all bonuses
 * 
 * @example
 * ```typescript
 * const base = 1000;
 * const permanent = 30; // +30% from diggers
 * const temp = 50; // +50% from boost
 * const final = calculateHarvestAmount(base, permanent, temp);
 * // Result: 1000 * (1 + 0.30 + 0.50) = 1,800
 * ```
 */
export function calculateHarvestAmount(
  baseAmount: number,
  permanentBonus: number,
  temporaryBonus: number
): number {
  const multiplier = 1 + (permanentBonus / 100) + (temporaryBonus / 100);
  return Math.floor(baseAmount * multiplier);
}

/**
 * Generate random base harvest amount
 * 
 * @returns Random value between MIN_AMOUNT and MAX_AMOUNT (800-1500)
 */
export function generateBaseHarvestAmount(): number {
  const { MIN_AMOUNT, MAX_AMOUNT } = GAME_CONSTANTS.HARVEST;
  return Math.floor(Math.random() * (MAX_AMOUNT - MIN_AMOUNT + 1)) + MIN_AMOUNT;
}

/**
 * Harvest a metal or energy tile
 * 
 * Adds resources to player's inventory and marks tile as harvested
 * 
 * @param playerId - Player's username
 * @param tile - Tile to harvest
 * @returns Harvest result with amount gained
 */
export async function harvestResourceTile(
  playerId: string,
  tile: Tile
): Promise<HarvestResult> {
  try {
    // Verify tile type
    if (![TerrainType.Metal, TerrainType.Energy].includes(tile.terrain)) {
      return {
        success: false,
        message: 'This tile does not contain harvestable resources'
      };
    }
    
    // Check if can harvest
    const canHarvest = await canHarvestTile(playerId, tile);
    if (!canHarvest) {
      return {
        success: false,
        message: 'You have already harvested this tile. It will reset later.'
      };
    }
    
    // Get player data
    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username: playerId });
    
    if (!player) {
      return {
        success: false,
        message: 'Player not found'
      };
    }
    
    // Generate base amount
    const baseAmount = generateBaseHarvestAmount();
    
    // Get permanent digger bonuses
    const permanentBonus = tile.terrain === TerrainType.Metal 
      ? player.gatheringBonus.metalBonus 
      : player.gatheringBonus.energyBonus;
    
    // Get temporary boost (DEPRECATED - kept for backwards compatibility)
    const temporaryBonus = player.activeBoosts.gatheringBoost || 0;
    
    // Calculate shrine boost from active boosts
    let shrineBonus = 0;
    if (player.shrineBoosts && player.shrineBoosts.length > 0) {
      const now = new Date();
      // Filter out expired boosts and sum yield bonuses
      player.shrineBoosts = player.shrineBoosts.filter(
        boost => new Date(boost.expiresAt) > now
      );
      
      shrineBonus = player.shrineBoosts.reduce((sum, boost) => {
        return sum + (boost.yieldBonus * 100); // Convert 0.25 to 25%
      }, 0);
      
      // Update player to remove expired boosts if any were filtered
      if (player.shrineBoosts.length < (player.shrineBoosts.length || 0)) {
        const playersCollection = await getCollection<Player>('players');
        await playersCollection.updateOne(
          { username: playerId },
          { $set: { shrineBoosts: player.shrineBoosts } }
        );
      }
    }
    
    // Calculate final amount with all bonuses (including shrine boosts)
    let finalAmount = calculateHarvestAmount(baseAmount, permanentBonus, temporaryBonus + shrineBonus);
    
    // Apply balance penalty/bonus to gathering (if player has units)
    if (player.totalStrength || player.totalDefense) {
      const { calculateBalanceEffects, applyBalanceToGathering } = await import('@/lib/balanceService');
      const balanceEffects = calculateBalanceEffects(
        player.totalStrength || 0,
        player.totalDefense || 0
      );
      finalAmount = applyBalanceToGathering(finalAmount, balanceEffects);
    }
    
    // Update player resources
    const resourceUpdate = tile.terrain === TerrainType.Metal
      ? { $inc: { 'resources.metal': finalAmount } }
      : { $inc: { 'resources.energy': finalAmount } };
    
    await playersCollection.updateOne(
      { username: playerId },
      resourceUpdate
    );
    
    // Mark tile as harvested and track daily milestone progress
    const tilesCollection = await getCollection<Tile>('tiles');
    const currentPeriod = getCurrentResetPeriod(tile.x);
    
    await tilesCollection.updateOne(
      { x: tile.x, y: tile.y },
      {
        $push: {
          lastHarvestedBy: {
            playerId,
            timestamp: new Date(),
            resetPeriod: currentPeriod
          }
        }
      }
    );
    
    // Track daily harvest milestone progress and award RP
    try {
      const { checkDailyHarvestMilestone } = await import('./researchPointService');
      const milestoneResult = await checkDailyHarvestMilestone(playerId, currentPeriod);
      
      if (milestoneResult.milestoneReached) {
        console.log(`🎯 Milestone reached: ${playerId} earned ${milestoneResult.rpAwarded} RP at ${milestoneResult.milestoneThreshold} harvests`);
      }
    } catch (error) {
      console.error('❌ Error checking harvest milestone:', error);
      // Don't fail harvest if milestone check fails
    }
    
    // Get updated player
    const updatedPlayer = await playersCollection.findOne({ username: playerId });
    
    // Generate success message
    const successMessage = getHarvestSuccessMessage(tile.terrain, finalAmount);
    
    const result: HarvestResult = {
      success: true,
      message: successMessage,
      updatedPlayer: updatedPlayer || undefined
    };
    
    if (tile.terrain === TerrainType.Metal) {
      result.metalGained = finalAmount;
    } else {
      result.energyGained = finalAmount;
    }
    
    console.log(`✅ Player ${playerId} harvested ${finalAmount} ${tile.terrain} at (${tile.x}, ${tile.y})`);
    
    return result;
    
  } catch (error) {
    console.error('❌ Error harvesting resource tile:', error);
    return {
      success: false,
      message: 'An error occurred while harvesting'
    };
  }
}

/**
 * Get harvest status for a tile
 * 
 * @param playerId - Player's username
 * @param tile - Tile to check
 * @returns Object with harvest availability info
 */
export async function getHarvestStatus(
  playerId: string,
  tile: Tile
): Promise<{
  canHarvest: boolean;
  timeUntilReset: number;
  resetPeriod: string;
}> {
  try {
    const canHarvest = await canHarvestTile(playerId, tile);
    const timeUntilReset = getTimeUntilReset(tile.x);
    const resetPeriod = getCurrentResetPeriod(tile.x);
    
    return {
      canHarvest,
      timeUntilReset,
      resetPeriod
    };
  } catch (error) {
    console.error('❌ Error getting harvest status:', error);
    throw error;
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Reset periods calculated based on server time
// - Tiles 1-75 reset at 00:00, tiles 76-150 reset at 12:00
// - Per-player harvest tracking prevents farming same tile multiple times
// - Bonuses stack: permanent + temporary
// - Cave tile harvesting handled by CaveItemService
// - Reset scheduler will clean old harvest records periodically
// ============================================================
// END OF FILE
// ============================================================
