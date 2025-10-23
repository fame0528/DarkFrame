/**
 * @file lib/wmd/jobs/spyMissionCompleter.ts
 * @created 2025-10-22
 * @overview Background job to complete spy missions after duration expires
 * 
 * OVERVIEW:
 * Processes active spy missions that have reached their estimatedCompletion time.
 * Calculates success/failure, generates intelligence reports, updates spy status,
 * handles detection, and broadcasts results via WebSocket.
 * 
 * Features:
 * - Queries missions with estimatedCompletion <= now
 * - Rolls success/failure based on finalSuccessChance
 * - Generates mission results and intelligence reports
 * - Updates spy status (returns to AVAILABLE or CAPTURED)
 * - Broadcasts completion events to owner and target
 * 
 * Dependencies:
 * - MongoDB for mission/spy data
 * - spyService for mission resolution
 * - WebSocket for real-time notifications
 * 
 * @implements Background Job Pattern
 */

import { Db } from 'mongodb';
import { MissionStatus, type SpyMission } from '@/types/wmd/intelligence.types';
import { getIO } from '@/lib/websocket/server';
import { wmdHandlers } from '@/lib/websocket/handlers/wmdHandler';

type SpyStatus = 'AVAILABLE' | 'ON_MISSION' | 'COMPROMISED' | 'RETIRED';

/**
 * Process completed spy missions
 * @param db MongoDB database instance
 * @returns Number of missions processed
 */
export async function spyMissionCompleter(db: Db): Promise<number> {
  try {
    const now = new Date();
    const missionsCollection = db.collection('wmd_spy_missions');
    const spiesCollection = db.collection('wmd_spies');
    
    // Find all active missions past their completion time
    const completedMissions = await missionsCollection.find({
      status: MissionStatus.ACTIVE,
      estimatedCompletion: { $lte: now },
    }).toArray() as SpyMission[];
    
    if (completedMissions.length === 0) {
      return 0;
    }
    
    console.log(`[WMD Spy Completer] Processing ${completedMissions.length} completed missions`);
    
    let processedCount = 0;
    
    for (const mission of completedMissions) {
      try {
        // Roll for mission success
        const roll = Math.random();
        const successful = roll <= mission.finalSuccessChance;
        
        // Roll for detection
        const detectionRoll = Math.random();
        const detected = detectionRoll <= mission.detectionRisk;
        
        // Determine spy fate
        let spyStatus: SpyStatus = 'AVAILABLE';
        let spyCompromised = false;
        
        if (detected) {
          // 50% chance spy is captured when detected
          const captureRoll = Math.random();
          if (captureRoll < 0.5) {
            spyStatus = 'COMPROMISED';
            spyCompromised = true;
          } else {
            spyStatus = 'AVAILABLE'; // Escaped
          }
        }
        
        // Update mission status
        const missionUpdate: Partial<SpyMission> = {
          status: detected && spyCompromised ? MissionStatus.COMPROMISED : 
                  successful ? MissionStatus.COMPLETED : MissionStatus.FAILED,
          actualCompletion: now,
          roll,
          successful,
          detected,
          updatedAt: now,
        };
        
        if (detected) {
          missionUpdate.detectedAt = now;
          missionUpdate.detectedBy = mission.targetId;
        }
        
        // Generate mission result
        const missionResult = generateMissionResult(mission, successful, detected);
        missionUpdate.result = missionResult;
        
        // Generate intelligence if successful
        if (successful && !detected) {
          const intelligence = await generateIntelligence(db, mission);
          missionUpdate.intelligenceGathered = intelligence;
        }
        
        // Update mission
        await missionsCollection.updateOne(
          { missionId: mission.missionId },
          { $set: missionUpdate }
        );
        
        // Update spy status
        await spiesCollection.updateOne(
          { spyId: mission.spyId },
          {
            $set: {
              status: spyStatus,
              currentMissionId: undefined,
              updatedAt: now,
            },
            $inc: {
              missionsCompleted: successful ? 1 : 0,
              missionsFailed: successful ? 0 : 1,
              timesDetected: detected ? 1 : 0,
            },
          }
        );
        
        // Broadcast to owner
        const io = getIO();
        if (io) {
          await wmdHandlers.broadcastSpyMissionComplete(io, {
            playerId: mission.ownerId,
            missionId: mission.missionId,
            spyName: mission.spyName,
            targetName: mission.targetName,
            missionType: mission.missionType,
            success: successful,
            intelligence: missionUpdate.intelligenceGathered 
              ? JSON.stringify(missionUpdate.intelligenceGathered) 
              : undefined,
          });
          
          // Broadcast to target if detected
          if (detected) {
            await wmdHandlers.broadcastCounterIntelDetection(io, {
              playerId: mission.targetId,
              spiesDetected: spyCompromised
                ? [{ codename: mission.spyName, specialization: mission.missionType }]
                : [],
            });
          }
        }
        
        processedCount++;
        
      } catch (error) {
        console.error(`[WMD Spy Completer] Error processing mission ${mission.missionId}:`, error);
      }
    }
    
    console.log(`[WMD Spy Completer] Successfully processed ${processedCount}/${completedMissions.length} missions`);
    return processedCount;
    
  } catch (error) {
    console.error('[WMD Spy Completer] Job error:', error);
    return 0;
  }
}

