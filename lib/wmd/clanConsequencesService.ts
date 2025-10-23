/**
 * @file lib/wmd/clanConsequencesService.ts
 * @created 2025-10-22
 * @overview WMD Shared Clan Consequences System
 * 
 * OVERVIEW:
 * Implements clan-wide penalties and consequences for WMD actions.
 * Ensures WMD usage affects ENTIRE clan, not just individual players.
 * Forces genuine clan coordination and accountability.
 * 
 * Features:
 * - Clan-wide reputation penalties for missile launches
 * - 14-day clan cooldown after missile launch (affects all members)
 * - Enemy clan members can ALL retaliate (removes solo targeting)
 * - Clan relations tracking (allies, enemies, neutral)
 * - Escalation prevention mechanics
 * 
 * Philosophy:
 * "WMD is a CLAN weapon with CLAN consequences"
 * - One member launches → entire clan suffers reputation loss
 * - Clan cooldown prevents spam (forces strategic timing)
 * - Enemy clan gets collective retaliation rights
 * - Promotes diplomacy and careful decision-making
 * 
 * Dependencies:
 * - MongoDB for clan and reputation data
 * - reputationService for reputation calculations
 * - Clan system for member tracking
 * 
 * @implements Shared Consequences Pattern
 */

import { Db } from 'mongodb';

/**
 * Consequence severity levels
 */
export enum ConsequenceSeverity {
  MINOR = 'MINOR',           // Warning, small reputation loss
  MODERATE = 'MODERATE',     // Significant reputation loss, short cooldown
  MAJOR = 'MAJOR',           // Heavy reputation loss, 14-day cooldown
  CATASTROPHIC = 'CATASTROPHIC', // Massive reputation loss, permanent relations damage
}

/**
 * Clan relation types
 */
export enum ClanRelation {
  ALLY = 'ALLY',
  NEUTRAL = 'NEUTRAL',
  ENEMY = 'ENEMY',
  WAR = 'WAR',
}

/**
 * WMD consequence configuration
 */
interface ConsequenceConfig {
  reputationLoss: number;
  cooldownDuration: number;  // Milliseconds
  severity: ConsequenceSeverity;
  allowsRetaliation: boolean;
  affectsAllMembers: boolean;
}

/**
 * Consequence configurations by WMD action type
 */
const CONSEQUENCE_CONFIGS: Record<string, ConsequenceConfig> = {
  TACTICAL_LAUNCH: {
    reputationLoss: 2000,
    cooldownDuration: 14 * 24 * 60 * 60 * 1000, // 14 days
    severity: ConsequenceSeverity.MAJOR,
    allowsRetaliation: true,
    affectsAllMembers: true,
  },
  STRATEGIC_LAUNCH: {
    reputationLoss: 5000,
    cooldownDuration: 21 * 24 * 60 * 60 * 1000, // 21 days
    severity: ConsequenceSeverity.MAJOR,
    allowsRetaliation: true,
    affectsAllMembers: true,
  },
  NEUTRON_LAUNCH: {
    reputationLoss: 8000,
    cooldownDuration: 28 * 24 * 60 * 60 * 1000, // 28 days
    severity: ConsequenceSeverity.CATASTROPHIC,
    allowsRetaliation: true,
    affectsAllMembers: true,
  },
  CLUSTER_LAUNCH: {
    reputationLoss: 10000,
    cooldownDuration: 28 * 24 * 60 * 60 * 1000, // 28 days
    severity: ConsequenceSeverity.CATASTROPHIC,
    allowsRetaliation: true,
    affectsAllMembers: true,
  },
  CLAN_BUSTER_LAUNCH: {
    reputationLoss: 25000,
    cooldownDuration: 60 * 24 * 60 * 60 * 1000, // 60 days
    severity: ConsequenceSeverity.CATASTROPHIC,
    allowsRetaliation: true,
    affectsAllMembers: true,
  },
  SPY_SABOTAGE: {
    reputationLoss: 500,
    cooldownDuration: 3 * 24 * 60 * 60 * 1000, // 3 days
    severity: ConsequenceSeverity.MINOR,
    allowsRetaliation: false,
    affectsAllMembers: false,
  },
};

/**
 * Apply WMD launch consequences to entire clan
 * 
 * CRITICAL IMPLEMENTATION:
 * - Affects ALL clan members, not just launcher
 * - Creates 14-day minimum clan cooldown
 * - Grants retaliation rights to enemy clan
 * - Updates clan relations (neutral → enemy)
 * - Logs consequence event for transparency
 */
