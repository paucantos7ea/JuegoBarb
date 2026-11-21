export class AudioSynthesizer {
  #ctx = null;
  #masterGain = null;
  #musicGain = null;
  #sfxGain = null;
  #muted = false;
  #musicRunning = false;
  #stepTimer = 0;
  #noteIndex = 0;
  #musicMood = 'golden';
  #unlockBound = null;

  #scales = {
    golden: [523.25, 659.25, 783.99, 987.77, 1046.5, 783.99, 659.25, 587.33],
    sunset: [440.0, 554.37, 659.25, 830.61, 880.0, 659.25, 554.37, 493.88],
    gala: [493.88, 587.33, 739.99, 880.0, 987.77, 739.99, 659.25, 587.33]
  };

  init() {
    this.#unlockBound = () => this.#ensureContext();
    window.addEventListener('pointerdown', this.#unlockBound, { once: false });
    window.addEventListener('keydown', this.#unlockBound, { once: false });
  }

  #ensureContext() {
    if (!this.#ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.#ctx = new AudioCtx();
      this.#masterGain = this.#ctx.createGain();
      this.#masterGain.gain.value = this.#muted ? 0 : 0.45;
      this.#masterGain.connect(this.#ctx.destination);

      this.#musicGain = this.#ctx.createGain();
      this.#musicGain.gain.value = 0.24;
      this.#musicGain.connect(this.#masterGain);

      this.#sfxGain = this.#ctx.createGain();
      this.#sfxGain.gain.value = 0.6;
      this.#sfxGain.connect(this.#masterGain);
    }
    if (this.#ctx && this.#ctx.state === 'suspended') {
      this.#ctx.resume().catch(() => {});
    }
  }

  setMood(mood) {
    if (this.#scales[mood]) {
      this.#musicMood = mood;
    }
  }

  startAmbient() {
    this.#musicRunning = true;
  }

  stopAmbient() {
    this.#musicRunning = false;
  }

  toggleMute() {
    this.#muted = !this.#muted;
    if (this.#masterGain && this.#ctx) {
      this.#masterGain.gain.setTargetAtTime(this.#muted ? 0 : 0.45, this.#ctx.currentTime, 0.04);
    }
    return this.#muted;
  }

  isMuted() {
    return this.#muted;
  }

  update(dt) {
    if (!this.#musicRunning || this.#muted || !this.#ctx || this.#ctx.state !== 'running') {
      return;
    }
    this.#stepTimer += dt;
    const interval = this.#musicMood === 'gala' ? 0.56 : 0.72;
    if (this.#stepTimer >= interval) {
      this.#stepTimer -= interval;
      const scale = this.#scales[this.#musicMood] || this.#scales.golden;
      const freq = scale[this.#noteIndex % scale.length];
      this.#playHarpNote(freq, 1.35, 0.22);
      if (this.#noteIndex % 4 === 0) {
        this.#playPadChord(freq * 0.5, 2.4, 0.14);
      }
      this.#noteIndex++;
    }
  }

  #playHarpNote(freq, duration, volume) {
    if (!this.#ctx || !this.#musicGain) return;
    const now = this.#ctx.currentTime;
    const osc = this.#ctx.createOscillator();
    const gain = this.#ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.#musicGain);
    osc.start(now);
    osc.stop(now + duration + 0.04);
  }

  #playPadChord(rootFreq, duration, volume) {
    if (!this.#ctx || !this.#musicGain) return;
    const ratios = [1, 1.25, 1.5];
    const now = this.#ctx.currentTime;
    for (const r of ratios) {
      const osc = this.#ctx.createOscillator();
      const gain = this.#ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(rootFreq * r, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volume * 0.35, now + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.#musicGain);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    }
  }

  #playTone(freq, endFreq, duration, type = 'sine', volume = 0.28) {
    this.#ensureContext();
    if (!this.#ctx || !this.#sfxGain || this.#muted) return;
    const now = this.#ctx.currentTime;
    const osc = this.#ctx.createOscillator();
    const gain = this.#ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.#sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  playClick() {
    this.#playTone(680, 920, 0.08, 'triangle', 0.22);
  }

  playJump() {
    this.#playTone(320, 560, 0.16, 'sine', 0.24);
  }

  playSparkle() {
    [880, 1174.66, 1567.98].forEach((f, idx) => {
      setTimeout(() => this.#playTone(f, f * 1.04, 0.22, 'triangle', 0.2), idx * 55);
    });
  }

  playGemCollect() {
    [659.25, 880, 1174.66, 1760].forEach((f, idx) => {
      setTimeout(() => this.#playTone(f, f * 1.02, 0.28, 'sine', 0.26), idx * 65);
    });
  }

  playQuestComplete() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, idx) => {
      setTimeout(() => this.#playTone(f, f, 0.36, 'triangle', 0.28), idx * 80);
    });
  }

  playBeatNote(lane = 0) {
    const notes = [523.25, 659.25, 783.99, 987.77];
    const f = notes[lane % notes.length];
    this.#playTone(f, f * 1.01, 0.18, 'triangle', 0.3);
  }

  playMiss() {
    this.#playTone(210, 150, 0.16, 'sawtooth', 0.14);
  }

  playCountdown(isGo = false) {
    this.#playTone(isGo ? 1046.5 : 523.25, isGo ? 1318.5 : 523.25, isGo ? 0.35 : 0.16, 'triangle', 0.3);
  }

  dispose() {
    this.#musicRunning = false;
    if (this.#unlockBound) {
      window.removeEventListener('pointerdown', this.#unlockBound);
      window.removeEventListener('keydown', this.#unlockBound);
    }
    if (this.#ctx) {
      this.#ctx.close().catch(() => {});
      this.#ctx = null;
    }
  }
}
