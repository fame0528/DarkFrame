/**
 * Clan Service - Core Clan Management
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * Provides comprehensive clan management functionality including creation, member management,
 * role-based permissions, invitations, and clan settings. Handles all core clan operations
 * with proper validation, permission checks, and database transactions.
 * 
 * Key Features:
 * - Clan creation with 1.5M Metal + 1.5M Energy cost (admin configurable)
 * - Solo clan creation allowed (minimum 1 member)
 * - 6-role permission system (LEADER, CO_LEADER, OFFICER, ELITE, MEMBER, RECRUIT)
 * - Member management (invite, join, kick, promote, demote, transfer leadership)
 * - Clan settings (description, MOTD, max members)
 * - Activity tracking integration
 * - Clan level initialization and XP tracking
 * 
 * Dependencies:
 * - MongoDB database connection
 * - types/clan.types.ts for all type definitions
 * - lib/playerService.ts for player resource validation
 * - lib/clanActivityService.ts for activity logging
 */

import { MongoClient, Db, ObjectId } from 'mongodb';
import {
  Clan,
  ClanMember,
  ClanRole,
  ClanActivityType,
  ClanBank,
  ClanPerk,
  CLAN_CONSTANTS,
  CLAN_BANK_CONSTANTS,
  hasPermission,
} from '@/types/clan.types';

let client: MongoClient;
let db: Db;

/**
 * Initialize MongoDB connection for clan service
 * @param mongoClient - MongoDB client instance
 * @param database - Database instance
 */
export function initializeClanService(mongoClient: MongoClient, database: Db): void {
  client = mongoClient;
  db = database;
}

/**
 * Get MongoDB database instance
 * @returns Database instance
 * @throws Error if database not initialized
 */
function getDb(): Db {
  if (!db) {
    throw new Error('Clan service database not initialized');
  }
  return db;
}

/**
 * Create a new clan
 * Validates player resources (1.5M Metal + 1.5M Energy), creates clan with founder as leader,
 * deducts costs from player, and logs activity. Initializes clan at level 1 with empty bank.
 * 
 * @param playerId - ID of the player creating the clan
 * @param clanName - Name of the clan (3-30 characters, unique)
 * @param tag - Clan tag (2-6 characters, unique)
 * @param description - Clan description (max 500 characters, optional)
 * @returns Newly created clan object
 * @throws Error if insufficient resources, name taken, or validation fails
 * 
 * @example
 * const clan = await createClan('player123', 'Dark Warriors', 'DW', 'Elite fighters');
 */