export async function applyClanWMDConsequences(
  db: Db,
  launcherClanId: string,
  launcherClanName: string,
  targetClanId: string,
  targetClanName: string,
  warheadType: string
): Promise<{ success: boolean; message: string; consequencesApplied: string[] }> {
  try {
    const config = CONSEQUENCE_CONFIGS[`${warheadType}_LAUNCH`] || CONSEQUENCE_CONFIGS.TACTICAL_LAUNCH;
    const consequencesApplied: string[] = [];
    
    // 1. Apply clan-wide reputation loss
    const reputationResult = await applyClanReputationPenalty(
      db,
      launcherClanId,
      config.reputationLoss,
      `${warheadType} missile launched at ${targetClanName}`
    );
    
    if (reputationResult.success) {
      consequencesApplied.push(
        `Clan reputation: -${config.reputationLoss} (affects all ${reputationResult.membersAffected} members)`
      );
    }
    
    // 2. Apply clan cooldown
    const cooldownResult = await applyClanWMDCooldown(
      db,
      launcherClanId,
      config.cooldownDuration
    );
    
    if (cooldownResult.success) {
      const days = Math.floor(config.cooldownDuration / (24 * 60 * 60 * 1000));
      consequencesApplied.push(
        `Clan WMD cooldown: ${days} days (no clan member can launch)`
      );
    }
    
    // 3. Update clan relations (neutral → enemy)
    const relationsResult = await updateClanRelations(
      db,
      launcherClanId,
      targetClanId,
      ClanRelation.ENEMY,
      `${warheadType} missile attack`
    );
    
    if (relationsResult.success) {
      consequencesApplied.push(
        `Clan relations: ${launcherClanName} ↔ ${targetClanName} set to ENEMY`
      );
    }
    
    // 4. Grant retaliation rights to ALL enemy clan members
    if (config.allowsRetaliation) {
      const retaliationResult = await grantClanRetaliationRights(
        db,
        targetClanId,
        launcherClanId,
        30 * 24 * 60 * 60 * 1000 // 30 days to retaliate
      );
      
      if (retaliationResult.success) {
        consequencesApplied.push(
          `Retaliation rights: ALL ${retaliationResult.membersGranted} members of ${targetClanName} can retaliate`
        );
      }
    }
    
    // 5. Log consequence event
    await logConsequenceEvent(db, {
      launcherClanId,
      targetClanId,
      warheadType,
      severity: config.severity,
      reputationLoss: config.reputationLoss,
      cooldownDays: Math.floor(config.cooldownDuration / (24 * 60 * 60 * 1000)),
      timestamp: new Date(),
    });
    
    console.log(`[ClanConsequences] Applied ${consequencesApplied.length} consequences to clan ${launcherClanId} for ${warheadType} launch`);
    
    return {
      success: true,
      message: `Clan consequences applied: ${consequencesApplied.length} effects`,
      consequencesApplied,
    };
    
  } catch (error) {
    console.error('[ClanConsequences] Error applying consequences:', error);
    return {
      success: false,
      message: 'Failed to apply clan consequences',
      consequencesApplied: [],
    };
  }
}

/**
 * Apply reputation penalty to entire clan
 * Affects all members' individual reputation scores
 */
async function applyClanReputationPenalty(
  db: Db,
  clanId: string,
  reputationLoss: number,
  reason: string
): Promise<{ success: boolean; membersAffected: number }> {
  try {
    // Get all clan members
    const playersCollection = db.collection('players');
    const clanMembers = await playersCollection.find({ clanId }).toArray();
    
    if (clanMembers.length === 0) {
      return { success: false, membersAffected: 0 };
    }
    
    // Apply reputation loss to all members
    const memberIds = clanMembers.map(m => m.playerId);
    await playersCollection.updateMany(
      { playerId: { $in: memberIds } },
      {
        $inc: { reputation: -reputationLoss },
        $push: {
          reputationHistory: {
            $each: [{
              change: -reputationLoss,
              reason: `CLAN WMD: ${reason}`,
              timestamp: new Date(),
            }],
            $slice: -50, // Keep last 50 entries
          },
        } as any,
        $set: { updatedAt: new Date() },
      }
    );
    
    console.log(`[ClanConsequences] Applied -${reputationLoss} reputation to ${clanMembers.length} clan members`);
    
    return { success: true, membersAffected: clanMembers.length };
    
  } catch (error) {
    console.error('[ClanConsequences] Error applying reputation penalty:', error);
    return { success: false, membersAffected: 0 };
  }
}

/**
 * Apply clan-wide WMD cooldown
 * Prevents ANY clan member from launching WMD for duration
 */
async function applyClanWMDCooldown(
  db: Db,
  clanId: string,
  cooldownDuration: number
): Promise<{ success: boolean }> {
  try {
    const clansCollection = db.collection('clans');
    const cooldownUntil = new Date(Date.now() + cooldownDuration);
    
    await clansCollection.updateOne(
      { clanId },
      {
        $set: {
          wmdCooldownUntil: cooldownUntil,
          lastWMDLaunch: new Date(),
          updatedAt: new Date(),
        },
      }
    );
    
    console.log(`[ClanConsequences] Clan ${clanId} on WMD cooldown until ${cooldownUntil.toISOString()}`);
    
    return { success: true };
    
  } catch (error) {
    console.error('[ClanConsequences] Error applying cooldown:', error);
    return { success: false };
  }
}

/**
 * Update relations between two clans
 */
