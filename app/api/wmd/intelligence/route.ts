/**
 * @file app/api/wmd/intelligence/route.ts
 * @created 2025-10-22
 * @overview WMD Intelligence API Endpoints
 * 
 * OVERVIEW:
 * Handles spy network operations including recruitment, missions, sabotage,
 * and counter-intelligence activities.
 * 
 * Features:
 * - GET: Fetch player's spies and missions
 * - POST: Recruit spies, start missions, execute sabotage
 * - PATCH: Train spies, complete missions
 * 
 * Authentication: JWT tokens via HttpOnly cookies
 * Dependencies: spyService.ts, apiHelpers.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthenticatedPlayer } from '@/lib/wmd/apiHelpers';
import {
  recruitSpy,
  trainSpy,
  startMission,
  completeMission,
  executeSabotage,
  counterIntelligenceSweep,
  getPlayerSpies,
  getPlayerMissions,
} from '@/lib/wmd/spyService';
import { getIO } from '@/lib/websocket/server';
import { wmdHandlers } from '@/lib/websocket/handlers';
import {
  withRequestLogging,
  createRouteLogger,
  createRateLimiter,
  ENDPOINT_RATE_LIMITS,
  createErrorResponse,
  createErrorFromException,
  ErrorCode,
} from '@/lib';

const rateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.STANDARD);

/**
 * GET /api/wmd/intelligence
 * Fetch player's spies and missions
 * 
 * Query:
 * - type: 'spies' | 'missions'
 */
export const GET = withRequestLogging(rateLimiter(async (req: NextRequest) => {
  const log = createRouteLogger('wmd-intelligence-get');
  const endTimer = log.time('intelligence-get');
  
  try {
    const db = await connectToDatabase();
    const auth = await getAuthenticatedPlayer(req, db);
    
    if (!auth) {
      return createErrorResponse(ErrorCode.AUTH_UNAUTHORIZED, 'Authentication required');
    }
    
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'spies';
    
    if (type === 'spies') {
      const spies = await getPlayerSpies(db, auth.playerId);
      return NextResponse.json({ success: true, spies });
    }
    
    if (type === 'missions') {
      const missions = await getPlayerMissions(db, auth.playerId);
      return NextResponse.json({ success: true, missions });
    }
    
    return NextResponse.json(
      { error: 'Invalid type. Use "spies" or "missions"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error fetching intelligence data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch intelligence data' },
      { status: 500 }
    );
  } finally {
    endTimer();
  }
}));

/**
 * POST /api/wmd/intelligence
 * Recruit spy, start mission, execute sabotage, or counter-intel
 * 
 * Body:
 * - action: 'recruit' | 'mission' | 'sabotage' | 'counterIntel'
 * - specialization: string (for recruit)
 * - spyId: string (for mission/sabotage)
 * - missionType: string (for mission)
 * - targetId: string (for mission/sabotage)
 */
