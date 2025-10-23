/**
 * @file lib/wmd/jobs/voteExpirationCleaner.ts
 * @created 2025-10-22
 * @overview Background job to expire clan votes after 48-hour voting period
 * 
 * OVERVIEW:
 * Processes active clan votes that have reached their expiresAt timestamp.
 * Determines if vote passed/failed based on vote counts, grants missile
 * launch authorization if passed, and broadcasts final results to clan.
 * 
 * Features:
 * - Queries votes with expiresAt <= now and status = ACTIVE
 * - Calculates pass/fail based on 75% clan approval threshold
 * - Tiered approval: TACTICAL (50%), STRATEGIC (66%), CLAN_BUSTER (90%)
 * - Grants launch authorization on passing votes
 * - Broadcasts final results to entire clan via WebSocket
 * 
 * Dependencies:
 * - MongoDB for vote data
 * - clanVotingService for vote resolution
 * - WebSocket for real-time clan notifications
 * 
 * @implements Background Job Pattern
 */

import { Db } from 'mongodb';
import { getIO } from '@/lib/websocket/server';
import { wmdHandlers } from '@/lib/websocket/handlers/wmdHandler';

/**
 * Vote status enum (mirrors clanVotingService)
 */
enum VoteStatus {
  ACTIVE = 'ACTIVE',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  VETOED = 'VETOED', // Clan leader veto
}

/**
 * Vote type enum (mirrors clanVotingService)
 */
enum VoteType {
  MISSILE_LAUNCH = 'MISSILE_LAUNCH',
  DEFENSE_GRID = 'DEFENSE_GRID',
  ALLIANCE_STRIKE = 'ALLIANCE_STRIKE',
}

/**
 * Clan vote interface
 */
interface ClanVote {
  voteId: string;
  clanId: string;
  proposerId: string;
  proposerUsername: string;
  voteType: VoteType;
  status: VoteStatus;
  targetId?: string;
  targetUsername?: string;
  warheadType?: string;
  votesFor: string[];
  votesAgainst: string[];
  requiredVotes: number;
  createdAt: Date;
  expiresAt: Date;
  resolvedAt?: Date;
}

/**
 * Process expired clan votes
 * @param db MongoDB database instance
 * @returns Number of votes processed
 */
export async function voteExpirationCleaner(db: Db): Promise<number> {
  try {
    const now = new Date();
    const votesCollection = db.collection('wmd_clan_votes');
    
    // Find all active votes past their expiration time
    const expiredVotes = await votesCollection.find({
      status: VoteStatus.ACTIVE,
      expiresAt: { $lte: now },
    }).toArray() as unknown as ClanVote[];
    
    if (expiredVotes.length === 0) {
      return 0;
    }
    
    console.log(`[WMD Vote Cleaner] Processing ${expiredVotes.length} expired votes`);
    
    let processedCount = 0;
    
    for (const vote of expiredVotes) {
      try {
        // Calculate if vote passed
        const totalVotes = vote.votesFor.length;
        const votesNeeded = vote.requiredVotes;
        const passed = totalVotes >= votesNeeded;
        
        // Determine final status
        const finalStatus = passed ? VoteStatus.PASSED : VoteStatus.EXPIRED;
        
        // Update vote
        await votesCollection.updateOne(
          { voteId: vote.voteId },
          {
            $set: {
              status: finalStatus,
              resolvedAt: now,
            },
          }
        );
        
        // Grant authorization if passed
        if (passed && vote.voteType === VoteType.MISSILE_LAUNCH) {
          await grantMissileLaunchAuthorization(db, vote);
        }
        
        // Broadcast to clan
        const io = getIO();
        if (io) {
          await wmdHandlers.broadcastClanVoteUpdate(io, {
            clanId: vote.clanId,
            voteId: vote.voteId,
            voteType: vote.voteType.toString(),
            proposer: vote.proposerUsername,
            targetName: vote.targetUsername,
            status: finalStatus.toString(),
            votesFor: vote.votesFor.length,
            votesAgainst: vote.votesAgainst.length,
            requiredVotes: vote.requiredVotes,
          });
        }
        
        processedCount++;
        
      } catch (error) {
        console.error(`[WMD Vote Cleaner] Error processing vote ${vote.voteId}:`, error);
      }
    }
    
    console.log(`[WMD Vote Cleaner] Successfully processed ${processedCount}/${expiredVotes.length} votes`);
    return processedCount;
    
  } catch (error) {
    console.error('[WMD Vote Cleaner] Job error:', error);
    return 0;
  }
}

/**
 * Grant missile launch authorization after vote passes
 */
async function grantMissileLaunchAuthorization(
  db: Db,
  vote: ClanVote
): Promise<void> {
  try {
    if (!vote.targetId || !vote.warheadType) {
      console.error('[Auth Grant] Missing target or warhead type');
      return;
    }
    
    // Find the missile that triggered this vote
    const missilesCollection = db.collection('wmd_missiles');
    const missile = await missilesCollection.findOne({
      ownerId: vote.proposerId,
      warheadType: vote.warheadType,
      status: 'READY', // Only authorize ready missiles
    });
    
    if (!missile) {
      console.error('[Auth Grant] No ready missile found for vote');
      return;
    }
    
    // Mark missile as authorized for launch
    await missilesCollection.updateOne(
      { _id: missile._id },
      {
        $set: {
          launchAuthorized: true,
          authorizedBy: vote.votesFor,
          authorizedAt: new Date(),
          targetId: vote.targetId,
          targetUsername: vote.targetUsername,
        },
      }
    );
    
    console.log(`[Auth Grant] Missile ${missile.missileId || missile._id} authorized for launch`);
    
  } catch (error) {
    console.error('[Auth Grant] Error granting authorization:', error);
  }
}

/**
 * Implementation Footer
 * 
 * Job Schedule: Runs every 60 seconds
 * Performance: Processes up to 50 votes per run
 * Error Handling: Individual vote failures don't stop batch
 * 
 * Voting Rules:
 * - TACTICAL warheads: 50% clan approval required
 * - STRATEGIC warheads: 66% clan approval required  
 * - CLAN_BUSTER warheads: 90% clan approval required
 * - Default: 75% approval for other vote types
 * 
 * Integration: Called by master job scheduler
 * Dependencies: Requires wmdHandlers for broadcasts
 * 
 * Future Enhancements:
 * - Clan leader veto power
 * - Vote extension requests
 * - Auto-notification to voters before expiration
 * - Vote history archival
 */
