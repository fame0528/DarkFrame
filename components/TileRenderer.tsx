/**
 * @file components/TileRenderer.tsx
 * @created 2025-10-16
 * @updated 2025-10-17
 * @overview Component for rendering current tile with dynamic image loading and base overlays
 * 
 * OVERVIEW:
 * Renders terrain tiles with automatic image discovery and random variation selection.
 * Supports all image formats (.png, .jpg, .jpeg, .gif, .webp) without strict naming.
 * Simply drop images in terrain folders and they'll be automatically loaded and used.
 */

'use client';

import React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Tile, TerrainType, HarvestResult, Factory, AttackResult, Discovery } from '@/types';
import { useGameContext } from '@/context/GameContext';
import { getTerrainImage, getBankImage, getBaseImage } from '@/lib/imageService';
import { logger } from '@/lib/logger';
import { SafeHtmlRenderer } from '@/components/SafeHtmlRenderer';

interface TileRendererProps {
  tile: Tile;
  harvestResult?: HarvestResult | null;
  factoryData?: Factory | null;
  attackResult?: AttackResult | null;
  onDiscovery?: (discovery: Discovery, total: number) => void;
  onHarvestClick?: () => void;
  isHarvesting?: boolean;
  onAttackClick?: () => void;
  isAttacking?: boolean;
}

/**
 * Get terrain color for fallback display
 */
function getTerrainColor(terrain: TerrainType): string {
  switch (terrain) {
    case TerrainType.Metal:
      return 'bg-gradient-to-br from-gray-400 to-gray-600';
    case TerrainType.Energy:
      return 'bg-gradient-to-br from-cyan-400 to-blue-600';
    case TerrainType.Cave:
      return 'bg-gradient-to-br from-purple-900 to-black';
    case TerrainType.Forest:
      return 'bg-gradient-to-br from-green-700 to-green-900';
    case TerrainType.Factory:
      return 'bg-gradient-to-br from-red-600 to-orange-700';
    case TerrainType.Wasteland:
      return 'bg-gradient-to-br from-amber-900 to-yellow-800';
    case TerrainType.Bank:
      return 'bg-gradient-to-br from-yellow-500 to-yellow-700';
    case TerrainType.Shrine:
      return 'bg-gradient-to-br from-purple-500 to-purple-900';
    default:
      return 'bg-gray-500';
  }
}

/**
 * Get terrain description with base awareness
 * Now uses consistent randomized messages based on coordinates
 */
function getTerrainDescription(
  terrain: TerrainType, 
  x: number, 
  y: number, 
  isBase: boolean = false, 
  bankType?: 'metal' | 'energy' | 'exchange'
): string {
  if (isBase) {
    return '🏠 Your command base - This is your starting location and safe haven';
  }
  
  // Use coordinate-based consistent message system
  const { getConsistentTileMessage } = require('@/lib/tileMessages');
  return getConsistentTileMessage(terrain, x, y, bankType);
}

