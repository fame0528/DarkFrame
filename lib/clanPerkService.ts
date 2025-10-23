/**
 * Clan Perk Management Service
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * Manages clan perk system with 4 tiers (Bronze, Silver, Gold, Legendary) and 4 categories
 * (Combat, Economic, Social, Strategic). Perks provide passive bonuses to all clan members
 * and require specific clan levels to unlock. Activation costs resources from clan bank.
 * 
 * Core Systems:
 * - Perk Catalog: 16 total perks (4 tiers × 4 categories)
 * - Tier Unlocking: Bronze (Lvl 5), Silver (Lvl 10), Gold (Lvl 15), Legendary (Lvl 20)
 * - Activation Management: Purchase perks using clan bank resources
 * - Active Perk Limits: Max 4 active perks at once (1 per category recommended)
 * - Cost Scaling: Bronze (100K/100K/10K), Silver (250K/250K/25K), Gold (500K/500K/50K), Legendary (1M/1M/100K)
 * 
 * Perk Categories:
 * - COMBAT: Attack/Defense bonuses for battles (5-25% boost)
 * - ECONOMIC: Resource generation and efficiency (5-20% boost)
 * - SOCIAL: Member benefits and capacity (XP boost, max members)
 * - STRATEGIC: Territory and warfare bonuses (territory cost reduction, war bonuses)
 * 
 * Perk Tiers:
 * - Bronze (Level 5+): Basic bonuses (5-10%), affordable costs
 * - Silver (Level 10+): Enhanced bonuses (10-15%), moderate costs
 * - Gold (Level 15+): Strong bonuses (15-20%), expensive
 * - Legendary (Level 20+): Elite bonuses (20-25%), very expensive
 * 
 * Integration Points:
 * - clanLevelService.ts: Checks isFeatureUnlocked() for tier availability
 * - clanBankService.ts: Deducts activation costs from treasury
 * - Combat calculations: Applies attack/defense bonuses
 * - Resource harvesting: Applies economic bonuses
 * - Territory system: Applies strategic bonuses
 */

import { MongoClient, Db, ObjectId } from 'mongodb';
import {
  Clan,
  ClanPerk,
  ClanPerkTier,
  ClanPerkCategory,
  CLAN_PERK_CATALOG,
  CLAN_PERK_LIMITS,
} from '@/types/clan.types';

// ============================================================================
// Module State
// ============================================================================

let mongoClient: MongoClient;
let database: Db;

/**
 * Initialize clan perk service with MongoDB connection
 * @param client - MongoDB client instance
 * @param db - Database instance
 */
export function initializeClanPerkService(client: MongoClient, db: Db): void {
  mongoClient = client;
  database = db;
}

// ============================================================================
// Perk Activation Management
// ============================================================================

/**
 * Activate a perk for a clan
 * 
 * Validates clan level, perk availability, active perk limit, and bank balance.
 * Deducts activation cost from clan treasury and adds perk to active perks.
 * 
 * @param clanId - Clan to activate perk for
 * @param playerId - Player activating perk (must have permission)
 * @param perkId - Perk ID to activate
 * @returns Activation result with updated clan and cost breakdown
 * 
 * @example
 * const result = await activatePerk(clanId, playerId, 'combat_bronze_berserker');
 * if (result.success) {
 *   console.log(`Activated! +${result.perk.bonus.value}% ${result.perk.bonus.type}`);
 * }
 */
