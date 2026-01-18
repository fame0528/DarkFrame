/**
 * Moderation Service
 * Created: 2025-10-25
 * Updated: 2025-10-26 (FID-20251026-019 Phase 1)
 * Features: FID-20251025-103 (Admin Tools), FID-20251026-019 (Auto-Moderation)
 * 
 * OVERVIEW:
 * Comprehensive moderation system with both admin tools and auto-moderation.
 * Handles message deletion, user mutes (temporary and permanent), 
 * channel-specific bans, custom word blacklist, audit logging,
 * profanity filtering, spam detection, and auto-banning.
 * 
 * KEY FEATURES:
 * 
 * ADMIN TOOLS (FID-20251025-103):
 * - Message deletion with audit trail
 * - User mutes: 1 hour, 24 hours, 7 days, permanent
 * - Channel-specific bans (can ban from specific channels)
 * - Custom word blacklist management
 * - Moderation action history and audit log
 * - Auto-expiry for temporary mutes
 * - Admin permission validation
 * 
 * AUTO-MODERATION (FID-20251026-019):
 * - Profanity filter with bad-words library
 * - Spam detection (rate limiting, duplicate content, excessive caps)
 * - Auto-mute for spam (5 minutes)
 * - Warning system (3 strikes → 24h ban)
 * - Admin whitelist bypass
 * - Rate tracker cleanup
 * 
 * DEPENDENCIES:
 * - MongoDB for persistence
 * - bad-words for profanity detection
 * - chatService for message deletion
 */

import { MongoClient, ObjectId, Collection } from 'mongodb';
import { Filter } from 'bad-words';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Mute duration options
 */
export enum MuteDuration {
  ONE_HOUR = '1h',
  TWENTY_FOUR_HOURS = '24h',
  SEVEN_DAYS = '7d',
  PERMANENT = 'permanent',
}

/**
 * Moderation action type
 */
export enum ModActionType {
  DELETE_MESSAGE = 'delete_message',
  MUTE_USER = 'mute_user',
  UNMUTE_USER = 'unmute_user',
  BAN_FROM_CHANNEL = 'ban_from_channel',
  UNBAN_FROM_CHANNEL = 'unban_from_channel',
  ADD_TO_BLACKLIST = 'add_to_blacklist',
  REMOVE_FROM_BLACKLIST = 'remove_from_blacklist',
}

/**
 * User mute record
 */
export interface UserMute {
  _id: ObjectId;
  userId: string;
  username: string;
  mutedBy: string;
  mutedByUsername: string;
  reason: string;
  duration: MuteDuration;
  startTime: Date;
  expiryTime: Date | null; // null for permanent
  active: boolean;
  revokedAt?: Date;
  revokedBy?: string;
}

/**
 * Channel ban record
 */
export interface ChannelBan {
  _id: ObjectId;
  userId: string;
  username: string;
  channelId: string;
  bannedBy: string;
  bannedByUsername: string;
  reason: string;
  timestamp: Date;
  active: boolean;
  revokedAt?: Date;
  revokedBy?: string;
}

/**
 * Blacklist word record
 */
export interface BlacklistWord {
  _id: ObjectId;
  word: string;
  category: 'profanity' | 'slur' | 'spam' | 'custom';
  addedBy: string;
  addedByUsername: string;
  timestamp: Date;
  active: boolean;
}

/**
 * Moderation action log entry
 */
export interface ModActionLog {
  _id: ObjectId;
  actionType: ModActionType;
  moderatorId: string;
  moderatorUsername: string;
  targetUserId?: string;
  targetUsername?: string;
  channelId?: string;
  messageId?: string;
  word?: string;
  reason: string;
  timestamp: Date;
  metadata?: Record<string, any>; // Additional context
}

/**
 * Warning record for auto-moderation
 */
export interface UserWarning {
  _id: ObjectId;
  userId: string;
  username: string;
  reason: string;
  timestamp: Date;
  expiresAt: Date; // Warnings expire after 24 hours
}

/**
 * Spam rate tracking
 */
interface RateTracker {
  userId: string;
  messages: Date[];
  lastMessage: string;
  duplicateCount: number;
}

/**
 * Mute status check result
 */
export interface MuteStatus {
  isMuted: boolean;
  muteRecord?: UserMute;
  expiresIn?: number; // Seconds until expiry (if temporary)
}

/**
 * Ban status check result
 */
