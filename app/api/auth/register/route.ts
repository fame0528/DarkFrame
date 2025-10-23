/**
 * @file app/api/auth/register/route.ts
 * @created 2025-10-16
 * @overview Registration endpoint with email/password authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPlayerWithAuth } from '@/lib/playerService';
import { getTileAt } from '@/lib/movementService';
import {
  hashPassword,
  generateToken,
  isValidEmail,
  isValidPassword,
  isValidUsername
} from '@/lib/authService';

export async function POST(request: NextRequest) {
  try {
    const { username, email, password } = await request.json();
    
    // Validate inputs
    if (!username || !email || !password) {
      return NextResponse.json(
        { success: false, error: 'Username, email, and password are required' },
        { status: 400 }
      );
    }
    
    // Validate username
    const usernameValidation = isValidUsername(username);
    if (!usernameValidation.valid) {
      return NextResponse.json(
        { success: false, error: usernameValidation.message },
        { status: 400 }
      );
    }
    
    // Validate email
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }
    
    // Validate password
    const passwordValidation = isValidPassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { success: false, error: passwordValidation.message },
        { status: 400 }
      );
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Create player
    const player = await createPlayerWithAuth(username, email, hashedPassword);
    
    // Generate JWT token (new players are not admins by default)
    const token = generateToken(player.username, player.email, false, false);
    
    // Get current tile
    const currentTile = await getTileAt(
      player.currentPosition.x,
      player.currentPosition.y
    );
    
    // Remove password from response
    const { password: _, ...playerWithoutPassword } = player;
    
    // Set httpOnly cookie
    const response = NextResponse.json({
      success: true,
      data: {
        player: playerWithoutPassword,
        currentTile,
        token
      }
    }, { status: 201 });
    
    // Set secure cookie
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });
    
    // Set playerId cookie for inventory and other endpoints
    response.cookies.set('playerId', player.username, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });
    
    console.log(`✅ Registration successful: ${player.username}`);
    
    return response;
    
  } catch (error) {
    console.error('❌ Registration error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Registration failed';
    
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 400 }
    );
  }
}

// ============================================================
// END OF FILE
// ============================================================
