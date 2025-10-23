/**
 * WebSocket Event Types and Payload Schemas
 * Created: 2025-10-19
 * 
 * OVERVIEW:
 * Comprehensive type-safe WebSocket event definitions for real-time communication.
 * Covers all event categories: game, clan, chat, combat, and system notifications.
 * 
 * Architecture:
 * - Server-to-Client events (broadcasts, notifications)
 * - Client-to-Server events (actions, requests)
 * - Bidirectional events (acknowledgments, responses)
 * 
 * Event Categories:
 * 1. Game Events: Position updates, resource changes, level-ups
 * 2. Clan Events: Member actions, territory changes, warfare
 * 3. Chat Events: Messages, typing indicators, presence
 * 4. Combat Events: Battle notifications, unit updates
 * 5. System Events: Achievements, maintenance, global notifications
 */

// ============================================================================
// BASE TYPES
// ============================================================================

export interface WebSocketUser {
  userId: string;
  username: string;
  level?: number;
  clanId?: string;
  clanName?: string;
}

export interface WebSocketError {
  code: string;
  message: string;
  details?: unknown;
}

// ============================================================================
// GAME EVENTS
// ============================================================================

export interface GamePositionUpdatePayload {
  userId: string;
  username: string;
  x: number;
  y: number;
  timestamp: number;
}

export interface GameResourceChangePayload {
  userId: string;
  resourceType: 'wood' | 'stone' | 'iron' | 'gold' | 'food' | 'energy';
  previousAmount: number;
  newAmount: number;
  change: number;
  reason: string;
}

export interface GameLevelUpPayload {
  userId: string;
  username: string;
  previousLevel: number;
  newLevel: number;
  unlockedFeatures?: string[];
}

export interface GameTileUpdatePayload {
  x: number;
  y: number;
  tileType: string;
  ownerId?: string;
  ownerName?: string;
  clanId?: string;
  clanName?: string;
}

export interface GamePlayerOnlinePayload {
  userId: string;
  username: string;
  level: number;
  x: number;
  y: number;
}

export interface GamePlayerOfflinePayload {
  userId: string;
  username: string;
}

// ============================================================================
// CLAN EVENTS
// ============================================================================

export interface ClanMemberJoinedPayload {
  clanId: string;
  clanName: string;
  userId: string;
  username: string;
  joinedAt: number;
  memberCount: number;
}

export interface ClanMemberLeftPayload {
  clanId: string;
  clanName: string;
  userId: string;
  username: string;
  reason: 'left' | 'kicked' | 'disbanded';
  leftAt: number;
  memberCount: number;
}

export interface ClanMemberRoleChangedPayload {
  clanId: string;
  userId: string;
  username: string;
  previousRole: string;
  newRole: string;
  changedBy: string;
}

export interface ClanTerritoryUpdatePayload {
  clanId: string;
  clanName: string;
  action: 'captured' | 'lost' | 'defended';
  x: number;
  y: number;
  previousOwner?: string;
  newOwner?: string;
  timestamp: number;
}

export interface ClanWarDeclaredPayload {
  warId: string;
  attackerClanId: string;
  attackerClanName: string;
  defenderClanId: string;
  defenderClanName: string;
  warType: 'territory' | 'resource' | 'honor';
  declaredAt: number;
  declaredBy: string;
}

export interface ClanWarEndedPayload {
  warId: string;
  attackerClanId: string;
  attackerClanName: string;
  defenderClanId: string;
  defenderClanName: string;
  winner: 'attacker' | 'defender' | 'draw';
  endedAt: number;
  casualties: {
    attacker: number;
    defender: number;
  };
  territoriesChanged?: number;
}

export interface ClanTreasuryUpdatePayload {
  clanId: string;
  resourceType: 'wood' | 'stone' | 'iron' | 'gold' | 'food';
  previousAmount: number;
  newAmount: number;
  change: number;
  actionType: 'deposit' | 'withdrawal' | 'war_cost' | 'building';
  performedBy: string;
  timestamp: number;
}