export interface BanStatus {
  isBanned: boolean;
  banRecord?: ChannelBan;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const MONGODB_URI = process.env.MONGODB_URI || '';
const COLLECTION_MUTES = 'user_mutes';
const COLLECTION_BANS = 'channel_bans';
const COLLECTION_BLACKLIST = 'word_blacklist';
const COLLECTION_MOD_LOG = 'moderation_actions';
const COLLECTION_WARNINGS = 'user_warnings';

// Auto-moderation configuration
const SPAM_RATE_LIMIT = 5; // Max messages per window
const SPAM_WINDOW_MS = 10000; // 10 seconds
const SPAM_DUPLICATE_THRESHOLD = 3; // Same message 3+ times = spam
const SPAM_CAPS_THRESHOLD = 0.7; // 70%+ caps = spam (min 10 chars)
const WARNING_EXPIRY_MS = 24 * 60 * 60 * 1000; // Warnings expire after 24h
const AUTO_BAN_THRESHOLD = 3; // 3 warnings = 24h ban
const AUTO_MUTE_DURATION_MS = 5 * 60 * 1000; // 5 minutes for spam

// Mute duration mappings (in milliseconds)
const MUTE_DURATIONS: Record<MuteDuration, number | null> = {
  [MuteDuration.ONE_HOUR]: 60 * 60 * 1000,
  [MuteDuration.TWENTY_FOUR_HOURS]: 24 * 60 * 60 * 1000,
  [MuteDuration.SEVEN_DAYS]: 7 * 24 * 60 * 60 * 1000,
  [MuteDuration.PERMANENT]: null,
};

// ============================================================================
// STATE
// ============================================================================

let client: MongoClient | null = null;
let mutesCollection: Collection<UserMute> | null = null;
let bansCollection: Collection<ChannelBan> | null = null;
let blacklistCollection: Collection<BlacklistWord> | null = null;
let modLogCollection: Collection<ModActionLog> | null = null;
let warningsCollection: Collection<UserWarning> | null = null;

// Auto-moderation state
const profanityFilter = new Filter();
const rateTrackers = new Map<string, RateTracker>();
let customBlacklist: string[] = [];

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

/**
 * Get MongoDB client instance (singleton pattern)
 */
async function getMongoClient(): Promise<MongoClient> {
  if (client) return client;

  client = new MongoClient(MONGODB_URI);
  await client.connect();
  
  const db = client.db();
  mutesCollection = db.collection<UserMute>(COLLECTION_MUTES);
  bansCollection = db.collection<ChannelBan>(COLLECTION_BANS);
  blacklistCollection = db.collection<BlacklistWord>(COLLECTION_BLACKLIST);
  modLogCollection = db.collection<ModActionLog>(COLLECTION_MOD_LOG);
  warningsCollection = db.collection<UserWarning>(COLLECTION_WARNINGS);

  // Create indexes
  await mutesCollection.createIndex({ userId: 1, active: 1 });
  await mutesCollection.createIndex({ expiryTime: 1 });
  await bansCollection.createIndex({ userId: 1, channelId: 1, active: 1 });
  await blacklistCollection.createIndex({ word: 1 });
  await modLogCollection.createIndex({ timestamp: -1 });
  await modLogCollection.createIndex({ moderatorId: 1 });
  await modLogCollection.createIndex({ targetUserId: 1 });
  await warningsCollection.createIndex({ userId: 1, expiresAt: 1 });

  // Load custom blacklist into profanity filter
  await reloadModerationBlacklist();

  return client;
}

/**
 * Get collections
 */
async function getCollections() {
  if (!mutesCollection || !bansCollection || !blacklistCollection || !modLogCollection || !warningsCollection) {
    await getMongoClient();
  }
  
  if (!mutesCollection || !bansCollection || !blacklistCollection || !modLogCollection || !warningsCollection) {
    throw new Error('Failed to initialize moderation collections');
  }
  
  return { mutesCollection, bansCollection, blacklistCollection, modLogCollection, warningsCollection };
}

// ============================================================================
// AUTO-MODERATION: PROFANITY FILTER
// ============================================================================

/**
 * Reload custom blacklist from database into profanity filter
 * Call this after adding/removing blacklisted words
 */
export async function reloadModerationBlacklist(): Promise<void> {
  try {
    const words = await getBlacklist();
    customBlacklist = words.map(w => w.word);
    
    // Add custom words to filter
    if (customBlacklist.length > 0) {
      profanityFilter.addWords(...customBlacklist);
    }
    
    console.log(`[ModerationService] Loaded ${customBlacklist.length} custom blacklisted words`);
  } catch (error) {
    console.error('[ModerationService] Reload blacklist error:', error);
  }
}

/**
 * Check if message contains profanity
 * 
 * @param message - Message to check
 * @returns True if profanity detected
 */
export function detectProfanity(message: string): boolean {
  return profanityFilter.isProfane(message);
}

/**
 * Filter profanity from message
 * 
 * @param message - Message to filter
 * @param userId - User ID (for admin bypass)
 * @returns Filtered message or error
 */
export async function filterMessage(
  message: string,
  userId: string
): Promise<{ 
  success: boolean; 
  filtered: string; 
  hadProfanity: boolean;
  error?: string;
}> {
  try {
    // Admin bypass
    const isAdminUser = await isAdmin(userId);
    if (isAdminUser) {
      return { success: true, filtered: message, hadProfanity: false };
    }

    // Check for profanity
    const hasProfanity = detectProfanity(message);
    
    if (hasProfanity) {
      // Filter the message
      const filtered = profanityFilter.clean(message);
      
      // Record warning for repeated violations
      await recordWarning(userId, 'Profanity detected');
      
      return { 
        success: true, 
        filtered, 
        hadProfanity: true,
      };
    }

    return { success: true, filtered: message, hadProfanity: false };
  } catch (error) {
    console.error('[ModerationService] Filter message error:', error);
    return { 
      success: false, 
      filtered: message, 
      hadProfanity: false,
      error: 'Failed to filter message',
    };
  }
}

// ============================================================================
// AUTO-MODERATION: SPAM DETECTION
// ============================================================================

/**
 * Detect spam patterns in message
 * 
 * @param userId - User ID
 * @param username - Username
 * @param message - Message content
 * @returns Spam detection result
 */
export async function detectSpam(
  userId: string,
  username: string,
  message: string
): Promise<{
  isSpam: boolean;
  reason?: string;
  shouldMute?: boolean;
}> {
  try {
    // Admin bypass
    const isAdminUser = await isAdmin(userId);
    if (isAdminUser) {
      return { isSpam: false };
    }

    const now = new Date();
    
    // Get or create rate tracker
    let tracker = rateTrackers.get(userId);
    if (!tracker) {
      tracker = {
        userId,
        messages: [],
        lastMessage: '',
        duplicateCount: 0,
      };
      rateTrackers.set(userId, tracker);
    }

    // 1. RATE LIMITING: Too many messages in short time
    tracker.messages = tracker.messages.filter(
      timestamp => now.getTime() - timestamp.getTime() < SPAM_WINDOW_MS
    );
    tracker.messages.push(now);

    if (tracker.messages.length > SPAM_RATE_LIMIT) {
      await recordWarning(userId, 'Spam: Rate limit exceeded');
      return {
        isSpam: true,
        reason: 'Too many messages. Please slow down.',
        shouldMute: true,
      };
    }

    // 2. DUPLICATE CONTENT: Same message repeated
    const normalized = message.toLowerCase().trim();
    if (normalized === tracker.lastMessage.toLowerCase().trim()) {
      tracker.duplicateCount++;
      
      if (tracker.duplicateCount >= SPAM_DUPLICATE_THRESHOLD) {
        await recordWarning(userId, 'Spam: Duplicate messages');
        tracker.duplicateCount = 0; // Reset
        return {
          isSpam: true,
          reason: 'Please do not repeat the same message.',
          shouldMute: true,
        };
      }
    } else {
      tracker.duplicateCount = 0;
      tracker.lastMessage = normalized;
    }

    // 3. EXCESSIVE CAPS: 70%+ uppercase (min 10 chars)
    if (message.length >= 10) {
      const letters = message.replace(/[^a-zA-Z]/g, '');
      if (letters.length > 0) {
        const capsRatio = letters.replace(/[^A-Z]/g, '').length / letters.length;
        
        if (capsRatio >= SPAM_CAPS_THRESHOLD) {
          await recordWarning(userId, 'Spam: Excessive caps');
          return {
            isSpam: true,
            reason: 'Please do not use excessive caps.',
            shouldMute: false, // Warning only, no mute
          };
        }
      }
    }

    return { isSpam: false };
  } catch (error) {
    console.error('[ModerationService] Detect spam error:', error);
    return { isSpam: false };
  }
}

/**
 * Auto-mute user for spam (5 minutes)
 * 
 * @param userId - User ID
 * @param username - Username
 * @param reason - Spam reason
 */
export async function muteUserForSpam(
  userId: string,
  username: string,
  reason: string
): Promise<void> {
  try {
    const { mutesCollection } = await getCollections();

    // Check if already muted
    const existing = await mutesCollection.findOne({
      userId,
      active: true,
    });

    if (existing) {
      return; // Already muted
    }

    // Create 5-minute auto-mute
    const startTime = new Date();
    const expiryTime = new Date(startTime.getTime() + AUTO_MUTE_DURATION_MS);

    const mute: Omit<UserMute, '_id'> = {
      userId,
      username,
      mutedBy: 'SYSTEM',
      mutedByUsername: 'Auto-Moderator',
      reason,
      duration: MuteDuration.ONE_HOUR, // Closest duration enum
      startTime,
      expiryTime,
      active: true,
    };

    await mutesCollection.insertOne(mute as UserMute);

    console.log(`[ModerationService] Auto-muted ${username} for spam: ${reason}`);
  } catch (error) {
    console.error('[ModerationService] Mute user for spam error:', error);
  }
}

// ============================================================================
// AUTO-MODERATION: WARNING SYSTEM
// ============================================================================

/**
 * Record a warning for a user
 * Auto-ban after 3 warnings in 24 hours
 * 
 * @param userId - User ID
 * @param reason - Warning reason
 */
export async function recordWarning(
  userId: string,
  reason: string
): Promise<void> {
  try {
    const { warningsCollection, mutesCollection } = await getCollections();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + WARNING_EXPIRY_MS);

    // Get player for username
    await getMongoClient();
    const db = client!.db();
    const playersCollection = db.collection('players');
    const player = await playersCollection.findOne({ username: userId });
    const username = player?.username || userId;

    // Create warning
    const warning: Omit<UserWarning, '_id'> = {
      userId,
      username,
      reason,
      timestamp: now,
      expiresAt,
    };

    await warningsCollection.insertOne(warning as UserWarning);

    // Count active warnings
    const activeWarnings = await warningsCollection.countDocuments({
      userId,
      expiresAt: { $gt: now },
    });

    console.log(`[ModerationService] Warning recorded for ${username}: ${reason} (${activeWarnings}/3)`);

    // Auto-ban after 3 warnings
    if (activeWarnings >= AUTO_BAN_THRESHOLD) {
      // Check if already muted
      const existing = await mutesCollection.findOne({
        userId,
        active: true,
      });

      if (!existing) {
        // Create 24-hour auto-ban
        const startTime = new Date();
        const expiryTime = new Date(startTime.getTime() + MUTE_DURATIONS[MuteDuration.TWENTY_FOUR_HOURS]!);

        const mute: Omit<UserMute, '_id'> = {
          userId,
          username,
          mutedBy: 'SYSTEM',
          mutedByUsername: 'Auto-Moderator',
          reason: `Auto-ban: ${AUTO_BAN_THRESHOLD} warnings in 24 hours`,
          duration: MuteDuration.TWENTY_FOUR_HOURS,
          startTime,
          expiryTime,
          active: true,
        };

        await mutesCollection.insertOne(mute as UserMute);

        console.log(`[ModerationService] Auto-banned ${username} for 24 hours (3 warnings)`);

        // Clear warnings after ban
        await warningsCollection.deleteMany({ userId });
      }
    }
  } catch (error) {
    console.error('[ModerationService] Record warning error:', error);
  }
}

