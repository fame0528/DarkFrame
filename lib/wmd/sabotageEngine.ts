/**
 * @file lib/wmd/sabotageEngine.ts
 * @created 2025-10-22
 * @overview WMD Sabotage Engine - Component Destruction Mechanics
 * 
 * OVERVIEW:
 * Handles sabotage operations against missiles, factories, and research.
 * Calculates damage to components and applies sabotage effects.
 * 
 * Features:
 * - Component damage calculation
 * - Progress loss mechanics
 * - Resource destruction
 * - Sabotage detection
 * 
 * Dependencies:
 * - /types/wmd for sabotage types
 * - MongoDB for target data
 */

import { Db } from 'mongodb';

/**
 * Sabotage result interface
 */
export interface SabotageResult {
  success: boolean;
  detected: boolean;
  damageDealt: number;
  componentsDestroyed: string[];
  progressLost: number;
  resourcesWasted: { metal: number; energy: number };
}

/**
 * Execute sabotage operation
 */
export async function executeSabotage(
  db: Db,
  spyId: string,
  targetType: 'MISSILE' | 'FACTORY' | 'RESEARCH',
  targetId: string,
  sabotageSkill: number
): Promise<SabotageResult> {
  try {
    // Calculate success chance
    const successChance = calculateSuccessChance(targetType, sabotageSkill);
    const success = Math.random() < successChance;
    
    // Calculate detection risk
    const detectionRisk = calculateDetectionRisk(targetType, sabotageSkill);
    const detected = Math.random() < detectionRisk;
    
    const result: SabotageResult = {
      success,
      detected,
      damageDealt: 0,
      componentsDestroyed: [],
      progressLost: 0,
      resourcesWasted: { metal: 0, energy: 0 },
    };
    
    if (success) {
      // Apply sabotage damage
      const damage = await applySabotageDamage(db, targetType, targetId, sabotageSkill);
      Object.assign(result, damage);
    }
    
    // Record sabotage operation
    await recordSabotage(db, spyId, targetType, targetId, result);
    
    return result;
    
  } catch (error) {
    console.error('Error executing sabotage:', error);
    return {
      success: false,
      detected: true,
      damageDealt: 0,
      componentsDestroyed: [],
      progressLost: 0,
      resourcesWasted: { metal: 0, energy: 0 },
    };
  }
}

/**
 * Calculate sabotage success chance
 */
function calculateSuccessChance(targetType: string, sabotageSkill: number): number {
  const baseChance = sabotageSkill / 100; // 0-100 skill maps to 0-100% base
  
  const difficultyMap: Record<string, number> = {
    'MISSILE': 0.7,    // Easier
    'FACTORY': 0.5,    // Moderate
    'RESEARCH': 0.3,   // Harder
  };
  
  const difficulty = difficultyMap[targetType] || 0.5;
  return Math.min(0.9, baseChance * difficulty);
}

/**
 * Calculate detection risk
 */
function calculateDetectionRisk(targetType: string, sabotageSkill: number): number {
  const baseRisk: Record<string, number> = {
    'MISSILE': 0.4,
    'FACTORY': 0.5,
    'RESEARCH': 0.6,
  };
  
  const risk = (baseRisk[targetType] || 0.5) - (sabotageSkill / 200);
  return Math.max(0.1, Math.min(0.9, risk));
}

/**
 * Apply sabotage damage to target
 */
async function applySabotageDamage(
  db: Db,
  targetType: string,
  targetId: string,
  sabotageSkill: number
): Promise<Partial<SabotageResult>> {
  const damage: Partial<SabotageResult> = {
    damageDealt: 0,
    componentsDestroyed: [],
    progressLost: 0,
    resourcesWasted: { metal: 0, energy: 0 },
  };
  
  if (targetType === 'MISSILE') {
    // Damage missile assembly
    const progressLost = Math.floor((sabotageSkill / 100) * 25); // Up to 25%
    damage.progressLost = progressLost;
    damage.damageDealt = progressLost * 1000;
    damage.resourcesWasted = {
      metal: progressLost * 10000,
      energy: progressLost * 15000,
    };
    
    // Update missile in database
    const collection = db.collection('wmd_missiles');
    await collection.updateOne(
      { missileId: targetId },
      {
        $inc: { assemblyProgress: -progressLost },
        $set: { updatedAt: new Date() },
      }
    );
  } else if (targetType === 'FACTORY') {
    // Damage factory production
    damage.damageDealt = sabotageSkill * 100;
    damage.resourcesWasted = {
      metal: sabotageSkill * 500,
      energy: sabotageSkill * 750,
    };
    
    const collection = db.collection('factories');
    await collection.updateOne(
      { factoryId: targetId },
      {
        $inc: { productionEfficiency: -Math.floor(sabotageSkill / 10) },
        $set: { updatedAt: new Date() },
      }
    );
  } else if (targetType === 'RESEARCH') {
    // Delay research progress
    damage.progressLost = Math.floor(sabotageSkill / 5); // Slow down research
    damage.damageDealt = sabotageSkill * 50;
    
    const collection = db.collection('wmd_player_research');
    await collection.updateOne(
      { playerId: targetId },
      {
        $inc: { researchDelay: damage.progressLost },
        $set: { updatedAt: new Date() },
      }
    );
  }
  
  return damage;
}

/**
 * Record sabotage operation
 */
async function recordSabotage(
  db: Db,
  spyId: string,
  targetType: string,
  targetId: string,
  result: SabotageResult
): Promise<void> {
  try {
    const collection = db.collection('wmd_sabotage_operations');
    await collection.insertOne({
      sabotageId: `sab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      spyId,
      targetType,
      targetId,
      success: result.success,
      detected: result.detected,
      damageDealt: result.damageDealt,
      executedAt: new Date(),
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Error recording sabotage:', error);
  }
}

/**
 * Get sabotage history for player
 */
export async function getSabotageHistory(
  db: Db,
  playerId: string,
  limit: number = 20
): Promise<any[]> {
  try {
    const collection = db.collection('wmd_sabotage_operations');
    return await collection
      .find({ targetId: playerId })
      .sort({ executedAt: -1 })
      .limit(limit)
      .toArray();
  } catch (error) {
    console.error('Error getting sabotage history:', error);
    return [];
  }
}
