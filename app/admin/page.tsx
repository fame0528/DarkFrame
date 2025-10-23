/**
 * @file app/admin/page.tsx
 * @created 2025-10-18
 * @overview Admin panel with database inspection and player management
 * 
 * OVERVIEW:
 * Admin-only page (level 3+ required) for viewing game statistics,
 * managing players, inspecting database, and troubleshooting issues.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameContext } from '@/context/GameContext';
import BackButton from '@/components/BackButton';
import ActivityTimeline from '@/components/admin/charts/ActivityTimeline';
import ResourceGains from '@/components/admin/charts/ResourceGains';
import SessionDistribution from '@/components/admin/charts/SessionDistribution';
import FlagBreakdown from '@/components/admin/charts/FlagBreakdown';
import BotPopulationTrends from '@/components/admin/charts/BotPopulationTrends';
import PlayerDetailModal from '@/components/admin/PlayerDetailModal';
import TileInspectorModal from '@/components/admin/TileInspectorModal';
import FactoryInspectorModal from '@/components/admin/FactoryInspectorModal';
import BattleLogsModal from '@/components/admin/BattleLogsModal';
import AchievementStatsModal from '@/components/admin/AchievementStatsModal';
import SystemResetModal from '@/components/admin/SystemResetModal';
import WebSocketConsoleModal from '@/components/admin/WebSocketConsoleModal';

interface AdminStats {
  totalPlayers: number;
  totalBases: number;
  totalFactories: number;
  activePlayers1h?: number;
  activePlayers24h: number;
  activePlayers7d?: number;
  mapStats: {
    wastelands: number;
    metal: number;
    energy: number;
    caves: number;
    forests: number;
    banks: number;
    shrines: number;
  };
}

interface PlayerListItem {
  username: string;
  level: number;
  rank: number;
  metal: number;
  energy: number;
  baseLocation: string;
  lastActive?: string;
}

interface AdminPageProps {
  embedded?: boolean; // When true, hides router-based navigation elements
}

export default function AdminPage({ embedded = false }: AdminPageProps = {}) {
  const router = useRouter();
  const { player } = useGameContext();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [showTileInspector, setShowTileInspector] = useState(false);
  const [showFactoryInspector, setShowFactoryInspector] = useState(false);
  const [showBattleLogs, setShowBattleLogs] = useState(false);
  const [showAchievementStats, setShowAchievementStats] = useState(false);
  const [showSystemReset, setShowSystemReset] = useState(false);
  const [showWebSocketConsole, setShowWebSocketConsole] = useState(false);
  
  // WMD system state
  const [wmdStatus, setWmdStatus] = useState<any>(null);
  const [wmdAnalytics, setWmdAnalytics] = useState<any>(null);
  const [wmdTimeRange, setWmdTimeRange] = useState<'7d' | '30d' | '90d'>('7d');
  
  // Bot control state
  const [botStats, setBotStats] = useState<any>(null);
  const [botConfig, setBotConfig] = useState({
    totalBotCap: 1000,
    dailySpawnCount: 75,
    beerBasePercent: 0.07,
    migrationPercent: 0.30,
    regenRates: {
      hoarder: 0.05,
      fortress: 0.10,
      raider: 0.15,
      ghost: 0.20,
      balanced: 0.10
    }
  });
  const [botActionLoading, setBotActionLoading] = useState(false);
  
  // Analytics state
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'24h' | '7d' | '30d'>('7d');
  const [activityData, setActivityData] = useState<any[]>([]);
  const [resourceData, setResourceData] = useState<any[]>([]);
  const [sessionData, setSessionData] = useState<any>(null);
  const [flagData, setFlagData] = useState<any[]>([]);
  
  // VIP Management state
  const [vipUsers, setVipUsers] = useState<any[]>([]);
  const [vipFilter, setVipFilter] = useState<'all' | 'vip' | 'basic'>('all');
  const [vipSearchTerm, setVipSearchTerm] = useState('');
  const [vipLoading, setVipLoading] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // RP Economy state
  const [rpEconomyExpanded, setRpEconomyExpanded] = useState(false);
  const [rpStats, setRpStats] = useState<any>(null);
  const [rpTransactions, setRpTransactions] = useState<any[]>([]);
  const [rpGenerationBySource, setRpGenerationBySource] = useState<any[]>([]);
  const [rpMilestoneStats, setRpMilestoneStats] = useState<any[]>([]);
  const [rpTopEarners, setRpTopEarners] = useState<any[]>([]);
  const [rpTopSpenders, setRpTopSpenders] = useState<any[]>([]);
  const [rpDateFilter, setRpDateFilter] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [rpSourceFilter, setRpSourceFilter] = useState<string>('all');
  const [rpUsernameFilter, setRpUsernameFilter] = useState('');
  const [rpBulkUsername, setRpBulkUsername] = useState('');
  const [rpBulkAmount, setRpBulkAmount] = useState<number>(0);
  const [rpBulkReason, setRpBulkReason] = useState('');
  const [rpBulkLoading, setRpBulkLoading] = useState(false);
  const [rpBulkResult, setRpBulkResult] = useState<string>('');
  const [rpLoading, setRpLoading] = useState(false);

  // Access control - Admin only (check isAdmin flag)
  const isAdmin = player?.isAdmin === true;

  useEffect(() => {
    if (!player) return;

    if (!isAdmin) {
      router.push('/game');
    }
  }, [player, router, isAdmin]);

  // Load admin stats
  useEffect(() => {
    if (!player || !isAdmin) return;

    const loadStats = async () => {
      setLoading(true);
      try {
        const [statsRes, playersRes, botStatsRes, botConfigRes] = await Promise.all([
          fetch('/api/admin/stats'),
          fetch('/api/admin/players'),
          fetch('/api/admin/bot-stats'),
          fetch('/api/admin/bot-config')
        ]);

        const statsData = await statsRes.json();
        const playersData = await playersRes.json();
        const botStatsData = await botStatsRes.json();
        const botConfigData = await botConfigRes.json();

        if (statsData.success) {
          setStats(statsData.data);
        }

        if (playersData.success) {
          setPlayers(playersData.data);
        }
        
        if (botStatsData.success) {
          setBotStats(botStatsData.data);
        }
        
        if (botConfigData.success) {
          setBotConfig(prev => ({
            ...prev,
            ...botConfigData.data
          }));
        }

        // Load WMD status
        const wmdStatusRes = await fetch('/api/admin/wmd?action=status');
        const wmdStatusData = await wmdStatusRes.json();
        if (wmdStatusData.success) {
          setWmdStatus(wmdStatusData.data);
        }

        // Load WMD analytics
        const wmdAnalyticsRes = await fetch(`/api/admin/wmd?action=analytics&range=${wmdTimeRange}`);
        const wmdAnalyticsData = await wmdAnalyticsRes.json();
        if (wmdAnalyticsData.success) {
          setWmdAnalytics(wmdAnalyticsData.data);
        }
      } catch (err) {
        console.error('Error loading admin data:', err);
        setError('Failed to load admin data');
      } finally {
        setLoading(false);
      }
    };

    loadStats();
    loadVipUsers(); // Load VIP users on mount
  }, [player]);

  // Reload WMD analytics when time range changes
  useEffect(() => {
    if (!player || !isAdmin) return;
    
    const loadWmdAnalytics = async () => {
      try {
        const res = await fetch(`/api/admin/wmd?action=analytics&range=${wmdTimeRange}`);
        const data = await res.json();
        if (data.success) {
          setWmdAnalytics(data.data);
        }
      } catch (err) {
        console.error('Failed to load WMD analytics:', err);
      }
    };

    loadWmdAnalytics();
  }, [wmdTimeRange, player, isAdmin]);

  // Reload VIP users when filter changes
  useEffect(() => {
    if (player && isAdmin) {
      loadVipUsers();
    }
  }, [vipFilter]);

  // Filter players by search term
  const filteredPlayers = players.filter(p =>
    p.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter VIP users
  const filteredVipUsers = vipUsers
    .filter(u => {
      const matchesSearch = u.username.toLowerCase().includes(vipSearchTerm.toLowerCase()) ||
                           (u.email && u.email.toLowerCase().includes(vipSearchTerm.toLowerCase()));
      const matchesFilter = vipFilter === 'all' || 
                           (vipFilter === 'vip' && u.isVIP) || 
                           (vipFilter === 'basic' && !u.isVIP);
      return matchesSearch && matchesFilter;
    });

  const vipCount = vipUsers.filter(u => u.isVIP).length;
  const basicCount = vipUsers.length - vipCount;
  
  // Bot Control Handlers
  const handleSpawn10Bots = async () => {
    setBotActionLoading(true);
    try {
      const res = await fetch('/api/admin/bot-spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 10, specialization: 'random' })
      });
      
      const data = await res.json();
      if (data.success) {
        alert(`Successfully spawned ${data.spawned} bots!`);
        // Refresh bot stats
        const botStatsRes = await fetch('/api/admin/bot-stats');
        const botStatsData = await botStatsRes.json();
        if (botStatsData.success) setBotStats(botStatsData.data);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Bot spawn error:', err);
      alert('Failed to spawn bots');
    } finally {
      setBotActionLoading(false);
    }
  };
  
  const handleRunRegen = async () => {
    setBotActionLoading(true);
    try {
      const res = await fetch('/api/admin/bot-regen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await res.json();
      if (data.success) {
        alert(`Regeneration complete! Updated ${data.updated} bots, spawned ${data.spawned} new bots.`);
        // Refresh bot stats
        const botStatsRes = await fetch('/api/admin/bot-stats');
        const botStatsData = await botStatsRes.json();
        if (botStatsData.success) setBotStats(botStatsData.data);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Bot regen error:', err);
      alert('Failed to run regeneration');
    } finally {
      setBotActionLoading(false);
    }
  };
  
  const handleRespawnBeerBases = async () => {
    setBotActionLoading(true);
    try {
      const res = await fetch('/api/admin/beer-bases/respawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await res.json();
      if (data.success) {
        alert(`Beer bases respawned! ${data.count} bases created.`);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Beer base respawn error:', err);
      alert('Failed to respawn beer bases');
    } finally {
      setBotActionLoading(false);
    }
  };
  
  const handleSaveConfig = async () => {
    setBotActionLoading(true);
    try {
      const res = await fetch('/api/admin/bot-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(botConfig)
      });
      
      const data = await res.json();
      if (data.success) {
        alert('Bot configuration saved successfully!');
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Config save error:', err);
      alert('Failed to save configuration');
    } finally {
      setBotActionLoading(false);
    }
  };
  
  const handleBotAnalytics = () => {
    if (!botStats) {
      alert('Bot stats not loaded yet');
      return;
    }
    
    const analyticsText = `
Bot Analytics:
━━━━━━━━━━━━━━
Total Bots: ${botStats.totalBots}
Active: ${botStats.activeBots}
Inactive: ${botStats.inactiveBots}

By Specialization:
- Hoarder: ${botStats.bySpecialization?.hoarder || 0}
- Fortress: ${botStats.bySpecialization?.fortress || 0}
- Raider: ${botStats.bySpecialization?.raider || 0}
- Ghost: ${botStats.bySpecialization?.ghost || 0}
- Balanced: ${botStats.bySpecialization?.balanced || 0}

Beer Bases: ${botStats.beerBases || 0}
Migration Rate: ${((botStats.migrationPercent || 0) * 100).toFixed(1)}%
Regen Cycle: ${botStats.lastRegenCycle || 'Never'}
    `.trim();
    
    alert(analyticsText);
  };
  
  // Load analytics data
  const loadAnalyticsData = async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    
    try {
      const [activityRes, resourceRes, sessionRes, flagsRes] = await Promise.all([
        fetch(`/api/admin/analytics/activity-trends?period=${analyticsPeriod}`),
        fetch(`/api/admin/analytics/resource-trends?period=${analyticsPeriod}`),
        fetch(`/api/admin/analytics/session-trends?period=${analyticsPeriod}`),
        fetch('/api/admin/anti-cheat/flagged-players')
      ]);
      
      const [activityJson, resourceJson, sessionJson, flagsJson] = await Promise.all([
        activityRes.json(),
        resourceRes.json(),
        sessionRes.json(),
        flagsRes.json()
      ]);
      
      if (activityJson.success) {
        setActivityData(activityJson.data || []);
      }
      
      if (resourceJson.success) {
        setResourceData(resourceJson.data || []);
      }
      
      if (sessionJson.success) {
        setSessionData(sessionJson);
      }
      
      if (flagsJson.success) {
        // Transform flag data for pie chart
        const severityCounts = flagsJson.data.reduce((acc: any, flag: any) => {
          const severity = flag.maxSeverity || 'LOW';
          acc[severity] = (acc[severity] || 0) + 1;
          return acc;
        }, {});
        
        setFlagData(Object.entries(severityCounts).map(([severity, count]) => ({
          severity,
          count
        })));
      }
      
    } catch (err) {
      console.error('Analytics load error:', err);
      setAnalyticsError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Load VIP users
  const loadVipUsers = async () => {
    setVipLoading(true);
    try {
      const response = await fetch('/api/admin/vip/list');
      const data = await response.json();
      if (data.success) {
        setVipUsers(data.users);
      }
    } catch (error) {
      console.error('Error loading VIP users:', error);
    } finally {
      setVipLoading(false);
    }
  };

  // Grant VIP
  const handleGrantVip = async (username: string, days: number) => {
    if (!confirm(`Grant VIP to ${username} for ${days} days?`)) return;
    
    try {
      const response = await fetch('/api/admin/vip/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, days })
      });
      
      const data = await response.json();
      if (data.success) {
        alert(`✅ VIP granted to ${username} for ${days} days`);
        loadVipUsers(); // Refresh list
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error granting VIP:', error);
      alert('Failed to grant VIP');
    }
  };

  // Revoke VIP
  const handleRevokeVip = async (username: string) => {
    if (!confirm(`Revoke VIP from ${username}?`)) return;
    
    try {
      const response = await fetch('/api/admin/vip/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      
      const data = await response.json();
      if (data.success) {
        alert(`✅ VIP revoked from ${username}`);
        loadVipUsers(); // Refresh list
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error revoking VIP:', error);
      alert('Failed to revoke VIP');
    }
  };

  // Load RP Economy data
  const loadRpEconomyData = async () => {
    setRpLoading(true);
    
    try {
      const [statsRes, txRes, genRes, milestoneRes, topRes] = await Promise.all([
        fetch('/api/admin/rp-economy/stats'),
        fetch(`/api/admin/rp-economy/transactions?period=${rpDateFilter}&source=${rpSourceFilter}&username=${rpUsernameFilter}`),
        fetch(`/api/admin/rp-economy/generation-by-source?period=${rpDateFilter}`),
        fetch('/api/admin/rp-economy/milestone-stats'),
        fetch(`/api/admin/rp-economy/top-players?period=${rpDateFilter}`)
      ]);
      
      if (statsRes.ok) {
        const data = await statsRes.json();
        setRpStats(data);
      }
      
      if (txRes.ok) {
        const data = await txRes.json();
        setRpTransactions(data.transactions || []);
      }
      
      if (genRes.ok) {
        const data = await genRes.json();
        setRpGenerationBySource(data.sources || []);
      }
      
      if (milestoneRes.ok) {
        const data = await milestoneRes.json();
        setRpMilestoneStats(data.milestones || []);
      }
      
      if (topRes.ok) {
        const data = await topRes.json();
        setRpTopEarners(data.topEarners || []);
        setRpTopSpenders(data.topSpenders || []);
      }
      
    } catch (error) {
      console.error('Failed to load RP economy data:', error);
    } finally {
      setRpLoading(false);
    }
  };

  // Bulk RP Adjustment
  const handleRpBulkAdjustment = async () => {
    if (!rpBulkUsername || rpBulkAmount === 0 || !rpBulkReason) {
      setRpBulkResult('❌ Please fill all fields');
      return;
    }
    
    setRpBulkLoading(true);
    setRpBulkResult('');
    
    try {
      const res = await fetch('/api/admin/rp-economy/bulk-adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: rpBulkUsername,
          amount: rpBulkAmount,
          reason: rpBulkReason,
          adminUsername: player?.username
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setRpBulkResult(`✅ Success! ${rpBulkUsername} now has ${data.newBalance} RP`);
        setRpBulkUsername('');
        setRpBulkAmount(0);
        setRpBulkReason('');
        loadRpEconomyData(); // Refresh data
      } else {
        setRpBulkResult(`❌ Error: ${data.message}`);
      }
      
    } catch (error) {
      setRpBulkResult('❌ Failed to adjust RP');
      console.error('Bulk adjustment error:', error);
    } finally {
      setRpBulkLoading(false);
    }
  };

  // Load RP Economy data when filters change
  useEffect(() => {
    if (rpEconomyExpanded && player?.isAdmin) {
      loadRpEconomyData();
    }
  }, [rpDateFilter, rpSourceFilter, rpUsernameFilter, rpEconomyExpanded]);
  
  // Load analytics on mount and period change
  useEffect(() => {
    if (isAdmin && player) {
      loadAnalyticsData();
    }
  }, [analyticsPeriod, isAdmin, player]);

  // Helper functions for RP Economy
  const formatRpSourceName = (source: string) => {
    const sourceMap: Record<string, string> = {
      'harvest_milestone': '🌾 Harvest Milestone',
      'level_up': '⬆️ Level Up',
      'battle': '⚔️ Battle',
      'achievement': '🏆 Achievement',
      'daily_login': '📅 Daily Login',
      'admin_adjustment': '⚙️ Admin Adjustment'
    };
    return sourceMap[source] || source;
  };

  const formatRpTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  if (!player || !isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <p>Access Denied - Admin Only</p>
      </div>
    );
  }

  return (
    <div className={embedded ? "p-6" : "min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-8"}>
      <div className="max-w-7xl mx-auto">
        {!embedded && <BackButton />}

        <div className="flex items-center justify-between mb-8 mt-4">
          <h1 className="text-4xl font-bold text-purple-400">⚙️ Admin Panel</h1>
          <div className="bg-purple-900/30 px-4 py-2 rounded-lg border border-purple-500">
            <p className="text-sm text-purple-300">Admin: {player.username}</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-600 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-400">Loading admin data...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Game Statistics */}
            {stats && (
              <div className="bg-gray-800 rounded-lg p-6 border-2 border-purple-500/30">
                <h2 className="text-2xl font-bold text-purple-400 mb-4">📊 Game Statistics</h2>
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-gray-900 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Total Players</p>
                    <p className="text-3xl font-bold text-cyan-400">{stats.totalPlayers}</p>
                  </div>
                  <div className="bg-gray-900 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Player Bases</p>
                    <p className="text-3xl font-bold text-green-400">{stats.totalBases}</p>
                  </div>
                  <div className="bg-gray-900 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Factories</p>
                    <p className="text-3xl font-bold text-red-400">{stats.totalFactories}</p>
                  </div>
                  <div className="bg-gray-900 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Active Players (1h / 24h / 7d)</p>
                    <p className="text-3xl font-bold text-emerald-300">{(stats.activePlayers1h ?? 0)} / {stats.activePlayers24h} / {(stats.activePlayers7d ?? 0)}</p>
                  </div>
                  <div className="bg-gray-900 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Active (24h)</p>
                    <p className="text-3xl font-bold text-yellow-400">{stats.activePlayers24h}</p>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="text-lg font-semibold text-purple-300 mb-3">Map Distribution</h3>
                  <div className="grid grid-cols-7 gap-2">
                    <div className="bg-gray-900 p-3 rounded text-center">
                      <p className="text-xs text-gray-400">Wasteland</p>
                      <p className="text-lg font-bold">{stats.mapStats.wastelands}</p>
                    </div>
                    <div className="bg-gray-900 p-3 rounded text-center">
                      <p className="text-xs text-gray-400">Metal</p>
                      <p className="text-lg font-bold text-blue-400">{stats.mapStats.metal}</p>
                    </div>
                    <div className="bg-gray-900 p-3 rounded text-center">
                      <p className="text-xs text-gray-400">Energy</p>
                      <p className="text-lg font-bold text-yellow-400">{stats.mapStats.energy}</p>
                    </div>
                    <div className="bg-gray-900 p-3 rounded text-center">
                      <p className="text-xs text-gray-400">Caves</p>
                      <p className="text-lg font-bold text-orange-400">{stats.mapStats.caves}</p>
                    </div>
                    <div className="bg-gray-900 p-3 rounded text-center">
                      <p className="text-xs text-gray-400">Forests</p>
                      <p className="text-lg font-bold text-green-400">{stats.mapStats.forests}</p>
                    </div>
                    <div className="bg-gray-900 p-3 rounded text-center">
                      <p className="text-xs text-gray-400">Banks</p>
                      <p className="text-lg font-bold text-purple-400">{stats.mapStats.banks}</p>
                    </div>
                    <div className="bg-gray-900 p-3 rounded text-center">
                      <p className="text-xs text-gray-400">Shrines</p>
                      <p className="text-lg font-bold text-pink-400">{stats.mapStats.shrines}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Player Management */}
            <div className="bg-gray-800 rounded-lg p-6 border-2 border-purple-500/30">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-purple-400">👥 Player Management</h2>
                <input
                  type="text"
                  placeholder="Search players..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-purple-500 focus:outline-none w-64"
                />
              </div>

              <div className="bg-gray-900 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Username</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Level</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Rank</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Metal</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Energy</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Base</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {filteredPlayers.map((p) => (
                      <tr key={p.username} className="hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{p.username}</td>
                        <td className="px-4 py-3 text-yellow-400">{p.level}</td>
                        <td className="px-4 py-3 text-purple-400">{p.rank}</td>
                        <td className="px-4 py-3 text-blue-400">{p.metal.toLocaleString()}</td>
                        <td className="px-4 py-3 text-yellow-400">{p.energy.toLocaleString()}</td>
                        <td className="px-4 py-3 text-green-400">{p.baseLocation}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setSelectedPlayer(p.username)}
                            className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded text-sm transition-colors"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredPlayers.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    No players found
                  </div>
                )}
              </div>
            </div>

            {/* VIP Management */}
            <div className="bg-gray-800 rounded-lg p-6 border-2 border-yellow-500/30">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-yellow-400">⚡ VIP Management</h2>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={vipSearchTerm}
                    onChange={(e) => setVipSearchTerm(e.target.value)}
                    className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-yellow-500 focus:outline-none w-64"
                  />
                  <button
                    onClick={loadVipUsers}
                    disabled={vipLoading}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
                  >
                    {vipLoading ? '⟳' : '🔄'} Refresh
                  </button>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-gray-900 p-4 rounded-lg border border-blue-500/30">
                  <p className="text-sm text-gray-400">Total Users</p>
                  <p className="text-2xl font-bold text-blue-400">{vipUsers.length}</p>
                </div>
                <div className="bg-gray-900 p-4 rounded-lg border border-yellow-500/30">
                  <p className="text-sm text-gray-400">VIP Users</p>
                  <p className="text-2xl font-bold text-yellow-400">{vipCount}</p>
                </div>
                <div className="bg-gray-900 p-4 rounded-lg border border-purple-500/30">
                  <p className="text-sm text-gray-400">Basic Users</p>
                  <p className="text-2xl font-bold text-purple-400">{basicCount}</p>
                </div>
              </div>

              {/* Filter Buttons */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setVipFilter('all')}
                  className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                    vipFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  All Users
                </button>
                <button
                  onClick={() => setVipFilter('vip')}
                  className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                    vipFilter === 'vip'
                      ? 'bg-yellow-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  VIP Only
                </button>
                <button
                  onClick={() => setVipFilter('basic')}
                  className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                    vipFilter === 'basic'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Basic Only
                </button>
              </div>

              {/* Users Table */}
              <div className="bg-gray-900 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Username</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Expires</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {filteredVipUsers.map((user) => (
                      <tr key={user.username} className="hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-white font-medium">{user.username}</td>
                        <td className="px-4 py-3 text-gray-400 text-sm">{user.email || 'N/A'}</td>
                        <td className="px-4 py-3">
                          {user.isVIP ? (
                            <span className="inline-block bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-3 py-1 rounded-full text-xs font-bold">
                              ⚡ VIP
                            </span>
                          ) : (
                            <span className="inline-block bg-purple-600 text-white px-3 py-1 rounded-full text-xs font-bold">
                              BASIC
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-sm">
                          {user.isVIP && user.vipExpiresAt 
                            ? new Date(user.vipExpiresAt).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {!user.isVIP ? (
                              <>
                                <button
                                  onClick={() => handleGrantVip(user.username, 7)}
                                  className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs rounded transition-colors"
                                  title="Grant 7 days"
                                >
                                  7d
                                </button>
                                <button
                                  onClick={() => handleGrantVip(user.username, 30)}
                                  className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs rounded transition-colors"
                                  title="Grant 30 days"
                                >
                                  30d
                                </button>
                                <button
                                  onClick={() => handleGrantVip(user.username, 365)}
                                  className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs rounded transition-colors"
                                  title="Grant 1 year"
                                >
                                  1yr
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleRevokeVip(user.username)}
                                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}

                    {filteredVipUsers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                          No users found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Analytics Dashboard */}
            <div className="bg-gray-800 rounded-lg p-6 border-2 border-cyan-500/30">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-cyan-400">📊 Analytics Dashboard</h2>
                
                {/* Period Selector */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setAnalyticsPeriod('24h')}
                    className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                      analyticsPeriod === '24h'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    24 Hours
                  </button>
                  <button
                    onClick={() => setAnalyticsPeriod('7d')}
                    className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                      analyticsPeriod === '7d'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    7 Days
                  </button>
                  <button
                    onClick={() => setAnalyticsPeriod('30d')}
                    className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                      analyticsPeriod === '30d'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    30 Days
                  </button>
                  <button
                    onClick={loadAnalyticsData}
                    disabled={analyticsLoading}
                    className="px-4 py-2 rounded-lg font-semibold bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 transition-colors"
                  >
                    {analyticsLoading ? '⟳' : '🔄'} Refresh
                  </button>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-2 gap-6">
                {/* Activity Timeline */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-300 mb-2">Player Activity Trends</h3>
                  <ActivityTimeline 
                    data={activityData}
                    period={analyticsPeriod}
                    loading={analyticsLoading}
                    error={analyticsError}
                  />
                </div>

                {/* Resource Gains */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-300 mb-2">Resource Accumulation</h3>
                  <ResourceGains 
                    data={resourceData}
                    period={analyticsPeriod}
                    loading={analyticsLoading}
                    error={analyticsError}
                  />
                </div>

                {/* Session Distribution */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-300 mb-2">Session Duration Distribution</h3>
                  <SessionDistribution 
                    buckets={sessionData?.buckets || []}
                    period={analyticsPeriod}
                    loading={analyticsLoading}
                    error={analyticsError}
                  />
                </div>

                {/* Flag Breakdown */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-300 mb-2">Anti-Cheat Flag Severity</h3>
                  <FlagBreakdown 
                    data={flagData}
                    totalFlagged={flagData.reduce((sum, f) => sum + f.count, 0)}
                    loading={analyticsLoading}
                    error={analyticsError}
                  />
                </div>

                {/* Bot Population */}
                <div className="col-span-2">
                  <h3 className="text-lg font-semibold text-gray-300 mb-2">Bot Population by Specialization</h3>
                  <BotPopulationTrends 
                    currentStats={botStats}
                    loading={!botStats}
                    error={null}
                  />
                </div>
              </div>
            </div>

            {/* Database Tools */}
            <div className="bg-gray-800 rounded-lg p-6 border-2 border-purple-500/30">
              <h2 className="text-2xl font-bold text-purple-400 mb-4">🛠️ Database Tools</h2>
              <div className="grid grid-cols-3 gap-4">
                <button 
                  onClick={async () => {
                    if (!confirm('Fix all player base tiles? This will convert base coordinates to Wasteland.')) return;
                    try {
                      const res = await fetch('/api/admin/fix-base', { method: 'POST' });
                      const data = await res.json();
                      alert(data.message || 'Base tiles fixed!');
                      window.location.reload();
                    } catch (error) {
                      alert('Failed to fix base tiles');
                    }
                  }}
                  className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-4 rounded-lg font-semibold transition-colors"
                >
                  🏠 Fix Base Tiles
                </button>
                <button 
                  onClick={() => setShowTileInspector(true)}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-4 rounded-lg font-semibold transition-colors"
                >
                  📊 View Tiles
                </button>
                <button className="bg-green-600 hover:bg-green-500 text-white px-6 py-4 rounded-lg font-semibold transition-colors"
                  onClick={() => setShowFactoryInspector(true)}
                >
                  🏭 Factory Inspector
                </button>
                <button className="bg-yellow-600 hover:bg-yellow-500 text-white px-6 py-4 rounded-lg font-semibold transition-colors"
                  onClick={() => setShowBattleLogs(true)}
                >
                  📝 Battle Logs
                </button>
                <button className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-4 rounded-lg font-semibold transition-colors"
                  onClick={() => setShowAchievementStats(true)}
                >
                  🎯 Achievement Stats
                </button>
                <button className="bg-red-600 hover:bg-red-500 text-white px-6 py-4 rounded-lg font-semibold transition-colors"
                  onClick={() => setShowSystemReset(true)}
                >
                  🔄 Reset Systems
                </button>
              </div>
            </div>

            {/* Bot System Controls */}
            <div className="bg-gray-800 rounded-lg p-6 border-2 border-cyan-500/30">
              <h2 className="text-2xl font-bold text-cyan-400 mb-4">🤖 Bot Ecosystem Controls</h2>
              
              <div className="space-y-6">
                {/* Bot Statistics */}
                <div className="bg-gray-900 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-3">Bot Population</h3>
                  <div className="grid grid-cols-5 gap-3">
                    <div className="bg-gray-800 p-3 rounded text-center">
                      <p className="text-xs text-gray-400">Total Bots</p>
                      <p className="text-2xl font-bold text-cyan-400">{botStats?.totalBots || 0}</p>
                    </div>
                    <div className="bg-gray-800 p-3 rounded text-center">
                      <p className="text-xs text-gray-400">Hoarders</p>
                      <p className="text-2xl font-bold text-yellow-400">{botStats?.bySpecialization?.hoarder || 0}</p>
                    </div>
                    <div className="bg-gray-800 p-3 rounded text-center">
                      <p className="text-xs text-gray-400">Fortresses</p>
                      <p className="text-2xl font-bold text-blue-400">{botStats?.bySpecialization?.fortress || 0}</p>
                    </div>
                    <div className="bg-gray-800 p-3 rounded text-center">
                      <p className="text-xs text-gray-400">Raiders</p>
                      <p className="text-2xl font-bold text-red-400">{botStats?.bySpecialization?.raider || 0}</p>
                    </div>
                    <div className="bg-gray-800 p-3 rounded text-center">
                      <p className="text-xs text-gray-400">Ghosts</p>
                      <p className="text-2xl font-bold text-purple-400">{botStats?.bySpecialization?.ghost || 0}</p>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-gray-900 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-3">Quick Actions</h3>
                  <div className="grid grid-cols-4 gap-3">
                    <button 
                      onClick={handleSpawn10Bots}
                      disabled={botActionLoading}
                      className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition-colors text-sm"
                    >
                      ➕ Spawn 10 Bots
                    </button>
                    <button 
                      onClick={handleRunRegen}
                      disabled={botActionLoading}
                      className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition-colors text-sm"
                    >
                      🔄 Run Regen Cycle
                    </button>
                    <button 
                      onClick={handleRespawnBeerBases}
                      disabled={botActionLoading}
                      className="bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition-colors text-sm"
                    >
                      🍺 Respawn Beer Bases
                    </button>
                    <button 
                      onClick={handleBotAnalytics}
                      disabled={botActionLoading}
                      className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition-colors text-sm"
                    >
                      📊 Bot Analytics
                    </button>
                    <button 
                      onClick={() => setShowWebSocketConsole(true)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded-lg font-semibold transition-colors text-sm"
                    >
                      🔌 WebSocket Console
                    </button>
                    <button 
                      onClick={() => setShowTileInspector(true)}
                      className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-lg font-semibold transition-colors text-sm"
                    >
                      🗺️ Tile Inspector
                    </button>
                    <button 
                      onClick={() => setShowFactoryInspector(true)}
                      className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-lg font-semibold transition-colors text-sm"
                    >
                      🏭 Factory Inspector
                    </button>
                    <button 
                      onClick={() => setShowSystemReset(true)}
                      className="bg-red-700 hover:bg-red-600 text-white px-4 py-3 rounded-lg font-semibold transition-colors text-sm"
                    >
                      ⚠️ System Reset
                    </button>
                  </div>
                </div>

                {/* System Configuration */}
                <div className="bg-gray-900 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-3">System Configuration</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Total Bot Cap</label>
                      <input 
                        type="number" 
                        value={botConfig.totalBotCap}
                        onChange={(e) => setBotConfig({...botConfig, totalBotCap: parseInt(e.target.value) || 0})}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Daily Spawn Count</label>
                      <input 
                        type="number" 
                        value={botConfig.dailySpawnCount}
                        onChange={(e) => setBotConfig({...botConfig, dailySpawnCount: parseInt(e.target.value) || 0})}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Beer Base % (0-1)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={botConfig.beerBasePercent}
                        onChange={(e) => setBotConfig({...botConfig, beerBasePercent: parseFloat(e.target.value) || 0})}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Migration % (0-1)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={botConfig.migrationPercent}
                        onChange={(e) => setBotConfig({...botConfig, migrationPercent: parseFloat(e.target.value) || 0})}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                      />
                    </div>
                  </div>
                  <button 
                    onClick={handleSaveConfig}
                    disabled={botActionLoading}
                    className="mt-4 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-semibold transition-colors w-full"
                  >
                    💾 Save Configuration
                  </button>
                </div>

                {/* Resource Regeneration Rates */}
                <div className="bg-gray-900 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-3">Regeneration Rates (% per hour)</h3>
                  <div className="grid grid-cols-5 gap-3">
                    <div className="space-y-2">
                      <label className="text-xs text-yellow-400">Hoarder</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={botConfig.regenRates.hoarder}
                        onChange={(e) => setBotConfig({
                          ...botConfig, 
                          regenRates: {...botConfig.regenRates, hoarder: parseFloat(e.target.value) || 0}
                        })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-blue-400">Fortress</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={botConfig.regenRates.fortress}
                        onChange={(e) => setBotConfig({
                          ...botConfig, 
                          regenRates: {...botConfig.regenRates, fortress: parseFloat(e.target.value) || 0}
                        })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-red-400">Raider</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={botConfig.regenRates.raider}
                        onChange={(e) => setBotConfig({
                          ...botConfig, 
                          regenRates: {...botConfig.regenRates, raider: parseFloat(e.target.value) || 0}
                        })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-purple-400">Ghost</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={botConfig.regenRates.ghost}
                        onChange={(e) => setBotConfig({
                          ...botConfig, 
                          regenRates: {...botConfig.regenRates, ghost: parseFloat(e.target.value) || 0}
                        })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-green-400">Balanced</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={botConfig.regenRates.balanced}
                        onChange={(e) => setBotConfig({
                          ...botConfig, 
                          regenRates: {...botConfig.regenRates, balanced: parseFloat(e.target.value) || 0}
                        })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Tech System Costs */}
                <div className="bg-gray-900 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-3">Tech System Costs & Cooldowns</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Bot Magnet Cost (Metal)</label>
                      <input 
                        type="number" 
                        defaultValue={10000}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Magnet Cooldown (hours)</label>
                      <input 
                        type="number" 
                        defaultValue={336}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Summoning Cost (Metal)</label>
                      <input 
                        type="number" 
                        defaultValue={25000}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Summoning Cost (Energy)</label>
                      <input 
                        type="number" 
                        defaultValue={25000}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Phase-Out System */}
                <div className="bg-gray-900 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-3">Phase-Out System</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Enabled</label>
                      <select className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white">
                        <option value="false">Disabled</option>
                        <option value="true">Enabled</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">1 Bot per X Players</label>
                      <input 
                        type="number" 
                        defaultValue={10}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Priority</label>
                      <select className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white">
                        <option value="weakest">Weakest</option>
                        <option value="oldest">Oldest</option>
                        <option value="random">Random</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* WMD System Oversight */}
            <div className="bg-gray-800 rounded-lg p-6 border-2 border-pink-500/30">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-pink-400">☢️ WMD System Oversight</h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">Time Range:</span>
                  <select 
                    value={wmdTimeRange}
                    onChange={(e) => setWmdTimeRange(e.target.value as '7d' | '30d' | '90d')}
                    className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white text-sm"
                  >
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                    <option value="90d">Last 90 Days</option>
                  </select>
                </div>
              </div>

              <div className="space-y-6">
                {/* System Health Status */}
                {wmdStatus && (
                  <div className="bg-gray-900 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-pink-300 mb-3">System Health</h3>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-gray-800 p-3 rounded text-center">
                        <p className="text-xs text-gray-400">Active Operations</p>
                        <p className="text-2xl font-bold text-pink-400">
                          {wmdStatus.activeOperations?.missiles || 0}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Missiles</p>
                      </div>
                      <div className="bg-gray-800 p-3 rounded text-center">
                        <p className="text-xs text-gray-400">Active Votes</p>
                        <p className="text-2xl font-bold text-yellow-400">
                          {wmdStatus.activeOperations?.votes || 0}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Pending</p>
                      </div>
                      <div className="bg-gray-800 p-3 rounded text-center">
                        <p className="text-xs text-gray-400">Scheduled Jobs</p>
                        <p className="text-2xl font-bold text-blue-400">
                          {wmdStatus.jobs?.scheduled || 0}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Queue</p>
                      </div>
                      <div className="bg-gray-800 p-3 rounded text-center">
                        <p className="text-xs text-gray-400">System Alerts</p>
                        <p className={`text-2xl font-bold ${(wmdStatus.alerts?.length || 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {wmdStatus.alerts?.length || 0}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Active</p>
                      </div>
                    </div>

                    {/* Active Alerts */}
                    {wmdStatus.alerts && wmdStatus.alerts.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <h4 className="text-sm font-semibold text-red-400">⚠️ Active Alerts</h4>
                        {wmdStatus.alerts.map((alert: any, idx: number) => (
                          <div key={idx} className="bg-red-900/20 border border-red-500/30 rounded p-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-sm font-semibold text-red-300">{alert.type}</p>
                                <p className="text-xs text-gray-400 mt-1">{alert.message}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {alert.playerId && `Player: ${alert.playerId}`}
                                  {alert.clanId && ` | Clan: ${alert.clanId}`}
                                </p>
                              </div>
                              <span className="text-xs text-gray-400">
                                {new Date(alert.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Analytics Summary */}
                {wmdAnalytics && (
                  <div className="bg-gray-900 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-pink-300 mb-3">Analytics Summary</h3>
                    
                    {/* Missile Statistics */}
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-orange-400 mb-2">🚀 Missile Operations</h4>
                      <div className="grid grid-cols-5 gap-3">
                        <div className="bg-gray-800 p-2 rounded text-center">
                          <p className="text-xs text-gray-400">Total Launched</p>
                          <p className="text-xl font-bold text-orange-400">
                            {wmdAnalytics.missiles?.total || 0}
                          </p>
                        </div>
                        <div className="bg-gray-800 p-2 rounded text-center">
                          <p className="text-xs text-gray-400">Intercepted</p>
                          <p className="text-xl font-bold text-blue-400">
                            {wmdAnalytics.missiles?.intercepted || 0}
                          </p>
                        </div>
                        <div className="bg-gray-800 p-2 rounded text-center">
                          <p className="text-xs text-gray-400">Hit Targets</p>
                          <p className="text-xl font-bold text-red-400">
                            {wmdAnalytics.missiles?.hit || 0}
                          </p>
                        </div>
                        <div className="bg-gray-800 p-2 rounded text-center">
                          <p className="text-xs text-gray-400">Success Rate</p>
                          <p className="text-xl font-bold text-green-400">
                            {wmdAnalytics.missiles?.successRate ? 
                              `${(wmdAnalytics.missiles.successRate * 100).toFixed(1)}%` : '0%'}
                          </p>
                        </div>
                        <div className="bg-gray-800 p-2 rounded text-center">
                          <p className="text-xs text-gray-400">Avg Damage</p>
                          <p className="text-xl font-bold text-yellow-400">
                            {wmdAnalytics.missiles?.avgDamage ? 
                              Math.round(wmdAnalytics.missiles.avgDamage).toLocaleString() : '0'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Voting Statistics */}
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-yellow-400 mb-2">🗳️ Voting Patterns</h4>
                      <div className="grid grid-cols-4 gap-3">
                        <div className="bg-gray-800 p-2 rounded text-center">
                          <p className="text-xs text-gray-400">Total Votes</p>
                          <p className="text-xl font-bold text-yellow-400">
                            {wmdAnalytics.votes?.total || 0}
                          </p>
                        </div>
                        <div className="bg-gray-800 p-2 rounded text-center">
                          <p className="text-xs text-gray-400">Passed</p>
                          <p className="text-xl font-bold text-green-400">
                            {wmdAnalytics.votes?.passed || 0}
                          </p>
                        </div>
                        <div className="bg-gray-800 p-2 rounded text-center">
                          <p className="text-xs text-gray-400">Failed</p>
                          <p className="text-xl font-bold text-red-400">
                            {wmdAnalytics.votes?.failed || 0}
                          </p>
                        </div>
                        <div className="bg-gray-800 p-2 rounded text-center">
                          <p className="text-xs text-gray-400">Approval Rate</p>
                          <p className="text-xl font-bold text-purple-400">
                            {wmdAnalytics.votes?.approvalRate ? 
                              `${(wmdAnalytics.votes.approvalRate * 100).toFixed(1)}%` : '0%'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Defense & Economic Stats */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-semibold text-blue-400 mb-2">🛡️ Defense Operations</h4>
                        <div className="bg-gray-800 p-3 rounded">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-gray-400">Research Attempts</span>
                            <span className="text-sm font-bold text-blue-400">
                              {wmdAnalytics.defense?.researchAttempts || 0}
                            </span>
                          </div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-gray-400">Successful Research</span>
                            <span className="text-sm font-bold text-green-400">
                              {wmdAnalytics.defense?.researchSuccesses || 0}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-400">Active Spy Ops</span>
                            <span className="text-sm font-bold text-purple-400">
                              {wmdAnalytics.defense?.activeSpyOps || 0}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-green-400 mb-2">💰 Economic Impact</h4>
                        <div className="bg-gray-800 p-3 rounded">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-gray-400">Total Spent</span>
                            <span className="text-sm font-bold text-red-400">
                              {wmdAnalytics.economy?.totalSpent ? 
                                Math.round(wmdAnalytics.economy.totalSpent).toLocaleString() : '0'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-gray-400">Avg Per Operation</span>
                            <span className="text-sm font-bold text-yellow-400">
                              {wmdAnalytics.economy?.avgCost ? 
                                Math.round(wmdAnalytics.economy.avgCost).toLocaleString() : '0'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-400">Clans Participating</span>
                            <span className="text-sm font-bold text-green-400">
                              {wmdAnalytics.economy?.uniqueClans || 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Balance Warnings */}
                    {wmdAnalytics.balance?.warnings && wmdAnalytics.balance.warnings.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-semibold text-orange-400 mb-2">⚠️ Balance Warnings</h4>
                        <div className="space-y-2">
                          {wmdAnalytics.balance.warnings.map((warning: string, idx: number) => (
                            <div key={idx} className="bg-orange-900/20 border border-orange-500/30 rounded px-3 py-2">
                              <p className="text-sm text-orange-300">{warning}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Emergency Admin Actions */}
                <div className="bg-gray-900 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-pink-300 mb-3">🚨 Emergency Actions</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-red-400">Missile Control</h4>
                      <div className="space-y-2">
                        <input 
                          type="text"
                          placeholder="Missile ID"
                          id="disarm-missile-id"
                          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                        />
                        <input 
                          type="text"
                          placeholder="Reason for disarming"
                          id="disarm-reason"
                          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                        />
                        <button
                          onClick={async () => {
                            const missileId = (document.getElementById('disarm-missile-id') as HTMLInputElement)?.value;
                            const reason = (document.getElementById('disarm-reason') as HTMLInputElement)?.value;
                            if (!missileId || !reason) {
                              alert('Please provide missile ID and reason');
                              return;
                            }
                            if (!confirm(`Emergency disarm missile ${missileId}? This will refund 50% of costs.`)) return;
                            
                            try {
                              const res = await fetch('/api/admin/wmd', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'disarm-missile', missileId, reason })
                              });
                              const data = await res.json();
                              if (data.success) {
                                alert('Missile disarmed successfully! Clan refunded 50% of costs.');
                                // Reload WMD status
                                const statusRes = await fetch('/api/admin/wmd?action=status');
                                const statusData = await statusRes.json();
                                if (statusData.success) setWmdStatus(statusData.data);
                              } else {
                                alert(`Error: ${data.error}`);
                              }
                            } catch (err) {
                              console.error('Disarm error:', err);
                              alert('Failed to disarm missile');
                            }
                          }}
                          className="w-full bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded font-semibold text-sm transition-colors"
                        >
                          🛑 Emergency Disarm
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-yellow-400">Vote Control</h4>
                      <div className="space-y-2">
                        <input 
                          type="text"
                          placeholder="Vote ID"
                          id="expire-vote-id"
                          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                        />
                        <input 
                          type="text"
                          placeholder="Reason for expiration"
                          id="expire-reason"
                          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                        />
                        <button
                          onClick={async () => {
                            const voteId = (document.getElementById('expire-vote-id') as HTMLInputElement)?.value;
                            const reason = (document.getElementById('expire-reason') as HTMLInputElement)?.value;
                            if (!voteId || !reason) {
                              alert('Please provide vote ID and reason');
                              return;
                            }
                            if (!confirm(`Force expire vote ${voteId}?`)) return;
                            
                            try {
                              const res = await fetch('/api/admin/wmd', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'expire-vote', voteId, reason })
                              });
                              const data = await res.json();
                              if (data.success) {
                                alert('Vote expired successfully!');
                                // Reload WMD status
                                const statusRes = await fetch('/api/admin/wmd?action=status');
                                const statusData = await statusRes.json();
                                if (statusData.success) setWmdStatus(statusData.data);
                              } else {
                                alert(`Error: ${data.error}`);
                              }
                            } catch (err) {
                              console.error('Expire error:', err);
                              alert('Failed to expire vote');
                            }
                          }}
                          className="w-full bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded font-semibold text-sm transition-colors"
                        >
                          ⏱️ Force Expire
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-blue-400">Cooldown Adjustment</h4>
                      <div className="space-y-2">
                        <input 
                          type="text"
                          placeholder="Clan ID"
                          id="cooldown-clan-id"
                          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                        />
                        <input 
                          type="number"
                          placeholder="Hours to adjust (+/-)"
                          id="cooldown-hours"
                          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                        />
                        <input 
                          type="text"
                          placeholder="Reason"
                          id="cooldown-reason"
                          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                        />
                        <button
                          onClick={async () => {
                            const clanId = (document.getElementById('cooldown-clan-id') as HTMLInputElement)?.value;
                            const hours = parseInt((document.getElementById('cooldown-hours') as HTMLInputElement)?.value || '0');
                            const reason = (document.getElementById('cooldown-reason') as HTMLInputElement)?.value;
                            if (!clanId || hours === 0 || !reason) {
                              alert('Please provide clan ID, hours adjustment, and reason');
                              return;
                            }
                            if (!confirm(`Adjust clan ${clanId} cooldown by ${hours} hours?`)) return;
                            
                            try {
                              const res = await fetch('/api/admin/wmd', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'adjust-cooldown', clanId, adjustmentHours: hours, reason })
                              });
                              const data = await res.json();
                              if (data.success) {
                                alert(`Cooldown adjusted! New cooldown expires: ${new Date(data.newCooldownExpiry).toLocaleString()}`);
                              } else {
                                alert(`Error: ${data.error}`);
                              }
                            } catch (err) {
                              console.error('Cooldown adjustment error:', err);
                              alert('Failed to adjust cooldown');
                            }
                          }}
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-semibold text-sm transition-colors"
                        >
                          ⏰ Adjust Cooldown
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-purple-400">Flag Suspicious Activity</h4>
                      <div className="space-y-2">
                        <input 
                          type="text"
                          placeholder="Player ID (optional)"
                          id="flag-player-id"
                          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                        />
                        <input 
                          type="text"
                          placeholder="Clan ID (optional)"
                          id="flag-clan-id"
                          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                        />
                        <select 
                          id="flag-activity-type"
                          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                        >
                          <option value="">Select Activity Type</option>
                          <option value="rapid_launch">Rapid Launch</option>
                          <option value="vote_manipulation">Vote Manipulation</option>
                          <option value="cooldown_exploit">Cooldown Exploit</option>
                          <option value="coordinated_attack">Coordinated Attack</option>
                          <option value="other">Other</option>
                        </select>
                        <textarea 
                          placeholder="Details and evidence"
                          id="flag-details"
                          rows={3}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                        />
                        <button
                          onClick={async () => {
                            const playerId = (document.getElementById('flag-player-id') as HTMLInputElement)?.value || undefined;
                            const clanId = (document.getElementById('flag-clan-id') as HTMLInputElement)?.value || undefined;
                            const activityType = (document.getElementById('flag-activity-type') as HTMLSelectElement)?.value;
                            const details = (document.getElementById('flag-details') as HTMLTextAreaElement)?.value;
                            
                            if (!activityType || !details) {
                              alert('Please select activity type and provide details');
                              return;
                            }
                            if (!playerId && !clanId) {
                              alert('Please provide either player ID or clan ID');
                              return;
                            }
                            
                            try {
                              const res = await fetch('/api/admin/wmd', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ 
                                  action: 'flag-activity', 
                                  playerId, 
                                  clanId, 
                                  activityType, 
                                  details 
                                })
                              });
                              const data = await res.json();
                              if (data.success) {
                                alert('Activity flagged successfully! Alert created for admin review.');
                                // Reload WMD status to show new alert
                                const statusRes = await fetch('/api/admin/wmd?action=status');
                                const statusData = await statusRes.json();
                                if (statusData.success) setWmdStatus(statusData.data);
                              } else {
                                alert(`Error: ${data.error}`);
                              }
                            } catch (err) {
                              console.error('Flag error:', err);
                              alert('Failed to flag activity');
                            }
                          }}
                          className="w-full bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded font-semibold text-sm transition-colors"
                        >
                          🚩 Create Alert
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

        {/* RP Economy Management */}
        <div className="bg-gray-800 rounded-lg border-2 border-purple-500/30">
              <button
                onClick={() => {
                  setRpEconomyExpanded(!rpEconomyExpanded);
                  if (!rpEconomyExpanded && !rpStats) {
                    loadRpEconomyData();
                  }
                }}
                className="w-full p-6 text-left hover:bg-gray-700/50 transition-colors flex items-center justify-between"
              >
                <div>
                  <h2 className="text-2xl font-bold text-yellow-400">💰 RP Economy Management</h2>
                  <p className="text-gray-400 text-sm mt-1">Monitor and manage the Research Point economy</p>
                </div>
                <span className="text-3xl text-purple-400">{rpEconomyExpanded ? '▼' : '▶'}</span>
              </button>

              {rpEconomyExpanded && (
                <div className="p-6 pt-0 space-y-6">
                  {rpLoading && !rpStats ? (
                    <div className="text-center py-8 text-gray-400">Loading economy data...</div>
                  ) : (
                    <>
                      {/* Quick Actions Bar */}
                      <div className="flex items-center justify-between bg-gray-900 rounded-lg p-4">
                        <div className="text-sm text-gray-400">
                          Last refreshed: {new Date().toLocaleTimeString()}
                        </div>
                        <button
                          onClick={loadRpEconomyData}
                          disabled={rpLoading}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded-lg font-semibold transition-colors text-sm"
                        >
                          {rpLoading ? '⏳ Loading...' : '🔄 Refresh Data'}
                        </button>
                      </div>

                      {/* Economy Overview Stats */}
                      <div className="grid grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-yellow-600 to-orange-600 rounded-lg p-4 text-white">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-2xl">💰</div>
                            <div className="text-xs opacity-80">Total RP in Circulation</div>
                          </div>
                          <div className="text-2xl font-bold">{rpStats?.totalRP?.toLocaleString() || '0'}</div>
                        </div>
                        <div className="bg-gradient-to-br from-green-600 to-emerald-600 rounded-lg p-4 text-white">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-2xl">📈</div>
                            <div className="text-xs opacity-80">Daily Generation</div>
                          </div>
                          <div className="text-2xl font-bold">{rpStats?.dailyGeneration?.toLocaleString() || '0'}</div>
                          <div className="text-xs opacity-80">Last 24 hours</div>
                        </div>
                        <div className="bg-gradient-to-br from-blue-600 to-cyan-600 rounded-lg p-4 text-white">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-2xl">👥</div>
                            <div className="text-xs opacity-80">Active Earners</div>
                          </div>
                          <div className="text-2xl font-bold">{rpStats?.activeEarners24h?.toLocaleString() || '0'}</div>
                          <div className="text-xs opacity-80">Last 24 hours</div>
                        </div>
                        <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg p-4 text-white">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-2xl">📊</div>
                            <div className="text-xs opacity-80">Average Balance</div>
                          </div>
                          <div className="text-2xl font-bold">{rpStats?.averageBalance?.toLocaleString() || '0'}</div>
                          <div className="text-xs opacity-80">Median: {rpStats?.medianBalance?.toLocaleString() || '0'}</div>
                        </div>
                      </div>

                      {/* Generation vs Spending & Bulk Adjustment */}
                      <div className="grid grid-cols-2 gap-6">
                        {/* Generation/Spending */}
                        <div className="bg-gray-900 rounded-lg p-4">
                          <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-purple-400">
                            <span>💸</span>
                            <span>Generation vs Spending</span>
                          </h3>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400">Total Generated:</span>
                              <span className="text-green-400 font-bold">{rpStats?.totalGenerated?.toLocaleString() || '0'} RP</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400">Total Spent:</span>
                              <span className="text-red-400 font-bold">{rpStats?.totalSpent?.toLocaleString() || '0'} RP</span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-gray-700">
                              <span className="text-gray-300 font-semibold">Net Circulation:</span>
                              <span className="text-yellow-400 font-bold text-lg">{rpStats?.totalRP?.toLocaleString() || '0'} RP</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-500 text-xs">VIP Players:</span>
                              <span className="text-purple-400 text-xs">{rpStats?.vipPlayers || 0} players (+50% bonus)</span>
                            </div>
                          </div>
                        </div>

                        {/* Bulk RP Adjustment Tool */}
                        <div className="bg-gray-900 rounded-lg p-4">
                          <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-purple-400">
                            <span>⚙️</span>
                            <span>Bulk RP Adjustment</span>
                          </h3>
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={rpBulkUsername}
                              onChange={(e) => setRpBulkUsername(e.target.value)}
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm"
                              placeholder="Username"
                            />
                            <input
                              type="number"
                              value={rpBulkAmount || ''}
                              onChange={(e) => setRpBulkAmount(parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm"
                              placeholder="Amount (+ to add, - to remove)"
                            />
                            <input
                              type="text"
                              value={rpBulkReason}
                              onChange={(e) => setRpBulkReason(e.target.value)}
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm"
                              placeholder="Reason for adjustment"
                            />
                            <button
                              onClick={handleRpBulkAdjustment}
                              disabled={rpBulkLoading || !rpBulkUsername || rpBulkAmount === 0 || !rpBulkReason}
                              className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 rounded font-semibold transition-colors text-sm"
                            >
                              {rpBulkLoading ? '⏳ Processing...' : '💰 Adjust RP Balance'}
                            </button>
                            {rpBulkResult && (
                              <div className={`text-xs p-2 rounded ${rpBulkResult.startsWith('✅') ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                                {rpBulkResult}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Top Earners and Spenders */}
                      <div className="grid grid-cols-2 gap-6">
                        {/* Top Earners */}
                        <div className="bg-gray-900 rounded-lg p-4">
                          <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-purple-400">
                            <span>🏆</span>
                            <span>Top RP Earners</span>
                            <span className="text-xs text-gray-400 ml-auto">{rpDateFilter}</span>
                          </h3>
                          <div className="space-y-2">
                            {rpTopEarners.slice(0, 5).map((player: any, index: number) => (
                              <div key={player.username} className="flex items-center justify-between p-2 bg-gray-800 rounded text-sm">
                                <div className="flex items-center gap-2">
                                  <span>{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}</span>
                                  <span className="font-semibold">{player.username}</span>
                                  {player.isVIP && <span className="text-xs bg-purple-600 px-1 py-0.5 rounded">VIP</span>}
                                </div>
                                <span className="text-green-400 font-bold">{player.amount?.toLocaleString()} RP</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Top Spenders */}
                        <div className="bg-gray-900 rounded-lg p-4">
                          <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-purple-400">
                            <span>💸</span>
                            <span>Top RP Spenders</span>
                            <span className="text-xs text-gray-400 ml-auto">{rpDateFilter}</span>
                          </h3>
                          <div className="space-y-2">
                            {rpTopSpenders.slice(0, 5).map((player: any, index: number) => (
                              <div key={player.username} className="flex items-center justify-between p-2 bg-gray-800 rounded text-sm">
                                <div className="flex items-center gap-2">
                                  <span>{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}</span>
                                  <span className="font-semibold">{player.username}</span>
                                  {player.isVIP && <span className="text-xs bg-purple-600 px-1 py-0.5 rounded">VIP</span>}
                                </div>
                                <span className="text-red-400 font-bold">{player.amount?.toLocaleString()} RP</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Transaction History with Filters */}
                      <div className="bg-gray-900 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold flex items-center gap-2 text-purple-400">
                            <span>📜</span>
                            <span>Recent RP Transactions</span>
                          </h3>
                          
                          {/* Filters */}
                          <div className="flex gap-2">
                            <select
                              value={rpDateFilter}
                              onChange={(e) => setRpDateFilter(e.target.value as any)}
                              className="px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs"
                            >
                              <option value="24h">Last 24 Hours</option>
                              <option value="7d">Last 7 Days</option>
                              <option value="30d">Last 30 Days</option>
                              <option value="all">All Time</option>
                            </select>
                            
                            <select
                              value={rpSourceFilter}
                              onChange={(e) => setRpSourceFilter(e.target.value)}
                              className="px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs"
                            >
                              <option value="all">All Sources</option>
                              <option value="harvest_milestone">Harvest Milestones</option>
                              <option value="level_up">Level Ups</option>
                              <option value="battle">Battles</option>
                              <option value="achievement">Achievements</option>
                              <option value="daily_login">Daily Login</option>
                              <option value="admin_adjustment">Admin Adjustments</option>
                            </select>
                            
                            <input
                              type="text"
                              value={rpUsernameFilter}
                              onChange={(e) => setRpUsernameFilter(e.target.value)}
                              placeholder="Filter by username..."
                              className="px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs w-40"
                            />
                          </div>
                        </div>
                        
                        <div className="overflow-x-auto max-h-64 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-gray-900">
                              <tr className="border-b border-gray-700">
                                <th className="text-left py-2 px-2">Time</th>
                                <th className="text-left py-2 px-2">Player</th>
                                <th className="text-left py-2 px-2">Source</th>
                                <th className="text-left py-2 px-2">Description</th>
                                <th className="text-right py-2 px-2">Amount</th>
                                <th className="text-center py-2 px-2">VIP</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rpTransactions.slice(0, 50).map((tx: any) => (
                                <tr key={tx._id} className="border-b border-gray-700/50 hover:bg-gray-800/50">
                                  <td className="py-2 px-2 text-gray-400">{formatRpTimestamp(tx.timestamp)}</td>
                                  <td className="py-2 px-2 font-semibold">{tx.username}</td>
                                  <td className="py-2 px-2">{formatRpSourceName(tx.source)}</td>
                                  <td className="py-2 px-2 text-gray-400">{tx.description}</td>
                                  <td className={`py-2 px-2 text-right font-bold ${tx.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {tx.amount >= 0 ? '+' : ''}{tx.amount?.toLocaleString()}
                                  </td>
                                  <td className="py-2 px-2 text-center">{tx.vipBonusApplied ? '👑' : '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {rpTransactions.length === 0 && (
                            <div className="text-center py-8 text-gray-400">No transactions found</div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

          {/* Player Detail Modal */}
          {selectedPlayer && (
            <PlayerDetailModal
              username={selectedPlayer}
              onClose={() => setSelectedPlayer(null)}
            />
          )}

          {/* Tile Inspector Modal */}
          {showTileInspector && (
            <TileInspectorModal
              onClose={() => setShowTileInspector(false)}
            />
          )}

          {showFactoryInspector && (
            <FactoryInspectorModal
              onClose={() => setShowFactoryInspector(false)}
            />
          )}

          {showBattleLogs && (
            <BattleLogsModal
              onClose={() => setShowBattleLogs(false)}
            />
          )}

          {showAchievementStats && (
            <AchievementStatsModal
              onClose={() => setShowAchievementStats(false)}
            />
          )}

          {showSystemReset && (
            <SystemResetModal
              onClose={() => setShowSystemReset(false)}
            />
          )}

          {showWebSocketConsole && (
            <WebSocketConsoleModal
              onClose={() => setShowWebSocketConsole(false)}
            />
          )}
        </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Access restricted to level 10+ players
// - Displays game statistics and player management tools
// - Backend API needed: /api/admin/stats and /api/admin/players
// - Future: Individual database inspection tools per button
// ============================================================