/**
 * Get active warnings for a user
 * 
 * @param userId - User ID
 * @returns Array of active warnings
 */
export async function getActiveWarnings(userId: string): Promise<UserWarning[]> {
  try {
    const { warningsCollection } = await getCollections();

    const now = new Date();

    const warnings = await warningsCollection
      .find({
        userId,
        expiresAt: { $gt: now },
      })
      .sort({ timestamp: -1 })
      .toArray();

    return warnings;
  } catch (error) {
    console.error('[ModerationService] Get active warnings error:', error);
    return [];
  }
}

/**
 * Clear expired warnings (cleanup job)
 * 
 * @returns Number of warnings cleaned
 */
export async function cleanupExpiredWarnings(): Promise<number> {
  try {
    const { warningsCollection } = await getCollections();

    const now = new Date();

    const result = await warningsCollection.deleteMany({
      expiresAt: { $lte: now },
    });

    if (result.deletedCount > 0) {
      console.log(`[ModerationService] Cleaned up ${result.deletedCount} expired warnings`);
    }

    return result.deletedCount;
  } catch (error) {
    console.error('[ModerationService] Cleanup expired warnings error:', error);
    return 0;
  }
}

// ============================================================================
// AUTO-MODERATION: RATE TRACKER CLEANUP
// ============================================================================