export async function activatePerk(
  clanId: string,
  playerId: string,
  perkId: string
): Promise<{
  success: boolean;
  clan: Clan;
  perk: ClanPerk;
  costPaid: { metal: number; energy: number; researchPoints: number };
  message: string;
}> {
  const clansCollection = database.collection<Clan>('clans');

  // Get clan
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
  if (!clan) {
    throw new Error('Clan not found');
  }

  // Check if player has permission (Leader, Co-Leader, Officer)
  const member = clan.members.find((m) => m.playerId === playerId);
  if (!member) {
    throw new Error('Player is not a member of this clan');
  }

  const { hasPermission } = await import('@/types/clan.types');
  if (!hasPermission(member.role, 'canManageResearch')) {
    throw new Error('Insufficient permissions to activate perks');
  }

  // Get perk from catalog
  const perk = CLAN_PERK_CATALOG.find((p) => p.id === perkId);
  if (!perk) {
    throw new Error('Perk not found in catalog');
  }

  // Check if perk is already active
  const isActive = clan.activePerks.some((p) => p.id === perkId);
  if (isActive) {
    throw new Error('Perk is already active');
  }

  // Check clan level requirement
  if (clan.level.currentLevel < perk.requiredLevel) {
    throw new Error(`Clan must be level ${perk.requiredLevel} to activate this perk`);
  }

  // Check tier unlock (based on level milestones)
  const tierUnlocked = await isTierUnlocked(clan, perk.tier);
  if (!tierUnlocked) {
    throw new Error(`${perk.tier} tier perks are not unlocked yet`);
  }

  // Check active perk limit
  if (clan.activePerks.length >= CLAN_PERK_LIMITS.MAX_ACTIVE_PERKS) {
    throw new Error(`Maximum active perks reached (${CLAN_PERK_LIMITS.MAX_ACTIVE_PERKS}). Deactivate a perk first.`);
  }

  // Check bank balance
  const { metal, energy, researchPoints } = perk.cost;
  if (clan.bank.treasury.metal < metal) {
    throw new Error(`Insufficient metal in bank (need ${metal}, have ${clan.bank.treasury.metal})`);
  }
  if (clan.bank.treasury.energy < energy) {
    throw new Error(`Insufficient energy in bank (need ${energy}, have ${clan.bank.treasury.energy})`);
  }
  if (clan.bank.treasury.researchPoints < researchPoints) {
    throw new Error(`Insufficient RP in bank (need ${researchPoints}, have ${clan.bank.treasury.researchPoints})`);
  }

  // Deduct cost and activate perk
  const activatedPerk: ClanPerk = {
    ...perk,
    activatedAt: new Date(),
    activatedBy: playerId,
  };

  await clansCollection.updateOne(
    { _id: new ObjectId(clanId) },
    {
      $push: { activePerks: activatedPerk } as any,
      $inc: {
        'bank.treasury.metal': -metal,
        'bank.treasury.energy': -energy,
        'bank.treasury.researchPoints': -researchPoints,
      },
    }
  );

  // Log perk activation activity
  await logPerkActivity(clanId, playerId, 'activate', perkId, perk.name);

  // Get updated clan
  const updatedClan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
  if (!updatedClan) {
    throw new Error('Failed to retrieve updated clan');
  }

  return {
    success: true,
    clan: updatedClan,
    perk: activatedPerk,
    costPaid: { metal, energy, researchPoints },
    message: `${perk.name} activated! ${perk.description}`,
  };
}

/**
 * Deactivate an active perk
 * 
 * Removes perk from active perks. No refund on activation cost.
 * Can be deactivated to free up slot for different perk.
 * 
 * @param clanId - Clan to deactivate perk for
 * @param playerId - Player deactivating perk (must have permission)
 * @param perkId - Perk ID to deactivate
 * @returns Deactivation result with updated clan
 * 
 * @example
 * const result = await deactivatePerk(clanId, playerId, 'combat_bronze_berserker');
 * console.log(`${result.perkName} deactivated. Perk slot freed.`);
 */
