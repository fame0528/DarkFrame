/**
 * @file app/game/shrine/page.tsx
 * @created 2025-10-17
 * @overview Shrine page for activating gathering buffs by sacrificing items
 * 
 * OVERVIEW:
 * Full-page shrine interface for buff management.
 * Players sacrifice collected items to activate gathering boost buffs.
 * 4 buff types (Spade/Heart/Diamond/Club) that stack for maximum efficiency.
 * Buff stacking: 1=+10%, 2=+25%, 3=+45%, 4=+75% gathering bonus.
 * Max 8 hours per buff type.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameContext } from '@/context/GameContext';
import { BackButton } from '@/components';
import { InventoryItem } from '@/types';

interface BuffStatus {
  type: 'spade' | 'heart' | 'diamond' | 'club';
  expiresAt: Date | null;
  timeRemaining: string;
}

export default function ShrinePage() {
  const router = useRouter();
  const { player, refreshPlayer } = useGameContext();
  const [buffs, setBuffs] = useState<BuffStatus[]>([
    { type: 'spade', expiresAt: null, timeRemaining: '0h 0m' },
    { type: 'heart', expiresAt: null, timeRemaining: '0h 0m' },
    { type: 'diamond', expiresAt: null, timeRemaining: '0h 0m' },
    { type: 'club', expiresAt: null, timeRemaining: '0h 0m' }
  ]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedBuff, setSelectedBuff] = useState<'spade' | 'heart' | 'diamond' | 'club' | null>(null);
  const [donateAmount, setDonateAmount] = useState(5);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');

  // Redirect if not logged in
  useEffect(() => {
    if (!player) {
      router.push('/login');
    }
  }, [player, router]);

  // Fetch shrine data
  useEffect(() => {
    if (!player?.username) return;

    const username = player.username; // Capture for null-safety

    async function fetchShrineData() {
      try {
        // Fetch player's active buffs and inventory
        const response = await fetch(`/api/shrine/status?username=${encodeURIComponent(username)}`);
        
        if (!response.ok) {
          console.error('Failed to fetch shrine data: HTTP', response.status);
          return;
        }
        
        const data = await response.json();

        if (data.success) {
          // Update buff status
          const now = new Date();
          const updatedBuffs = buffs.map(buff => {
            const activeBuff = data.activeBuffs.find((b: any) => b.type === buff.type);
            if (activeBuff && new Date(activeBuff.expiresAt) > now) {
              return {
                ...buff,
                expiresAt: new Date(activeBuff.expiresAt),
                timeRemaining: calculateTimeRemaining(new Date(activeBuff.expiresAt))
              };
            }
            return buff;
          });
          setBuffs(updatedBuffs);
          setInventory(data.availableItems || []);
        }
      } catch (error) {
        console.error('Failed to fetch shrine data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchShrineData();
  }, [player]);

  // Update timers every second
  useEffect(() => {
    const interval = setInterval(() => {
      setBuffs(prevBuffs => prevBuffs.map(buff => {
        if (buff.expiresAt) {
          const timeLeft = calculateTimeRemaining(buff.expiresAt);
          if (timeLeft === '0h 0m') {
            return { ...buff, expiresAt: null, timeRemaining: '0h 0m' };
          }
          return { ...buff, timeRemaining: timeLeft };
        }
        return buff;
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Calculate time remaining
  const calculateTimeRemaining = (expiresAt: Date): string => {
    const now = new Date();
    const timeLeft = expiresAt.getTime() - now.getTime();

    if (timeLeft <= 0) return '0h 0m';

    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  // Calculate total gathering bonus
  const calculateGatheringBonus = (): number => {
    const activeCount = buffs.filter(b => b.expiresAt && new Date(b.expiresAt) > new Date()).length;
    
    switch (activeCount) {
      case 1: return 10;
      case 2: return 25;
      case 3: return 45;
      case 4: return 75;
      default: return 0;
    }
  };

  // Handle quick donate
  const handleQuickDonate = async (duration: 30 | 60) => {
    if (!player || processing) return;

    setProcessing(true);
    setMessage('');

    try {
      const response = await fetch('/api/shrine/donate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: player.username,
          duration,
          allBuffs: true
        })
      });

      const data = await response.json();

      if (data.success) {
        setMessage(`✅ ${data.message}`);
        await refreshPlayer();
        // Reload shrine data
        window.location.reload();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to donate:', error);
      setMessage('❌ Failed to activate buffs. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  // Handle specific buff donation
  const handleSpecificDonate = async () => {
    if (!player || !selectedBuff || processing) return;

    setProcessing(true);
    setMessage('');

    try {
      const response = await fetch('/api/shrine/donate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: player.username,
          buffType: selectedBuff,
          itemCount: donateAmount
        })
      });

      const data = await response.json();

      if (data.success) {
        setMessage(`✅ ${data.message}`);
        setSelectedBuff(null);
        await refreshPlayer();
        // Reload shrine data
        window.location.reload();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to donate:', error);
      setMessage('❌ Failed to activate buff. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  // Get buff icon
  const getBuffIcon = (type: string): string => {
    switch (type) {
      case 'spade': return '♠️';
      case 'heart': return '♥️';
      case 'diamond': return '♦️';
      case 'club': return '♣️';
      default: return '🎴';
    }
  };

  // Get buff color
  const getBuffColor = (type: string): string => {
    switch (type) {
      case 'spade': return 'border-gray-500 bg-gray-800';
      case 'heart': return 'border-red-500 bg-red-900';
      case 'diamond': return 'border-blue-500 bg-blue-900';
      case 'club': return 'border-green-500 bg-green-900';
      default: return 'border-gray-500 bg-gray-800';
    }
  };

  if (!player || loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-2xl">Loading...</div>
      </div>
    );
  }

  const totalBonus = calculateGatheringBonus();
  const totalItems = inventory.length;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-purple-400">Shrine of Power</h1>
          <p className="text-sm text-gray-400">Sacrifice items for gathering boosts</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Current Bonus Display */}
        <div className="bg-gradient-to-r from-purple-900 to-indigo-900 rounded-lg p-6 mb-6 border-2 border-purple-600">
          <div className="text-center">
            <div className="text-sm text-gray-300 mb-2">Active Gathering Bonus</div>
            <div className="text-5xl font-bold text-yellow-400 mb-2">+{totalBonus}%</div>
            <div className="text-xs text-gray-400">
              {totalBonus === 0 ? 'No active buffs' : 
               totalBonus === 10 ? '1 buff active - Activate more for better bonuses!' :
               totalBonus === 25 ? '2 buffs active - Getting better!' :
               totalBonus === 45 ? '3 buffs active - Almost maxed!' :
               '4 buffs active - MAXIMUM EFFICIENCY!'}
            </div>
          </div>
        </div>

        {/* Message Display */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.startsWith('✅') ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'
          }`}>
            {message}
          </div>
        )}

        {/* Active Gathering Buffs */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 text-purple-400">🔥 Active Gathering Buffs</h2>
          <div className="text-xs text-gray-400 mb-4">
            Player buffs are limited to 8 hours. Visit often to renew (best at active).
            <br />Each item adds 2 minutes. Active buffs boost gathering!
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {buffs.map(buff => {
              const isActive = buff.expiresAt && new Date(buff.expiresAt) > new Date();
              
              return (
                <div
                  key={buff.type}
                  className={`
                    rounded-lg p-6 border-2 text-center transition-all
                    ${getBuffColor(buff.type)}
                    ${isActive ? 'shadow-lg' : 'opacity-50'}
                  `}
                >
                  <div className="text-4xl mb-2">{getBuffIcon(buff.type)}</div>
                  <div className="text-sm font-bold capitalize mb-2">{buff.type}</div>
                  <div className={`text-2xl font-bold ${isActive ? 'text-green-400' : 'text-red-400'}`}>
                    {buff.timeRemaining}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Offer Items */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 text-yellow-400">🎁 Offer Items</h2>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-400">Available Items</div>
            <div className="text-2xl font-bold text-blue-400">{totalItems} total items</div>
          </div>

          {/* Item types display (simplified for now) */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-center text-sm">
              <div>
                <div className="text-gray-400">Bear Skin</div>
                <div className="font-bold">(x0)</div>
              </div>
              <div>
                <div className="text-gray-400">Bat Skin</div>
                <div className="font-bold">(x0)</div>
              </div>
              <div>
                <div className="text-gray-400">Bat Skin</div>
                <div className="font-bold">(x0)</div>
              </div>
              <div>
                <div className="text-gray-400">Trout</div>
                <div className="font-bold">(x11)</div>
              </div>
              <div>
                <div className="text-gray-400">Salmon</div>
                <div className="font-bold">(x410)</div>
              </div>
              <div>
                <div className="text-gray-400">Discus</div>
                <div className="font-bold">(x290)</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Donate */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-bold mb-4 text-cyan-400">Quick Donate (All Suits)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => handleQuickDonate(30)}
              disabled={processing || totalItems < 60}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:opacity-50 rounded-lg p-4 transition-colors"
            >
              <div className="text-lg font-bold">+30 min each</div>
              <div className="text-sm text-gray-300">(60 items)</div>
            </button>
            <button
              onClick={() => handleQuickDonate(60)}
              disabled={processing || totalItems < 170}
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:opacity-50 rounded-lg p-4 transition-colors"
            >
              <div className="text-lg font-bold">+1 hour each</div>
              <div className="text-sm text-gray-300">(170 items)</div>
            </button>
          </div>
        </div>

        {/* Select Specific Suit */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-bold mb-4 text-pink-400">Or Select Specific Suit</h3>
          
          {/* Suit Selection */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {buffs.map(buff => (
              <button
                key={buff.type}
                onClick={() => setSelectedBuff(buff.type)}
                className={`
                  rounded-lg p-4 border-2 transition-all
                  ${selectedBuff === buff.type ? 'ring-4 ring-yellow-400' : ''}
                  ${getBuffColor(buff.type)}
                `}
              >
                <div className="text-3xl mb-2">{getBuffIcon(buff.type)}</div>
                <div className="text-sm font-bold capitalize">{buff.type}</div>
              </button>
            ))}
          </div>

          {/* Amount Selection */}
          {selectedBuff && (
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-3">Amount</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[5, 10, 30, 60].map(amount => (
                  <button
                    key={amount}
                    onClick={() => setDonateAmount(amount)}
                    className={`
                      px-6 py-3 rounded-lg font-bold transition-all
                      ${donateAmount === amount 
                        ? 'bg-yellow-600 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}
                    `}
                  >
                    Give {amount}
                  </button>
                ))}
              </div>
              
              <button
                onClick={handleSpecificDonate}
                disabled={processing || totalItems < donateAmount}
                className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-bold transition-colors"
              >
                {processing ? 'Activating...' : `Activate ${selectedBuff.toUpperCase()} Buff (+${donateAmount * 2} minutes)`}
              </button>
            </div>
          )}
        </div>

        {/* Back Button */}
        <div className="flex justify-center">
          <BackButton />
        </div>
      </main>
    </div>
  );
}

// ============================================================
// END OF FILE
// Implementation Notes:
// - 4 buff types with stacking bonuses (1=10%, 2=25%, 3=45%, 4=75%)
// - Max 8 hours per buff
// - Quick donate buttons for all buffs
// - Specific buff selection with amount controls
// - Real-time countdown timers
// - Inline confirmation (no system popups)
// ============================================================
