/**
 * @file lib/factoryService.ts
 * @created 2025-10-17
 * @overview Factory attack, control, and unit production business logic
 */

import { getDatabase } from './mongodb';
import { Factory, AttackResult, Unit, Position, UnitType } from '@/types';
import { ObjectId } from 'mongodb';
import { awardXP, XPAction } from './xpService';

const ATTACK_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between attacks
const UNIT_COST_METAL = 100;
const UNIT_COST_ENERGY = 50;
const BASE_PLAYER_POWER = 100; // Base power for new players

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
    const newFactory: Factory = {
      x,
      y,
      owner: null,
      defense: 500 + Math.floor(Math.random() * 500), // 500-1000 defense
      level: 1, // Factory level (starts at 1)
      slots: 20,
      usedSlots: 0,
      productionRate: 1, // 1 unit per hour
      lastSlotRegen: new Date(), // Initialize with current time
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
        ...(success ? { owner: username, usedSlots: 0 } : {})
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
// - Power calculation: base + rank bonus + unit bonus
// - Success chance capped at 90% for balance
// - Unit production costs 100 Metal + 50 Energy
// - Each factory has 20 slots maximum
// - Units add 50 power each to player strength
// - Factories have randomized defense (500-1000)
// ============================================================
// END OF FILE
// ============================================================
