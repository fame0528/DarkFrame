/**
 * @file app/api/wmd/research/route.ts
 * @created 2025-10-22
 * @overview WMD Research API Endpoints
 * 
 * OVERVIEW:
 * Handles WMD research tech tree operations including fetching research state,
 * starting new research, and spending research points (RP).
 * 
 * Features:
 * - GET: Fetch player's research state
 * - POST: Start research or spend RP on tech
 * 
 * Authentication: JWT tokens via HttpOnly cookies
 * Dependencies: researchService.ts, apiHelpers.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, getAuthenticatedPlayer } from '@/lib/wmd/apiHelpers';
import {
  getPlayerResearch,
  canStartResearch,
  startResearch,
  spendRPOnResearch,
} from '@/lib/wmd/researchService';

/**
 * GET /api/wmd/research
 * Fetch player's research state
 */
export async function GET(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const auth = await getAuthenticatedPlayer(req, db);
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const research = await getPlayerResearch(db, auth.playerId);
    
    return NextResponse.json({
      success: true,
      research,
    });
  } catch (error) {
    console.error('Error fetching research:', error);
    return NextResponse.json(
      { error: 'Failed to fetch research data' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/wmd/research
 * Start new research or spend RP
 * 
 * Body:
 * - action: 'start' | 'spendRP'
 * - techId: string (for both actions)
 */
export async function POST(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const auth = await getAuthenticatedPlayer(req, db);
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json();
    const { action, techId } = body;
    
    if (!action || !techId) {
      return NextResponse.json(
        { error: 'Missing required fields: action, techId' },
        { status: 400 }
      );
    }
    
    // Start research
    if (action === 'start') {
      const canStart = await canStartResearch(db, auth.playerId, techId);
      
      if (!canStart.canStart) {
        return NextResponse.json(
          { error: canStart.reason || 'Cannot start research' },
          { status: 400 }
        );
      }
      
      const result = await startResearch(db, auth.playerId, techId);
      
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
    
    // Spend RP on instant research
    if (action === 'spendRP') {
      const result = await spendRPOnResearch(db, auth.playerId, techId);
      
      if (!result.success) {
        return NextResponse.json(
          { error: result.message },
          { status: 400 }
        );
      }
      
      return NextResponse.json({
        success: true,
        message: result.message,
        completed: result.completed,
      });
    }
    
    return NextResponse.json(
      { error: 'Invalid action. Use "start" or "spendRP"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in research API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
