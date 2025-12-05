import * as THREE from 'three';
import { NetworkManager } from './NetworkManager';
import { InputManager } from './InputManager';
import { MapGeometry } from './MapGeometry';
import { CollisionDetector } from './CollisionDetector';
import type { PlayerState, ProjectileState, Vec3, Vec2 } from './types';

// Local player (with client-side prediction)
class LocalPlayer {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  velocity: THREE.Vector3;
  mesh: THREE.Mesh;
  collisionDetector: CollisionDetector | null = null;

  // Capsule collision params
  private readonly capsuleRadius = 0.5; // Player radius
  private readonly capsuleHeight = 1.8; // Player height

  constructor(scene: THREE.Scene) {
    this.position = new THREE.Vector3(0, 1, 0);
    this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    this.velocity = new THREE.Vector3(0, 0, 0);

    // Create cube mesh
    const geometry = new THREE.BoxGeometry(1, 1.8, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.position.copy(this.position);
    scene.add(this.mesh);
  }

  // Apply movement (client-side prediction)
  // NOTE: Called every frame (60fps) for smooth movement
  applyMovement(moveX: number, moveY: number, lookDeltaX: number, lookDeltaY: number, dt: number) {
    const MOVE_SPEED = 5.0;
    const MOUSE_SENSITIVITY = 0.002;

    // Update rotation from mouse
    this.rotation.y -= lookDeltaX * MOUSE_SENSITIVITY;
    this.rotation.x -= lookDeltaY * MOUSE_SENSITIVITY;

    // Clamp pitch
    this.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotation.x));

    // Calculate movement direction (inverted Z for correct forward/backward)
    const forward = new THREE.Vector3(
      -Math.sin(this.rotation.y),  // Inverted X
      0,
      -Math.cos(this.rotation.y)   // Inverted Z for correct direction
    );
    const right = new THREE.Vector3(
      Math.cos(this.rotation.y),
      0,
      -Math.sin(this.rotation.y)
    );

    // Apply movement (accelerate velocity)
    const moveForce = MOVE_SPEED * dt;
    this.velocity.x += (forward.x * moveY + right.x * moveX) * moveForce;
    this.velocity.z += (forward.z * moveY + right.z * moveX) * moveForce;

    // Update position (NOTE: friction is NOT applied here - only on server reconciliation)
    this.position.add(this.velocity.clone().multiplyScalar(dt));

    // Ground constraint
    if (this.position.y < 1) {
      this.position.y = 1;
      this.velocity.y = 0;
    }

    // World bounds (Shipment map limits)
    this.position.x = Math.max(-7.5, Math.min(7.5, this.position.x));
    this.position.z = Math.max(-21.5, Math.min(21.5, this.position.z));

    // Collision detection with map geometry
    if (this.collisionDetector) {
      const collision = this.collisionDetector.checkCapsuleCollision(
        this.position,
        this.capsuleRadius,
        this.capsuleHeight
      );

      if (collision) {
        // Push player out of collision
        this.position.add(collision);

        // Zero velocity in collision direction (slide along walls)
        const collisionDir = collision.clone().normalize();
        const velocityDot = this.velocity.dot(collisionDir);
        if (velocityDot < 0) {
          this.velocity.sub(collisionDir.multiplyScalar(velocityDot));
        }
      }
    }

    // Update mesh
    this.mesh.position.copy(this.position);
  }

  // Apply friction (called at 30Hz matching server tick rate)
  applyFriction() {
    const FRICTION = 0.9;
    this.velocity.x *= FRICTION;
    this.velocity.z *= FRICTION;
  }
}

// Remote player (with interpolation)
class RemotePlayer {
  id: string;
  mesh: THREE.Mesh;

  // Snapshot buffer for interpolation
  snapshotBuffer: Array<{
    timestamp: number;
    position: THREE.Vector3;
    rotation: THREE.Euler;
  }> = [];

  renderDelay = 50; // ms - reduced for better responsiveness

  constructor(id: string, scene: THREE.Scene) {
    this.id = id;

    // Create cube mesh
    const geometry = new THREE.BoxGeometry(1, 1.8, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    scene.add(this.mesh);
  }

  // Add snapshot to buffer
  addSnapshot(state: PlayerState, timestamp: number) {
    const position = new THREE.Vector3(
      state.position.x,
      state.position.y,
      state.position.z
    );
    const rotation = new THREE.Euler(state.rotation.x, state.rotation.y, 0, 'YXZ');

    this.snapshotBuffer.push({ timestamp, position, rotation });

    // Keep only last 5 snapshots
    if (this.snapshotBuffer.length > 5) {
      this.snapshotBuffer.shift();
    }
  }

  // Get interpolated state
  update(now: number) {
    if (this.snapshotBuffer.length < 2) {
      // Not enough data, use latest if available
      if (this.snapshotBuffer.length === 1) {
        this.mesh.position.copy(this.snapshotBuffer[0].position);
        this.mesh.rotation.copy(this.snapshotBuffer[0].rotation);
      }
      return;
    }

    // Render time (with delay)
    const renderTime = now - this.renderDelay;

    // Find two snapshots around renderTime
    let from = null;
    let to = null;

    for (let i = 0; i < this.snapshotBuffer.length - 1; i++) {
      if (
        this.snapshotBuffer[i].timestamp <= renderTime &&
        this.snapshotBuffer[i + 1].timestamp >= renderTime
      ) {
        from = this.snapshotBuffer[i];
        to = this.snapshotBuffer[i + 1];
        break;
      }
    }

    if (!from || !to) {
      // Use latest
      const latest = this.snapshotBuffer[this.snapshotBuffer.length - 1];
      this.mesh.position.copy(latest.position);
      this.mesh.rotation.copy(latest.rotation);
      return;
    }

    // Interpolate
    const alpha = (renderTime - from.timestamp) / (to.timestamp - from.timestamp);
    this.mesh.position.lerpVectors(from.position, to.position, alpha);

    // Simple rotation lerp (not quaternion for prototype)
    this.mesh.rotation.x = from.rotation.x + (to.rotation.x - from.rotation.x) * alpha;
    this.mesh.rotation.y = from.rotation.y + (to.rotation.y - from.rotation.y) * alpha;
  }

  destroy(scene: THREE.Scene) {
    scene.remove(this.mesh);
  }
}

export class GameEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  // Weapon scene (rendered on top with separate pass)
  private weaponScene: THREE.Scene;
  private weaponCamera: THREE.PerspectiveCamera;

