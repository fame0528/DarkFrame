/**
 * @file lib/factoryService.ts
 * @created 2025-10-17
 * @updated 2025-11-04 - Phase 5: Added passive income system (hourly resource generation)
 * @overview Factory attack, control, unit production, and passive income business logic
 * 
 * PASSIVE INCOME SYSTEM (NEW):
 * - Hourly resource generation for factory owners
 * - Metal/hour: factoryLevel × 1,000 (Level 1: 1K, Level 10: 10K)
 * - Energy/hour: factoryLevel × 500 (Level 1: 500, Level 10: 5K)
 * - Collection: collectAllFactoryIncome() calculates and awards accumulated resources
 * - Tracking: lastResourceGeneration timestamp prevents retroactive income
 * - Minimum interval: 1 minute (prevents spam collection)
 */

import { getDatabase } from './mongodb';
import { Factory, AttackResult, Unit, Position, UnitType } from '@/types';
import { ObjectId } from 'mongodb';
import { awardXP, XPAction } from './xpService';
import { FACTORY_UPGRADE, getMaxSlots, getFactoryDefense } from './factoryUpgradeService';

const ATTACK_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between attacks
const UNIT_COST_METAL = 100;
const UNIT_COST_ENERGY = 50;
const BASE_PLAYER_POWER = 100; // Base power for new players

// PASSIVE INCOME CONSTANTS (NEW: Phase 5 - Factory Passive Income)
const PASSIVE_INCOME_METAL_PER_LEVEL = 1000; // Level 1: 1K/hr, Level 10: 10K/hr
const PASSIVE_INCOME_ENERGY_PER_LEVEL = 500;  // Level 1: 500/hr, Level 10: 5K/hr

/**
 * Calculate hourly passive income rate for a factory
 * 
 * @param factoryLevel - Current factory level (1-10)
 * @returns Object with metal and energy per hour
 * 
 * @example
 * getFactoryIncomeRate(1);  // Returns { metal: 1000, energy: 500 }
 * getFactoryIncomeRate(10); // Returns { metal: 10000, energy: 5000 }
 * 
 * NEW: Phase 5 - Passive income rewards factory ownership
 */
export function getFactoryIncomeRate(factoryLevel: number): { metal: number; energy: number } {
  return {
    metal: factoryLevel * PASSIVE_INCOME_METAL_PER_LEVEL,
    energy: factoryLevel * PASSIVE_INCOME_ENERGY_PER_LEVEL
  };
}

/**
 * Collect accumulated passive income from a factory
 * Calculates resources generated since last collection based on factory level
 * 
 * @param factory - Factory to collect income from
 * @returns Object with collected resources and updated timestamp
 * 
 * @example
 * // Level 10 factory, 2 hours since last collection
 * collectFactoryIncome(factory);
 * // Returns: { metal: 20000, energy: 10000, hoursElapsed: 2 }
 * 
 * NEW: Phase 5 - Hourly resource generation for factory owners
 */
export function calculateFactoryIncome(factory: Factory): {
  metal: number;
  energy: number;
  hoursElapsed: number;
} {
  // If no lastResourceGeneration, initialize to now (no retroactive income)
  if (!factory.lastResourceGeneration) {
    return { metal: 0, energy: 0, hoursElapsed: 0 };
  }

  // Calculate time elapsed since last collection
  const now = new Date();
  const lastCollection = new Date(factory.lastResourceGeneration);
  const msElapsed = now.getTime() - lastCollection.getTime();
  const hoursElapsed = msElapsed / (1000 * 60 * 60); // Convert ms to hours

  // No income if less than 1 minute elapsed (prevents spam)
  if (hoursElapsed < 0.0167) { // 1 minute = 0.0167 hours
    return { metal: 0, energy: 0, hoursElapsed: 0 };
  }

  // Calculate income based on factory level and time elapsed
  const hourlyRate = getFactoryIncomeRate(factory.level);
  const metal = Math.floor(hourlyRate.metal * hoursElapsed);
  const energy = Math.floor(hourlyRate.energy * hoursElapsed);

  return { metal, energy, hoursElapsed };
}

