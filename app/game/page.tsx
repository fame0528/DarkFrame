/**
 * @file app/game/page.tsx
 * @created 2025-10-16
 * @overview Main game page with three-panel layout
 * 
 * UPDATES:
 * - 2025-10-17: Added Bank and Shrine panel integration with keyboard shortcuts
 */

'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useGameContext } from '@/context/GameContext';
import { GameLayout, StatsPanel, TileRenderer, ControlsPanel, BankPanel, ShrinePanel, UnitBuildPanelEnhanced, FactoryManagementPanel, TierUnlockPanel, BattleLogLinks, SpecializationPanel, DiscoveryNotification, DiscoveryLogPanel, AchievementNotification, AchievementPanel, AuctionHousePanel, InventoryPanel, BotScannerPanel, BeerBasePanel, AutoFarmPanel, AutoFarmStatsDisplay, BotMagnetPanel, BotSummoningPanel, BountyBoardPanel } from '@/components';
import TopNavBar from '@/components/TopNavBar';
import FlagTrackerPanel from '@/components/FlagTrackerPanel';
import TileHarvestStatus from '@/components/TileHarvestStatus';
import CaveItemNotification from '@/components/CaveItemNotification';
import ClanManagementView from '@/components/clan/ClanManagementView';
import LeaderboardView from '@/components/LeaderboardView';
import ClanLeaderboardView from '@/components/ClanLeaderboardView';
import StatsViewWrapper from '@/components/StatsViewWrapper';
import TechTreePage from '@/app/tech-tree/page';
import ProfilePage from '@/app/profile/page';
import AdminPage from '@/app/admin/page';
import WMDMiniStatus from '@/components/WMDMiniStatus';
import { TerrainType, Discovery, Achievement, type FlagBearer } from '@/types';
import { AutoFarmEngine } from '@/utils/autoFarmEngine';
import { AutoFarmStatus, AutoFarmSessionStats, AutoFarmAllTimeStats, AutoFarmEvent, DEFAULT_SESSION_STATS, DEFAULT_ALL_TIME_STATS } from '@/types/autoFarm.types';
import { loadAllTimeStats } from '@/lib/autoFarmPersistence';

/**
 * Get background image path for current tile terrain
 * Returns the image path for immersive background effect
 */
function getTerrainBackgroundImage(terrain: TerrainType, x: number, y: number): string {
  // Handle terrains with variations
  if (terrain === TerrainType.Wasteland) {
    const variation = ((x + y) % 4) + 1;
    return `/assets/tiles/wasteland/wasteland_${variation}.jpg`;
  }
  
  if (terrain === TerrainType.Forest) {
    const variation = ((x + y) % 4) + 1;
    return `/assets/tiles/forest/forest_${variation}.jpg`;
  }
  
  // Handle terrains with single images
  const singleImageMap: Partial<Record<TerrainType, string>> = {
    [TerrainType.Metal]: '/assets/tiles/metal/metal.jpg',
    [TerrainType.Energy]: '/assets/tiles/energy/energy.jpg',
    [TerrainType.Cave]: '/assets/tiles/cave/cave.jpg',
    [TerrainType.Shrine]: '/assets/tiles/shrine/shrine-base.jpg',
  };
  
  if (singleImageMap[terrain]) {
    return singleImageMap[terrain]!;
  }
  
  // Handle Bank (pick random bank image)
  if (terrain === TerrainType.Bank) {
    const banks = ['energy-bank.jpg', 'metal-bank.jpg', 'exchange_bank.jpg'];
    const index = (x + y) % banks.length;
    return `/assets/tiles/banks/${banks[index]}`;
  }
  
  // Factory - no images available, use wasteland as fallback
  if (terrain === TerrainType.Factory) {
    const variation = ((x + y) % 4) + 1;
    return `/assets/tiles/wasteland/wasteland_${variation}.jpg`;
  }
  
  // Default fallback
  return '/assets/tiles/wasteland/wasteland_1.jpg';
}

