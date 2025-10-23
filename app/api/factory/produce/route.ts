/**
 * @file app/api/factory/produce/route.ts
 * @created 2025-01-17
 * @overview API endpoint for producing units at player-owned factories
 */

import { NextRequest, NextResponse } from 'next/server';
import { produceUnit } from '@/lib/factoryService';

/**
 * POST /api/factory/produce
 * Produces a unit at a player-owned factory
 * 
 * @body {string} username - Player producing the unit
 * @body {number} x - Factory X coordinate
 * @body {number} y - Factory Y coordinate
 * @returns {Object} success: boolean, message: string, unit?: Unit
 */
export async function POST(request: NextRequest) {
  try {
    const { username, x, y } = await request.json();

    // Validate required fields
    if (!username || x === undefined || y === undefined) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: username, x, y' },
        { status: 400 }
      );
    }

    console.log(`🏭 ${username} producing unit at factory (${x}, ${y})`);

    // Produce unit
    const result = await produceUnit(username, x, y);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Error producing unit:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================
// END OF FILE
// Implementation Notes:
// - Validates ownership through produceUnit service
// - Checks resource availability (100 Metal + 50 Energy)
// - Verifies factory has available slots
// - Creates SOLDIER unit with 50 power
// - Increments usedSlots counter
// ============================================================