export async function POST(req: NextRequest) {
  try {
    const db = await connectToDatabase();
    const auth = await getAuthenticatedPlayer(req, db);
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json();
    const { action } = body;
    
    if (!action) {
      return NextResponse.json(
        { error: 'Missing required field: action' },
        { status: 400 }
      );
    }
    
    // Recruit spy
    if (action === 'recruit') {
      const { specialization } = body;
      
      if (!specialization) {
        return NextResponse.json(
          { error: 'Missing required field: specialization' },
          { status: 400 }
        );
      }
      
      const result = await recruitSpy(
        db,
        auth.playerId,
        auth.username,
        specialization,
        auth.player.clanId
      );
      
      if (!result.success) {
        return NextResponse.json(
          { error: result.message },
          { status: 400 }
        );
      }
      
      // Broadcast spy recruitment
      try {
        if (result.spyId) {
          const spy = await db.collection('wmd_spies').findOne({ spyId: result.spyId });
          const io = getIO();
          if (spy && io) {
            await wmdHandlers.broadcastSpyRecruited(io, {
              playerId: auth.playerId,
              spyId: result.spyId,
              spyName: spy.codename,
              specialization: spy.specialization,
            });
          }
        }
      } catch (broadcastError) {
        console.error('Failed to broadcast spy recruitment:', broadcastError);
      }
      
      return NextResponse.json({
        success: true,
        message: result.message,
        spyId: result.spyId,
      });
    }
    
    // Start mission
    if (action === 'mission') {
      const { spyId, missionType, targetId } = body;
      
      if (!spyId || !missionType || !targetId) {
        return NextResponse.json(
          { error: 'Missing required fields: spyId, missionType, targetId' },
          { status: 400 }
        );
      }
      
      const result = await startMission(
        db,
        spyId,
        missionType,
        targetId,
        auth.playerId
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
        missionId: result.missionId,
      });
    }
    
    // Execute sabotage
    if (action === 'sabotage') {
      const { spyId, targetId, targetType } = body;
      
      if (!spyId || !targetId || !targetType) {
        return NextResponse.json(
          { error: 'Missing required fields: spyId, targetId, targetType' },
          { status: 400 }
        );
      }
      
      const result = await executeSabotage(
        db,
        spyId,
        targetId,
        targetType,
        auth.playerId
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
        damage: result.damage,
      });
    }
    
    // Counter-intelligence
    if (action === 'counterIntel') {
      const result = await counterIntelligenceSweep(
        db,
        auth.playerId,
        auth.player.clanId
      );
      
      // Broadcast if spies detected
      if (result.success && result.spiesDetected && result.spiesDetected.length > 0) {
        try {
          const io = getIO();
          if (io) {
            await wmdHandlers.broadcastCounterIntelDetection(io, {
              playerId: auth.playerId,
              spiesDetected: result.spiesDetected,
            });
          }
        } catch (broadcastError) {
          console.error('Failed to broadcast counter-intel detection:', broadcastError);
        }
      }
      
      return NextResponse.json({
        success: result.success,
        message: result.message,
        threatsDetected: result.threatsDetected,
        spiesDetected: result.spiesDetected,
      });
    }
    
    return NextResponse.json(
      { error: 'Invalid action. Use "recruit", "mission", "sabotage", or "counterIntel"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in intelligence API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/wmd/intelligence
 * Train spy or complete mission
 * 
 * Body:
 * - action: 'train' | 'complete'
 * - spyId: string (for train)
 * - missionId: string (for complete)
 * - skillType: string (for train)
 */
export async function PATCH(req: NextRequest) {
  try {
    const db = await connectToDatabase();
    const auth = await getAuthenticatedPlayer(req, db);
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json();
    const { action } = body;
    
    if (!action) {
      return NextResponse.json(
        { error: 'Missing required field: action' },
        { status: 400 }
      );
    }
    
    // Train spy
    if (action === 'train') {
      const { spyId, skillType, trainingIntensity } = body;
      
      if (!spyId || !skillType) {
        return NextResponse.json(
          { error: 'Missing required fields: spyId, skillType' },
          { status: 400 }
        );
      }
      
      const result = await trainSpy(
        db,
        spyId,
        skillType,
        trainingIntensity || 'BASIC'
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
        newSkillLevel: result.newSkillLevel,
      });
    }
    
    // Complete mission
    if (action === 'complete') {
      const { missionId } = body;
      
      if (!missionId) {
        return NextResponse.json(
          { error: 'Missing required field: missionId' },
          { status: 400 }
        );
      }
      
      const result = await completeMission(db, missionId);
      
      if (!result.success) {
        return NextResponse.json(
          { error: result.message },
          { status: 400 }
        );
      }
      
      return NextResponse.json({
        success: true,
        message: result.message,
        intelligence: result.intelligence,
      });
    }
    
    return NextResponse.json(
      { error: 'Invalid action. Use "train" or "complete"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in intelligence PATCH:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

