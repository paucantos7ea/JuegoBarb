import * as THREE from 'three';

const FONT_STACK = '"Segoe UI", system-ui, sans-serif';

function roundRectPath(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeSprite(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 999;
  return sprite;
}

/**
 * Etiqueta de nombre sobre la cabeza. Un único canvas + CanvasTexture por jugador:
 * al renombrar se redibuja el mismo canvas (sin texturas nuevas).
 */
export class NameTag {
  #canvas;
  #ctx;
  #text = '';
  sprite;

  constructor(text, { y = 2.22 } = {}) {
    this.#canvas = document.createElement('canvas');
    this.#canvas.width = 512;
    this.#canvas.height = 112;
    this.#ctx = this.#canvas.getContext('2d');
    this.sprite = makeSprite(this.#canvas);
    this.sprite.material.color.setScalar(0.82);
    this.sprite.position.set(0, y, 0);
    this.sprite.scale.set(1.9, 0.415, 1);
    this.setText(text);
  }

  setText(text) {
    const value = String(text || '').slice(0, 26);
    if (value === this.#text) return;
    this.#text = value;
    const ctx = this.#ctx;
    ctx.clearRect(0, 0, 512, 112);
    ctx.font = `bold 40px ${FONT_STACK}`;
    const w = Math.min(488, Math.max(150, ctx.measureText(value).width + 64));
    const x = (512 - w) / 2;
    roundRectPath(ctx, x, 12, w, 86, 43);
    ctx.fillStyle = 'rgba(42, 16, 38, 0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(244, 198, 130, 0.9)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#fff6fa';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, 256, 57, 460);
    this.sprite.material.map.needsUpdate = true;
  }

  dispose() {
    this.sprite.removeFromParent();
    this.sprite.material.map?.dispose();
    this.sprite.material.dispose();
  }
}

/**
 * Burbuja de chat 3D: se reutiliza el mismo sprite/canvas para todos los mensajes,
 * visible 4.5 s con un fundido suave al final.
 */
export class ChatBubble {
  static DURATION = 4.5;
  static FADE = 0.45;

  #canvas;
  #ctx;
  #timer = 0;
  sprite;

  constructor({ y = 2.82 } = {}) {
    this.#canvas = document.createElement('canvas');
    this.#canvas.width = 512;
    this.#canvas.height = 176;
    this.#ctx = this.#canvas.getContext('2d');
    this.sprite = makeSprite(this.#canvas);
    this.sprite.position.set(0, y, 0);
    this.sprite.scale.set(2.5, 0.86, 1);
    this.sprite.visible = false;
  }

  #wrap(text) {
    const ctx = this.#ctx;
    const maxW = 440;
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (!line || ctx.measureText(test).width <= maxW) {
        line = test;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    if (lines.length > 2) {
      lines.length = 2;
      lines[1] = `${lines[1]}…`;
    }
    return lines;
  }

  show(message) {
    const text = String(message || '').trim().slice(0, 60);
    if (!text) return;
    const ctx = this.#ctx;
    ctx.clearRect(0, 0, 512, 176);
    ctx.font = `600 34px ${FONT_STACK}`;
    const lines = this.#wrap(text);
    let widest = 0;
    for (const l of lines) widest = Math.max(widest, ctx.measureText(l).width);
    const w = Math.min(500, Math.max(140, widest + 48));
    const h = lines.length > 1 ? 120 : 76;
    const x = (512 - w) / 2;
    const y = 148 - h - 18;

    // Globo + piquito hacia la cabeza
    roundRectPath(ctx, x, y, w, h, 30);
    ctx.fillStyle = 'rgba(255, 248, 252, 0.96)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(229, 184, 105, 0.95)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(238, y + h - 2);
    ctx.lineTo(256, y + h + 22);
    ctx.lineTo(274, y + h - 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 248, 252, 0.96)';
    ctx.fill();

    ctx.fillStyle = '#7a1f4d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lineH = 42;
    const startY = y + h / 2 - ((lines.length - 1) * lineH) / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 256, startY + i * lineH, 470);
    }
    this.sprite.material.map.needsUpdate = true;
    this.sprite.material.opacity = 1;
    this.sprite.visible = true;
    this.#timer = ChatBubble.DURATION;
  }

  hide() {
    this.#timer = 0;
    this.sprite.visible = false;
  }

  update(dt) {
    if (this.#timer <= 0) return;
    this.#timer -= dt;
    if (this.#timer <= 0) {
      this.sprite.visible = false;
      return;
    }
    if (this.#timer < ChatBubble.FADE) {
      this.sprite.material.opacity = this.#timer / ChatBubble.FADE;
    }
  }

  dispose() {
    this.sprite.removeFromParent();
    this.sprite.material.map?.dispose();
    this.sprite.material.dispose();
  }
}
