// API Route: /api/battle/attack
// Records a battle and returns the result
import { NextRequest, NextResponse } from 'next/server';
import { recordBattle } from '../../../../lib/battleTrackingService';
import { resolveBattle } from '../../../../lib/battleService';
import { BattleType } from '@/types';

export async function POST(req: NextRequest) {
  const body = await req.json();
  // Validate required fields
  const { attacker, defender, factoryLocation, attackerUnits, defenderUnits } = body;
  if (!attacker || !defender || !factoryLocation || !attackerUnits || !defenderUnits) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  // Resolve combat
  // NOTE: resolveBattle expects (attackerUnits, defenderUnits, attackerName, defenderName, battleType, location)
  const battleLog = await resolveBattle(
    attackerUnits,
    defenderUnits,
    attacker,
    defender,
    BattleType.Factory,
    factoryLocation
  );
  // Record battle in tracking system (convert BattleLog to BattleRecord)
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
  return NextResponse.json(battleLog);

}
