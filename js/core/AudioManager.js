/**
 * Gestor de efectos de sonido (SFX) cortos, suaves y agradables mediante Web Audio API.
 * Sin música de fondo ni bucles continuos: solo feedback sonoro puntual y silenciable.
 */
export class AudioManager {
  #ctx = null;
  #masterGain = null;
  #sfxGain = null;
  #noiseBuffer = null;
  #muted = false;
  #unlockBound = null;

  init() {
    this.#unlockBound = () => this.#unlockIfExisting();
    window.addEventListener('pointerdown', this.#unlockBound, { passive: true });
    window.addEventListener('keydown', this.#unlockBound, { passive: true });
  }

  #unlockIfExisting() {
    if (this.#ctx && this.#ctx.state === 'suspended') {
      this.#ctx.resume().catch(() => {});
    }
  }

  #ensureContext() {
    if (this.#muted) return false;
    if (!this.#ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      this.#ctx = new AudioCtx();

      this.#masterGain = this.#ctx.createGain();
      this.#masterGain.gain.value = 0.42;
      this.#masterGain.connect(this.#ctx.destination);

      this.#sfxGain = this.#ctx.createGain();
      this.#sfxGain.gain.value = 0.65;
      this.#sfxGain.connect(this.#masterGain);

      this.#noiseBuffer = this.#createSoftNoiseBuffer(this.#ctx);
    }
    if (this.#ctx.state === 'suspended') {
      this.#ctx.resume().catch(() => {});
    }
    return this.#ctx.state === 'running' || this.#ctx.state === 'suspended';
  }

  #createSoftNoiseBuffer(ctx) {
    const length = Math.floor(ctx.sampleRate * 0.35);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Ruido rosado suavizado para el "poof" mágico del vestidor
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.950 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.018) * 1.4;
    }
    return buffer;
  }

  toggleMute() {
    this.#muted = !this.#muted;
    if (this.#masterGain && this.#ctx) {
      this.#masterGain.gain.setTargetAtTime(this.#muted ? 0 : 0.42, this.#ctx.currentTime, 0.03);
    }
    return this.#muted;
  }

  isMuted() {
    return this.#muted;
  }

  #playTone(freq, endFreq, duration, type = 'sine', volume = 0.16, delay = 0) {
    if (!this.#ensureContext() || !this.#ctx || !this.#sfxGain || this.#muted) return;
    const now = this.#ctx.currentTime + delay;
    const osc = this.#ctx.createOscillator();
    const gain = this.#ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + Math.min(0.018, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.#sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  /** Clic sutil y cálido para botones y menús. */
  playClick() {
    this.#playTone(620, 780, 0.06, 'sine', 0.13);
  }

  /** Sonido mágico suave de "poof" y destello cristalino al cambiar de ropa en el vestidor. */
  playWardrobePoof() {
    if (!this.#ensureContext() || !this.#ctx || !this.#sfxGain || this.#muted) return;
    const now = this.#ctx.currentTime;

    // 1. Suave soplo de humo mágico (ruido rosado filtrado en banda)
    if (this.#noiseBuffer) {
      const src = this.#ctx.createBufferSource();
      src.buffer = this.#noiseBuffer;

      const filter = this.#ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1450, now);
      filter.frequency.exponentialRampToValueAtTime(520, now + 0.24);
      filter.Q.value = 1.4;

      const gain = this.#ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.#sfxGain);
      src.start(now);
      src.stop(now + 0.30);
    }

    // 2. Acorde sutil de destellos dorados
    const chimes = [880, 1174.66, 1567.98];
    chimes.forEach((freq, idx) => {
      this.#playTone(freq, freq * 1.015, 0.24, 'sine', 0.11, 0.04 + idx * 0.045);
    });
  }

  /** Destello suave para acciones especiales, emotes o cambio de reino. */
  playSparkle() {
    [783.99, 1046.5, 1318.51].forEach((freq, idx) => {
      this.#playTone(freq, freq * 1.02, 0.20, 'sine', 0.13, idx * 0.05);
    });
  }

  /** Salto ligero y aéreo. */
  playJump() {
    this.#playTone(300, 480, 0.13, 'sine', 0.14);
  }

  /** Recogida de gema o paso por aro de carrera. */
  playGemCollect() {
    [659.25, 880, 1174.66, 1567.98].forEach((freq, idx) => {
      this.#playTone(freq, freq * 1.01, 0.24, 'sine', 0.16, idx * 0.055);
    });
  }

  /** Fanfarria breve y amable al completar una misión o minijuego. */
  playQuestComplete() {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      this.#playTone(freq, freq, 0.30, 'triangle', 0.16, idx * 0.075);
    });
  }

  /** Nota puntual para el minijuego de baile del Salón Real. */
  playBeatNote(lane = 0) {
    const notes = [523.25, 659.25, 783.99, 987.77];
    const freq = notes[lane % notes.length];
    this.#playTone(freq, freq * 1.005, 0.16, 'triangle', 0.18);
  }

  /** Error suave (sin onda agresiva) para minijuegos. */
  playMiss() {
    this.#playTone(220, 165, 0.12, 'sine', 0.10);
  }

  /** Cuenta atrás suave para la carrera por los jardines. */
  playCountdown(isGo = false) {
    this.#playTone(
      isGo ? 880 : 523.25,
      isGo ? 1046.5 : 523.25,
      isGo ? 0.28 : 0.14,
      'sine',
      0.16
    );
  }

  update() {}

  dispose() {
    if (this.#unlockBound) {
      window.removeEventListener('pointerdown', this.#unlockBound);
      window.removeEventListener('keydown', this.#unlockBound);
      this.#unlockBound = null;
    }
    this.#noiseBuffer = null;
    if (this.#ctx) {
      this.#ctx.close().catch(() => {});
      this.#ctx = null;
    }
  }
}
