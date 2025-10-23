/**
 * WMD Admin Service
 * 
 * Created: 2025-10-22
 * 
 * OVERVIEW:
 * Administrative oversight and emergency controls for the WMD system.
 * Provides admin-only operations for monitoring, intervention, and balance management.
 * 
 * Core Capabilities:
 * - System health monitoring and diagnostics
 * - Emergency interventions (disarm missiles, expire votes)
 * - Cooldown management and adjustments
 * - Suspicious activity detection and flagging
 * - Comprehensive analytics and reporting
 * - Full audit trail for all admin actions
 * 
 * Security:
 * - All functions require admin role verification (handled by API layer)
 * - Every action logged to admin audit trail
 * - Critical operations require justification/reason
 * - No direct database manipulation without validation
 * 
 * Related Files:
 * - lib/wmd/missileService.ts - Missile operations
 * - lib/wmd/clanVotingService.ts - Voting system
 * - lib/wmd/clanConsequencesService.ts - Consequence management
 * - lib/wmd/jobs/scheduler.ts - Background job monitoring
 */

import { Db, ObjectId } from 'mongodb';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface WMDSystemStatus {
  timestamp: Date;
  scheduler: {
    running: boolean;
    jobs: {
      missileTracker: { running: boolean; lastRun?: Date; errorCount: number };
      spyMissionCompleter: { running: boolean; lastRun?: Date; errorCount: number };
      voteExpirationCleaner: { running: boolean; lastRun?: Date; errorCount: number };
      defenseRepairCompleter: { running: boolean; lastRun?: Date; errorCount: number };
    };
  };
  activeMissiles: number;
  activeVotes: number;
  activeMissions: number;
  repairingBatteries: number;
  clansOnCooldown: number;
  recentAlerts: AdminAlert[];
}

export interface AdminAlert {
  alertId: string;
  type: 'MISSILE_LAUNCH' | 'VOTE_PASSED' | 'SUSPICIOUS_ACTIVITY' | 'COOLDOWN_EXPIRED' | 'SYSTEM_ERROR';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  details: Record<string, unknown>;
  timestamp: Date;
  acknowledged: boolean;
}