export async function deactivatePerk(
  clanId: string,
  playerId: string,
  perkId: string
): Promise<{
  success: boolean;
  clan: Clan;
  perkName: string;
  message: string;
}> {
  const clansCollection = database.collection<Clan>('clans');

  // Get clan
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
  if (!clan) {
    throw new Error('Clan not found');
  }

  // Check permission
  const member = clan.members.find((m) => m.playerId === playerId);
  if (!member) {
    throw new Error('Player is not a member of this clan');
  }

  const { hasPermission } = await import('@/types/clan.types');
  if (!hasPermission(member.role, 'canManageResearch')) {
    throw new Error('Insufficient permissions to deactivate perks');
  }

  // Find active perk
  const activePerk = clan.activePerks.find((p) => p.id === perkId);
  if (!activePerk) {
    throw new Error('Perk is not currently active');
  }

  // Remove perk from active perks
  await clansCollection.updateOne(
    { _id: new ObjectId(clanId) },
    {
      $pull: { activePerks: { id: perkId } } as any,
    }
  );

  // Log perk deactivation
  await logPerkActivity(clanId, playerId, 'deactivate', perkId, activePerk.name);

  // Get updated clan
  const updatedClan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
  if (!updatedClan) {
    throw new Error('Failed to retrieve updated clan');
  }

  return {
    success: true,
    clan: updatedClan,
    perkName: activePerk.name,
    message: `${activePerk.name} deactivated. Perk slot freed.`,
  };
}

/**
 * Get all perks available to a clan based on level
 * 
 * Returns catalog of perks filtered by clan level and tier unlocks.
 * Shows locked perks with required levels for progression visibility.
 * 
 * @param clanId - Clan to get available perks for
 * @returns Available perks grouped by tier and category
 * 
 * @example
 * const perks = await getAvailablePerks(clanId);
 * console.log(`${perks.unlocked.length} perks available`);
 * console.log(`${perks.locked.length} perks require higher level`);
 */
export async function getAvailablePerks(clanId: string): Promise<{
  unlocked: ClanPerk[];
  locked: Array<ClanPerk & { levelsToUnlock: number }>;
  activeCount: number;
  maxActive: number;
}> {
  const clansCollection = database.collection<Clan>('clans');
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });

  if (!clan) {
    throw new Error('Clan not found');
  }

  const currentLevel = clan.level.currentLevel;
  const unlocked: ClanPerk[] = [];
  const locked: Array<ClanPerk & { levelsToUnlock: number }> = [];

  for (const perk of CLAN_PERK_CATALOG) {
    const tierAvailable = await isTierUnlocked(clan, perk.tier);

    if (currentLevel >= perk.requiredLevel && tierAvailable) {
      unlocked.push(perk);
    } else {
      locked.push({
        ...perk,
        levelsToUnlock: Math.max(0, perk.requiredLevel - currentLevel),
      });
    }
  }

  return {
    unlocked,
    locked,
    activeCount: clan.activePerks.length,
    maxActive: CLAN_PERK_LIMITS.MAX_ACTIVE_PERKS,
  };
}

/**
 * Get currently active perks for a clan
 * 
 * Returns all active perks with bonus values and activation details.
 * 
 * @param clanId - Clan to get active perks for
 * @returns Active perks with metadata
 */
export async function getActivePerks(clanId: string): Promise<{
  perks: ClanPerk[];
  totalBonuses: {
    attack: number;
    defense: number;
    resourceYield: number;
    xpGain: number;
    territoryCostReduction: number;
  };
}> {
  const clansCollection = database.collection<Clan>('clans');
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });

  if (!clan) {
    throw new Error('Clan not found');
  }

  // Calculate total bonuses from all active perks
  const totalBonuses = {
    attack: 0,
    defense: 0,
    resourceYield: 0,
    xpGain: 0,
    territoryCostReduction: 0,
  };

  for (const perk of clan.activePerks) {
    switch (perk.bonus.type) {
      case 'attack':
        totalBonuses.attack += perk.bonus.value;
        break;
      case 'defense':
        totalBonuses.defense += perk.bonus.value;
        break;
      case 'resource_yield':
        totalBonuses.resourceYield += perk.bonus.value;
        break;
      case 'xp_gain':
        totalBonuses.xpGain += perk.bonus.value;
        break;
      case 'territory_cost':
        totalBonuses.territoryCostReduction += perk.bonus.value;
        break;
    }
  }

  return {
    perks: clan.activePerks,
    totalBonuses,
  };
}