export default function GamePage() {
  const { player, currentTile, isLoading, refreshGameState, updateTileOnly } = useGameContext();
  const router = useRouter();
  const [harvestResult, setHarvestResult] = useState<any>(null);
  const [isHarvesting, setIsHarvesting] = useState(false);
  const [isAttacking, setIsAttacking] = useState(false);
  const [attackResult, setAttackResult] = useState<any>(null);
  const [factoryData, setFactoryData] = useState<any>(null);
  const [lastTileKey, setLastTileKey] = useState<string>('');
  const [showBankPanel, setShowBankPanel] = useState(false);
  const [showShrinePanel, setShowShrinePanel] = useState(false);
  const [showUnitBuildPanel, setShowUnitBuildPanel] = useState(false);
  const [showFactoryManagement, setShowFactoryManagement] = useState(false);
  const [showTierUnlockPanel, setShowTierUnlockPanel] = useState(false);
  const [showAchievementPanel, setShowAchievementPanel] = useState(false);
  const [showAuctionHouse, setShowAuctionHouse] = useState(false);
  const [showDiscoveryLog, setShowDiscoveryLog] = useState(false);
  const [showBotMagnet, setShowBotMagnet] = useState(false);
  const [showBotSummoning, setShowBotSummoning] = useState(false);
  const [showBountyBoard, setShowBountyBoard] = useState(false);
  
  // ============================================
  // CENTER VIEW STATE (Embedded Page Navigation)
  // ============================================
  type CenterView = 'TILE' | 'LEADERBOARD' | 'STATS' | 'TECH_TREE' | 'CLAN' | 'CLANS' | 'BATTLE_LOG' | 'INVENTORY' | 'PROFILE' | 'ADMIN';
  const [currentView, setCurrentView] = useState<CenterView>('TILE');
  
  const [panelMessage, setPanelMessage] = useState<string>('');
  const [discoveryNotification, setDiscoveryNotification] = useState<Discovery | null>(null);
  const [achievementNotification, setAchievementNotification] = useState<Achievement | null>(null);
  const [totalDiscoveries, setTotalDiscoveries] = useState<number | undefined>(undefined);

  // ============================================
  // AUTO-FARM STATE & ENGINE
  // ============================================
  const autoFarmEngineRef = useRef<AutoFarmEngine | null>(null);
  const [autoFarmStatus, setAutoFarmStatus] = useState<AutoFarmStatus>(AutoFarmStatus.STOPPED);
  const [autoFarmPosition, setAutoFarmPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [autoFarmTilesCompleted, setAutoFarmTilesCompleted] = useState<number>(0);
  const [autoFarmLastAction, setAutoFarmLastAction] = useState<string>('Ready');
  const [autoFarmSessionStats, setAutoFarmSessionStats] = useState<AutoFarmSessionStats>(DEFAULT_SESSION_STATS);
  const [autoFarmAllTimeStats, setAutoFarmAllTimeStats] = useState<AutoFarmAllTimeStats>(DEFAULT_ALL_TIME_STATS);

  // ============================================
  // FLAG TRACKER STATE
  // ============================================
  const [flagBearer, setFlagBearer] = useState<FlagBearer | null>(null);
  const [attackCooldown, setAttackCooldown] = useState<boolean>(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  // Redirect to register if no player (but wait for loading to finish)
  useEffect(() => {
    if (!isLoading && !player) {
      router.push('/register');
    }
  }, [player, isLoading, router]);

  // Initialize AutoFarmEngine
  useEffect(() => {
    if (!player) return;

    // Create engine if it doesn't exist
    if (!autoFarmEngineRef.current) {
      // Load config from localStorage or use defaults
      let config;
      try {
        const savedConfig = localStorage.getItem('darkframe_autofarm_config');
        config = savedConfig ? JSON.parse(savedConfig) : {
          attackPlayers: false,
          rankFilter: 'ALL',
          resourceTarget: 'METAL',
          isVIP: player.isVIP || false
        };
        // Always update VIP status from player data (in case it changed)
        config.isVIP = player.isVIP || false;
      } catch (error) {
        config = {
          attackPlayers: false,
          rankFilter: 'ALL',
          resourceTarget: 'METAL',
          isVIP: player.isVIP || false
        };
      }

      const engine = new AutoFarmEngine(config, player.currentPosition);
      
      // Set up callbacks
      engine.onEvent((event: AutoFarmEvent) => {
        // Handle auto-farm events (errors, completions, etc.)
        if (event.type === 'error') {
          setPanelMessage(`🤖 Auto-Farm: ${event.message}`);
          setAutoFarmLastAction(`❌ Error: ${event.message}`);
          setTimeout(() => setPanelMessage(''), 4000);
        } else if (event.type === 'complete') {
          setPanelMessage('🎉 Auto-Farm: Map completed!');
          setAutoFarmLastAction('✅ Map Complete!');
          setTimeout(() => setPanelMessage(''), 5000);
        } else if (event.type === 'move') {
          // Update last action
          setAutoFarmLastAction(`→ Moved to (${event.position.x}, ${event.position.y})`);
          
          // Update tile visual using lightweight update (doesn't destroy engine)
          updateTileOnly(event.position.x, event.position.y);
        } else if (event.type === 'harvest') {
          // Keypress simulation triggers existing harvest UI - just update last action
          const data = event.data;
          const terrain = data?.terrain || 'Resource';
          const key = data?.key || '?';
          setAutoFarmLastAction(`⛏️ Harvesting ${terrain} (pressed '${key}')`);
          // Actual harvest result will be displayed by the game's existing harvest handlers
        } else if (event.type === 'combat') {
          // Display combat results just like manual attacks
          const data = event.data;
          if (data) {
            const outcome = data.victory ? '✅ Victory' : '❌ Defeat';
            setAutoFarmLastAction(`⚔️ ${outcome} vs ${data.defenderName || 'Enemy'}`);
            
            setAttackResult({
              success: data.success,
              message: data.message || 'Combat completed',
              victory: data.victory || false,
              metalStolen: data.metalStolen || 0,
              energyStolen: data.energyStolen || 0,
              xpGained: data.xpGained || 0,
              defenderName: data.defenderName || 'Unknown',
              unitsLost: data.unitsLost || 0
            });
            
            // Clear combat result after 5 seconds
            setTimeout(() => setAttackResult(null), 5000);
          }
        }
      });

      engine.onStats((stats: AutoFarmSessionStats) => {
        setAutoFarmSessionStats(stats);
      });

      engine.onState((state) => {
        setAutoFarmStatus(state.status);
        setAutoFarmPosition(state.currentPosition);
        setAutoFarmTilesCompleted(state.tilesCompleted);
      });

      autoFarmEngineRef.current = engine;
    }

    // Load all-time stats from localStorage
    const allTimeStats = loadAllTimeStats();
    setAutoFarmAllTimeStats(allTimeStats);

    // Cleanup ONLY on unmount (not on player changes)
    return () => {
      // Only destroy if component is actually unmounting
      // Don't destroy on player data updates (which happen from refreshGameState)
      if (autoFarmEngineRef.current && !player) {
        console.log('[AutoFarm] Destroying engine on unmount');
        autoFarmEngineRef.current.destroy();
        autoFarmEngineRef.current = null;
      }
    };
  }, [player?.username]); // Only re-run if username changes (i.e., different player logged in)

  // ============================================
  // FLAG TRACKER DATA FETCHING
  // ============================================
  useEffect(() => {
    // Initialize flag system first (ensures there's always a flag bearer)
    const initializeFlag = async () => {
      try {
        await fetch('/api/flag/init', { method: 'POST' });
      } catch (error) {
        console.error('[Flag Tracker] Error initializing flag system:', error);
      }
    };

    // Fetch initial flag data
    const fetchFlagData = async () => {
      try {
        const response = await fetch('/api/flag');
        const data = await response.json();
        
        if (data.success && data.data) {
          setFlagBearer(data.data);
        } else {
          setFlagBearer(null);
        }
      } catch (error) {
        console.error('[Flag Tracker] Error fetching flag data:', error);
        setFlagBearer(null);
      }
    };

    // Initialize then fetch
    initializeFlag().then(() => fetchFlagData());

    // Poll for updates every 30 seconds (until WebSocket is implemented)
    const pollInterval = setInterval(fetchFlagData, 30000);

    return () => clearInterval(pollInterval);
  }, []);

  // Clear results and load factory data when tile changes
  useEffect(() => {
    if (!currentTile) return;
    
    const tileKey = `${currentTile.x},${currentTile.y}`;
    if (lastTileKey && lastTileKey !== tileKey) {
      // DO NOT clear harvestResult here - let it persist so player can see results while moving
      // Only clear attack/factory results which are position-specific
      setAttackResult(null);
      setFactoryData(null);
      
      // Close any embedded view when player moves
      setCurrentView('TILE');
      
      // Refresh flag bearer data after movement
      fetch('/api/flag')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data) {
            setFlagBearer(data.data);
          }
        })
        .catch(err => console.error('[Flag Tracker] Error refreshing flag data after move:', err));
    }
    setLastTileKey(tileKey);

    // Load factory data if on factory tile
    if (currentTile.terrain === 'Factory') {
      fetch(`/api/factory/status?x=${currentTile.x}&y=${currentTile.y}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setFactoryData(data.factory);
          }
        })
        .catch(err => console.error('Failed to load factory data:', err));
    }
  }, [currentTile, lastTileKey]);

  // Handle keyboard shortcuts for Bank and Shrine
  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    // Ignore if typing in input field or editable content
    const target = event.target as HTMLElement;
    const activeElement = document.activeElement;
    
    // Check if user is typing in any input element
    // Check both event target AND active element (for styled inputs)
    if (
      event.target instanceof HTMLInputElement || 
      event.target instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      activeElement?.tagName === 'INPUT' ||
      activeElement?.tagName === 'TEXTAREA' ||
      target.closest('input') !== null ||
      target.closest('textarea') !== null ||
      target.closest('[contenteditable="true"]') !== null
    ) {
      return;
    }

    const key = event.key.toLowerCase();

    // 'K' key - Open Bank Panel (K for banK, since B is for Bot Scanner)
    if (key === 'k') {
      if (!currentTile || currentTile.terrain !== TerrainType.Bank) {
        setPanelMessage('❌ You must be at a Bank tile to access banking services');
        setTimeout(() => setPanelMessage(''), 3000);
        return;
      }
      setShowBankPanel(true);
    }

    // 'N' key - Open Shrine Panel (N for shriNe, avoiding S = South movement conflict)
    if (key === 'n') {
      if (!currentTile || currentTile.terrain !== TerrainType.Shrine) {
        setPanelMessage('❌ You must be at the Shrine (1, 1) to access shrine services');
        setTimeout(() => setPanelMessage(''), 3000);
        return;
      }
      setShowShrinePanel(true);
    }

    // 'U' key - Open Unit Build Panel (can build anywhere)
    if (key === 'u') {
      setShowUnitBuildPanel(true);
    }

    // 'M' key - Open Factory Management Panel
    if (key === 'm') {
      setShowFactoryManagement(true);
    }

    // 'T' key - Open Tier Unlock Panel
    if (key === 't') {
      setShowTierUnlockPanel(true);
    }

    // 'V' key - Open Achievement Panel (V for achieVements, avoiding A = West movement conflict)
    if (key === 'v') {
      setShowAchievementPanel(prev => !prev);
    }

    // 'H' key - Open Auction House
    if (key === 'h') {
      setShowAuctionHouse(prev => !prev);
    }

    // 'J' key - Toggle Bot Magnet Panel
    if (key === 'j') {
      setShowBotMagnet(prev => !prev);
    }

    // 'Y' key - Toggle Bot Summoning Panel
    if (key === 'y') {
      setShowBotSummoning(prev => !prev);
    }

    // 'O' key - Toggle Bounty Board Panel
    if (key === 'o') {
      setShowBountyBoard(prev => !prev);
    }

    // 'R' key - Toggle Auto-Farm (R for Robot/automate)
    if (key === 'r') {
      if (!autoFarmEngineRef.current) return;
      
      if (autoFarmStatus === AutoFarmStatus.STOPPED) {
        handleAutoFarmStart();
      } else if (autoFarmStatus === AutoFarmStatus.ACTIVE) {
        handleAutoFarmPause();
      } else if (autoFarmStatus === AutoFarmStatus.PAUSED) {
        handleAutoFarmResume();
      }
    }

    // 'Shift+R' key - Stop Auto-Farm
    if (key === 'r' && event.shiftKey) {
      if (autoFarmStatus !== AutoFarmStatus.STOPPED) {
        handleAutoFarmStop();
      }
    }

    // 'C' key - Toggle Clan Panel
    if (key === 'c') {
      setCurrentView(prev => prev === 'CLAN' ? 'TILE' : 'CLAN');
    }

    // 'L' key - Toggle Clan Leaderboards Panel
    if (key === 'l') {
      setCurrentView(prev => prev === 'CLANS' ? 'TILE' : 'CLANS');
    }

    // 'P' key - Toggle Player Leaderboard Panel
    if (key === 'p') {
      setCurrentView(prev => prev === 'LEADERBOARD' ? 'TILE' : 'LEADERBOARD');
    }

    // 'Q' key - Flag Tracker is always visible (removed toggle)
    // Q hotkey removed - flag tracker now permanently in sidebar

    // 'G' key - Harvest for Metal/Energy
    if (key === 'g') {
      if (!currentTile || (currentTile.terrain !== TerrainType.Metal && currentTile.terrain !== TerrainType.Energy)) {
        return;
      }
      handleHarvest();
    }

    // 'F' key - Harvest for Cave/Forest
    if (key === 'f') {
      if (!currentTile || (currentTile.terrain !== TerrainType.Cave && currentTile.terrain !== TerrainType.Forest)) {
        return;
      }
      handleHarvest();
    }

    // 'R' key - Attack Factory
    if (key === 'r') {
      if (!currentTile || currentTile.terrain !== TerrainType.Factory) {
        return;
      }
      handleAttack();
    }
  }, [currentTile, factoryData, player]);

  // Handle harvest action
  const handleHarvest = async () => {
    if (!player || isHarvesting) return;

    setIsHarvesting(true);
    setHarvestResult(null); // Clear previous result

    try {
      const response = await fetch('/api/harvest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: player.username }),
      });

      const data = await response.json();

      setHarvestResult({
        success: data.success,
        message: data.message,
        metalGained: data.metalGained,
        energyGained: data.energyGained,
        item: data.item,
      });

      // Do NOT refresh game state - keep the page as is
      // The result is displayed inline, player can continue moving

      // Clear result after 3 seconds
      setTimeout(() => {
        setHarvestResult(null);
      }, 3000);
    } catch (error) {
      console.error('Harvest error:', error);
      setHarvestResult({
        success: false,
        message: 'Network error - please try again',
      });
    } finally {
      setIsHarvesting(false);
    }
  };

  // Handle factory attack action
  const handleAttack = async () => {
    if (!player || !currentTile || isAttacking) return;

    setIsAttacking(true);
    setAttackResult(null); // Clear previous result

    try {
      const response = await fetch('/api/factory/attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: player.username,
          x: currentTile.x,
          y: currentTile.y
        })
      });

      const data = await response.json();

      setAttackResult({
        success: data.success,
        message: data.message,
        playerPower: data.playerPower,
        factoryDefense: data.factoryDefense,
        captured: data.captured
      });

      // Do NOT refresh game state unless factory was captured
      // Display result inline, player can continue
      if (data.captured) {
        // Only refresh if factory was successfully captured
        setTimeout(() => {
          refreshGameState();
        }, 2000);
      }

      // Clear result after 5 seconds
      setTimeout(() => {
        setAttackResult(null);
      }, 5000);
    } catch (error) {
      console.error('Factory attack error:', error);
      setAttackResult({
        success: false,
        message: 'Network error - please try again',
        playerPower: 0,
        factoryDefense: 0,
        captured: false
      });
    } finally {
      setIsAttacking(false);
    }
  };

  // Add/remove keyboard event listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  // Handle panel transactions (refresh player data)
  const handleTransaction = async () => {
    await refreshGameState();
  };

  // ============================================
  // AUTO-FARM CONTROL HANDLERS
  // ============================================
  const handleAutoFarmStart = () => {
    if (autoFarmEngineRef.current) {
      autoFarmEngineRef.current.start();
      setPanelMessage('🤖 Auto-Farm started!');
      setTimeout(() => setPanelMessage(''), 3000);
    }
  };

  const handleAutoFarmPause = () => {
    if (autoFarmEngineRef.current) {
      autoFarmEngineRef.current.pause();
      setPanelMessage('⏸️ Auto-Farm paused');
      setTimeout(() => setPanelMessage(''), 3000);
    }
  };

  const handleAutoFarmResume = () => {
    if (autoFarmEngineRef.current) {
      autoFarmEngineRef.current.resume();
      setPanelMessage('▶️ Auto-Farm resumed');
      setTimeout(() => setPanelMessage(''), 3000);
    }
  };

  const handleAutoFarmStop = () => {
    if (autoFarmEngineRef.current) {
      autoFarmEngineRef.current.stop();
      setPanelMessage('🛑 Auto-Farm stopped');
      setTimeout(() => setPanelMessage(''), 3000);
    }
  };

  // ============================================
  // FLAG TRACKER HANDLERS
  // ============================================
  const handleFlagAttack = async (bearer: FlagBearer) => {
    if (!player || attackCooldown) return;

    // Get the bearer ID (player or bot)
    const targetId = bearer.playerId || 'BOT'; // Use 'BOT' placeholder if bot holds flag

    try {
      const response = await fetch('/api/flag/attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPlayerId: targetId,
          attackerPosition: player.currentPosition
        })
      });

      const result = await response.json();

      if (result.success && result.data?.success) {
        setPanelMessage(`⚔️ Attack successful! Damage: ${result.data.damage}`);
        
        // Start cooldown (60 seconds)
        setAttackCooldown(true);
        setCooldownRemaining(60);

        const cooldownInterval = setInterval(() => {
          setCooldownRemaining(prev => {
            if (prev <= 1) {
              clearInterval(cooldownInterval);
              setAttackCooldown(false);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        // Refresh flag data to show updated bearer HP
        const flagResponse = await fetch('/api/flag');
        const flagData = await flagResponse.json();
        if (flagData.success && flagData.data) {
          setFlagBearer(flagData.data);
        }
      } else {
        setPanelMessage(`❌ Attack failed: ${result.data?.error || result.error || 'Unknown error'}`);
      }

      setTimeout(() => setPanelMessage(''), 5000);
    } catch (error) {
      console.error('[Flag Tracker] Attack error:', error);
      setPanelMessage('❌ Attack failed: Network error');
      setTimeout(() => setPanelMessage(''), 5000);
    }
  };

  const handleFlagTrack = (bearer: FlagBearer) => {
    // Navigate to bearer's profile
    router.push(`/profile/${bearer.username}`);
  };

  if (!player) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400">
          {isLoading ? 'Loading player data...' : 'Redirecting...'}
        </p>
      </div>
    );
  }

  return (
    <>
      <TopNavBar 
        onLeaderboardClick={() => setCurrentView('LEADERBOARD')}
        onClansClick={() => setCurrentView('CLANS')}
        onClanClick={() => setCurrentView('CLAN')}
        onStatsClick={() => setCurrentView('STATS')}
        onTechTreeClick={() => setCurrentView('TECH_TREE')}
        onProfileClick={() => setCurrentView('PROFILE')}
        onAdminClick={() => setCurrentView('ADMIN')}
      />
      
      <InventoryPanel />
      <CaveItemNotification />
      <DiscoveryNotification 
        discovery={discoveryNotification}
        totalDiscoveries={totalDiscoveries}
        onClose={() => {
          setDiscoveryNotification(null);
          setTotalDiscoveries(undefined);
        }}
      />
      <DiscoveryLogPanel 
        isOpen={showDiscoveryLog}
        onClose={() => setShowDiscoveryLog(false)}
      />
      <AchievementNotification
        achievement={achievementNotification}
        onDismiss={() => setAchievementNotification(null)}
      />
      {player && (
        <AchievementPanel
          isOpen={showAchievementPanel}
          onClose={() => setShowAchievementPanel(false)}
          username={player.username}
        />
      )}

      {/* Auction House Panel */}
      {showAuctionHouse && (
        <AuctionHousePanel onClose={() => setShowAuctionHouse(false)} />
      )}

      {/* Bot Magnet Panel (Hotkey: J) */}
      {showBotMagnet && (
        <BotMagnetPanel />
      )}

      {/* Bot Summoning Panel (Hotkey: Y) */}
      {showBotSummoning && (
        <BotSummoningPanel />
      )}

      {/* Bounty Board Panel (Hotkey: O) */}
      {showBountyBoard && (
        <BountyBoardPanel />
      )}

      {/* Bot Scanner Panel - Always rendered, self-manages "Shift+B" key activation */}
      <BotScannerPanel />

      {/* Beer Base Panel - Always rendered, self-manages hotkey activation */}
      <BeerBasePanel />
      
      {/* Bank Panel */}
      {currentTile && currentTile.terrain === TerrainType.Bank && player && (
        <BankPanel
          isOpen={showBankPanel}
          onClose={() => setShowBankPanel(false)}
          playerResources={player.resources}
          bankStorage={player.bank || { metal: 0, energy: 0 }}
          bankType={currentTile.bankType || 'metal'}
          onTransaction={handleTransaction}
        />
      )}

      {/* Shrine Panel */}
      {currentTile && currentTile.terrain === TerrainType.Shrine && player && (
        <ShrinePanel
          isOpen={showShrinePanel}
          onClose={() => setShowShrinePanel(false)}
          tradeableItems={player.inventory?.items.filter(item => item.type === 'TRADEABLE_ITEM').reduce((sum, item) => sum + (item.quantity || 1), 0) || 0}
          activeBoosts={player.shrineBoosts || []}
          onTransaction={handleTransaction}
        />
      )}

      {/* Unit Build Panel - Can build anywhere */}
      {player && (
        <UnitBuildPanelEnhanced
          isOpen={showUnitBuildPanel}
          onClose={() => setShowUnitBuildPanel(false)}
          factoryX={currentTile?.x || player.currentPosition.x}
          factoryY={currentTile?.y || player.currentPosition.y}
          playerResources={player.resources}
          availableSlots={999} // No slot limit when building anywhere
          maxSlots={999}
          usedSlots={0}
          onBuildComplete={async () => {
            await handleTransaction();
            // Reload factory data if on factory
            if (currentTile?.terrain === TerrainType.Factory) {
              const res = await fetch(`/api/factory/status?x=${currentTile.x}&y=${currentTile.y}`);
              const data = await res.json();
              if (data.success) {
                setFactoryData(data.factory);
              }
            }
          }}
        />
      )}

      {/* Factory Management Panel */}
      {player && (
        <FactoryManagementPanel
          isOpen={showFactoryManagement}
          onClose={() => setShowFactoryManagement(false)}
          username={player.username}
          onNavigate={async (x, y) => {
            // Navigate to factory coordinates
            // Calculate movement from current position to target
            if (!player.currentPosition) return;
            
            const deltaX = x - player.currentPosition.x;
            const deltaY = y - player.currentPosition.y;
            
            // This is a placeholder - actual implementation would need pathfinding
            // For now, just refresh state to show the player we received the command
            await refreshGameState();
            setPanelMessage(`📍 Factory at (${x}, ${y}) - Use movement controls to navigate there`);
            setTimeout(() => setPanelMessage(''), 3000);
          }}
        />
      )}

      {/* Tier Unlock Panel */}
      {showTierUnlockPanel && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowTierUnlockPanel(false)}>
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-4 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-purple-400">🧪 Research & Unlock Tiers</h2>
              <button
                onClick={() => setShowTierUnlockPanel(false)}
                className="text-gray-400 hover:text-white text-2xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <TierUnlockPanel />
            </div>
          </div>
        </div>
      )}

      {/* Panel Error Message Toast */}
      {panelMessage && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-red-900 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in">
          {panelMessage}
        </div>
      )}

      <GameLayout
        statsPanel={<StatsPanel onClanClick={() => setCurrentView('CLAN')} />}
        battleLogs={<BattleLogLinks />}
        backgroundImage={currentTile ? getTerrainBackgroundImage(currentTile.terrain, currentTile.x, currentTile.y) : undefined}
        tileView={
          currentView === 'TILE' && currentTile ? (
            <div className="flex items-center justify-center w-full h-full p-4">
              <TileRenderer 
                tile={currentTile} 
                harvestResult={harvestResult}
                factoryData={factoryData}
                attackResult={attackResult}
                flagBearer={flagBearer}
                onDiscovery={(discovery, total) => {
                  setDiscoveryNotification(discovery);
                  setTotalDiscoveries(total);
                }}
                onHarvestClick={handleHarvest}
                isHarvesting={isHarvesting}
                onAttackClick={handleAttack}
                isAttacking={isAttacking}
                onFlagAttack={handleFlagAttack}
              />
            </div>
          ) : currentView === 'TILE' ? (
            <div className="flex items-center justify-center w-full h-full text-gray-400">Loading tile...</div>
          ) : currentView === 'LEADERBOARD' ? (
            <div className="h-full w-full flex flex-col p-6">
              <div className="mb-4">
                <button
                  onClick={() => setCurrentView('TILE')}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <span className="text-lg">←</span>
                  <span>Back to Game</span>
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <LeaderboardView />
              </div>
            </div>
          ) : currentView === 'CLANS' ? (
            <div className="h-full w-full flex flex-col p-6">
              <div className="mb-4">
                <button
                  onClick={() => setCurrentView('TILE')}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <span className="text-lg">←</span>
                  <span>Back to Game</span>
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ClanLeaderboardView />
              </div>
            </div>
          ) : currentView === 'CLAN' ? (
            <div className="h-full w-full flex flex-col p-6">
              <div className="mb-4">
                <button
                  onClick={() => setCurrentView('TILE')}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <span className="text-lg">←</span>
                  <span>Back to Game</span>
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <ClanManagementView />
              </div>
            </div>
          ) : currentView === 'STATS' ? (
            <div className="h-full w-full flex flex-col p-6">
              <div className="mb-4">
                <button
                  onClick={() => setCurrentView('TILE')}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <span className="text-lg">←</span>
                  <span>Back to Game</span>
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <StatsViewWrapper 
                  currentTile={currentTile}
                  playerUsername={player?.username || ''}
                />
              </div>
            </div>
          ) : currentView === 'TECH_TREE' ? (
            <div className="h-full w-full flex flex-col p-6">
              <div className="mb-4">
                <button
                  onClick={() => setCurrentView('TILE')}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <span className="text-lg">←</span>
                  <span>Back to Game</span>
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <TechTreePage embedded={true} />
              </div>
            </div>
          ) : currentView === 'BATTLE_LOG' ? (
            <div className="h-full w-full flex flex-col p-6">
              <div className="mb-4">
                <button
                  onClick={() => setCurrentView('TILE')}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <span className="text-lg">←</span>
                  <span>Back to Game</span>
                </button>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <div className="text-white text-xl">Battle Log View - Coming Soon</div>
              </div>
            </div>
          ) : currentView === 'INVENTORY' ? (
            <div className="h-full w-full flex flex-col p-6">
              <div className="mb-4">
                <button
                  onClick={() => setCurrentView('TILE')}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <span className="text-lg">←</span>
                  <span>Back to Game</span>
                </button>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <div className="text-white text-xl">Inventory View - Coming Soon</div>
              </div>
            </div>
          ) : currentView === 'PROFILE' ? (
            <div className="h-full w-full flex flex-col p-6">
              <div className="mb-4">
                <button
                  onClick={() => setCurrentView('TILE')}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <span className="text-lg">←</span>
                  <span>Back to Game</span>
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <ProfilePage embedded={true} />
              </div>
            </div>
          ) : currentView === 'ADMIN' ? (
            <div className="h-full w-full flex flex-col p-6">
              <div className="mb-4">
                <button
                  onClick={() => setCurrentView('TILE')}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <span className="text-lg">←</span>
                  <span>Back to Game</span>
                </button>
              </div>
              <div className="flex-1 overflow-auto bg-gradient-to-b from-gray-900 to-black">
                <AdminPage embedded={true} />
              </div>
            </div>
          ) : null
        }
        controlsPanel={
          <>
            <ControlsPanel />
            
            {/* Auto-Farm Control Panel */}
            <div className="p-3">
              <AutoFarmPanel
                status={autoFarmStatus}
                currentPosition={autoFarmPosition}
                tilesCompleted={autoFarmTilesCompleted}
                lastAction={autoFarmLastAction}
                isVIP={player?.isVIP || false}
                onStart={handleAutoFarmStart}
                onPause={handleAutoFarmPause}
                onResume={handleAutoFarmResume}
                onStop={handleAutoFarmStop}
              />
            </div>

            {/* WMD Mini Status Widget */}
            <div className="p-3">
              <WMDMiniStatus />
            </div>

            {/* Flag Tracker Panel - Always Visible */}
            {flagBearer && (
              <div className="p-3">
                <FlagTrackerPanel
                  playerPosition={player?.currentPosition || { x: 75, y: 75 }}
                  flagBearer={flagBearer}
                  onTrack={handleFlagTrack}
                  onAttack={handleFlagAttack}
                  attackOnCooldown={attackCooldown}
                  cooldownRemaining={cooldownRemaining}
                  compact={false}
                />
              </div>
            )}
          </>
        }
      />
    </>
  );
}

// ============================================================
// END OF FILE
// ============================================================