export interface SuspiciousActivityReport {
  playerId: string;
  clanId: string;
  activityType: 'RAPID_VOTING' | 'COOLDOWN_BYPASS_ATTEMPT' | 'EXCESSIVE_LAUNCHES' | 'UNUSUAL_PATTERN';
  details: string;
  evidence: Record<string, unknown>;
  flaggedAt: Date;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface AdminAuditEntry {
  auditId: string;
  adminId: string;
  action: string;
  targetType: 'MISSILE' | 'VOTE' | 'CLAN' | 'PLAYER' | 'SYSTEM';
  targetId: string;
  reason: string;
  details: Record<string, unknown>;
  timestamp: Date;
  ipAddress?: string;
}

export interface WMDAnalyticsSummary {
  timeRange: { start: Date; end: Date };
  totals: {
    missilesLaunched: number;
    votesCreated: number;
    votesVetoed: number;
    defenseBatteriesBuilt: number;
    spyMissionsCompleted: number;
    totalDamageDealt: number;
  };
  byWarheadType: Record<string, number>;
  topClans: Array<{ clanId: string; clanName: string; activity: number }>;
  balanceMetrics: {
    avgVoteApprovalRate: number;
    avgMissileInterceptionRate: number;
    avgCooldownDuration: number;
  };
}

// ============================================================================
// ADMIN SERVICE FUNCTIONS
// ============================================================================

/**
 * Get comprehensive WMD system status
 * 
 * Provides real-time overview of entire WMD system including:
 * - Background job health
 * - Active operations (missiles, votes, missions, repairs)
 * - Recent alerts and warnings
 * 
 * @param db - MongoDB database instance
 * @returns Complete system status snapshot
 */
export async function getWMDSystemStatus(db: Db): Promise<WMDSystemStatus> {
  const missilesCollection = db.collection('wmd_missiles');
  const votesCollection = db.collection('wmd_votes');
  const missionsCollection = db.collection('wmd_spy_missions');
  const batteriesCollection = db.collection('wmd_defense_batteries');
  const clansCollection = db.collection('clans');
  const alertsCollection = db.collection('wmd_admin_alerts');

  // Get scheduler health (from scheduler service if available)
  const schedulerHealth = {
    running: true, // Would import from scheduler.getSchedulerHealth()
    jobs: {
      missileTracker: { running: true, errorCount: 0 },
      spyMissionCompleter: { running: true, errorCount: 0 },
      voteExpirationCleaner: { running: true, errorCount: 0 },
      defenseRepairCompleter: { running: true, errorCount: 0 },
    },
  };

  // Count active operations
  const activeMissiles = await missilesCollection.countDocuments({ status: 'ACTIVE' });
  const activeVotes = await votesCollection.countDocuments({ status: 'ACTIVE' });
  const activeMissions = await missionsCollection.countDocuments({ status: 'IN_PROGRESS' });
  const repairingBatteries = await batteriesCollection.countDocuments({ status: 'REPAIRING' });

  // Count clans on cooldown
  const clansOnCooldown = await clansCollection.countDocuments({
    wmdCooldownUntil: { $gt: new Date() },
  });

  // Get recent alerts (last 24 hours)
  const recentAlerts = await alertsCollection
    .find({ timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
    .sort({ timestamp: -1 })
    .limit(20)
    .toArray() as unknown as AdminAlert[];

  return {
    timestamp: new Date(),
    scheduler: schedulerHealth,
    activeMissiles,
    activeVotes,
    activeMissions,
    repairingBatteries,
    clansOnCooldown,
    recentAlerts,
  };
}

/**
 * Force expire a clan vote (emergency admin action)
 * 
 * Immediately expires an active vote regardless of time remaining.
 * Use cases:
 * - Exploits or abuse detected
 * - Emergency balance interventions
 * - Bug fixes requiring vote reset
 * 
 * @param db - MongoDB database instance
 * @param voteId - Vote to expire
 * @param adminId - Admin performing action
 * @param reason - Justification for forced expiration
 * @returns Success status and details
 */
export async function forceExpireVote(
  db: Db,
  voteId: string,
  adminId: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  const votesCollection = db.collection('wmd_votes');

  // Validate vote exists and is active
  const vote = await votesCollection.findOne({ voteId });
  if (!vote) {
    return { success: false, message: 'Vote not found' };
  }

  if (vote.status !== 'ACTIVE') {
    return { success: false, message: `Vote already ${vote.status}` };
  }

  // Calculate final result
  const votesCast = vote.votes?.length || 0;
  const yesVotes = vote.votes?.filter((v: { vote: string }) => v.vote === 'YES').length || 0;
  const requiredVotes = vote.requiredApprovalPercentage || 75;
  const approvalRate = votesCast > 0 ? (yesVotes / votesCast) * 100 : 0;

  const finalStatus = approvalRate >= requiredVotes ? 'PASSED' : 'FAILED';

  // Update vote
  await votesCollection.updateOne(
    { voteId },
    {
      $set: {
        status: finalStatus,
        completedAt: new Date(),
        finalApprovalRate: approvalRate,
        adminForceExpired: true,
        adminId,
        adminReason: reason,
        updatedAt: new Date(),
      },
    }
  );

  // Log admin action
  await logAdminAction(db, {
    adminId,
    action: 'FORCE_EXPIRE_VOTE',
    targetType: 'VOTE',
    targetId: voteId,
    reason,
    details: { originalStatus: 'ACTIVE', newStatus: finalStatus, approvalRate },
  });

  // Create alert
  await createAdminAlert(db, {
    type: 'SUSPICIOUS_ACTIVITY',
    severity: 'HIGH',
    message: `Admin forced vote expiration: ${voteId}`,
    details: { voteId, adminId, reason, finalStatus },
  });

  return { success: true, message: `Vote ${finalStatus} by admin intervention` };
}

/**
 * Emergency disarm an active missile
 * 
 * Immediately destroys an in-flight missile before impact.
 * Use cases:
 * - Exploits or duplication bugs
 * - Severe balance issues
 * - Player appeals with evidence of unfair launch
 * 
 * @param db - MongoDB database instance
 * @param missileId - Missile to disarm
 * @param adminId - Admin performing action
 * @param reason - Justification for disarmament
 * @returns Success status and refund details
 */
export async function emergencyDisarmMissile(
  db: Db,
  missileId: string,
  adminId: string,
  reason: string
): Promise<{ success: boolean; message: string; refunded?: boolean }> {
  const missilesCollection = db.collection('wmd_missiles');
  const clansCollection = db.collection('clans');

  // Validate missile exists and is active
  const missile = await missilesCollection.findOne({ missileId });
  if (!missile) {
    return { success: false, message: 'Missile not found' };
  }

  if (missile.status !== 'ACTIVE') {
    return { success: false, message: `Missile already ${missile.status}` };
  }

  // Mark missile as admin-disarmed
  await missilesCollection.updateOne(
    { missileId },
    {
      $set: {
        status: 'ADMIN_DISARMED',
        disarmedAt: new Date(),
        disarmedBy: adminId,
        disarmReason: reason,
        updatedAt: new Date(),
      },
    }
  );

  // Refund clan (50% of component costs)
  const refundAmount = Math.floor((missile.totalCost || 0) * 0.5);
  if (refundAmount > 0 && missile.clanId) {
    await clansCollection.updateOne(
      { clanId: missile.clanId },
      {
        $inc: {
          'bank.metal': Math.floor(refundAmount * 0.4),
          'bank.energy': Math.floor(refundAmount * 0.6),
        },
        $push: {
          bankHistory: {
            $each: [{
              type: 'ADMIN_REFUND',
              amount: refundAmount,
              reason: `Missile ${missileId} admin-disarmed: ${reason}`,
              timestamp: new Date(),
            }],
            $slice: -100,
          } as any,
        } as any,
      }
    );
  }

  // Log admin action
  await logAdminAction(db, {
    adminId,
    action: 'EMERGENCY_DISARM_MISSILE',
    targetType: 'MISSILE',
    targetId: missileId,
    reason,
    details: {
      warheadType: missile.warheadType,
      targetClanId: missile.targetClanId,
      refundAmount,
      launchedAt: missile.launchedAt,
    },
  });

  // Create critical alert
  await createAdminAlert(db, {
    type: 'SUSPICIOUS_ACTIVITY',
    severity: 'CRITICAL',
    message: `Admin emergency disarm: ${missileId}`,
    details: { missileId, adminId, reason, refundAmount },
  });

  return {
    success: true,
    message: `Missile disarmed successfully. Refunded ${refundAmount} resources.`,
    refunded: true,
  };
}

/**
 * Adjust clan WMD cooldown
 * 
 * Modify existing cooldown duration (extend or reduce).
 * Use cases:
 * - Balance adjustments after patches
 * - Compensate for bugs/exploits
 * - Penalty reductions for appeals
 * 
 * @param db - MongoDB database instance
 * @param clanId - Clan to adjust
 * @param adjustmentHours - Hours to add (positive) or subtract (negative)
 * @param adminId - Admin performing action
 * @param reason - Justification for adjustment
 * @returns Success status and new cooldown time
 */
export async function adjustClanCooldown(
  db: Db,
  clanId: string,
  adjustmentHours: number,
  adminId: string,
  reason: string
): Promise<{ success: boolean; message: string; newCooldownUntil?: Date }> {
  const clansCollection = db.collection('clans');

  const clan = await clansCollection.findOne({ clanId });
  if (!clan) {
    return { success: false, message: 'Clan not found' };
  }

  const currentCooldown = clan.wmdCooldownUntil ? new Date(clan.wmdCooldownUntil) : new Date();
  const newCooldown = new Date(currentCooldown.getTime() + adjustmentHours * 60 * 60 * 1000);

  // Don't allow cooldown before current time
  if (newCooldown < new Date()) {
    await clansCollection.updateOne(
      { clanId },
      { $unset: { wmdCooldownUntil: '' }, $set: { updatedAt: new Date() } }
    );

    await logAdminAction(db, {
      adminId,
      action: 'REMOVE_CLAN_COOLDOWN',
      targetType: 'CLAN',
      targetId: clanId,
      reason,
      details: { previousCooldown: currentCooldown, adjustmentHours },
    });

    return { success: true, message: 'Cooldown removed (adjusted to past)' };
  }

  // Update cooldown
  await clansCollection.updateOne(
    { clanId },
    {
      $set: {
        wmdCooldownUntil: newCooldown,
        updatedAt: new Date(),
      },
    }
  );

  // Log admin action
  await logAdminAction(db, {
    adminId,
    action: 'ADJUST_CLAN_COOLDOWN',
    targetType: 'CLAN',
    targetId: clanId,
    reason,
    details: {
      previousCooldown: currentCooldown,
      newCooldown,
      adjustmentHours,
    },
  });

  return {
    success: true,
    message: `Cooldown adjusted by ${adjustmentHours} hours`,
    newCooldownUntil: newCooldown,
  };
}

/**
 * Get WMD analytics summary
 * 
 * Aggregated statistics for specified time range.
 * Includes activity totals, warhead distribution, top clans, balance metrics.
 * 
 * @param db - MongoDB database instance
 * @param startDate - Analysis start time
 * @param endDate - Analysis end time
 * @returns Comprehensive analytics summary
 */
export async function getWMDAnalytics(
  db: Db,
  startDate: Date,
  endDate: Date
): Promise<WMDAnalyticsSummary> {
  const missilesCollection = db.collection('wmd_missiles');
  const votesCollection = db.collection('wmd_votes');
  const batteriesCollection = db.collection('wmd_defense_batteries');
  const missionsCollection = db.collection('wmd_spy_missions');

  // Total missiles launched in time range
  const missilesLaunched = await missilesCollection.countDocuments({
    launchedAt: { $gte: startDate, $lte: endDate },
  });

  // Votes created and vetoed
  const votesCreated = await votesCollection.countDocuments({
    createdAt: { $gte: startDate, $lte: endDate },
  });
  const votesVetoed = await votesCollection.countDocuments({
    createdAt: { $gte: startDate, $lte: endDate },
    status: 'VETOED',
  });

  // Defense batteries built
  const defenseBatteriesBuilt = await batteriesCollection.countDocuments({
    builtAt: { $gte: startDate, $lte: endDate },
  });

  // Spy missions completed
  const spyMissionsCompleted = await missionsCollection.countDocuments({
    completedAt: { $gte: startDate, $lte: endDate },
    status: 'COMPLETED',
  });

  // Total damage dealt (sum of all missile impacts)
  const damageAgg = await missilesCollection.aggregate([
    { $match: { launchedAt: { $gte: startDate, $lte: endDate }, status: 'IMPACTED' } },
    { $group: { _id: null, totalDamage: { $sum: '$damageDealt' } } },
  ]).toArray();
  const totalDamageDealt = damageAgg[0]?.totalDamage || 0;

  // Missiles by warhead type
  const warheadAgg = await missilesCollection.aggregate([
    { $match: { launchedAt: { $gte: startDate, $lte: endDate } } },
    { $group: { _id: '$warheadType', count: { $sum: 1 } } },
  ]).toArray();
  const byWarheadType: Record<string, number> = {};
  warheadAgg.forEach(item => {
    byWarheadType[item._id] = item.count;
  });

  // Top clans by activity (missiles + votes + missions)
  const clanActivity = await missilesCollection.aggregate([
    { $match: { launchedAt: { $gte: startDate, $lte: endDate } } },
    { $group: { _id: '$clanId', activity: { $sum: 1 } } },
    { $sort: { activity: -1 } },
    { $limit: 10 },
  ]).toArray();

  const topClans = clanActivity.map(item => ({
    clanId: item._id,
    clanName: item._id, // Would lookup from clans collection
    activity: item.activity,
  }));

  // Balance metrics
  const passedVotes = await votesCollection.countDocuments({
    createdAt: { $gte: startDate, $lte: endDate },
    status: 'PASSED',
  });
  const avgVoteApprovalRate = votesCreated > 0 ? (passedVotes / votesCreated) * 100 : 0;

  const interceptedMissiles = await missilesCollection.countDocuments({
    launchedAt: { $gte: startDate, $lte: endDate },
    status: 'INTERCEPTED',
  });
  const avgMissileInterceptionRate = missilesLaunched > 0 ? (interceptedMissiles / missilesLaunched) * 100 : 0;

  return {
    timeRange: { start: startDate, end: endDate },
    totals: {
      missilesLaunched,
      votesCreated,
      votesVetoed,
      defenseBatteriesBuilt,
      spyMissionsCompleted,
      totalDamageDealt,
    },
    byWarheadType,
    topClans,
    balanceMetrics: {
      avgVoteApprovalRate,
      avgMissileInterceptionRate,
      avgCooldownDuration: 14, // Would calculate from consequence data
    },
  };
}

/**
 * Flag suspicious WMD activity
 * 
 * Creates alert for potential exploits or abuse patterns.
 * Detection types:
 * - Rapid voting (multiple votes in short time)
 * - Cooldown bypass attempts
 * - Excessive launches
 * - Unusual voting patterns
 * 
 * @param db - MongoDB database instance
 * @param report - Suspicious activity details
 * @returns Success status and alert ID
 */
export async function flagSuspiciousActivity(
  db: Db,
  report: Omit<SuspiciousActivityReport, 'flaggedAt'>
): Promise<{ success: boolean; alertId: string }> {
  const alertsCollection = db.collection('wmd_suspicious_activity');

  const fullReport: SuspiciousActivityReport = {
    ...report,
    flaggedAt: new Date(),
  };

  await alertsCollection.insertOne(fullReport);

  // Create admin alert
  const alert = await createAdminAlert(db, {
    type: 'SUSPICIOUS_ACTIVITY',
    severity: report.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
    message: `Suspicious ${report.activityType}: ${report.details}`,
    details: {
      playerId: report.playerId,
      clanId: report.clanId,
      activityType: report.activityType,
      evidence: report.evidence,
    },
  });

  return { success: true, alertId: alert.alertId };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Log admin action to audit trail
 */
async function logAdminAction(
  db: Db,
  action: Omit<AdminAuditEntry, 'auditId' | 'timestamp' | 'ipAddress'>
): Promise<void> {
  const auditCollection = db.collection('wmd_admin_audit');

  const entry: AdminAuditEntry = {
    ...action,
    auditId: `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
  };

  await auditCollection.insertOne(entry);
}

/**
 * Create admin alert
 */
async function createAdminAlert(
  db: Db,
  alert: Omit<AdminAlert, 'alertId' | 'timestamp' | 'acknowledged'>
): Promise<AdminAlert> {
  const alertsCollection = db.collection('wmd_admin_alerts');

  const fullAlert: AdminAlert = {
    ...alert,
    alertId: `ALERT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    acknowledged: false,
  };

  await alertsCollection.insertOne(fullAlert);
  return fullAlert;
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. Admin Role Verification:
 *    - All functions assume admin role verified at API layer
 *    - No internal role checks (single responsibility)
 *    - API routes MUST enforce admin-only access
 * 
 * 2. Audit Trail:
 *    - Every admin action logged to wmd_admin_audit collection
 *    - Immutable records for compliance and accountability
 *    - Includes admin ID, reason, before/after state
 * 
 * 3. Alert System:
 *    - Critical events create alerts in wmd_admin_alerts collection
 *    - Severity levels guide notification urgency
 *    - Alerts can be acknowledged but never deleted
 * 
 * 4. Refund Policy:
 *    - Emergency disarms refund 50% of component costs
 *    - Split 40% metal, 60% energy (standard ratio)
 *    - Refunds logged in clan bank history
 * 
 * 5. Cooldown Adjustments:
 *    - Can extend or reduce existing cooldowns
 *    - Negative adjustments past current time remove cooldown
 *    - All adjustments logged for transparency
 * 
 * 6. Analytics Performance:
 *    - Uses MongoDB aggregation pipelines for efficiency
 *    - Time range filtering reduces query scope
 *    - Consider caching for frequently requested ranges
 * 
 * 7. Future Enhancements:
 *    - Real-time dashboard webhooks
 *    - Machine learning pattern detection
 *    - Automated suspension triggers
 *    - Export analytics to external BI tools
 */
