/**
 * @file app/game/vip-upgrade/page.tsx
 * @created 2025-10-19
 * @overview VIP upgrade page showing benefits and pricing (no payment integration yet)
 */

'use client';

import { useGameContext } from '@/context/GameContext';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/BackButton';

export default function VIPUpgradePage() {
  const { player } = useGameContext();
  const router = useRouter();

  // Check if already VIP
  const isVIP = player?.isVIP || false;
  const vipExpiresAt = player?.vipExpiresAt;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white p-6">
      {/* Back Button */}
      <div className="max-w-6xl mx-auto mb-6">
        <BackButton destination="/game" />
      </div>

      {/* Hero Section */}
      <div className="max-w-6xl mx-auto text-center mb-12">
        <div className="inline-block bg-gradient-to-r from-yellow-400 via-orange-500 to-yellow-400 text-transparent bg-clip-text mb-4">
          <h1 className="text-5xl font-bold">⚡ VIP Membership ⚡</h1>
        </div>
        <p className="text-xl text-gray-300 max-w-2xl mx-auto">
          Unlock premium features and dominate the wasteland twice as fast
        </p>

        {/* Current Status */}
        {isVIP && vipExpiresAt && (
          <div className="mt-6 inline-block bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/50 rounded-lg px-6 py-3">
            <p className="text-yellow-300 font-semibold">
              ✅ You are currently a VIP member
            </p>
            <p className="text-sm text-gray-300 mt-1">
              Expires: {new Date(vipExpiresAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
        )}
      </div>

      {/* Speed Comparison */}
      <div className="max-w-6xl mx-auto mb-12">
        <h2 className="text-3xl font-bold text-center mb-8">⚡ Speed Comparison</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Basic Tier */}
          <div className="bg-gray-800/50 border border-purple-500/50 rounded-lg p-6">
            <div className="text-center mb-4">
              <span className="inline-block bg-purple-500/20 text-purple-300 px-4 py-2 rounded-full text-sm font-semibold">
                🐢 BASIC
              </span>
            </div>
            <div className="text-center mb-6">
              <p className="text-4xl font-bold text-purple-400">11.6 hours</p>
              <p className="text-gray-400 mt-2">Full map completion time</p>
            </div>
            <ul className="space-y-3">
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <span className="text-gray-300">Standard auto-farm speed</span>
              </li>
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <span className="text-gray-300">3-second harvest cooldown respect</span>
              </li>
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <span className="text-gray-300">Safe and reliable</span>
              </li>
            </ul>
          </div>

          {/* VIP Tier */}
          <div className="bg-gradient-to-br from-yellow-900/20 via-orange-900/20 to-yellow-900/20 border-2 border-yellow-500 rounded-lg p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-yellow-500 text-black px-3 py-1 text-xs font-bold">
              RECOMMENDED
            </div>
            <div className="text-center mb-4 mt-4">
              <span className="inline-block bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-4 py-2 rounded-full text-sm font-bold">
                ⚡ VIP
              </span>
            </div>
            <div className="text-center mb-6">
              <p className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 text-transparent bg-clip-text">
                5.6 hours
              </p>
              <p className="text-gray-300 mt-2 font-semibold">Full map completion time</p>
              <p className="text-yellow-400 text-sm mt-1">⚡ 2x FASTER ⚡</p>
            </div>
            <ul className="space-y-3">
              <li className="flex items-start">
                <span className="text-yellow-400 mr-2">✓</span>
                <span className="text-gray-200 font-semibold">2x speed boost</span>
              </li>
              <li className="flex items-start">
                <span className="text-yellow-400 mr-2">✓</span>
                <span className="text-gray-200 font-semibold">Optimized timing algorithms</span>
              </li>
              <li className="flex items-start">
                <span className="text-yellow-400 mr-2">✓</span>
                <span className="text-gray-200 font-semibold">Exclusive VIP badge</span>
              </li>
              <li className="flex items-start">
                <span className="text-yellow-400 mr-2">✓</span>
                <span className="text-gray-200 font-semibold">Priority support</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Feature Comparison Table */}
      <div className="max-w-6xl mx-auto mb-12">
        <h2 className="text-3xl font-bold text-center mb-8">📊 Feature Comparison</h2>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left p-4 text-gray-400">Feature</th>
                <th className="text-center p-4 text-purple-400">Basic</th>
                <th className="text-center p-4 text-yellow-400">VIP</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-700/50">
                <td className="p-4 text-gray-300">Auto-Farm Speed</td>
                <td className="text-center p-4">1x</td>
                <td className="text-center p-4 font-bold text-yellow-400">2x ⚡</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="p-4 text-gray-300">Map Completion Time</td>
                <td className="text-center p-4">11.6 hours</td>
                <td className="text-center p-4 font-bold text-yellow-400">5.6 hours</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="p-4 text-gray-300">VIP Badge</td>
                <td className="text-center p-4">❌</td>
                <td className="text-center p-4 text-yellow-400">✅</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="p-4 text-gray-300">Priority Support</td>
                <td className="text-center p-4">❌</td>
                <td className="text-center p-4 text-yellow-400">✅</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="p-4 text-gray-300">Early Access Features</td>
                <td className="text-center p-4">❌</td>
                <td className="text-center p-4 text-yellow-400">✅</td>
              </tr>
              <tr>
                <td className="p-4 text-gray-300">Exclusive VIP Items <span className="text-xs text-gray-500">(Coming Soon)</span></td>
                <td className="text-center p-4">❌</td>
                <td className="text-center p-4 text-yellow-400">✅</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Pricing Tiers */}
      <div className="max-w-6xl mx-auto mb-12">
        <h2 className="text-3xl font-bold text-center mb-8">💎 Pricing Plans</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {/* Weekly Plan */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 text-center">
            <h3 className="text-xl font-bold mb-2">Weekly</h3>
            <p className="text-3xl font-bold text-yellow-400 mb-4">$4.99</p>
            <p className="text-gray-400 mb-6">7 days of VIP access</p>
            <button
              disabled
              className="w-full bg-gray-600 text-gray-400 py-3 rounded-lg font-semibold cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>

          {/* Monthly Plan */}
          <div className="bg-gradient-to-br from-yellow-900/20 via-orange-900/20 to-yellow-900/20 border-2 border-yellow-500 rounded-lg p-6 text-center relative">
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-yellow-500 text-black px-4 py-1 rounded-full text-xs font-bold">
              BEST VALUE
            </div>
            <h3 className="text-xl font-bold mb-2 mt-2">Monthly</h3>
            <p className="text-3xl font-bold text-yellow-400 mb-1">$14.99</p>
            <p className="text-sm text-green-400 mb-4">Save 25%</p>
            <p className="text-gray-300 mb-6">30 days of VIP access</p>
            <button
              disabled
              className="w-full bg-gray-600 text-gray-400 py-3 rounded-lg font-semibold cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>

          {/* Yearly Plan */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 text-center">
            <h3 className="text-xl font-bold mb-2">Yearly</h3>
            <p className="text-3xl font-bold text-yellow-400 mb-1">$99.99</p>
            <p className="text-sm text-green-400 mb-4">Save 44%</p>
            <p className="text-gray-400 mb-6">365 days of VIP access</p>
            <button
              disabled
              className="w-full bg-gray-600 text-gray-400 py-3 rounded-lg font-semibold cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>
        </div>
      </div>

      {/* Contact Admin Section */}
      <div className="max-w-6xl mx-auto text-center mb-12">
        <div className="bg-blue-900/20 border border-blue-500/50 rounded-lg p-8">
          <h2 className="text-2xl font-bold mb-4">🎯 Want VIP Access Now?</h2>
          <p className="text-gray-300 mb-6">
            Payment integration is coming soon. In the meantime, contact an admin to get VIP access manually.
          </p>
          <button
            onClick={() => {
              alert('Contact admin via Discord or support email to request VIP access.');
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition"
          >
            Contact Admin
          </button>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="max-w-4xl mx-auto mb-12">
        <h2 className="text-3xl font-bold text-center mb-8">❓ Frequently Asked Questions</h2>
        <div className="space-y-4">
          <details className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <summary className="font-semibold cursor-pointer text-lg">
              How does the 2x speed boost work?
            </summary>
            <p className="text-gray-300 mt-3">
              VIP members use optimized timing algorithms that reduce delays between movements and harvests,
              allowing you to complete the entire map in 5.6 hours instead of 11.6 hours. That's 2x faster!
            </p>
          </details>

          <details className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <summary className="font-semibold cursor-pointer text-lg">
              Can I cancel my VIP subscription anytime?
            </summary>
            <p className="text-gray-300 mt-3">
              Yes! When payment integration is available, you can cancel anytime. Your VIP benefits will
              remain active until the end of your current billing period.
            </p>
          </details>

          <details className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <summary className="font-semibold cursor-pointer text-lg">
              What happens when my VIP expires?
            </summary>
            <p className="text-gray-300 mt-3">
              Your account will revert to Basic tier with standard auto-farm speed. All your progress,
              resources, and items are kept. You can re-subscribe anytime to regain VIP benefits.
            </p>
          </details>

          <details className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <summary className="font-semibold cursor-pointer text-lg">
              Are there any exclusive VIP items?
            </summary>
            <p className="text-gray-300 mt-3">
              Exclusive VIP units and items are coming in future updates! Stay tuned for announcements.
            </p>
          </details>

          <details className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <summary className="font-semibold cursor-pointer text-lg">
              When will payment integration be available?
            </summary>
            <p className="text-gray-300 mt-3">
              We're currently working on secure payment integration. Until then, you can contact an admin
              to manually grant VIP access. We'll announce when automatic payments are live!
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}
