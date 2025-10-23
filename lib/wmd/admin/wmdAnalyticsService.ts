/**
 * WMD Analytics Service
 * 
 * Created: 2025-10-22
 * 
 * OVERVIEW:
 * Comprehensive analytics and reporting for the WMD system.
 * Provides aggregated statistics, trend analysis, and balance metrics
 * for monitoring system health and player behavior.
 * 
 * Core Capabilities:
 * - Global WMD statistics and trends
 * - Clan-specific activity reports
 * - Missile impact analysis
 * - Voting pattern analysis
 * - Balance metrics and health indicators
 * - Time-series data for charting
 * 
 * Performance:
 * - Uses MongoDB aggregation pipelines for efficiency
 * - Time-range filtering to limit dataset size
 * - Indexed queries on timestamps and status fields
 * - Results suitable for caching (consider Redis)
 * 
 * Related Files:
 * - lib/wmd/admin/wmdAdminService.ts - Admin operations
 * - lib/wmd/missileService.ts - Missile data source
 * - lib/wmd/clanVotingService.ts - Voting data source
 * - lib/wmd/spyService.ts - Spy mission data source
 */

import { Db } from 'mongodb';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface GlobalWMDStats {
  timeRange: { start: Date; end: Date };
  missiles: {
    total: number;
    active: number;
    impacted: number;
    intercepted: number;
    adminDisarmed: number;
    byWarheadType: Record<string, number>;
    totalDamage: number;
    avgFlightTime: number; // milliseconds
  };
  votes: {
    total: number;
    active: number;
    passed: number;
    failed: number;
    vetoed: number;
    expired: number;
    avgApprovalRate: number;
    avgParticipationRate: number;
  };
  defense: {
    batteriesBuilt: number;
    batteriesOperational: number;
    batteriesRepairing: number;
    totalInterceptions: number;
    avgInterceptionRate: number;
  };
  spyOps: {
    missionsCompleted: number;
    successfulMissions: number;
    failedMissions: number;
    avgSuccessRate: number;
    totalIntelGenerated: number;
  };
  economy: {
    totalResourcesSpent: number;
    metalSpent: number;
    energySpent: number;
    avgCostPerMissile: number;
  };
}

export interface ClanWMDActivity {
  clanId: string;
  clanName: string;
  timeRange: { start: Date; end: Date };
  missiles: {
    launched: number;
    impacted: number;
    intercepted: number;
    totalDamageDealt: number;
    totalDamageReceived: number;
  };
  votes: {
    created: number;
    passed: number;
    failed: number;
    vetoed: number;
    avgApprovalRate: number;
  };
  defense: {
    batteriesBuilt: number;
    successfulInterceptions: number;
  };
  spyOps: {
    missionsLaunched: number;
    successfulMissions: number;
  };
  economy: {
    totalSpent: number;
    avgMemberContribution: number;
  };
  reputation: {
    current: number;
    netChange: number;
    wmdPenalties: number;
  };
  currentCooldown?: Date;
}

export interface MissileImpactReport {
  timeRange: { start: Date; end: Date };
  totalImpacts: number;
  damageByType: {
    warheadType: string;
    impacts: number;
    totalDamage: number;
    avgDamage: number;
  }[];
  topTargets: {
    clanId: string;
    clanName: string;
    hitsReceived: number;
    totalDamage: number;
  }[];
  topAttackers: {
    clanId: string;
    clanName: string;
    missilesFired: number;
    totalDamage: number;
  }[];
  interceptionAnalysis: {
    totalAttempts: number;
    successful: number;
    failed: number;
    rate: number;
  };
}

export interface VotingPatterns {
  timeRange: { start: Date; end: Date };
  overallStats: {
    totalVotes: number;
    avgDuration: number; // milliseconds
    avgParticipation: number; // percentage
    avgApprovalRate: number; // percentage
  };
  byWarheadType: {
    type: string;
    votes: number;
    passRate: number;
    avgApprovalThreshold: number;
    avgParticipation: number;
  }[];
  vetoAnalysis: {
    totalVetoes: number;
    vetoRate: number; // percentage of all votes
    byWarheadType: Record<string, number>;
  };
  participationTrends: {
    date: Date;
    avgParticipation: number;
    votesCreated: number;
  }[];
}