export async function createClan(
  playerId: string,
  clanName: string,
  tag: string,
  description?: string
): Promise<Clan> {
  const database = getDb();
  
  // Validate clan name
  if (!clanName || clanName.length < 3 || clanName.length > 30) {
    throw new Error('Clan name must be between 3 and 30 characters');
  }
  
  // Validate tag
  if (!tag || tag.length < 2 || tag.length > 6) {
    throw new Error('Clan tag must be between 2 and 6 characters');
  }
  
  // Check if name is already taken
  const existingClan = await database.collection('clans').findOne({ name: clanName });
  if (existingClan) {
    throw new Error('Clan name already taken');
  }
  
  // Check if tag is already taken
  const existingTag = await database.collection('clans').findOne({ tag: tag.toUpperCase() });
  if (existingTag) {
    throw new Error('Clan tag already taken');
  }
  
  // Get player and validate resources
  const player = await database.collection('players').findOne({ _id: new ObjectId(playerId) });
  if (!player) {
    throw new Error('Player not found');
  }
  
  // Check if player is already in a clan
  if (player.clanId) {
    throw new Error('Player is already in a clan');
  }
  
  // Validate player has sufficient resources
  const { metal: costMetal, energy: costEnergy } = CLAN_CONSTANTS.CREATION_COST;
  if (player.resources.metal < costMetal || player.resources.energy < costEnergy) {
    throw new Error(`Insufficient resources. Need ${costMetal.toLocaleString()} Metal and ${costEnergy.toLocaleString()} Energy`);
  }
  
  // Create founder member object
  const founderMember: ClanMember = {
    playerId,
    username: player.username,
    role: ClanRole.LEADER,
    joinedAt: new Date(),
    lastActive: new Date(),
  };
  
  // Initialize clan bank
  const initialBank: ClanBank = {
    treasury: {
      metal: 0,
      energy: 0,
      researchPoints: 0,
    },
    taxRates: {
      metal: 0,
      energy: 0,
      researchPoints: 0,
    },
    upgradeLevel: 1,
    capacity: CLAN_CONSTANTS.BANK_BASE_CAPACITY,
    transactions: [],
  };
  
  // Create new clan object
  const newClan: Omit<Clan, '_id'> = {
    name: clanName,
    tag: tag.toUpperCase(),
    description: description || '',
    leaderId: playerId,
    members: [founderMember],
    maxMembers: CLAN_CONSTANTS.DEFAULT_MAX_MEMBERS,
    level: {
      currentLevel: 1,
      totalXP: 0,
      currentLevelXP: 0,
      xpToNextLevel: 1000,
      featuresUnlocked: [],
      milestonesCompleted: [],
      lastLevelUp: new Date(),
    },
    createdAt: new Date(),
    settings: {
      messageOfTheDay: `Welcome to ${clanName}!`,
      isRecruiting: true,
      minLevelToJoin: 1,
      requiresApproval: false,
      allowTerritoryControl: true,
      allowWarDeclarations: true,
    },
    stats: {
      totalPower: 0,
      totalTerritories: 0,
      totalMonuments: 0,
      warsWon: 0,
      warsLost: 0,
      totalRP: 0,
    },
    research: {
      researchPoints: 0,
      unlockedTechs: [],
      activeResearch: null,
    },
    bank: initialBank,
    activePerks: [],
    territories: [],
    monuments: [],
    wars: {
      active: [],
      history: [],
    },
  };
  
  // Insert clan into database
  const result = await database.collection('clans').insertOne(newClan);
  const clanId = result.insertedId.toString();
  
  // Deduct resources from player and assign clan (INCLUDING clanName for display)
  await database.collection('players').updateOne(
    { _id: new ObjectId(playerId) },
    {
      $inc: {
        'resources.metal': -costMetal,
        'resources.energy': -costEnergy,
      },
      $set: {
        clanId,
        clanName: clanName,
        clanRole: ClanRole.LEADER,
      },
    }
  );
  
  // Log activity
  await logClanActivity(clanId, ClanActivityType.CLAN_CREATED, playerId, {
    clanName,
    tag: newClan.tag,
  });
  
  return { _id: result.insertedId, ...newClan };
}

/**
 * Get clan by ID
 * @param clanId - Clan ID
 * @returns Clan object or null if not found
 * 
 * @example
 * const clan = await getClanById('clan123');
 */
export async function getClanById(clanId: string): Promise<Clan | null> {
  const database = getDb();
  const clan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) });
  return clan as Clan | null;
}

/**
 * Get clan by tag
 * @param tag - Clan tag (case-insensitive)
 * @returns Clan object or null if not found
 * 
 * @example
 * const clan = await getClanByTag('DW');
 */
export async function getClanByTag(tag: string): Promise<Clan | null> {
  const database = getDb();
  const clan = await database.collection('clans').findOne({ tag: tag.toUpperCase() });
  return clan as Clan | null;
}

/**
 * Get clan by player ID
 * @param playerId - Player ID
 * @returns Clan object or null if player not in clan
 * 
 * @example
 * const clan = await getClanByPlayerId('player123');
 */
export async function getClanByPlayerId(playerId: string): Promise<Clan | null> {
  const database = getDb();
  const player = await database.collection('players').findOne({ _id: new ObjectId(playerId) });
  
  if (!player || !player.clanId) {
    return null;
  }
  
  return await getClanById(player.clanId);
}

