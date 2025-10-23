/**
 * @file app/api/factory/attack/route.ts
 * @created 2025-10-17
 * @overview Factory attack endpoint - R key action
 */

import { NextRequest, NextResponse } from 'next/server';
import { attackFactory } from '@/lib/factoryService';

export async function POST(request: NextRequest) {
  try {
    const { username, x, y } = await request.json();
    
    // Validate inputs
    if (!username || x === undefined || y === undefined) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: username, x, y' },
        { status: 400 }
      );
    }
    
    console.log(`⚔️  ${username} attacking factory at (${x}, ${y})`);
    
    // Attempt attack
    const result = await attackFactory(username, x, y);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Factory attack error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error', error: String(error) },
      { status: 500 }
    );
  }
}

// ============================================================
// END OF FILE
// ============================================================
