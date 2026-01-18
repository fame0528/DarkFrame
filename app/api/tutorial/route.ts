/**
 * Tutorial API Route
 * Created: 2025-10-25
 * Feature: FID-20251025-101 - Interactive Tutorial Quest System
 * 
 * OVERVIEW:
 * RESTful API endpoints for tutorial system operations including:
 * - GET: Fetch current tutorial state
 * - POST: Complete steps, skip quests, claim rewards
 * 
 * ENDPOINTS:
 * GET  /api/tutorial?playerId={id}  - Get current tutorial state
 * POST /api/tutorial                 - Perform tutorial actions
 * 
 * ACTIONS:
 * - complete_step: Mark step as complete and advance
 * - skip: Skip quest or entire tutorial
 * - restart: Reset tutorial progress
 */

import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import {
  initializeTutorialService,
  getTutorialProgress,
  getCurrentQuestAndStep,
  completeStep,
  skipTutorial,
  shouldShowTutorial,
} from '@/lib/tutorialService';
import type { TutorialValidationRequest } from '@/types/tutorial.types';

/**
 * GET /api/tutorial
 * Fetch current tutorial state for player
 * 
 * Query Params:
 * - playerId: Player ID
 * - checkEligibility: Optional boolean to check if player should see tutorial
 * 
 * Response:
 * {
 *   quest: TutorialQuest | null,
 *   step: TutorialStep | null,
 *   progress: TutorialProgress,
 *   shouldShow?: boolean
 * }
 * 
 * Note: Logging suppressed for this endpoint to prevent terminal spam from 1-second polling
 */
export const dynamic = 'force-dynamic'; // Prevent caching, ensure fresh data

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const playerId = searchParams.get('playerId');
    const checkEligibility = searchParams.get('checkEligibility') === 'true';

    if (!playerId) {
      return NextResponse.json(
        { error: 'Player ID is required' },
        { status: 400 }
      );
    }

    // Initialize MongoDB connection
    const mongoClient = await clientPromise;
    const db = mongoClient.db('darkframe');
    initializeTutorialService(mongoClient, db);

    // Check eligibility if requested
    if (checkEligibility) {
      // Get player's actual level from database
      const playersCollection = db.collection('players');
      const player = await playersCollection.findOne({ _id: playerId as any });
      
      if (!player) {
        return NextResponse.json(
          { error: 'Player not found' },
          { status: 404 }
        );
      }
      
      const playerLevel = player.level || 1;
      const shouldShow = await shouldShowTutorial(playerId, playerLevel);
      
      if (!shouldShow) {
        return NextResponse.json({
          shouldShow: false,
          quest: null,
          step: null,
          progress: null,
        });
      }
    }

    // Get current quest and step
    const { quest, step, progress } = await getCurrentQuestAndStep(playerId);

    // SERVER-SIDE AUTO-COMPLETE: Auto-complete READ_INFO steps after delay
    if (quest && step && step.action === 'READ_INFO' && step.autoComplete && progress) {
      const stepStartTime = progress.currentStepStartedAt || progress.startedAt; // Fallback to startedAt for migration
      const autoCompleteDelay = step.autoCompleteDelay || 5000; // Default 5 seconds
      
      if (stepStartTime) {
        const elapsedTime = Date.now() - new Date(stepStartTime).getTime();
        
        if (elapsedTime >= autoCompleteDelay) {
          // Auto-complete the step
          const completionResult = await completeStep({
            playerId,
            questId: quest._id!, // Non-null assertion safe here (quest exists from condition check)
            stepId: step.id,
            validationData: { autoCompleted: true }
          });
          
          if (completionResult.success) {
            // Return the NEXT step instead
            const updated = await getCurrentQuestAndStep(playerId);
            
            return NextResponse.json({
              quest: updated.quest,
              step: updated.step,
              progress: updated.progress,
              shouldShow: true,
              autoCompleted: true,
            });
          }
        }
      }
    }

    return NextResponse.json({
      quest,
      step,
      progress,
      shouldShow: true,
    });

  } catch (error) {
    console.error('Error in GET /api/tutorial:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tutorial
 * Perform tutorial actions
 * 
 * Body:
 * {
 *   action: 'complete_step' | 'skip' | 'restart',
 *   playerId: string,
 *   questId?: string,
 *   stepId?: string,
 *   validationData?: object,
 *   skipType?: 'ENTIRE_TUTORIAL' | 'QUEST'
 * }
 * 
 * Response varies by action
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, playerId } = body;

    if (!action || !playerId) {
      return NextResponse.json(
        { error: 'Action and playerId are required' },
        { status: 400 }
      );
    }

    // Initialize MongoDB connection
    const mongoClient = await clientPromise;
    const db = mongoClient.db('darkframe');
    initializeTutorialService(mongoClient, db);

    // Route to appropriate handler
    switch (action) {
      case 'complete_step':
        return await handleCompleteStep(body);

      case 'skip':
        return await handleSkip(body);

      case 'restart':
        return await handleRestart(body);

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Error in POST /api/tutorial:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Handle step completion action
 */
async function handleCompleteStep(body: any) {
  const { playerId, questId, stepId, validationData } = body;

  if (!questId || !stepId) {
    return NextResponse.json(
      { error: 'questId and stepId are required for complete_step action' },
      { status: 400 }
    );
  }

  const validationRequest: TutorialValidationRequest = {
    playerId,
    questId,
    stepId,
    validationData: validationData || {},
  };

  const result = await completeStep(validationRequest);

  return NextResponse.json(result);
}

/**
 * Handle skip action (quest or entire tutorial)
 */
async function handleSkip(body: any) {
  const { playerId, skipType, questId } = body;

  if (!skipType) {
    return NextResponse.json(
      { error: 'skipType is required for skip action' },
      { status: 400 }
    );
  }

  if (skipType === 'QUEST' && !questId) {
    return NextResponse.json(
      { error: 'questId is required for quest skip' },
      { status: 400 }
    );
  }

  const result = await skipTutorial(playerId, skipType, questId);

  return NextResponse.json(result);
}

/**
 * Handle tutorial restart
 */
async function handleRestart(body: any) {
  const { playerId } = body;

  try {
    const mongoClient = await clientPromise;
    const db = mongoClient.db('darkframe');
    const progressCollection = db.collection('tutorial_progress');

    // Delete existing progress
    await progressCollection.deleteOne({ playerId });

    return NextResponse.json({
      success: true,
      message: 'Tutorial progress reset successfully',
    });

  } catch (error) {
    console.error('Error restarting tutorial:', error);
    return NextResponse.json(
      { error: 'Failed to restart tutorial' },
      { status: 500 }
    );
  }
}