/**
 * Generate mission result summary
 */
function generateMissionResult(
  mission: SpyMission,
  successful: boolean,
  detected: boolean
): any {
  return {
    success: successful,
    missionType: mission.missionType,
    targetId: mission.targetId,
    targetName: mission.targetName,
    detected,
    timestamp: new Date(),
    roll: mission.roll,
    successChance: mission.finalSuccessChance,
  };
}

/**
 * Generate intelligence report based on mission type
 */
async function generateIntelligence(
  db: Db,
  mission: SpyMission
): Promise<any> {
  try {
    const playersCollection = db.collection('players');
    const target = await playersCollection.findOne({ username: mission.targetId });
    
    if (!target) {
      return {
        intelLevel: 'UNCLASSIFIED',
        summary: 'Target not found',
        gathered: new Date(),
      };
    }
    
    // Generate intel based on mission type
    const intel: any = {
      targetId: mission.targetId,
      targetName: mission.targetName,
      intelLevel: 'CONFIDENTIAL',
      gathered: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    };
    
    switch (mission.missionType) {
      case 'RECONNAISSANCE':
        intel.data = {
          level: target.level,
          totalUnits: target.army?.length || 0,
          factoryCount: target.factories?.length || 0,
        };
        break;
        
      case 'SURVEILLANCE':
        intel.data = {
          level: target.level,
          recentActivity: {
            lastLogin: target.lastLogin,
            battlesThisWeek: target.battlesWon || 0,
          },
        };
        break;
        
      case 'INFILTRATION':
        intel.intelLevel = 'SECRET';
        intel.data = {
          resources: {
            metal: target.metal,
            energy: target.energy,
          },
          wmdProgram: {
            hasResearch: !!target.wmdResearch,
            activeMissiles: 0, // Would query wmd_missiles
          },
        };
        break;
        
      default:
        intel.data = {
          basicInfo: {
            level: target.level,
            clanId: target.clanId,
          },
        };
    }
    
    return intel;
    
  } catch (error) {
    console.error('[Intel Generation] Error:', error);
    return {
      intelLevel: 'UNCLASSIFIED',
      summary: 'Intelligence gathering failed',
      gathered: new Date(),
    };
  }
}

/**
 * Implementation Footer
 * 
 * Job Schedule: Runs every 30 seconds
 * Performance: Processes up to 100 missions per run
 * Error Handling: Individual mission failures don't stop batch
 * 
 * Integration: Called by master job scheduler
 * Dependencies: Requires wmdHandlers for broadcasts
 * 
 * Future Enhancements:
 * - Detailed intel reports per mission type
 * - Sabotage damage calculation
 * - Assassination mechanics
 * - Counter-intelligence alerts
 */