export default function TileRenderer({ tile, harvestResult, factoryData, attackResult, onDiscovery, onHarvestClick, isHarvesting, onAttackClick, isAttacking }: TileRendererProps) {
  const { player, refreshGameState } = useGameContext();
  const router = useRouter();
  
  // Dynamic image state
  const [imagePath, setImagePath] = React.useState<string | null>(null);
  const [imageError, setImageError] = React.useState(false);
  const [baseImagePath, setBaseImagePath] = React.useState<string | null>(null);
  const [baseImageError, setBaseImageError] = React.useState(false);
  const [factoryImageError, setFactoryImageError] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  
  // Load appropriate image when tile changes
  React.useEffect(() => {
    let cancelled = false;
    
    const loadImage = async () => {
      setIsLoading(true);
      setImageError(false);
      
      try {
        logger.debug('TileRenderer: Loading tile image', { 
          terrain: tile.terrain, 
          x: tile.x, 
          y: tile.y 
        });
        
        // Handle Bank tiles (including auction)
        if (tile.terrain === TerrainType.Bank) {
          const bankType = tile.bankType || 'metal'; // Default to metal bank
          const imgPath = await getBankImage(bankType, tile.x, tile.y);
          
          if (!cancelled) {
            setImagePath(imgPath);
            setImageError(!imgPath);
            logger.debug('Bank tile image loaded', { bankType, path: imgPath || 'fallback' });
          }
        } 
        // Handle regular terrain tiles
        else {
          const terrainDir = tile.terrain.toLowerCase();
          const imgPath = await getTerrainImage(terrainDir, tile.x, tile.y);
          
          if (!cancelled) {
            setImagePath(imgPath);
            setImageError(!imgPath);
            logger.debug('Terrain tile image loaded', { terrain: tile.terrain, path: imgPath || 'fallback' });
          }
        }
      } catch (error) {
        console.error('Error loading tile image:', error);
        if (!cancelled) {
          setImagePath(null);
          setImageError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    
    loadImage();
    
    return () => {
      cancelled = true;
    };
  }, [tile.terrain, tile.x, tile.y, tile.bankType]);
  
  // Load base overlay image when player base changes
  React.useEffect(() => {
    let cancelled = false;
    
    const loadBaseImage = async () => {
      if (!player) return;
      
      try {
        const rank = player.rank || 1;
        const imgPath = await getBaseImage(rank);
        
        if (!cancelled) {
          setBaseImagePath(imgPath);
          setBaseImageError(!imgPath);
          logger.debug('Base image loaded', { rank, path: imgPath || 'fallback' });
        }
      } catch (error) {
        console.error('Error loading base image:', error);
        if (!cancelled) {
          setBaseImagePath(null);
          setBaseImageError(true);
        }
      }
    };
    
    loadBaseImage();
    
    return () => {
      cancelled = true;
    };
  }, [player?.rank]);
  
  // Determine if this tile is the player's base (YOUR base)
  const isPlayerBase = tile.occupiedByBase && player && 
    tile.x === player.base.x && tile.y === player.base.y;
  
  // Any base should show as a base (visible to all players)
  const isAnyBase = tile.occupiedByBase === true;
  
  // Get player rank for display (or rank 1 if not your base)
  const playerRank = player?.rank || 1;

  // Factory level-based image path (keep existing factory system for now)
  const getFactoryImagePath = (): string => {
    if (tile.terrain === TerrainType.Factory && factoryData) {
      const factoryLevel = factoryData.level || 1;
      return `/assets/factories/level${factoryLevel}/factory.png`;
    }
    return '';
  };
  
  const factoryImagePath = getFactoryImagePath();

  return (
    <div className="w-full max-w-2xl">
      {/* Tile Display */}
      <div className="relative aspect-square rounded-lg overflow-hidden border-2 border-cyan-500/40 shadow-[0_0_30px_rgba(0,240,255,0.3)]">
        {/* Terrain Layer (Background) */}
        {!imageError && imagePath ? (
          <Image
            src={imagePath}
            alt={`${tile.terrain} tile`}
            fill
            className="object-cover"
            onError={() => {
              logger.warn('Failed to load tile image', { path: imagePath });
              setImageError(true);
            }}
            priority
          />
        ) : (
          <div className={`w-full h-full ${getTerrainColor(tile.terrain)} flex items-center justify-center`}>
            <div className="text-center text-white">
              <div className="text-6xl mb-4">
                {tile.terrain === TerrainType.Metal && '⚙️'}
                {tile.terrain === TerrainType.Energy && '⚡'}
                {tile.terrain === TerrainType.Cave && '🕳️'}
                {tile.terrain === TerrainType.Forest && '🌲'}
                {tile.terrain === TerrainType.Factory && '🏭'}
                {tile.terrain === TerrainType.Wasteland && '🏜️'}
                {tile.terrain === TerrainType.Bank && '🏦'}
                {tile.terrain === TerrainType.Shrine && '⛩️'}
              </div>
              <p className="text-2xl font-bold">{tile.terrain}</p>
              {tile.terrain === TerrainType.Bank && tile.bankType && (
                <p className="text-sm text-yellow-200 mt-2">
                  {tile.bankType === 'metal' && '⚙️ Metal Storage'}
                  {tile.bankType === 'energy' && '⚡ Energy Storage'}
                  {tile.bankType === 'exchange' && '🔄 Exchange'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Base Overlay Layer (if player's base) */}
        {isPlayerBase && !baseImageError && baseImagePath && (
          <Image
            src={baseImagePath}
            alt={`Rank ${playerRank} base`}
            fill
            className="object-cover z-10"
            onError={() => setBaseImageError(true)}
            priority
          />
        )}

        {/* Factory Overlay Layer (level-based) */}
        {tile.terrain === TerrainType.Factory && factoryData && factoryImagePath && !factoryImageError && (
          <Image
            src={factoryImagePath}
            alt={`Level ${factoryData.level} factory`}
            fill
            className="object-cover z-10"
            onError={() => setFactoryImageError(true)}
            priority
          />
        )}

        {/* Base Indicator Badge */}
        {tile.occupiedByBase && (
          <div className="absolute top-4 right-4 bg-green-600 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg z-20">
            🏠 BASE {isPlayerBase && playerRank > 1 ? `(Rank ${playerRank})` : !isPlayerBase && tile.baseOwner ? `(${tile.baseOwner})` : ''}
          </div>
        )}

        {/* Bank Type Indicator Badge */}
        {tile.terrain === TerrainType.Bank && tile.bankType && (
          <div className="absolute top-4 right-4 bg-yellow-500 text-black px-3 py-1 rounded-full text-sm font-bold shadow-lg z-20">
            {tile.bankType === 'metal' && '⚙️ Metal'}
            {tile.bankType === 'energy' && '⚡ Energy'}
            {tile.bankType === 'exchange' && '🔄 Exchange'}
          </div>
        )}

        {/* Shrine Indicator Badge */}
        {tile.terrain === TerrainType.Shrine && (
          <div className="absolute top-4 right-4 bg-purple-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg z-20">
            ⛩️ Shrine
          </div>
        )}
      </div>

      {/* Tile Info */}
      <div className="mt-4 bg-gray-800/60 backdrop-blur-md rounded-lg p-4 space-y-2 border-2 border-cyan-500/30 shadow-[0_0_20px_rgba(0,240,255,0.2)]">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold text-blue-400">
            {isAnyBase ? (
              <>
                <span className="text-green-400">🏠 {isPlayerBase ? 'Your Base' : 'Player Base'}</span>
                <span className="text-sm text-gray-400 ml-2">({tile.terrain} terrain)</span>
              </>
            ) : (
              tile.terrain
            )}
          </h3>
          <span className="font-mono text-sm text-gray-400">
            ({tile.x}, {tile.y})
          </span>
        </div>
        <p className="text-gray-300 text-sm">{getTerrainDescription(tile.terrain, tile.x, tile.y, isAnyBase, tile.bankType)}</p>
        
        {/* Base Greeting Display */}
        {isAnyBase && tile.baseGreeting && (
          <div className="mt-3 bg-gray-900/80 border border-cyan-500/40 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">📜 Base Message:</p>
            <SafeHtmlRenderer 
              html={tile.baseGreeting}
              fallback="Welcome to my base!"
              className="text-white text-sm"
            />
          </div>
        )}
        
        {/* Tile Interaction Buttons */}
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Bank Button */}
          {tile.terrain === TerrainType.Bank && (
            <button
              onClick={() => router.push('/game/bank')}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded transition-colors"
            >
              🏦 Open Bank
            </button>
          )}

          {/* Shrine Button */}
          {tile.terrain === TerrainType.Shrine && (
            <button
              onClick={() => router.push('/game/shrine')}
              className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-semibold px-4 py-2 rounded transition-colors"
            >
              ⛩️ Visit Shrine
            </button>
          )}

          {/* Factory Management Button - TODO: Create factory management page */}
          {/* {tile.terrain === TerrainType.Factory && factoryData?.owner === player?.username && (
            <button
              onClick={() => router.push('/game/factory-management')}
              className="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold px-4 py-2 rounded transition-colors"
            >
              🏭 Manage Factory
            </button>
          )} */}

          {/* Harvest Button - Shows on harvestable tiles */}
          {onHarvestClick && (tile.terrain === TerrainType.Metal || tile.terrain === TerrainType.Energy || tile.terrain === TerrainType.Cave || tile.terrain === TerrainType.Forest) && (
            <button
              onClick={onHarvestClick}
              disabled={isHarvesting}
              className={`w-full py-3 rounded-lg font-bold text-lg transition-all ${
                isHarvesting 
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                  : 'bg-green-600 hover:bg-green-500 text-white hover:shadow-lg'
              }`}
            >
              {isHarvesting ? 'HARVESTING...' : `HARVEST (${tile.terrain === TerrainType.Cave || tile.terrain === TerrainType.Forest ? 'F' : 'G'})`}
            </button>
          )}
        </div>
        
        {/* Bank/Shrine Controls Hint */}
        {tile.terrain === TerrainType.Bank && (
          <div className="mt-2 text-yellow-400 text-sm font-semibold">
            Press 'B' to open Bank interface
          </div>
        )}
        {tile.terrain === TerrainType.Shrine && (
          <div className="mt-2 text-purple-400 text-sm font-semibold">
            Press 'S' to open Shrine interface
          </div>
        )}
      </div>

      {/* Factory Info (if factory tile) */}
      {tile.terrain === TerrainType.Factory && factoryData && (
        <div className="mt-4 bg-gray-800 border-2 border-red-600 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-lg font-bold text-red-400">🏭 Factory Status</h4>
            {factoryData.owner && (
              <span className={`text-sm font-semibold ${factoryData.owner === player?.username ? 'text-green-400' : 'text-orange-400'}`}>
                {factoryData.owner === player?.username ? '✓ Your Factory' : `Owned by ${factoryData.owner}`}
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-900 p-2 rounded">
              <div className="text-gray-400">Defense</div>
              <div className="text-white font-bold">{factoryData.defense.toLocaleString()}</div>
            </div>
            <div className="bg-gray-900 p-2 rounded">
              <div className="text-gray-400">Production</div>
              <div className="text-white font-bold">{factoryData.productionRate}/hr</div>
            </div>
            <div className="bg-gray-900 p-2 rounded col-span-2">
              <div className="text-gray-400">Unit Slots</div>
              <div className="flex items-center justify-between">
                <div className="text-white font-bold">{factoryData.usedSlots} / {factoryData.slots}</div>
                <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500"
                    style={{ width: `${(factoryData.usedSlots / factoryData.slots) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Attack Factory Button */}
          {onAttackClick && (
            <button
              onClick={onAttackClick}
              disabled={isAttacking}
              className={`w-full py-3 rounded-lg font-bold text-lg transition-all ${
                isAttacking 
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                  : factoryData.owner === player?.username
                    ? 'bg-blue-600 hover:bg-blue-500 text-white hover:shadow-lg'
                    : 'bg-red-600 hover:bg-red-500 text-white hover:shadow-lg'
              }`}
            >
              {isAttacking ? 'ATTACKING...' : factoryData.owner === player?.username ? 'MANAGE FACTORY (R)' : 'ATTACK FACTORY (R)'}
            </button>
          )}
        </div>
      )}

      {/* Harvest Result Display (below tile image) */}
      {harvestResult && (
        <div className="mt-4 bg-gray-900 border-2 border-gray-700 rounded-lg p-4 animate-fade-in">
          {/* Success/Failure Message */}
          <div className={`font-bold text-center text-lg mb-3 ${harvestResult.success ? 'text-green-400' : 'text-red-400'}`}>
            {harvestResult.message || (harvestResult.success ? '✅ Success' : '❌ Failed')}
          </div>
          
          {/* Resource Results */}
          {harvestResult.success && (harvestResult.metalGained || harvestResult.energyGained) && (
            <div className="flex justify-center gap-6 mb-3">
              {harvestResult.metalGained && harvestResult.metalGained > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-2xl">⛏️</span>
                  <span className="text-yellow-400 font-bold text-xl">
                    +{harvestResult.metalGained.toLocaleString()}
                  </span>
                  <span className="text-gray-400">Metal</span>
                </div>
              )}
              {harvestResult.energyGained && harvestResult.energyGained > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-2xl">⚡</span>
                  <span className="text-blue-400 font-bold text-xl">
                    +{harvestResult.energyGained.toLocaleString()}
                  </span>
                  <span className="text-gray-400">Energy</span>
                </div>
              )}
            </div>
          )}

          {/* Cave Item Result */}
          {harvestResult.success && harvestResult.item && (
            <div className="flex items-center justify-center gap-3 mb-3 bg-purple-900 bg-opacity-30 p-3 rounded">
              <span className="text-3xl">🎁</span>
              <div>
                <div className="text-purple-400 font-bold">{harvestResult.item.name}</div>
                {harvestResult.item.description && (
                  <div className="text-gray-400 text-sm">{harvestResult.item.description}</div>
                )}
              </div>
            </div>
          )}

          {/* Bonus Applied */}
          {harvestResult.bonusApplied && harvestResult.bonusApplied > 0 && (
            <div className="text-center text-green-400 text-sm mb-2">
              💎 +{harvestResult.bonusApplied.toFixed(2)}% Bonus Applied
            </div>
          )}

          {/* Result Message */}
          <div className="text-gray-300 text-center text-sm whitespace-pre-line border-t border-gray-700 pt-3 mt-2">
            {harvestResult.message}
          </div>
        </div>
      )}

      {/* Attack Result Display (below tile image) */}
      {attackResult && (
        <div className="mt-4 bg-gray-900 border-2 border-red-800 rounded-lg p-4 animate-fade-in">
          <div className={`font-bold text-center text-lg mb-2 ${attackResult.success ? 'text-green-400' : 'text-red-400'}`}>
            {attackResult.captured ? '⚔️ FACTORY CAPTURED!' : attackResult.success ? '⚔️ Attack Successful' : '❌ Attack Failed'}
          </div>
          
          {/* Power Comparison */}
          <div className="flex justify-center gap-6 mb-3 bg-gray-800 p-3 rounded">
            <div className="text-center">
              <div className="text-sm text-gray-400 mb-1">Your Power</div>
              <div className="text-blue-400 font-bold text-xl">
                💪 {attackResult.playerPower.toLocaleString()}
              </div>
            </div>
            <div className="text-2xl text-gray-600 flex items-center">VS</div>
            <div className="text-center">
              <div className="text-sm text-gray-400 mb-1">Factory Defense</div>
              <div className="text-red-400 font-bold text-xl">
                🛡️ {attackResult.factoryDefense.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Capture Status */}
          {attackResult.captured && (
            <div className="flex items-center justify-center gap-3 mb-3 bg-green-900 bg-opacity-30 p-3 rounded">
              <span className="text-3xl">🏭</span>
              <div className="text-green-400 font-bold">Factory now under your control!</div>
            </div>
          )}

          {/* Damage Dealt */}
          {attackResult.damageDealt && attackResult.damageDealt > 0 && (
            <div className="text-center text-yellow-400 text-sm mb-2">
              ⚡ {attackResult.damageDealt} damage dealt
            </div>
          )}

          {/* Result Message */}
          <div className="text-gray-300 text-center text-sm whitespace-pre-line border-t border-gray-700 pt-3 mt-2">
            {attackResult.message}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// END OF FILE
// ============================================================
