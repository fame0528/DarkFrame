/**
 * @file components/ShrinePanel.tsx
 * @created 2025-10-17
 * @overview Shrine interface for activating and extending gathering boosts
 * 
 * OVERVIEW:
 * Modal panel that displays when player is at the Shrine tile (1,1). Allows:
 * 1. Sacrifice tradeable items to activate gathering boosts
 * 2. Extend active boost durations up to 8-hour cap
 * 3. View active boost timers and total yield bonus
 * 
 * Four boost tiers (all provide +25% yield):
 * - Speed ♠️: 3 items, 1 hour
 * - Heart ♥️: 10 items, 1 hour  
 * - Diamond ♦️: 30 items, 4 hours
 * - Club ♣️: 60 items, 8 hours
 */

'use client';

import { useState, useEffect } from 'react';
import { ShrineBoost, ShrineBoostTier } from '@/types';

interface ShrinePanelProps {
  isOpen: boolean;
  onClose: () => void;
  tradeableItems: number;
  activeBoosts: ShrineBoost[];
  onTransaction: () => void;
}

interface BoostConfig {
  tier: ShrineBoostTier;
  name: string;
  icon: string;
  cost: number;
  duration: number; // hours
  yieldBonus: number;
}

const BOOST_CONFIGS: BoostConfig[] = [
  { tier: 'speed', name: 'Speed', icon: '♠️', cost: 3, duration: 1, yieldBonus: 0.25 },
  { tier: 'heart', name: 'Heart', icon: '♥️', cost: 10, duration: 1, yieldBonus: 0.25 },
  { tier: 'diamond', name: 'Diamond', icon: '♦️', cost: 30, duration: 4, yieldBonus: 0.25 },
  { tier: 'club', name: 'Club', icon: '♣️', cost: 60, duration: 8, yieldBonus: 0.25 }
];

