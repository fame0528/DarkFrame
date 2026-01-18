/**
 * @file lib/referralService.ts
 * Created: 2025-10-24
 * 
 * OVERVIEW:
 * Core business logic for player referral and recruitment system.
 * Handles code generation, validation, reward calculation, and abuse detection.
 * 
 * FEATURES:
 * - Unique referral code generation
 * - Progressive reward scaling
 * - 7-day validation system
 * - Anti-abuse IP and email checking
 * - Milestone reward packages
 * - Welcome package distribution
 */

import { getDatabase } from './mongodb';
import { ObjectId } from 'mongodb';
import type {
  ReferralRecord,
  ReferralReward,
  WelcomePackage,
  AbuseCheckResult,
  ReferralMilestone,
  ReferralCodeValidation
} from '@/types/referral.types';
import type { Player } from '@/types/game.types';

/**
 * Generate unique referral code for player
 * Format: DF-XXXXXXXX (8 alphanumeric characters)
 */
export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars (0, O, I, 1)
  let code = 'DF-';
  
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
}

/**
 * Generate referral link from code
 */
export function generateReferralLink(code: string): string {
  const baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseURL}/register?ref=${code}`;
}

/**
 * Validate referral code exists and is active
 */
export async function validateReferralCode(code: string): Promise<ReferralCodeValidation> {
  const db = await getDatabase();
  
  const referrer = await db.collection('players').findOne({
    referralCode: code,
    isBot: { $ne: true } // Don't allow bot referral codes
  });
  
  if (!referrer) {
    return {
      valid: false,
      error: 'Invalid referral code'
    };
  }
  
  return {
    valid: true,
    code,
    referrerUsername: referrer.username
  };
}

/**
 * Referral milestone definitions with rewards
 * CONSERVATIVE: Targets ~5M total resources at 100 referrals
 * 
 * Distribution Strategy:
 * - Base rewards (10k × 2.0 cap × 100): ~2.5M resources
 * - Milestone bonuses (8 milestones): ~2.5M resources
 * - Total target: 5M resources at 100 referrals (~2-3 hours farming value)
 * 
 * VIP Strategy: 30-day cap enforced, front-loaded in early milestones
 * RP Strategy: ~12k total (0.45% of WMD tree = meaningful starter progression)
 */
export const REFERRAL_MILESTONES: ReferralMilestone[] = [
  {
    count: 1,
    name: 'First Recruiter',
    title: 'Recruiter',
    rewards: {
      metal: 25000,       // 25k bonus (celebrating first referral)
      energy: 25000,
      rp: 20,             // Early RP boost
      xp: 3000,
      vipDays: 2,         // 2 bonus + 1 base = 3 total
      specialReward: 'Recruiter Title'
    },
    description: 'Recruit your first player'
  },
  {
    count: 3,
    name: 'Active Recruiter',
    rewards: {
      metal: 50000,       // 50k bonus
      energy: 50000,
      rp: 40,
      xp: 6000,
      vipDays: 3,         // Cumulative: 3+1 = 4 days (total: ~7 days)
      specialReward: '5 Elite Infantry Units'
    },
    description: 'Recruit 3 players'
  },
  {
    count: 5,
    name: 'Talent Scout',
    title: 'Talent Scout',
    badge: 'bronze_recruiter',
    rewards: {
      metal: 100000,      // 100k bonus
      energy: 100000,
      rp: 80,             // Enough for unit tiers
      xp: 10000,
      vipDays: 5,         // Cumulative: 5+1 = 6 days (total: ~13 days)
      specialReward: 'Bronze Recruiter Badge'
    },
    description: 'Recruit 5 players and earn Bronze badge'
  },
  {
    count: 10,
    name: 'Dedicated Recruiter',
    rewards: {
      metal: 250000,      // 250k bonus
      energy: 250000,
      rp: 200,            // Mid-tier WMD tech unlock
      xp: 25000,
      vipDays: 7,         // Cumulative: 7+1 = 8 days (total: ~21 days)
      specialReward: "Unlock 'Recruiter's Squad' Unit + 5% Permanent Resource Bonus"
    },
    description: 'Recruit 10 players and unlock special unit'
  },
  {
    count: 15,
    name: 'Elite Recruiter',
    title: 'Elite Recruiter',
    badge: 'silver_recruiter',
    rewards: {
      metal: 500000,      // 500k bonus
      energy: 500000,
      rp: 400,            // Significant WMD progress
      xp: 50000,
      vipDays: 5,         // Approach cap (total: ~26 days)
      specialReward: 'Silver Recruiter Badge + Legendary Unit Pack (2 units)'
    },
    description: 'Recruit 15 players and earn Silver badge'
  },
  {
    count: 25,
    name: 'Master Recruiter',
    title: 'Ambassador',
    rewards: {
      metal: 750000,      // 750k bonus
      energy: 750000,
      rp: 800,            // Advanced WMD techs
      xp: 100000,
      vipDays: 2,         // Last VIP milestone (reaches 30-day cap)
      specialReward: "Unlock 'Ambassador' Prestige Unit + 10% Permanent XP Bonus"
    },
    description: 'Recruit 25 players and unlock prestige unit'
  },
  {
    count: 50,
    name: 'Legendary Recruiter',
    title: 'Legendary Recruiter',
    badge: 'gold_recruiter',
    rewards: {
      metal: 625000,      // 625k bonus (second largest)
      energy: 625000,
      rp: 1500,           // High-tier WMD research
      xp: 200000,
      vipDays: 0,         // VIP cap reached - RP/resources instead
      specialReward: 'Gold Badge + Permanent 10% Resource Boost + Advanced Research Pack'
    },
    description: 'Recruit 50 players and earn legendary status'
  },
  {
    count: 100,
    name: 'Empire Builder',
    title: 'Empire Builder',
    badge: 'diamond_recruiter',
    rewards: {
      metal: 150000,      // 150k bonus (prestige achievement, not resource-focused)
      energy: 150000,
      rp: 3000,           // Elite WMD research (grand prize is RP + prestige)
      xp: 500000,
      vipDays: 0,         // VIP cap - alternative rewards
      specialReward: "Unlock 'Empire Builder' Ultimate Unit + Diamond Badge + Permanent 25% All Bonuses + Custom Profile Frame"
    },
    description: 'Recruit 100 players - the ultimate achievement'
  }
];

/**
 * Calculate progressive rewards for a specific referral number
 * Rewards scale: base + (count * multiplier * progressiveFactor)
 * 
 * CONSERVATIVE: Targets ~5M total resources at 100 referrals
 * Base: 10k metal/energy per referral
 * Progressive multiplier: 1.05x per referral, CAPPED at 2.0x (reached ~referral #15)
 * VIP: CAPPED at 30 days total (enforced via currentVIPDays parameter)
 * RP: 15 per referral for meaningful WMD progression (~12k total at 100)
 */
export function calculateReferralReward(
  referralCount: number,
  globalMultiplier: number = 1.0,
  currentVIPDays: number = 0
): ReferralReward {
  const VIP_CAP = 30; // Maximum 30 days VIP from referrals
  const PROGRESSIVE_CAP = 2.0; // Cap multiplier at 2.0x (prevents extreme scaling)
  
  const baseReward = {
    metal: 10000,     // 10k metal per referral (conservative, ~2.5M base total)
    energy: 10000,    // 10k energy per referral
    rp: 15,           // 15 RP per referral (~12k total at 100 = 0.45% WMD tree)
    xp: 2000,         // 2k XP per referral
    vipDays: 1        // 1 VIP day per referral (subject to cap)
  };
  
  // Progressive multiplier: 1.05x per referral, capped at 2.0x
  const progressiveFactor = Math.min(
    Math.pow(1.05, referralCount - 1),
    PROGRESSIVE_CAP
  );
  
  const reward: ReferralReward = {
    metal: Math.floor(baseReward.metal * progressiveFactor * globalMultiplier),
    energy: Math.floor(baseReward.energy * progressiveFactor * globalMultiplier),
    rp: Math.floor(baseReward.rp * progressiveFactor * globalMultiplier),
    xp: Math.floor(baseReward.xp * progressiveFactor * globalMultiplier),
    vipDays: Math.floor(baseReward.vipDays * globalMultiplier) // Will be capped below
  };
  
  // Check for milestone bonus
  const milestone = REFERRAL_MILESTONES.find(m => m.count === referralCount);
  if (milestone) {
    reward.metal += milestone.rewards.metal;
    reward.energy += milestone.rewards.energy;
    reward.rp += milestone.rewards.rp;
    reward.xp += milestone.rewards.xp;
    reward.vipDays += milestone.rewards.vipDays;
    reward.specialReward = milestone.rewards.specialReward;
    reward.milestone = milestone.count;
  }
  
  // Apply VIP cap: limit total VIP days to 30
  if (currentVIPDays >= VIP_CAP) {
    reward.vipDays = 0; // Already at cap
  } else if (currentVIPDays + reward.vipDays > VIP_CAP) {
    reward.vipDays = VIP_CAP - currentVIPDays; // Partial award to reach cap
  }
  
  return reward;
}

/**
 * Get welcome package for new players (with referral code)
 * Generous starter package to encourage new player retention
 * Awarded upon tutorial completion
 */
export function getWelcomePackage(): WelcomePackage {
  return {
    metal: 50000,        // 50k starter metal (solid starting boost)
    energy: 50000,       // 50k starter energy
    items: [
      {
        id: 'digger_legendary',
        name: 'Legendary Digger',
        type: 'digger',
        quantity: 1
      }
    ],
    xpBoostPercent: 25,
    xpBoostDuration: 7, // days
    vipTrialDays: 3,
    title: 'Recruit'
  };
}

/**
 * Get starter package for new players (without referral code)
 * Half the value of the full welcome package
 * Awarded upon tutorial completion
 */
export function getStarterPackage(): WelcomePackage {
  return {
    metal: 25000,        // 25k starter metal (half of full package)
    energy: 25000,       // 25k starter energy (half of full package)
    items: [
      {
        id: 'digger_rare',
        name: 'Rare Digger',
        type: 'digger',
        quantity: 1
      }
    ],
    xpBoostPercent: 15,  // 15% boost (reduced from 25%)
    xpBoostDuration: 3,  // 3 days (reduced from 7)
    vipTrialDays: 1,     // 1-day VIP trial (reduced from 3)
    title: 'Recruit'
  };
}

/**
 * Check for referral abuse patterns
 * - Same IP creating multiple accounts
 * - Suspicious email domains (temp email services)
 * - Rapid signups from same referral code
 */
export async function checkForAbuse(
  email: string,
  ip: string,
  referralCode: string
): Promise<AbuseCheckResult> {
  const db = await getDatabase();
  const flags: string[] = [];
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  
  // Check how many accounts from this IP used the same referral code
  const sameIPReferrals = await db.collection('referrals').countDocuments({
    referrerCode: referralCode,
    newPlayerIP: ip
  });
  
  if (sameIPReferrals >= 3) {
    flags.push(`IP ${ip} has already created ${sameIPReferrals} accounts with this referral code`);
    riskLevel = 'high';
    return {
      allowed: false,
      reason: 'Maximum referrals per IP exceeded (3 limit)',
      flags,
      riskLevel
    };
  }
  
  if (sameIPReferrals >= 2) {
    flags.push(`IP ${ip} has created ${sameIPReferrals} accounts with this code`);
    riskLevel = 'medium';
  }
  
  // Check for temporary email domains
  const tempEmailDomains = [
    'tempmail.com', 'guerrillamail.com', '10minutemail.com', 'throwaway.email',
    'mailinator.com', 'temp-mail.org', 'getnada.com', 'maildrop.cc'
  ];
  
  const emailDomain = email.split('@')[1]?.toLowerCase();
  if (emailDomain && tempEmailDomains.includes(emailDomain)) {
    flags.push(`Temporary email domain detected: ${emailDomain}`);
    riskLevel = 'medium';
  }
  
  // Check for rapid signups (more than 5 in last hour from same code)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentSignups = await db.collection('referrals').countDocuments({
    referrerCode: referralCode,
    signupDate: { $gte: oneHourAgo }
  });
  
  if (recentSignups >= 5) {
    flags.push(`${recentSignups} signups in last hour from this referral code`);
    riskLevel = 'high';
  }
  
  return {
    allowed: true,
    flags,
    riskLevel
  };
}

/**
 * Create referral record when new player signs up with code
 */
export async function createReferralRecord(
  referrerCode: string,
  newPlayer: Player,
  ip: string
): Promise<ObjectId> {
  const db = await getDatabase();
  
  // Get referrer info
  const referrer = await db.collection('players').findOne({ referralCode: referrerCode });
  if (!referrer) {
    throw new Error('Referrer not found');
  }
  
  // Calculate current VIP days from referrals (for cap enforcement)
  const currentVIPDays = referrer.referralRewardsEarned?.vipDays || 0;
  
  // Calculate what rewards referrer will get when this validates
  const futureRewards = calculateReferralReward(
    (referrer.totalReferrals || 0) + (referrer.pendingReferrals || 0) + 1,
    referrer.referralMultiplier || 1.0,
    currentVIPDays
  );
  
  const record: ReferralRecord = {
    referrerCode,
    referrerUsername: referrer.username,
    referrerPlayerId: new ObjectId(referrer._id),
    newPlayerUsername: newPlayer.username,
    newPlayerEmail: newPlayer.email,
    newPlayerIP: ip,
    signupDate: new Date(),
    validationDate: null,
    validated: false,
    loginCount: 1, // First login is signup
    lastLogin: new Date(),
    daysActive: 0,
    rewardsClaimed: false,
    rewardsData: futureRewards,
    welcomePackageGiven: false, // Will be set true after package is given
    flaggedForAbuse: false,
    flagReason: null,
    adminNotes: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const result = await db.collection('referrals').insertOne(record);
  
  // Update referrer's pending count
  await db.collection('players').updateOne(
    { _id: referrer._id },
    {
      $inc: { pendingReferrals: 1 }
    }
  );
  
  return result.insertedId;
}

/**
 * Check if referred player meets 7-day validation criteria
 * - Must be at least 7 days since signup
 * - Must have logged in at least 4 times
 */
export async function checkReferralValidation(referralId: ObjectId): Promise<boolean> {
  const db = await getDatabase();
  
  const record = await db.collection('referrals').findOne({ _id: referralId });
  if (!record || record.validated) {
    return false;
  }
  
  const daysSinceSignup = (Date.now() - record.signupDate.getTime()) / (1000 * 60 * 60 * 24);
  
  // Must be 7+ days and 4+ logins
  return daysSinceSignup >= 7 && record.loginCount >= 4;
}

/**
 * Validate a referral and distribute rewards to referrer
 */
export async function validateReferral(referralId: ObjectId): Promise<boolean> {
  const db = await getDatabase();
  
  const record = await db.collection('referrals').findOne({ _id: referralId });
  if (!record || record.validated) {
    return false;
  }
  
  const now = new Date();
  
  // Mark referral as validated
  await db.collection('referrals').updateOne(
    { _id: referralId },
    {
      $set: {
        validated: true,
        validationDate: now,
        updatedAt: now
      }
    }
  );
  
  // Update new player status
  await db.collection('players').updateOne(
    { username: record.newPlayerUsername },
    {
      $set: {
        referralValidated: true,
        referralValidatedAt: now
      }
    }
  );
  
  // Update referrer stats and pending count
  const referrer = await db.collection('players').findOne({ _id: record.referrerPlayerId });
  if (!referrer) {
    return false;
  }
  
  const newTotalReferrals = (referrer.totalReferrals || 0) + 1;
  const newPendingReferrals = Math.max(0, (referrer.pendingReferrals || 1) - 1);
  
  // Check for milestone achievement
  const milestone = REFERRAL_MILESTONES.find(m => m.count === newTotalReferrals);
  const updateData: any = {
    $set: {
      totalReferrals: newTotalReferrals,
      pendingReferrals: newPendingReferrals,
      lastReferralValidated: now
    },
    $inc: {
      'referralRewardsEarned.metal': record.rewardsData.metal,
      'referralRewardsEarned.energy': record.rewardsData.energy,
      'referralRewardsEarned.rp': record.rewardsData.rp,
      'referralRewardsEarned.xp': record.rewardsData.xp,
      'referralRewardsEarned.vipDays': record.rewardsData.vipDays,
      'resources.metal': record.rewardsData.metal,
      'resources.energy': record.rewardsData.energy,
      researchPoints: record.rewardsData.rp,
      xp: record.rewardsData.xp
    }
  };
  
  // Add milestone achievements
  if (milestone) {
    if (milestone.title) {
      updateData.$addToSet = updateData.$addToSet || {};
      updateData.$addToSet.referralTitles = milestone.title;
    }
    if (milestone.badge) {
      updateData.$addToSet = updateData.$addToSet || {};
      updateData.$addToSet.referralBadges = milestone.badge;
    }
    updateData.$addToSet = updateData.$addToSet || {};
    updateData.$addToSet.referralMilestonesReached = newTotalReferrals;
  }
  
  // Add VIP days if any
  if (record.rewardsData.vipDays > 0) {
    const currentVIPExpiration = referrer.vipExpiration || new Date();
    const newVIPExpiration = new Date(
      Math.max(currentVIPExpiration.getTime(), Date.now()) + 
      (record.rewardsData.vipDays * 24 * 60 * 60 * 1000)
    );
    
    updateData.$set.vipExpiration = newVIPExpiration;
    updateData.$set.vip = true;
    updateData.$set.vipLastUpdated = now;
  }
  
  await db.collection('players').updateOne(
    { _id: record.referrerPlayerId },
    updateData
  );
  
  // Mark rewards as claimed
  await db.collection('referrals').updateOne(
    { _id: referralId },
    {
      $set: {
        rewardsClaimed: true,
        updatedAt: now
      }
    }
  );
  
  return true;
}

/**
 * Get next milestone for player
 */
export function getNextMilestone(currentReferrals: number): ReferralMilestone | null {
  return REFERRAL_MILESTONES.find(m => m.count > currentReferrals) || null;
}

/**
 * Calculate progress to next milestone (0-100)
 */
export function calculateMilestoneProgress(currentReferrals: number): number {
  const nextMilestone = getNextMilestone(currentReferrals);
  if (!nextMilestone) {
    return 100; // All milestones reached
  }
  
  const previousMilestoneCount = REFERRAL_MILESTONES
    .filter(m => m.count < nextMilestone.count)
    .reduce((max, m) => Math.max(max, m.count), 0);
  
  const progress = ((currentReferrals - previousMilestoneCount) / (nextMilestone.count - previousMilestoneCount)) * 100;
  return Math.min(100, Math.max(0, progress));
}
