// ============== SHARED TYPES FOR MULTIPLAYER PROTOTYPE ==============

// Simple Vec3 for positions/velocities
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// Simple Vec2 for rotations (yaw, pitch)
export interface Vec2 {
  x: number;
  y: number;
}

// ============== CLIENT → SERVER ==============

// Position update from client (client-authoritative movement)
export interface PositionUpdate {
  type: 'position_update';
  position: Vec3;        // Final position (not input)
  rotation: Vec2;        // Yaw/Pitch
  velocity: Vec3;        // For interpolation on other clients
  timestamp: number;     // Client timestamp
}

// Batch of position updates (30Hz)
export interface PositionBatch {
  type: 'position_batch';
  updates: PositionUpdate[];  // Usually 1-2 updates per batch
}

// Fire command from client (shooting)
export interface FireCommand {
  type: 'fire';
  timestamp: number;     // Client timestamp (for lag compensation)
  rayOrigin: Vec3;       // Ray start position (player position)
  rayDir: Vec3;          // Ray direction (normalized)
  weaponId: string;      // Weapon used
}

// ============== SERVER → CLIENT ==============

// Player state in snapshot
export interface PlayerState {
  id: string;
  position: Vec3;
  rotation: Vec2;      // Yaw, Pitch
  velocity: Vec3;
  health: number;      // 0-100
  isAlive: boolean;    // Dead or alive
  weaponId: string;    // Current weapon
  kills?: number;      // Kill count (optional, for scoreboard)
  deaths?: number;     // Death count (optional, for scoreboard)
  isLocal?: boolean;   // Flag for local player (optimization)
}

// Projectile state (fireball)
export interface ProjectileState {
  id: string;          // Unique projectile ID
  ownerId: string;     // Who shot this
  position: Vec3;      // Current position
  velocity: Vec3;      // Velocity vector
  createdAt: number;   // Timestamp when created
  lifetime: number;    // Remaining lifetime (seconds)
}

// Game snapshot
export interface Snapshot {
  type: 'snapshot';
  tick: number;        // Server tick
  timestamp: number;   // Server timestamp
  players: PlayerState[];
  projectiles: ProjectileState[];  // Active projectiles (fireballs)
}

// Player connected event
export interface PlayerJoinEvent {
  type: 'player_join';
  playerId: string;
  playerName: string;
}

// Player disconnected event
export interface PlayerLeaveEvent {
  type: 'player_leave';
  playerId: string;
}

// Welcome message when client connects
export interface WelcomeMessage {
  type: 'welcome';
  playerId: string;
  playerName: string;
}

// Damage event (someone took damage)
export interface DamageEvent {
  type: 'damage';
  victimId: string;      // Who got hit
  attackerId: string;    // Who shot
  damage: number;        // Damage amount
  weaponId: string;      // Weapon used
  newHealth: number;     // Victim's health after damage
}

// Death event (someone died)
export interface DeathEvent {
  type: 'death';
  victimId: string;      // Who died
  killerId: string;      // Who killed
  weaponId: string;      // Weapon used
}

// Respawn event (someone respawned)
export interface RespawnEvent {
  type: 'respawn';
  playerId: string;
  position: Vec3;        // Spawn position
}

// Union type for all server messages
export type ServerMessage =
  | Snapshot
  | PlayerJoinEvent
  | PlayerLeaveEvent
  | WelcomeMessage
  | DamageEvent
  | DeathEvent
  | RespawnEvent;

// Union type for all client messages
export type ClientMessage = PositionBatch | FireCommand;
