import * as THREE from 'three';

export class TextureFactory {
  #cache = new Map();

  init() {
    // Las texturas se generan bajo demanda y se cachean en memoria
  }

  getTexture(key, repeatX = 1, repeatY = 1) {
    const cacheKey = `${key}_${repeatX}_${repeatY}`;
    if (this.#cache.has(cacheKey)) {
      return this.#cache.get(cacheKey);
    }

    const baseKey = `${key}_base`;
    let baseCanvas = this.#cache.get(baseKey);
    if (!baseCanvas) {
      baseCanvas = this.#buildCanvas(key);
      this.#cache.set(baseKey, baseCanvas);
    }

    const texture = new THREE.CanvasTexture(baseCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    this.#cache.set(cacheKey, texture);
    return texture;
  }

  #buildCanvas(key) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    switch (key) {
      case 'marble':
        this.#drawMarble(ctx, 256);
        break;
      case 'marbleFloor':
        this.#drawMarbleFloor(ctx, 256);
        break;
      case 'roseGold':
        this.#drawRoseGold(ctx, 256);
        break;
      case 'grass':
        this.#drawGrass(ctx, 256);
        break;
      case 'hedge':
        this.#drawHedge(ctx, 256);
        break;
      case 'water':
        this.#drawWater(ctx, 256);
        break;
      case 'stainedCrystal':
        this.#drawStainedCrystal(ctx, 256);
        break;
      case 'danceFloor':
        this.#drawDanceFloor(ctx, 256);
        break;
      case 'carpet':
        this.#drawCarpet(ctx, 256);
        break;
      default:
        ctx.fillStyle = '#fff5fa';
        ctx.fillRect(0, 0, 256, 256);
        break;
    }
    return canvas;
  }

  #drawMarble(ctx, s) {
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, '#fffafd');
    grad.addColorStop(0.5, '#f7edf2');
    grad.addColorStop(1, '#fff6fa');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    // Vetas suaves en gris perla y oro rosa
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
      ctx.strokeStyle = i % 3 === 0
        ? 'rgba(218, 165, 165, 0.24)'
        : 'rgba(182, 162, 178, 0.2)';
      ctx.lineWidth = 0.8 + Math.random() * 2.2;
      ctx.stroke();
    }
  }

  #drawMarbleFloor(ctx, s) {
    this.#drawMarble(ctx, s);
    ctx.strokeStyle = 'rgba(212, 162, 118, 0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, s - 4, s - 4);

    // Inlay geométrico romboidal
    ctx.beginPath();
    ctx.moveTo(s / 2, 14);
    ctx.lineTo(s - 14, s / 2);
    ctx.lineTo(s / 2, s - 14);
    ctx.lineTo(14, s / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 224, 238, 0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(220, 170, 120, 0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  #drawRoseGold(ctx, s) {
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, '#f3c6bd');
    grad.addColorStop(0.5, '#df9e9a');
    grad.addColorStop(1, '#f0c8b0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let y = 0; y < s; y += 3) {
      ctx.fillRect(0, y, s, 1);
    }
  }

  #drawGrass(ctx, s) {
    ctx.fillStyle = '#5da46d';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 650; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(130, 198, 128, 0.25)' : 'rgba(56, 115, 68, 0.22)';
      ctx.fillRect(x, y, 4, 9);
    }
  }

  #drawHedge(ctx, s) {
    ctx.fillStyle = '#2f6d46';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 480; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 3 + Math.random() * 6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = i % 3 === 0
        ? 'rgba(84, 158, 98, 0.38)'
        : i % 5 === 0
          ? 'rgba(255, 168, 208, 0.22)'
          : 'rgba(26, 72, 42, 0.35)';
      ctx.fill();
    }
  }

  #drawWater(ctx, s) {
    const grad = ctx.createRadialGradient(s / 2, s / 2, 10, s / 2, s / 2, s * 0.7);
    grad.addColorStop(0, '#b5f3ff');
    grad.addColorStop(0.6, '#6fd3ef');
    grad.addColorStop(1, '#58b7dc');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 10 + Math.random() * 28, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  #drawStainedCrystal(ctx, s) {
    const grad = ctx.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#ffd4ec');
    grad.addColorStop(0.5, '#d5ecff');
    grad.addColorStop(1, '#ffe4b8');
    ctx.fillStyle = grad;
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
        const even = (r + c) % 2 === 0;
        ctx.fillStyle = even ? '#f8a5cf' : '#c6a2ff';
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
    ctx.strokeStyle = 'rgba(255, 224, 165, 0.35)';
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
      if (val && typeof val.dispose === 'function') {
        val.dispose();
      }
    }
    this.#cache.clear();
  }
}