export interface ClanActivityPayload {
  clanId: string;
  activityType: 'member_joined' | 'member_left' | 'territory_captured' | 
                 'territory_lost' | 'war_declared' | 'war_won' | 'war_lost' |
                 'treasury_deposit' | 'treasury_withdrawal' | 'member_promoted' |
                 'member_demoted' | 'building_constructed';
  description: string;
  actorUserId?: string;
  actorUsername?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ClanLeaderboardUpdatePayload {
  clanId: string;
  clanName: string;
  category: 'power' | 'territory' | 'combat' | 'economic' | 'members';
  previousRank: number;
  newRank: number;
  rankChange: number;
  score: number;
}

// ============================================================================
// CHAT EVENTS
// ============================================================================

export interface ChatMessagePayload {
  messageId: string;
  clanId: string;
  userId: string;
  username: string;
  content: string;
  timestamp: number;
  mentions?: string[];
  isPinned?: boolean;
}

export interface ChatTypingPayload {
  clanId: string;
  userId: string;
  username: string;
  isTyping: boolean;
}

export interface ChatMemberOnlinePayload {
  clanId: string;
  userId: string;
  username: string;
  status: 'online' | 'away' | 'offline';
}

export interface ChatMessageEditedPayload {
  messageId: string;
  clanId: string;
  newContent: string;
  editedAt: number;
}

export interface ChatMessageDeletedPayload {
  messageId: string;
  clanId: string;
  deletedBy: string;
  deletedAt: number;
}

// ============================================================================
// COMBAT EVENTS
// ============================================================================

export interface CombatAttackStartedPayload {
  battleId: string;
  attackerId: string;
  attackerName: string;
  defenderId: string;
  defenderName: string;
  attackerClanId?: string;
  defenderClanId?: string;
  location: { x: number; y: number };
  startedAt: number;
}

export interface CombatBattleResultPayload {
  battleId: string;
  winner: string;
  loser: string;
  winnerClanId?: string;
  loserClanId?: string;
  casualties: {
    winner: number;
    loser: number;
  };
  resourcesLost: {
    winner: Record<string, number>;
    loser: Record<string, number>;
  };
  experienceGained: {
    winner: number;
    loser: number;
  };
  completedAt: number;
}

export interface CombatUnitDestroyedPayload {
  battleId: string;
  unitId: string;
  unitType: string;
  ownerId: string;
  ownerName: string;
  destroyedBy: string;
  timestamp: number;
}

export interface CombatDefenseAlertPayload {
  defenderId: string;
  defenderName: string;
  attackerId: string;
  attackerName: string;
  location: { x: number; y: number };
  estimatedArrival: number;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================================================
// SYSTEM EVENTS
// ============================================================================

export interface SystemNotificationPayload {
  notificationId: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  userId?: string;
  clanId?: string;
  actionUrl?: string;
  timestamp: number;
  expiresAt?: number;
}

export interface SystemAchievementUnlockedPayload {
  userId: string;
  username: string;
  achievementId: string;
  achievementName: string;
  achievementDescription: string;
  rewards?: {
    experience?: number;
    gold?: number;
    items?: string[];
  };
  unlockedAt: number;
}

export interface SystemMaintenanceAlertPayload {
  maintenanceId: string;
  type: 'scheduled' | 'emergency';
  message: string;
  startTime: number;
  estimatedDuration: number;
  affectedSystems?: string[];
}

export interface SystemServerStatsPayload {
  onlinePlayers: number;
  activeClans: number;
  ongoingBattles: number;
  serverLoad: number;
  timestamp: number;
}

// ============================================================================
// WMD EVENTS
// ============================================================================

export interface WMDMissileLaunchedPayload {
  missileId: string;
  targetName: string;
  warheadType: string;
  impactAt: string;
  message: string;
}

export interface WMDIncomingMissilePayload {
  missileId: string;
  launcherName: string;
  warheadType: string;
  impactAt: string;
  message: string;
}

export interface WMDMissileInterceptedPayload {
  missileId: string;
  targetName?: string;
  launcherName?: string;
  interceptedBy: string;
  message: string;
}

export interface WMDInterceptionSuccessPayload {
  missileId: string;
  launcherName: string;
  message: string;
}

export interface WMDMissileImpactPayload {
  missileId: string;
  targetName?: string;
  launcherName?: string;
  warheadType: string;
  damageDealt: number;
  message: string;
}

export interface WMDResearchCompletePayload {
  techId: string;
  techName: string;
  category: string;
  message: string;
}

export interface WMDSpyMissionCompletePayload {
  missionId: string;
  spyName: string;
  targetName: string;
  missionType: string;
  success: boolean;
  intelligence?: string;
  message: string;
}

export interface WMDVoteUpdatePayload {
  voteId: string;
  voteType: string;
  proposer: string;
  targetName?: string;
  status: string;
  votesFor: number;
  votesAgainst: number;
  requiredVotes: number;
  message: string;
}

export interface WMDBatteryDeployedPayload {
  batteryId: string;
  batteryType: string;
  interceptChance: number;
  message: string;
}

export interface WMDSpyRecruitedPayload {
  spyId: string;
  spyName: string;
  specialization: string;
  message: string;
}

export interface WMDCounterIntelAlertPayload {
  spiesDetected: Array<{ codename: string; specialization: string }>;
  message: string;
}

// ============================================================================
// SERVER-TO-CLIENT EVENT MAP
// ============================================================================

export interface ServerToClientEvents {
  // Game Events
  'game:position_update': (payload: GamePositionUpdatePayload) => void;
  'game:resource_change': (payload: GameResourceChangePayload) => void;
  'game:level_up': (payload: GameLevelUpPayload) => void;
  'game:tile_update': (payload: GameTileUpdatePayload) => void;
  'game:player_online': (payload: GamePlayerOnlinePayload) => void;
  'game:player_offline': (payload: GamePlayerOfflinePayload) => void;

