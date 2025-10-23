/**
 * @file app/api/wmd/voting/route.ts
 * @created 2025-10-22
 * @updated 2025-10-23 - Added veto action for clan leaders
 * @overview WMD Clan Voting API Endpoints
 * 
 * OVERVIEW:
 * Handles clan voting system for WMD launch authorization and other
 * critical decisions requiring clan consensus.
 * 
 * Features:
 * - GET: Fetch clan votes and authorization status
 * - POST: Create votes, cast ballots, and veto (leader only)
 * 
 * Authentication: JWT tokens via HttpOnly cookies
 * Dependencies: clanVotingService.ts, apiHelpers.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, getAuthenticatedPlayer } from '@/lib/wmd/apiHelpers';
import {
  createClanVote,
  castVote,
  getClanVotes,
  hasLaunchAuthorization,
  vetoClanVote,
} from '@/lib/wmd/clanVotingService';
import { getIO } from '@/lib/websocket/server';
import { wmdHandlers } from '@/lib/websocket/handlers';

/**
 * GET /api/wmd/voting
 * Fetch clan votes or check authorization
 * 
 * Query:
 * - action: 'list' | 'checkAuth'
 * - missileId: string (for checkAuth)
 */
export async function GET(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const auth = await getAuthenticatedPlayer(req, db);
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'list';
    
    // List clan votes
    if (action === 'list') {
      if (!auth.player.clanId) {
        return NextResponse.json(
          { error: 'Not in a clan' },
          { status: 400 }
        );
      }
      
      const votes = await getClanVotes(db, auth.player.clanId);
      return NextResponse.json({ success: true, votes });
    }
    
    // Check launch authorization
    if (action === 'checkAuth') {
      const missileId = searchParams.get('missileId');
      const warheadType = searchParams.get('warheadType');
      
      if (!missileId || !warheadType) {
        return NextResponse.json(
          { error: 'Missing required query params: missileId, warheadType' },
          { status: 400 }
        );
      }
      
      const authorized = await hasLaunchAuthorization(db, auth.playerId, warheadType as any);
      
      return NextResponse.json({
        success: true,
        authorized,
      });
    }
    
    return NextResponse.json(
      { error: 'Invalid action. Use "list" or "checkAuth"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in voting GET:', error);
    return NextResponse.json(
      { error: 'Failed to fetch voting data' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/wmd/voting
 * Create vote or cast ballot
 * 
 * Body:
 * - action: 'create' | 'cast'
 * - voteType: string (for create)
 * - targetId: string (for create)
 * - description: string (for create)
 * - voteId: string (for cast)
 * - vote: boolean (for cast)
 */
export async function POST(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const auth = await getAuthenticatedPlayer(req, db);
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    if (!auth.player.clanId) {
      return NextResponse.json(
        { error: 'Not in a clan' },
        { status: 400 }
      );
    }
    
    const body = await req.json();
    const { action } = body;
    
    if (!action) {
      return NextResponse.json(
        { error: 'Missing required field: action' },
        { status: 400 }
      );
    }
    
    // Create vote
    if (action === 'create') {
      const { voteType, targetId, targetUsername, warheadType, resourceAmount } = body;
      
      if (!voteType) {
        return NextResponse.json(
          { error: 'Missing required field: voteType' },
          { status: 400 }
        );
      }
      
      const result = await createClanVote(
        db,
        auth.player.clanId,
        auth.playerId,
        auth.username,
        voteType,
        {
          targetId,
          targetUsername,
          warheadType,
          resourceAmount,
        }
      );
      
      if (!result.success) {
        return NextResponse.json(
          { error: result.message },
          { status: 400 }
        );
      }
      
      return NextResponse.json({
        success: true,
        message: result.message,
        voteId: result.voteId,
      });
    }
    
    // Cast vote
    if (action === 'cast') {
      const { voteId, vote } = body;
      
      if (!voteId || typeof vote !== 'boolean') {
        return NextResponse.json(
          { error: 'Missing required fields: voteId (string), vote (boolean)' },
          { status: 400 }
        );
      }
      
      const result = await castVote(db, voteId, auth.username, vote);
      
      if (!result.success) {
        return NextResponse.json(
          { error: result.message },
          { status: 400 }
        );
      }
      
      // Broadcast vote update to clan
      try {
        const voteData = await db.collection('wmd_clan_votes').findOne({ voteId });
        const io = getIO();
        if (voteData && io) {
          await wmdHandlers.broadcastClanVoteUpdate(io, {
            clanId: auth.player.clanId,
            voteId,
            voteType: voteData.voteType,
            proposer: voteData.proposer,
            targetName: voteData.targetUsername,
            status: result.voteStatus || voteData.status,
            votesFor: voteData.votesFor.length,
            votesAgainst: voteData.votesAgainst.length,
            requiredVotes: voteData.requiredVotes,
          });
        }
      } catch (broadcastError) {
        console.error('Failed to broadcast vote update:', broadcastError);
      }
      
      return NextResponse.json({
        success: true,
        message: result.message,
        voteStatus: result.voteStatus,
      });
    }
    
    // Veto vote (leader only)
    if (action === 'veto') {
      const { voteId, reason } = body;
      
      if (!voteId) {
        return NextResponse.json(
          { error: 'Missing required field: voteId' },
          { status: 400 }
        );
      }
      
      const result = await vetoClanVote(db, voteId, auth.playerId, auth.username, reason);
      
      if (!result.success) {
        return NextResponse.json(
          { error: result.message },
          { status: 400 }
        );
      }
      
      // Broadcast veto to clan
      try {
        const voteData = await db.collection('wmd_clan_votes').findOne({ voteId });
        const io = getIO();
        if (voteData && io) {
          await wmdHandlers.broadcastClanVoteUpdate(io, {
            clanId: auth.player.clanId,
            voteId,
            voteType: voteData.voteType,
            proposer: voteData.proposer,
            targetName: voteData.targetUsername,
            status: 'VETOED',
            votesFor: voteData.votesFor.length,
            votesAgainst: voteData.votesAgainst.length,
            requiredVotes: voteData.requiredVotes,
          });
        }
      } catch (broadcastError) {
        console.error('Failed to broadcast veto:', broadcastError);
      }
      
      return NextResponse.json({
        success: true,
        message: result.message,
      });
    }
    
    return NextResponse.json(
      { error: 'Invalid action. Use "create", "cast", or "veto"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in voting POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