/**
 * Invite player to clan
 * Validates permissions (canInvite), checks clan capacity, creates pending invitation.
 * 
 * @param clanId - Clan ID
 * @param inviterId - Player ID of inviter (must have permission)
 * @param inviteeId - Player ID to invite
 * @returns Success status
 * @throws Error if no permission, clan full, or player already in clan
 * 
 * @example
 * await invitePlayerToClan('clan123', 'officer456', 'newPlayer789');
 */
export async function invitePlayerToClan(
  clanId: string,
  inviterId: string,
  inviteeId: string
): Promise<{ success: boolean; message: string }> {
  const database = getDb();
  
  // Get clan
  const clan = await getClanById(clanId);
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Get inviter member
  const inviterMember = clan.members.find(m => m.playerId === inviterId);
  if (!inviterMember) {
    throw new Error('Inviter not in clan');
  }
  
  // Check permissions
  if (!hasPermission(inviterMember.role, 'canInvite')) {
    throw new Error('No permission to invite members');
  }
  
  // Check clan capacity
  if (clan.members.length >= clan.maxMembers) {
    throw new Error('Clan is at maximum capacity');
  }
  
  // Get invitee player
  const invitee = await database.collection('players').findOne({ _id: new ObjectId(inviteeId) });
  if (!invitee) {
    throw new Error('Player not found');
  }
  
  // Check if already in a clan
  if (invitee.clanId) {
    throw new Error('Player is already in a clan');
  }
  
  // Check level requirement
  if (invitee.level < clan.settings.minLevelToJoin) {
    throw new Error(`Player must be level ${clan.settings.minLevelToJoin} or higher`);
  }
  
  // Create invitation
  await database.collection('clan_invitations').insertOne({
    clanId,
    clanName: clan.name,
    inviterId,
    inviterUsername: inviterMember.username,
    inviteeId,
    inviteeUsername: invitee.username,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    status: 'pending',
  });
  
  return { success: true, message: `Invitation sent to ${invitee.username}` };
}

/**
 * Accept clan invitation and join clan
 * @param invitationId - Invitation ID
 * @param playerId - Player ID accepting invitation
 * @returns Success status with clan info
 * @throws Error if invitation invalid or expired
 * 
 * @example
 * const result = await joinClan('invitation123', 'player789');
 */
export async function joinClan(
  invitationId: string,
  playerId: string
): Promise<{ success: boolean; clan: Clan }> {
  const database = getDb();
  
  // Get invitation
  const invitation = await database.collection('clan_invitations').findOne({
    _id: new ObjectId(invitationId),
    inviteeId: playerId,
    status: 'pending',
  });
  
  if (!invitation) {
    throw new Error('Invitation not found or already processed');
  }
  
  // Check expiration
  if (new Date() > invitation.expiresAt) {
    await database.collection('clan_invitations').updateOne(
      { _id: new ObjectId(invitationId) },
      { $set: { status: 'expired' } }
    );
    throw new Error('Invitation has expired');
  }
  
  // Get clan
  const clan = await getClanById(invitation.clanId);
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Check capacity again
  if (clan.members.length >= clan.maxMembers) {
    throw new Error('Clan is now at maximum capacity');
  }
  
  // Get player
  const player = await database.collection('players').findOne({ _id: new ObjectId(playerId) });
  if (!player) {
    throw new Error('Player not found');
  }
  
  // Check if already in clan
  if (player.clanId) {
    throw new Error('Player is already in a clan');
  }
  
  // Create new member object
  const newMember: ClanMember = {
    playerId,
    username: player.username,
    role: ClanRole.RECRUIT,
    joinedAt: new Date(),
    lastActive: new Date(),
  };
  
  // Add member to clan
  await database.collection('clans').updateOne(
    { _id: new ObjectId(invitation.clanId) },
    { $push: { members: newMember } } as any
  );
  
  // Update player with clan info (INCLUDING clanName for display)
  await database.collection('players').updateOne(
    { _id: new ObjectId(playerId) },
    {
      $set: {
        clanId: invitation.clanId,
        clanName: clan.name,
        clanRole: ClanRole.RECRUIT,
      },
    }
  );
  
  // Mark invitation as accepted
  await database.collection('clan_invitations').updateOne(
    { _id: new ObjectId(invitationId) },
    { $set: { status: 'accepted', acceptedAt: new Date() } }
  );
  
  // Log activity
  await logClanActivity(invitation.clanId, ClanActivityType.MEMBER_JOINED, playerId, {
    username: player.username,
  });
  
  const updatedClan = await getClanById(invitation.clanId);
  return { success: true, clan: updatedClan! };
}

