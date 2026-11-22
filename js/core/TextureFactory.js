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

  getFaceTexture(avatar) {
    const key = `face_${avatar.id}`;
    if (this.#cache.has(key)) {
      return this.#cache.get(key);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    this.#drawDollFace(ctx, 512, avatar);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    this.#cache.set(key, texture);
    return texture;
  }

  #drawDollFace(ctx, s, av) {
    const isMale = av.gender === 'male';
    const cx = s * 0.5;

    // Piel base con sombreado suave en sienes y mandíbula
    ctx.fillStyle = av.skinHex;
    ctx.fillRect(0, 0, s, s);

    const faceGlow = ctx.createRadialGradient(cx, s * 0.48, 12, cx, s * 0.5, s * 0.24);
    faceGlow.addColorStop(0, 'rgba(255, 252, 248, 0.14)');
    faceGlow.addColorStop(0.7, 'rgba(255, 255, 255, 0)');
    faceGlow.addColorStop(1, 'rgba(110, 58, 48, 0.12)');
    ctx.fillStyle = faceGlow;
    ctx.fillRect(0, 0, s, s);

    // Rubor difuminado en mejillas
    const blushAlpha = isMale ? 0.1 : 0.34;
    for (const dir of [-1, 1]) {
      const bx = cx + dir * 48;
      const by = 282;
      const bg = ctx.createRadialGradient(bx, by, 2, bx, by, 28);
      bg.addColorStop(0, this.#hexToRgba(av.blushHex, blushAlpha));
      bg.addColorStop(1, this.#hexToRgba(av.blushHex, 0));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(bx, by, 28, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ojos grandes y expresivos (izquierdo y derecho)
    for (const dir of [-1, 1]) {
      this.#drawEye(ctx, cx + dir * 32, 248, dir, av, isMale);
    }

    // Sombra sutil y brillo del puente nasal
    const noseGrad = ctx.createLinearGradient(cx, 254, cx, 284);
    noseGrad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
    noseGrad.addColorStop(1, 'rgba(95, 50, 42, 0.16)');
    ctx.fillStyle = noseGrad;
    ctx.beginPath();
    ctx.ellipse(cx, 272, 4.5, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // Labios esculpidos con arco de Cupido y brillo
    this.#drawLips(ctx, cx, 310, av, isMale);
  }

  #drawEye(ctx, ex, ey, dir, av, isMale) {
    const rx = isMale ? 15.5 : 18.5;
    const ry = isMale ? 9.5 : 13.5;

    // Sombra de párpado suave
    if (!isMale) {
      const sh = ctx.createRadialGradient(ex, ey - 7, 3, ex, ey - 6, rx * 1.45);
      sh.addColorStop(0, this.#hexToRgba(av.shadowHex, 0.55));
      sh.addColorStop(1, this.#hexToRgba(av.shadowHex, 0));
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(ex, ey - 6, rx * 1.4, ry * 1.25, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Esclerótica blanca limpia con recorte almendrado
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ex - rx, ey + 1);
    ctx.quadraticCurveTo(ex, ey - ry * 1.25, ex + rx, ey + 1);
    ctx.quadraticCurveTo(ex, ey + ry * 1.05, ex - rx, ey + 1);
    ctx.closePath();
    ctx.fillStyle = '#fcfdff';
    ctx.fill();
    ctx.clip();

    // Iris con degradado luminoso y anillo limbal oscuro
    const irisR = isMale ? 7.8 : 10.6;
    const irisGrad = ctx.createLinearGradient(ex, ey - irisR, ex, ey + irisR);
    irisGrad.addColorStop(0, av.eyeTop);
    irisGrad.addColorStop(0.55, av.eyeMid);
    irisGrad.addColorStop(1, av.eyeBot);
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(ex, ey + 0.5, irisR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = av.eyeTop;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Pupila oscura
    ctx.fillStyle = '#140f18';
    ctx.beginPath();
    ctx.arc(ex, ey + 0.5, irisR * 0.48, 0, Math.PI * 2);
    ctx.fill();

    // Dos reflejos blancos de brillo (catchlights)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.beginPath();
    ctx.ellipse(ex - 3.6, ey - 3.4, 3.2, 2.7, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + 3.8, ey + 3.6, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Sombra suave del párpado superior sobre el ojo
    const lidShadow = ctx.createLinearGradient(ex, ey - ry, ex, ey);
    lidShadow.addColorStop(0, 'rgba(38, 20, 34, 0.34)');
    lidShadow.addColorStop(1, 'rgba(38, 20, 34, 0)');
    ctx.fillStyle = lidShadow;
    ctx.fillRect(ex - rx, ey - ry, rx * 2, ry);
    ctx.restore();

    // Delineado superior y pestañas arqueadas
    ctx.strokeStyle = '#1b111c';
    ctx.lineCap = 'round';
    ctx.lineWidth = isMale ? 2.4 : 3.8;
    ctx.beginPath();
    ctx.moveTo(ex - rx * 0.96, ey + 1);
    ctx.quadraticCurveTo(ex, ey - ry * 1.28, ex + rx * 0.96, ey + 1);
    ctx.stroke();

    if (!isMale) {
      // Rabillo delineado y pestañas exteriores
      const outerX = ex + dir * rx;
      ctx.lineWidth = 2.2;
      for (let i = 0; i < 3; i++) {
        const startX = outerX - dir * (i * 3.5);
        const startY = ey - 2 - i * 2.2;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(startX + dir * 5, startY - 4, startX + dir * 8.5, startY - 6.5);
        ctx.stroke();
      }
      // Línea suave del pliegue del párpado
      ctx.strokeStyle = 'rgba(95, 55, 52, 0.38)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ex - rx * 0.8, ey - ry * 0.95);
      ctx.quadraticCurveTo(ex, ey - ry * 1.6, ex + rx * 0.85, ey - ry * 0.88);
      ctx.stroke();
    }

    // Ceja perfilada acorde al color de pelo
    ctx.strokeStyle = av.browHex;
    ctx.lineCap = 'round';
    ctx.lineWidth = isMale ? 4.4 : 3.0;
    ctx.beginPath();
    const innerX = ex - dir * (rx * 0.95);
    const archX = ex + dir * (rx * 0.28);
    const tailX = ex + dir * (rx * 1.18);
    const baseY = ey - (isMale ? 17 : 22);
    ctx.moveTo(innerX, baseY + 2);
    ctx.quadraticCurveTo(archX, baseY - (isMale ? 2.5 : 5.5), tailX, baseY + 3);
    ctx.stroke();
  }

  #drawLips(ctx, cx, ly, av, isMale) {
    const w = isMale ? 16 : 19;
    const hUpper = isMale ? 4.5 : 7.5;
    const hLower = isMale ? 5.5 : 9.2;

    // Labio superior con arco de Cupido
    ctx.fillStyle = av.lipHex;
    ctx.beginPath();
    ctx.moveTo(cx - w, ly);
    ctx.quadraticCurveTo(cx - w * 0.42, ly - hUpper, cx, ly - hUpper * 0.55);
    ctx.quadraticCurveTo(cx + w * 0.42, ly - hUpper, cx + w, ly);
    ctx.quadraticCurveTo(cx, ly + 2.2, cx - w, ly);
    ctx.closePath();
    ctx.fill();

    // Labio inferior
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.92, ly + 0.5);
    ctx.quadraticCurveTo(cx, ly + hLower * 1.35, cx + w * 0.92, ly + 0.5);
    ctx.quadraticCurveTo(cx, ly + 2.0, cx - w * 0.92, ly + 0.5);
    ctx.closePath();
    ctx.fill();

    // Línea de sonrisa delicada
    ctx.strokeStyle = 'rgba(92, 28, 48, 0.48)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.95, ly + 0.2);
    ctx.quadraticCurveTo(cx, ly + 2.6, cx + w * 0.95, ly + 0.2);
    ctx.stroke();

    // Brillo gloss en el labio inferior
    if (!isMale) {
      ctx.fillStyle = 'rgba(255, 240, 248, 0.65)';
      ctx.beginPath();
      ctx.ellipse(cx - 2, ly + 4.8, 6.2, 2.2, -0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  #hexToRgba(hex, alpha) {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  #buildCanvas(key) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const handlers = {
      marble: () => this.#drawMarble(ctx, 256),
      marbleFloor: () => this.#drawMarbleFloor(ctx, 256),
      roseGold: () => this.#drawRoseGold(ctx, 256),
      grass: () => this.#drawGrass(ctx, 256),
      hedge: () => this.#drawHedge(ctx, 256),
      water: () => this.#drawWater(ctx, 256),
      stainedCrystal: () => this.#drawStainedCrystal(ctx, 256),
      danceFloor: () => this.#drawDanceFloor(ctx, 256),
      carpet: () => this.#drawCarpet(ctx, 256)
    };
    if (handlers[key]) handlers[key]();
    else {
      ctx.fillStyle = '#fff5fa';
      ctx.fillRect(0, 0, 256, 256);
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
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      let x = Math.random() * s;
      let y = 0;
      ctx.moveTo(x, y);
      while (y < s) { x += (Math.random() - 0.45) * 24; y += 16; ctx.lineTo(x, y); }
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(218, 165, 165, 0.24)' : 'rgba(182, 162, 178, 0.2)';
      ctx.lineWidth = 0.8 + Math.random() * 2.2;
      ctx.stroke();
    }
  }

  #drawMarbleFloor(ctx, s) {
    this.#drawMarble(ctx, s);
    ctx.strokeStyle = 'rgba(212, 162, 118, 0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, s - 4, s - 4);
    ctx.beginPath();
    ctx.moveTo(s / 2, 14); ctx.lineTo(s - 14, s / 2); ctx.lineTo(s / 2, s - 14); ctx.lineTo(14, s / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 224, 238, 0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(220, 170, 120, 0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  #drawRoseGold(ctx, s) {
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, '#f3c6bd'); grad.addColorStop(0.5, '#df9e9a'); grad.addColorStop(1, '#f0c8b0');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let y = 0; y < s; y += 3) ctx.fillRect(0, y, s, 1);
  }

  #drawGrass(ctx, s) {
    ctx.fillStyle = '#5da46d'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 650; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(130, 198, 128, 0.25)' : 'rgba(56, 115, 68, 0.22)';
      ctx.fillRect(Math.random() * s, Math.random() * s, 4, 9);
    }
  }

  #drawHedge(ctx, s) {
    ctx.fillStyle = '#2f6d46'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 480; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 3 + Math.random() * 6, 0, Math.PI * 2);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(84,158,98,0.38)' : i % 5 === 0 ? 'rgba(255,168,208,0.22)' : 'rgba(26,72,42,0.35)';
      ctx.fill();
    }
  }

  #drawWater(ctx, s) {
    const grad = ctx.createRadialGradient(s / 2, s / 2, 10, s / 2, s / 2, s * 0.7);
    grad.addColorStop(0, '#b5f3ff'); grad.addColorStop(0.6, '#6fd3ef'); grad.addColorStop(1, '#58b7dc');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)'; ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 10 + Math.random() * 28, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  #drawStainedCrystal(ctx, s) {
    const grad = ctx.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#ffd4ec'); grad.addColorStop(0.5, '#d5ecff'); grad.addColorStop(1, '#ffe4b8');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#d9a48c'; ctx.lineWidth = 5;
    for (let i = -s; i < s * 2; i += 42) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + s, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + s, 0); ctx.lineTo(i, s); ctx.stroke();
    }
    ctx.strokeRect(4, 4, s - 8, s - 8);
  }

  #drawDanceFloor(ctx, s) {
    ctx.fillStyle = '#3b1c47'; ctx.fillRect(0, 0, s, s);
    const cell = s / 4;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#f8a5cf' : '#c6a2ff';
        ctx.fillRect(c * cell + 3, r * cell + 3, cell - 6, cell - 6);
        ctx.strokeStyle = '#ffe5ad'; ctx.lineWidth = 2;
        ctx.strokeRect(c * cell + 3, r * cell + 3, cell - 6, cell - 6);
      }
    }
  }

  #drawCarpet(ctx, s) {
    ctx.fillStyle = '#b63173'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#e7bd74'; ctx.fillRect(10, 0, 12, s); ctx.fillRect(s - 22, 0, 12, s);
    ctx.strokeStyle = 'rgba(255, 224, 165, 0.35)'; ctx.lineWidth = 2;
    for (let y = 16; y < s; y += 32) {
      ctx.beginPath(); ctx.arc(s / 2, y, 14, 0, Math.PI * 2); ctx.stroke();
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
