/**
 * @file components/GameLayout.tsx
 * @created 2025-10-16
 * @overview Three-panel game layout component with battle logs and error boundaries
 * 
 * OVERVIEW:
 * Main game layout with flexible panel system:
 * - Left: Stats panel (player info) with optional battle logs below
 * - Center: Tile view (current location)
 * - Right: Controls panel (movement, resources)
 * 
 * FEATURES:
 * - Error boundaries protect each panel from crashes
 * - React.memo optimization for expensive panels
 * - Accessible landmark regions (aside, main, header)
 * 
 * UPDATES:
 * - 2025-10-17: Added battleLogs prop for bottom-left display
 * - 2025-01-17: Added ErrorBoundary integration and performance optimization
 */

'use client';

import React, { ReactNode, memo } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface GameLayoutProps {
  statsPanel: ReactNode;
  tileView: ReactNode;
  controlsPanel: ReactNode;
  battleLogs?: ReactNode; // Optional battle logs for bottom-left
  backgroundImage?: string; // Optional dynamic background image URL
}

/**
 * Three-panel game layout component with battle logs and error boundaries
 * 
 * Each panel is wrapped in ErrorBoundary to prevent cascading failures.
 * Panels are memoized to prevent unnecessary re-renders.
 * Supports dynamic background images for immersive atmosphere.
 */
const GameLayout = memo(function GameLayout({ statsPanel, tileView, controlsPanel, battleLogs, backgroundImage }: GameLayoutProps) {
  return (
    <div className="relative min-h-screen bg-gray-900 text-gray-100 pt-14">
      {/* Dynamic Tile Background - Immersive Atmosphere */}
      {backgroundImage && (
        <div
          className="fixed inset-0 z-0 transition-opacity duration-700 ease-in-out"
          style={{
            backgroundImage: `url(${backgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: 0.35,
            filter: 'blur(2px) brightness(0.6)',
          }}
        />
      )}

      {/* Main Game Area */}
      <div className="relative z-10 flex flex-row h-[calc(100vh-56px)]">
        {/* Left Column - Stats + Battle Logs */}
        <aside className="w-80 bg-gray-800/40 backdrop-blur-sm border-2 border-cyan-500/30 shadow-[0_0_20px_rgba(0,240,255,0.2)] flex flex-col overflow-hidden" aria-label="Player statistics">
          {/* Stats Panel (Scrollable) */}
          <div className="flex-1 overflow-y-auto">
            <ErrorBoundary>
              {statsPanel}
            </ErrorBoundary>
          </div>
          
          {/* Battle Logs Panel (Fixed at bottom, if provided) */}
          {battleLogs && (
            <div className="border-t-2 border-cyan-500/30 bg-gray-900/40 backdrop-blur-sm">
              <ErrorBoundary>
                {battleLogs}
              </ErrorBoundary>
            </div>
          )}
        </aside>

        {/* Center Panel - Tile View */}
        <main className="flex-1 flex bg-transparent overflow-hidden" aria-label="Game world view">
          <ErrorBoundary>
            {tileView}
          </ErrorBoundary>
        </main>

        {/* Right Panel - Controls */}
        <aside className="w-80 bg-gray-800/40 backdrop-blur-sm border-2 border-cyan-500/30 shadow-[0_0_20px_rgba(0,240,255,0.2)] overflow-y-auto" aria-label="Game controls">
          <ErrorBoundary>
            {controlsPanel}
          </ErrorBoundary>
        </aside>
      </div>
    </div>
  );
});

export default GameLayout;

// ============================================================
// END OF FILE
// ============================================================
