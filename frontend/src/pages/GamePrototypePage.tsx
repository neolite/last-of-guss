import { useEffect, useRef, useState } from 'react';
import { GameEngine } from '../game/GameEngine';
import { HUD } from '../game/HUD';

export function GamePrototypePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  // HUD state
  const [health, setHealth] = useState(100);
  const [kills, setKills] = useState(0);
  const [deaths, setDeaths] = useState(0);
  const [killfeed, setKillfeed] = useState<Array<{
    id: string;
    killer: string;
    victim: string;
    weapon: string;
    timestamp: number;
  }>>([]);
  const [showHitMarker, setShowHitMarker] = useState(false);
  const [ammo, setAmmo] = useState(30);
  const [maxAmmo, setMaxAmmo] = useState(30);
  const [reloadProgress, setReloadProgress] = useState(0);
  const [isReloading, setIsReloading] = useState(false);

  // Match state
  const [matchState, setMatchState] = useState<'waiting' | 'countdown' | 'active' | 'finished'>('waiting');
  const [matchTimeRemaining, setMatchTimeRemaining] = useState<number | undefined>(undefined);
  const [countdown, setCountdown] = useState<number | undefined>(undefined);
  const [scoreboard, setScoreboard] = useState<Array<{
    playerId: string;
    playerName: string;
    kills: number;
    deaths: number;
    placement: number;
  }> | undefined>(undefined);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [winnerName, setWinnerName] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    console.log('[GamePrototypePage] Initializing game engine...');

    const engine = new GameEngine(canvasRef.current);
    engineRef.current = engine;

    // Setup HUD callbacks
    engine.onHealthUpdate = (newHealth) => setHealth(newHealth);
    engine.onScoreUpdate = (newKills, newDeaths) => {
      setKills(newKills);
      setDeaths(newDeaths);
    };
    engine.onKillfeed = (entry) => {
      setKillfeed((prev) => [...prev, { ...entry, timestamp: Date.now() }].slice(-10)); // Keep last 10
    };
    engine.onHitMarker = () => {
      setShowHitMarker(true);
      setTimeout(() => setShowHitMarker(false), 200); // Show for 200ms
    };
    engine.onAmmoUpdate = (current, max) => {
      setAmmo(current);
      setMaxAmmo(max);
    };
    engine.onReloadProgress = (progress, reloading) => {
      setReloadProgress(progress);
      setIsReloading(reloading);
    };

    // Match state callbacks
    engine.onMatchStateUpdate = (state, timeRemaining) => {
      setMatchState(state);
      setMatchTimeRemaining(timeRemaining);
    };
    engine.onMatchCountdown = (count) => {
      setCountdown(count);
    };
    engine.onMatchEnd = (board, wId, wName) => {
      setScoreboard(board);
      setWinnerId(wId);
      setWinnerName(wName);
    };

    // Start the engine
    engine
      .start()
      .then(() => {
        console.log('[GamePrototypePage] Game engine started');
        setStatus('connected');
      })
      .catch((err) => {
        console.error('[GamePrototypePage] Failed to start:', err);
        setStatus('error');
      });

    // Cleanup on unmount
    return () => {
      console.log('[GamePrototypePage] Cleaning up...');
      engine.dispose();
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: status === 'connected' ? 'pointer' : 'default',
        }}
      />

      {/* Status indicator (only when connecting/error) */}
      {status !== 'connected' && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '20px 40px',
            background: 'rgba(0, 0, 0, 0.9)',
            color: 'white',
            fontFamily: 'monospace',
            fontSize: 18,
            borderRadius: 8,
            border: '2px solid rgba(255, 255, 255, 0.3)',
          }}
        >
          {status === 'connecting' && '🔄 Connecting to server...'}
          {status === 'error' && '❌ Connection failed - Reload page to retry'}
        </div>
      )}

      {/* HUD (only when connected) */}
      {status === 'connected' && (
        <HUD
          health={health}
          kills={kills}
          deaths={deaths}
          killfeed={killfeed}
          showHitMarker={showHitMarker}
          ammo={ammo}
          maxAmmo={maxAmmo}
          reloadProgress={reloadProgress}
          isReloading={isReloading}
          matchState={matchState}
          matchTimeRemaining={matchTimeRemaining}
          countdown={countdown}
          scoreboard={scoreboard}
          winnerId={winnerId}
          winnerName={winnerName}
        />
      )}
    </div>
  );
}
