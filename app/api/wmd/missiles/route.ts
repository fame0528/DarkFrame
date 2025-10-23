/**
 * @file app/api/wmd/missiles/route.ts
 * @created 2025-10-22
 * @overview WMD Missile API Endpoints
 * 
 * OVERVIEW:
 * Handles missile creation, assembly, launch, and management operations.
 * 
 * Features:
 * - GET: Fetch player's missiles
 * - POST: Create, assemble, or launch missiles
 * - DELETE: Dismantle missiles
 * 
 * Authentication: JWT tokens via HttpOnly cookies
 * Dependencies: missileService.ts, apiHelpers.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, getAuthenticatedPlayer } from '@/lib/wmd/apiHelpers';
import {
  createMissile,
  assembleComponent,
  launchMissile,
  getPlayerMissiles,
  dismantleMissile,
} from '@/lib/wmd/missileService';
import { getIO } from '@/lib/websocket/server';
import { wmdHandlers } from '@/lib/websocket/handlers';

/**
 * GET /api/wmd/missiles
 * Fetch player's missiles or specific missile details
 * 
 * Query params:
 * - missileId: string (optional) - Get specific missile details
 */
export async function GET(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const auth = await getAuthenticatedPlayer(req, db);
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(req.url);
    const missileId = searchParams.get('missileId');
    
    // Get specific missile details
    if (missileId) {
      const missile = await db.collection('wmd_missiles').findOne({ missileId });
      
      if (!missile) {
        return NextResponse.json(
          { error: 'Missile not found' },
          { status: 404 }
        );
      }
      
      // Verify ownership
      if (missile.ownerId !== auth.playerId) {
        return NextResponse.json(
          { error: 'Unauthorized - not your missile' },
          { status: 403 }
        );
      }
      
      return NextResponse.json({
        success: true,
        missile,
      });
    }
    
    // Get all player missiles
    const missiles = await getPlayerMissiles(db, auth.playerId);
    
    return NextResponse.json({
      success: true,
      missiles,
    });
  } catch (error) {
    console.error('Error fetching missiles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch missiles' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/wmd/missiles
 * Create, assemble, or launch missile
 * 
 * Body:
 * - action: 'create' | 'assemble' | 'launch'
 * - warheadType: string (for create)
 * - missileId: string (for assemble/launch)
 * - component: string (for assemble)
 * - targetId: string (for launch)
 */
export async function POST(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();
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
    
    // Create new missile
    if (action === 'create') {
      const { warheadType } = body;
      
      if (!warheadType) {
        return NextResponse.json(
          { error: 'Missing required field: warheadType' },
          { status: 400 }
        );
      }
      
      const result = await createMissile(
        db,
        auth.playerId,
        auth.username,
        auth.player.clanId || '',
        warheadType
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
        missileId: result.missileId,
      });
    }
    
    // Assemble component
    if (action === 'assemble') {
      const { missileId, component } = body;
      
      if (!missileId || !component) {
        return NextResponse.json(
          { error: 'Missing required fields: missileId, component' },
          { status: 400 }
        );
      }
      
      const result = await assembleComponent(db, missileId, component, auth.playerId, auth.player.username || auth.player.email || 'Unknown');
      
      if (!result.success) {
        return NextResponse.json(
          { error: result.message },
          { status: 400 }
        );
      }
      
      return NextResponse.json({
        success: true,
        message: result.message,
      });
    }
    
    // Launch missile
    if (action === 'launch') {
      const { missileId, targetId } = body;
      
      if (!missileId || !targetId) {
        return NextResponse.json(
          { error: 'Missing required fields: missileId, targetId' },
          { status: 400 }
        );
      }
      
      // Get target player name for broadcast
      const targetPlayer = await db.collection('players').findOne({ playerId: targetId });
      
      const result = await launchMissile(db, missileId, targetId, auth.username);
      
      if (!result.success) {
        return NextResponse.json(
          { error: result.message },
          { status: 400 }
        );
      }
      
      // Broadcast missile launch to launcher and target
      try {
        const missile = await db.collection('wmd_missiles').findOne({ missileId });
        const io = getIO();
        if (missile && io) {
          await wmdHandlers.broadcastMissileLaunch(io, {
            missileId,
            launcherId: auth.playerId,
            launcherName: auth.username,
            targetId,
            targetName: targetPlayer?.username || 'Unknown',
            warheadType: missile.warheadType,
            impactAt: missile.impactAt,
          });
        }
      } catch (broadcastError) {
        console.error('Failed to broadcast missile launch:', broadcastError);
        // Continue execution - broadcast failure shouldn't fail the API
      }
      
      return NextResponse.json({
        success: true,
        message: result.message,
      });
    }
    
    return NextResponse.json(
      { error: 'Invalid action. Use "create", "assemble", or "launch"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in missiles API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/wmd/missiles
 * Dismantle missile
 * 
 * Query:
 * - missileId: string
 */
export async function DELETE(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const auth = await getAuthenticatedPlayer(req, db);
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(req.url);
    const missileId = searchParams.get('missileId');
    
    if (!missileId) {
      return NextResponse.json(
        { error: 'Missing required query param: missileId' },
        { status: 400 }
      );
    }
    
    const result = await dismantleMissile(db, missileId);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('Error dismantling missile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
