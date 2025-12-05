export class InputManager {
  // Key states
  private keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };

  // Mouse delta (accumulated since last getState)
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;

  private isPointerLocked = false;
  private isStarted = false;

  // Shooting callback
  public onFire: (() => void) | null = null;

  // Reload callback
  public onReload: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.setupPointerLock();
    this.setupKeyboardListeners();
    this.setupMouseListeners();
  }

  private setupPointerLock() {
    this.canvas.addEventListener('click', () => {
      if (!this.isPointerLocked && this.isStarted) {
        this.canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas;
      console.log(`[InputManager] Pointer lock: ${this.isPointerLocked}`);
    });

    document.addEventListener('pointerlockerror', () => {
      console.error('[InputManager] Pointer lock error');
    });
  }

  private setupKeyboardListeners() {
    document.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = true;
          break;
        case 'KeyR':
          // Reload weapon
          if (this.onReload) {
            this.onReload();
          }
          break;
      }
    });

    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = false;
          break;
      }
    });
  }

  private setupMouseListeners() {
    document.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;

      this.mouseDeltaX += e.movementX;
      this.mouseDeltaY += e.movementY;
    });

    // Mouse click for shooting (only when pointer is locked)
    document.addEventListener('mousedown', (e) => {
      if (!this.isPointerLocked) return;

      // Left mouse button = shoot
      if (e.button === 0 && this.onFire) {
        this.onFire();
      }
    });
  }

  start() {
    this.isStarted = true;
    console.log('[InputManager] Started - click canvas to lock pointer');
  }

  stop() {
    this.isStarted = false;
    if (this.isPointerLocked) {
      document.exitPointerLock();
    }
  }

  // Get current input state (and reset mouse delta)
  getState() {
    const moveX = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    const moveY = (this.keys.forward ? 1 : 0) - (this.keys.backward ? 1 : 0);

    const state = {
      moveX,
      moveY,
      lookDeltaX: this.mouseDeltaX,
      lookDeltaY: this.mouseDeltaY,
    };

    // Reset mouse delta
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    return state;
  }
}
