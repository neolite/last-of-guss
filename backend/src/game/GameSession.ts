import type { WebSocket } from '@fastify/websocket';
import type {
  Vec3,
  Vec2,
  PositionUpdate,
  PositionBatch,
  Snapshot,
  PlayerState,
  ProjectileState,
  WelcomeMessage,
  PlayerJoinEvent,
  PlayerLeaveEvent,
  FireCommand,
  DamageEvent,
  DeathEvent,
  RespawnEvent,
  MatchCountdownEvent,
  MatchStartEvent,
  MatchEndEvent,
} from './types.js';

// Player on server
interface ServerPlayer {
  id: string;
  name: string;
  socket: WebSocket;
  position: Vec3;
  rotation: Vec2;
  velocity: Vec3;
  lastUpdateTime: number;
  // Combat fields
  health: number;          // 0-100
  isAlive: boolean;        // Dead or alive
  weaponId: string;        // Current weapon
  kills: number;           // Kill count
  deaths: number;          // Death count
  spawnProtectionUntil: number; // Timestamp when spawn protection ends (0 = no protection)
}

// Sanity check constants
const MAX_SPEED = 12.0;        // units per second (10 + margin)
const MAX_TELEPORT = 5.0;      // max distance per update
const MAX_UPDATE_INTERVAL = 2.0; // max seconds between updates

// Combat constants
const WEAPON_DAMAGE: Record<string, number> = {
  rifle: 25,      // 4 shots to kill (100 HP)
  pistol: 20,     // 5 shots to kill
  shotgun: 50,    // 2 shots to kill
};

const PLAYER_HITBOX_RADIUS = 0.4; // Player capsule radius
const PLAYER_HEIGHT = 1.8; // Player capsule height (from feet to head)
const RESPAWN_DELAY = 3000; // 3 seconds
const SPAWN_PROTECTION_DURATION = 2000; // 2 seconds invulnerability after spawn

// Projectile constants
const PROJECTILE_SPEED = 25;         // units per second (faster than old 12)
const PROJECTILE_LIFETIME = 5;       // seconds
const PROJECTILE_HITBOX_RADIUS = 0.5; // collision radius
const PROJECTILE_DAMAGE = 25;        // damage per hit

// Historical frame for lag compensation
interface HistoricalFrame {
  tick: number;
  timestamp: number;
  playerStates: Map<string, {
    position: Vec3;
    rotation: Vec2;
  }>;
}

// Server-side projectile
interface ServerProjectile {
  id: string;
  ownerId: string;     // Who shot this
  position: Vec3;
  velocity: Vec3;
  createdAt: number;   // Timestamp
  lifetime: number;    // Remaining lifetime (seconds)
}

// Match state
enum MatchState {
  WAITING = 'waiting',      // Waiting for players
  COUNTDOWN = 'countdown',  // 5 second countdown before match start
  ACTIVE = 'active',        // Match in progress
  FINISHED = 'finished',    // Match ended, showing results
}

export class GameSession {
  private players: Map<string, ServerPlayer> = new Map();
  private projectiles: Map<string, ServerProjectile> = new Map();
  private projectileIdCounter: number = 0;
  private tick: number = 0;
  private tickRate: number = 30; // 30Hz
  private tickInterval: NodeJS.Timeout | null = null;

  // Lag compensation: history buffer (10 frames = 333ms at 30Hz)
  private historyBuffer: HistoricalFrame[] = [];
  private readonly MAX_HISTORY_FRAMES = 10;

  // Match state
  private matchState: MatchState = MatchState.WAITING;
  private matchDuration: number = 5 * 60 * 1000; // 5 minutes default
  private matchStartTime: number = 0;
  private matchEndTime: number = 0;
  private countdownStartTime: number = 0;
  private readonly COUNTDOWN_DURATION = 5000; // 5 seconds