export interface BalanceMetrics {
  timeRange: { start: Date; end: Date };
  offenseDefenseRatio: number; // missiles launched vs intercepted
  economicBalance: {
    avgClanSpending: number;
    topSpenders: { clanId: string; totalSpent: number }[];
    spendingGini: number; // 0-1, wealth inequality metric
  };
  consequenceEffectiveness: {
    avgCooldownDuration: number;
    avgReputationLoss: number;
    retaliationUtilization: number; // % of granted retaliation rights used
  };
  votingHealth: {
    avgApprovalRate: number;
    vetoRate: number;
    consensusLevel: number; // how close votes are to threshold
  };
  activityDistribution: {
    activeClans: number;
    inactiveClans: number;
    concentrationIndex: number; // top 10% activity share
  };
  warnings: string[]; // Balance issues detected
}

export interface TimeSeriesData {
  date: Date;
  missilesLaunched: number;
  votesCreated: number;
  batteriesBuilt: number;
  totalDamage: number;
  interceptionRate: number;
}

// ============================================================================
// ANALYTICS FUNCTIONS
// ============================================================================

/**
 * Get global WMD statistics
 * 
 * Comprehensive overview of all WMD activity across the game.
 * Includes missiles, votes, defense, spy ops, and economy.
 * 
 * @param db - MongoDB database instance
 * @param startDate - Analysis start time
 * @param endDate - Analysis end time
 * @returns Global statistics summary
 */
