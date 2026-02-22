/**
 * Audio system using real lightsaber MP3s + procedural sounds for game events.
 */
export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;

    // Loaded audio buffers
    this.buffers = {
      idle: null,
      ignition: null,
      clash: null,
      swing: null,
    };

    // Active sources
    this.idleSource = null;
    this.idleGain = null;
    this.isIdlePlaying = false;
    this.isSaberOn = false;

    // Swing cooldown
    this.lastSwingTime = 0;
    this.swingCooldown = 250; // ms
  }

  /** Lazy-init AudioContext (must be after user gesture) */
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /** Load all lightsaber MP3 files */
  async loadSounds() {
    const files = {
      idle: 'audios/idle.mp3',
      ignition: 'audios/ignition.mp3',
      clash: 'audios/clash.mp3',
      swing: 'audios/swing.mp3',
    };

    const promises = Object.entries(files).map(async ([key, path]) => {
      try {
        const response = await fetch(path);
        if (!response.ok) {
          console.warn(`[Audio] ${path} not found (${response.status})`);
          return;
        }
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength < 100) {
          console.warn(`[Audio] ${path} too small, skipping`);
          return;
        }
        this.buffers[key] = await this.ctx.decodeAudioData(arrayBuffer);
        console.log(`[Audio] Loaded ${key} (${(arrayBuffer.byteLength / 1024).toFixed(1)}kb)`);
      } catch (e) {
        console.warn(`[Audio] Failed to load ${path}:`, e);
      }
    });

    await Promise.all(promises);
    console.log('[Audio] All sounds loaded');
  }

  /** Play a one-shot sound from buffer */
  _playOneShot(bufferName, volume = 0.5) {
    if (!this.ctx || !this.enabled || !this.buffers[bufferName]) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffers[bufferName];
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    source.connect(gain).connect(this.ctx.destination);
    source.start();
    return source;
  }

  /** Start the idle hum loop */
  _startIdleLoop() {
    if (this.isIdlePlaying || !this.buffers.idle) return;

    this.idleGain = this.ctx.createGain();
    this.idleGain.gain.setValueAtTime(0, this.ctx.currentTime);
    // Fade in
    this.idleGain.gain.linearRampToValueAtTime(0.25, this.ctx.currentTime + 0.3);
    this.idleGain.connect(this.ctx.destination);

    this.idleSource = this.ctx.createBufferSource();
    this.idleSource.buffer = this.buffers.idle;
    this.idleSource.loop = true;
    this.idleSource.connect(this.idleGain);
    this.idleSource.start();
    this.isIdlePlaying = true;
  }

  /** Stop the idle hum loop */
  _stopIdleLoop() {
    if (!this.isIdlePlaying || !this.idleSource) return;
    try {
      // Fade out
      this.idleGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      const src = this.idleSource;
      setTimeout(() => {
        try { src.stop(); } catch (_) {}
      }, 300);
    } catch (_) {}
    this.idleSource = null;
    this.idleGain = null;
    this.isIdlePlaying = false;
  }

  /**
   * Called when hand opens — ignite the saber.
   */
  ignite() {
    if (this.isSaberOn) return;
    this.isSaberOn = true;
    this._playOneShot('ignition', 0.6);
    // Start idle hum after ignition sound plays briefly
    setTimeout(() => {
      if (this.isSaberOn) this._startIdleLoop();
    }, 400);
  }

  /**
   * Called when hand closes to fist — retract the saber.
   */
  retract() {
    if (!this.isSaberOn) return;
    this.isSaberOn = false;
    this._stopIdleLoop();
    // Play ignition in reverse feel — just lower volume quick cut
    // (or reuse ignition as retract sound)
    this._playOneShot('ignition', 0.3);
  }

  /**
   * Update idle hum volume based on hand speed (subtle pitch/volume variation).
   */
  updateSaber(speed, anyHandVisible) {
    if (!this.ctx || !this.enabled || !this.isSaberOn || !this.idleGain) return;

    const t = this.ctx.currentTime;
    const clampedSpeed = Math.min(speed, 5);

    // Idle volume varies slightly with movement
    const vol = 0.15 + clampedSpeed * 0.04;
    this.idleGain.gain.setTargetAtTime(Math.min(vol, 0.4), t, 0.05);

    // Playback rate shift for pitch variation
    if (this.idleSource) {
      const rate = 1.0 + clampedSpeed * 0.15;
      this.idleSource.playbackRate.setTargetAtTime(Math.min(rate, 1.8), t, 0.05);
    }
  }

  /**
   * Play swing sound on fast hand movement.
   */
  playSaberSwing() {
    if (!this.ctx || !this.enabled || !this.isSaberOn) return;
    const now = performance.now();
    if (now - this.lastSwingTime < this.swingCooldown) return;
    this.lastSwingTime = now;
    this._playOneShot('swing', 0.5);
  }

  /**
   * Play clash sound when blade hits a fruit.
   */
  playClash() {
    if (!this.ctx || !this.enabled) return;
    this._playOneShot('clash', 0.6);
  }

  /** Short bright slice sound (fallback / extra layer) */
  playSlice() {
    if (!this.ctx || !this.enabled) return;
    // Play clash for slice
    if (this.buffers.clash) {
      this._playOneShot('clash', 0.45);
      return;
    }
    // Fallback procedural
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(1600, t + 0.05);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.15);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  /** Combo sound — higher pitch */
  playCombo() {
    if (!this.ctx || !this.enabled) return;
    // Play clash + extra chime
    if (this.buffers.clash) {
      this._playOneShot('clash', 0.5);
    }
    const t = this.ctx.currentTime;
    [600, 900, 1200].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + i * 0.07);
      gain.gain.setValueAtTime(0.15, t + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.15);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.15);
    });
  }

  /** Bomb explosion — noise burst */
  playBomb() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const duration = 0.5;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + duration);
    source.connect(filter).connect(gain).connect(this.ctx.destination);
    source.start(t);
    source.stop(t + duration);
  }

  /** Heart pickup — pleasant rising chime */
  playHeart() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    [523, 659, 784].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.1);
      gain.gain.setValueAtTime(0.25, t + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.3);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.3);
    });
  }
}
