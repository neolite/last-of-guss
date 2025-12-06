// import { useState, useEffect } from 'react'; // Unused

interface HUDProps {
  health: number;
  kills: number;
  deaths: number;
  killfeed: Array<{
    id: string;
    killer: string;
    victim: string;
    weapon: string;
    timestamp: number;
  }>;
  showHitMarker?: boolean;
  ammo?: number;
  maxAmmo?: number;
  reloadProgress?: number;
  isReloading?: boolean;
  // Match state
  matchState?: 'waiting' | 'countdown' | 'active' | 'finished';
  matchTimeRemaining?: number; // milliseconds
  countdown?: number; // seconds for countdown
  scoreboard?: Array<{
    playerId: string;
    playerName: string;
    kills: number;
    deaths: number;
    placement: number;
  }>;
  winnerId?: string | null;
  winnerName?: string | null;
}

export function HUD({ health, kills, deaths, killfeed, showHitMarker, ammo = 30, maxAmmo = 30, reloadProgress = 0, isReloading = false, matchState = 'waiting', matchTimeRemaining, countdown, scoreboard, winnerId, winnerName }: HUDProps) {
  // Format time as MM:SS
  const formatTime = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        color: '#fff',
        fontFamily: 'monospace',
        fontSize: '14px',
      }}
    >
      {/* Crosshair */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '20px',
          height: '20px',
        }}
      >
        {/* Horizontal line */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '0',
            width: '100%',
            height: '2px',
            background: 'rgba(255, 255, 255, 0.8)',
            transform: 'translateY(-50%)',
          }}
        />
        {/* Vertical line */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '0',
            width: '2px',
            height: '100%',
            background: 'rgba(255, 255, 255, 0.8)',
            transform: 'translateX(-50%)',
          }}
        />
        {/* Center dot */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '4px',
            height: '4px',
            background: 'rgba(255, 0, 0, 0.9)',
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>

      {/* Hit marker */}
      {showHitMarker && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '40px',
            height: '40px',
            pointerEvents: 'none',
          }}
        >
          {/* X shape for hit marker */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '0',
              width: '100%',
              height: '3px',
              background: 'rgba(255, 0, 0, 0.9)',
              transform: 'translateY(-50%) rotate(45deg)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '0',
              width: '100%',
              height: '3px',
              background: 'rgba(255, 0, 0, 0.9)',
              transform: 'translateY(-50%) rotate(-45deg)',
            }}
          />
        </div>
      )}

      {/* Health bar - bottom left */}
      <div
        style={{
          position: 'absolute',
          bottom: '40px',
          left: '40px',
        }}
      >
        <div style={{ marginBottom: '8px', fontSize: '16px', fontWeight: 'bold' }}>
          HP: {health}
        </div>
        <div
          style={{
            width: '200px',
            height: '20px',
            background: 'rgba(0, 0, 0, 0.6)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: `${health}%`,
              height: '100%',
              background:
                health > 50
                  ? 'rgba(0, 255, 0, 0.8)'
                  : health > 25
                  ? 'rgba(255, 255, 0, 0.8)'
                  : 'rgba(255, 0, 0, 0.8)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Score - top left */}
      <div
        style={{
          position: 'absolute',
          top: '40px',
          left: '40px',
          background: 'rgba(0, 0, 0, 0.5)',
          padding: '12px 20px',
          borderRadius: '4px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '4px' }}>
          SCORE
        </div>
        <div>
          Kills: <span style={{ color: '#0f0' }}>{kills}</span>
        </div>
        <div>
          Deaths: <span style={{ color: '#f00' }}>{deaths}</span>
        </div>
        <div>
          K/D: {deaths === 0 ? kills.toFixed(2) : (kills / deaths).toFixed(2)}
        </div>
      </div>

      {/* Killfeed - top right */}
      <div
        style={{
          position: 'absolute',
          top: '40px',
          right: '40px',
          maxWidth: '400px',
        }}
      >
        {killfeed.slice(-5).reverse().map((entry) => (
          <div
            key={entry.id}
            style={{
              background: 'rgba(0, 0, 0, 0.7)',
              padding: '8px 12px',
              marginBottom: '4px',
              borderLeft: '3px solid rgba(255, 0, 0, 0.8)',
              animation: 'slideIn 0.3s ease-out',
            }}
          >
            <span style={{ color: '#f00', fontWeight: 'bold' }}>{entry.killer}</span>
            {' '}
            <span style={{ color: '#888' }}>[{entry.weapon}]</span>
            {' '}
            <span style={{ color: '#fff' }}>{entry.victim}</span>
          </div>
        ))}
      </div>

      {/* Ammo counter - bottom right */}
      <div
        style={{
          position: 'absolute',
          bottom: '40px',
          right: '40px',
        }}
      >
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.6)',
            padding: '16px 24px',
            borderRadius: '4px',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            textAlign: 'right',
          }}
        >
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>AMMO</div>
          <div
            style={{
              fontSize: '36px',
              fontWeight: 'bold',
              color: ammo === 0 ? '#f00' : ammo <= 10 ? '#ff0' : '#fff',
              lineHeight: '1',
            }}
          >
            {ammo}
            <span style={{ fontSize: '18px', color: '#888', marginLeft: '4px' }}>/ {maxAmmo}</span>
          </div>
          {ammo === 0 && !isReloading && (
            <div style={{ fontSize: '12px', color: '#f00', marginTop: '4px', animation: 'pulse 1s infinite' }}>
              RELOAD [R]
            </div>
          )}
          {isReloading && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '11px', color: '#ff0', marginBottom: '4px', textAlign: 'center' }}>
                RELOADING...
              </div>
              {/* Progress bar background */}
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  background: 'rgba(0, 0, 0, 0.7)',
                  border: '1px solid rgba(255, 255, 0, 0.5)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                {/* Progress bar fill */}
                <div
                  style={{
                    width: `${reloadProgress * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, rgba(255, 255, 0, 0.8), rgba(255, 200, 0, 0.9))',
                    transition: 'width 0.05s linear',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Instructions (when health is full = not damaged yet) */}
        {health === 100 && (
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.5)',
              padding: '12px 20px',
              borderRadius: '4px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              fontSize: '11px',
              marginTop: '12px',
            }}
          >
            <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>CONTROLS</div>
            <div>WASD - Move</div>
            <div>Mouse - Look</div>
            <div>Left Click - Shoot</div>
            <div>R - Reload</div>
          </div>
        )}
      </div>

      {/* Match timer - top center */}
      {matchState === 'active' && matchTimeRemaining !== undefined && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 0, 0, 0.7)',
            padding: '12px 24px',
            borderRadius: '6px',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            fontSize: '24px',
            fontWeight: 'bold',
            color: matchTimeRemaining < 30000 ? '#ff0' : '#fff',
          }}
        >
          {formatTime(matchTimeRemaining)}
        </div>
      )}

      {/* Waiting for players */}
      {matchState === 'waiting' && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '32px 48px',
            borderRadius: '8px',
            border: '2px solid rgba(255, 255, 255, 0.4)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '16px' }}>
            WAITING FOR PLAYERS...
          </div>
          <div style={{ fontSize: '16px', color: '#888' }}>
            Match starts when 2+ players join
          </div>
        </div>
      )}

      {/* Countdown */}
      {matchState === 'countdown' && countdown !== undefined && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '48px 64px',
            borderRadius: '8px',
            border: '3px solid rgba(255, 0, 0, 0.6)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '20px', color: '#888', marginBottom: '12px' }}>
            MATCH STARTING IN
          </div>
          <div
            style={{
              fontSize: '72px',
              fontWeight: 'bold',
              color: '#f00',
              textShadow: '0 0 20px rgba(255, 0, 0, 0.8)',
            }}
          >
            {Math.ceil(countdown)}
          </div>
        </div>
      )}

      {/* Match ended - Scoreboard */}
      {matchState === 'finished' && scoreboard && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0, 0, 0, 0.9)',
            padding: '32px',
            borderRadius: '8px',
            border: '3px solid rgba(255, 215, 0, 0.8)',
            minWidth: '500px',
            maxHeight: '70vh',
            overflowY: 'auto',
            pointerEvents: 'auto',
          }}
        >
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ffd700', marginBottom: '8px' }}>
              MATCH ENDED
            </div>
            {winnerName && (
              <div style={{ fontSize: '20px', color: '#0f0' }}>
                Winner: <span style={{ fontWeight: 'bold' }}>{winnerName}</span>
              </div>
            )}
          </div>

          {/* Scoreboard table */}
          <div>
            {/* Header row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr 80px 80px 80px',
                padding: '8px 12px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '4px',
                marginBottom: '8px',
                fontSize: '12px',
                fontWeight: 'bold',
                color: '#888',
              }}
            >
              <div>RANK</div>
              <div>PLAYER</div>
              <div style={{ textAlign: 'center' }}>KILLS</div>
              <div style={{ textAlign: 'center' }}>DEATHS</div>
              <div style={{ textAlign: 'center' }}>K/D</div>
            </div>

            {/* Player rows */}
            {scoreboard.map((entry) => (
              <div
                key={entry.playerId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 1fr 80px 80px 80px',
                  padding: '12px',
                  background:
                    entry.playerId === winnerId
                      ? 'rgba(255, 215, 0, 0.2)'
                      : 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '4px',
                  marginBottom: '4px',
                  border:
                    entry.playerId === winnerId
                      ? '1px solid rgba(255, 215, 0, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 'bold',
                    color:
                      entry.placement === 1
                        ? '#ffd700'
                        : entry.placement === 2
                        ? '#c0c0c0'
                        : entry.placement === 3
                        ? '#cd7f32'
                        : '#fff',
                  }}
                >
                  #{entry.placement}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{entry.playerName}</div>
                <div style={{ textAlign: 'center', color: '#0f0', fontSize: '16px' }}>
                  {entry.kills}
                </div>
                <div style={{ textAlign: 'center', color: '#f00', fontSize: '16px' }}>
                  {entry.deaths}
                </div>
                <div style={{ textAlign: 'center', fontSize: '16px' }}>
                  {entry.deaths === 0
                    ? entry.kills.toFixed(2)
                    : (entry.kills / entry.deaths).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
