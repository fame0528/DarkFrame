/**
 * @file app/game/unit-factory/page.tsx
 * @created 2025-10-17
 * @overview Unit factory page for building military units
 * 
 * OVERVIEW:
 * Full-page unit factory interface matching reference design.
 * Players can build STR and DEF units using metal and energy resources.
 * Features confirmation modal (not system alert) before building.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameContext } from '@/context/GameContext';
import { BackButton, StatsPanel, ControlsPanel } from '@/components';
import GameLayout from '@/components/GameLayout';
import TopNavBar from '@/components/TopNavBar';
import { UNIT_BLUEPRINTS, UnitBlueprint, UnitCategory, UnitRarity } from '@/types/units.types';

interface UnitWithStatus extends UnitBlueprint {
  isUnlocked: boolean;
  playerOwned: number;
}

interface PlayerStats {
  level: number;
  researchPoints: number;
  resources: { metal: number; energy: number };
  totalStrength: number;
  totalDefense: number;
  availableSlots: number;
  usedSlots: number;
}

export default function UnitFactoryPage() {
  const router = useRouter();
  const { player, refreshPlayer } = useGameContext();
  const [units, setUnits] = useState<UnitWithStatus[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [activeTab, setActiveTab] = useState<'strength' | 'defense'>('strength');
  const [selectedUnit, setSelectedUnit] = useState<UnitWithStatus | null>(null);
  const [buildQuantity, setBuildQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [message, setMessage] = useState('');

  // Redirect if not logged in
  useEffect(() => {
    if (!player) {
      router.push('/login');
    }
  }, [player, router]);

  // Fetch available units and player stats
  useEffect(() => {
    if (!player) return;

    const username = player.username; // Capture for null-safety

    async function fetchUnits() {
      try {
        const response = await fetch(`/api/player/build-unit?username=${username}`);
        const data = await response.json();

        if (data.success) {
          setUnits(data.units);
          setPlayerStats(data.playerStats);
        }
      } catch (error) {
        console.error('Failed to fetch units:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchUnits();
  }, [player]);

  // Filter units by active tab
  const filteredUnits = units.filter(unit => 
    activeTab === 'strength' 
      ? unit.category === UnitCategory.Strength 
      : unit.category === UnitCategory.Defense
  );

  // Get rarity stars
  const getRarityStars = (rarity: UnitRarity): string => {
    return '⭐'.repeat(rarity);
  };

  // Get rarity color
  const getRarityColor = (rarity: UnitRarity): string => {
    switch (rarity) {
      case UnitRarity.Common: return 'text-gray-400';
      case UnitRarity.Uncommon: return 'text-green-400';
      case UnitRarity.Rare: return 'text-blue-400';
      case UnitRarity.Epic: return 'text-purple-400';
      case UnitRarity.Legendary: return 'text-yellow-400';
    }
  };

  // Get rarity border
  const getRarityBorder = (rarity: UnitRarity): string => {
    switch (rarity) {
      case UnitRarity.Common: return 'border-gray-600';
      case UnitRarity.Uncommon: return 'border-green-600';
      case UnitRarity.Rare: return 'border-blue-600';
      case UnitRarity.Epic: return 'border-purple-600';
      case UnitRarity.Legendary: return 'border-yellow-600';
    }
  };

  // Handle unit card click
  const handleUnitClick = (unit: UnitWithStatus) => {
    if (!unit.isUnlocked) return;
    setSelectedUnit(unit);
    setBuildQuantity(1);
    setMessage('');
  };

  // Handle build confirmation
  const handleBuild = async () => {
    if (!selectedUnit || !player) return;

    setBuilding(true);
    setMessage('');

    try {
      const response = await fetch('/api/player/build-unit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: player.username,
          unitTypeId: selectedUnit.id,
          quantity: buildQuantity
        })
      });

      const data = await response.json();

      if (data.success) {
        setMessage(`✅ ${data.message}`);
        setSelectedUnit(null);
        
        // Refresh player data and unit list
        await refreshPlayer();
        
        // Reload units to update owned counts
        const unitsResponse = await fetch(`/api/player/build-unit?username=${player.username}`);
        const unitsData = await unitsResponse.json();
        if (unitsData.success) {
          setUnits(unitsData.units);
          setPlayerStats(unitsData.playerStats);
        }
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to build unit:', error);
      setMessage('❌ Failed to build unit. Please try again.');
    } finally {
      setBuilding(false);
    }
  };

  if (!player || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
        <div className="text-white text-2xl">Loading...</div>
      </div>
    );
  }

  if (!playerStats) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
        <div className="text-white text-2xl">Failed to load unit factory</div>
      </div>
    );
  }

  const totalCost = selectedUnit ? {
    metal: selectedUnit.metalCost * buildQuantity,
    energy: selectedUnit.energyCost * buildQuantity
  } : null;

  return (
    <>
      <TopNavBar />
      <GameLayout
        statsPanel={<StatsPanel />}
        controlsPanel={<ControlsPanel />}
        tileView={
          <div className="h-full w-full overflow-auto bg-gradient-to-b from-gray-900 to-black">
            {/* Header */}
            <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
            <div className="flex items-center justify-between w-full">
              <div>
                <h1 className="text-3xl font-bold text-blue-400">Unit Factory</h1>
                <p className="text-sm text-gray-400">Build and manage your military forces</p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-sm text-gray-400">Army Tier</div>
                  <div className="text-2xl font-bold text-blue-400">
                    {Math.max(playerStats.totalStrength, playerStats.totalDefense).toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">Available Slots</div>
                  <div className="text-2xl font-bold text-green-400">
                    {(playerStats.availableSlots - playerStats.usedSlots).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="w-full px-6 py-8">
        {/* Resources Display */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-gray-400">Metal</div>
              <div className="text-2xl font-bold text-orange-400">
                {playerStats.resources.metal.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Energy</div>
              <div className="text-2xl font-bold text-cyan-400">
                {playerStats.resources.energy.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Total Strength</div>
              <div className="text-2xl font-bold text-red-400">
                {playerStats.totalStrength.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Total Defense</div>
              <div className="text-2xl font-bold text-blue-400">
                {playerStats.totalDefense.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('strength')}
            className={`px-8 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'strength'
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            ⚔️ Strength Units
          </button>
          <button
            onClick={() => setActiveTab('defense')}
            className={`px-8 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'defense'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            🛡️ Defense Units
          </button>
        </div>

        {/* Message Display */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.startsWith('✅') ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'
          }`}>
            {message}
          </div>
        )}

        {/* Unit Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {filteredUnits.map(unit => {
            const statValue = unit.category === UnitCategory.Strength ? unit.strength : unit.defense;
            
            return (
              <button
                key={unit.id}
                onClick={() => handleUnitClick(unit)}
                disabled={!unit.isUnlocked}
                className={`
                  relative bg-gray-800 rounded-lg p-4 border-2 transition-all
                  ${unit.isUnlocked ? 'hover:bg-gray-700 cursor-pointer' : 'opacity-50 cursor-not-allowed'}
                  ${getRarityBorder(unit.rarity)}
                `}
              >
                {/* Rarity Stars */}
                <div className={`text-xs mb-2 ${getRarityColor(unit.rarity)}`}>
                  {getRarityStars(unit.rarity)}
                </div>

                {/* Unit Name */}
                <div className="font-bold text-lg mb-2">{unit.name}</div>

                {/* Stat Value */}
                <div className="text-3xl font-bold mb-2 text-yellow-400">
                  {statValue.toLocaleString()}
                </div>

                {/* Costs */}
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm">
                    <span className="text-orange-400">{unit.metalCost.toLocaleString()}</span>
                    <span className="text-gray-500"> metal</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-cyan-400">{unit.energyCost.toLocaleString()}</span>
                    <span className="text-gray-500"> energy</span>
                  </div>
                </div>

                {/* Owned Count */}
                {unit.playerOwned > 0 && (
                  <div className="text-xs text-green-400 mb-2">
                    Owned: {unit.playerOwned}
                  </div>
                )}

                {/* Lock Status */}
                {!unit.isUnlocked && unit.unlockRequirement && (
                  <div className="text-xs text-red-400 mt-2">
                    🔒 Requires {unit.unlockRequirement.researchPoints} RP
                    {unit.unlockRequirement.level && ` & Lvl ${unit.unlockRequirement.level}`}
                  </div>
                )}

                {/* Description */}
                <div className="text-xs text-gray-400 mt-2">
                  {unit.description}
                </div>
              </button>
            );
          })}
        </div>

        {/* Back Button */}
        <div className="flex justify-center">
          <BackButton />
        </div>
      </main>

      {/* Confirmation Modal */}
      {selectedUnit && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full border-2 border-blue-600">
            <h2 className="text-2xl font-bold mb-4 text-blue-400">Confirm Build</h2>
            
            <div className="mb-6">
              <div className="text-xl font-bold mb-2">{selectedUnit.name}</div>
              <div className="text-sm text-gray-400 mb-4">{selectedUnit.description}</div>
              
              {/* Quantity Selector */}
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Quantity</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={buildQuantity}
                    onChange={(e) => setBuildQuantity(parseInt(e.target.value) || 1)}
                    className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                  <button
                    onClick={() => {
                      if (!playerStats || !selectedUnit) return;
                      const maxByMetal = Math.floor(playerStats.resources.metal / selectedUnit.metalCost);
                      const maxByEnergy = Math.floor(playerStats.resources.energy / selectedUnit.energyCost);
                      const remainingSlots = playerStats.availableSlots - playerStats.usedSlots;
                      const maxAffordable = Math.min(maxByMetal, maxByEnergy, remainingSlots, 100);
                      setBuildQuantity(Math.max(1, maxAffordable));
                    }}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition-colors"
                  >
                    Max
                  </button>
                </div>
              </div>

              {/* Total Cost */}
              {totalCost && (
                <div className="bg-gray-900 rounded-lg p-4 mb-4">
                  <div className="text-sm text-gray-400 mb-2">Total Cost</div>
                  <div className="flex justify-between mb-2">
                    <span className="text-orange-400">Metal:</span>
                    <span className="font-bold">{totalCost.metal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cyan-400">Energy:</span>
                    <span className="font-bold">{totalCost.energy.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Stats Gained */}
              <div className="bg-gray-900 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-2">Stats Gained</div>
                {selectedUnit.category === UnitCategory.Strength ? (
                  <div className="text-red-400 font-bold">
                    +{(selectedUnit.strength * buildQuantity).toLocaleString()} Strength
                  </div>
                ) : (
                  <div className="text-blue-400 font-bold">
                    +{(selectedUnit.defense * buildQuantity).toLocaleString()} Defense
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => setSelectedUnit(null)}
                disabled={building}
                className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBuild}
                disabled={building}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                {building ? 'Building...' : 'Confirm Build'}
              </button>
            </div>
          </div>
        </div>
      )}
          </div>
        }
      />
    </>
  );
}

// ============================================================
// END OF FILE
// Implementation Notes:
// - 4-column responsive grid layout
// - STR/DEF tabs for filtering
// - Rarity-based coloring and borders
// - Locked units show requirements
// - Confirmation modal (not system alert)
// - Real-time resource and stat updates
// ============================================================