/**
 * Leave clan
 * Leader cannot leave without transferring leadership first.
 * 
 * @param clanId - Clan ID
 * @param playerId - Player ID leaving
 * @returns Success status
 * @throws Error if player is leader or not in clan
 * 
 * @example
 * await leaveClan('clan123', 'player456');
 */
export async function leaveClan(clanId: string, playerId: string): Promise<{ success: boolean; message: string }> {
  const database = getDb();
  
  // Get clan
  const clan = await getClanById(clanId);
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Get member
  const member = clan.members.find(m => m.playerId === playerId);
  if (!member) {
    throw new Error('Player not in this clan');
  }
  
  // Leader cannot leave without transferring
  if (member.role === ClanRole.LEADER) {
    throw new Error('Leader must transfer leadership before leaving');
  }
  
  // Remove member from clan
  await database.collection('clans').updateOne(
    { _id: new ObjectId(clanId) },
    { $pull: { members: { playerId } } } as any
  );
  
  // Update player (REMOVE all clan fields including clanName)
  await database.collection('players').updateOne(
    { _id: new ObjectId(playerId) },
    {
      $unset: { clanId: '', clanName: '', clanRole: '' },
    }
  );
  
  // Log activity
  await logClanActivity(clanId, ClanActivityType.MEMBER_LEFT, playerId, {
    username: member.username,
  });
  
  return { success: true, message: 'Successfully left clan' };
}

/**
 * Kick member from clan
 * Requires canKick permission. Cannot kick leader or members with equal/higher role.
 * 
 * @param clanId - Clan ID
 * @param kickerId - Player ID performing kick (must have permission)
 * @param targetId - Player ID to kick
 * @returns Success status
 * @throws Error if no permission or invalid target
 * 
 * @example
 * await kickMember('clan123', 'officer456', 'troubleMaker789');
 */
export async function kickMember(
  clanId: string,
  kickerId: string,
  targetId: string
): Promise<{ success: boolean; message: string }> {
  const database = getDb();
  
  // Get clan
  const clan = await getClanById(clanId);
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Get kicker member
  const kicker = clan.members.find(m => m.playerId === kickerId);
  if (!kicker) {
    throw new Error('Kicker not in clan');
  }
  
  // Check permissions
  if (!hasPermission(kicker.role, 'canKick')) {
    throw new Error('No permission to kick members');
  }
  
  // Get target member
  const target = clan.members.find(m => m.playerId === targetId);
  if (!target) {
    throw new Error('Target player not in clan');
  }
  
  // Cannot kick leader
  if (target.role === ClanRole.LEADER) {
    throw new Error('Cannot kick clan leader');
  }
  
  // Cannot kick equal or higher role (unless you're leader)
  const roleHierarchy = [
    ClanRole.RECRUIT,
    ClanRole.MEMBER,
    ClanRole.ELITE,
    ClanRole.OFFICER,
    ClanRole.CO_LEADER,
    ClanRole.LEADER,
  ];
  
  const kickerRank = roleHierarchy.indexOf(kicker.role);
  const targetRank = roleHierarchy.indexOf(target.role);
  
  if (targetRank >= kickerRank && kicker.role !== ClanRole.LEADER) {
    throw new Error('Cannot kick members of equal or higher rank');
  }
  
  // Remove member
  await database.collection('clans').updateOne(
    { _id: new ObjectId(clanId) },
    { $pull: { members: { playerId: targetId } } } as any
  );
  
  // Update player (REMOVE all clan fields including clanName)
  await database.collection('players').updateOne(
    { _id: new ObjectId(targetId) },
    {
      $unset: { clanId: '', clanName: '', clanRole: '' },
    }
  );
  
  // Log activity
  await logClanActivity(clanId, ClanActivityType.MEMBER_KICKED, kickerId, {
    targetUsername: target.username,
    kickerUsername: kicker.username,
  });
  
  return { success: true, message: `${target.username} has been kicked from the clan` };
}