async function updateClanRelations(
  db: Db,
  clanId1: string,
  clanId2: string,
  relation: ClanRelation,
  reason: string
): Promise<{ success: boolean }> {
  try {
    const relationsCollection = db.collection('clan_relations');
    
    // Upsert relation record (bidirectional)
    await relationsCollection.updateOne(
      {
        $or: [
          { clanId1, clanId2 },
          { clanId1: clanId2, clanId2: clanId1 },
        ],
      },
      {
        $set: {
          clanId1,
          clanId2,
          relation,
          reason,
          lastUpdated: new Date(),
        },
      },
      { upsert: true }
    );
    
    console.log(`[ClanConsequences] Set relation ${clanId1} ↔ ${clanId2} to ${relation}`);
    
    return { success: true };
    
  } catch (error) {
    console.error('[ClanConsequences] Error updating relations:', error);
    return { success: false };
  }
}

/**
 * Grant retaliation rights to all enemy clan members
 * Allows any member to launch counter-strike
 */
async function grantClanRetaliationRights(
  db: Db,
  victimClanId: string,
  aggressorClanId: string,
  duration: number
): Promise<{ success: boolean; membersGranted: number }> {
  try {
    const retaliationCollection = db.collection('wmd_retaliation_rights');
    const playersCollection = db.collection('players');
    
    // Get all victim clan members
    const victimMembers = await playersCollection.find({ clanId: victimClanId }).toArray();
    
    if (victimMembers.length === 0) {
      return { success: false, membersGranted: 0 };
    }
    
    const expiresAt = new Date(Date.now() + duration);
    
    // Grant rights to all members
    const retaliationRights = victimMembers.map(member => ({
      playerId: member.playerId,
      playerClanId: victimClanId,
      canRetaliateAgainstClan: aggressorClanId,
      grantedAt: new Date(),
      expiresAt,
      used: false,
    }));
    
    await retaliationCollection.insertMany(retaliationRights);
    
    console.log(`[ClanConsequences] Granted retaliation rights to ${victimMembers.length} members of clan ${victimClanId}`);
    
    return { success: true, membersGranted: victimMembers.length };
    
  } catch (error) {
    console.error('[ClanConsequences] Error granting retaliation rights:', error);
    return { success: false, membersGranted: 0 };
  }
}

/**
 * Log consequence event for audit trail
 */
async function logConsequenceEvent(
  db: Db,
  event: {
    launcherClanId: string;
    targetClanId: string;
    warheadType: string;
    severity: ConsequenceSeverity;
    reputationLoss: number;
    cooldownDays: number;
    timestamp: Date;
  }
): Promise<void> {
  try {
    const eventsCollection = db.collection('wmd_consequence_events');
    await eventsCollection.insertOne({
      ...event,
      eventId: `consequence_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
  } catch (error) {
    console.error('[ClanConsequences] Error logging event:', error);
  }
}

/**
 * Check if clan is on WMD cooldown
 */
export async function isClanOnWMDCooldown(
  db: Db,
  clanId: string
): Promise<{ onCooldown: boolean; cooldownUntil: Date | null; remainingTime: number }> {
  try {
    const clansCollection = db.collection('clans');
    const clan = await clansCollection.findOne({ clanId }) as any;
    
    if (!clan || !clan.wmdCooldownUntil) {
      return { onCooldown: false, cooldownUntil: null, remainingTime: 0 };
    }
    
    const now = new Date();
    const cooldownUntil = new Date(clan.wmdCooldownUntil);
    
    if (now >= cooldownUntil) {
      return { onCooldown: false, cooldownUntil: null, remainingTime: 0 };
    }
    
    const remainingTime = cooldownUntil.getTime() - now.getTime();
    
    return { onCooldown: true, cooldownUntil, remainingTime };
    
  } catch (error) {
    console.error('[ClanConsequences] Error checking cooldown:', error);
    return { onCooldown: false, cooldownUntil: null, remainingTime: 0 };
  }
}

/**
 * Check if player has retaliation rights against a clan
 */
export async function hasRetaliationRights(
  db: Db,
  playerId: string,
  targetClanId: string
): Promise<{ hasRights: boolean; expiresAt: Date | null }> {
  try {
    const retaliationCollection = db.collection('wmd_retaliation_rights');
    const now = new Date();
    
    const right = await retaliationCollection.findOne({
      playerId,
      canRetaliateAgainstClan: targetClanId,
      used: false,
      expiresAt: { $gt: now },
    });
    
    if (!right) {
      return { hasRights: false, expiresAt: null };
    }
    
    return { hasRights: true, expiresAt: new Date(right.expiresAt) };
    
  } catch (error) {
    console.error('[ClanConsequences] Error checking retaliation rights:', error);
    return { hasRights: false, expiresAt: null };
  }
}

/**
 * Mark retaliation right as used
 */
export async function useRetaliationRight(
  db: Db,
  playerId: string,
  targetClanId: string
): Promise<{ success: boolean }> {
  try {
    const retaliationCollection = db.collection('wmd_retaliation_rights');
    
    await retaliationCollection.updateOne(
      {
        playerId,
        canRetaliateAgainstClan: targetClanId,
        used: false,
      },
      {
        $set: {
          used: true,
          usedAt: new Date(),
        },
      }
    );
    
    return { success: true };
    
  } catch (error) {
    console.error('[ClanConsequences] Error marking retaliation used:', error);
    return { success: false };
  }
}
