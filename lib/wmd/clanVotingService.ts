/**
 * @file lib/wmd/clanVotingService.ts
 * @created 2025-10-22
 * @overview WMD Clan Voting Service - WMD Authorization System
 * 
 * OVERVIEW:
 * Manages clan voting for WMD launches, resource pooling, and strategic decisions.
 * Implements democratic authorization for high-stakes WMD operations.
 * 
 * Features:
 * - Launch authorization votes
 * - Resource pooling decisions
 * - Defense grid coordination
 * - Vote tracking and results
 * 
 * Dependencies:
 * - /types/wmd for voting types
 * - MongoDB for vote storage
 */

import { Db } from 'mongodb';
import { WarheadType } from '@/types/wmd';

/**
 * Vote status enum
 */
export enum VoteStatus {
  ACTIVE = 'ACTIVE',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  VETOED = 'VETOED', // Clan leader veto
}

/**
 * Vote type enum
 */
export enum VoteType {
  LAUNCH_AUTHORIZATION = 'LAUNCH_AUTHORIZATION',
  RESOURCE_POOLING = 'RESOURCE_POOLING',
  DEFENSE_GRID = 'DEFENSE_GRID',
  ALLIANCE_STRIKE = 'ALLIANCE_STRIKE',
}

/**
 * Clan vote interface
 */
export interface ClanVote {
  voteId: string;
  clanId: string;
  proposerId: string;
  proposerUsername: string;
  voteType: VoteType;
  status: VoteStatus;
  
  // Vote details
  targetId?: string;
  targetUsername?: string;
  warheadType?: WarheadType;
  resourceAmount?: number;
  
  // Voting
  votesFor: string[];
  votesAgainst: string[];
  requiredVotes: number;
  
  // Timestamps
  createdAt: Date;
  expiresAt: Date;
  resolvedAt?: Date;
}

/**
 * Create a new clan vote
 * 
 * VOTING REQUIREMENTS (STRICT):
 * - TACTICAL warheads: 50% approval (small clans can act quickly)
 * - STRATEGIC warheads: 66% approval (significant force)
 * - NEUTRON/CLUSTER warheads: 75% approval (default)
 * - CLAN_BUSTER warheads: 90% approval (devastating = needs consensus)
 * - Voting period: 48 hours (up from 24h for better participation)
 * - Clan leader can VETO any vote
 */
