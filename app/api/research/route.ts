// ============================================================
// FILE: app/api/research/route.ts
// CREATED: 2025-01-18
// LAST MODIFIED: 2025-10-18
// ============================================================
// OVERVIEW:
// API endpoint for researching technologies. Handles starting research,
// checking prerequisites, deducting costs, and updating player's
// unlocked technologies.
// Protected by middleware - authentication is handled at the middleware level.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

// ============================================================
// TECHNOLOGY DEFINITIONS
// ============================================================

interface Technology {
  id: string;
  name: string;
  cost: number;
  prerequisites: string[];
}

const TECHNOLOGIES: Record<string, Technology> = {
  'troop-transport': {
    id: 'troop-transport',
    name: 'Troop Transport',
    cost: 10000,
    prerequisites: [],
  },
  'advanced-mining': {
    id: 'advanced-mining',
    name: 'Advanced Mining',
    cost: 5000,
    prerequisites: [],
  },
  'fortification': {
    id: 'fortification',
    name: 'Fortification',
    cost: 8000,
    prerequisites: [],
  },
  'tactical-warfare': {
    id: 'tactical-warfare',
    name: 'Tactical Warfare',
    cost: 12000,
    prerequisites: ['fortification'],
  },
  'factory-automation': {
    id: 'factory-automation',
    name: 'Factory Automation',
    cost: 15000,
    prerequisites: ['advanced-mining'],
  },
  'reconnaissance': {
    id: 'reconnaissance',
    name: 'Reconnaissance',
    cost: 6000,
    prerequisites: [],
  },
};

// ============================================================
// POST HANDLER
// ============================================================

/**
 * POST /api/research
 * 
 * Start researching a technology
 * 
 * Request Body:
 * - technologyId: string - ID of technology to research
 * 
 * Response:
 * - success: boolean
 * - message: string
 * - player: updated player object (if successful)
 * 
 * Note: Authentication handled by Next.js middleware
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication is handled by middleware - no need to check here

    // Parse request body
    const body = await request.json();
    const { technologyId, username } = body;

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      );
    }

    // Validate technology
    const technology = TECHNOLOGIES[technologyId];
    if (!technology) {
      return NextResponse.json(
        { success: false, error: 'Invalid technology ID' },
        { status: 400 }
      );
    }

    // Connect to database
    const client = await clientPromise;
    const db = client.db('darkframe');
    const playersCollection = db.collection('players');

    // Fetch player by username
    const player = await playersCollection.findOne({
      username: username,
    });

    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    // Initialize technologies array if it doesn't exist
    const unlockedTechnologies = player.unlockedTechnologies || [];

    // Check if already unlocked
    if (unlockedTechnologies.includes(technologyId)) {
      return NextResponse.json(
        { success: false, error: 'Technology already unlocked' },
        { status: 400 }
      );
    }

    // Check prerequisites
    for (const prereqId of technology.prerequisites) {
      if (!unlockedTechnologies.includes(prereqId)) {
        const prereq = TECHNOLOGIES[prereqId];
        return NextResponse.json(
          {
            success: false,
            error: `Prerequisite not met: ${prereq?.name || prereqId}`,
          },
          { status: 400 }
        );
      }
    }

    // Check if player has enough gold
    if (player.gold < technology.cost) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient gold. Required: ${technology.cost}, Available: ${player.gold}`,
        },
        { status: 400 }
      );
    }

    // Deduct gold and unlock technology
    const updateResult = await playersCollection.updateOne(
      { username: username },
      {
        $inc: { gold: -technology.cost },
        $push: { unlockedTechnologies: technologyId },
        $set: { lastUpdated: new Date() },
      }
    );

    if (updateResult.modifiedCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Failed to update player' },
        { status: 500 }
      );
    }

    // Fetch updated player
    const updatedPlayer = await playersCollection.findOne({
      username: username,
    });

    console.log(`✅ ${player.username} researched ${technology.name}`);

    return NextResponse.json({
      success: true,
      message: `Successfully researched ${technology.name}`,
      player: updatedPlayer,
      technology: {
        id: technology.id,
        name: technology.name,
      },
    });
  } catch (error) {
    console.error('❌ Research API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to research technology' },
      { status: 500 }
    );
  }
}

// ============================================================
// GET HANDLER
// ============================================================

/**
 * GET /api/research
 * 
 * Get player's unlocked technologies
 * 
 * Query Parameters:
 * - username: string - Player username
 * 
 * Response:
 * - success: boolean
 * - unlockedTechnologies: string[] - Array of unlocked technology IDs
 * 
 * Note: Authentication handled by Next.js middleware
 */
export async function GET(request: NextRequest) {
  try {
    // Authentication is handled by middleware - no need to check here

    // Get username from query parameters
    const searchParams = request.nextUrl.searchParams;
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      );
    }

    // Connect to database
    const client = await clientPromise;
    const db = client.db('darkframe');
    const playersCollection = db.collection('players');

    // Fetch player by username
    const player = await playersCollection.findOne(
      { username: username },
      { projection: { unlockedTechnologies: 1 } }
    );

    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      unlockedTechnologies: player.unlockedTechnologies || [],
    });
  } catch (error) {
    console.error('❌ Research GET API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch technologies' },
      { status: 500 }
    );
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - POST: Research a technology (deduct gold, check prerequisites, unlock)
// - GET: Retrieve player's unlocked technologies
// - Validates prerequisites before allowing research
// - Deducts gold cost from player balance
// - Adds technology to unlockedTechnologies array
// - Technologies stored as array of IDs in player document
// - Troop Transport enables fast travel (5 spaces movement)
// - Future: Add research time/queue system
// ============================================================
// END OF FILE
// ============================================================