/**
 * Get perks by category
 * 
 * Filters perk catalog by category (Combat, Economic, Social, Strategic).
 * Useful for UI filtering and displaying category-specific perks.
 * 
 * @param category - Perk category to filter by
 * @param clanLevel - Optional clan level to filter available perks
 * @returns Perks in specified category
 */
export function getPerksByCategory(
  category: ClanPerkCategory,
  clanLevel?: number
): ClanPerk[] {
  let perks = CLAN_PERK_CATALOG.filter((p) => p.category === category);

  if (clanLevel !== undefined) {
    perks = perks.filter((p) => p.requiredLevel <= clanLevel);
  }

  return perks;
}

/**
 * Get perks by tier
 * 
 * Filters perk catalog by tier (Bronze, Silver, Gold, Legendary).
 * 
 * @param tier - Perk tier to filter by
 * @returns Perks in specified tier
 */
export function getPerksByTier(tier: ClanPerkTier): ClanPerk[] {
  return CLAN_PERK_CATALOG.filter((p) => p.tier === tier);
}

/**
 * Calculate total cost to activate all perks in a tier
 * 
 * Useful for planning clan bank savings goals.
 * 
 * @param tier - Perk tier to calculate cost for
 * @returns Total cost to activate all perks in tier
 */
export function calculateTierCost(tier: ClanPerkTier): {
  metal: number;
  energy: number;
  researchPoints: number;
  perkCount: number;
} {
  const perks = getPerksByTier(tier);
  const totalCost = perks.reduce(
    (acc, perk) => ({
      metal: acc.metal + perk.cost.metal,
      energy: acc.energy + perk.cost.energy,
      researchPoints: acc.researchPoints + perk.cost.researchPoints,
    }),
    { metal: 0, energy: 0, researchPoints: 0 }
  );

  return {
    ...totalCost,
    perkCount: perks.length,
  };
}

/**
 * Get perk recommendations based on clan needs
 * 
 * Analyzes clan stats and suggests optimal perks.
 * Basic algorithm prioritizes combat for offensive clans, economic for builders.
 * 
 * @param clanId - Clan to get recommendations for
 * @returns Recommended perks with reasoning
 */
export async function getRecommendedPerks(clanId: string): Promise<
  Array<{
    perk: ClanPerk;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }>
> {
  const clansCollection = database.collection<Clan>('clans');
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });

  if (!clan) {
    throw new Error('Clan not found');
  }

  const recommendations: Array<{
    perk: ClanPerk;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }> = [];

  const { unlocked } = await getAvailablePerks(clanId);
  const activeIds = clan.activePerks.map((p) => p.id);

  // Prioritize combat perks if clan has wars
  const hasActiveWars = clan.wars.active.length > 0;
  if (hasActiveWars) {
    const combatPerks = unlocked.filter(
      (p) => p.category === 'COMBAT' && !activeIds.includes(p.id)
    );
    for (const perk of combatPerks.slice(0, 2)) {
      recommendations.push({
        perk,
        reason: 'Recommended for active warfare - boosts combat effectiveness',
        priority: 'high',
      });
    }
  }

  // Recommend economic perks if low on resources
  const bankUsage =
    (clan.bank.treasury.metal + clan.bank.treasury.energy) /
    (clan.bank.capacity * 2); // capacity applies to each resource
  if (bankUsage < 0.3) {
    const economicPerks = unlocked.filter(
      (p) => p.category === 'ECONOMIC' && !activeIds.includes(p.id)
    );
    for (const perk of economicPerks.slice(0, 2)) {
      recommendations.push({
        perk,
        reason: 'Low resources - boosts resource generation',
        priority: 'high',
      });
    }
  }

  // Recommend social perks for growing clans
  const memberUsage = clan.members.length / clan.maxMembers;
  if (memberUsage > 0.8) {
    const socialPerks = unlocked.filter(
      (p) => p.category === 'SOCIAL' && !activeIds.includes(p.id)
    );
    for (const perk of socialPerks.slice(0, 1)) {
      recommendations.push({
        perk,
        reason: 'Near member capacity - increases max members or XP gain',
        priority: 'medium',
      });
    }
  }

  // Recommend strategic perks for territorial clans
  if (clan.stats.totalTerritories > 5) {
    const strategicPerks = unlocked.filter(
      (p) => p.category === 'STRATEGIC' && !activeIds.includes(p.id)
    );
    for (const perk of strategicPerks.slice(0, 1)) {
      recommendations.push({
        perk,
        reason: 'Large territory - reduces costs and boosts territory bonuses',
        priority: 'medium',
      });
    }
  }

  // Fill remaining slots with highest tier available
  const remainingSlots = CLAN_PERK_LIMITS.MAX_ACTIVE_PERKS - clan.activePerks.length;
  const remainingPerks = unlocked
    .filter((p) => !activeIds.includes(p.id))
    .filter((p) => !recommendations.some((r) => r.perk.id === p.id))
    .sort((a, b) => {
      const tierOrder: Record<ClanPerkTier, number> = {
        LEGENDARY: 4,
        GOLD: 3,
        SILVER: 2,
        BRONZE: 1,
      };
      return tierOrder[b.tier] - tierOrder[a.tier];
    });

  for (const perk of remainingPerks.slice(0, remainingSlots - recommendations.length)) {
    recommendations.push({
      perk,
      reason: 'High tier perk with strong bonuses',
      priority: 'low',
    });
  }

  return recommendations;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a perk tier is unlocked for a clan
 * 
 * Tier unlock levels:
 * - Bronze: Level 5
 * - Silver: Level 10
 * - Gold: Level 15
 * - Legendary: Level 20
 * 
 * @param clan - Clan to check
 * @param tier - Tier to check
 * @returns Whether tier is unlocked
 */
