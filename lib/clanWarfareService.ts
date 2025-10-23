/**
 * @fileoverview Clan Warfare Service
 * @module lib/clanWarfareService
 * 
 * Created: 2025-01-XX
 * 
 * OVERVIEW:
 * Manages clan warfare mechanics including war declaration, territory capture during wars,
 * war history tracking, and battle integration. Implements cooldown periods, cost systems
 * with perk reductions, and comprehensive war state management.
 * 
 * Key Features:
 * - War Declaration: Clans can declare war on other clans with resource cost and level requirement
 * - Territory Capture: During active wars, territories can be captured from enemy clans
 * - War States: DECLARED → ACTIVE → ENDED (WIN/LOSS/TRUCE)
 * - Cost Reduction: Perk-based reductions for war declaration costs
 * - War History: Comprehensive tracking of all clan wars with outcomes
 * - Cooldown System: Prevents immediate re-declaration after war ends
 * - Stats Integration: Updates warsWon, warsLost, territoriesCaptured stats
 * 
 * Dependencies:
 * - MongoDB collections: clans, clan_wars, clan_activities
 * - Territory service for territory ownership transfers
 * - Clan service for member and perk data
 * - Activity logging for war events
 * 
 * Business Rules:
 * - War Declaration Cost: 2000 Metal + 2000 Energy (reduced by territory_cost perks)
 * - Level Requirement: Clan level 5+ to declare war
 * - Active War Limit: 1 active war per clan pair at a time
 * - Territory Capture: Only during ACTIVE war state
 * - War Duration: Minimum 24 hours before ending
 * - Cooldown: 48 hours before same clans can war again
 * - Permissions: Leader, Co-Leader, or Officer can declare/end wars
 */

import { MongoClient, Db, ObjectId } from 'mongodb';
import type { Clan, ClanMember, ClanWar } from '@/types/clan.types';
import { ClanWarStatus } from '@/types/clan.types';

// ============================================================================
// MODULE STATE
// ============================================================================

let mongoClient: MongoClient;
let db: Db;

/**
 * Initialize the warfare service with database connection
 * @param client - MongoDB client instance
 * @param database - MongoDB database instance
 */
export function initializeWarfareService(client: MongoClient, database: Db): void {
  mongoClient = client;
  db = database;
}

/**
 * Get database instance (lazy initialization)
 * @returns MongoDB database instance
 */