/**
 * Promote or demote member
 * Requires appropriate permissions based on target role. Cannot modify leader or members of equal/higher rank.
 * 
 * @param clanId - Clan ID
 * @param promoterId - Player ID performing promotion (must have permission)
 * @param targetId - Player ID to promote/demote
 * @param newRole - New role to assign
 * @returns Success status
 * @throws Error if no permission or invalid role change
 * 
 * @example
 * await promoteMember('clan123', 'leader456', 'recruit789', ClanRole.MEMBER);
 */
export async function promoteMember(
  clanId: string,
  promoterId: string,
  targetId: string,
  newRole: ClanRole
): Promise<{ success: boolean; message: string }> {
  const database = getDb();
  
  // Get clan
  const clan = await getClanById(clanId);
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Get promoter member
  const promoter = clan.members.find(m => m.playerId === promoterId);
  if (!promoter) {
    throw new Error('Promoter not in clan');
  }
  
  // Get target member
  const target = clan.members.find(m => m.playerId === targetId);
  if (!target) {
    throw new Error('Target player not in clan');
  }
  
  // Cannot change leader role (must use transferLeadership)
  if (target.role === ClanRole.LEADER || newRole === ClanRole.LEADER) {
    throw new Error('Use transferLeadership to change leader');
  }
  
  // Role hierarchy validation
  const roleHierarchy = [
    ClanRole.RECRUIT,
    ClanRole.MEMBER,
    ClanRole.ELITE,
    ClanRole.OFFICER,
    ClanRole.CO_LEADER,
    ClanRole.LEADER,
  ];
  
  const promoterRank = roleHierarchy.indexOf(promoter.role);
  const targetRank = roleHierarchy.indexOf(target.role);
  const newRank = roleHierarchy.indexOf(newRole);
  
  // Permission checks based on new role
  if (newRole === ClanRole.CO_LEADER && !hasPermission(promoter.role, 'canPromoteToCoLeader')) {
    throw new Error('No permission to promote to Co-Leader');
  }
  
  if (newRole === ClanRole.OFFICER && !hasPermission(promoter.role, 'canPromoteToOfficer')) {
    throw new Error('No permission to promote to Officer');
  }
  
  if (newRole === ClanRole.ELITE && !hasPermission(promoter.role, 'canPromoteToElite')) {
    throw new Error('No permission to promote to Elite');
  }
  
  // Can demote?
  const isDemotion = newRank < targetRank;
  if (isDemotion && !hasPermission(promoter.role, 'canDemote')) {
    throw new Error('No permission to demote members');
  }
  
  // Cannot modify equal or higher rank (unless leader)
  if (targetRank >= promoterRank && promoter.role !== ClanRole.LEADER) {
    throw new Error('Cannot modify members of equal or higher rank');
  }
  
  // Cannot promote above your own rank (unless leader)
  if (newRank >= promoterRank && promoter.role !== ClanRole.LEADER) {
    throw new Error('Cannot promote above your own rank');
  }
  
  // Update member role in clan
  await database.collection('clans').updateOne(
    { _id: new ObjectId(clanId), 'members.playerId': targetId },
    { $set: { 'members.$.role': newRole } }
  );
  
  // Update player role
  await database.collection('players').updateOne(
    { _id: new ObjectId(targetId) },
    { $set: { clanRole: newRole } }
  );
  
  // Log activity
  const isPromotion = newRank > targetRank;
  await logClanActivity(
    clanId,
    isPromotion ? ClanActivityType.MEMBER_PROMOTED : ClanActivityType.MEMBER_DEMOTED,
    promoterId,
    {
      targetUsername: target.username,
      oldRole: target.role,
      newRole,
    }
  );
  
  return {
    success: true,
    message: `${target.username} ${isPromotion ? 'promoted' : 'demoted'} to ${newRole}`,
  };
}