export async function createClanVote(
  db: Db,
  clanId: string,
  proposerId: string,
  proposerUsername: string,
  voteType: VoteType,
  details: {
    targetId?: string;
    targetUsername?: string;
    warheadType?: WarheadType;
    resourceAmount?: number;
  }
): Promise<{ success: boolean; message: string; voteId?: string; requiredVotes?: number; expiresAt?: Date }> {
  try {
    // Get clan member count
    const memberCount = await getClanMemberCount(db, clanId);
    
    // Calculate required votes based on warhead type (TIERED APPROVAL)
    let approvalThreshold = 0.75; // Default: 75% approval
    
    if (voteType === VoteType.LAUNCH_AUTHORIZATION && details.warheadType) {
      switch (details.warheadType) {
        case WarheadType.TACTICAL:
          approvalThreshold = 0.50; // 50% - allows small clans to be agile
          break;
        case WarheadType.STRATEGIC:
          approvalThreshold = 0.66; // 66% - significant weapon
          break;
        case WarheadType.NEUTRON:
        case WarheadType.CLUSTER:
          approvalThreshold = 0.75; // 75% - default for advanced weapons
          break;
        case WarheadType.CLAN_BUSTER:
          approvalThreshold = 0.90; // 90% - devastating requires near-consensus
          break;
        default:
          approvalThreshold = 0.75;
      }
    }
    
    const requiredVotes = Math.ceil(memberCount * approvalThreshold);
    
    const voteId = `vote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 HOURS (up from 24h)
    
    const vote: ClanVote = {
      voteId,
      clanId,
      proposerId,
      proposerUsername,
      voteType,
      status: VoteStatus.ACTIVE,
      targetId: details.targetId,
      targetUsername: details.targetUsername,
      warheadType: details.warheadType,
      resourceAmount: details.resourceAmount,
      votesFor: [proposerId], // Proposer auto-votes yes
      votesAgainst: [],
      requiredVotes,
      createdAt: now,
      expiresAt,
    };
    
    const collection = db.collection('wmd_clan_votes');
    await collection.insertOne(vote);
    
    const warheadInfo = details.warheadType ? ` (${details.warheadType} - ${Math.floor(approvalThreshold * 100)}% approval needed)` : '';
    
    return {
      success: true,
      message: `Vote created${warheadInfo}. ${requiredVotes}/${memberCount} votes required. Expires in 48 hours.`,
      voteId,
      requiredVotes,
      expiresAt,
    };
    
  } catch (error) {
    console.error('Error creating clan vote:', error);
    return { success: false, message: 'Failed to create vote' };
  }
}

/**
 * Cast a vote
 */
export async function castVote(
  db: Db,
  voteId: string,
  voterId: string,
  voteFor: boolean
): Promise<{ success: boolean; message: string; voteStatus?: VoteStatus }> {
  try {
    const collection = db.collection('wmd_clan_votes');
    const vote = await collection.findOne({ voteId }) as unknown as ClanVote | null;
    
    if (!vote) {
      return { success: false, message: 'Vote not found' };
    }
    
    if (vote.status !== VoteStatus.ACTIVE) {
      return { success: false, message: 'Vote is no longer active' };
    }
    
    // Check if already voted
    if (vote.votesFor.includes(voterId) || vote.votesAgainst.includes(voterId)) {
      return { success: false, message: 'You have already voted' };
    }
    
    // Cast vote
    const updateField = voteFor ? 'votesFor' : 'votesAgainst';
    await collection.updateOne(
      { voteId },
      {
        $push: { [updateField]: voterId } as any,
        $set: { updatedAt: new Date() },
      }
    );
    
    // Check if vote should be resolved
    const updatedVote = await collection.findOne({ voteId }) as unknown as ClanVote;
    if (updatedVote) {
      const status = checkVoteStatus(updatedVote);
      if (status !== VoteStatus.ACTIVE) {
        await resolveVote(db, voteId, status);
        return {
          success: true,
          message: `Vote ${status.toLowerCase()}!`,
          voteStatus: status,
        };
      }
    }
    
    return { success: true, message: 'Vote cast successfully' };
    
  } catch (error) {
    console.error('Error casting vote:', error);
    return { success: false, message: 'Failed to cast vote' };
  }
}

/**
 * Clan leader veto power
 * 
 * LEADER PRIVILEGE:
 * - Clan leader can instantly veto any active vote
 * - Does NOT require majority approval
 * - Immediately sets vote status to VETOED
 * - Broadcasts veto decision to entire clan
 * - Cannot be reversed once vetoed
 */
export async function vetoClanVote(
  db: Db,
  voteId: string,
  playerId: string,
  playerUsername: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Get the vote
    const votesCollection = db.collection('wmd_clan_votes');
    const vote = await votesCollection.findOne({ voteId }) as unknown as ClanVote | null;
    
    if (!vote) {
      return { success: false, message: 'Vote not found' };
    }
    
    if (vote.status !== VoteStatus.ACTIVE) {
      return { success: false, message: `Cannot veto: Vote is already ${vote.status.toLowerCase()}` };
    }
    
    // Verify player is clan leader
    const clansCollection = db.collection('clans');
    const clan = await clansCollection.findOne({ clanId: vote.clanId }) as unknown as any;
    
    if (!clan) {
      return { success: false, message: 'Clan not found' };
    }
    
    if (clan.leaderId !== playerId) {
      return { success: false, message: 'Only the clan leader can veto votes' };
    }
    
    // VETO THE VOTE
    await votesCollection.updateOne(
      { voteId },
      {
        $set: {
          status: VoteStatus.VETOED,
          vetoedBy: playerId,
          vetoedByUsername: playerUsername,
          vetoReason: reason || 'No reason provided',
          resolvedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );
    
    console.log(`Vote ${voteId} VETOED by clan leader ${playerUsername}. Reason: ${reason || 'No reason provided'}`);
    
    // Broadcast veto to clan
    const { wmdHandlers } = await import('@/lib/websocket/handlers/wmdHandler');
    const { getIO } = await import('@/lib/websocket/server');
    const io = getIO();
    
    if (io) {
      await wmdHandlers.broadcastClanVoteUpdate(io, {
        clanId: vote.clanId,
        voteId,
        voteType: vote.voteType.toString(),
        proposer: vote.proposerUsername,
        targetName: vote.targetUsername,
        status: 'VETOED',
        votesFor: vote.votesFor.length,
        votesAgainst: vote.votesAgainst.length,
        requiredVotes: vote.requiredVotes,
      });
    }
    
    return {
      success: true,
      message: `Vote vetoed by clan leader ${playerUsername}. Reason: ${reason || 'No reason provided'}`,
    };
    
  } catch (error) {
    console.error('Error vetoing clan vote:', error);
    return { success: false, message: 'Failed to veto vote' };
  }
}

/**
 * Check vote status and determine if resolved
 */
function checkVoteStatus(vote: ClanVote): VoteStatus {
  // Check expiration
  if (new Date() > vote.expiresAt) {
    return VoteStatus.EXPIRED;
  }
  
  // Check if passed
  if (vote.votesFor.length >= vote.requiredVotes) {
    return VoteStatus.PASSED;
  }
  
  // Check if failed (impossible to pass)
  const totalMembers = vote.votesFor.length + vote.votesAgainst.length;
  const remainingVotes = totalMembers - vote.votesFor.length;
  if (vote.votesFor.length + remainingVotes < vote.requiredVotes) {
    return VoteStatus.FAILED;
  }
  
  return VoteStatus.ACTIVE;
}

/**
 * Resolve a vote
 */
async function resolveVote(
  db: Db,
  voteId: string,
  status: VoteStatus
): Promise<void> {
  try {
    const collection = db.collection('wmd_clan_votes');
    await collection.updateOne(
      { voteId },
      {
        $set: {
          status,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );
    
    // Execute vote action if passed
    if (status === VoteStatus.PASSED) {
      const vote = await collection.findOne({ voteId }) as unknown as ClanVote;
      if (vote) {
        await executeVoteAction(db, vote);
      }
    }
    
  } catch (error) {
    console.error('Error resolving vote:', error);
  }
}

/**
 * Execute approved vote action
 */
async function executeVoteAction(db: Db, vote: ClanVote): Promise<void> {
  try {
    switch (vote.voteType) {
      case VoteType.LAUNCH_AUTHORIZATION:
        // Grant launch authorization (stored for 24 hours)
        const authCollection = db.collection('wmd_launch_authorizations');
        await authCollection.insertOne({
          authId: `auth_${Date.now()}`,
          playerId: vote.proposerId,
          clanId: vote.clanId,
          warheadType: vote.warheadType,
          targetId: vote.targetId,
          grantedAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        break;
        
      case VoteType.RESOURCE_POOLING:
        // Enable resource pooling
        const poolCollection = db.collection('wmd_resource_pools');
        await poolCollection.insertOne({
          poolId: `pool_${Date.now()}`,
          clanId: vote.clanId,
          resourceAmount: vote.resourceAmount || 0,
          contributorsAllowed: vote.votesFor,
          createdAt: new Date(),
        });
        break;
        
      case VoteType.DEFENSE_GRID:
        // Activate defense grid
        const gridCollection = db.collection('wmd_defense_grids');
        await gridCollection.insertOne({
          gridId: `grid_${Date.now()}`,
          clanId: vote.clanId,
          isActive: true,
          activatedAt: new Date(),
        });
        break;
    }
    
  } catch (error) {
    console.error('Error executing vote action:', error);
  }
}

/**
 * Get clan's active votes
 */
export async function getClanVotes(
  db: Db,
  clanId: string,
  activeOnly: boolean = true
): Promise<ClanVote[]> {
  try {
    const collection = db.collection('wmd_clan_votes');
    const filter: any = { clanId };
    
    if (activeOnly) {
      filter.status = VoteStatus.ACTIVE;
    }
    
    return await collection
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray() as unknown as ClanVote[];
    
  } catch (error) {
    console.error('Error getting clan votes:', error);
    return [];
  }
}

/**
 * Check if player has launch authorization
 */
export async function hasLaunchAuthorization(
  db: Db,
  playerId: string,
  warheadType: WarheadType
): Promise<boolean> {
  try {
    const collection = db.collection('wmd_launch_authorizations');
    const auth = await collection.findOne({
      playerId,
      warheadType,
      expiresAt: { $gt: new Date() },
    });
    
    return !!auth;
    
  } catch (error) {
    console.error('Error checking launch authorization:', error);
    return false;
  }
}

/**
 * Get clan member count
 */
async function getClanMemberCount(db: Db, clanId: string): Promise<number> {
  try {
    const collection = db.collection('players');
    return await collection.countDocuments({ clanId });
  } catch (error) {
    console.error('Error getting clan member count:', error);
    return 1;
  }
}

/**
 * Expire old votes (cleanup job)
 */
export async function expireOldVotes(db: Db): Promise<number> {
  try {
    const collection = db.collection('wmd_clan_votes');
    const result = await collection.updateMany(
      {
        status: VoteStatus.ACTIVE,
        expiresAt: { $lt: new Date() },
      },
      {
        $set: {
          status: VoteStatus.EXPIRED,
          resolvedAt: new Date(),
        },
      }
    );
    
    return result.modifiedCount;
    
  } catch (error) {
    console.error('Error expiring old votes:', error);
    return 0;
  }
}
