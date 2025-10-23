// ============================================================
// FILE: components/StatsViewWrapper.tsx
// CREATED: 2025-01-23 (FID-20250123-001)
// ============================================================
// OVERVIEW:
// Three-tab statistics interface embedded in game center view:
// 1. Personal Stats - Player's individual achievements and metrics
// 2. Game Stats - Global leaderboards (power, level, resources)
// 3. Economy - Placeholder for auction house and trade data
//
// Replaces tile view when opened, auto-closes on player movement
// ============================================================

'use client';

import React, { useState, useEffect } from 'react';
import BackButton from './BackButton';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface PlayerStats {
  battlesWon: number;
  totalUnitsBuilt: number;
  totalResourcesGathered: number;
  totalResourcesBanked: number;
  shrineTradeCount: number;
  cavesExplored: number;
}

interface PersonalStatsData {
  stats: PlayerStats;
  username: string;
  level: number;
  totalPower: number;
  resources: {
    metal: number;
    energy: number;
  };
}

interface LeaderboardPlayer {
  _id: string;
  username: string;
  level: number;
  totalPower: number;
  totalStrength?: number;
  totalDefense?: number;
  resources?: {
    metal: number;
    energy: number;
  };
  rank?: string;
}

interface GameStatsData {
  totalPlayers: number;
  totalMetal: number;
  totalEnergy: number;
  totalPower: number;
  averageLevel: number;
  totalBattles: number;
  totalTerritories: number;
}

interface LeaderboardData {
  topPlayers: LeaderboardPlayer[];
  gameStats: GameStatsData;
  sortBy: string;
}