async function isTierUnlocked(clan: Clan, tier: ClanPerkTier): Promise<boolean> {
  const tierLevels: Record<ClanPerkTier, number> = {
    BRONZE: 5,
    SILVER: 10,
    GOLD: 15,
    LEGENDARY: 20,
  };

  return clan.level.currentLevel >= tierLevels[tier];
}

/**
 * Log perk activity to clan activity feed
 * 
 * @param clanId - Clan ID
 * @param playerId - Player who performed action
 * @param action - 'activate' or 'deactivate'
 * @param perkId - Perk ID
 * @param perkName - Perk display name
 */
async function logPerkActivity(
  clanId: string,
  playerId: string,
  action: 'activate' | 'deactivate',
  perkId: string,
  perkName: string
): Promise<void> {
  const activitiesCollection = database.collection('clan_activities');

  const activity = {
    clanId: new ObjectId(clanId),
    activityType: action === 'activate' ? 'PERK_ACTIVATED' : 'PERK_DEACTIVATED',
    playerId: new ObjectId(playerId),
    timestamp: new Date(),
    details: {
      perkId,
      perkName,
    },
  };

  await activitiesCollection.insertOne(activity);
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * Perk System Design:
 * - 16 total perks (4 tiers × 4 categories)
 * - Max 4 active perks at once (strategic choice required)
 * - No cooldown on activation/deactivation (instant swap)
 * - Activation costs NOT refunded on deactivation
 * - Perks apply passively to all clan members
 * 
 * Cost Scaling:
 * - Bronze: 100K Metal, 100K Energy, 10K RP
 * - Silver: 250K Metal, 250K Energy, 25K RP
 * - Gold: 500K Metal, 500K Energy, 50K RP
 * - Legendary: 1M Metal, 1M Energy, 100K RP
 * 
 * Bonus Stacking:
 * - Multiple perks of same type DO stack (e.g., 2 combat perks = +15% + +20% = +35% total)
 * - Recommended to diversify across categories for balanced bonuses
 * 
 * Future Enhancements:
 * - Perk cooldowns (once deactivated, 24-hour cooldown before re-activation)
 * - Perk tiers 5-6 for levels 30+
 * - Perk synergies (bonus for activating related perks together)
 * - Time-limited event perks
 */
