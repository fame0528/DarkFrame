/**
 * @file app/api/specialization/choose/route.ts
 * @created 2025-01-17
 * @overview API endpoint for choosing initial player specialization
 * 
 * OVERVIEW:
 * Allows Level 15+ players to choose their specialization doctrine (Offensive, Defensive, or Tactical).
 * Requires 25 Research Points as a one-time unlock cost. Player can later respec using the /switch endpoint.
 * 
 * REQUIREMENTS:
 * - Player Level 15+
 * - 25 Research Points available
 * - No existing specialization (cannot choose twice)
 * 
 * DOCTRINES:
 * - Offensive: +15% STR, -10% metal cost, 5 offensive specialized units
 * - Defensive: +15% DEF, -10% energy cost, 5 defensive specialized units
 * - Tactical: +10% STR/DEF balanced, -5% all costs, 5 hybrid units
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/authMiddleware';
import { chooseSpecialization, SpecializationDoctrine, SPECIALIZATION_CONFIG } from '@/lib/specializationService';
import { logger } from '@/lib/logger';

/**
 * POST /api/specialization/choose
 * 
 * Choose initial specialization for authenticated player
 * 
 * @body doctrine - Chosen specialization doctrine ('offensive', 'defensive', or 'tactical')
 * @returns Specialization status and confirmation
 */
export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const user = await verifyAuth();
    if (!user || !user.username) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    const username = user.username;

    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { doctrine } = body;

    // Validate doctrine parameter
    if (!doctrine || typeof doctrine !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Doctrine is required' },
        { status: 400 }
      );
    }

    // Normalize doctrine to enum value
    const normalizedDoctrine = doctrine.toLowerCase() as SpecializationDoctrine;

    // Validate doctrine is a valid choice
    const validDoctrines = [
      SpecializationDoctrine.Offensive,
      SpecializationDoctrine.Defensive,
      SpecializationDoctrine.Tactical
    ];

    if (!validDoctrines.includes(normalizedDoctrine)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid doctrine. Must be one of: ${validDoctrines.join(', ')}`
        },
        { status: 400 }
      );
    }

    // Attempt to choose specialization
    const result = await chooseSpecialization(username, normalizedDoctrine);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 400 }
      );
    }

    const config = SPECIALIZATION_CONFIG[normalizedDoctrine as keyof typeof SPECIALIZATION_CONFIG];

    logger.success('Specialization chosen successfully', {
      username,
      doctrine: normalizedDoctrine,
      rpSpent: config.unlockCost,
      rpRemaining: result.rpRemaining
    });

    return NextResponse.json({
      success: true,
      message: result.message,
      specialization: {
        doctrine: normalizedDoctrine,
        name: config.name,
        icon: config.icon,
        description: config.description,
        bonuses: config.bonuses,
        masteryLevel: result.specialization?.masteryLevel || 0,
        masteryXP: result.specialization?.masteryXP || 0
      },
      rpRemaining: result.rpRemaining,
      rpSpent: config.unlockCost
    });

  } catch (error) {
    logger.error('Error in specialization choose endpoint:', { error });
    return NextResponse.json(
      {
        success: false,
        error: 'An error occurred while choosing specialization'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/specialization/choose
 * 
 * Get eligibility status for choosing specialization
 * 
 * @returns Eligibility info with requirements
 */
export async function GET(req: NextRequest) {
  try {
    // Verify authentication
    const user = await verifyAuth();
    if (!user || !user.username) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    const username = user.username;

    // Import needed for eligibility check
    const { canChooseSpecialization, getSpecializationStatus } = await import('@/lib/specializationService');
    
    // Get full status
    const status = await getSpecializationStatus(username);
    
    if (!status) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    // Check eligibility
    const eligibility = await canChooseSpecialization(username);

    return NextResponse.json({
      success: true,
      canChoose: eligibility.canChoose,
      reason: eligibility.reason,
      requirements: {
        currentLevel: eligibility.currentLevel,
        requiredLevel: eligibility.requiredLevel || 15,
        currentRP: eligibility.currentRP,
        requiredRP: eligibility.requiredRP || 25
      },
      doctrines: {
        offensive: SPECIALIZATION_CONFIG[SpecializationDoctrine.Offensive],
        defensive: SPECIALIZATION_CONFIG[SpecializationDoctrine.Defensive],
        tactical: SPECIALIZATION_CONFIG[SpecializationDoctrine.Tactical]
      },
      hasSpecialization: status.specialization.doctrine !== SpecializationDoctrine.None
    });

  } catch (error) {
    logger.error('Error in specialization eligibility check:', { error });
    return NextResponse.json(
      {
        success: false,
        error: 'An error occurred while checking eligibility'
      },
      { status: 500 }
    );
  }
}
