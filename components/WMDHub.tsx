/**
 * @file components/WMDHub.tsx
 * @created 2025-10-22
 * @overview WMD System Hub Container
 * 
 * OVERVIEW:
 * Main wrapper component for the WMD system. Provides tab navigation between
 * all WMD panels and displays system-wide status indicators.
 * 
 * Features:
 * - Tab navigation (Research, Missiles, Defense, Intelligence, Voting, Notifications)
 * - Active tab state management
 * - WMD status header with quick stats
 * - Responsive layout
 * - Real-time WebSocket notifications
 * 
 * Dependencies: All WMD panel components, useWMDNotifications hook
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useWMDNotifications } from '@/hooks';
import BackButton from '@/components/BackButton';
import WMDResearchPanel from './WMDResearchPanel';
import WMDMissilePanel from './WMDMissilePanel';
import WMDDefensePanel from './WMDDefensePanel';
import WMDIntelligencePanel from './WMDIntelligencePanel';
import WMDVotingPanel from './WMDVotingPanel';
import WMDNotificationsPanel from './WMDNotificationsPanel';

type TabType = 'research' | 'missiles' | 'defense' | 'intelligence' | 'voting' | 'notifications';

export default function WMDHub() {
  const [activeTab, setActiveTab] = useState<TabType>('research');

  // Subscribe to real-time WMD WebSocket events
  useWMDNotifications({
    showToasts: true,
    onIncomingMissile: (data) => {
      // Auto-switch to missiles tab on incoming missile alert
      setActiveTab('missiles');
    },
    onVoteUpdate: (data) => {
      // Could show a badge or notification on voting tab
      console.log('[WMD] Vote update:', data);
    },
  });

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'research', label: 'Research', icon: '🔬' },
    { id: 'missiles', label: 'Missiles', icon: '🚀' },
    { id: 'defense', label: 'Defense', icon: '🛡️' },
    { id: 'intelligence', label: 'Intelligence', icon: '🕵️' },
    { id: 'voting', label: 'Voting', icon: '🗳️' },
    { id: 'notifications', label: 'Notifications', icon: '📢' },
  ];

  return (
    <div className="h-full w-full overflow-auto bg-gradient-to-b from-gray-900 to-black p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-2">
          <BackButton />
          <h1 className="text-3xl md:text-4xl font-bold text-white">
            ⚔️ Weapons of Mass Destruction
          </h1>
        </div>
        <p className="text-gray-400">
          Research, build, and deploy advanced warfare systems
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 mb-6 bg-gray-800 p-3 rounded-lg">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'primary' : 'secondary'}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-2"
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </Button>
        ))}
      </div>

      {/* Active Panel */}
      <div className="max-w-7xl mx-auto">
        {activeTab === 'research' && <WMDResearchPanel />}
        {activeTab === 'missiles' && <WMDMissilePanel />}
        {activeTab === 'defense' && <WMDDefensePanel />}
        {activeTab === 'intelligence' && <WMDIntelligencePanel />}
        {activeTab === 'voting' && <WMDVotingPanel />}
        {activeTab === 'notifications' && <WMDNotificationsPanel />}
      </div>
    </div>
  );
}