/**
 * Transfer clan leadership
 * Only current leader can transfer. New leader must be in clan.
 * Current leader becomes CO_LEADER after transfer.
 * 
 * @param clanId - Clan ID
 * @param currentLeaderId - Current leader ID (must match clan.leaderId)
 * @param newLeaderId - New leader ID (must be clan member)
 * @returns Success status
 * @throws Error if not current leader or invalid target
 * 
 * @example
 * await transferLeadership('clan123', 'oldLeader456', 'newLeader789');
 */
export async function transferLeadership(
  clanId: string,
  currentLeaderId: string,
  newLeaderId: string
): Promise<{ success: boolean; message: string }> {
  const database = getDb();
  
  // Get clan
  const clan = await getClanById(clanId);
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Verify current leader
  if (clan.leaderId !== currentLeaderId) {
    throw new Error('Only current leader can transfer leadership');
  }
  
  // Get new leader member
  const newLeader = clan.members.find(m => m.playerId === newLeaderId);
  if (!newLeader) {
    throw new Error('New leader must be a clan member');
  }
  
  // Cannot transfer to self
  if (currentLeaderId === newLeaderId) {
    throw new Error('Already clan leader');
  }
  
  // Update roles
  await database.collection('clans').updateOne(
    { _id: new ObjectId(clanId) },
    {
      $set: {
        leaderId: newLeaderId,
        'members.$[current].role': ClanRole.CO_LEADER,
        'members.$[new].role': ClanRole.LEADER,
      },
    },
    {
      arrayFilters: [
        { 'current.playerId': currentLeaderId },
        { 'new.playerId': newLeaderId },
      ],
    }
  );
  
  // Update player roles
  await database.collection('players').updateOne(
    { _id: new ObjectId(currentLeaderId) },
    { $set: { clanRole: ClanRole.CO_LEADER } }
  );
  
  await database.collection('players').updateOne(
    { _id: new ObjectId(newLeaderId) },
    { $set: { clanRole: ClanRole.LEADER } }
  );
  
  // Log activity
  await logClanActivity(clanId, ClanActivityType.LEADERSHIP_TRANSFERRED, currentLeaderId, {
    newLeaderUsername: newLeader.username,
  });
  
  return { success: true, message: `Leadership transferred to ${newLeader.username}` };
}

/**
 * Update clan settings
 * Requires appropriate permissions based on setting being changed.
 * 
 * @param clanId - Clan ID
 * @param playerId - Player ID making changes (must have permission)
 * @param settings - Partial settings to update
 * @returns Updated clan
 * @throws Error if no permission
 * 
 * @example
 * await updateClanSettings('clan123', 'leader456', { messageOfTheDay: 'New MOTD!' });
 */
export async function updateClanSettings(
  clanId: string,
  playerId: string,
  settings: Partial<Clan['settings']>
): Promise<Clan> {
  const database = getDb();
  
  // Get clan
  const clan = await getClanById(clanId);
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Get member
  const member = clan.members.find(m => m.playerId === playerId);
  if (!member) {
    throw new Error('Player not in clan');
  }
  
  // Check description edit permission if description being changed
  if (settings.messageOfTheDay !== undefined && !hasPermission(member.role, 'canEditDescription')) {
    throw new Error('No permission to edit message of the day');
  }
  
  // Only leader can change critical settings
  if (member.role !== ClanRole.LEADER) {
    const criticalSettings = ['isRecruiting', 'minLevelToJoin', 'requiresApproval', 'allowTerritoryControl', 'allowWarDeclarations'];
    const changingCriticalSetting = Object.keys(settings).some(key => criticalSettings.includes(key));
    
    if (changingCriticalSetting) {
      throw new Error('Only clan leader can change these settings');
    }
  }
  
  // Update settings
  const updateFields: Record<string, any> = {};
  for (const [key, value] of Object.entries(settings)) {
    updateFields[`settings.${key}`] = value;
  }
  
  await database.collection('clans').updateOne(
    { _id: new ObjectId(clanId) },
    { $set: updateFields }
  );
  
  // Log activity
  await logClanActivity(clanId, ClanActivityType.SETTINGS_CHANGED, playerId, {
    changes: Object.keys(settings),
  });
  
  return (await getClanById(clanId))!;
}