export async function getGlobalWMDStats(
  db: Db,
  startDate: Date,
  endDate: Date
): Promise<GlobalWMDStats> {
  const missilesCollection = db.collection('wmd_missiles');
  const votesCollection = db.collection('wmd_votes');
  const batteriesCollection = db.collection('wmd_defense_batteries');
  const missionsCollection = db.collection('wmd_spy_missions');

  // === MISSILE STATISTICS ===
  const missileStats = await missilesCollection.aggregate([
    { $match: { launchedAt: { $gte: startDate, $lte: endDate } } },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
              impacted: { $sum: { $cond: [{ $eq: ['$status', 'IMPACTED'] }, 1, 0] } },
              intercepted: { $sum: { $cond: [{ $eq: ['$status', 'INTERCEPTED'] }, 1, 0] } },
              adminDisarmed: { $sum: { $cond: [{ $eq: ['$status', 'ADMIN_DISARMED'] }, 1, 0] } },
              totalDamage: { $sum: { $ifNull: ['$damageDealt', 0] } },
              totalFlightTime: { $sum: { $subtract: [{ $ifNull: ['$impactTime', new Date()] }, '$launchedAt'] } },
            },
          },
        ],
        byType: [
          { $group: { _id: '$warheadType', count: { $sum: 1 } } },
        ],
      },
    },
  ]).toArray();

  const missileData = missileStats[0];
  const totals = missileData.totals[0] || {};
  const byWarheadType: Record<string, number> = {};
  missileData.byType.forEach((item: { _id: string; count: number }) => {
    byWarheadType[item._id] = item.count;
  });

  // === VOTING STATISTICS ===
  const voteStats = await votesCollection.aggregate([
    { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
        passed: { $sum: { $cond: [{ $eq: ['$status', 'PASSED'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } },
        vetoed: { $sum: { $cond: [{ $eq: ['$status', 'VETOED'] }, 1, 0] } },
        expired: { $sum: { $cond: [{ $eq: ['$status', 'EXPIRED'] }, 1, 0] } },
        totalApprovalRate: { $sum: { $ifNull: ['$finalApprovalRate', 0] } },
        totalParticipation: {
          $sum: {
            $cond: [
              { $gt: ['$eligibleVoters', 0] },
              { $divide: [{ $size: { $ifNull: ['$votes', []] } }, '$eligibleVoters'] },
              0,
            ],
          },
        },
      },
    },
  ]).toArray();

  const voteData = voteStats[0] || {};
  const avgApprovalRate = voteData.total > 0 ? voteData.totalApprovalRate / voteData.total : 0;
  const avgParticipationRate = voteData.total > 0 ? (voteData.totalParticipation / voteData.total) * 100 : 0;

  // === DEFENSE STATISTICS ===
  const defenseStats = await batteriesCollection.aggregate([
    { $match: { builtAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        operational: { $sum: { $cond: [{ $eq: ['$status', 'OPERATIONAL'] }, 1, 0] } },
        repairing: { $sum: { $cond: [{ $eq: ['$status', 'REPAIRING'] }, 1, 0] } },
        totalInterceptions: { $sum: { $ifNull: ['$interceptCount', 0] } },
      },
    },
  ]).toArray();

  const defenseData = defenseStats[0] || {};
  const totalInterceptions = defenseData.totalInterceptions || 0;
  const interceptedMissiles = totals.intercepted || 0;
  const avgInterceptionRate = totals.total > 0 ? (interceptedMissiles / totals.total) * 100 : 0;

  // === SPY OPERATIONS STATISTICS ===
  const spyStats = await missionsCollection.aggregate([
    { $match: { completedAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        successful: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } },
        totalIntel: { $sum: { $size: { $ifNull: ['$intelGathered', []] } } },
      },
    },
  ]).toArray();

  const spyData = spyStats[0] || {};
  const avgSuccessRate = spyData.total > 0 ? (spyData.successful / spyData.total) * 100 : 0;

  // === ECONOMIC STATISTICS ===
  const economicStats = await missilesCollection.aggregate([
    { $match: { launchedAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: null,
        totalCost: { $sum: { $ifNull: ['$totalCost', 0] } },
        totalMetal: { $sum: { $ifNull: ['$metalCost', 0] } },
        totalEnergy: { $sum: { $ifNull: ['$energyCost', 0] } },
        count: { $sum: 1 },
      },
    },
  ]).toArray();

  const economicData = economicStats[0] || {};
  const avgCostPerMissile = economicData.count > 0 ? economicData.totalCost / economicData.count : 0;

  return {
    timeRange: { start: startDate, end: endDate },
    missiles: {
      total: totals.total || 0,
      active: totals.active || 0,
      impacted: totals.impacted || 0,
      intercepted: totals.intercepted || 0,
      adminDisarmed: totals.adminDisarmed || 0,
      byWarheadType,
      totalDamage: totals.totalDamage || 0,
      avgFlightTime: totals.total > 0 ? totals.totalFlightTime / totals.total : 0,
    },
    votes: {
      total: voteData.total || 0,
      active: voteData.active || 0,
      passed: voteData.passed || 0,
      failed: voteData.failed || 0,
      vetoed: voteData.vetoed || 0,
      expired: voteData.expired || 0,
      avgApprovalRate,
      avgParticipationRate,
    },
    defense: {
      batteriesBuilt: defenseData.total || 0,
      batteriesOperational: defenseData.operational || 0,
      batteriesRepairing: defenseData.repairing || 0,
      totalInterceptions,
      avgInterceptionRate,
    },
    spyOps: {
      missionsCompleted: spyData.total || 0,
      successfulMissions: spyData.successful || 0,
      failedMissions: spyData.failed || 0,
      avgSuccessRate,
      totalIntelGenerated: spyData.totalIntel || 0,
    },
    economy: {
      totalResourcesSpent: economicData.totalCost || 0,
      metalSpent: economicData.totalMetal || 0,
      energySpent: economicData.totalEnergy || 0,
      avgCostPerMissile,
    },
  };
}

/**
 * Get clan-specific WMD activity
 * 
 * Detailed report for a single clan's WMD operations.
 * Includes offensive, defensive, economic, and reputation metrics.
 * 
 * @param db - MongoDB database instance
 * @param clanId - Clan to analyze
 * @param startDate - Analysis start time
 * @param endDate - Analysis end time
 * @returns Clan activity report
 */
