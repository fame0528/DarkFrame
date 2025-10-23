/**
 * Bot Scanner API - Scan for Bots Within Radius
 * Created: 2024-10-18
 * 
 * GET /api/bot-scanner?username=player
 * - Scans for bots within radius
 * - Returns bot list, nest locations, scanner status
 * - Applies cooldown after scan
 * 
 * GET /api/bot-scanner/status?username=player
 * - Returns scanner unlock status and cooldown info
 * - No cooldown applied (just checking status)
 */

import { NextResponse } from 'next/server';
import { scanForBots, getScannerStatus } from '@/lib/botScannerService';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    const action = searchParams.get('action');
    
    if (!username) {
      return NextResponse.json(
        { success: false, message: 'Username required' },
        { status: 400 }
      );
    }
    
    // Status check (no cooldown applied)
    if (action === 'status') {
      const status = await getScannerStatus(username);
      return NextResponse.json({ success: true, status });
    }
    
    // Execute scan (applies cooldown)
    const result = await scanForBots(username);
    
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('[API Bot Scanner] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Scanner error occurred' },
      { status: 500 }
    );
  }
}
