// API Route: /api/battle/attack
// Records a battle and returns the result
// Modified: 2025-10-24 - Phase 3.1: Added Zod validation and structured error handling
import { NextRequest, NextResponse } from 'next/server';
import { recordBattle, resolveBattle, connectToDatabase } from '@/lib';
import { BattleType } from '@/types';
import { 
  withRequestLogging, 
  createRouteLogger,
  BattleAttackSchema,
  createErrorResponse,
  createErrorFromException,
  ErrorCode,
  createRateLimiter,
  ENDPOINT_RATE_LIMITS
} from '@/lib';
import { recordDefeatEvent } from '@/lib/beerBaseAnalytics';

// Apply both rate limiting and request logging
const rateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.battle);

const handler = rateLimiter(async (req: NextRequest) => {
  const log = createRouteLogger('BattleAttackAPI');
  const endTimer = log.time('battleResolution');
  
  try {
    // Parse and validate request body with Zod
    const body = await req.json();
    const validated = BattleAttackSchema.parse(body);
    
    log.debug('Battle attack initiated', { 
      target: validated.targetUsername,
      unitCount: Object.keys(validated.units).length 
    });
    
    // TODO: Add authentication check here
    // const auth = await requireAuth(req);
    // if (auth instanceof NextResponse) return auth;
    
    // TODO: Resolve battle with validated data
    // For now, keeping existing structure until we refactor battle system
    const { attacker, defender, factoryLocation, attackerUnits, defenderUnits } = body;
    
    if (!attacker || !defender || !factoryLocation || !attackerUnits || !defenderUnits) {
      log.warn('Battle attack missing required fields', { attacker, defender, hasLocation: !!factoryLocation });
      return createErrorResponse(ErrorCode.VALIDATION_MISSING_FIELD, {
        fields: ['attacker', 'defender', 'factoryLocation', 'attackerUnits', 'defenderUnits']
      });
    }
    
    log.debug('Resolving battle', { attacker, defender, location: factoryLocation });
    
    // Resolve combat
    const battleLog = await resolveBattle(
      attackerUnits,
      defenderUnits,
      attacker,
      defender,
      BattleType.Factory,
      factoryLocation
    );
    
    // Record battle in tracking system
    await recordBattle({
      attacker: battleLog.attacker.username,
      defender: battleLog.defender.username,
      winner: battleLog.outcome === 'ATTACKER_WIN' ? battleLog.attacker.username : (battleLog.outcome === 'DEFENDER_WIN' ? battleLog.defender.username : ''),
      factoryLocation: battleLog.location ?? factoryLocation,
      attackerPower: battleLog.attacker.totalSTR,
      defenderPower: battleLog.defender.totalDEF,
      factoryCaptured: battleLog.outcome === 'ATTACKER_WIN',
      timestamp: battleLog.timestamp,
      details: battleLog,
    });
    
    // Record Beer Base defeat for analytics if applicable
    if (defender.startsWith('🍺BeerBase-') && battleLog.outcome === 'ATTACKER_WIN') {
      try {
        const db = await connectToDatabase();
        const defenderDoc = await db.collection('players').findOne({ username: defender });
        
        if (defenderDoc && defenderDoc.isSpecialBase) {
          // Extract tier from username (format: 🍺BeerBase-{TIER}-{timestamp}-{suffix})
          const tierMatch = defender.match(/🍺BeerBase-(\w+)-/);
          const tierName = tierMatch ? tierMatch[1] : 'WEAK';
          
          // Map tier name to number
          const tierMap: Record<string, number> = {
            'WEAK': 0, 'MID': 1, 'STRONG': 2, 'ELITE': 3, 'ULTRA': 4, 'LEGENDARY': 5
          };
          const tierNumber = tierMap[tierName] || 0;
          
          // Calculate time alive (spawn time to defeat time)
          const spawnTime = defenderDoc.createdAt || defenderDoc._id.getTimestamp();
          const defeatTime = battleLog.timestamp;
          const timeAliveSeconds = Math.floor((defeatTime.getTime() - spawnTime.getTime()) / 1000);
          
          // Record defeat event
          await recordDefeatEvent(
            tierNumber,
            attacker,
            {
              metal: defenderDoc.resources?.metal || 0,
              energy: defenderDoc.resources?.energy || 0
            },
            timeAliveSeconds
          );
          
          log.debug('Beer Base defeat recorded for analytics', {
            tier: tierName,
            defeatedBy: attacker,
            timeAliveHours: (timeAliveSeconds / 3600).toFixed(2)
          });
        }
      } catch (analyticsError) {
        // Don't fail the battle if analytics fails
        log.warn('Failed to record Beer Base defeat analytics', analyticsError);
      }
    }
    
    log.info('Battle resolved successfully', { 
      attacker, 
      defender, 
      outcome: battleLog.outcome,
      captured: battleLog.outcome === 'ATTACKER_WIN'
    });
    
    return NextResponse.json({ success: true, battle: battleLog });
    
  } catch (error) {
    log.error('Battle attack failed', error as Error);
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
});

export const POST = withRequestLogging(handler);