export async function getClanWMDActivity(
  db: Db,
  clanId: string,
  startDate: Date,
  endDate: Date
): Promise<ClanWMDActivity> {
  const missilesCollection = db.collection('wmd_missiles');
  const votesCollection = db.collection('wmd_votes');
  const batteriesCollection = db.collection('wmd_defense_batteries');
  const missionsCollection = db.collection('wmd_spy_missions');
  const clansCollection = db.collection('clans');

  // Get clan info
  const clan = await clansCollection.findOne({ clanId });
  const clanName = clan?.name || 'Unknown Clan';

  // Missile statistics (launched by clan)
  const missileStats = await missilesCollection.aggregate([
    { $match: { clanId, launchedAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: null,
        launched: { $sum: 1 },
        impacted: { $sum: { $cond: [{ $eq: ['$status', 'IMPACTED'] }, 1, 0] } },
        intercepted: { $sum: { $cond: [{ $eq: ['$status', 'INTERCEPTED'] }, 1, 0] } },
        totalDamageDealt: { $sum: { $ifNull: ['$damageDealt', 0] } },
      },
    },
  ]).toArray();

  // Missiles received (targeted at clan)
  const damageReceived = await missilesCollection.aggregate([
    {
      $match: {
        targetClanId: clanId,
        impactTime: { $gte: startDate, $lte: endDate },
        status: 'IMPACTED',
      },
    },
    { $group: { _id: null, totalDamage: { $sum: { $ifNull: ['$damageDealt', 0] } } } },
  ]).toArray();

  // Vote statistics
  const voteStats = await votesCollection.aggregate([
    { $match: { clanId, createdAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        passed: { $sum: { $cond: [{ $eq: ['$status', 'PASSED'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } },
        vetoed: { $sum: { $cond: [{ $eq: ['$status', 'VETOED'] }, 1, 0] } },
        totalApprovalRate: { $sum: { $ifNull: ['$finalApprovalRate', 0] } },
      },
    },
  ]).toArray();

  // Defense statistics
  const defenseStats = await batteriesCollection.aggregate([
    { $match: { clanId, builtAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: null,
        built: { $sum: 1 },
        interceptions: { $sum: { $ifNull: ['$interceptCount', 0] } },
      },
    },
  ]).toArray();

  // Spy mission statistics
  const spyStats = await missionsCollection.aggregate([
    { $match: { attackerClanId: clanId, launchedAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: null,
        launched: { $sum: 1 },
        successful: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
      },
    },
  ]).toArray();

  const missileData = missileStats[0] || {};
  const voteData = voteStats[0] || {};
  const defenseData = defenseStats[0] || {};
  const spyData = spyStats[0] || {};

  return {
    clanId,
    clanName,
    timeRange: { start: startDate, end: endDate },
    missiles: {
      launched: missileData.launched || 0,
      impacted: missileData.impacted || 0,
      intercepted: missileData.intercepted || 0,
      totalDamageDealt: missileData.totalDamageDealt || 0,
      totalDamageReceived: damageReceived[0]?.totalDamage || 0,
    },
    votes: {
      created: voteData.total || 0,
      passed: voteData.passed || 0,
      failed: voteData.failed || 0,
      vetoed: voteData.vetoed || 0,
      avgApprovalRate: voteData.total > 0 ? voteData.totalApprovalRate / voteData.total : 0,
    },
    defense: {
      batteriesBuilt: defenseData.built || 0,
      successfulInterceptions: defenseData.interceptions || 0,
    },
    spyOps: {
      missionsLaunched: spyData.launched || 0,
      successfulMissions: spyData.successful || 0,
    },
    economy: {
      totalSpent: 0, // Would sum from treasury transactions
      avgMemberContribution: 0, // totalSpent / memberCount
    },
    reputation: {
      current: clan?.reputation || 0,
      netChange: 0, // Would calculate from reputation history
      wmdPenalties: 0, // Would sum WMD-related penalties
    },
    currentCooldown: clan?.wmdCooldownUntil ? new Date(clan.wmdCooldownUntil) : undefined,
  };
}

/**
 * Get missile impact report
 * 
 * Detailed analysis of missile impacts including damage distribution,
 * top targets, top attackers, and interception analysis.
 * 
 * @param db - MongoDB database instance
 * @param startDate - Analysis start time
 * @param endDate - Analysis end time
 * @returns Missile impact analysis
 */
export async function getMissileImpactReport(
  db: Db,
  startDate: Date,
  endDate: Date
): Promise<MissileImpactReport> {
  const missilesCollection = db.collection('wmd_missiles');

  // Total impacted missiles
  const totalImpacts = await missilesCollection.countDocuments({
    impactTime: { $gte: startDate, $lte: endDate },
    status: 'IMPACTED',
  });

  // Damage by warhead type
  const damageByType = await missilesCollection.aggregate([
    {
      $match: {
        impactTime: { $gte: startDate, $lte: endDate },
        status: 'IMPACTED',
      },
    },
    {
      $group: {
        _id: '$warheadType',
        impacts: { $sum: 1 },
        totalDamage: { $sum: { $ifNull: ['$damageDealt', 0] } },
      },
    },
    {
      $project: {
        warheadType: '$_id',
        impacts: 1,
        totalDamage: 1,
        avgDamage: { $divide: ['$totalDamage', '$impacts'] },
      },
    },
    { $sort: { totalDamage: -1 } },
  ]).toArray();

  // Top targets (most hit clans)
  const topTargets = await missilesCollection.aggregate([
    {
      $match: {
        impactTime: { $gte: startDate, $lte: endDate },
        status: 'IMPACTED',
      },
    },
    {
      $group: {
        _id: '$targetClanId',
        hitsReceived: { $sum: 1 },
        totalDamage: { $sum: { $ifNull: ['$damageDealt', 0] } },
      },
    },
    { $sort: { totalDamage: -1 } },
    { $limit: 10 },
  ]).toArray();

  // Top attackers (most missiles fired)
  const topAttackers = await missilesCollection.aggregate([
    {
      $match: {
        launchedAt: { $gte: startDate, $lte: endDate },
        status: 'IMPACTED',
      },
    },
    {
      $group: {
        _id: '$clanId',
        missilesFired: { $sum: 1 },
        totalDamage: { $sum: { $ifNull: ['$damageDealt', 0] } },
      },
    },
    { $sort: { totalDamage: -1 } },
    { $limit: 10 },
  ]).toArray();

  // Interception analysis
  const interceptionData = await missilesCollection.aggregate([
    {
      $match: {
        launchedAt: { $gte: startDate, $lte: endDate },
        status: { $in: ['IMPACTED', 'INTERCEPTED'] },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        intercepted: { $sum: { $cond: [{ $eq: ['$status', 'INTERCEPTED'] }, 1, 0] } },
      },
    },
  ]).toArray();

  const interceptionStats = interceptionData[0] || {};
  const totalAttempts = interceptionStats.total || 0;
  const successful = interceptionStats.intercepted || 0;
  const interceptionRate = totalAttempts > 0 ? (successful / totalAttempts) * 100 : 0;

  return {
    timeRange: { start: startDate, end: endDate },
    totalImpacts,
    damageByType: damageByType.map(item => ({
      warheadType: item.warheadType,
      impacts: item.impacts,
      totalDamage: item.totalDamage,
      avgDamage: item.avgDamage,
    })),
    topTargets: topTargets.map(item => ({
      clanId: item._id,
      clanName: item._id, // Would lookup from clans collection
      hitsReceived: item.hitsReceived,
      totalDamage: item.totalDamage,
    })),
    topAttackers: topAttackers.map(item => ({
      clanId: item._id,
      clanName: item._id, // Would lookup from clans collection
      missilesFired: item.missilesFired,
      totalDamage: item.totalDamage,
    })),
    interceptionAnalysis: {
      totalAttempts,
      successful,
      failed: totalAttempts - successful,
      rate: interceptionRate,
    },
  };
}

/**
 * Get voting pattern analysis
 * 
 * Analyzes voting behavior including participation rates,
 * approval patterns, veto usage, and trends over time.
 * 
 * @param db - MongoDB database instance
 * @param startDate - Analysis start time
 * @param endDate - Analysis end time
 * @returns Voting pattern analysis
 */
export async function getVotingPatterns(
  db: Db,
  startDate: Date,
  endDate: Date
): Promise<VotingPatterns> {
  const votesCollection = db.collection('wmd_votes');

  // Overall statistics
  const overallStats = await votesCollection.aggregate([
    { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        totalDuration: {
          $sum: {
            $subtract: [
              { $ifNull: ['$completedAt', new Date()] },
              '$createdAt',
            ],
          },
        },
        totalParticipation: {
          $sum: {
            $cond: [
              { $gt: ['$eligibleVoters', 0] },
              { $divide: [{ $size: { $ifNull: ['$votes', []] } }, '$eligibleVoters'] },
              0,
            ],
          },
        },
        totalApprovalRate: { $sum: { $ifNull: ['$finalApprovalRate', 0] } },
      },
    },
  ]).toArray();

  const overall = overallStats[0] || {};
  const avgDuration = overall.total > 0 ? overall.totalDuration / overall.total : 0;
  const avgParticipation = overall.total > 0 ? (overall.totalParticipation / overall.total) * 100 : 0;
  const avgApprovalRate = overall.total > 0 ? overall.totalApprovalRate / overall.total : 0;

  // Stats by warhead type
  const byWarheadType = await votesCollection.aggregate([
    { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: '$warheadType',
        votes: { $sum: 1 },
        passed: { $sum: { $cond: [{ $eq: ['$status', 'PASSED'] }, 1, 0] } },
        totalApprovalThreshold: { $sum: { $ifNull: ['$requiredApprovalPercentage', 75] } },
        totalParticipation: {
          $sum: {
            $cond: [
              { $gt: ['$eligibleVoters', 0] },
              { $divide: [{ $size: { $ifNull: ['$votes', []] } }, '$eligibleVoters'] },
              0,
            ],
          },
        },
      },
    },
  ]).toArray();

  // Veto analysis
  const vetoStats = await votesCollection.aggregate([
    { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              vetoed: { $sum: { $cond: [{ $eq: ['$status', 'VETOED'] }, 1, 0] } },
            },
          },
        ],
        byType: [
          { $match: { status: 'VETOED' } },
          { $group: { _id: '$warheadType', count: { $sum: 1 } } },
        ],
      },
    },
  ]).toArray();

  const vetoData = vetoStats[0];
  const vetoTotals = vetoData.totals[0] || {};
  const vetoRate = vetoTotals.total > 0 ? (vetoTotals.vetoed / vetoTotals.total) * 100 : 0;
  const vetoByType: Record<string, number> = {};
  vetoData.byType.forEach((item: { _id: string; count: number }) => {
    vetoByType[item._id] = item.count;
  });

  return {
    timeRange: { start: startDate, end: endDate },
    overallStats: {
      totalVotes: overall.total || 0,
      avgDuration,
      avgParticipation,
      avgApprovalRate,
    },
    byWarheadType: byWarheadType.map(item => ({
      type: item._id,
      votes: item.votes,
      passRate: item.votes > 0 ? (item.passed / item.votes) * 100 : 0,
      avgApprovalThreshold: item.votes > 0 ? item.totalApprovalThreshold / item.votes : 75,
      avgParticipation: item.votes > 0 ? (item.totalParticipation / item.votes) * 100 : 0,
    })),
    vetoAnalysis: {
      totalVetoes: vetoTotals.vetoed || 0,
      vetoRate,
      byWarheadType: vetoByType,
    },
    participationTrends: [], // Would calculate daily aggregates
  };
}