/**
 * Clean up old rate trackers (run periodically)
 * Removes trackers for users inactive for 1+ hour
 * 
 * @returns Number of trackers cleaned
 */
export function cleanupRateTrackers(): number {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  let cleaned = 0;
  
  for (const [userId, tracker] of rateTrackers.entries()) {
    if (tracker.messages.length === 0 || tracker.messages[tracker.messages.length - 1] < oneHourAgo) {
      rateTrackers.delete(userId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[ModerationService] Cleaned up ${cleaned} inactive rate trackers`);
  }
  
  return cleaned;
}

// ============================================================================
// PERMISSION VALIDATION
// ============================================================================

/**
 * Check if user has admin/moderator permissions
 * 
 * @param userId - User ID to check
 * @returns True if user is admin/moderator
 */
export async function isAdmin(userId: string): Promise<boolean> {
  try {
    await getMongoClient();
    const db = client!.db();
    const playersCollection = db.collection('players');
    
    const player = await playersCollection.findOne({ username: userId });
    
    // Check for admin or moderator role
    return player?.role === 'admin' || player?.role === 'moderator';
  } catch (error) {
    console.error('[ModerationService] Admin check error:', error);
    return false;
  }
}

// ============================================================================
// MUTE OPERATIONS
// ============================================================================

/**
 * Mute a user
 * 
 * @param userId - User ID to mute
 * @param username - Username
 * @param duration - Mute duration
 * @param moderatorId - Moderator ID
 * @param moderatorUsername - Moderator username
 * @param reason - Mute reason
 * @returns Success status
 */
export async function muteUser(
  userId: string,
  username: string,
  duration: MuteDuration,
  moderatorId: string,
  moderatorUsername: string,
  reason: string
): Promise<{ success: boolean; error?: string; mute?: UserMute }> {
  try {
    // Validate admin permissions
    const hasPermission = await isAdmin(moderatorId);
    if (!hasPermission) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const { mutesCollection, modLogCollection } = await getCollections();

    // Check if already muted
    const existing = await mutesCollection.findOne({
      userId,
      active: true,
    });

    if (existing) {
      return { success: false, error: 'User is already muted' };
    }

    // Calculate expiry time
    const startTime = new Date();
    const durationMs = MUTE_DURATIONS[duration];
    const expiryTime = durationMs ? new Date(startTime.getTime() + durationMs) : null;

    // Create mute record
    const mute: Omit<UserMute, '_id'> = {
      userId,
      username,
      mutedBy: moderatorId,
      mutedByUsername: moderatorUsername,
      reason,
      duration,
      startTime,
      expiryTime,
      active: true,
    };

    const result = await mutesCollection.insertOne(mute as UserMute);

    const savedMute: UserMute = {
      ...mute,
      _id: result.insertedId,
    } as UserMute;

    // Log action
    await logAction({
      actionType: ModActionType.MUTE_USER,
      moderatorId,
      moderatorUsername,
      targetUserId: userId,
      targetUsername: username,
      reason,
      metadata: { duration, expiryTime },
    });

    return { success: true, mute: savedMute };
  } catch (error) {
    console.error('[ModerationService] Mute user error:', error);
    return { success: false, error: 'Failed to mute user' };
  }
}

/**
 * Unmute a user
 * 
 * @param userId - User ID to unmute
 * @param moderatorId - Moderator ID
 * @param moderatorUsername - Moderator username
 * @returns Success status
 */
export async function unmuteUser(
  userId: string,
  moderatorId: string,
  moderatorUsername: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate admin permissions
    const hasPermission = await isAdmin(moderatorId);
    if (!hasPermission) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const { mutesCollection, modLogCollection } = await getCollections();

    // Find active mute
    const mute = await mutesCollection.findOne({
      userId,
      active: true,
    });

    if (!mute) {
      return { success: false, error: 'User is not muted' };
    }

    // Revoke mute
    const result = await mutesCollection.updateOne(
      { _id: mute._id },
      {
        $set: {
          active: false,
          revokedAt: new Date(),
          revokedBy: moderatorId,
        },
      }
    );

    if (result.modifiedCount === 0) {
      return { success: false, error: 'Failed to unmute user' };
    }

    // Log action
    await logAction({
      actionType: ModActionType.UNMUTE_USER,
      moderatorId,
      moderatorUsername,
      targetUserId: userId,
      targetUsername: mute.username,
      reason: 'Manual unmute',
    });

    return { success: true };
  } catch (error) {
    console.error('[ModerationService] Unmute user error:', error);
    return { success: false, error: 'Failed to unmute user' };
  }
}

/**
 * Check if user is muted
 * 
 * @param userId - User ID to check
 * @returns Mute status
 */
export async function checkMuteStatus(userId: string): Promise<MuteStatus> {
  try {
    const { mutesCollection } = await getCollections();

    const mute = await mutesCollection.findOne({
      userId,
      active: true,
    });

    if (!mute) {
      return { isMuted: false };
    }

    // Check if temporary mute has expired
    if (mute.expiryTime) {
      const now = new Date();
      if (now >= mute.expiryTime) {
        // Auto-expire mute
        await mutesCollection.updateOne(
          { _id: mute._id },
          { $set: { active: false } }
        );
        return { isMuted: false };
      }

      // Calculate time until expiry
      const expiresIn = Math.floor((mute.expiryTime.getTime() - now.getTime()) / 1000);
      return { isMuted: true, muteRecord: mute, expiresIn };
    }

    // Permanent mute
    return { isMuted: true, muteRecord: mute };
  } catch (error) {
    console.error('[ModerationService] Check mute status error:', error);
    return { isMuted: false };
  }
}

/**
 * Get all active mutes
 * 
 * @returns Array of active mute records
 */
export async function getActiveMutes(): Promise<UserMute[]> {
  try {
    const { mutesCollection } = await getCollections();

    const mutes = await mutesCollection
      .find({ active: true })
      .sort({ startTime: -1 })
      .toArray();

    return mutes;
  } catch (error) {
    console.error('[ModerationService] Get active mutes error:', error);
    return [];
  }
}

// ============================================================================
// CHANNEL BAN OPERATIONS
// ============================================================================

/**
 * Ban user from a specific channel
 * 
 * @param userId - User ID to ban
 * @param username - Username
 * @param channelId - Channel ID
 * @param moderatorId - Moderator ID
 * @param moderatorUsername - Moderator username
 * @param reason - Ban reason
 * @returns Success status
 */
export async function banFromChannel(
  userId: string,
  username: string,
  channelId: string,
  moderatorId: string,
  moderatorUsername: string,
  reason: string
): Promise<{ success: boolean; error?: string; ban?: ChannelBan }> {
  try {
    // Validate admin permissions
    const hasPermission = await isAdmin(moderatorId);
    if (!hasPermission) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const { bansCollection, modLogCollection } = await getCollections();

    // Check if already banned
    const existing = await bansCollection.findOne({
      userId,
      channelId,
      active: true,
    });

    if (existing) {
      return { success: false, error: 'User is already banned from this channel' };
    }

    // Create ban record
    const ban: Omit<ChannelBan, '_id'> = {
      userId,
      username,
      channelId,
      bannedBy: moderatorId,
      bannedByUsername: moderatorUsername,
      reason,
      timestamp: new Date(),
      active: true,
    };

    const result = await bansCollection.insertOne(ban as ChannelBan);

    const savedBan: ChannelBan = {
      ...ban,
      _id: result.insertedId,
    } as ChannelBan;

    // Log action
    await logAction({
      actionType: ModActionType.BAN_FROM_CHANNEL,
      moderatorId,
      moderatorUsername,
      targetUserId: userId,
      targetUsername: username,
      channelId,
      reason,
    });

    return { success: true, ban: savedBan };
  } catch (error) {
    console.error('[ModerationService] Ban from channel error:', error);
    return { success: false, error: 'Failed to ban user' };
  }
}

/**
 * Unban user from a channel
 * 
 * @param userId - User ID to unban
 * @param channelId - Channel ID
 * @param moderatorId - Moderator ID
 * @param moderatorUsername - Moderator username
 * @returns Success status
 */
export async function unbanFromChannel(
  userId: string,
  channelId: string,
  moderatorId: string,
  moderatorUsername: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate admin permissions
    const hasPermission = await isAdmin(moderatorId);
    if (!hasPermission) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const { bansCollection, modLogCollection } = await getCollections();

    // Find active ban
    const ban = await bansCollection.findOne({
      userId,
      channelId,
      active: true,
    });

    if (!ban) {
      return { success: false, error: 'User is not banned from this channel' };
    }

    // Revoke ban
    const result = await bansCollection.updateOne(
      { _id: ban._id },
      {
        $set: {
          active: false,
          revokedAt: new Date(),
          revokedBy: moderatorId,
        },
      }
    );

    if (result.modifiedCount === 0) {
      return { success: false, error: 'Failed to unban user' };
    }

    // Log action
    await logAction({
      actionType: ModActionType.UNBAN_FROM_CHANNEL,
      moderatorId,
      moderatorUsername,
      targetUserId: userId,
      targetUsername: ban.username,
      channelId,
      reason: 'Manual unban',
    });

    return { success: true };
  } catch (error) {
    console.error('[ModerationService] Unban from channel error:', error);
    return { success: false, error: 'Failed to unban user' };
  }
}

/**
 * Check if user is banned from a channel
 * 
 * @param userId - User ID to check
 * @param channelId - Channel ID
 * @returns Ban status
 */
export async function checkChannelBan(
  userId: string,
  channelId: string
): Promise<BanStatus> {
  try {
    const { bansCollection } = await getCollections();

    const ban = await bansCollection.findOne({
      userId,
      channelId,
      active: true,
    });

    if (!ban) {
      return { isBanned: false };
    }

    return { isBanned: true, banRecord: ban };
  } catch (error) {
    console.error('[ModerationService] Check channel ban error:', error);
    return { isBanned: false };
  }
}

/**
 * Get all channel bans for a user
 * 
 * @param userId - User ID
 * @returns Array of active channel bans
 */
export async function getUserChannelBans(userId: string): Promise<string[]> {
  try {
    const { bansCollection } = await getCollections();

    const bans = await bansCollection
      .find({ userId, active: true })
      .toArray();

    return bans.map(ban => ban.channelId);
  } catch (error) {
    console.error('[ModerationService] Get user channel bans error:', error);
    return [];
  }
}

/**
 * Get all active channel bans
 * 
 * @returns Array of active ban records
 */
export async function getActiveChannelBans(): Promise<ChannelBan[]> {
  try {
    const { bansCollection } = await getCollections();

    const bans = await bansCollection
      .find({ active: true })
      .sort({ timestamp: -1 })
      .toArray();

    return bans;
  } catch (error) {
    console.error('[ModerationService] Get active channel bans error:', error);
    return [];
  }
}

// ============================================================================
// BLACKLIST OPERATIONS
// ============================================================================

/**
 * Add word to blacklist
 * 
 * @param word - Word to blacklist
 * @param category - Word category
 * @param moderatorId - Moderator ID
 * @param moderatorUsername - Moderator username
 * @returns Success status
 */
export async function addToBlacklist(
  word: string,
  category: BlacklistWord['category'],
  moderatorId: string,
  moderatorUsername: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate admin permissions
    const hasPermission = await isAdmin(moderatorId);
    if (!hasPermission) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const { blacklistCollection, modLogCollection } = await getCollections();

    // Check if word already exists
    const normalized = word.toLowerCase().trim();
    const existing = await blacklistCollection.findOne({
      word: normalized,
      active: true,
    });

    if (existing) {
      return { success: false, error: 'Word is already blacklisted' };
    }

    // Add to blacklist
    const blacklistEntry: Omit<BlacklistWord, '_id'> = {
      word: normalized,
      category,
      addedBy: moderatorId,
      addedByUsername: moderatorUsername,
      timestamp: new Date(),
      active: true,
    };

    await blacklistCollection.insertOne(blacklistEntry as BlacklistWord);

    // Log action
    await logAction({
      actionType: ModActionType.ADD_TO_BLACKLIST,
      moderatorId,
      moderatorUsername,
      word: normalized,
      reason: `Added to ${category} category`,
      metadata: { category },
    });

    return { success: true };
  } catch (error) {
    console.error('[ModerationService] Add to blacklist error:', error);
    return { success: false, error: 'Failed to add word to blacklist' };
  }
}

/**
 * Remove word from blacklist
 * 
 * @param word - Word to remove
 * @param moderatorId - Moderator ID
 * @param moderatorUsername - Moderator username
 * @returns Success status
 */
export async function removeFromBlacklist(
  word: string,
  moderatorId: string,
  moderatorUsername: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate admin permissions
    const hasPermission = await isAdmin(moderatorId);
    if (!hasPermission) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const { blacklistCollection, modLogCollection } = await getCollections();

    const normalized = word.toLowerCase().trim();

    // Remove from blacklist
    const result = await blacklistCollection.updateOne(
      { word: normalized, active: true },
      { $set: { active: false } }
    );

    if (result.modifiedCount === 0) {
      return { success: false, error: 'Word not found in blacklist' };
    }

    // Log action
    await logAction({
      actionType: ModActionType.REMOVE_FROM_BLACKLIST,
      moderatorId,
      moderatorUsername,
      word: normalized,
      reason: 'Removed from blacklist',
    });

    return { success: true };
  } catch (error) {
    console.error('[ModerationService] Remove from blacklist error:', error);
    return { success: false, error: 'Failed to remove word from blacklist' };
  }
}

/**
 * Get all blacklisted words
 * 
 * @returns Array of blacklisted words
 */
export async function getBlacklist(): Promise<BlacklistWord[]> {
  try {
    const { blacklistCollection } = await getCollections();

    const words = await blacklistCollection
      .find({ active: true })
      .sort({ timestamp: -1 })
      .toArray();

    return words;
  } catch (error) {
    console.error('[ModerationService] Get blacklist error:', error);
    return [];
  }
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Log a moderation action
 * 
 * @param action - Action details
 */
async function logAction(
  action: Omit<ModActionLog, '_id' | 'timestamp'>
): Promise<void> {
  try {
    const { modLogCollection } = await getCollections();

    const logEntry: Omit<ModActionLog, '_id'> = {
      ...action,
      timestamp: new Date(),
    };

    await modLogCollection.insertOne(logEntry as ModActionLog);
  } catch (error) {
    console.error('[ModerationService] Log action error:', error);
  }
}

/**
 * Get moderation action history
 * 
 * @param filters - Optional filters
 * @returns Array of moderation actions
 */
export async function getModerationHistory(filters?: {
  moderatorId?: string;
  targetUserId?: string;
  actionType?: ModActionType;
  limit?: number;
}): Promise<ModActionLog[]> {
  try {
    const { modLogCollection } = await getCollections();

    const query: any = {};
    if (filters?.moderatorId) query.moderatorId = filters.moderatorId;
    if (filters?.targetUserId) query.targetUserId = filters.targetUserId;
    if (filters?.actionType) query.actionType = filters.actionType;

    const logs = await modLogCollection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(filters?.limit || 100)
      .toArray();

    return logs;
  } catch (error) {
    console.error('[ModerationService] Get moderation history error:', error);
    return [];
  }
}

// ============================================================================
// CLEANUP OPERATIONS
// ============================================================================

/**
 * Auto-expire temporary mutes
 * Run as cron job every 5 minutes
 * 
 * @returns Number of mutes expired
 */
export async function expireTemporaryMutes(): Promise<number> {
  try {
    const { mutesCollection } = await getCollections();

    const now = new Date();

    const result = await mutesCollection.updateMany(
      {
        active: true,
        expiryTime: { $ne: null, $lte: now },
      },
      { $set: { active: false } }
    );

    if (result.modifiedCount > 0) {
      console.log(`[ModerationService] Expired ${result.modifiedCount} temporary mutes`);
    }

    return result.modifiedCount;
  } catch (error) {
    console.error('[ModerationService] Expire temporary mutes error:', error);
    return 0;
  }
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * ADMIN MODERATION TOOLS (FID-20251025-103):
 * 
 * 1. User Mutes:
 *    - 4 duration options: 1h, 24h, 7d, permanent
 *    - Auto-expiry for temporary mutes (cron job every 5 minutes)
 *    - Manual revoke with audit trail
 *    - Check mute status before allowing write operations
 * 
 * 2. Channel Bans:
 *    - Channel-specific (can ban from Trade but not Global)
 *    - getUserChannelBans() returns array of banned channel IDs
 *    - Used by channelService.canReadChannel()
 *    - Manual revoke with audit trail
 * 
 * 3. Word Blacklist:
 *    - Custom words added to bad-words filter
 *    - Categories: profanity, slur, spam, custom
 *    - reloadBlacklist() syncs with profanity filter
 *    - Normalized to lowercase
 * 
 * 4. Audit Logging:
 *    - All moderation actions logged
 *    - Includes moderator, target, reason, metadata
 *    - getModerationHistory() with filters
 *    - Used for transparency and dispute resolution
 * 
 * 5. Admin Permissions:
 *    - isAdmin() checks player.role === 'admin' || 'moderator'
 *    - All operations validate permissions first
 *    - TODO: Add role-based permissions (admin vs moderator)
 * 
 * AUTO-MODERATION SYSTEM (FID-20251026-019):
 * 
 * 6. Profanity Filter:
 *    - Uses bad-words library with custom blacklist
 *    - filterMessage() returns filtered text
 *    - detectProfanity() for boolean check
 *    - Admin bypass (no filtering for admins/mods)
 *    - Records warning on profanity detection
 * 
 * 7. Spam Detection:
 *    - Rate limiting: Max 5 messages per 10 seconds
 *    - Duplicate detection: Same message 3+ times
 *    - Caps detection: 70%+ uppercase (min 10 chars)
 *    - In-memory rate trackers (cleaned hourly)
 *    - Auto-mute for 5 minutes on spam
 * 
 * 8. Warning System:
 *    - Warnings expire after 24 hours
 *    - 3 warnings → 24-hour auto-ban
 *    - Stored in MongoDB with expiry index
 *    - Cleanup job removes expired warnings
 *    - All warnings cleared after ban
 * 
 * 9. Integration Points:
 *    - chatService.sendMessage() → filterMessage() + detectSpam()
 *    - chatService.deleteMessage() → ModActionType.DELETE_MESSAGE
 *    - channelService.canWriteChannel() → checkMuteStatus()
 *    - channelService.canReadChannel() → checkChannelBan()
 *    - WebSocket handlers → Notify on moderation actions
 *    - Admin panel → Blacklist management → reloadBlacklist()
 * 
 * 10. Performance Optimizations:
 *     - Indexed collections: userId, channelId, timestamp, expiresAt
 *     - Active flag for quick filtering
 *     - In-memory rate trackers (no DB writes for every message)
 *     - Cron jobs: expireTemporaryMutes(), cleanupExpiredWarnings(), cleanupRateTrackers()
 *     - Profanity filter loaded once on startup
 * 
 * 11. Cron Job Schedule:
 *     - Every 5 minutes: expireTemporaryMutes()
 *     - Every 15 minutes: cleanupExpiredWarnings()
 *     - Every 60 minutes: cleanupRateTrackers()
 */