export default function ShrinePanel({
  isOpen,
  onClose,
  tradeableItems,
  activeBoosts,
  onTransaction
}: ShrinePanelProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [extendAmount, setExtendAmount] = useState<Record<ShrineBoostTier, string>>({
    speed: '',
    heart: '',
    diamond: '',
    club: ''
  });
  const [timers, setTimers] = useState<Record<ShrineBoostTier, string>>({
    speed: '',
    heart: '',
    diamond: '',
    club: ''
  });

  // Update timers every second
  useEffect(() => {
    if (!isOpen) return;

    const updateTimers = () => {
      const now = new Date();
      const newTimers: Record<ShrineBoostTier, string> = {
        speed: '',
        heart: '',
        diamond: '',
        club: ''
      };

      activeBoosts.forEach(boost => {
        const expiresAt = new Date(boost.expiresAt);
        const timeLeft = expiresAt.getTime() - now.getTime();

        if (timeLeft > 0) {
          const hours = Math.floor(timeLeft / (1000 * 60 * 60));
          const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
          newTimers[boost.tier] = `${hours}h ${minutes}m`;
        }
      });

      setTimers(newTimers);
    };

    updateTimers();
    const interval = setInterval(updateTimers, 1000);

    return () => clearInterval(interval);
  }, [isOpen, activeBoosts]);

  if (!isOpen) return null;

  const getActiveBoost = (tier: ShrineBoostTier): ShrineBoost | undefined => {
    return activeBoosts.find(b => b.tier === tier);
  };

  const isBoostActive = (tier: ShrineBoostTier): boolean => {
    const boost = getActiveBoost(tier);
    if (!boost) return false;
    return new Date(boost.expiresAt) > new Date();
  };

  const getTotalYieldBonus = (): number => {
    const now = new Date();
    return activeBoosts
      .filter(boost => new Date(boost.expiresAt) > now)
      .reduce((sum, boost) => sum + boost.yieldBonus, 0);
  };

  const handleActivate = async (tier: ShrineBoostTier) => {
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/shrine/sacrifice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier })
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage(`✅ ${data.message}`);
        onTransaction();
      } else {
        setMessage(`❌ ${data.message || 'Activation failed'}`);
      }
    } catch (error) {
      setMessage('❌ Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleExtend = async (tier: ShrineBoostTier) => {
    const itemCount = parseInt(extendAmount[tier]);
    if (!itemCount || itemCount <= 0) {
      setMessage('❌ Enter a valid number of items');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/shrine/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, itemCount })
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage(`✅ ${data.message}`);
        setExtendAmount({ ...extendAmount, [tier]: '' });
        onTransaction();
      } else {
        setMessage(`❌ ${data.message || 'Extension failed'}`);
      }
    } catch (error) {
      setMessage('❌ Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-purple-900 border-2 border-purple-400 rounded-lg p-6 w-[700px] max-h-[700px] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-purple-300">
            ⛩️ Ancient Shrine of Power
          </h2>
          <button
            onClick={onClose}
            className="text-purple-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Status */}
        <div className="bg-purple-800/50 p-4 rounded mb-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-purple-300">Tradeable Items: <span className="text-white font-bold">{tradeableItems}</span></p>
              <p className="text-purple-300">Active Boosts: <span className="text-white font-bold">{activeBoosts.filter(b => new Date(b.expiresAt) > new Date()).length} / 4</span></p>
            </div>
            <div className="text-right">
              <p className="text-purple-300">Total Gathering Bonus:</p>
              <p className="text-yellow-400 text-2xl font-bold">+{(getTotalYieldBonus() * 100).toFixed(0)}%</p>
            </div>
          </div>
        </div>

        {/* Boost Cards */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {BOOST_CONFIGS.map(config => {
            const isActive = isBoostActive(config.tier);
            const activeBoost = getActiveBoost(config.tier);
            const canAfford = tradeableItems >= config.cost;

            return (
              <div
                key={config.tier}
                className={`border-2 rounded-lg p-4 ${
                  isActive
                    ? 'border-green-400 bg-green-900/30'
                    : 'border-purple-600 bg-purple-800/30'
                }`}
              >
                {/* Card Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-3xl">{config.icon}</span>
                    <div>
                      <h3 className="text-white font-bold">{config.name}</h3>
                      <p className="text-purple-300 text-sm">+{(config.yieldBonus * 100)}% Yield</p>
                    </div>
                  </div>
                  {isActive && (
                    <span className="bg-green-500 text-black px-2 py-1 rounded text-xs font-bold">
                      ACTIVE
                    </span>
                  )}
                </div>

                {/* Card Info */}
                <div className="space-y-2 mb-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-purple-300">Cost:</span>
                    <span className="text-white font-bold">{config.cost} items</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-purple-300">Duration:</span>
                    <span className="text-white font-bold">{config.duration}h</span>
                  </div>
                  {isActive && activeBoost && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-300">Time Left:</span>
                      <span className="text-green-400 font-bold">{timers[config.tier]}</span>
                    </div>
                  )}
                </div>

                {/* Activation Button */}
                {!isActive && (
                  <button
                    onClick={() => handleActivate(config.tier)}
                    disabled={loading || !canAfford}
                    className={`w-full py-2 px-4 rounded font-bold mb-2 ${
                      loading || !canAfford
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-purple-500 hover:bg-purple-600 text-white'
                    }`}
                  >
                    {canAfford ? '⛩️ Offer Tribute' : '❌ Not Enough Items'}
                  </button>
                )}

                {/* Extension Section */}
                {isActive && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={extendAmount[config.tier]}
                        onChange={(e) => setExtendAmount({ ...extendAmount, [config.tier]: e.target.value })}
                        className="flex-1 bg-purple-800 text-white px-2 py-1 rounded border border-purple-600 focus:border-purple-400 focus:outline-none text-sm"
                        placeholder="Items"
                        min="1"
                      />
                      <button
                        onClick={() => handleExtend(config.tier)}
                        disabled={loading || !extendAmount[config.tier] || parseInt(extendAmount[config.tier]) <= 0}
                        className={`px-3 py-1 rounded font-bold text-sm ${
                          loading || !extendAmount[config.tier] || parseInt(extendAmount[config.tier]) <= 0
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`}
                      >
                        Extend
                      </button>
                    </div>
                    <p className="text-purple-300 text-xs">
                      Max 8h total. Rarity affects time: Common +15m, Legendary +2h
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Message */}
        {message && (
          <div className={`p-3 rounded mb-4 ${
            message.includes('✅')
              ? 'bg-green-900/50 text-green-300'
              : 'bg-red-900/50 text-red-300'
          }`}>
            {message}
          </div>
        )}

        {/* Help Text */}
        <div className="bg-purple-800/30 p-3 rounded text-purple-200 text-sm space-y-1">
          <p>💡 <strong>Boost Mechanics:</strong></p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>All boosts provide +25% resource yield (stack additively)</li>
            <li>4 active boosts = 100% bonus = 2x gathering speed</li>
            <li>Each boost can run up to 8 hours total (including extensions)</li>
            <li>Higher tier = longer initial duration and better cost efficiency</li>
            <li>Item rarity affects extension time (sacrifice tradeable items)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