/**
 * Collect passive income from all player-owned factories
 * Updates player resources and factory lastResourceGeneration timestamps
 * 
 * @param username - Player username
 * @returns Object with total collected resources and factory count
 * 
 * @example
 * await collectAllFactoryIncome('Player1');
 * // Returns: { totalMetal: 25000, totalEnergy: 12500, factoriesCollected: 3 }
 * 
 * NEW: Phase 5 - Batch collection for all owned factories
 */
export async function collectAllFactoryIncome(username: string): Promise<{
  totalMetal: number;
  totalEnergy: number;
  factoriesCollected: number;
  factories: Array<{
    position: { x: number; y: number };
    level: number;
    metal: number;
    energy: number;
    hoursElapsed: number;
  }>;
}> {
  const db = await getDatabase();

  // Get all factories owned by player
  const factories = await db.collection('factories')
    .find({ owner: username })
    .toArray();

  if (factories.length === 0) {
    return {
      totalMetal: 0,
      totalEnergy: 0,
      factoriesCollected: 0,
      factories: []
    };
  }

  let totalMetal = 0;
  let totalEnergy = 0;
  const factoryDetails = [];

  // Calculate income for each factory
  for (const factory of factories) {
    const income = calculateFactoryIncome(factory as unknown as Factory);
    
    if (income.metal > 0 || income.energy > 0) {
      totalMetal += income.metal;
      totalEnergy += income.energy;

      factoryDetails.push({
        position: { x: factory.x, y: factory.y },
        level: factory.level,
        metal: income.metal,
        energy: income.energy,
        hoursElapsed: income.hoursElapsed
      });

      // Update factory's lastResourceGeneration timestamp
      await db.collection('factories').updateOne(
        { x: factory.x, y: factory.y },
        { $set: { lastResourceGeneration: new Date() } }
      );
    }
  }

  // Award resources to player
  if (totalMetal > 0 || totalEnergy > 0) {
    await db.collection('players').updateOne(
      { username },
      {
        $inc: {
          'resources.metal': totalMetal,
          'resources.energy': totalEnergy
        }
      }
    );

    console.log(`💰 ${username} collected passive income: ${totalMetal.toLocaleString()} Metal, ${totalEnergy.toLocaleString()} Energy from ${factoryDetails.length} factories`);
  }

  return {
    totalMetal,
    totalEnergy,
    factoriesCollected: factoryDetails.length,
    factories: factoryDetails
  };
}

/**
 * Calculate player's total power for attack
 * Based on: base power + (units owned * unit power) + level bonuses
 */
export async function calculatePlayerPower(username: string): Promise<number> {
  const db = await getDatabase();
  const player = await db.collection('players').findOne({ username });
  
  if (!player) return BASE_PLAYER_POWER;
  
  // Base power
  let power = BASE_PLAYER_POWER;
  
  // Add power from rank/level (10 power per rank)
  power += (player.rank || 1) * 10;
  
  // Add power from player's total military strength (PRIMARY POWER SOURCE)
  // totalStrength comes from all units' STR stats combined
  if (player.totalStrength) {
    power += player.totalStrength;
  }
  
  // Add power from units in inventory (secondary bonus)
  if (player.inventory && player.inventory.items) {
    const units = player.inventory.items.filter((item: any) => item.type === 'UNIT');
    power += units.length * 50; // Each unit adds 50 power
  }
  
  return power;
}

/**
 * Get or create factory data for a tile
 */
export async function getFactoryData(x: number, y: number): Promise<Factory | null> {
  const db = await getDatabase();
  
  let factory = await db.collection('factories').findOne({ x, y });
  
  // Create factory if it doesn't exist
  if (!factory) {
    const level = 1; // All new factories start at Level 1
    const newFactory: Factory = {
      x,
      y,
      owner: null,
      defense: getFactoryDefense(level), // Level 1: 1,000 defense (exponential scaling)
      level: level,
      slots: getMaxSlots(level), // Level 1: 5,000 slots
      usedSlots: 0,
      productionRate: 1, // 1 unit per hour
      lastSlotRegen: new Date(), // Initialize with current time
      lastResourceGeneration: new Date(), // NEW: Initialize passive income tracking
      lastAttackedBy: null,
      lastAttackTime: null
    };
    
    await db.collection('factories').insertOne(newFactory);
    return newFactory;
  }
  
  return factory as unknown as Factory;
}

