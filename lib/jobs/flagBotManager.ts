/**
 * @file lib/jobs/flagBotManager.ts
 * @created 2025-10-23
 * @overview Flag Bot Background Job - 30-Minute Movement & Reset
 * 
 * OVERVIEW:
 * Manages automated flag bot behavior via scheduled background job.
 * Runs every 30 minutes to teleport flag bot to random location and
 * reset/respawn bot if flag unclaimed for > 1 hour.
 * 
 * Features:
 * - 30-minute interval bot movement (random teleportation)
 * - Automatic reset if flag unclaimed > 1 hour
 * - Error isolation (doesn't crash server on failure)
 * - Execution metrics and logging
 * - Graceful handling of player-held flags (skips movement)
 * 
 * Integration:
 * - Called by server.ts on startup
 * - Integrates with flagBotService.ts for bot operations
 * - Uses MongoDB for flag state persistence
 * 
 * Related Files:
 * - /lib/flagBotService.ts - Bot lifecycle management
 * - /lib/wmd/jobs/scheduler.ts - Similar job pattern
 * - /server.ts - Job initialization
 * 
 * @implements Background Job Pattern
 */

import { Db } from 'mongodb';
import {
  getFlagBot,
  moveFlagBot,
  resetFlagBot,
  shouldResetFlag,
  initializeFlagSystem,
} from '@/lib/flagBotService';

/**
 * Job execution statistics
 */
interface FlagBotJobStats {
  lastRun: Date | null;
  nextRun: Date | null;
  executionCount: number;
  errorCount: number;
  movementCount: number;
  resetCount: number;
  averageExecutionTime: number;
}

/**
 * Global job state
 */
let jobInterval: NodeJS.Timeout | null = null;
let jobStats: FlagBotJobStats = {
  lastRun: null,
  nextRun: null,
  executionCount: 0,
  errorCount: 0,
  movementCount: 0,
  resetCount: 0,
  averageExecutionTime: 0,
};

/**
 * Job configuration
 */
const FLAG_BOT_JOB_CONFIG = {
  name: 'Flag Bot Manager',
  interval: 30 * 60 * 1000, // 30 minutes in milliseconds
  // interval: 2 * 60 * 1000, // 2 minutes for testing - UNCOMMENT FOR TESTING
};

// ============================================================
// MAIN JOB HANDLER
// ============================================================

/**
 * Flag Bot Manager Job Handler
 * Executes every 30 minutes to manage flag bot behavior
 * 
 * Process:
 * 1. Check if flag needs reset (unclaimed > 1 hour)
 * 2. If yes: Reset flag bot (despawn old, spawn new)
 * 3. If no: Get current flag bot
 * 4. If bot exists: Move to random position
 * 5. If no bot and no player: Initialize flag system
 * 
 * @param db - MongoDB database instance
 * @returns Number of operations performed
 * 
 * @example
 * ```typescript
 * const operations = await flagBotManagerJob(db);
 * console.log(`Flag bot job: ${operations} operations`);
 * ```
 */
