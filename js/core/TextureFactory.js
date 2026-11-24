import * as THREE from 'three';

/**
 * Fábrica de texturas procedurales para arquitectura y jardines del Palacio de Cristal.
 */
export class TextureFactory {
  #cache = new Map();

  init() {}

  getTexture(key, repeatX = 1, repeatY = 1) {
    const cacheKey = `${key}_${repeatX}_${repeatY}`;
    if (this.#cache.has(cacheKey)) return this.#cache.get(cacheKey);
    const baseKey = `${key}_base`;
    let baseCanvas = this.#cache.get(baseKey);
    if (!baseCanvas) {
      baseCanvas = this.#buildCanvas(key);
      this.#cache.set(baseKey, baseCanvas);
    }
    const tex = new THREE.CanvasTexture(baseCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    this.#cache.set(cacheKey, tex);
    return tex;
  }

  #buildCanvas(key) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const fn = {
      marble: () => this.#drawMarble(ctx, 256),
      marbleFloor: () => this.#drawMarbleFloor(ctx, 256),
      roseGold: () => this.#drawRoseGold(ctx, 256),
      grass: () => this.#drawGrass(ctx, 256),
      hedge: () => this.#drawHedge(ctx, 256),
      water: () => this.#drawWater(ctx, 256),
      stainedCrystal: () => this.#drawStainedCrystal(ctx, 256),
      danceFloor: () => this.#drawDanceFloor(ctx, 256),
      carpet: () => this.#drawCarpet(ctx, 256)
    }[key];
    if (fn) fn();
    else {
      ctx.fillStyle = '#fff5fa';
      ctx.fillRect(0, 0, 256, 256);
    }
    return canvas;
  }

  #drawMarble(ctx, s) {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#f7f1f4');
    g.addColorStop(0.5, '#ede2e8');
    g.addColorStop(1, '#f5edf1');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      let x = Math.random() * s;
      let y = 0;
      ctx.moveTo(x, y);
      while (y < s) {
        x += (Math.random() - 0.45) * 24;
        y += 16;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(210,158,158,0.24)' : 'rgba(175,155,172,0.2)';
      ctx.lineWidth = 0.8 + Math.random() * 2.2;
      ctx.stroke();
    }
  }

  #drawMarbleFloor(ctx, s) {
    this.#drawMarble(ctx, s);
    ctx.strokeStyle = 'rgba(204,154,112,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, s - 4, s - 4);
    ctx.beginPath();
    ctx.moveTo(s / 2, 14);
    ctx.lineTo(s - 14, s / 2);
    ctx.lineTo(s / 2, s - 14);
    ctx.lineTo(14, s / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(248,218,232,0.34)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(212,162,114,0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  #drawRoseGold(ctx, s) {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#f3c6bd');
    g.addColorStop(0.5, '#df9e9a');
    g.addColorStop(1, '#f0c8b0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let y = 0; y < s; y += 3) ctx.fillRect(0, y, s, 1);
  }

  #drawGrass(ctx, s) {
    ctx.fillStyle = '#5da46d';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 650; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(130,198,128,0.25)' : 'rgba(56,115,68,0.22)';
      ctx.fillRect(Math.random() * s, Math.random() * s, 4, 9);
    }
  }

  #drawHedge(ctx, s) {
    ctx.fillStyle = '#2f6d46';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 480; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 3 + Math.random() * 6, 0, Math.PI * 2);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(84,158,98,0.38)' : i % 5 === 0 ? 'rgba(255,168,208,0.22)' : 'rgba(26,72,42,0.35)';
      ctx.fill();
    }
  }

  #drawWater(ctx, s) {
    const g = ctx.createRadialGradient(s / 2, s / 2, 10, s / 2, s / 2, s * 0.7);
    g.addColorStop(0, '#a6eaf8');
    g.addColorStop(0.6, '#65cbe6');
    g.addColorStop(1, '#50aed4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 10 + Math.random() * 28, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  #drawStainedCrystal(ctx, s) {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#ffd4ec');
    g.addColorStop(0.5, '#d5ecff');
    g.addColorStop(1, '#ffe4b8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#d9a48c';
    ctx.lineWidth = 5;
    for (let i = -s; i < s * 2; i += 42) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + s, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + s, 0);
      ctx.lineTo(i, s);
      ctx.stroke();
    }
    ctx.strokeRect(4, 4, s - 8, s - 8);
  }

  #drawDanceFloor(ctx, s) {
    ctx.fillStyle = '#3b1c47';
    ctx.fillRect(0, 0, s, s);
    const cell = s / 4;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#f8a5cf' : '#c6a2ff';
        ctx.fillRect(c * cell + 3, r * cell + 3, cell - 6, cell - 6);
        ctx.strokeStyle = '#ffe5ad';
        ctx.lineWidth = 2;
        ctx.strokeRect(c * cell + 3, r * cell + 3, cell - 6, cell - 6);
      }
    }
  }

  #drawCarpet(ctx, s) {
    ctx.fillStyle = '#b63173';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#e7bd74';
    ctx.fillRect(10, 0, 12, s);
    ctx.fillRect(s - 22, 0, 12, s);
    ctx.strokeStyle = 'rgba(255,224,165,0.35)';
    ctx.lineWidth = 2;
    for (let y = 16; y < s; y += 32) {
      ctx.beginPath();
      ctx.arc(s / 2, y, 14, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  update() {}

  dispose() {
    for (const val of this.#cache.values()) {
      if (val && typeof val.dispose === 'function') val.dispose();
    }
    this.#cache.clear();
  }
}