/**
 * Attack a factory
 * Success chance based on player power vs factory defense
 */
export async function attackFactory(
  username: string,
  x: number,
  y: number
): Promise<AttackResult> {
  const db = await getDatabase();
  
  // Get factory data
  const factory = await getFactoryData(x, y);
  if (!factory) {
    return {
      success: false,
      message: 'Factory not found',
      playerPower: 0,
      factoryDefense: 0,
      captured: false
    };
  }
  
  // Check if already owned by player
  if (factory.owner === username) {
    return {
      success: false,
      message: 'You already control this factory!',
      playerPower: 0,
      factoryDefense: factory.defense,
      captured: false
    };
  }
  
  // Enforce max factories per player before capture attempt
  // If the player already controls the maximum allowed number of factories,
  // block the capture and return a clear message. This ensures balance and
  // prevents exceeding the strategic cap.
  const ownedCount = await db.collection('factories').countDocuments({ owner: username });
  if (ownedCount >= FACTORY_UPGRADE.MAX_FACTORIES_PER_PLAYER) {
    return {
      success: false,
      message: `You already control ${ownedCount} factories (max ${FACTORY_UPGRADE.MAX_FACTORIES_PER_PLAYER}). Abandon one to capture another.`,
      playerPower: 0,
      factoryDefense: factory.defense,
      captured: false
    };
  }
  
  // Check cooldown
  if (factory.lastAttackedBy === username && factory.lastAttackTime) {
    const timeSinceLastAttack = Date.now() - new Date(factory.lastAttackTime).getTime();
    if (timeSinceLastAttack < ATTACK_COOLDOWN_MS) {
      const minutesLeft = Math.ceil((ATTACK_COOLDOWN_MS - timeSinceLastAttack) / 60000);
      return {
        success: false,
        message: `You must wait ${minutesLeft} minutes before attacking this factory again`,
        playerPower: 0,
        factoryDefense: factory.defense,
        captured: false
      };
    }
  }
  
  // Calculate power
  const playerPower = await calculatePlayerPower(username);
  
  // Attack calculation: (player power / factory defense) with RNG
  const successChance = Math.min(0.9, playerPower / factory.defense); // Max 90% chance
  const attackRoll = Math.random();
  const success = attackRoll < successChance;
  
  // Update factory
  await db.collection('factories').updateOne(
    { x, y },
    {
      $set: {
        lastAttackedBy: username,
        lastAttackTime: new Date(),
        ...(success ? { 
          owner: username, 
          usedSlots: 0,
          lastResourceGeneration: new Date() // NEW: Initialize passive income on capture
        } : {})
      }
    }
  );
  
  if (success) {
    console.log(`✅ ${username} captured factory at (${x}, ${y})! Power: ${playerPower} vs Defense: ${factory.defense}`);
    
    // Award XP for factory capture
    const xpResult = await awardXP(username, XPAction.FACTORY_CAPTURE);
    
    return {
      success: true,
      message: `Victory! You have captured the factory!\n\nYour Power: ${playerPower.toLocaleString()}\nFactory Defense: ${factory.defense.toLocaleString()}\n\nThe factory is now producing units for you.`,
      playerPower,
      factoryDefense: factory.defense,
      captured: true,
      xpAwarded: xpResult.xpAwarded,
      levelUp: xpResult.levelUp,
      newLevel: xpResult.newLevel
    };
  } else {
    console.log(`❌ ${username} failed to capture factory at (${x}, ${y}). Power: ${playerPower} vs Defense: ${factory.defense}`);
    return {
      success: false,
      message: `Attack failed!\n\nYour Power: ${playerPower.toLocaleString()}\nFactory Defense: ${factory.defense.toLocaleString()}\n\nYou need more units or a higher rank to capture this factory.`,
      playerPower,
      factoryDefense: factory.defense,
      captured: false
    };
  }
}

