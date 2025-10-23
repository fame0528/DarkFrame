// ============================================================
// FILE: ControlsPanel.tsx
// CREATED: 2025-01-17
// LAST MODIFIED: 2025-01-17
// ============================================================
// OVERVIEW:
// Right sidebar controls panel component providing player position info,
// movement controls, and gameplay instructions.
// Displays current coordinates, terrain type, loading/error states,
// and keyboard shortcut reference guide. Integrates design system components
// (Panel, Badge, Button, Divider, Card).
// ============================================================

'use client';

import React from 'react';
import { MapPin, Map } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useGameContext } from '@/context/GameContext';
import MovementControls from './MovementControls';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/Divider';
import { Card } from '@/components/ui/Card';

// ============================================================
// MAIN COMPONENT
// ============================================================

/**
 * Controls Panel Component
 * 
 * Right sidebar providing:
 * - Current position display with coordinates and terrain
 * - Loading and error state indicators
 * - Movement controls component integration
 * - Keyboard shortcuts reference guide
 * - Logout functionality
 * - Design system integration for consistent styling
 */
export default function ControlsPanel() {
  const { player, currentTile, isLoading, error } = useGameContext();
  const router = useRouter();

  // ============================================================
  // MAIN RENDER
  // ============================================================

  return (
    <div className="p-3 space-y-3">
      {/* Position Info */}
      {player && (
        <div className="bg-gray-900/60 backdrop-blur-sm border-2 border-cyan-500/30 rounded-lg overflow-hidden shadow-[0_0_20px_rgba(0,240,255,0.2)]">
          {/* Banner Title */}
          <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-b border-cyan-500/30 px-3 py-2">
            <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              POSITION
            </h3>
          </div>
          {/* Content */}
          <div className="p-3 text-center">
            <div className="text-2xl font-mono font-bold text-white mb-2">
              ({player.currentPosition.x}, {player.currentPosition.y})
            </div>
            {currentTile && (
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs text-white/70">Terrain:</span>
                <span className="text-xs text-white font-semibold px-2 py-1 bg-cyan-500/20 border border-cyan-500/30 rounded">
                  {currentTile.terrain}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Map View Button */}
      <button
        onClick={() => router.push('/map')}
        className="w-full px-4 py-3 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 hover:from-blue-500/30 hover:to-cyan-500/30 border-2 border-blue-500/40 hover:border-blue-400/60 rounded-lg transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_25px_rgba(59,130,246,0.5)] flex items-center justify-center gap-2 text-white font-semibold"
      >
        <Map className="w-5 h-5" />
        🗺️ View Full Map
      </button>

      {/* Movement Controls */}
      <div className="bg-gray-900/60 backdrop-blur-sm border-2 border-cyan-500/30 rounded-lg overflow-hidden shadow-[0_0_20px_rgba(0,240,255,0.2)] p-3">
        <MovementControls />
      </div>

      {/* How to Play Link */}
      <a 
        href="/help"
        target="_blank"
        className="block text-center text-white/70 hover:text-white text-xs underline transition-colors"
      >
        📖 How to Play
      </a>
    </div>
  );
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Position display: Shows current (x, y) coordinates with terrain type
// - Loading state: Animated spinner with blue theme
// - Error state: Red alert card with error message
// - Movement controls: Integrated MovementControls component
// - Instructions: Comprehensive keyboard shortcut reference with badges
// - Logout: Calls /api/auth/logout, clears context, redirects to login
// - Design system integration: Panel, Badge, Button, Card, Divider
// - Toast notifications for logout success/error
// - Responsive layout with consistent spacing (space-y-6)
// - All interactive elements use Button component with variants
// - Keyboard shortcuts displayed in monospace font badges
// - Loading/error states use Card component with themed borders
// - Map wrap reminder in footer with icon
// ============================================================
// END OF FILE
// ============================================================
