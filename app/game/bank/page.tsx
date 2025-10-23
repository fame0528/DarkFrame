/**
 * Bank Page
 * Full-page banking system for resource management
 * 
 * Created: 2025-10-17
 * 
 * OVERVIEW:
 * Full-page replacement for BankPanel modal. Provides secure resource storage with:
 * - Three tabs: Deposit, Withdraw, Exchange
 * - Prominent display of current and banked resources
 * - Large input fields with validation
 * - Clear action buttons
 * - Transaction history (if API supports)
 * - Back button navigation to /game
 * 
 * Features:
 * - Tab-based interface for different operations
 * - Real-time resource display with comma formatting
 * - Input validation and error handling
 * - Success/error messaging inline
 * - Responsive design
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameContext } from '@/context/GameContext';
import { BackButton } from '@/components';

type TabType = 'deposit' | 'withdraw' | 'exchange';
type ResourceType = 'metal' | 'energy';

interface BankData {
  currentMetal: number;
  currentEnergy: number;
  bankedMetal: number;
  bankedEnergy: number;
}

export default function BankPage() {
  const router = useRouter();
  const { player, refreshPlayer } = useGameContext();
  const [activeTab, setActiveTab] = useState<TabType>('deposit');
  const [bankData, setBankData] = useState<BankData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Input states
  const [metalAmount, setMetalAmount] = useState('');
  const [energyAmount, setEnergyAmount] = useState('');
  const [exchangeFromResource, setExchangeFromResource] = useState<ResourceType>('metal');
  const [exchangeAmount, setExchangeAmount] = useState('');
  
  // UI states
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!player) {
      router.push('/login');
      return;
    }

    const username = player.username;

    const fetchBankData = async () => {
      try {
        const response = await fetch(`/api/bank/status?username=${username}`);
        if (response.ok) {
          const data = await response.json();
          setBankData(data);
        }
      } catch (error) {
        console.error('Failed to fetch bank data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBankData();
  }, [player, router]);

  const handleDeposit = async () => {
    if (!player || !bankData) return;

    const metal = parseInt(metalAmount) || 0;
    const energy = parseInt(energyAmount) || 0;

    if (metal <= 0 && energy <= 0) {
      setMessage({ type: 'error', text: 'Enter an amount to deposit' });
      return;
    }

    if (metal > bankData.currentMetal || energy > bankData.currentEnergy) {
      setMessage({ type: 'error', text: 'Insufficient resources' });
      return;
    }

    setProcessing(true);
    setMessage(null);

    try {
      const response = await fetch('/api/bank/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: player.username,
          metal,
          energy,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: data.message || 'Deposit successful' });
        setBankData(data.bankData);
        setMetalAmount('');
        setEnergyAmount('');
        refreshPlayer();
      } else {
        setMessage({ type: 'error', text: data.error || 'Deposit failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setProcessing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!player || !bankData) return;

    const metal = parseInt(metalAmount) || 0;
    const energy = parseInt(energyAmount) || 0;

    if (metal <= 0 && energy <= 0) {
      setMessage({ type: 'error', text: 'Enter an amount to withdraw' });
      return;
    }

    if (metal > bankData.bankedMetal || energy > bankData.bankedEnergy) {
      setMessage({ type: 'error', text: 'Insufficient banked resources' });
      return;
    }

    setProcessing(true);
    setMessage(null);

    try {
      const response = await fetch('/api/bank/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: player.username,
          metal,
          energy,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: data.message || 'Withdrawal successful' });
        setBankData(data.bankData);
        setMetalAmount('');
        setEnergyAmount('');
        refreshPlayer();
      } else {
        setMessage({ type: 'error', text: data.error || 'Withdrawal failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setProcessing(false);
    }
  };

  const handleExchange = async () => {
    if (!player || !bankData) return;

    const amount = parseInt(exchangeAmount) || 0;

    if (amount <= 0) {
      setMessage({ type: 'error', text: 'Enter an amount to exchange' });
      return;
    }

    const hasEnough =
      exchangeFromResource === 'metal'
        ? amount <= bankData.currentMetal
        : amount <= bankData.currentEnergy;

    if (!hasEnough) {
      setMessage({ type: 'error', text: 'Insufficient resources' });
      return;
    }

    setProcessing(true);
    setMessage(null);

    try {
      const response = await fetch('/api/bank/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: player.username,
          fromResource: exchangeFromResource,
          amount,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: data.message || 'Exchange successful' });
        setBankData(data.bankData);
        setExchangeAmount('');
        refreshPlayer();
      } else {
        setMessage({ type: 'error', text: data.error || 'Exchange failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setProcessing(false);
    }
  };

  const setMaxAmount = (resource: 'metal' | 'energy', action: 'deposit' | 'withdraw') => {
    if (!bankData) return;

    if (action === 'deposit') {
      if (resource === 'metal') {
        setMetalAmount(bankData.currentMetal.toString());
      } else {
        setEnergyAmount(bankData.currentEnergy.toString());
      }
    } else {
      if (resource === 'metal') {
        setMetalAmount(bankData.bankedMetal.toString());
      } else {
        setEnergyAmount(bankData.bankedEnergy.toString());
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-xl">Loading bank...</p>
      </div>
    );
  }

  if (!bankData) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-xl">Failed to load bank data</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <BackButton />
          <h1 className="text-4xl font-bold mt-4">Bank</h1>
        </div>

        {/* Resource Display */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Current Resources */}
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-xl font-semibold mb-4">Current Resources</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-orange-400 text-lg">Metal:</span>
                <span className="text-2xl font-bold">
                  {bankData.currentMetal.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cyan-400 text-lg">Energy:</span>
                <span className="text-2xl font-bold">
                  {bankData.currentEnergy.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Banked Resources */}
          <div className="bg-gray-800 p-6 rounded-lg border border-green-600">
            <h3 className="text-xl font-semibold mb-4 text-green-400">Banked Resources</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-orange-400 text-lg">Metal:</span>
                <span className="text-2xl font-bold text-green-400">
                  {bankData.bankedMetal.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cyan-400 text-lg">Energy:</span>
                <span className="text-2xl font-bold text-green-400">
                  {bankData.bankedEnergy.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => {
              setActiveTab('deposit');
              setMessage(null);
            }}
            className={`px-6 py-3 rounded-t-lg font-semibold transition-colors ${
              activeTab === 'deposit'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Deposit
          </button>
          <button
            onClick={() => {
              setActiveTab('withdraw');
              setMessage(null);
            }}
            className={`px-6 py-3 rounded-t-lg font-semibold transition-colors ${
              activeTab === 'withdraw'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Withdraw
          </button>
          <button
            onClick={() => {
              setActiveTab('exchange');
              setMessage(null);
            }}
            className={`px-6 py-3 rounded-t-lg font-semibold transition-colors ${
              activeTab === 'exchange'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Exchange
          </button>
        </div>

        {/* Tab Content */}
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          {/* Message Display */}
          {message && (
            <div
              className={`mb-4 p-4 rounded ${
                message.type === 'success'
                  ? 'bg-green-900/50 border border-green-600 text-green-400'
                  : 'bg-red-900/50 border border-red-600 text-red-400'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Deposit Tab */}
          {activeTab === 'deposit' && (
            <div className="space-y-6">
              <p className="text-gray-300">
                Store resources safely in the bank to protect them from raids.
              </p>

              <div className="space-y-4">
                {/* Metal Input */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Metal Amount
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={metalAmount}
                      onChange={(e) => setMetalAmount(e.target.value)}
                      placeholder="0"
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-4 py-3 text-lg focus:outline-none focus:border-blue-500"
                      min="0"
                      max={bankData.currentMetal}
                    />
                    <button
                      onClick={() => setMaxAmount('metal', 'deposit')}
                      className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded font-semibold"
                    >
                      Max
                    </button>
                  </div>
                </div>

                {/* Energy Input */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Energy Amount
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={energyAmount}
                      onChange={(e) => setEnergyAmount(e.target.value)}
                      placeholder="0"
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-4 py-3 text-lg focus:outline-none focus:border-blue-500"
                      min="0"
                      max={bankData.currentEnergy}
                    />
                    <button
                      onClick={() => setMaxAmount('energy', 'deposit')}
                      className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded font-semibold"
                    >
                      Max
                    </button>
                  </div>
                </div>

                {/* Deposit Button */}
                <button
                  onClick={handleDeposit}
                  disabled={processing}
                  className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-lg font-semibold transition-colors"
                >
                  {processing ? 'Processing...' : 'Deposit Resources'}
                </button>
              </div>
            </div>
          )}

          {/* Withdraw Tab */}
          {activeTab === 'withdraw' && (
            <div className="space-y-6">
              <p className="text-gray-300">
                Withdraw resources from your bank storage to use them.
              </p>

              <div className="space-y-4">
                {/* Metal Input */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Metal Amount
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={metalAmount}
                      onChange={(e) => setMetalAmount(e.target.value)}
                      placeholder="0"
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-4 py-3 text-lg focus:outline-none focus:border-blue-500"
                      min="0"
                      max={bankData.bankedMetal}
                    />
                    <button
                      onClick={() => setMaxAmount('metal', 'withdraw')}
                      className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded font-semibold"
                    >
                      Max
                    </button>
                  </div>
                </div>

                {/* Energy Input */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Energy Amount
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={energyAmount}
                      onChange={(e) => setEnergyAmount(e.target.value)}
                      placeholder="0"
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-4 py-3 text-lg focus:outline-none focus:border-blue-500"
                      min="0"
                      max={bankData.bankedEnergy}
                    />
                    <button
                      onClick={() => setMaxAmount('energy', 'withdraw')}
                      className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded font-semibold"
                    >
                      Max
                    </button>
                  </div>
                </div>

                {/* Withdraw Button */}
                <button
                  onClick={handleWithdraw}
                  disabled={processing}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-lg font-semibold transition-colors"
                >
                  {processing ? 'Processing...' : 'Withdraw Resources'}
                </button>
              </div>
            </div>
          )}

          {/* Exchange Tab */}
          {activeTab === 'exchange' && (
            <div className="space-y-6">
              <p className="text-gray-300">
                Exchange one resource for another at the current market rate.
              </p>

              <div className="space-y-4">
                {/* Resource Selection */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Exchange From
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setExchangeFromResource('metal')}
                      className={`flex-1 py-3 rounded font-semibold ${
                        exchangeFromResource === 'metal'
                          ? 'bg-orange-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Metal
                    </button>
                    <button
                      onClick={() => setExchangeFromResource('energy')}
                      className={`flex-1 py-3 rounded font-semibold ${
                        exchangeFromResource === 'energy'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Energy
                    </button>
                  </div>
                </div>

                {/* Amount Input */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Amount to Exchange
                  </label>
                  <input
                    type="number"
                    value={exchangeAmount}
                    onChange={(e) => setExchangeAmount(e.target.value)}
                    placeholder="0"
                    className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-3 text-lg focus:outline-none focus:border-blue-500"
                    min="0"
                  />
                  <p className="text-sm text-gray-400 mt-2">
                    Exchange rate: 1:1 (may vary based on market conditions)
                  </p>
                </div>

                {/* Exchange Button */}
                <button
                  onClick={handleExchange}
                  disabled={processing}
                  className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-lg font-semibold transition-colors"
                >
                  {processing ? 'Processing...' : `Exchange ${exchangeFromResource} for ${exchangeFromResource === 'metal' ? 'energy' : 'metal'}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