/**
 * Produce units at a controlled factory
 * Costs resources and adds unit to player inventory
 */
export async function produceUnit(
  username: string,
  x: number,
  y: number
): Promise<{ success: boolean; message: string; unit?: Unit }> {
  const db = await getDatabase();
  
  // Get factory
  const factory = await getFactoryData(x, y);
  if (!factory) {
    return { success: false, message: 'Factory not found' };
  }
  
  // Check ownership
  if (factory.owner !== username) {
    return { success: false, message: 'You do not control this factory' };
  }
  
  // Check slots
  if (factory.usedSlots >= factory.slots) {
    return { success: false, message: 'Factory is at maximum capacity' };
  }
  
  // Get player
  const player = await db.collection('players').findOne({ username });
  if (!player) {
    return { success: false, message: 'Player not found' };
  }
  
  // Check resources
  if (player.resources.metal < UNIT_COST_METAL || player.resources.energy < UNIT_COST_ENERGY) {
    return {
      success: false,
      message: `Insufficient resources. Need ${UNIT_COST_METAL} Metal and ${UNIT_COST_ENERGY} Energy`
    };
  }
  
  // Create unit
  const unit: Unit = {
    id: new ObjectId().toString(),
    type: UnitType.T1_Rifleman, // Default Tier 1 unit
    strength: 5, // T1_Rifleman STR
    defense: 0,  // T1_Rifleman is STR unit, no DEF
    producedAt: { x, y },
    producedDate: new Date(),
    owner: username
  };
  
  // Update player: deduct resources, add unit to inventory
  await db.collection('players').updateOne(
    { username },
    {
      $inc: {
        'resources.metal': -UNIT_COST_METAL,
        'resources.energy': -UNIT_COST_ENERGY
      },
      $push: {
        'inventory.items': unit as any // MongoDB type workaround
      }
    }
  );
  
  // Update factory: increment used slots
  await db.collection('factories').updateOne(
    { x, y },
    {
      $inc: { usedSlots: 1 }
    }
  );
  
  console.log(`🏭 ${username} produced unit at factory (${x}, ${y})`);
  
  return {
    success: true,
    message: `Unit produced successfully!\n\nCost: ${UNIT_COST_METAL} Metal + ${UNIT_COST_ENERGY} Energy\nSlots used: ${factory.usedSlots + 1}/${factory.slots}`,
    unit
  };
}

/**
 * Get all factories controlled by a player
 */
export async function getPlayerFactories(username: string): Promise<Factory[]> {
  const db = await getDatabase();
  
  const factories = await db.collection('factories')
    .find({ owner: username })
    .toArray();
  
  return factories as unknown as Factory[];
}

/**
 * Get total unit count for a player
 */
export async function getPlayerUnitCount(username: string): Promise<number> {
  const db = await getDatabase();
  
  const player = await db.collection('players').findOne({ username });
  if (!player || !player.inventory || !player.inventory.items) return 0;
  
  const units = player.inventory.items.filter((item: any) => item.type === 'UNIT');
  return units.length;
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Attack cooldown prevents spam (5 minutes)
// - Power calculation: base + rank bonus + totalStrength + unit bonus
// - Success chance capped at 90% for balance
// - Unit production costs 100 Metal + 50 Energy
// - Factories have exponential defense scaling:
//   * Level 1: 1,000 defense (accessible)
//   * Level 2+: (level-1)² × 50,000 (exponential)
//   * Level 10: 4,050,000 defense (end-game challenge)
// - PASSIVE INCOME SYSTEM (NEW: Phase 5):
//   * Hourly generation: Level × 1,000 Metal, Level × 500 Energy
//   * Level 1 factory: 1K metal/hr, 500 energy/hr
//   * Level 10 factory: 10K metal/hr, 5K energy/hr
//   * Collection: Automatic via collectAllFactoryIncome()
//   * Tracking: lastResourceGeneration timestamp per factory
//   * Minimum collection interval: 1 minute (prevents spam)
// ============================================================
// END OF FILE
// ============================================================
