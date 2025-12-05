import type {
  PositionUpdate,
  PositionBatch,
  ServerMessage,
  Snapshot,
  Vec3,
  Vec2,
  FireCommand,
} from './types';

type EventHandler = (data: any) => void;

export class NetworkManager {
  private ws: WebSocket | null = null;
  private eventHandlers: Map<string, EventHandler[]> = new Map();

  // Client state
  public playerId: string | null = null;

  // Position update batching (client-authoritative)
  private pendingUpdates: PositionUpdate[] = [];
  private batchInterval: number | null = null;
  private readonly BATCH_HZ = 30; // Send 30 batches per second

  // Callback for syncing friction with batching (30Hz)
  public onFlushBatch: (() => void) | null = null;

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[NetworkManager] Connecting to ${url}...`);

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[NetworkManager] Connected!');

        // Start batching inputs
        this.startInputBatching();

        resolve();
      };

      this.ws.onerror = (error) => {
        console.error('[NetworkManager] WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('[NetworkManager] Disconnected');
        this.stopInputBatching();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: ServerMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (e) {
          console.error('[NetworkManager] Failed to parse message:', e);
        }
      };
    });
  }

  disconnect() {
    if (this.ws) {
      this.stopInputBatching();
      this.ws.close();
      this.ws = null;
    }
  }

  private handleMessage(message: ServerMessage) {
    switch (message.type) {
      case 'welcome':
        this.playerId = message.playerId;
        this.emit('welcome', message);
        break;

      case 'snapshot':
        this.emit('snapshot', message);
        break;

      case 'player_join':
        this.emit('player_join', message);
        break;

      case 'player_leave':
        this.emit('player_leave', message);
        break;

      case 'damage':
        this.emit('damage', message);
        break;

      case 'death':
        this.emit('death', message);
        break;

      case 'respawn':
        this.emit('respawn', message);
        break;

      default:
        console.warn('[NetworkManager] Unknown message type:', (message as any).type);
    }
  }

  // Send position update (client-authoritative)
  sendPosition(position: Vec3, rotation: Vec2, velocity: Vec3) {
    const update: PositionUpdate = {
      type: 'position_update',
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y },
      velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
      timestamp: Date.now(),
    };

    this.pendingUpdates.push(update);

    // Bounded queue
    if (this.pendingUpdates.length > 3) {
      this.pendingUpdates.shift();
      console.warn('[NetworkManager] Position queue overflow - dropping old update');
    }
  }

  // Send fire command (shooting)
  sendFire(rayOrigin: Vec3, rayDir: Vec3, weaponId: string = 'rifle') {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const fireCmd: FireCommand = {
      type: 'fire',
      timestamp: Date.now(),
      rayOrigin: { x: rayOrigin.x, y: rayOrigin.y, z: rayOrigin.z },
      rayDir: { x: rayDir.x, y: rayDir.y, z: rayDir.z },
      weaponId,
    };

    this.ws.send(JSON.stringify(fireCmd));
    console.log('[NetworkManager] Sent fire command');
  }

  private startInputBatching() {
    this.batchInterval = window.setInterval(() => {
      this.flushPositionBatch();
    }, 1000 / this.BATCH_HZ);
  }

  private stopInputBatching() {
    if (this.batchInterval !== null) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
  }

  private flushPositionBatch() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Send batch if we have position updates
    if (this.pendingUpdates.length > 0) {
      const batch: PositionBatch = {
        type: 'position_batch',
        updates: [...this.pendingUpdates],
      };

      this.ws.send(JSON.stringify(batch));
      this.pendingUpdates = [];
    }

    // Trigger friction callback (ALWAYS - sync with 30Hz for client physics)
    if (this.onFlushBatch) {
      this.onFlushBatch();
    }
  }

  // Event emitter
  on(event: string, handler: EventHandler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  private emit(event: string, data: any) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(data);
      }
    }
  }
}
