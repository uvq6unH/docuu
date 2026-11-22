// Web Audio API procedural sound engine for Folk Tag (Cảnh sát bắt cướp)
// Synthesizes spatial footsteps, capture alerts, rescue chimes, heartbeat tension, and ambient sounds without external files.

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private lastFootstepTime = 0;
  private lastRemoteFootstepTimes = new Map<string, number>();
  private lastHeartbeatTime = 0;
  private ambientSource: AudioBufferSourceNode | null = null;
  public enabled = true;
  public volume = 1.0;

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setMasterVolume(level: number): void {
    this.volume = Math.max(0, Math.min(1, level));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Local player footstep sound.
   */
  public playFootstep(isSprint: boolean, isCrouched: boolean): void {
    if (isCrouched) return; // Silent while crouched or creeping
    const now = performance.now();
    const interval = isSprint ? 270 : 420;
    if (now - this.lastFootstepTime < interval) return;
    this.lastFootstepTime = now;

    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(isSprint ? 180 : 120, ctx.currentTime);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isSprint ? 90 : 65, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.08);

      const vol = isSprint ? 0.15 : 0.08;
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch {
      // Audio autoplay policy catch
    }
  }

  /**
   * 3D Spatial audio for other players' footsteps.
   * Computes stereo panning and distance volume attenuation.
   */
  public playRemoteFootstep(
    playerId: string,
    sourcePos: [number, number, number],
    listenerPos: [number, number, number],
    listenerYaw: number,
    isSprint: boolean,
    isCrouched: boolean
  ): void {
    if (isCrouched) return;
    const now = performance.now();
    const lastTime = this.lastRemoteFootstepTimes.get(playerId) || 0;
    const interval = isSprint ? 280 : 430;
    if (now - lastTime < interval) return;
    this.lastRemoteFootstepTimes.set(playerId, now);

    const dx = sourcePos[0] - listenerPos[0];
    const dz = sourcePos[2] - listenerPos[2];
    const dist = Math.hypot(dx, dz);

    if (dist > 18.0 || dist < 0.2) return;

    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Attenuation: 1 / (1 + 0.35 * d)
      const distanceFactor = 1.0 / (1.0 + 0.35 * dist);
      const baseVol = (isSprint ? 0.22 : 0.12) * distanceFactor;

      // Stereo panning based on relative azimuth
      const bearing = Math.atan2(-dx, -dz);
      const relativeAngle = bearing - listenerYaw;
      const pan = Math.sin(relativeAngle);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.max(60, (isSprint ? 200 : 130) - dist * 6), ctx.currentTime);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isSprint ? 85 : 60, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(baseVol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      osc.connect(filter);
      filter.connect(gain);

      if (typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime);
        gain.connect(panner);
        panner.connect(this.masterGain);
      } else {
        gain.connect(this.masterGain);
      }

      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch {
      // Audio catch
    }
  }

  /**
   * Heartbeat tension effect when player is in danger or hiding near an opponent.
   * Danger level ranges from 0.0 (safe) to 1.0 (extreme danger).
   */
  public updateTensionHeartbeat(dangerLevel: number): void {
    if (dangerLevel <= 0.05) return;
    const now = performance.now();
    // BPM scales from 65 BPM (~920ms) to 140 BPM (~430ms)
    const intervalMs = 920 - dangerLevel * 490;
    if (now - this.lastHeartbeatTime < intervalMs) return;
    this.lastHeartbeatTime = now;

    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const vol = 0.08 + dangerLevel * 0.18;

      // 1st Thud (Lub)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      const filter1 = ctx.createBiquadFilter();

      filter1.type = 'lowpass';
      filter1.frequency.setValueAtTime(110, ctx.currentTime);

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(58, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(32, ctx.currentTime + 0.11);

      gain1.gain.setValueAtTime(vol, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.11);

      osc1.connect(filter1);
      filter1.connect(gain1);
      gain1.connect(this.masterGain);

      osc1.start();
      osc1.stop(ctx.currentTime + 0.12);

      // 2nd Thud (Dub) - 0.15s later
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      const filter2 = ctx.createBiquadFilter();

      filter2.type = 'lowpass';
      filter2.frequency.setValueAtTime(100, ctx.currentTime + 0.15);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(52, ctx.currentTime + 0.15);
      osc2.frequency.exponentialRampToValueAtTime(28, ctx.currentTime + 0.25);

      gain2.gain.setValueAtTime(0, ctx.currentTime);
      gain2.gain.setValueAtTime(vol * 0.85, ctx.currentTime + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc2.connect(filter2);
      filter2.connect(gain2);
      gain2.connect(this.masterGain);

      osc2.start(ctx.currentTime + 0.15);
      osc2.stop(ctx.currentTime + 0.26);
    } catch {
      // Audio catch
    }
  }

  /**
   * Sound effect when a police successfully tags/captures a robber.
   */
  public playCaptureSound(): void {
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      osc.stop(ctx.currentTime + 0.23);
    } catch {
      // Catch
    }
  }

  /**
   * Rescue chime when robber frees a jailed teammate.
   */
  public playRescueSound(): void {
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    try {
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.06);

        gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.06);
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + idx * 0.06 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.06 + 0.45);

        osc.connect(gain);
        gain.connect(master);

        osc.start(ctx.currentTime + idx * 0.06);
        osc.stop(ctx.currentTime + idx * 0.06 + 0.46);
      });
    } catch {
      // Catch
    }
  }

  public playCountdownBeep(isFinal: boolean): void {
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(isFinal ? 880 : 440, ctx.currentTime);

      const duration = isFinal ? 0.35 : 0.12;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Catch
    }
  }

  public playCaptureSwing(): void {
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, ctx.currentTime);
      filter.Q.setValueAtTime(1.5, ctx.currentTime);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(350, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    } catch {
      void 0;
    }
  }

  public playCaptureMiss(): void {
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } catch {
      // Catch
    }
  }

  /**
   * Tactical ping sonar chime.
   */
  public playPingSound(): void {
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1100, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(750, ctx.currentTime + 0.18);

      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);

      osc.connect(gain);
      gain.connect(master);

      osc.start();
      osc.stop(ctx.currentTime + 0.29);
    } catch {
      // Catch
    }
  }

  /**
   * Distraction pebble throw swoosh sound.
   */
  public playPebbleThrow(): void {
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.14);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(master);

      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } catch {
      // Catch
    }
  }

  /**
   * Distraction pebble impact / clack on ground.
   */
  public playPebbleHit(): void {
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(540, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(160, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(master);

      osc.start();
      osc.stop(ctx.currentTime + 0.10);
    } catch {
      // Catch
    }
  }

  /**
   * Quick team radio notification chime.
   */
  public playQuickChatChime(): void {
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    try {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      osc2.frequency.setValueAtTime(880.00, ctx.currentTime + 0.07); // A5

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(master);

      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.08);
      osc2.start(ctx.currentTime + 0.07);
      osc2.stop(ctx.currentTime + 0.23);
    } catch {
      // Catch
    }
  }

  /**
   * Procedural ambient sound for Vietnamese northern countryside.
   * Synthesizes soft breeze and distant summer chirps.
   */
  public startAmbientVillage(): void {
    if (this.ambientSource) return;
    const ctx = this.getContext();
    const master = this.masterGain;
    if (!ctx || !master) return;

    try {
      // Generate 2 seconds of pink/breeze noise buffer
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        output[i] = (b0 + b1 + b2) * 0.05;
      }

      this.ambientSource = ctx.createBufferSource();
      this.ambientSource.buffer = noiseBuffer;
      this.ambientSource.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(350, ctx.currentTime);
      filter.Q.setValueAtTime(0.8, ctx.currentTime);

      const ambGain = ctx.createGain();
      ambGain.gain.setValueAtTime(0.04, ctx.currentTime);

      this.ambientSource.connect(filter);
      filter.connect(ambGain);
      ambGain.connect(master);

      this.ambientSource.start();
    } catch {
      // Catch
    }
  }

  public stopAmbientVillage(): void {
    if (this.ambientSource) {
      try {
        this.ambientSource.stop();
        this.ambientSource.disconnect();
      } catch {
        // Catch
      }
      this.ambientSource = null;
    }
  }
}

export const sound = new SoundEngine();