  // Clan Events
  'clan:member_joined': (payload: ClanMemberJoinedPayload) => void;
  'clan:member_left': (payload: ClanMemberLeftPayload) => void;
  'clan:member_role_changed': (payload: ClanMemberRoleChangedPayload) => void;
  'clan:territory_update': (payload: ClanTerritoryUpdatePayload) => void;
  'clan:war_declared': (payload: ClanWarDeclaredPayload) => void;
  'clan:war_ended': (payload: ClanWarEndedPayload) => void;
  'clan:treasury_update': (payload: ClanTreasuryUpdatePayload) => void;
  'clan:activity': (payload: ClanActivityPayload) => void;
  'clan:leaderboard_update': (payload: ClanLeaderboardUpdatePayload) => void;

  // Chat Events
  'chat:message': (payload: ChatMessagePayload) => void;
  'chat:typing': (payload: ChatTypingPayload) => void;
  'chat:member_online': (payload: ChatMemberOnlinePayload) => void;
  'chat:message_edited': (payload: ChatMessageEditedPayload) => void;
  'chat:message_deleted': (payload: ChatMessageDeletedPayload) => void;

  // Combat Events
  'combat:attack_started': (payload: CombatAttackStartedPayload) => void;
  'combat:battle_result': (payload: CombatBattleResultPayload) => void;
  'combat:unit_destroyed': (payload: CombatUnitDestroyedPayload) => void;
  'combat:defense_alert': (payload: CombatDefenseAlertPayload) => void;

  // System Events
  'system:notification': (payload: SystemNotificationPayload) => void;
  'system:achievement_unlocked': (payload: SystemAchievementUnlockedPayload) => void;
  'system:maintenance_alert': (payload: SystemMaintenanceAlertPayload) => void;
  'system:server_stats': (payload: SystemServerStatsPayload) => void;

  // WMD Events
  'wmd:missile_launched': (payload: WMDMissileLaunchedPayload) => void;
  'wmd:incoming_missile': (payload: WMDIncomingMissilePayload) => void;
  'wmd:missile_intercepted': (payload: WMDMissileInterceptedPayload) => void;
  'wmd:interception_success': (payload: WMDInterceptionSuccessPayload) => void;
  'wmd:missile_impact': (payload: WMDMissileImpactPayload) => void;
  'wmd:research_complete': (payload: WMDResearchCompletePayload) => void;
  'wmd:spy_mission_complete': (payload: WMDSpyMissionCompletePayload) => void;
  'wmd:vote_update': (payload: WMDVoteUpdatePayload) => void;
  'wmd:battery_deployed': (payload: WMDBatteryDeployedPayload) => void;
  'wmd:spy_recruited': (payload: WMDSpyRecruitedPayload) => void;
  'wmd:counter_intel_alert': (payload: WMDCounterIntelAlertPayload) => void;