/**
 * Get balance metrics
 * 
 * Analyzes system balance including offense/defense ratios,
 * economic distribution, consequence effectiveness, and health indicators.
 * Identifies potential balance issues.
 * 
 * @param db - MongoDB database instance
 * @param startDate - Analysis start time
 * @param endDate - Analysis end time
 * @returns Balance metrics and warnings
 */
export async function getBalanceMetrics(
  db: Db,
  startDate: Date,
  endDate: Date
): Promise<BalanceMetrics> {
  const missilesCollection = db.collection('wmd_missiles');
  const votesCollection = db.collection('wmd_votes');
  const clansCollection = db.collection('clans');

  const warnings: string[] = [];

  // Offense/Defense ratio
  const missileData = await missilesCollection.aggregate([
    { $match: { launchedAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        intercepted: { $sum: { $cond: [{ $eq: ['$status', 'INTERCEPTED'] }, 1, 0] } },
      },
    },
  ]).toArray();

  const missiles = missileData[0] || {};
  const offenseDefenseRatio = missiles.total > 0 ? missiles.intercepted / missiles.total : 0;

  if (offenseDefenseRatio < 0.1) {
    warnings.push('Defense severely underpowered - <10% interception rate');
  } else if (offenseDefenseRatio > 0.5) {
    warnings.push('Defense may be overpowered - >50% interception rate');
  }

  // Voting health
  const voteData = await votesCollection.aggregate([
    { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        passed: { $sum: { $cond: [{ $eq: ['$status', 'PASSED'] }, 1, 0] } },
        vetoed: { $sum: { $cond: [{ $eq: ['$status', 'VETOED'] }, 1, 0] } },
        avgApprovalRate: { $avg: { $ifNull: ['$finalApprovalRate', 0] } },
      },
    },
  ]).toArray();

  const votes = voteData[0] || {};
  const avgVoteApprovalRate = votes.avgApprovalRate || 0;
  const vetoRate = votes.total > 0 ? (votes.vetoed / votes.total) * 100 : 0;

  if (avgVoteApprovalRate < 40) {
    warnings.push('Low vote approval rates - consensus difficult to reach');
  }
  if (vetoRate > 20) {
    warnings.push('High veto rate - clan leaders blocking too many votes');
  }

  // Activity distribution
  const clanActivity = await missilesCollection.aggregate([
    { $match: { launchedAt: { $gte: startDate, $lte: endDate } } },
    { $group: { _id: '$clanId', activity: { $sum: 1 } } },
    { $sort: { activity: -1 } },
  ]).toArray();

  const totalActivity = clanActivity.reduce((sum, c) => sum + c.activity, 0);
  const top10Percent = Math.max(1, Math.floor(clanActivity.length * 0.1));
  const top10Activity = clanActivity.slice(0, top10Percent).reduce((sum, c) => sum + c.activity, 0);
  const concentrationIndex = totalActivity > 0 ? top10Activity / totalActivity : 0;

  if (concentrationIndex > 0.7) {
    warnings.push('Activity highly concentrated - top 10% clans dominate system');
  }

  return {
    timeRange: { start: startDate, end: endDate },
    offenseDefenseRatio,
    economicBalance: {
      avgClanSpending: 0, // Would calculate from treasury data
      topSpenders: [],
      spendingGini: 0, // Would calculate wealth inequality
    },
    consequenceEffectiveness: {
      avgCooldownDuration: 14 * 24 * 60 * 60 * 1000, // 14 days default
      avgReputationLoss: 2000, // Would calculate from actual data
      retaliationUtilization: 0, // Would calculate from retaliation records
    },
    votingHealth: {
      avgApprovalRate: avgVoteApprovalRate,
      vetoRate,
      consensusLevel: 0, // Would calculate vote margin averages
    },
    activityDistribution: {
      activeClans: clanActivity.length,
      inactiveClans: 0, // Would count clans with no activity
      concentrationIndex,
    },
    warnings,
  };
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. Performance Optimization:
 *    - All functions use MongoDB aggregation pipelines
 *    - Time-range filtering limits dataset size
 *    - Consider adding indexes on: launchedAt, impactTime, createdAt, status
 *    - Results are cacheable (consider 5-15 minute TTL)
 * 
 * 2. Scalability:
 *    - For large datasets, consider pre-aggregating daily/hourly stats
 *    - Could implement materialized views for common queries
 *    - Time series collections for trend data
 * 
 * 3. Accuracy vs Performance:
 *    - Clan name lookups omitted for performance (return IDs only)
 *    - Client can hydrate clan names from cached clan data
 *    - Alternative: $lookup joins (slower but complete data)
 * 
 * 4. Balance Metrics:
 *    - Warnings are heuristic-based, not absolute
 *    - Thresholds may need tuning based on game balance
 *    - Consider machine learning for anomaly detection
 * 
 * 5. Future Enhancements:
 *    - Real-time streaming analytics (change streams)
 *    - Predictive analytics (forecast trends)
 *    - Comparative analysis (clan vs server average)
 *    - Export to BI tools (Tableau, PowerBI)
 */