async function flagBotManagerJob(db: Db): Promise<number> {
  const startTime = Date.now();
  let operationsPerformed = 0;

  try {
    console.log(`[Flag Bot Job] 🏴 Starting execution...`);

    // Check if flag needs reset (unclaimed > 1 hour)
    const needsReset = await shouldResetFlag();
    
    if (needsReset) {
      console.log('[Flag Bot Job] 🔄 Flag unclaimed > 1 hour, resetting...');
      await resetFlagBot();
      jobStats.resetCount++;
      operationsPerformed++;
      console.log('[Flag Bot Job] ✅ Flag bot reset complete');
      return operationsPerformed;
    }

    // Get current flag bot
    const flagBot = await getFlagBot();

    if (flagBot) {
      // Bot holds flag - move to random position
      console.log(`[Flag Bot Job] 🎯 Moving flag bot: ${flagBot.username}`);
      
      // Get bot ID from database query (Player type doesn't include _id in interface)
      const botDoc = await db.collection('players').findOne({ username: flagBot.username });
      if (botDoc) {
        const newPosition = await moveFlagBot(botDoc._id);
        jobStats.movementCount++;
        operationsPerformed++;
        console.log(
          `[Flag Bot Job] ✅ Flag bot moved to (${newPosition.x}, ${newPosition.y})`
        );
      }
    } else {
      // No bot found - check if flag exists at all
      const flagDoc = await db.collection('flags').findOne({});
      
      if (!flagDoc || !flagDoc.currentHolder) {
        // No flag system initialized - initialize it
        console.log('[Flag Bot Job] 🏴 No flag found, initializing system...');
        await initializeFlagSystem();
        operationsPerformed++;
        console.log('[Flag Bot Job] ✅ Flag system initialized');
      } else {
        // Player holds flag - skip movement
        console.log(
          `[Flag Bot Job] 👤 Player holds flag: ${flagDoc.currentHolder.username} - skipping movement`
        );
      }
    }

    // Update statistics
    const executionTime = Date.now() - startTime;
    jobStats.lastRun = new Date();
    jobStats.executionCount++;
    jobStats.averageExecutionTime =
      (jobStats.averageExecutionTime * (jobStats.executionCount - 1) + executionTime) /
      jobStats.executionCount;

    console.log(
      `[Flag Bot Job] ✅ Execution complete in ${executionTime}ms (${operationsPerformed} operations)`
    );

    return operationsPerformed;
  } catch (error) {
    jobStats.errorCount++;
    console.error('[Flag Bot Job] ❌ Error during execution:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Don't throw - let job continue on next interval
    return operationsPerformed;
  }
}

// ============================================================
// JOB LIFECYCLE MANAGEMENT
// ============================================================

/**
 * Start the Flag Bot Manager job
 * Initializes flag system and starts 30-minute interval job
 * 
 * @param db - MongoDB database instance
 * @returns Success status with message
 * 
 * @example
 * ```typescript
 * const result = await startFlagBotJob(db);
 * if (result.success) {
 *   console.log('Flag bot job started:', result.message);
 * }
 * ```
 */
export async function startFlagBotJob(db: Db): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    // Prevent duplicate job instances
    if (jobInterval) {
      return {
        success: false,
        message: 'Flag bot job already running',
      };
    }

    // Initialize flag system on first startup
    console.log('[Flag Bot Job] 🏴 Initializing flag system...');
    await initializeFlagSystem();
    console.log('[Flag Bot Job] ✅ Flag system initialized');

    // Start interval job
    jobInterval = setInterval(async () => {
      await flagBotManagerJob(db);
    }, FLAG_BOT_JOB_CONFIG.interval);

    // Calculate next run time
    jobStats.nextRun = new Date(Date.now() + FLAG_BOT_JOB_CONFIG.interval);

    console.log(
      `[Flag Bot Job] ✅ Started with ${FLAG_BOT_JOB_CONFIG.interval / 1000 / 60}min interval`
    );

    return {
      success: true,
      message: `Flag bot job started (interval: ${FLAG_BOT_JOB_CONFIG.interval / 1000 / 60}min)`,
    };
  } catch (error) {
    console.error('[Flag Bot Job] ❌ Failed to start:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Stop the Flag Bot Manager job
 * Clears interval and resets state
 * 
 * @returns Success status with message
 * 
 * @example
 * ```typescript
 * const result = stopFlagBotJob();
 * console.log('Flag bot job stopped:', result.message);
 * ```
 */
export function stopFlagBotJob(): {
  success: boolean;
  message: string;
} {
  try {
    if (!jobInterval) {
      return {
        success: false,
        message: 'Flag bot job not running',
      };
    }

    clearInterval(jobInterval);
    jobInterval = null;
    jobStats.nextRun = null;

    console.log('[Flag Bot Job] 🛑 Stopped');

    return {
      success: true,
      message: 'Flag bot job stopped successfully',
    };
  } catch (error) {
    console.error('[Flag Bot Job] ❌ Error stopping job:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get current job statistics
 * Used for health checks and monitoring
 * 
 * @returns Current job execution statistics
 * 
 * @example
 * ```typescript
 * const stats = getFlagBotJobStats();
 * console.log(`Executions: ${stats.executionCount}, Errors: ${stats.errorCount}`);
 * ```
 */
export function getFlagBotJobStats(): FlagBotJobStats {
  return { ...jobStats };
}

/**
 * Get job status information
 * Used for admin dashboards and debugging
 * 
 * @returns Job status and configuration
 */
export function getFlagBotJobInfo(): {
  name: string;
  interval: number;
  isRunning: boolean;
  stats: FlagBotJobStats;
} {
  return {
    name: FLAG_BOT_JOB_CONFIG.name,
    interval: FLAG_BOT_JOB_CONFIG.interval,
    isRunning: jobInterval !== null,
    stats: getFlagBotJobStats(),
  };
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// 
// Job Pattern:
// - Follows WMD scheduler pattern (lib/wmd/jobs/scheduler.ts)
// - Separate start/stop functions for lifecycle management
// - Error isolation (one failure doesn't crash server)
// - Execution metrics for monitoring
// 
// Timing Strategy:
// - 30-minute interval for bot movement (configurable)
// - Checks for reset every execution (1-hour unclaimed threshold)
// - Initializes flag system on server startup
// - Skips movement if player holds flag
// 
// Error Handling:
// - Try/catch around entire job execution
// - Errors logged but don't stop job
// - Error count tracked in statistics
// - Graceful degradation (continues on next interval)
// 
// Database Operations:
// - Uses flagBotService for all flag operations
// - No direct database manipulation in job
// - All operations atomic and idempotent
// - Safe to run multiple times (no duplicate flags)
// 
// Testing:
// - Change interval to 2 minutes for testing (line 78)
// - Monitor console logs for execution confirmations
// - Check MongoDB flags collection for bot movements
// - Verify flag transfers work with attack API
// 
// Production Considerations:
// - Job runs continuously in server process
// - Graceful shutdown via stopFlagBotJob()
// - Statistics available for health monitoring
// - Can be integrated with external monitoring tools
// 
// Related Lessons:
// - Lesson #35: Zero mocks - all data from MongoDB
// - Lesson #37: Complete file reading before implementation
// 
// ============================================================
// END OF FILE
// ============================================================