function getDb(): Db {
  if (!db) {
    throw new Error('Warfare service not initialized. Call initializeWarfareService first.');
  }
  return db;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Warfare system configuration constants
 * Can be overridden by admin settings in warfareConfig collection
 */
export const WAR_CONSTANTS = {
  /** Base cost to declare war (Metal) - EXPENSIVE to make wars meaningful */
  BASE_WAR_COST_METAL: 50000, // 50K Metal (increased from 2K)
  
  /** Base cost to declare war (Energy) - EXPENSIVE to make wars meaningful */
  BASE_WAR_COST_ENERGY: 50000, // 50K Energy (increased from 2K)
  
  /** Minimum clan level to declare war */
  MIN_LEVEL_TO_DECLARE_WAR: 10, // Increased from 5
  
  /** Minimum war duration in hours */
  MIN_WAR_DURATION_HOURS: 48, // Increased from 24 (2 days minimum)
  
  /** Cooldown period between wars (hours) */
  WAR_COOLDOWN_HOURS: 168, // 7 days (increased from 48 hours)
  
  /** Territory capture during war - success rate */
  BASE_CAPTURE_SUCCESS_RATE: 0.7, // 70% base success
  
  /** Defense bonus impact on capture rate */
  DEFENSE_BONUS_IMPACT: 0.5, // 50% of defense bonus reduces capture rate
  
  /** War reward: Percentage of loser's clan bank resources */
  WAR_SPOILS_METAL_PERCENT: 15, // 15% of losing clan's Metal
  WAR_SPOILS_ENERGY_PERCENT: 15, // 15% of losing clan's Energy
  
  /** War reward: Percentage of loser's Research Points */
  WAR_SPOILS_RP_PERCENT: 10, // 10% of losing clan's RP
  
  /** War reward: XP bonus for winning clan */
  WAR_VICTORY_XP_BONUS: 50000, // 50K XP to winning clan
  
  /** War penalty: XP loss for losing clan */
  WAR_DEFEAT_XP_PENALTY: 25000, // 25K XP lost
} as const;

// ============================================================================
// WAR DECLARATION
// ============================================================================

/**
 * Declare war on another clan
 * 
 * Business Logic:
 * 1. Validate permissions (Leader/Officer)
 * 2. Check clan level requirement (5+)
 * 3. Verify no existing active war between clans
 * 4. Check cooldown period from previous wars
 * 5. Calculate war cost with perk reductions
 * 6. Deduct cost from clan bank
 * 7. Create war record with DECLARED status
 * 8. Log war declaration activity for both clans
 * 9. Update clan stats (totalWars incremented)
 * 
 * @param clanId - Declaring clan ID
 * @param targetClanId - Target clan ID
 * @param playerId - Player declaring war (must be Leader/Officer)
 * @returns War details including warId and cost
 * @throws Error if validation fails or insufficient resources
 */
export async function declareWar(
  clanId: string,
  targetClanId: string,
  playerId: string
): Promise<{
  war: ClanWar;
  cost: { metal: number; energy: number };
  message: string;
}> {
  const database = getDb();
  const clansCollection = database.collection<Clan>('clans');
  const warsCollection = database.collection<ClanWar>('clan_wars');
  const activitiesCollection = database.collection('clan_activities');

  // Get both clans
  const [clan, targetClan] = await Promise.all([
    clansCollection.findOne({ _id: new ObjectId(clanId) }),
    clansCollection.findOne({ _id: new ObjectId(targetClanId) }),
  ]);

  if (!clan) throw new Error('Declaring clan not found');
  if (!targetClan) throw new Error('Target clan not found');
  if (clanId === targetClanId) throw new Error('Cannot declare war on your own clan');

  // Validate permissions
  const member = clan.members.find((m) => m.playerId === playerId);
  if (!member) throw new Error('Player not in clan');
  if (!['LEADER', 'CO_LEADER', 'OFFICER'].includes(member.role)) {
    throw new Error('Only Leaders, Co-Leaders, and Officers can declare war');
  }

  // Check level requirement
  if (clan.level.currentLevel < WAR_CONSTANTS.MIN_LEVEL_TO_DECLARE_WAR) {
    throw new Error(
      `Clan level ${WAR_CONSTANTS.MIN_LEVEL_TO_DECLARE_WAR} required to declare war (current: ${clan.level.currentLevel})`
    );
  }

  // Check for existing active wars
  const existingWar = await warsCollection.findOne({
    $or: [
      { attackerClanId: clanId, defenderClanId: targetClanId, status: { $in: [ClanWarStatus.DECLARED, ClanWarStatus.ACTIVE] } },
      { attackerClanId: targetClanId, defenderClanId: clanId, status: { $in: [ClanWarStatus.DECLARED, ClanWarStatus.ACTIVE] } },
    ],
  } as any); // MongoDB filter type issue with enum

  if (existingWar) {
    throw new Error('An active war already exists between these clans');
  }

  // Check cooldown period
  const cooldownEnd = new Date(Date.now() - WAR_CONSTANTS.WAR_COOLDOWN_HOURS * 60 * 60 * 1000);
  const recentWar = await warsCollection.findOne({
    $or: [
      { attackerClanId: clanId, defenderClanId: targetClanId },
      { attackerClanId: targetClanId, defenderClanId: clanId },
    ],
    endedAt: { $gte: cooldownEnd },
  });

  if (recentWar) {
    const cooldownRemaining = Math.ceil(
      (recentWar.endedAt!.getTime() + WAR_CONSTANTS.WAR_COOLDOWN_HOURS * 60 * 60 * 1000 - Date.now()) / (60 * 60 * 1000)
    );
    throw new Error(`War cooldown active. ${cooldownRemaining} hours remaining.`);
  }

  // Calculate war cost with perk reductions (using territory_cost perks)
  let costReduction = 0;
  for (const perk of clan.activePerks || []) {
    if (perk.bonus?.type === 'territory_cost') {
      costReduction += perk.bonus.value;
    }
  }

  const baseCost = {
    metal: WAR_CONSTANTS.BASE_WAR_COST_METAL,
    energy: WAR_CONSTANTS.BASE_WAR_COST_ENERGY,
  };

  const finalCost = {
    metal: Math.floor(baseCost.metal * (1 - costReduction / 100)),
    energy: Math.floor(baseCost.energy * (1 - costReduction / 100)),
  };

  // Validate bank balance
  const currentMetal = clan.bank?.treasury?.metal || 0;
  const currentEnergy = clan.bank?.treasury?.energy || 0;

  if (currentMetal < finalCost.metal) {
    throw new Error(`Insufficient Metal (need ${finalCost.metal}, have ${currentMetal})`);
  }
  if (currentEnergy < finalCost.energy) {
    throw new Error(`Insufficient Energy (need ${finalCost.energy}, have ${currentEnergy})`);
  }

  // Deduct cost from bank
  await clansCollection.updateOne(
    { _id: new ObjectId(clanId) },
    {
      $inc: {
        'bank.treasury.metal': -finalCost.metal,
        'bank.treasury.energy': -finalCost.energy,
        'stats.totalWars': 1,
      },
    }
  );

  // Create war record
  const warDoc: ClanWar = {
    warId: new ObjectId().toString(),
    attackerClanId: clanId,
    defenderClanId: targetClanId,
    status: ClanWarStatus.DECLARED,
    declaredAt: new Date(),
    declarationCost: {
      metal: finalCost.metal,
      energy: finalCost.energy,
    },
    stats: {
      attackerTerritoryGained: 0,
      defenderTerritoryGained: 0,
      attackerBattlesWon: 0,
      defenderBattlesWon: 0,
    },
  };

  await warsCollection.insertOne(warDoc);

  // Get clan tags for logging
  const attackerTag = clan.tag;
  const defenderTag = targetClan.tag;

  // Log war declaration for both clans
  await activitiesCollection.insertMany([
    {
      clanId,
      type: 'WAR_DECLARED',
      message: `${member.username} declared war on [${defenderTag}] ${targetClan.name}`,
      metadata: {
        warId: warDoc.warId,
        targetClanId: targetClanId,
        targetClanTag: defenderTag,
        cost: finalCost,
      },
      timestamp: new Date(),
    },
    {
      clanId: targetClanId,
      type: 'WAR_DECLARED_AGAINST',
      message: `[${attackerTag}] ${clan.name} has declared war!`,
      metadata: {
        warId: warDoc.warId,
        attackerClanId: clanId,
        attackerClanTag: attackerTag,
      },
      timestamp: new Date(),
    },
  ]);

  return {
    war: warDoc,
    cost: finalCost,
    message: `War declared against [${defenderTag}] ${targetClan.name}`,
  };
}

// ============================================================================
// TERRITORY CAPTURE
// ============================================================================

/**
 * Capture territory during an active war
 * 
 * Business Logic:
 * 1. Verify active war exists between clans
 * 2. Confirm territory is owned by enemy clan
 * 3. Calculate capture success based on defense bonuses
 * 4. Transfer territory ownership if successful
 * 5. Update war statistics (stats.attackerTerritoryGained/defenderTerritoryGained)
 * 6. Log capture event for both clans
 * 7. Update clan stats (territoriesCaptured counter)
 * 
 * @param clanId - Capturing clan ID
 * @param targetClanId - Defending clan ID
 * @param tileX - Territory X coordinate
 * @param tileY - Territory Y coordinate
 * @param playerId - Player initiating capture
 * @returns Capture result with success status and details
 * @throws Error if no active war or invalid capture attempt
 */
export async function captureTerritory(
  clanId: string,
  targetClanId: string,
  tileX: number,
  tileY: number,
  playerId: string
): Promise<{
  success: boolean;
  territory?: { tileX: number; tileY: number; clanId: string };
  defenseBonus?: number;
  message: string;
}> {
  const database = getDb();
  const clansCollection = database.collection<Clan>('clans');
  const warsCollection = database.collection<ClanWar>('clan_wars');
  const activitiesCollection = database.collection('clan_activities');

  // Find active war between clans
  const war = await warsCollection.findOne({
    $or: [
      { attackerClanId: clanId, defenderClanId: targetClanId, status: ClanWarStatus.ACTIVE },
      { attackerClanId: targetClanId, defenderClanId: clanId, status: ClanWarStatus.ACTIVE },
    ],
  } as any); // MongoDB filter type issue

  if (!war) {
    throw new Error('No active war exists between these clans');
  }

  // Get both clans
  const [clan, targetClan] = await Promise.all([
    clansCollection.findOne({ _id: new ObjectId(clanId) }),
    clansCollection.findOne({ _id: new ObjectId(targetClanId) }),
  ]);

  if (!clan) throw new Error('Capturing clan not found');
  if (!targetClan) throw new Error('Target clan not found');

  // Validate permissions
  const member = clan.members.find((m) => m.playerId === playerId);
  if (!member) throw new Error('Player not in clan');
  if (!['LEADER', 'CO_LEADER', 'OFFICER'].includes(member.role)) {
    throw new Error('Only Leaders, Co-Leaders, and Officers can capture territories');
  }

  // Check if territory is owned by target clan
  const territoryIndex = targetClan.territories?.findIndex((t) => t.tileX === tileX && t.tileY === tileY);
  if (territoryIndex === undefined || territoryIndex === -1) {
    throw new Error('Territory not owned by target clan');
  }

  // Calculate defense bonus for this territory
  const defenseBonus = calculateDefenseBonus(targetClan.territories || [], tileX, tileY);

  // Calculate capture success rate (base 70% - defense bonus impact)
  const successRate = Math.max(
    0.3, // Minimum 30% chance
    WAR_CONSTANTS.BASE_CAPTURE_SUCCESS_RATE - (defenseBonus / 100) * WAR_CONSTANTS.DEFENSE_BONUS_IMPACT
  );

  const captureSuccessful = Math.random() < successRate;

  if (!captureSuccessful) {
    // Capture failed
    await activitiesCollection.insertMany([
      {
        clanId,
        type: 'TERRITORY_CAPTURE_FAILED',
        message: `${member.username} failed to capture territory (${tileX}, ${tileY}) from [${targetClan.tag}]`,
        metadata: {
          warId: war.warId,
          tileX,
          tileY,
          defenseBonus,
        },
        timestamp: new Date(),
      },
      {
        clanId: targetClanId,
        type: 'TERRITORY_DEFENSE_SUCCESS',
        message: `Successfully defended territory (${tileX}, ${tileY}) against [${clan.tag}]`,
        metadata: {
          warId: war.warId,
          tileX,
          tileY,
          defenseBonus,
        },
        timestamp: new Date(),
      },
    ]);

    return {
      success: false,
      defenseBonus,
      message: `Failed to capture territory. Enemy defense bonus: ${defenseBonus}%`,
    };
  }

  // Capture successful - transfer territory
  const territory = targetClan.territories[territoryIndex];

  // Remove from target clan
  await clansCollection.updateOne(
    { _id: new ObjectId(targetClanId) },
    {
      $pull: { territories: { tileX, tileY } } as any,
      $inc: { 'stats.totalTerritories': -1 },
    }
  );

  // Add to capturing clan
  const newTerritory = {
    clanId,
    tileX,
    tileY,
    claimedAt: new Date(),
    claimedBy: playerId,
    defenseBonus: 0, // Will be recalculated
  };

  await clansCollection.updateOne(
    { _id: new ObjectId(clanId) },
    {
      $push: { territories: newTerritory } as any,
      $inc: {
        'stats.totalTerritories': 1,
        'stats.territoriesCaptured': 1,
      },
    }
  );

  // Update war statistics
  const territoryGainedField = war.attackerClanId === clanId ? 'stats.attackerTerritoryGained' : 'stats.defenderTerritoryGained';
  await warsCollection.updateOne(
    { warId: war.warId },
    {
      $inc: { [territoryGainedField]: 1 },
    }
  );

  // Log capture for both clans
  await activitiesCollection.insertMany([
    {
      clanId,
      type: 'TERRITORY_CAPTURED',
      message: `${member.username} captured territory (${tileX}, ${tileY}) from [${targetClan.tag}]`,
      metadata: {
        warId: war.warId,
        tileX,
        tileY,
        previousOwner: targetClanId,
      },
      timestamp: new Date(),
    },
    {
      clanId: targetClanId,
      type: 'TERRITORY_LOST',
      message: `Lost territory (${tileX}, ${tileY}) to [${clan.tag}] in battle`,
      metadata: {
        warId: war.warId,
        tileX,
        tileY,
        newOwner: clanId,
      },
      timestamp: new Date(),
    },
  ]);

  return {
    success: true,
    territory: { tileX, tileY, clanId },
    defenseBonus,
    message: `Successfully captured territory (${tileX}, ${tileY})!`,
  };
}

// ============================================================================
// WAR MANAGEMENT
// ============================================================================

/**
 * End an active war with outcome
 * 
 * @param warId - War ID to end
 * @param outcome - War outcome ('WIN', 'LOSS', or 'TRUCE')
 * @param endedBy - Player ID ending the war
 * @returns Updated war record
 * @throws Error if war not found or invalid state
 */
export async function endWar(
  warId: string,
  outcome: 'WIN' | 'LOSS' | 'TRUCE',
  endedBy: string
): Promise<ClanWar | null> {
  const database = getDb();
  const warsCollection = database.collection<ClanWar>('clan_wars');
  const clansCollection = database.collection<Clan>('clans');
  const activitiesCollection = database.collection('clan_activities');

  const war = await warsCollection.findOne({ warId });
  if (!war) throw new Error('War not found');

  if (war.status === ClanWarStatus.ENDED) {
    throw new Error('War has already ended');
  }

  // Check minimum duration
  const warDuration = Date.now() - war.declaredAt.getTime();
  const minDuration = WAR_CONSTANTS.MIN_WAR_DURATION_HOURS * 60 * 60 * 1000;
  if (warDuration < minDuration) {
    const hoursRemaining = Math.ceil((minDuration - warDuration) / (60 * 60 * 1000));
    throw new Error(`War must last at least ${WAR_CONSTANTS.MIN_WAR_DURATION_HOURS} hours. ${hoursRemaining} hours remaining.`);
  }

  // Determine winner based on outcome
  const winner = outcome === 'WIN' ? war.attackerClanId : outcome === 'LOSS' ? war.defenderClanId : undefined;

  // Update war record
  const updatedWar = await warsCollection.findOneAndUpdate(
    { warId },
    {
      $set: {
        status: ClanWarStatus.ENDED,
        winner,
        endedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );

  if (!updatedWar) throw new Error('Failed to update war');

  // Update clan stats based on outcome
  if (outcome === 'WIN') {
    await clansCollection.updateOne(
      { _id: new ObjectId(war.attackerClanId) },
      { $inc: { 'stats.warsWon': 1 } }
    );
    await clansCollection.updateOne(
      { _id: new ObjectId(war.defenderClanId) },
      { $inc: { 'stats.warsLost': 1 } }
    );
    
    // Distribute war spoils to winner
    await distributeWarSpoils(updatedWar, war.attackerClanId, war.defenderClanId);
  } else if (outcome === 'LOSS') {
    await clansCollection.updateOne(
      { _id: new ObjectId(war.attackerClanId) },
      { $inc: { 'stats.warsLost': 1 } }
    );
    await clansCollection.updateOne(
      { _id: new ObjectId(war.defenderClanId) },
      { $inc: { 'stats.warsWon': 1 } }
    );
    
    // Distribute war spoils to winner (defender won)
    await distributeWarSpoils(updatedWar, war.defenderClanId, war.attackerClanId);
  }

  // Get clan tags for logging
  const [attackerClan, defenderClan] = await Promise.all([
    clansCollection.findOne({ _id: new ObjectId(war.attackerClanId) }),
    clansCollection.findOne({ _id: new ObjectId(war.defenderClanId) }),
  ]);

  // Log war end for both clans
  const outcomeMessage = outcome === 'TRUCE' ? 'ended in a truce' : outcome === 'WIN' ? 'victorious' : 'defeated';
  await activitiesCollection.insertMany([
    {
      clanId: war.attackerClanId,
      type: 'WAR_ENDED',
      message: `War against [${defenderClan?.tag || 'UNKNOWN'}] ${outcomeMessage}`,
      metadata: {
        warId,
        outcome,
        territoriesCaptured: war.stats.attackerTerritoryGained,
      },
      timestamp: new Date(),
    },
    {
      clanId: war.defenderClanId,
      type: 'WAR_ENDED',
      message: `War with [${attackerClan?.tag || 'UNKNOWN'}] ${outcomeMessage}`,
      metadata: {
        warId,
        outcome: outcome === 'WIN' ? 'LOSS' : outcome === 'LOSS' ? 'WIN' : 'TRUCE',
        territoriesCaptured: war.stats.defenderTerritoryGained,
      },
      timestamp: new Date(),
    },
  ]);

  return updatedWar;
}

/**
 * Get all active wars for a clan
 * 
 * @param clanId - Clan ID
 * @returns Array of active wars
 */
export async function getActiveWars(clanId: string): Promise<ClanWar[]> {
  const database = getDb();
  const warsCollection = database.collection<ClanWar>('clan_wars');

  const wars = await warsCollection
    .find({
      $or: [{ attackerClanId: clanId }, { defenderClanId: clanId }],
      status: { $in: [ClanWarStatus.DECLARED, ClanWarStatus.ACTIVE] },
    } as any) // MongoDB filter type issue
    .sort({ declaredAt: -1 })
    .toArray();

  return wars;
}

/**
 * Get war history for a clan
 * 
 * @param clanId - Clan ID
 * @param limit - Maximum number of wars to return (default 50)
 * @returns Array of past wars
 */
export async function getClanWarHistory(clanId: string, limit = 50): Promise<ClanWar[]> {
  const database = getDb();
  const warsCollection = database.collection<ClanWar>('clan_wars');

  const wars = await warsCollection
    .find({
      $or: [{ attackerClanId: clanId }, { defenderClanId: clanId }],
      status: ClanWarStatus.ENDED,
    } as any) // MongoDB filter type issue
    .sort({ endedAt: -1 })
    .limit(limit)
    .toArray();

  return wars;
}

/**
 * Get specific war by ID
 * 
 * @param warId - War ID
 * @returns War record or null if not found
 */
export async function getWar(warId: string): Promise<ClanWar | null> {
  const database = getDb();
  const warsCollection = database.collection<ClanWar>('clan_wars');

  const war = await warsCollection.findOne({ warId });
  return war;
}

/**
 * Calculate war spoils from defeated clan
 * Takes percentage of losing clan's bank resources and RP
 * 
 * @param winnerClanId - ID of winning clan
 * @param loserClanId - ID of losing clan
 * @returns Spoils amounts (metal, energy, rp)
 * @example
 * const spoils = await calculateWarSpoils('winnerClan', 'loserClan');
 * // Returns: { metal: 75000, energy: 60000, rp: 10000 }
 */
export async function calculateWarSpoils(
  winnerClanId: string,
  loserClanId: string
): Promise<{
  metal: number;
  energy: number;
  rp: number;
}> {
  const database = getDb();
  const clansCollection = database.collection('clans');
  
  const loserClan = await clansCollection.findOne({ _id: new ObjectId(loserClanId) });
  if (!loserClan) {
    return { metal: 0, energy: 0, rp: 0 };
  }
  
  const loserMetal = loserClan.bank?.treasury?.metal || 0;
  const loserEnergy = loserClan.bank?.treasury?.energy || 0;
  const loserRP = loserClan.bank?.treasury?.rp || 0;
  
  const metalSpoils = Math.floor(loserMetal * (WAR_CONSTANTS.WAR_SPOILS_METAL_PERCENT / 100));
  const energySpoils = Math.floor(loserEnergy * (WAR_CONSTANTS.WAR_SPOILS_ENERGY_PERCENT / 100));
  const rpSpoils = Math.floor(loserRP * (WAR_CONSTANTS.WAR_SPOILS_RP_PERCENT / 100));
  
  return {
    metal: metalSpoils,
    energy: energySpoils,
    rp: rpSpoils,
  };
}

/**
 * Check war objectives and calculate bonus rewards
 * 
 * @param war - Completed war record
 * @returns Bonus rewards based on objectives achieved
 * @example
 * const bonuses = checkWarObjectives(completedWar);
 * // Returns: { metalBonus: 18750, energyBonus: 15000, rpBonus: 10000, xpBonus: 25000, objectivesAchieved: [...] }
 */
export function checkWarObjectives(war: ClanWar): {
  metalBonus: number;
  energyBonus: number;
  rpBonus: number;
  xpBonus: number;
  objectivesAchieved: string[];
} {
  const bonuses = {
    metalBonus: 0,
    energyBonus: 0,
    rpBonus: 0,
    xpBonus: 0,
    objectivesAchieved: [] as string[],
  };
  
  // Objective 1: Conquest Victory (20+ territories captured)
  const territoriesCaptured = war.stats.attackerTerritoryGained || 0;
  if (territoriesCaptured >= 20) {
    bonuses.objectivesAchieved.push('CONQUEST_VICTORY');
    // Bonus: +25% spoils (calculated as percentage increase on base spoils)
    // This will be applied when distributing spoils
  }
  
  // Objective 2: Blitzkrieg (<3 days to complete)
  const warDuration = (war.endedAt?.getTime() || Date.now()) - war.declaredAt.getTime();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  if (warDuration < threeDaysMs) {
    bonuses.objectivesAchieved.push('BLITZKRIEG');
    bonuses.rpBonus += 10000; // +10K RP bonus
  }
  
  // Objective 3: Decisive Victory (0 territories lost to defender)
  const defenderTerritoryGained = war.stats.defenderTerritoryGained || 0;
  if (defenderTerritoryGained === 0 && territoriesCaptured > 0) {
    bonuses.objectivesAchieved.push('DECISIVE_VICTORY');
    bonuses.xpBonus += 25000; // +25K XP bonus
  }
  
  // Objective 4: Strategic Domination (captured 10+ high-value territories)
  // For now, simplified to any 10+ territories
  if (territoriesCaptured >= 10) {
    bonuses.objectivesAchieved.push('STRATEGIC_DOMINATION');
    // Note: Double passive income for 7 days would be tracked separately
  }
  
  return bonuses;
}

/**
 * Distribute war spoils and bonuses to winner
 * Called automatically when war ends with a winner
 * 
 * @param war - Completed war record
 * @param winnerId - ID of winning clan
 * @param loserId - ID of losing clan
 * @returns Distribution result
 * @example
 * await distributeWarSpoils(war, winnerClanId, loserClanId);
 */
export async function distributeWarSpoils(
  war: ClanWar,
  winnerId: string,
  loserId: string
): Promise<{
  success: boolean;
  spoils: { metal: number; energy: number; rp: number };
  bonuses: { metal: number; energy: number; rp: number; xp: number };
  objectivesAchieved: string[];
  message: string;
}> {
  const database = getDb();
  const clansCollection = database.collection('clans');
  
  try {
    // Calculate base spoils
    const baseSpoils = await calculateWarSpoils(winnerId, loserId);
    
    // Check objectives for bonuses
    const objectiveResults = checkWarObjectives(war);
    
    // Apply conquest victory bonus (+25% to spoils)
    let finalMetal = baseSpoils.metal;
    let finalEnergy = baseSpoils.energy;
    let finalRP = baseSpoils.rp;
    
    if (objectiveResults.objectivesAchieved.includes('CONQUEST_VICTORY')) {
      finalMetal = Math.floor(finalMetal * 1.25);
      finalEnergy = Math.floor(finalEnergy * 1.25);
    }
    
    // Add objective bonuses
    finalRP += objectiveResults.rpBonus;
    
    // Transfer resources from loser to winner
    const updateResult = await clansCollection.bulkWrite([
      // Deduct from loser
      {
        updateOne: {
          filter: { _id: new ObjectId(loserId) },
          update: {
            $inc: {
              'bank.treasury.metal': -finalMetal,
              'bank.treasury.energy': -finalEnergy,
              'bank.treasury.rp': -finalRP,
              xp: -WAR_CONSTANTS.WAR_DEFEAT_XP_PENALTY, // -25K XP penalty
            },
          },
        },
      },
      // Add to winner
      {
        updateOne: {
          filter: { _id: new ObjectId(winnerId) },
          update: {
            $inc: {
              'bank.treasury.metal': finalMetal,
              'bank.treasury.energy': finalEnergy,
              'bank.treasury.rp': finalRP,
              xp: WAR_CONSTANTS.WAR_VICTORY_XP_BONUS + objectiveResults.xpBonus, // +50K base + bonuses
            },
          },
        },
      },
    ]);
    
    // Log transactions for both clans
    const now = new Date();
    await clansCollection.updateOne(
      { _id: new ObjectId(winnerId) },
      {
        $push: {
          'bank.transactionHistory': {
            type: 'WAR_SPOILS_RECEIVED',
            amount: { metal: finalMetal, energy: finalEnergy, rp: finalRP },
            timestamp: now,
            description: `War victory spoils (${objectiveResults.objectivesAchieved.length} objectives achieved)`,
          },
        } as any,
      }
    );
    
    await clansCollection.updateOne(
      { _id: new ObjectId(loserId) },
      {
        $push: {
          'bank.transactionHistory': {
            type: 'WAR_SPOILS_LOST',
            amount: { metal: -finalMetal, energy: -finalEnergy, rp: -finalRP },
            timestamp: now,
            description: `War defeat penalties`,
          },
        } as any,
      }
    );
    
    // Log activity
    await database.collection('clan_activities').insertMany([
      {
        clanId: winnerId,
        type: 'WAR_SPOILS_COLLECTED',
        timestamp: now,
        details: {
          warId: war.warId,
          metal: finalMetal,
          energy: finalEnergy,
          rp: finalRP,
          xpBonus: WAR_CONSTANTS.WAR_VICTORY_XP_BONUS + objectiveResults.xpBonus,
          objectivesAchieved: objectiveResults.objectivesAchieved,
        },
      },
    ]);
    
    return {
      success: true,
      spoils: { metal: finalMetal, energy: finalEnergy, rp: finalRP },
      bonuses: {
        metal: finalMetal - baseSpoils.metal,
        energy: finalEnergy - baseSpoils.energy,
        rp: objectiveResults.rpBonus,
        xp: WAR_CONSTANTS.WAR_VICTORY_XP_BONUS + objectiveResults.xpBonus,
      },
      objectivesAchieved: objectiveResults.objectivesAchieved,
      message: `War spoils collected: ${finalMetal} M, ${finalEnergy} E, ${finalRP} RP`,
    };
    
  } catch (error: any) {
    return {
      success: false,
      spoils: { metal: 0, energy: 0, rp: 0 },
      bonuses: { metal: 0, energy: 0, rp: 0, xp: 0 },
      objectivesAchieved: [],
      message: `Failed to distribute spoils: ${error.message}`,
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate defense bonus for a territory based on adjacent tiles
 * 
 * @param territories - All clan territories
 * @param tileX - Territory X coordinate
 * @param tileY - Territory Y coordinate
 * @returns Defense bonus percentage (0-50)
 */
function calculateDefenseBonus(
  territories: Array<{ tileX: number; tileY: number }>,
  tileX: number,
  tileY: number
): number {
  let adjacentCount = 0;

  // Check 4 cardinal directions
  const directions = [
    { dx: 0, dy: 1 },  // North
    { dx: 0, dy: -1 }, // South
    { dx: 1, dy: 0 },  // East
    { dx: -1, dy: 0 }, // West
  ];

  for (const dir of directions) {
    const adjX = tileX + dir.dx;
    const adjY = tileY + dir.dy;

    if (territories.some((t) => t.tileX === adjX && t.tileY === adjY)) {
      adjacentCount++;
    }
  }

  return Math.min(adjacentCount * 10, 50); // 10% per tile, max 50%
}

// ============================================================================
// JOINT WARFARE (ALLIANCE SUPPORT)
// ============================================================================

/**
 * Declare war with alliance support (2v1 or 2v2)
 * 
 * @param clanId - Declaring clan
 * @param allyClanId - Allied clan joining the war
 * @param targetClanId - Target clan
 * @param targetAllyClanId - Optional target ally (for 2v2)
 * @param playerId - Player declaring war
 * @returns War record with alliance data
 * @example
 * // 2v1 war: Clan A + Clan B vs Clan C
 * await declareJointWar('clanA', 'clanB', 'clanC', null, 'player1');
 * 
 * // 2v2 war: Clan A + Clan B vs Clan C + Clan D
 * await declareJointWar('clanA', 'clanB', 'clanC', 'clanD', 'player1');
 */
export async function declareJointWar(
  clanId: string,
  allyClanId: string,
  targetClanId: string,
  targetAllyClanId: string | null,
  playerId: string
): Promise<ClanWar> {
  const database = getDb();
  const clansCollection = database.collection<Clan>('clans');
  const warsCollection = database.collection<ClanWar>('clan_wars');
  
  // Import alliance service to verify allies
  const { areAllies, getAllianceBetweenClans } = await import('@/lib/clanAllianceService');
  
  // Verify alliance between attacker and ally
  const attackerAlliance = await getAllianceBetweenClans(clanId, allyClanId);
  if (!attackerAlliance || attackerAlliance.type === 'NAP' || attackerAlliance.type === 'TRADE') {
    throw new Error('Joint warfare requires Military Alliance or Federation');
  }
  
  // Check for Defense Pact or War Support contract
  const hasWarContract = attackerAlliance.contracts.some(
    (c) => c.type === 'DEFENSE_PACT' || c.type === 'WAR_SUPPORT'
  );
  
  if (!hasWarContract) {
    throw new Error('Joint warfare requires Defense Pact or War Support contract');
  }
  
  // Verify target alliance if 2v2
  if (targetAllyClanId) {
    const isTargetAllied = await areAllies(targetClanId, targetAllyClanId);
    if (!isTargetAllied) {
      throw new Error('Target clans must be allies for 2v2 warfare');
    }
  }
  
  // Get all clans
  const clans = await clansCollection
    .find({
      _id: {
        $in: [
          new ObjectId(clanId),
          new ObjectId(allyClanId),
          new ObjectId(targetClanId),
          ...(targetAllyClanId ? [new ObjectId(targetAllyClanId)] : []),
        ],
      },
    })
    .toArray();
  
  if (clans.length < (targetAllyClanId ? 4 : 3)) {
    throw new Error('One or more clans not found');
  }
  
  // Calculate shared war cost (split between allies)
  const totalCost = {
    metal: WAR_CONSTANTS.BASE_WAR_COST_METAL,
    energy: WAR_CONSTANTS.BASE_WAR_COST_ENERGY,
  };
  
  const costPerClan = {
    metal: Math.floor(totalCost.metal / 2),
    energy: Math.floor(totalCost.energy / 2),
  };
  
  // Deduct from both attacking clans
  for (const attackerClanId of [clanId, allyClanId]) {
    const attackerClan = clans.find((c) => c._id.toString() === attackerClanId);
    const treasury = attackerClan?.bank?.treasury || { metal: 0, energy: 0, researchPoints: 0 };
    
    if (treasury.metal < costPerClan.metal || treasury.energy < costPerClan.energy) {
      throw new Error(`${attackerClan?.name} has insufficient funds for joint war`);
    }
    
    await clansCollection.updateOne(
      { _id: new ObjectId(attackerClanId) },
      {
        $inc: {
          'bank.treasury.metal': -costPerClan.metal,
          'bank.treasury.energy': -costPerClan.energy,
        },
      }
    );
  }
  
  // Create joint war record (extended ClanWar structure)
  const war: any = {
    attackerClanId: clanId,
    defenderClanId: targetClanId,
    allyClanIds: {
      attackers: [allyClanId],
      defenders: targetAllyClanId ? [targetAllyClanId] : [],
    },
    status: ClanWarStatus.ACTIVE,
    declaredAt: new Date(),
    declaredBy: playerId,
    cost: totalCost,
    stats: {
      attackerTerritoryGained: 0,
      defenderTerritoryGained: 0,
      attackerBattlesWon: 0,
      defenderBattlesWon: 0,
    },
    isJointWar: true,
  };
  
  const result = await warsCollection.insertOne(war);
  war._id = result.insertedId;
  
  // Log activity for all participating clans
  const mainAttacker = clans.find((c) => c._id.toString() === clanId);
  const ally = clans.find((c) => c._id.toString() === allyClanId);
  const mainDefender = clans.find((c) => c._id.toString() === targetClanId);
  
  await database.collection('clan_activities').insertOne({
    clanId,
    type: 'WAR_DECLARED',
    timestamp: new Date(),
    details: {
      targetClanId,
      targetClanName: mainDefender?.name,
      warId: result.insertedId.toString(),
      cost: costPerClan,
      isJoint: true,
      allyName: ally?.name,
    },
  });
  
  await database.collection('clan_activities').insertOne({
    clanId: allyClanId,
    type: 'WAR_DECLARED',
    timestamp: new Date(),
    details: {
      targetClanId,
      targetClanName: mainDefender?.name,
      warId: result.insertedId.toString(),
      cost: costPerClan,
      isJoint: true,
      primaryAttacker: mainAttacker?.name,
    },
  });
  
  return war as ClanWar;
}

/**
 * Get all allies participating in a war
 * 
 * @param warId - War ID
 * @returns Object with attacker and defender ally IDs
 */
export async function getWarParticipants(warId: string): Promise<{
  attackers: string[];
  defenders: string[];
}> {
  const database = getDb();
  const warsCollection = database.collection('clan_wars');
  
  const war = await warsCollection.findOne({ _id: new ObjectId(warId) });
  if (!war) {
    throw new Error('War not found');
  }
  
  const participants = {
    attackers: [war.attackerClanId, ...(war.allyClanIds?.attackers || [])],
    defenders: [war.defenderClanId, ...(war.allyClanIds?.defenders || [])],
  };
  
  return participants;
}

/**
 * Check if clan can participate in war (is attacker or ally)
 * 
 * @param warId - War ID
 * @param clanId - Clan to check
 * @returns True if clan can participate
 */
export async function canParticipateInWar(warId: string, clanId: string): Promise<boolean> {
  const participants = await getWarParticipants(warId);
  return participants.attackers.includes(clanId) || participants.defenders.includes(clanId);
}

// ============================================================================
// FOOTER
// ============================================================================

/**
 * Implementation Notes:
 * 
 * War Flow:
 * 1. DECLARED: War just declared, no captures yet (24hr minimum before ending)
 * 2. ACTIVE: War ongoing, territories can be captured
 * 3. ENDED: War completed with winner determined
 * 
 * Capture Mechanics:
 * - Base 70% success rate
 * - Defense bonus reduces success (50% impact)
 * - Example: 40% defense bonus → 70% - (40 * 0.5) = 50% capture rate
 * - Minimum 30% capture rate even with max defense
 * 
 * Cost Reduction:
 * - Applied from perk bonus type 'territory_cost' (also applies to war costs)
 * - Example: 20% reduction → 2000 * (1 - 0.20) = 1600 resources
 * 
 * Territory Coordinates:
 * - Uses tileX and tileY (not x and y) to match ClanTerritory interface
 * - Consistent with territory service naming
 * 
 * Future Enhancements:
 * - Battle system integration for capture attempts
 * - War score tracking (territory value, battles won)
 * - Alliance system for multi-clan wars
 * - Siege mechanics for heavily defended territories
 * - War rewards (resources, perks, exclusive monuments)
 */
