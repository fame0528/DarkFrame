/**
 * @file components/WMDMiniStatus.tsx
 * @created 2025-10-22
 * @overview WMD Compact Status Widget
 * 
 * OVERVIEW:
 * Minimal status widget for displaying key WMD metrics in the main game UI.
 * Designed for sidebar or header placement. Click to open full WMD Hub.
 * 
 * Features:
 * - RP balance display
 * - Missiles ready count
 * - Active batteries count
 * - Available spies count
 * - Pending votes count
 * - Alert indicators for critical events
 * - Click-to-open WMD Hub
 * 
 * Dependencies: /api/wmd/status endpoint
 */

'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/Badge';
import Link from 'next/link';

interface WMDStatus {
  rp: number;
  missilesReady: number;
  batteriesActive: number;
  spiesAvailable: number;
  pendingVotes: number;
  hasAlerts: boolean;
}

export default function WMDMiniStatus() {
  const [status, setStatus] = useState<WMDStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // 30s polling
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/wmd/status');
      const data = await res.json();
      if (data.success) {
        setStatus(data.status);
      }
    } catch (error) {
      console.error('Failed to fetch WMD status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !status) {
    return (
      <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
        <p className="text-xs text-gray-400">Loading WMD...</p>
      </div>
    );
  }

  return (
    <Link href="/wmd">
      <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:bg-gray-750 transition-colors cursor-pointer">
        {/* Header */}
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-1">
            ⚔️ WMD
            {status.hasAlerts && (
              <Badge className="bg-red-600 animate-pulse">!</Badge>
            )}
          </h3>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-900 rounded p-1.5">
            <p className="text-gray-400">RP</p>
            <p className="text-blue-400 font-bold">{status.rp}</p>
          </div>
          <div className="bg-gray-900 rounded p-1.5">
            <p className="text-gray-400">Missiles</p>
            <p className="text-green-400 font-bold">{status.missilesReady}</p>
          </div>
          <div className="bg-gray-900 rounded p-1.5">
            <p className="text-gray-400">Batteries</p>
            <p className="text-yellow-400 font-bold">{status.batteriesActive}</p>
          </div>
          <div className="bg-gray-900 rounded p-1.5">
            <p className="text-gray-400">Spies</p>
            <p className="text-purple-400 font-bold">{status.spiesAvailable}</p>
          </div>
        </div>

        {/* Pending Votes */}
        {status.pendingVotes > 0 && (
          <div className="mt-2 bg-blue-900 rounded p-1.5 text-xs">
            <p className="text-blue-300">
              🗳️ {status.pendingVotes} pending vote{status.pendingVotes > 1 ? 's' : ''}
            </p>
          </div>
        )}

        {/* Click Hint */}
        <p className="text-xs text-gray-500 mt-2 text-center">Click to open</p>
      </div>
    </Link>
  );
}
