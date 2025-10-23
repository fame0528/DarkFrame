/**
 * @file app/api/specialization/switch/route.ts
 * @created 2025-01-17
 * @overview API endpoint for respeccing player specialization
 * 
 * OVERVIEW:
 * Allows players to switch from one specialization doctrine to another.
 * Expensive cost (50 RP + 50k Metal + 50k Energy) with 48-hour cooldown.
 * Resets mastery to 0% but keeps specialized units from old doctrine.
 * 
 * REQUIREMENTS:
 * - Existing specialization (cannot respec without one)
 * - 50 Research Points
 * - 50,000 Metal
 * - 50,000 Energy
 * - 48 hours since last respec (cooldown)
 * 
 * EFFECTS:
 * - Switches doctrine
 * - Resets mastery to 0% for new doctrine
 * - Keeps old specialized units but they lose bonuses
 * - New bonuses apply to future units
 * - Records respec in history
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/authMiddleware';
import { respecSpecialization, canRespec, SpecializationDoctrine, SPECIALIZATION_CONFIG, RESPEC_CONFIG } from '@/lib/specializationService';
import { logger } from '@/lib/logger';

/**
 * POST /api/specialization/switch
 * 
 * Respec to a new specialization doctrine
 * 
 * @body newDoctrine - New specialization doctrine ('offensive', 'defensive', or 'tactical')
 * @returns Respec status and updated specialization
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

    const { newDoctrine } = body;

    // Validate doctrine parameter
    if (!newDoctrine || typeof newDoctrine !== 'string') {
      return NextResponse.json(
        { success: false, error: 'New doctrine is required' },
        { status: 400 }
      );
    }

    // Normalize doctrine to enum value
    const normalizedDoctrine = newDoctrine.toLowerCase() as SpecializationDoctrine;

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

    // Attempt to respec specialization
    const result = await respecSpecialization(username, normalizedDoctrine);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 400 }
      );
    }

    const config = SPECIALIZATION_CONFIG[normalizedDoctrine as keyof typeof SPECIALIZATION_CONFIG];

    logger.success('Specialization respec completed', {
      username,
      newDoctrine: normalizedDoctrine,
      rpSpent: RESPEC_CONFIG.rpCost,
      metalSpent: RESPEC_CONFIG.metalCost,
      energySpent: RESPEC_CONFIG.energyCost,
      rpRemaining: result.rpRemaining,
      metalRemaining: result.metalRemaining,
      energyRemaining: result.energyRemaining
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
      costs: {
        rpSpent: RESPEC_CONFIG.rpCost,
        metalSpent: RESPEC_CONFIG.metalCost,
        energySpent: RESPEC_CONFIG.energyCost
      },
      remaining: {
        rp: result.rpRemaining,
        metal: result.metalRemaining,
        energy: result.energyRemaining
      },
      cooldown: {
        active: true,
        durationHours: RESPEC_CONFIG.cooldownHours,
        expiresAt: new Date(Date.now() + RESPEC_CONFIG.cooldownHours * 60 * 60 * 1000).toISOString()
      }
    });

  } catch (error) {
    logger.error('Error in specialization switch endpoint:', { error });
    return NextResponse.json(
      {
        success: false,
        error: 'An error occurred while switching specialization'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/specialization/switch
 * 
 * Get eligibility status for respeccing specialization
 * 
 * @returns Eligibility info with costs and cooldown
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

    // Check eligibility
    const eligibility = await canRespec(username);

    return NextResponse.json({
      success: true,
      canRespec: eligibility.canRespec,
      reason: eligibility.reason,
      costs: {
        rp: RESPEC_CONFIG.rpCost,
        metal: RESPEC_CONFIG.metalCost,
        energy: RESPEC_CONFIG.energyCost,
        cooldownHours: RESPEC_CONFIG.cooldownHours
      },
      current: {
        rp: eligibility.currentRP,
        metal: eligibility.currentMetal,
        energy: eligibility.currentEnergy
      },
      cooldown: eligibility.cooldownRemaining 
        ? {
            active: true,
            remainingHours: eligibility.cooldownRemaining
          }
        : {
            active: false,
            remainingHours: 0
          },
      doctrines: {
        offensive: SPECIALIZATION_CONFIG[SpecializationDoctrine.Offensive],
        defensive: SPECIALIZATION_CONFIG[SpecializationDoctrine.Defensive],
        tactical: SPECIALIZATION_CONFIG[SpecializationDoctrine.Tactical]
      }
    });

  } catch (error) {
    logger.error('Error in specialization respec eligibility check:', { error });
    return NextResponse.json(
      {
        success: false,
        error: 'An error occurred while checking respec eligibility'
      },
      { status: 500 }
    );
  }
}