  // Connection Events
  'connect': () => void;
  'disconnect': () => void;
  'error': (error: WebSocketError) => void;
}

// ============================================================================
// CLIENT-TO-SERVER EVENT MAP
// ============================================================================

export interface ClientToServerEvents {
  // Game Actions
  'game:update_position': (data: { x: number; y: number }) => void;
  'game:request_tile_info': (data: { x: number; y: number }) => void;

  // Clan Actions
  'clan:join_room': (data: { clanId: string }) => void;
  'clan:leave_room': (data: { clanId: string }) => void;
  'clan:declare_war': (data: {
    targetClanId: string;
    warType: 'territory' | 'resource' | 'honor';
    unitsCommitted: number;
  }) => void;

  // Chat Actions
  'chat:send_message': (data: {
    clanId: string;
    content: string;
    mentions?: string[];
  }, callback?: (response: { success: boolean; messageId?: string; error?: string }) => void) => void;
  'chat:start_typing': (data: { clanId: string }) => void;
  'chat:stop_typing': (data: { clanId: string }) => void;
  'chat:edit_message': (data: {
    messageId: string;
    clanId: string;
    newContent: string;
  }) => void;
  'chat:delete_message': (data: {
    messageId: string;
    clanId: string;
  }) => void;

  // Combat Actions
  'combat:request_battle_update': (data: { battleId: string }) => void;

  // System Actions
  'system:ping': (callback: (latency: number) => void) => void;
}

// ============================================================================
// ROOM NAMING CONVENTIONS
// ============================================================================

export const WebSocketRooms = {
  global: () => 'global',
  user: (userId: string) => `user:${userId}`,
  clan: (clanId: string) => `clan:${clanId}`,
  clanChat: (clanId: string) => `clan:${clanId}:chat`,
  battle: (battleId: string) => `battle:${battleId}`,
  location: (x: number, y: number) => `location:${x}:${y}`,
} as const;

// ============================================================================
// CONNECTION STATE
// ============================================================================

export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'reconnecting' | 'error';

export interface WebSocketConnectionInfo {
  state: ConnectionState;
  connectedAt?: number;
  disconnectedAt?: number;
  reconnectAttempts: number;
  latency?: number;
  userId?: string;
  rooms: string[];
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. Event Naming Convention:
 *    - Format: `category:action` (e.g., 'clan:war_declared')
 *    - Categories: game, clan, chat, combat, system
 *    - Actions: past tense for notifications, present for requests
 * 
 * 2. Payload Design:
 *    - Always include timestamp for event ordering
 *    - Include user context (userId, username) for attribution
 *    - Use optional fields with `?` for conditional data
 *    - Provide metadata object for extensibility
 * 
 * 3. Type Safety:
 *    - All events strongly typed via ServerToClientEvents interface
 *    - Payloads validated on both client and server
 *    - Use discriminated unions for action types
 * 
 * 4. Room Management:
 *    - Use WebSocketRooms helper for consistent naming
 *    - Auto-join user-specific room on connection
 *    - Join/leave clan rooms on membership changes
 *    - Location-based rooms for proximity events
 * 
 * 5. Performance Considerations:
 *    - Keep payloads small (< 1KB typical)
 *    - Batch similar events when possible
 *    - Use throttling for high-frequency events (position updates)
 *    - Implement selective room subscriptions
 * 
 * 6. Security:
 *    - Validate user permissions before emitting to rooms
 *    - Never expose sensitive data in payloads
 *    - Rate-limit client-to-server events
 *    - Authenticate socket connections via JWT
 * 
 * FUTURE ENHANCEMENTS:
 * - Add event versioning for backward compatibility
 * - Implement event compression for large payloads
 * - Add replay/history functionality
 * - Support for custom user-defined events
 */
