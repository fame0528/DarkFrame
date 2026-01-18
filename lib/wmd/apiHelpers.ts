/**
 * @file lib/wmd/apiHelpers.ts
 * @created 2025-10-22
 * @overview WMD API Helper Functions
 * 
 * OVERVIEW:
 * Shared helper functions for WMD API routes including authentication,
 * database connection, and error handling.
 * 
 * Features:
 * - JWT authentication verification
 * - MongoDB connection management
 * - Standardized error responses
 */

import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { Db } from 'mongodb';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-key'
);

/**
 * Extract and verify JWT from cookies
 * Returns username if valid, null if invalid
 */
export async function verifyAuth(request: NextRequest): Promise<string | null> {
  try {
    const token = request.cookies.get('auth-token')?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.username as string;
  } catch {
    return null;
  }
}

/**
 * Get authenticated player from database
 * Returns player document or null if not found/unauthorized
 */
export async function getAuthenticatedPlayer(
  request: NextRequest,
  db: Db
): Promise<{ username: string; playerId: string; player: any } | null> {
  const username = await verifyAuth(request);
  if (!username) return null;

  const player = await db.collection('players').findOne({ username });
  if (!player) return null;

  return {
    username,
    playerId: player._id.toString(),
    player,
  };
}
