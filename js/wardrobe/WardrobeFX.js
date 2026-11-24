import * as THREE from 'three';

const SMOKE_PALETTE = [0xffb4d8, 0xfff5fb, 0xf799ca, 0xffe8f4, 0xffe4c4];
const SPARKLE_PALETTE = [0xffe07d, 0xfff4c2, 0xffc95c, 0xffd1ec];

/**
 * Efecto 3D de transformación mágica para el Vestidor Real (local y remoto P2P):
 * - Nube densa y suave de humo rosado/blanco con destellos dorados (~0.68 s).
 * - Dispara el callback `onPeak` en el pico de densidad (~120 ms) para aplicar
 *   el cambio de vestimenta mientras el cuerpo queda envuelto en humo.
 */
export class WardrobeFX {
  #scene;
  #smokeTexture = null;
  #sparkleTexture = null;
  #ringGeometry = null;
  #bursts = [];

  constructor(scene) {
    this.#scene = scene;
  }

  init() {
    this.#smokeTexture = this.#createSmokeTexture();
    this.#sparkleTexture = this.#createSparkleTexture();
    this.#ringGeometry = new THREE.RingGeometry(0.42, 0.56, 32);
  }

  /**
   * Lanza una nube mágica alrededor de `anchorObject` (p. ej. el root del personaje).
   * @param {THREE.Object3D} anchorObject
   * @param {{ peakMs?: number, onPeak?: () => void }} options
   * @returns {{ cancelPeak: () => void }}
   */
  trigger(anchorObject, { peakMs = 120, onPeak = null } = {}) {
    if (!this.#scene || !anchorObject) {
      onPeak?.();
      return { cancelPeak: () => {} };
    }

    const group = new THREE.Group();
    group.position.copy(anchorObject.position);
    this.#scene.add(group);

    const puffs = [];
    const puffCount = 30;
    for (let i = 0; i < puffCount; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.#smokeTexture,
        color: SMOKE_PALETTE[i % SMOKE_PALETTE.length],
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: true
      });
      mat.userData.isVfx = true;

      const sprite = new THREE.Sprite(mat);
      const angle = (i / puffCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
      const heightRatio = (i + Math.random() * 0.7) / puffCount;
      const baseY = 0.16 + heightRatio * 1.72;
      const startRadius = 0.08 + Math.random() * 0.24;
      const radialSpeed = 0.65 + Math.random() * 0.85;
      const baseScale = 0.72 + Math.random() * 0.55;

      sprite.position.set(Math.cos(angle) * startRadius, baseY, Math.sin(angle) * startRadius);
      sprite.scale.set(baseScale * 0.4, baseScale * 0.4, 1);
      mat.rotation = Math.random() * Math.PI * 2;
      group.add(sprite);

      puffs.push({
        sprite,
        mat,
        angle,
        baseY,
        startRadius,
        radialSpeed,
        riseSpeed: 0.25 + Math.random() * 0.45,
        swirlSpeed: (Math.random() < 0.5 ? -1 : 1) * (1.1 + Math.random() * 1.4),
        rotSpeed: (Math.random() - 0.5) * 2.4,
        baseScale,
        maxOpacity: 0.78 + Math.random() * 0.18
      });
    }

