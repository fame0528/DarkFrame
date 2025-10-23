/**
 * @file app/api/flag/attack/route.ts
 * @created 2025-01-23
 * @overview Flag Bearer attack endpoint
 * 
 * OVERVIEW:
 * Dedicated endpoint for attacking the Flag Bearer.
 * Validates attack range, calculates damage, and updates bearer HP.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { ObjectId } from 'mongodb';
import { type FlagAttackRequest, type FlagAttackResponse, type FlagAPIResponse, FLAG_CONFIG } from '@/types/flag.types';
import { Player } from '@/types/game.types';

/**
 * Calculate distance between two points
 */
function calculateDistance(pos1: { x: number; y: number }, pos2: { x: number; y: number }): number {
  const dx = Math.abs(pos1.x - pos2.x);
  const dy = Math.abs(pos1.y - pos2.y);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * POST /api/flag/attack
 * 
 * Attack the current Flag Bearer
 */
export async function POST(request: NextRequest): Promise<NextResponse<FlagAPIResponse<FlagAttackResponse>>> {
  try {
    // Authentication
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized - please log in',
        timestamp: new Date()
      }, { status: 401 });
    }
    
    const body: FlagAttackRequest = await request.json();
    
    // Validate request
    if (!body.targetPlayerId || !body.attackerPosition) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: targetPlayerId and attackerPosition',
        timestamp: new Date()
      }, { status: 400 });
    }
    
    const db = await connectToDatabase();
    
    // Get flag document
    const flagDoc = await db.collection('flags').findOne({});
    
    if (!flagDoc || !flagDoc.currentHolder) {
      return NextResponse.json({
        success: true,
        data: {
          success: false,
          error: 'No one is holding the flag',
          damage: 0
        },
        timestamp: new Date()
      });
    }
    
    const holder = flagDoc.currentHolder;
    
    // Verify target is current bearer (handle bot attacks)
    const holderId = holder.playerId?.toString() || holder.botId?.toString() || '';
    const targetIdNormalized = body.targetPlayerId === 'BOT' || body.targetPlayerId === '' 
      ? holderId 
      : body.targetPlayerId;
      
    if (holderId !== targetIdNormalized && targetIdNormalized !== holderId) {
      return NextResponse.json({
        success: true,
        data: {
          success: false,
          error: 'Target is not the current Flag Bearer',
          damage: 0
        },
        timestamp: new Date()
      });
    }
    
    // Get attacker
    const attacker = await db.collection<Player>('players').findOne({ 
      username: user.username 
    });
    
    if (!attacker) {
      return NextResponse.json({
        success: false,
        error: 'Attacker not found',
        timestamp: new Date()
      }, { status: 404 });
    }
    
    // Validate attack range
    const distance = calculateDistance(body.attackerPosition, holder.position);
    
    if (distance > FLAG_CONFIG.ATTACK_RANGE) {
      return NextResponse.json({
        success: true,
        data: {
          success: false,
          error: `Out of range! You are ${Math.round(distance)} tiles away (max ${FLAG_CONFIG.ATTACK_RANGE})`,
          damage: 0,
          distance: Math.round(distance),
          maxRange: FLAG_CONFIG.ATTACK_RANGE
        },
        timestamp: new Date()
      });
    }
    
    // Get target (bearer)
    let target: any = null;
    if (holder.playerId) {
      target = await db.collection('players').findOne({ 
        _id: holder.playerId 
      });
    } else if (holder.botId) {
      target = await db.collection('players').findOne({ 
        _id: holder.botId 
      });
    }
    
    if (!target) {
      return NextResponse.json({
        success: false,
        error: 'Flag Bearer not found',
        timestamp: new Date()
      }, { status: 404 });
    }
    
    // Calculate damage based on attacker's army strength
    const attackerPower = attacker.totalStrength || 0;
    const baseDamage = FLAG_CONFIG.BASE_ATTACK_DAMAGE;
    const powerMultiplier = 1 + (attackerPower / 100000); // +1% per 1K power
    const damage = Math.round(baseDamage * powerMultiplier);
    
    // Get current bearer HP (from flag doc or default to 1000)
    const initialHP = 1000;
    let bearerHP = holder.hp || initialHP;
    
    // Apply damage
    bearerHP -= damage;
    
    // Check if bearer was defeated
    if (bearerHP <= 0) {
      // Flag dropped! Attacker claims it
      await db.collection('flags').updateOne(
        {},
        {
          $set: {
            currentHolder: {
              playerId: new ObjectId(attacker._id),
              username: attacker.username,
              level: attacker.level,
              position: attacker.currentPosition,
              claimedAt: new Date(),
              hp: initialHP
            },
            lastUpdate: new Date()
          },
          $push: {
            history: {
              event: 'CLAIMED',
              username: attacker.username,
              position: attacker.currentPosition,
              timestamp: new Date(),
              previousHolder: holder.username
            }
          } as any
        }
      );
      
      return NextResponse.json({
        success: true,
        data: {
          success: true,
          message: `🎉 Flag captured! You are now the Flag Bearer!`,
          damage,
          bearerDefeated: true,
          newBearer: attacker.username
        },
        timestamp: new Date()
      });
    }
    
    // Bearer survived - update HP
    await db.collection('flags').updateOne(
      {},
      {
        $set: {
          'currentHolder.hp': bearerHP,
          lastUpdate: new Date()
        }
      }
    );
    
    return NextResponse.json({
      success: true,
      data: {
        success: true,
        message: `⚔️ Hit for ${damage} damage! Bearer HP: ${bearerHP}/${initialHP}`,
        damage,
        bearerDefeated: false,
        remainingHP: bearerHP
      },
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('[Flag Attack] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to attack Flag Bearer',
      timestamp: new Date()
    }, { status: 500 });
  }
}