  private network: NetworkManager;
  private input: InputManager;
  private map: MapGeometry | null = null;
  private collisionDetector: CollisionDetector | null = null;

  private localPlayer: LocalPlayer | null = null;
  private remotePlayers: Map<string, RemotePlayer> = new Map();

  private isRunning = false;
  private lastTime = performance.now();

  // HUD callbacks
  public onHealthUpdate: ((health: number) => void) | null = null;
  public onScoreUpdate: ((kills: number, deaths: number) => void) | null = null;
  public onKillfeed: ((entry: {
    id: string;
    killer: string;
    victim: string;
    weapon: string;
  }) => void) | null = null;
  public onHitMarker: (() => void) | null = null;

  // Match state callbacks
  public onMatchStateUpdate: ((state: 'waiting' | 'countdown' | 'active' | 'finished', timeRemaining?: number) => void) | null = null;
  public onMatchCountdown: ((countdown: number) => void) | null = null;
  public onMatchEnd: ((scoreboard: Array<{
    playerId: string;
    playerName: string;
    kills: number;
    deaths: number;
    placement: number;
  }>, winnerId: string | null, winnerName: string | null) => void) | null = null;

  // Current match state
  private matchState: 'waiting' | 'countdown' | 'active' | 'finished' = 'waiting';

  // Visual effects
  private muzzleFlashTime: number = 0;
  private muzzleFlashLight: THREE.PointLight | null = null;

  // Weapon model & state
  private weaponMesh: THREE.Group | null = null;
  private weaponRecoilTime: number = 0;
  private weaponBasePosition = { x: 0.25, y: -0.2, z: -0.5 }; // Base position
  private ammoCount: number = 30;
  private maxAmmo: number = 30;
  private isReloading: boolean = false;
  private reloadStartTime: number = 0;
  private reloadDuration: number = 2000; // 2 seconds
  public onAmmoUpdate: ((current: number, max: number) => void) | null = null;
  public onReloadProgress: ((progress: number, isReloading: boolean) => void) | null = null;

  // Fireball system (like F.E.A.R. old/index.html)
  private fireballPool: Array<{
    id: string | null;      // Server-side projectile ID
    group: THREE.Group;
    light: THREE.PointLight;
    core: THREE.Mesh;
    glow: THREE.Mesh;
    velocity: THREE.Vector3;
    lifetime: number;
    active: boolean;
  }> = [];
  private activeFireballs: typeof this.fireballPool = [];
  private readonly FIREBALL_POOL_SIZE = 20;
  private readonly FIREBALL_SPEED = 12;
  private readonly FIREBALL_LIFETIME = 8;
  private walkCycle: number = 0; // For synchronized weapon bob

  constructor(private canvas: HTMLCanvasElement) {
    // Setup renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false; // Manual clear for multi-pass rendering

    // Setup scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
    this.scene.fog = new THREE.Fog(0x87CEEB, 20, 60); // Linear fog for outdoor feel

    // Setup camera
    this.camera = new THREE.PerspectiveCamera(
      70, // Matching F.E.A.R. FOV
      window.innerWidth / window.innerHeight,
      0.1,
      150 // F.E.A.R. far plane
    );
    // Start in Room 1 (Garage) - matching F.E.A.R.
    this.camera.position.set(0, 1.7, -16);
    this.camera.lookAt(0, 1.7, 0);

    // Setup weapon scene (separate render pass for view model)
    this.weaponScene = new THREE.Scene();
    this.weaponCamera = new THREE.PerspectiveCamera(
      50, // Lower FOV for weapon (less fisheye, looks better)
      window.innerWidth / window.innerHeight,
      0.01, // Very close near plane for weapon
      10 // Far enough for weapon
    );

    // Create simple scene
    this.createScene();

    // Setup input
    this.input = new InputManager(canvas);

    // Setup networking
    this.network = new NetworkManager();
    this.setupNetworkHandlers();

    // Handle window resize
    window.addEventListener('resize', () => this.onResize());
  }