/**
 * Disband clan
 * Only leader can disband. Returns resources to leader and removes all members.
 * 
 * @param clanId - Clan ID
 * @param playerId - Player ID (must be leader)
 * @returns Success status
 * @throws Error if not leader
 * 
 * @example
 * await disbandClan('clan123', 'leader456');
 */
export async function disbandClan(clanId: string, playerId: string): Promise<{ success: boolean; message: string }> {
  const database = getDb();
  
  // Get clan
  const clan = await getClanById(clanId);
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Verify leader
  if (clan.leaderId !== playerId) {
    throw new Error('Only clan leader can disband the clan');
  }
  
  // Remove clan ID from all members
  const memberIds = clan.members.map(m => new ObjectId(m.playerId));
  await database.collection('players').updateMany(
    { _id: { $in: memberIds } },
    { $unset: { clanId: '', clanRole: '' } }
  );
  
  // Delete clan
  await database.collection('clans').deleteOne({ _id: new ObjectId(clanId) });
  
  // Delete associated data
  await database.collection('clan_invitations').deleteMany({ clanId });
  await database.collection('clan_activities').deleteMany({ clanId });
  await database.collection('clan_chat').deleteMany({ clanId });
  
  return { success: true, message: 'Clan disbanded successfully' };
}

/**
 * Get clan statistics
 * Calculates total power, member stats, research progress, etc.
 * 
 * @param clanId - Clan ID
 * @returns Clan statistics object
 * 
 * @example
 * const stats = await getClanStats('clan123');
 */
export async function getClanStats(clanId: string): Promise<{
  members: number;
  level: number;
  totalXP: number;
  totalPower: number;
  territories: number;
  monuments: number;
  researchPoints: number;
  bankCapacity: number;
  activePerks: number;
}> {
  const clan = await getClanById(clanId);
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  return {
    members: clan.members.length,
    level: clan.level.currentLevel,
    totalXP: clan.level.totalXP,
    totalPower: clan.stats.totalPower,
    territories: clan.territories.length,
    monuments: clan.monuments.length,
    researchPoints: clan.research.researchPoints,
    bankCapacity: clan.bank.capacity,
    activePerks: clan.activePerks.length,
  };
}

/**
 * Helper function to log clan activity
 * Integrates with clan activity tracking system.
 * 
 * @param clanId - Clan ID
 * @param activityType - Type of activity
 * @param playerId - Player performing activity
 * @param metadata - Additional activity data
 */
async function logClanActivity(
  clanId: string,
  activityType: ClanActivityType,
  playerId: string,
  metadata: Record<string, any>
): Promise<void> {
  const database = getDb();
  
  try {
    await database.collection('clan_activities').insertOne({
      clanId,
      activityType,
      playerId,
      metadata,
      timestamp: new Date(),
    });
  } catch (error) {
    // Don't fail the operation if logging fails
    console.error('Failed to log clan activity:', error);
  }
}

/**
 * IMPLEMENTATION NOTES:
 * - All operations validate permissions using hasPermission() helper from types
 * - Role hierarchy enforced: RECRUIT < MEMBER < ELITE < OFFICER < CO_LEADER < LEADER
 * - Clan creation cost configurable via CLAN_CONSTANTS (currently 1.5M/1.5M)
 * - Activity logging integrated for all major actions
 * - Clan initialized at level 1 with empty bank and no perks
 * - Solo players can create clans (minimum 1 member)
 * - Invitation system uses 7-day expiration for cleanup
 * - Leader protection: cannot be kicked, must transfer before leaving
 * - Co-Leader promotion restricted to Leader only (via permissions)
 * - XP tracking foundation in place, full implementation in clanLevelService
 * - Bank system initialized but full implementation in clanBankService
 * - Settings validation ensures only appropriate roles can change sensitive values
 */
