import * as THREE from 'three';

/**
 * AudioManager - Web Audio API для 3D позиционного звука
 *
 * Features:
 * - Gunshot sound with procedural synthesis
 * - 3D spatial audio for projectiles
 * - Doppler effect for fast-moving fireballs
 */

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private listener: AudioListener | null = null;
  private masterGain: GainNode | null = null;

  // Active sounds (for cleanup)
  private activeSounds: Set<AudioScheduledSourceNode> = new Set();

  constructor() {
    // Audio context is created on user interaction (autoplay policy)
  }

  /**
   * Initialize audio context (call on first user interaction)
   */
  init() {
    if (this.audioContext) return;

    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.listener = new AudioListener(this.audioContext);

    // Master gain for volume control
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.5; // 50% volume
    this.masterGain.connect(this.audioContext.destination);
  }

  /**
   * Set camera for audio listener position
   */
  setListener(camera: THREE.Camera) {
    if (this.listener && camera.position) {
      this.listener.setPosition(camera.position);

      // Get forward vector from camera
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(camera.quaternion);
      this.listener.setOrientation(forward);
    }
  }

  /**
   * Play gunshot sound (procedural sawtooth synth)
   * Based on old/index.html shootSound()
   */
  playGunshot() {
    if (!this.audioContext || !this.masterGain) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, this.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.audioContext.currentTime + 0.4);

    gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.4);

    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.audioContext.currentTime + 0.4);
  }

  /**
   * Create 3D positional audio source for a fireball
   * Returns a PannerNode for spatial positioning
   */
  createFireballSound(position: THREE.Vector3): SpatialAudioSource | null {
    if (!this.audioContext || !this.masterGain) return null;

    // Create continuous buzzing/whooshing sound for fireball
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const panner = this.audioContext.createPanner();

    // Panner configuration (3D spatial audio)
    panner.panningModel = 'HRTF'; // Head-related transfer function for realistic 3D
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 100;
    panner.rolloffFactor = 1;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 0;
    panner.coneOuterGain = 0;

    // Set initial position
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;

    // Fireball sound: low-frequency whoosh
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80 + Math.random() * 40, this.audioContext.currentTime);

    // Slight frequency modulation for "alive" sound
    const lfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();
    lfo.frequency.value = 5; // 5 Hz wobble
    lfoGain.gain.value = 10; // ±10 Hz modulation
    lfo.connect(lfoGain).connect(osc.frequency);

    gain.gain.setValueAtTime(0.15, this.audioContext.currentTime);

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain);

    osc.start();
    lfo.start();

    this.activeSounds.add(osc);

    return new SpatialAudioSource(osc, lfo, gain, panner, this.audioContext);
  }

  /**
   * Play impact/hit sound (white noise burst)
   */
  playImpact(position?: THREE.Vector3) {
    if (!this.audioContext || !this.masterGain) return;

    const bufferSize = this.audioContext.sampleRate * 0.2;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    // White noise with exponential decay
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }

    const noise = this.audioContext.createBufferSource();
    const gain = this.audioContext.createGain();

    noise.buffer = buffer;
    gain.gain.setValueAtTime(0.4, this.audioContext.currentTime);

    if (position) {
      // 3D positioned impact
      const panner = this.audioContext.createPanner();
      panner.setPosition(position.x, position.y, position.z);
      noise.connect(gain).connect(panner).connect(this.masterGain);
    } else {
      // Non-positional impact
      noise.connect(gain).connect(this.masterGain);
    }

    noise.start();
  }

  /**
   * Cleanup
   */
  destroy() {
    for (const sound of this.activeSounds) {
      sound.stop();
    }
    this.activeSounds.clear();

    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}

/**
 * Spatial audio source - controls position and velocity for Doppler effect
 */
export class SpatialAudioSource {
  private osc: OscillatorNode;
  private lfo: OscillatorNode;
  private gain: GainNode;
  private panner: PannerNode;
  private context: AudioContext;
  private baseFrequency: number;

  constructor(
    osc: OscillatorNode,
    lfo: OscillatorNode,
    gain: GainNode,
    panner: PannerNode,
    context: AudioContext
  ) {
    this.osc = osc;
    this.lfo = lfo;
    this.gain = gain;
    this.panner = panner;
    this.context = context;
    this.baseFrequency = osc.frequency.value;
  }

  /**
   * Update 3D position
   */
  setPosition(position: THREE.Vector3) {
    const now = this.context.currentTime;
    this.panner.positionX.setValueAtTime(position.x, now);
    this.panner.positionY.setValueAtTime(position.y, now);
    this.panner.positionZ.setValueAtTime(position.z, now);
  }

  /**
   * Update velocity for Doppler effect
   * Velocity in m/s (Three.js units)
   */
  setVelocity(velocity: THREE.Vector3) {
    // Manual Doppler effect calculation
    // (Web Audio API's setVelocity is deprecated)
    const SPEED_OF_SOUND = 343; // m/s
    const speed = velocity.length();

    // Simple Doppler: f' = f * (1 + v/c)
    // Positive velocity (approaching) = higher pitch
    // Negative velocity (receding) = lower pitch
    const dopplerFactor = 1 + (speed / SPEED_OF_SOUND) * 0.5; // Scale down effect
    const newFrequency = this.baseFrequency * dopplerFactor;

    this.osc.frequency.setValueAtTime(
      Math.max(40, Math.min(200, newFrequency)),
      this.context.currentTime
    );
  }

  /**
   * Stop the sound
   */
  stop() {
    const now = this.context.currentTime;

    // Fade out
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(0, now + 0.1);

    this.osc.stop(now + 0.1);
    this.lfo.stop(now + 0.1);
  }
}

/**
 * Audio listener wrapper (for setting position/orientation)
 */
class AudioListener {
  private context: AudioContext;

  constructor(context: AudioContext) {
    this.context = context;
  }

  setPosition(position: THREE.Vector3) {
    const listener = this.context.listener;
    if (listener.positionX) {
      // Modern API
      listener.positionX.value = position.x;
      listener.positionY.value = position.y;
      listener.positionZ.value = position.z;
    } else {
      // Legacy API
      (listener as any).setPosition(position.x, position.y, position.z);
    }
  }

  setOrientation(forward: THREE.Vector3, up = new THREE.Vector3(0, 1, 0)) {
    const listener = this.context.listener;
    if (listener.forwardX) {
      // Modern API
      listener.forwardX.value = forward.x;
      listener.forwardY.value = forward.y;
      listener.forwardZ.value = forward.z;
      listener.upX.value = up.x;
      listener.upY.value = up.y;
      listener.upZ.value = up.z;
    } else {
      // Legacy API
      (listener as any).setOrientation(
        forward.x, forward.y, forward.z,
        up.x, up.y, up.z
      );
    }
  }
}