  private createScene() {
    // Create Shipment-style CQB map
    this.map = new MapGeometry(this.scene);

    // Initialize collision detector with map colliders
    this.collisionDetector = new CollisionDetector(this.map.getColliders());
  }

  // ============== F.E.A.R. FACILITY ==============
  private createFacility() {
    // Layout constants (matching F.E.A.R. engine)
    const ROOM1_Z = -16;
    const ROOM2_Z = 16;

    // Floor texture - procedurally generated concrete with noise
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const ctx = floorCanvas.getContext('2d')!;
    ctx.fillStyle = '#101010';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 3000; i++) {
      const gray = Math.random() * 30 + 5;
      ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }

    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(8, 8);

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.9,
      metalness: 0.1
    });

    // Wall texture - procedural dirty concrete panels
    const wallCanvas = document.createElement('canvas');
    wallCanvas.width = 512;
    wallCanvas.height = 512;
    const wctx = wallCanvas.getContext('2d')!;
    wctx.fillStyle = '#12100e';
    wctx.fillRect(0, 0, 512, 512);

    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        wctx.fillStyle = `rgb(${18 + Math.random() * 8}, ${15 + Math.random() * 6}, ${12 + Math.random() * 4})`;
        wctx.fillRect(x * 128 + 2, y * 128 + 2, 124, 124);
      }
    }

    const wallTex = new THREE.CanvasTexture(wallCanvas);
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;

    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.85,
      metalness: 0.3
    });

    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95 });

    // ========== ROOM 1 (Garage) ==========
    const room1Floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), floorMat);
    room1Floor.rotation.x = -Math.PI / 2;
    room1Floor.position.set(0, 0, ROOM1_Z);
    room1Floor.receiveShadow = true;
    this.scene.add(room1Floor);

    // Room 1 walls
    const r1BackWall = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), wallMat.clone());
    r1BackWall.position.set(0, 3, ROOM1_Z - 6);
    r1BackWall.receiveShadow = true;
    this.scene.add(r1BackWall);

    const r1LeftWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), wallMat.clone());
    r1LeftWall.position.set(-8, 3, ROOM1_Z);
    r1LeftWall.rotation.y = Math.PI / 2;
    r1LeftWall.receiveShadow = true;
    this.scene.add(r1LeftWall);

    const r1RightWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), wallMat.clone());
    r1RightWall.position.set(8, 3, ROOM1_Z);
    r1RightWall.rotation.y = -Math.PI / 2;
    r1RightWall.receiveShadow = true;
    this.scene.add(r1RightWall);

    // Room 1 front wall with doorway
    const r1FrontLeft = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 6), wallMat.clone());
    r1FrontLeft.position.set(-5.25, 3, ROOM1_Z + 6);
    r1FrontLeft.rotation.y = Math.PI;
    this.scene.add(r1FrontLeft);

    const r1FrontRight = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 6), wallMat.clone());
    r1FrontRight.position.set(5.25, 3, ROOM1_Z + 6);
    r1FrontRight.rotation.y = Math.PI;
    this.scene.add(r1FrontRight);

    const r1FrontTop = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), wallMat.clone());
    r1FrontTop.position.set(0, 4.75, ROOM1_Z + 6);
    r1FrontTop.rotation.y = Math.PI;
    this.scene.add(r1FrontTop);

    const r1Ceiling = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), ceilingMat);
    r1Ceiling.rotation.x = Math.PI / 2;
    r1Ceiling.position.set(0, 6, ROOM1_Z);
    this.scene.add(r1Ceiling);

    // ========== CORRIDOR ==========
    const corridorFloor = new THREE.Mesh(new THREE.PlaneGeometry(5, 20), floorMat.clone());
    corridorFloor.rotation.x = -Math.PI / 2;
    corridorFloor.position.set(0, 0, 0);
    corridorFloor.receiveShadow = true;
    this.scene.add(corridorFloor);

    const corridorLeftWall = new THREE.Mesh(new THREE.PlaneGeometry(20, 6), wallMat.clone());
    corridorLeftWall.position.set(-2.5, 3, 0);
    corridorLeftWall.rotation.y = Math.PI / 2;
    this.scene.add(corridorLeftWall);

    const corridorRightWall = new THREE.Mesh(new THREE.PlaneGeometry(20, 6), wallMat.clone());
    corridorRightWall.position.set(2.5, 3, 0);
    corridorRightWall.rotation.y = -Math.PI / 2;
    this.scene.add(corridorRightWall);

    const corridorCeiling = new THREE.Mesh(new THREE.PlaneGeometry(5, 20), ceilingMat.clone());
    corridorCeiling.rotation.x = Math.PI / 2;
    corridorCeiling.position.set(0, 6, 0);
    this.scene.add(corridorCeiling);

    // ========== ROOM 2 ==========
    const room2Floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), floorMat.clone());
    room2Floor.rotation.x = -Math.PI / 2;
    room2Floor.position.set(0, 0, ROOM2_Z);
    room2Floor.receiveShadow = true;
    this.scene.add(room2Floor);

    const r2BackWall = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), wallMat.clone());
    r2BackWall.position.set(0, 3, ROOM2_Z + 6);
    r2BackWall.rotation.y = Math.PI;
    this.scene.add(r2BackWall);

    const r2LeftWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), wallMat.clone());
    r2LeftWall.position.set(-8, 3, ROOM2_Z);
    r2LeftWall.rotation.y = Math.PI / 2;
    this.scene.add(r2LeftWall);

    const r2RightWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), wallMat.clone());
    r2RightWall.position.set(8, 3, ROOM2_Z);
    r2RightWall.rotation.y = -Math.PI / 2;
    this.scene.add(r2RightWall);

    const r2FrontLeft = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 6), wallMat.clone());
    r2FrontLeft.position.set(-5.25, 3, ROOM2_Z - 6);
    this.scene.add(r2FrontLeft);

    const r2FrontRight = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 6), wallMat.clone());
    r2FrontRight.position.set(5.25, 3, ROOM2_Z - 6);
    this.scene.add(r2FrontRight);

    const r2FrontTop = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), wallMat.clone());
    r2FrontTop.position.set(0, 4.75, ROOM2_Z - 6);
    this.scene.add(r2FrontTop);

    const r2Ceiling = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), ceilingMat.clone());
    r2Ceiling.rotation.x = Math.PI / 2;
    r2Ceiling.position.set(0, 6, ROOM2_Z);
    this.scene.add(r2Ceiling);

    // ========== DOOR FRAMES ==========
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1a1510,
      metalness: 0.6,
      roughness: 0.5
    });

    [[ROOM1_Z + 6], [ROOM2_Z - 6]].forEach(([z]) => {
      const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.5, 0.15), frameMat);
      frameLeft.position.set(-2.5, 1.75, z);
      frameLeft.castShadow = true;
      this.scene.add(frameLeft);

      const frameRight = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.5, 0.15), frameMat);
      frameRight.position.set(2.5, 1.75, z);
      frameRight.castShadow = true;
      this.scene.add(frameRight);
    });

    // ========== PIPES ==========
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0x252520,
      roughness: 0.5,
      metalness: 0.8
    });

    const pipe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 22, 8), pipeMat);
    pipe1.position.set(-1.5, 5.7, 0);
    pipe1.rotation.x = Math.PI / 2;
    this.scene.add(pipe1);

    const pipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 22, 8), pipeMat);
    pipe2.position.set(1.5, 5.5, 0);
    pipe2.rotation.x = Math.PI / 2;
    this.scene.add(pipe2);

    // ========== LIGHTS ==========
    // Brighter ambient lighting for visibility
    const ambientLight = new THREE.AmbientLight(0x444444, 1.2);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x666666, 0x222222, 0.8);
    this.scene.add(hemiLight);

    // Central ceiling lamps in each room
    const createCeilingLamp = (x: number, z: number) => {
      const light = new THREE.PointLight(0xffaa44, 100, 25);
      light.position.set(x, 5.5, z);
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      this.scene.add(light);

      // Visual bulb
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 16, 16),
        new THREE.MeshStandardMaterial({
          color: 0xffaa44,
          emissive: 0xffaa44,
          emissiveIntensity: 4
        })
      );
      bulb.position.set(x, 5.5, z);
      this.scene.add(bulb);

      // Lamp shade
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.3, 0.2, 16, 1, true),
        new THREE.MeshStandardMaterial({
          color: 0x1a1510,
          side: THREE.DoubleSide,
          metalness: 0.5,
          roughness: 0.7
        })
      );
      shade.position.set(x, 5.5, z);
      shade.rotation.x = Math.PI;
      this.scene.add(shade);
    };

    // Add lamps in each room and corridor
    createCeilingLamp(0, ROOM1_Z); // Room 1 center
    createCeilingLamp(0, ROOM2_Z); // Room 2 center
    createCeilingLamp(0, -5);      // Corridor middle-top
    createCeilingLamp(0, 5);       // Corridor middle-bottom

    // Emergency corner lights (red glow) - less intense
    const createCornerLight = (x: number, y: number, z: number) => {
      const light = new THREE.PointLight(0xff2200, 5, 10);
      light.position.set(x, y, z);
      this.scene.add(light);

      // Visual bulb
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 16, 16),
        new THREE.MeshStandardMaterial({
          color: 0xff3300,
          emissive: 0xff3300,
          emissiveIntensity: 2
        })
      );
      bulb.position.set(x, y, z);
      this.scene.add(bulb);
    };

    // Add emergency lights in corners
    createCornerLight(-7, 5, ROOM1_Z - 5);
    createCornerLight(7, 5, ROOM1_Z - 5);
    createCornerLight(-7, 5, ROOM2_Z + 5);
    createCornerLight(7, 5, ROOM2_Z + 5);
  }

  // Create weapon model (simple rifle)
  private createWeaponModel() {
    console.log('[GameEngine] Creating rifle model in separate scene...');

    // Add weaponCamera to weaponScene
    this.weaponScene.add(this.weaponCamera);

    this.weaponMesh = new THREE.Group();

    // Rifle barrel (main body - dark metal)
    const barrel = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.03, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2a2a2a })
    );
    barrel.position.set(0, 0, -0.2);

    // Rifle stock (back part)
    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.08, 0.15),
      new THREE.MeshBasicMaterial({ color: 0x1f1f1f })
    );
    stock.position.set(0, -0.01, 0.075);

    // Rifle grip
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.1, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x1a1a1a })
    );
    grip.position.set(0, -0.06, -0.05);

    // Magazine
    const magazine = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.12, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x333333 })
    );
    magazine.position.set(0, -0.09, -0.08);

    // Front sight (simple red dot)
    const sight = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.02, 0.01),
      new THREE.MeshBasicMaterial({ color: 0xff4444 })
    );
    sight.position.set(0, 0.025, -0.35);

    this.weaponMesh.add(barrel, stock, grip, magazine, sight);

    // Position weapon in camera local space (F.E.A.R. style - bottom right)
    this.weaponMesh.position.set(
      this.weaponBasePosition.x,
      this.weaponBasePosition.y,
      this.weaponBasePosition.z
    );
    this.weaponMesh.rotation.set(0, 0, 0);

    // All parts ignore depth test (always on top)
    this.weaponMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material.depthTest = false;
        child.material.depthWrite = false;
        child.frustumCulled = false;
      }
    });

    // Add weapon to weaponCamera (NOT to scene!)
    this.weaponCamera.add(this.weaponMesh);
    console.log('[GameEngine] Plasma gun created and attached to weaponCamera');
  }

  // Initialize fireball pool (like F.E.A.R. old/index.html)
  private initFireballPool() {
    const geometry = new THREE.SphereGeometry(0.12, 12, 12);
    const glowGeometry = new THREE.SphereGeometry(0.2, 12, 12);

    for (let i = 0; i < this.FIREBALL_POOL_SIZE; i++) {
      const group = new THREE.Group();

      const core = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: 0xffff00 }) // Yellow core
      );
      group.add(core);

      const glow = new THREE.Mesh(
        glowGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xff6600, // Orange glow
          transparent: true,
          opacity: 0.6
        })
      );
      group.add(glow);

      const light = new THREE.PointLight(0xff6600, 0, 15);
      group.add(light);

      group.visible = false;
      this.scene.add(group); // Add to main scene, not weapon!

      this.fireballPool.push({
        id: null,
        group,
        light,
        core,
        glow,
        velocity: new THREE.Vector3(),
        lifetime: 0,
        active: false
      });
    }
  }

  private getFireball() {
    for (const fb of this.fireballPool) {
      if (!fb.active) {
        fb.active = true;
        fb.group.visible = true;
        fb.light.intensity = 40;
        this.activeFireballs.push(fb);
        return fb;
      }
    }
    return null;
  }

  private returnFireball(fb: typeof this.fireballPool[0]) {
    fb.active = false;
    fb.id = null;  // Reset server ID
    fb.group.visible = false;
    fb.light.intensity = 0;
    const idx = this.activeFireballs.indexOf(fb);
    if (idx > -1) this.activeFireballs.splice(idx, 1);
  }

  // Sync projectiles from server
  private syncProjectiles(serverProjectiles: ProjectileState[]) {
    // Create Map of server projectile IDs for lookup
    const serverProjectileIds = new Set(serverProjectiles.map(p => p.id));

    // Remove fireballs that are not in server snapshot
    for (const fb of this.activeFireballs) {
      if (fb.id && !serverProjectileIds.has(fb.id)) {
        // Server removed this projectile (hit or expired)
        this.returnFireball(fb);
      }
    }

    // Update/create fireballs from server projectiles
    for (const serverProj of serverProjectiles) {
      // Find existing fireball with this ID
      let fb = this.fireballPool.find(f => f.id === serverProj.id);

      if (!fb) {
        // New projectile - get from pool
        fb = this.getFireball();
        if (!fb) continue; // Pool exhausted

        fb.id = serverProj.id;
      }

      // Update position and velocity from server
      fb.group.position.set(serverProj.position.x, serverProj.position.y, serverProj.position.z);
      fb.velocity.set(serverProj.velocity.x, serverProj.velocity.y, serverProj.velocity.z);
      fb.lifetime = serverProj.lifetime;
    }
  }

  private shootFireball() {
    const fb = this.getFireball();
    if (!fb || !this.localPlayer) return;

    // Get direction from camera
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);

    // Spawn fireball in front of camera
    fb.group.position.copy(this.camera.position).add(dir.clone().multiplyScalar(1));
    fb.group.position.y -= 0.2;
    fb.velocity.copy(dir).multiplyScalar(this.FIREBALL_SPEED);
    fb.lifetime = this.FIREBALL_LIFETIME;
  }

  private setupNetworkHandlers() {
    this.network.on('welcome', (data: { playerId: string; playerName: string }) => {
      console.log(`[GameEngine] Welcome! You are ${data.playerName}`);

      // Create local player
      this.localPlayer = new LocalPlayer(this.scene);

      // Set collision detector for local player
      if (this.collisionDetector) {
        this.localPlayer.collisionDetector = this.collisionDetector;
      }

      // Start input capture
      this.input.start();
    });

    this.network.on('snapshot', (snapshot) => {
      for (const playerState of snapshot.players) {
        // Update local player health/score from snapshot
        if (playerState.id === this.network.playerId) {
          if (this.onHealthUpdate) {
            this.onHealthUpdate(playerState.health);
          }
          if (this.onScoreUpdate && playerState.kills !== undefined && playerState.deaths !== undefined) {
            this.onScoreUpdate(playerState.kills, playerState.deaths);
          }
          continue; // Skip rendering local player
        }

        // Remote player - interpolate
        let remotePlayer = this.remotePlayers.get(playerState.id);
        if (!remotePlayer) {
          remotePlayer = new RemotePlayer(playerState.id, this.scene);
          this.remotePlayers.set(playerState.id, remotePlayer);
          console.log(`[GameEngine] Remote player joined: ${playerState.id}`);
        }
        remotePlayer.addSnapshot(playerState, snapshot.timestamp);
      }

      // Sync projectiles (fireballs) from server
      this.syncProjectiles(snapshot.projectiles);

      // Update match state from snapshot
      if (snapshot.matchState) {
        this.matchState = snapshot.matchState;
        if (this.onMatchStateUpdate) {
          this.onMatchStateUpdate(snapshot.matchState, snapshot.matchTimeRemaining);
        }
      }
    });

    this.network.on('player_leave', (data: { playerId: string }) => {
      const remotePlayer = this.remotePlayers.get(data.playerId);
      if (remotePlayer) {
        remotePlayer.destroy(this.scene);
        this.remotePlayers.delete(data.playerId);
        console.log(`[GameEngine] Remote player left: ${data.playerId}`);
      }
    });

    this.network.on('damage', (data: { victimId: string; attackerId: string; damage: number; weaponId: string; newHealth: number }) => {
      console.log(`[GameEngine] Player ${data.victimId} took ${data.damage} damage from ${data.attackerId} (${data.newHealth} HP remaining)`);

      // Update health immediately for local player
      if (data.victimId === this.network.playerId) {
        console.log(`[GameEngine] YOU took damage! ${data.newHealth} HP left`);
        if (this.onHealthUpdate) {
          this.onHealthUpdate(data.newHealth);
        }
      }

      // Show hit marker if we are the attacker
      if (data.attackerId === this.network.playerId && this.onHitMarker) {
        this.onHitMarker();
        console.log('[GameEngine] HIT! Showing hit marker');
      }
    });

    this.network.on('death', (data: { victimId: string; killerId: string; weaponId: string }) => {
      console.log(`[GameEngine] Player ${data.victimId} was killed by ${data.killerId}`);

      // Add to killfeed
      if (this.onKillfeed) {
        this.onKillfeed({
          id: `${Date.now()}-${data.victimId}`,
          killer: data.killerId.slice(0, 8), // Short ID for display
          victim: data.victimId.slice(0, 8),
          weapon: data.weaponId,
        });
      }

      if (data.victimId === this.network.playerId) {
        console.log('[GameEngine] YOU DIED!');
        if (this.onHealthUpdate) {
          this.onHealthUpdate(0);
        }
      } else if (data.killerId === this.network.playerId) {
        console.log('[GameEngine] YOU GOT A KILL!');
      }
    });

    this.network.on('respawn', (data: { playerId: string; position: { x: number; y: number; z: number } }) => {
      console.log(`[GameEngine] Player ${data.playerId} respawned`);

      if (data.playerId === this.network.playerId) {
        console.log('[GameEngine] You respawned!');
        if (this.onHealthUpdate) {
          this.onHealthUpdate(100);
        }
      }
    });

    // Match events
    this.network.on('match_countdown', (data: { countdown: number }) => {
      console.log(`[GameEngine] Match countdown: ${data.countdown}s`);
      if (this.onMatchCountdown) {
        this.onMatchCountdown(data.countdown);
      }
      if (this.onMatchStateUpdate) {
        this.onMatchStateUpdate('countdown', undefined);
      }
    });

    this.network.on('match_start', (data: { duration: number; startTime: number; endTime: number }) => {
      console.log(`[GameEngine] Match started! Duration: ${data.duration}ms`);
      if (this.onMatchStateUpdate) {
        this.onMatchStateUpdate('active', data.duration);
      }
    });

    this.network.on('match_end', (data: {
      winnerId: string | null;
      winnerName: string | null;
      scoreboard: Array<{
        playerId: string;
        playerName: string;
        kills: number;
        deaths: number;
        placement: number;
      }>;
    }) => {
      console.log(`[GameEngine] Match ended! Winner: ${data.winnerName || 'None'}`);
      if (this.onMatchEnd) {
        this.onMatchEnd(data.scoreboard, data.winnerId, data.winnerName);
      }
      if (this.onMatchStateUpdate) {
        this.onMatchStateUpdate('finished', undefined);
      }
    });
  }

  async start() {
    console.log('[GameEngine] Starting...');

    // Connect to server
    await this.network.connect('ws://localhost:3000/ws/game');

    // Sync friction and position updates with batching (30Hz)
    this.network.onFlushBatch = () => {
      if (this.localPlayer) {
        // Apply friction (client physics)
        this.localPlayer.applyFriction();

        // Send position to server (client-authoritative)
        this.network.sendPosition(
          {
            x: this.localPlayer.position.x,
            y: this.localPlayer.position.y,
            z: this.localPlayer.position.z,
          },
          {
            x: this.localPlayer.rotation.x,
            y: this.localPlayer.rotation.y,
          },
          {
            x: this.localPlayer.velocity.x,
            y: this.localPlayer.velocity.y,
            z: this.localPlayer.velocity.z,
          }
        );
      }
    };

    // Setup plasma muzzle flash light (pomegranate/dark red)
    this.muzzleFlashLight = new THREE.PointLight(0xcc0033, 0, 5);
    this.scene.add(this.muzzleFlashLight);

    // Create weapon model
    console.log('[GameEngine] About to create weapon model...');
    this.createWeaponModel();
    console.log('[GameEngine] Weapon model created. weaponMesh:', this.weaponMesh);

    // Initialize fireball pool
    this.initFireballPool();

    // Setup shooting callback
    this.input.onFire = () => {
      if (!this.localPlayer) return;

      // Can't shoot during waiting or countdown
      if (this.matchState === 'waiting' || this.matchState === 'countdown') {
        return;
      }

      // Check ammo
      if (this.ammoCount <= 0 || this.isReloading) {
        console.log('[GameEngine] Out of ammo or reloading!');
        return;
      }

      // Consume ammo
      this.ammoCount--;
      if (this.onAmmoUpdate) {
        this.onAmmoUpdate(this.ammoCount, this.maxAmmo);
      }

      // Trigger recoil
      this.weaponRecoilTime = performance.now();

      // Calculate ray origin (player position at eye level)
      const rayOrigin = {
        x: this.localPlayer.position.x,
        y: this.localPlayer.position.y + 0.7, // Eye level
        z: this.localPlayer.position.z,
      };

      // Calculate ray direction from camera rotation (normalized)
      const pitch = this.localPlayer.rotation.x;
      const yaw = this.localPlayer.rotation.y;

      const rayDir = {
        x: -Math.sin(yaw) * Math.cos(pitch),
        y: Math.sin(pitch),  // Fixed: removed negative sign (was inverted)
        z: -Math.cos(yaw) * Math.cos(pitch),
      };

      // Muzzle flash visual effect
      this.showMuzzleFlash();

      // NOTE: Fireballs are now created by server as projectiles
      // Client will sync them from snapshot

      // Send fire command to server
      this.network.sendFire(rayOrigin, rayDir, 'rifle');
      console.log('[GameEngine] Fired! Ray:', rayDir);
    };

    // Setup reload callback
    this.input.onReload = () => {
      // Can't reload during waiting or countdown
      if (this.matchState === 'waiting' || this.matchState === 'countdown') {
        return;
      }

      if (this.isReloading || this.ammoCount === this.maxAmmo) {
        console.log('[GameEngine] Cannot reload (already reloading or full)');
        return;
      }

      console.log('[GameEngine] Reloading...');
      this.isReloading = true;
      this.reloadStartTime = Date.now();

      // Notify reload started
      if (this.onReloadProgress) {
        this.onReloadProgress(0, true);
      }

      // Reload after 2 seconds
      setTimeout(() => {
        this.ammoCount = this.maxAmmo;
        this.isReloading = false;
        console.log('[GameEngine] Reload complete!');

        if (this.onAmmoUpdate) {
          this.onAmmoUpdate(this.ammoCount, this.maxAmmo);
        }

        if (this.onReloadProgress) {
          this.onReloadProgress(1, false);
        }
      }, this.reloadDuration);
    };

    // Start render loop
    this.isRunning = true;
    this.animate();
  }

  private animate = () => {
    if (!this.isRunning) return;

    requestAnimationFrame(this.animate);

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1); // Max 100ms delta
    this.lastTime = now;

    // Get input state
    const inputState = this.input.getState();

    // Apply local player movement (client-side prediction)
    if (this.localPlayer) {
      this.localPlayer.applyMovement(
        inputState.moveX,
        inputState.moveY,
        inputState.lookDeltaX,
        inputState.lookDeltaY,
        dt
      );

      // Position updates sent in onFlushBatch (30Hz) - no need to send every frame

      // First-person camera (F.E.A.R. style)
      // Position camera at player's eye level
      this.camera.position.copy(this.localPlayer.position);
      this.camera.position.y += 0.7; // Eye level (player height 1.8, eyes at 1.7 from ground 0)

      // Apply player's rotation to camera
      this.camera.rotation.copy(this.localPlayer.rotation);
    }

    // Update remote players (interpolation)
    for (const remotePlayer of this.remotePlayers.values()) {
      remotePlayer.update(now);
    }

    // Update visual effects
    this.updateMuzzleFlash(now);
    this.updateWeaponRecoil(now);
    this.updateReloadProgress(now);

    // Update weapon sway/bob based on movement
    const isMoving = inputState.moveX !== 0 || inputState.moveY !== 0;
    this.updateWeaponSway(now, isMoving);

    // Update fireballs
    this.updateFireballs(dt);

    // Sync weapon camera with main camera (use quaternion for correct orientation)
    this.weaponCamera.position.copy(this.camera.position);
    this.weaponCamera.quaternion.copy(this.camera.quaternion);

    // Multi-pass rendering (weapon on top)
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);       // Main scene
    this.renderer.clearDepth();                          // Clear depth buffer
    this.renderer.render(this.weaponScene, this.weaponCamera); // Weapon scene on top
  };

  private onResize() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.weaponCamera.aspect = aspect;
    this.weaponCamera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Show muzzle flash effect
  private showMuzzleFlash() {
    this.muzzleFlashTime = performance.now();

    if (this.muzzleFlashLight && this.localPlayer) {
      // Position light in front of camera
      const forward = new THREE.Vector3(
        -Math.sin(this.localPlayer.rotation.y),
        0,
        -Math.cos(this.localPlayer.rotation.y)
      );

      this.muzzleFlashLight.position.copy(this.localPlayer.position);
      this.muzzleFlashLight.position.add(forward.multiplyScalar(0.5));
      this.muzzleFlashLight.position.y += 0.7; // Eye level
      this.muzzleFlashLight.intensity = 50;
    }
  }

  // Update muzzle flash (fade out)
  private updateMuzzleFlash(now: number) {
    if (!this.muzzleFlashLight) return;

    const elapsed = now - this.muzzleFlashTime;
    const FLASH_DURATION = 50; // 50ms flash

    if (elapsed < FLASH_DURATION) {
      // Fade out
      const fade = 1 - (elapsed / FLASH_DURATION);
      this.muzzleFlashLight.intensity = 50 * fade;
    } else {
      this.muzzleFlashLight.intensity = 0;
    }
  }

  // Update weapon recoil animation
  private updateWeaponRecoil(now: number) {
    if (!this.weaponMesh) return;

    const elapsed = now - this.weaponRecoilTime;
    const RECOIL_DURATION = 100; // 100ms recoil

    if (elapsed < RECOIL_DURATION) {
      // Ease out cubic for smooth return
      const t = elapsed / RECOIL_DURATION;
      const easeOut = 1 - Math.pow(1 - t, 3);

      // Kick back (Z axis) and up (rotation X)
      const kickBack = 0.05 * (1 - easeOut);
      const kickUp = 0.05 * (1 - easeOut);

      // Apply recoil
      this.weaponMesh.position.z = this.weaponBasePosition.z + kickBack;
      this.weaponMesh.rotation.x = -kickUp;
    } else {
      // Reset to default position
      this.weaponMesh.position.z = this.weaponBasePosition.z;
      this.weaponMesh.rotation.x = 0;
    }
  }

  // Weapon sway/bob animation (synchronized with walk cycle - slower)
  private updateWeaponSway(now: number, isMoving: boolean) {
    if (!this.weaponMesh) return;

    const t = now * 0.001; // Convert to seconds

    if (isMoving) {
      // Synchronized walking bob (slow, smooth)
      // Walk cycle frequency: ~1.3 Hz (slower, more realistic)
      this.walkCycle += 0.016; // Increment walk cycle (slower increment)

      const freq = 1.3; // Walk frequency (slower than before)
      const phase = this.walkCycle * freq;

      // Horizontal sway (side to side)
      const swayX = Math.sin(phase) * 0.01;

      // Vertical bob (up and down, double frequency for each step)
      const swayY = Math.abs(Math.sin(phase * 2)) * 0.008;

      // Forward/back motion
      const swayZ = Math.sin(phase) * 0.003;

      // Slight rotation (tilt)
      const swayRotZ = Math.sin(phase) * 0.015;

      this.weaponMesh.position.x = this.weaponBasePosition.x + swayX;
      this.weaponMesh.position.y = this.weaponBasePosition.y + swayY;

      // Z handled by recoil, add subtle sway
      if (!this.weaponRecoilTime || (now - this.weaponRecoilTime) > 100) {
        this.weaponMesh.position.z = this.weaponBasePosition.z + swayZ;
      }

      this.weaponMesh.rotation.z = swayRotZ;
    } else {
      // Reset walk cycle when not moving
      this.walkCycle = 0;

      // Idle sway (very slow, subtle breathing)
      const idleSwayX = Math.sin(t * 0.8) * 0.002;
      const idleSwayY = Math.cos(t * 1.0) * 0.0015;
      const idleSwayRotZ = Math.sin(t * 0.6) * 0.008;

      this.weaponMesh.position.x = this.weaponBasePosition.x + idleSwayX;
      this.weaponMesh.position.y = this.weaponBasePosition.y + idleSwayY;
      this.weaponMesh.rotation.z = idleSwayRotZ;
    }
  }

  // Update fireballs (like F.E.A.R. old/index.html)
  private updateFireballs(delta: number) {
    for (let i = this.activeFireballs.length - 1; i >= 0; i--) {
      const fb = this.activeFireballs[i];

      // Move fireball
      fb.group.position.x += fb.velocity.x * delta;
      fb.group.position.y += fb.velocity.y * delta;
      fb.group.position.z += fb.velocity.z * delta;

      fb.lifetime -= delta;

      // Flickering light
      fb.light.intensity = 30 + Math.random() * 15;

      // Rotate glow for effect
      fb.glow.rotation.x += delta * 5;
      fb.glow.rotation.y += delta * 3;

      // Check if expired
      if (fb.lifetime <= 0) {
        this.returnFireball(fb);
      }
    }
  }


  // Update reload progress
  private updateReloadProgress(now: number) {
    if (!this.isReloading) return;

    const elapsed = now - this.reloadStartTime;
    const progress = Math.min(elapsed / this.reloadDuration, 1);

    if (this.onReloadProgress) {
      this.onReloadProgress(progress, true);
    }
  }

  dispose() {
    this.isRunning = false;
    this.input.stop();
    this.network.onFlushBatch = null; // Clear friction callback
    this.network.disconnect();

    // Cleanup map
    if (this.map) {
      this.map.destroy(this.scene);
      this.map = null;
    }
  }
}