    const sparkles = [];
    const sparkleCount = 26;
    for (let i = 0; i < sparkleCount; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.#sparkleTexture,
        color: SPARKLE_PALETTE[i % SPARKLE_PALETTE.length],
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      });
      mat.userData.isVfx = true;

      const sprite = new THREE.Sprite(mat);
      const angle = Math.random() * Math.PI * 2;
      const baseY = 0.2 + Math.random() * 1.75;
      const startRadius = 0.18 + Math.random() * 0.28;
      sprite.position.set(Math.cos(angle) * startRadius, baseY, Math.sin(angle) * startRadius);
      group.add(sprite);

      sparkles.push({
        sprite,
        mat,
        angle,
        baseY,
        startRadius,
        radialSpeed: 1.05 + Math.random() * 1.25,
        riseSpeed: 0.55 + Math.random() * 0.9,
        swirlSpeed: (Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random() * 1.8),
        baseSize: 0.16 + Math.random() * 0.18,
        twinklePhase: Math.random() * Math.PI * 2
      });
    }

    // Aro mágico dorado expansivo alrededor de la silueta
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffdc88,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    ringMat.userData.isVfx = true;
    const ring = new THREE.Mesh(this.#ringGeometry, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.92;
    group.add(ring);

    const burst = {
      anchor: anchorObject,
      group,
      puffs,
      sparkles,
      ring,
      ringMat,
      elapsed: 0,
      smokeDuration: 0.66,
      totalDuration: 0.78,
      peakTime: Math.max(0.04, peakMs / 1000),
      peakFired: false,
      onPeak
    };
    this.#bursts.push(burst);

    return {
      cancelPeak: () => {
        burst.peakFired = true;
        burst.onPeak = null;
      }
    };
  }

  update(dt) {
    if (this.#bursts.length === 0) return;

    for (let i = this.#bursts.length - 1; i >= 0; i--) {
      const b = this.#bursts[i];
      b.elapsed += dt;

      if (b.anchor) {
        b.group.position.copy(b.anchor.position);
      }

      if (!b.peakFired && b.elapsed >= b.peakTime) {
        b.peakFired = true;
        const cb = b.onPeak;
        b.onPeak = null;
        cb?.();
      }

      // 1. Humo mágico denso (~0.66 s): sube rapidísimo hasta el pico y se disipa con elegancia
      const sk = Math.min(1, b.elapsed / b.smokeDuration);
      const smokeIn = Math.min(1, b.elapsed / 0.11);
      const smokeOut = sk <= 0.22 ? 1 : Math.pow(Math.max(0, 1 - (sk - 0.22) / 0.78), 1.65);
      const expandEase = 1 - Math.pow(1 - sk, 2.2);

      for (const p of b.puffs) {
        const ang = p.angle + b.elapsed * p.swirlSpeed;
        const rad = p.startRadius + expandEase * p.radialSpeed;
        const y = p.baseY + expandEase * p.riseSpeed;
        p.sprite.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);

        const s = p.baseScale * (0.48 + expandEase * 1.02);
        p.sprite.scale.set(s, s, 1);
        p.mat.rotation += p.rotSpeed * dt;
        p.mat.opacity = sk >= 1 ? 0 : smokeIn * smokeOut * p.maxOpacity;
      }

      // 2. Destellos dorados centelleantes (~0.78 s)
      const tk = Math.min(1, b.elapsed / b.totalDuration);
      const sparkleEase = 1 - Math.pow(1 - tk, 1.9);
      const sparkleFade = tk < 0.15 ? tk / 0.15 : Math.pow(Math.max(0, 1 - (tk - 0.15) / 0.85), 1.4);

      for (const sp of b.sparkles) {
        const ang = sp.angle + b.elapsed * sp.swirlSpeed;
        const rad = sp.startRadius + sparkleEase * sp.radialSpeed;
        const y = sp.baseY + sparkleEase * sp.riseSpeed;
        sp.sprite.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);

        const twinkle = 0.65 + 0.35 * Math.sin(b.elapsed * 26 + sp.twinklePhase);
        const size = sp.baseSize * (0.7 + sparkleEase * 0.55) * twinkle;
        sp.sprite.scale.set(size, size, 1);
        sp.mat.opacity = sparkleFade * twinkle;
      }

      // 3. Aro dorado expansivo (~0.45 s)
      const rk = Math.min(1, b.elapsed / 0.45);
      const ringScale = 0.5 + (1 - Math.pow(1 - rk, 2.4)) * 2.5;
      b.ring.scale.set(ringScale, ringScale, 1);
      b.ring.position.y = 0.85 + rk * 0.35;
      b.ringMat.opacity = rk >= 1 ? 0 : Math.sin(rk * Math.PI) * 0.72;

      if (b.elapsed >= b.totalDuration) {
        this.#disposeBurst(b);
        this.#bursts.splice(i, 1);
      }
    }
  }

  #disposeBurst(burst) {
    this.#scene?.remove(burst.group);
    for (const p of burst.puffs) p.mat.dispose();
    for (const sp of burst.sparkles) sp.mat.dispose();
    burst.ringMat.dispose();
  }

  #createSmokeTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = size / 2;

    // Nube esponjosa formada por varios lóbulos radiales suaves
    const lobes = [
      [c, c, c * 0.92, 0.95],
      [c - 14, c - 8, c * 0.62, 0.55],
      [c + 15, c - 6, c * 0.58, 0.5],
      [c - 6, c + 14, c * 0.6, 0.52],
      [c + 10, c + 12, c * 0.54, 0.46]
    ];
    for (const [x, y, r, alpha] of lobes) {
      const grad = ctx.createRadialGradient(x, y, r * 0.08, x, y, r);
      grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      grad.addColorStop(0.45, `rgba(255, 240, 250, ${alpha * 0.65})`);
      grad.addColorStop(0.78, `rgba(255, 214, 236, ${alpha * 0.22})`);
      grad.addColorStop(1, 'rgba(255, 200, 230, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  #createSparkleTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = size / 2;

    const halo = ctx.createRadialGradient(c, c, 1, c, c, c);
    halo.addColorStop(0, 'rgba(255, 255, 255, 1)');
    halo.addColorStop(0.3, 'rgba(255, 234, 158, 0.85)');
    halo.addColorStop(0.7, 'rgba(255, 206, 110, 0.18)');
    halo.addColorStop(1, 'rgba(255, 200, 100, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, size, size);

    // Estrella nítida de 4 puntas
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(c, 4);
    ctx.quadraticCurveTo(c, c, size - 4, c);
    ctx.quadraticCurveTo(c, c, c, size - 4);
    ctx.quadraticCurveTo(c, c, 4, c);
    ctx.quadraticCurveTo(c, c, c, 4);
    ctx.closePath();
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  dispose() {
    for (const b of this.#bursts) {
      this.#disposeBurst(b);
    }
    this.#bursts.length = 0;
    this.#smokeTexture?.dispose();
    this.#sparkleTexture?.dispose();
    this.#ringGeometry?.dispose();
    this.#smokeTexture = null;
    this.#sparkleTexture = null;
    this.#ringGeometry = null;
  }
}