  constructor(public sessionId: string, matchDurationMinutes: number = 5) {
    console.log(`[GameSession] Created session: ${sessionId} (${matchDurationMinutes} min)`);
    this.matchDuration = matchDurationMinutes * 60 * 1000;
  }

  // Start the game loop
  start() {
    if (this.tickInterval) return; // Already running

    console.log(`[GameSession] Starting 30Hz tick loop`);
    this.tickInterval = setInterval(() => this.update(), 1000 / this.tickRate);
  }

  // Stop the game loop
  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
      console.log(`[GameSession] Stopped tick loop`);
    }
  }

  // Add player to session
  addPlayer(playerId: string, playerName: string, socket: WebSocket) {
    console.log(`[GameSession] Player joined: ${playerName} (${playerId})`);

    // Create player at smart spawn position
    const spawnPos = this.getSpawnPoint();
    const now = Date.now();
    const player: ServerPlayer = {
      id: playerId,
      name: playerName,
      socket,
      position: spawnPos,
      rotation: { x: 0, y: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      lastUpdateTime: now,
      // Combat fields
      health: 100,
      isAlive: true,
      weaponId: 'rifle',  // Default weapon
      kills: 0,
      deaths: 0,
      spawnProtectionUntil: now + SPAWN_PROTECTION_DURATION, // 2 sec protection
    };

    this.players.set(playerId, player);

    // Send welcome message to new player
    const welcomeMsg: WelcomeMessage = {
      type: 'welcome',
      playerId,
      playerName,
    };
    this.sendToPlayer(playerId, welcomeMsg);

    // Notify all other players
    const joinEvent: PlayerJoinEvent = {
      type: 'player_join',
      playerId,
      playerName,
    };
    this.broadcast(joinEvent, playerId); // Exclude new player

    // Setup socket handlers
    socket.on('message', (rawData) => {
      try {
        const data = JSON.parse(rawData.toString());
        this.handlePlayerMessage(playerId, data);
      } catch (e) {
        console.error(`[GameSession] Failed to parse message from ${playerId}:`, e);
      }
    });

    socket.on('close', () => {
      this.removePlayer(playerId);
    });

    socket.on('error', (err) => {
      console.error(`[GameSession] Socket error for ${playerId}:`, err);
      this.removePlayer(playerId);
    });

    // Start game loop if first player
    if (this.players.size === 1) {
      this.start();
    }
  }

  // Remove player from session
  removePlayer(playerId: string) {
    const player = this.players.get(playerId);
    if (!player) return;

    console.log(`[GameSession] Player left: ${player.name} (${playerId})`);
    this.players.delete(playerId);

    // Notify remaining players
    const leaveEvent: PlayerLeaveEvent = {
      type: 'player_leave',
      playerId,
    };
    this.broadcast(leaveEvent);

    // Stop game loop if no players
    if (this.players.size === 0) {
      this.stop();
    }
  }

  // Handle message from player (client-authoritative position updates)
  handlePlayerMessage(playerId: string, message: any) {
    const player = this.players.get(playerId);
    if (!player) return;

    // Handle position batch
    if (message.type === 'position_batch') {
      const batch = message as PositionBatch;

      // Process each position update
      for (const update of batch.updates) {
        // Sanity checks
        if (!this.validateMovement(player, update)) {
          console.warn(`[GameSession] Invalid movement from ${playerId} - rejecting`);
          continue;
        }

        // Update player state (trust client)
        player.position = update.position;
        player.rotation = update.rotation;
        player.velocity = update.velocity;
        player.lastUpdateTime = Date.now();
      }
    }

    // Handle fire command
    if (message.type === 'fire') {
      this.handleFireCommand(playerId, message as FireCommand);
    }
  }

  // Validate movement (sanity checks)
  private validateMovement(player: ServerPlayer, update: PositionUpdate): boolean {
    const now = Date.now();
    const dt = (now - player.lastUpdateTime) / 1000;

    // Timeout check (client disconnected/lagging badly)
    if (dt > MAX_UPDATE_INTERVAL) {
      console.warn(`[GameSession] Player ${player.id}: Update interval too large (${dt.toFixed(2)}s)`);
      // Allow but reset time
      player.lastUpdateTime = now;
      return true; // Allow first update after lag
    }

    // Max speed check
    const dx = update.position.x - player.position.x;
    const dy = update.position.y - player.position.y;
    const dz = update.position.z - player.position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const speed = distance / dt;

    if (speed > MAX_SPEED) {
      console.warn(`[GameSession] Player ${player.id}: Speed too high (${speed.toFixed(2)} > ${MAX_SPEED})`);
      return false; // Reject
    }

    // Teleport check
    if (distance > MAX_TELEPORT) {
      console.warn(`[GameSession] Player ${player.id}: Teleport detected (${distance.toFixed(2)} > ${MAX_TELEPORT})`);
      return false; // Reject
    }

    // World bounds (F.E.A.R. facility)
    if (update.position.x < -7.5 || update.position.x > 7.5) {
      console.warn(`[GameSession] Player ${player.id}: Out of bounds X (${update.position.x})`);
      return false;
    }
    if (update.position.z < -21.5 || update.position.z > 21.5) {
      console.warn(`[GameSession] Player ${player.id}: Out of bounds Z (${update.position.z})`);
      return false;
    }
    if (update.position.y < 0.5 || update.position.y > 5) {
      console.warn(`[GameSession] Player ${player.id}: Out of bounds Y (${update.position.y})`);
      return false;
    }

    return true; // Valid
  }

  // Main update loop (30Hz) - simplified for client-authoritative movement
  private update() {
    this.tick++;

    const dt = 1 / this.tickRate; // Delta time in seconds (0.0333s at 30Hz)
    const now = Date.now();

    // Update match state
    this.updateMatchState(now);

    // Only update gameplay if match is active
    if (this.matchState === MatchState.ACTIVE) {
      // Update projectiles (movement + collisions)
      this.updateProjectiles(dt);
    }

    // Save current frame to history (for lag compensation)
    this.saveToHistory();

    // Client-authoritative: positions already updated in handlePlayerMessage
    // Server just broadcasts current state to all clients
    this.broadcastSnapshot();
  }

  // Update match state machine
  private updateMatchState(now: number) {
    switch (this.matchState) {
      case MatchState.WAITING:
        // Start countdown when we have 2+ players
        if (this.players.size >= 2) {
          this.startCountdown();
        }
        break;

      case MatchState.COUNTDOWN:
        // Check if countdown finished
        if (now >= this.countdownStartTime + this.COUNTDOWN_DURATION) {
          this.startMatch();
        }
        break;

      case MatchState.ACTIVE:
        // Check if match time expired
        if (now >= this.matchEndTime) {
          this.endMatch();
        }
        break;

      case MatchState.FINISHED:
        // TODO: Could auto-restart match after X seconds
        break;
    }
  }

  // Start countdown (5 seconds before match)
  private startCountdown() {
    this.matchState = MatchState.COUNTDOWN;
    this.countdownStartTime = Date.now();
    console.log(`[GameSession] Countdown started (${this.COUNTDOWN_DURATION / 1000}s)`);

    // Reset all player stats
    this.players.forEach((player) => {
      player.kills = 0;
      player.deaths = 0;
    });

    // Broadcast countdown event
    const countdownEvent: MatchCountdownEvent = {
      type: 'match_countdown',
      countdown: this.COUNTDOWN_DURATION / 1000,
    };
    this.broadcast(countdownEvent);
  }

  // Start actual match
  private startMatch() {
    this.matchState = MatchState.ACTIVE;
    this.matchStartTime = Date.now();
    this.matchEndTime = this.matchStartTime + this.matchDuration;
    console.log(`[GameSession] Match started! Duration: ${this.matchDuration / 1000}s`);

    // Broadcast match start event
    const matchStartEvent: MatchStartEvent = {
      type: 'match_start',
      duration: this.matchDuration,
      startTime: this.matchStartTime,
      endTime: this.matchEndTime,
    };
    this.broadcast(matchStartEvent);
  }

  // End match and determine winner
  private endMatch() {
    this.matchState = MatchState.FINISHED;
    console.log(`[GameSession] Match ended!`);

    // Build scoreboard sorted by kills (descending)
    const scoreboard = Array.from(this.players.values())
      .map((player) => ({
        playerId: player.id,
        playerName: player.name,
        kills: player.kills,
        deaths: player.deaths,
        placement: 0, // Will be set below
      }))
      .sort((a, b) => b.kills - a.kills); // Sort by kills descending

    // Assign placements
    scoreboard.forEach((entry, index) => {
      entry.placement = index + 1;
    });

    // Find winner (first in scoreboard)
    const winner = scoreboard.length > 0 ? scoreboard[0] : null;

    if (winner) {
      console.log(`[GameSession] Winner: ${winner.playerName} with ${winner.kills} kills!`);
    }

    // Broadcast match end event
    const matchEndEvent: MatchEndEvent = {
      type: 'match_end',
      winnerId: winner?.playerId || null,
      winnerName: winner?.playerName || null,
      scoreboard,
    };
    this.broadcast(matchEndEvent);

    // TODO: Save results to database
  }

  // Update all projectiles (physics + collision detection)
  private updateProjectiles(dt: number) {
    const toRemove: string[] = [];

    this.projectiles.forEach((projectile, id) => {
      // Move projectile
      projectile.position.x += projectile.velocity.x * dt;
      projectile.position.y += projectile.velocity.y * dt;
      projectile.position.z += projectile.velocity.z * dt;

      // Decrease lifetime
      projectile.lifetime -= dt;

      // Check if expired
      if (projectile.lifetime <= 0) {
        toRemove.push(id);
        return;
      }

      // Check collision with players
      let hitPlayer = false;
      this.players.forEach((player, playerId) => {
        // Skip if already hit or if it's the owner
        if (hitPlayer || playerId === projectile.ownerId || !player.isAlive) return;

        // Check spawn protection
        const now = Date.now();
        if (now < player.spawnProtectionUntil) {
          // Player has spawn protection - skip damage
          return;
        }

        // Sphere-capsule collision (projectile is sphere, player is capsule)
        const distance = this.distanceToPlayerCapsule(
          projectile.position,
          player.position,
          PLAYER_HEIGHT
        );

        if (distance < PROJECTILE_HITBOX_RADIUS + PLAYER_HITBOX_RADIUS) {
          // HIT!
          console.log(`[GameSession] Projectile ${id} hit ${player.name}`);

          // Apply damage
          player.health = Math.max(0, player.health - PROJECTILE_DAMAGE);

          // Check for kill
          const isKill = player.health <= 0;
          if (isKill) {
            player.isAlive = false;

            const shooter = this.players.get(projectile.ownerId);
            if (shooter) {
              shooter.kills++;
            }
            player.deaths++;

            console.log(`[GameSession] ${shooter?.name || 'Unknown'} killed ${player.name} with projectile!`);

            // Broadcast death event
            const deathEvent: DeathEvent = {
              type: 'death',
              victimId: player.id,
              killerId: projectile.ownerId,
              weaponId: 'rifle',
            };
            this.broadcast(deathEvent);

            // Schedule respawn
            setTimeout(() => this.respawnPlayer(player.id), RESPAWN_DELAY);
          }

          // Broadcast damage event
          const damageEvent: DamageEvent = {
            type: 'damage',
            victimId: player.id,
            attackerId: projectile.ownerId,
            damage: PROJECTILE_DAMAGE,
            weaponId: 'rifle',
            newHealth: player.health,
          };
          this.broadcast(damageEvent);

          // Remove projectile after hit
          toRemove.push(id);
          hitPlayer = true;
        }
      });

      // Check collision with world bounds (simple AABB)
      if (
        projectile.position.x < -7.5 || projectile.position.x > 7.5 ||
        projectile.position.y < 0 || projectile.position.y > 5 ||
        projectile.position.z < -21.5 || projectile.position.z > 21.5
      ) {
        // Hit wall/floor/ceiling - remove projectile
        toRemove.push(id);
      }
    });

    // Remove expired/hit projectiles
    toRemove.forEach((id) => this.projectiles.delete(id));
  }

  // Calculate distance from point to player capsule (simplified)
  private distanceToPlayerCapsule(point: Vec3, playerPos: Vec3, height: number): number {
    // Capsule bottom and top
    const bottom = playerPos;
    const top = { x: playerPos.x, y: playerPos.y + height, z: playerPos.z };

    // Vector from bottom to top
    const capsuleAxis = {
      x: top.x - bottom.x,
      y: top.y - bottom.y,
      z: top.z - bottom.z,
    };

    // Vector from bottom to point
    const bottomToPoint = {
      x: point.x - bottom.x,
      y: point.y - bottom.y,
      z: point.z - bottom.z,
    };

    // Project point onto capsule axis
    const axisDotAxis = capsuleAxis.x ** 2 + capsuleAxis.y ** 2 + capsuleAxis.z ** 2;
    const projection = (
      (bottomToPoint.x * capsuleAxis.x +
        bottomToPoint.y * capsuleAxis.y +
        bottomToPoint.z * capsuleAxis.z) /
      axisDotAxis
    );

    // Clamp to [0, 1] (within capsule height)
    const t = Math.max(0, Math.min(1, projection));

    // Closest point on capsule axis
    const closest = {
      x: bottom.x + capsuleAxis.x * t,
      y: bottom.y + capsuleAxis.y * t,
      z: bottom.z + capsuleAxis.z * t,
    };

    // Distance from point to closest point
    const dx = point.x - closest.x;
    const dy = point.y - closest.y;
    const dz = point.z - closest.z;

    return Math.sqrt(dx ** 2 + dy ** 2 + dz ** 2);
  }

  // Save current frame to history buffer (for lag compensation)
  private saveToHistory() {
    const frame: HistoricalFrame = {
      tick: this.tick,
      timestamp: Date.now(),
      playerStates: new Map(),
    };

    // Copy current player positions
    this.players.forEach((player, id) => {
      frame.playerStates.set(id, {
        position: { ...player.position },
        rotation: { ...player.rotation },
      });
    });

    // Add to buffer
    this.historyBuffer.push(frame);

    // Keep only last MAX_HISTORY_FRAMES frames
    if (this.historyBuffer.length > this.MAX_HISTORY_FRAMES) {
      this.historyBuffer.shift();
    }
  }

  // Find historical frame closest to target timestamp (for lag compensation)
  private findHistoricalFrame(targetTimestamp: number): HistoricalFrame | null {
    if (this.historyBuffer.length === 0) return null;

    // Find closest frame
    let closest: HistoricalFrame | null = null;
    let minDiff = Infinity;

    for (const frame of this.historyBuffer) {
      const diff = Math.abs(frame.timestamp - targetTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = frame;
      }
    }

    return closest;
  }

  // Broadcast snapshot to all players
  private broadcastSnapshot() {
    const now = Date.now();
    const matchTimeRemaining = this.matchState === MatchState.ACTIVE
      ? Math.max(0, this.matchEndTime - now)
      : undefined;

    const snapshot: Snapshot = {
      type: 'snapshot',
      tick: this.tick,
      timestamp: now,
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        position: { ...p.position },
        rotation: { ...p.rotation },
        velocity: { ...p.velocity },
        health: p.health,
        isAlive: p.isAlive,
        weaponId: p.weaponId,
        kills: p.kills,
        deaths: p.deaths,
      })),
      projectiles: Array.from(this.projectiles.values()).map((proj) => ({
        id: proj.id,
        ownerId: proj.ownerId,
        position: { ...proj.position },
        velocity: { ...proj.velocity },
        createdAt: proj.createdAt,
        lifetime: proj.lifetime,
      })),
      matchState: this.matchState,
      matchTimeRemaining,
    };

    this.broadcast(snapshot);
  }

  // Send message to specific player
  private sendToPlayer(playerId: string, message: any) {
    const player = this.players.get(playerId);
    if (!player || !player.socket) return;

    // Check if socket is ready (readyState might not be immediately available)
    const readyState = (player.socket as any).readyState;
    if (readyState !== undefined && readyState !== 1) return; // 1 = OPEN

    try {
      player.socket.send(JSON.stringify(message));
    } catch (e) {
      console.error(`[GameSession] Failed to send to ${playerId}:`, e);
    }
  }

  // Broadcast message to all players (optionally exclude one)
  private broadcast(message: any, excludePlayerId?: string) {
    const payload = JSON.stringify(message);

    for (const player of this.players.values()) {
      if (excludePlayerId && player.id === excludePlayerId) continue;
      if (!player.socket) continue;

      // Check if socket is ready
      const readyState = (player.socket as any).readyState;
      if (readyState !== undefined && readyState !== 1) continue; // Skip closed sockets

      try {
        player.socket.send(payload);
      } catch (e) {
        console.error(`[GameSession] Failed to broadcast to ${player.id}:`, e);
      }
    }
  }

  // Check if session is empty
  isEmpty(): boolean {
    return this.players.size === 0;
  }

  // Handle fire command - create projectile instead of raycast
  private handleFireCommand(shooterId: string, cmd: FireCommand) {
    const shooter = this.players.get(shooterId);
    if (!shooter || !shooter.isAlive) return;

    // Generate unique projectile ID
    const projectileId = `${this.sessionId}_${shooterId}_${this.projectileIdCounter++}`;

    // Create projectile at shooter position, flying in rayDir
    const projectile: ServerProjectile = {
      id: projectileId,
      ownerId: shooterId,
      position: { ...cmd.rayOrigin },  // Start at shooter position
      velocity: {
        x: cmd.rayDir.x * PROJECTILE_SPEED,
        y: cmd.rayDir.y * PROJECTILE_SPEED,
        z: cmd.rayDir.z * PROJECTILE_SPEED,
      },
      createdAt: Date.now(),
      lifetime: PROJECTILE_LIFETIME,
    };

    this.projectiles.set(projectileId, projectile);

    console.log(`[GameSession] ${shooter.name} created projectile ${projectileId} at`, projectile.position);
  }

  // Raycast against all players (with lag compensation)
  private raycastAgainstPlayers(
    rayOrigin: Vec3,
    rayDir: Vec3,
    shooterId: string,
    historicalFrame: HistoricalFrame | null
  ): { hit: boolean; victimId?: string; distance?: number } {
    let closestHit: { hit: boolean; victimId?: string; distance?: number } = { hit: false };
    let closestDistance = Infinity;

    // If we have historical frame, use it; otherwise use current positions
    const playerStates = historicalFrame
      ? historicalFrame.playerStates
      : new Map(
          Array.from(this.players.entries()).map(([id, p]) => [
            id,
            { position: p.position, rotation: p.rotation },
          ])
        );

    playerStates.forEach((state, playerId) => {
      // Skip shooter and dead players
      const player = this.players.get(playerId);
      if (playerId === shooterId || !player || !player.isAlive) return;

      // Ray-capsule intersection test (player is a capsule from feet to head)
      const capsuleBottom = state.position;
      const capsuleTop = {
        x: state.position.x,
        y: state.position.y + PLAYER_HEIGHT,
        z: state.position.z,
      };

      const hitDistance = this.rayCapsuleIntersection(
        rayOrigin,
        rayDir,
        capsuleBottom,
        capsuleTop,
        PLAYER_HITBOX_RADIUS
      );

      if (hitDistance !== null && hitDistance < closestDistance) {
        closestDistance = hitDistance;
        closestHit = { hit: true, victimId: playerId, distance: hitDistance };
      }
    });

    return closestHit;
  }

  // Ray-capsule intersection (returns distance or null)
  // Capsule is defined by bottom and top points + radius
  private rayCapsuleIntersection(
    rayOrigin: Vec3,
    rayDir: Vec3,
    capsuleBottom: Vec3,
    capsuleTop: Vec3,
    capsuleRadius: number
  ): number | null {
    // Capsule axis
    const capsuleAxis = {
      x: capsuleTop.x - capsuleBottom.x,
      y: capsuleTop.y - capsuleBottom.y,
      z: capsuleTop.z - capsuleBottom.z,
    };

    // Vector from capsule bottom to ray origin
    const originToBottom = {
      x: rayOrigin.x - capsuleBottom.x,
      y: rayOrigin.y - capsuleBottom.y,
      z: rayOrigin.z - capsuleBottom.z,
    };

    // Dot products
    const rayDotAxis = rayDir.x * capsuleAxis.x + rayDir.y * capsuleAxis.y + rayDir.z * capsuleAxis.z;
    const originDotAxis = originToBottom.x * capsuleAxis.x + originToBottom.y * capsuleAxis.y + originToBottom.z * capsuleAxis.z;
    const axisDotAxis = capsuleAxis.x * capsuleAxis.x + capsuleAxis.y * capsuleAxis.y + capsuleAxis.z * capsuleAxis.z;
    const rayDotRay = rayDir.x * rayDir.x + rayDir.y * rayDir.y + rayDir.z * rayDir.z;
    const originDotRay = originToBottom.x * rayDir.x + originToBottom.y * rayDir.y + originToBottom.z * rayDir.z;
    const originDotOrigin = originToBottom.x * originToBottom.x + originToBottom.y * originToBottom.y + originToBottom.z * originToBottom.z;

    // Quadratic coefficients for infinite cylinder
    const a = rayDotRay - (rayDotAxis * rayDotAxis) / axisDotAxis;
    const b = 2.0 * (originDotRay - (rayDotAxis * originDotAxis) / axisDotAxis);
    const c = originDotOrigin - (originDotAxis * originDotAxis) / axisDotAxis - capsuleRadius * capsuleRadius;

    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
      return null; // No intersection with infinite cylinder
    }

    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2.0 * a);
    const t2 = (-b + sqrtDisc) / (2.0 * a);

    // Check if intersection points are within capsule height
    const checkIntersection = (t: number): number | null => {
      if (t < 0) return null;

      // Point on ray
      const hitPoint = {
        x: rayOrigin.x + rayDir.x * t,
        y: rayOrigin.y + rayDir.y * t,
        z: rayOrigin.z + rayDir.z * t,
      };

      // Project onto capsule axis
      const hitToBottom = {
        x: hitPoint.x - capsuleBottom.x,
        y: hitPoint.y - capsuleBottom.y,
        z: hitPoint.z - capsuleBottom.z,
      };

      const projection = (hitToBottom.x * capsuleAxis.x + hitToBottom.y * capsuleAxis.y + hitToBottom.z * capsuleAxis.z) / axisDotAxis;

      // Check if within capsule height
      if (projection >= 0 && projection <= 1) {
        return t;
      }

      return null;
    };

    const hit1 = checkIntersection(t1);
    const hit2 = checkIntersection(t2);

    if (hit1 !== null && hit2 !== null) {
      return Math.min(hit1, hit2);
    } else if (hit1 !== null) {
      return hit1;
    } else if (hit2 !== null) {
      return hit2;
    }

    // Check hemisphere caps (sphere at top and bottom)
    const checkCap = (center: Vec3): number | null => {
      const oc = {
        x: rayOrigin.x - center.x,
        y: rayOrigin.y - center.y,
        z: rayOrigin.z - center.z,
      };

      const a = rayDotRay;
      const b = 2.0 * (oc.x * rayDir.x + oc.y * rayDir.y + oc.z * rayDir.z);
      const c = oc.x * oc.x + oc.y * oc.y + oc.z * oc.z - capsuleRadius * capsuleRadius;

      const disc = b * b - 4 * a * c;

      if (disc < 0) return null;

      const t = (-b - Math.sqrt(disc)) / (2.0 * a);
      return t >= 0 ? t : null;
    };

    const bottomCap = checkCap(capsuleBottom);
    const topCap = checkCap(capsuleTop);

    const closestCap = (() => {
      if (bottomCap !== null && topCap !== null) return Math.min(bottomCap, topCap);
      if (bottomCap !== null) return bottomCap;
      if (topCap !== null) return topCap;
      return null;
    })();

    return closestCap;
  }

  // Spawn points (F.E.A.R. facility layout)
  // Spawn points for Shipment map (15x43 arena)
  private readonly SPAWN_POINTS: Vec3[] = [
    { x: -6, y: 1, z: -18 },   // Front-left corner (near container)
    { x: 6, y: 1, z: -18 },    // Front-right corner
    { x: -6, y: 1, z: 18 },    // Back-left corner
    { x: 6, y: 1, z: 18 },     // Back-right corner
    { x: -3, y: 1, z: 0 },     // Center-left lane
    { x: 3, y: 1, z: 0 },      // Center-right lane
    { x: 0, y: 1, z: -10 },    // Front-center
    { x: 0, y: 1, z: 10 },     // Back-center
  ];

  // Get smart spawn point (far from enemies)
  private getSpawnPoint(): Vec3 {
    if (this.players.size === 0) {
      // First player - use first spawn
      return { ...this.SPAWN_POINTS[0] };
    }

    // Find spawn point farthest from all alive players
    let bestSpawn = this.SPAWN_POINTS[0];
    let maxMinDistance = 0;

    for (const spawnPoint of this.SPAWN_POINTS) {
      // Calculate minimum distance to any alive player
      let minDistance = Infinity;

      for (const player of this.players.values()) {
        if (!player.isAlive) continue;

        const dx = spawnPoint.x - player.position.x;
        const dy = spawnPoint.y - player.position.y;
        const dz = spawnPoint.z - player.position.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance < minDistance) {
          minDistance = distance;
        }
      }

      // Choose spawn with maximum minimum distance (farthest from all enemies)
      if (minDistance > maxMinDistance) {
        maxMinDistance = minDistance;
        bestSpawn = spawnPoint;
      }
    }

    return { ...bestSpawn };
  }

  // Respawn player at smart spawn point
  private respawnPlayer(playerId: string) {
    const player = this.players.get(playerId);
    if (!player) return;

    const now = Date.now();

    // Reset player state
    player.health = 100;
    player.isAlive = true;
    player.spawnProtectionUntil = now + SPAWN_PROTECTION_DURATION; // 2 sec protection

    // Smart spawn selection (far from enemies)
    player.position = this.getSpawnPoint();
    player.rotation = { x: 0, y: 0 };
    player.velocity = { x: 0, y: 0, z: 0 };

    console.log(`[GameSession] ${player.name} respawned at (${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)}) with spawn protection`);

    // Broadcast respawn event
    const respawnEvent: RespawnEvent = {
      type: 'respawn',
      playerId: player.id,
      position: player.position,
    };
    this.broadcast(respawnEvent);
  }
}