type TabType = 'personal' | 'game' | 'economy';

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function StatsViewWrapper() {
  const [activeTab, setActiveTab] = useState<TabType>('personal');
  const [personalData, setPersonalData] = useState<PersonalStatsData | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData | null>(null);
  const [sortBy, setSortBy] = useState<string>('totalPower');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetches personal player statistics from API
   */
  const fetchPersonalStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/player/stats');
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch personal stats');
      }

      setPersonalData(data);
    } catch (err) {
      console.error('❌ Error fetching personal stats:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetches game leaderboard statistics from API
   */
  const fetchLeaderboardStats = async (newSortBy?: string) => {
    try {
      setLoading(true);
      setError(null);

      const sortField = newSortBy || sortBy;
      const response = await fetch(`/api/stats?sortBy=${sortField}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error('Failed to fetch leaderboard stats');
      }

      setLeaderboardData(data);
      setSortBy(sortField);
    } catch (err) {
      console.error('❌ Error fetching leaderboard stats:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Load data when tab changes
  useEffect(() => {
    if (activeTab === 'personal') {
      fetchPersonalStats();
    } else if (activeTab === 'game') {
      fetchLeaderboardStats();
    } else {
      setLoading(false);
    }
  }, [activeTab]);

  /**
   * Handles sort button click for leaderboards
   */
  const handleSort = (field: string) => {
    if (activeTab === 'game') {
      fetchLeaderboardStats(field);
    }
  };

  return (
    <div className="absolute inset-0 bg-gray-900/95 text-white overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900/90 to-purple-900/90 px-6 py-4 border-b border-blue-500/30 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BackButton />
          <h1 className="text-2xl font-bold text-blue-300">📊 Statistics</h1>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-gray-800/50 px-6 py-3 border-b border-gray-700 flex gap-2">
        <button
          onClick={() => setActiveTab('personal')}
          className={`px-6 py-2 rounded-lg font-semibold transition-all ${
            activeTab === 'personal'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          📈 Personal Stats
        </button>
        <button
          onClick={() => setActiveTab('game')}
          className={`px-6 py-2 rounded-lg font-semibold transition-all ${
            activeTab === 'game'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          🏆 Game Stats
        </button>
        <button
          onClick={() => setActiveTab('economy')}
          className={`px-6 py-2 rounded-lg font-semibold transition-all ${
            activeTab === 'economy'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          💰 Economy
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-xl text-blue-400">Loading statistics...</div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 text-red-200">
            ⚠️ Error: {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Personal Stats Tab */}
            {activeTab === 'personal' && personalData && (
              <PersonalStatsTab data={personalData} />
            )}

            {/* Game Stats Tab */}
            {activeTab === 'game' && leaderboardData && (
              <GameStatsTab 
                data={leaderboardData} 
                sortBy={sortBy}
                onSort={handleSort}
              />
            )}

            {/* Economy Tab */}
            {activeTab === 'economy' && (
              <EconomyTab />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// PERSONAL STATS TAB COMPONENT
// ============================================================

interface PersonalStatsTabProps {
  data: PersonalStatsData;
}

function PersonalStatsTab({ data }: PersonalStatsTabProps) {
  const { stats, username, level, totalPower, resources } = data;

  return (
    <div className="space-y-6">
      {/* Player Overview */}
      <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-lg p-6 border border-blue-500/30">
        <h2 className="text-2xl font-bold text-blue-300 mb-4">⚔️ {username}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Level</div>
            <div className="text-2xl font-bold text-yellow-400">{level}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Total Power</div>
            <div className="text-2xl font-bold text-red-400">{totalPower.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Metal</div>
            <div className="text-2xl font-bold text-gray-300">{resources.metal.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Energy</div>
            <div className="text-2xl font-bold text-blue-400">{resources.energy.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Achievement Stats */}
      <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
        <h3 className="text-xl font-bold text-blue-300 mb-4">🏆 Achievements</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            icon="⚔️"
            label="Battles Won"
            value={stats.battlesWon}
            color="red"
          />
          <StatCard
            icon="🏭"
            label="Units Built"
            value={stats.totalUnitsBuilt}
            color="blue"
          />
          <StatCard
            icon="⛏️"
            label="Resources Gathered"
            value={stats.totalResourcesGathered}
            color="yellow"
          />
          <StatCard
            icon="🏦"
            label="Resources Banked"
            value={stats.totalResourcesBanked}
            color="green"
          />
          <StatCard
            icon="🛕"
            label="Shrine Trades"
            value={stats.shrineTradeCount}
            color="purple"
          />
          <StatCard
            icon="🗺️"
            label="Caves Explored"
            value={stats.cavesExplored}
            color="orange"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// GAME STATS TAB COMPONENT
// ============================================================

interface GameStatsTabProps {
  data: LeaderboardData;
  sortBy: string;
  onSort: (field: string) => void;
}

function GameStatsTab({ data, sortBy, onSort }: GameStatsTabProps) {
  const { topPlayers, gameStats } = data;

  return (
    <div className="space-y-6">
      {/* Global Statistics */}
      <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-lg p-6 border border-purple-500/30">
        <h2 className="text-2xl font-bold text-purple-300 mb-4">🌍 Global Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Total Players</div>
            <div className="text-2xl font-bold text-blue-400">{gameStats.totalPlayers.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Total Metal</div>
            <div className="text-2xl font-bold text-gray-300">{gameStats.totalMetal.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Total Energy</div>
            <div className="text-2xl font-bold text-blue-400">{gameStats.totalEnergy.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Average Level</div>
            <div className="text-2xl font-bold text-yellow-400">{gameStats.averageLevel.toFixed(1)}</div>
          </div>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
        <h3 className="text-lg font-semibold text-gray-300 mb-3">Sort By:</h3>
        <div className="flex flex-wrap gap-2">
          <SortButton
            label="⚡ Top Power"
            field="totalPower"
            active={sortBy === 'totalPower'}
            onClick={() => onSort('totalPower')}
          />
          <SortButton
            label="🎖️ Top Level"
            field="level"
            active={sortBy === 'level'}
            onClick={() => onSort('level')}
          />
          <SortButton
            label="⚙️ Top Metal"
            field="resources.metal"
            active={sortBy === 'resources.metal'}
            onClick={() => onSort('resources.metal')}
          />
          <SortButton
            label="⚡ Top Energy"
            field="resources.energy"
            active={sortBy === 'resources.energy'}
            onClick={() => onSort('resources.energy')}
          />
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
        <h3 className="text-xl font-bold text-blue-300 mb-4">🏆 Top 10 Players</h3>
        <div className="space-y-2">
          {topPlayers.map((player, index) => (
            <LeaderboardRow
              key={player._id}
              player={player}
              rank={index + 1}
              sortBy={sortBy}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ECONOMY TAB COMPONENT
// ============================================================

function EconomyTab() {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-green-900/50 to-blue-900/50 rounded-lg p-6 border border-green-500/30">
        <h2 className="text-2xl font-bold text-green-300 mb-4">💰 Economy Statistics</h2>
        <div className="text-gray-400 text-center py-12">
          <p className="text-xl mb-2">🚧 Coming Soon</p>
          <p>Economy tracking and auction house statistics will be available here.</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// HELPER COMPONENTS
// ============================================================

interface StatCardProps {
  icon: string;
  label: string;
  value: number;
  color: string;
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  const colorClasses = {
    red: 'text-red-400',
    blue: 'text-blue-400',
    yellow: 'text-yellow-400',
    green: 'text-green-400',
    purple: 'text-purple-400',
    orange: 'text-orange-400',
  };

  return (
    <div className="bg-gray-700/50 rounded-lg p-4 hover:bg-gray-700/70 transition-colors">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-gray-300 font-medium">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${colorClasses[color as keyof typeof colorClasses] || 'text-white'}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

interface SortButtonProps {
  label: string;
  field: string;
  active: boolean;
  onClick: () => void;
}

function SortButton({ label, field, active, onClick }: SortButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg font-semibold transition-all ${
        active
          ? 'bg-blue-600 text-white shadow-lg'
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );
}

interface LeaderboardRowProps {
  player: LeaderboardPlayer;
  rank: number;
  sortBy: string;
}

function LeaderboardRow({ player, rank, sortBy }: LeaderboardRowProps) {
  const getRankIcon = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  const getHighlightedValue = () => {
    if (sortBy === 'totalPower') return player.totalPower?.toLocaleString() ?? '0';
    if (sortBy === 'level') return player.level?.toLocaleString() ?? '0';
    if (sortBy === 'resources.metal') return player.resources?.metal?.toLocaleString() ?? '0';
    if (sortBy === 'resources.energy') return player.resources?.energy?.toLocaleString() ?? '0';
    return player.totalPower?.toLocaleString() ?? '0';
  };

  return (
    <div className="bg-gray-700/50 rounded-lg p-4 hover:bg-gray-700/70 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-2xl font-bold w-12 text-center">
            {getRankIcon(rank)}
          </span>
          <div>
            <div className="font-bold text-lg text-blue-300">{player.username}</div>
            <div className="text-sm text-gray-400">
              Level {player.level ?? 0} • Power: {player.totalPower?.toLocaleString() ?? '0'}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-yellow-400">{getHighlightedValue()}</div>
          <div className="text-sm text-gray-400">
            {sortBy === 'totalPower' && 'Power'}
            {sortBy === 'level' && 'Level'}
            {sortBy === 'resources.metal' && 'Metal'}
            {sortBy === 'resources.energy' && 'Energy'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Three-tab interface: Personal Stats, Game Stats, Economy
// - Personal tab fetches from /api/player/stats
// - Game tab fetches from /api/stats with sort parameter
// - Uses only metal and energy resources (ECHO compliant)
// - Optional chaining (?.) for all data access
// - Responsive grid layouts for stats display
// - Auto-closes when player moves (handled by GameLayout)
// ============================================================
// END OF FILE
// ============================================================
