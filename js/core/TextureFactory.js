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

  createFaceTexture(avatar) {
    return this.getFaceTexture(avatar);
  }

  getFaceTexture(avatar) {
    const key = `face_${avatar.id}`;
    if (this.#cache.has(key)) return this.#cache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    this.#drawDollFace(canvas.getContext('2d'), 1024, avatar);

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

    // Piel base con frente luminosa y contorno cálido en sienes y mandíbula
    ctx.fillStyle = av.skinHex;
    ctx.fillRect(0, 0, s, s);
    const contour = ctx.createRadialGradient(cx, 536, 95, cx, 540, 325);
    contour.addColorStop(0, 'rgba(255,252,248,0.10)');
    contour.addColorStop(0.58, 'rgba(255,255,255,0)');
    contour.addColorStop(0.86, 'rgba(112,56,44,0.11)');
    contour.addColorStop(1, 'rgba(92,44,36,0.16)');
    ctx.fillStyle = contour;
    ctx.fillRect(0, 0, s, s);
    this.#fillRadial(ctx, cx, 398, 18, 155, [[0, 'rgba(255,252,246,0.14)'], [1, 'rgba(255,252,246,0)']]);
    this.#fillRadial(ctx, cx, 694, 6, 48, [[0, 'rgba(255,250,245,0.11)'], [1, 'rgba(255,250,245,0)']]);

    // Compensación de estiramiento horizontal ecuatorial en SphereGeometry
    ctx.save();
    ctx.translate(512, 0);
    ctx.scale(0.78, 1);
    ctx.translate(-512, 0);

    // Rubor difuminado en mejillas (y = 592, cx ± 118)
    const blushA = isMale ? 0.10 : 0.34;
    for (const dir of [-1, 1]) {
      this.#fillRadial(ctx, cx + dir * 118, 592, 6, 62, [
        [0, this.#hexToRgba(av.blushHex, blushA)],
        [0.55, this.#hexToRgba(av.blushHex, blushA * 0.42)],
        [1, this.#hexToRgba(av.blushHex, 0)]
      ], 66, 52, dir * -0.12);
    }

    // Ojos almendrados (y = 528, cx ± 76), cejas (y = 468), nariz (540..586) y labios (642)
    for (const dir of [-1, 1]) {
      this.#drawEye(ctx, cx + dir * 76, 528, dir, av, isMale);
      this.#drawEyebrow(ctx, cx + dir * 76, 468, dir, av, isMale);
    }
    this.#drawNose(ctx, cx, 540, 586, isMale);
    this.#drawLips(ctx, cx, 642, av, isMale);
    ctx.restore();
  }

  #drawEye(ctx, ex, ey, dir, av, isMale) {
    const rx = isMale ? 32 : 38, ry = isMale ? 19 : 26;
    const innerX = ex - dir * rx, outerX = ex + dir * rx, outerY = ey - (isMale ? 0 : 2);

    if (!isMale) {
      this.#fillRadial(ctx, ex + dir * 4, ey - 10, 8, rx * 1.48, [
        [0, this.#hexToRgba(av.shadowHex, 0.48)], [0.55, this.#hexToRgba(av.shadowHex, 0.2)], [1, this.#hexToRgba(av.shadowHex, 0)]
      ], rx * 1.46, ry * 1.38, dir * -0.08);
    }

    // Esclerótica limpia (#f5f6fa) con recorte almendrado
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(innerX, ey + 3);
    ctx.bezierCurveTo(ex - dir * rx * 0.42, ey - ry * 1.44, ex + dir * rx * 0.48, ey - ry * 1.38, outerX, outerY);
    ctx.bezierCurveTo(ex + dir * rx * 0.45, ey + ry * 1.06, ex - dir * rx * 0.45, ey + ry * 1.12, innerX, ey + 3);
    ctx.closePath();
    ctx.fillStyle = '#f5f6fa'; ctx.fill(); ctx.clip();

    this.#fillRadial(ctx, innerX + dir * 2, ey + 3, 1, 11, [[0, 'rgba(224,138,136,0.34)'], [1, 'rgba(224,138,136,0)']]);

    // Iris de 3 tonos, brillo cálido inferior, anillo limbal y pupila
    const irisR = isMale ? 16.5 : 22, iy = ey + 1.5;
    const irisGrad = ctx.createLinearGradient(ex, iy - irisR, ex, iy + irisR);
    irisGrad.addColorStop(0, av.eyeTop); irisGrad.addColorStop(0.52, av.eyeMid); irisGrad.addColorStop(1, av.eyeBot);
    ctx.fillStyle = irisGrad;
    ctx.beginPath(); ctx.arc(ex, iy, irisR, 0, Math.PI * 2); ctx.fill();

    this.#fillRadial(ctx, ex, iy + irisR * 0.46, 2, irisR * 0.72, [
      [0, 'rgba(255,248,224,0.56)'], [0.55, this.#hexToRgba(av.eyeBot, 0.34)], [1, 'rgba(255,255,255,0)']
    ], irisR - 2, irisR - 2);

    ctx.beginPath(); ctx.arc(ex, iy, irisR - 1, 0, Math.PI * 2);
    ctx.strokeStyle = av.eyeTop; ctx.lineWidth = isMale ? 3.2 : 4.2; ctx.stroke();
    ctx.strokeStyle = 'rgba(18,10,28,0.46)'; ctx.lineWidth = isMale ? 2.0 : 2.6; ctx.stroke();

    ctx.fillStyle = '#120b18';
    ctx.beginPath(); ctx.arc(ex, iy, irisR * 0.44, 0, Math.PI * 2); ctx.fill();

    const lidShadow = ctx.createLinearGradient(ex, ey - ry * 1.15, ex, ey + 2);
    lidShadow.addColorStop(0, 'rgba(34,18,36,0.36)'); lidShadow.addColorStop(0.55, 'rgba(34,18,36,0.10)'); lidShadow.addColorStop(1, 'rgba(34,18,36,0)');
    ctx.fillStyle = lidShadow; ctx.fillRect(ex - rx, ey - ry * 1.2, rx * 2, ry * 1.3);

    // Dos reflejos blancos (catchlights)
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.beginPath(); ctx.ellipse(ex - irisR * 0.34, iy - irisR * 0.32, isMale ? 4.4 : 6.0, isMale ? 3.5 : 4.8, -0.35, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(ex + irisR * 0.35, iy + irisR * 0.33, isMale ? 2.1 : 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Delineado superior, pestañas exteriores (femenino) y pliegue sutil
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(46,26,38,0.24)'; ctx.lineWidth = isMale ? 1.6 : 2.0;
    ctx.beginPath(); ctx.moveTo(ex - dir * rx * 0.1, ey + ry * 0.8); ctx.quadraticCurveTo(ex + dir * rx * 0.56, ey + ry * 0.72, outerX, outerY + 1); ctx.stroke();

    ctx.strokeStyle = '#1c111e'; ctx.lineWidth = isMale ? 4.0 : 6.2;
    ctx.beginPath(); ctx.moveTo(innerX + dir * 2, ey + 2.5);
    ctx.bezierCurveTo(ex - dir * rx * 0.42, ey - ry * 1.46, ex + dir * rx * 0.5, ey - ry * 1.4, outerX + (isMale ? 0 : dir * 5), outerY - (isMale ? 0 : 2.5));
    ctx.stroke();

    if (!isMale) {
      for (let i = 0; i < 4; i++) {
        const t = i / 3, sx = outerX - dir * (i * 5.8), sy = outerY - 1.5 - i * 3.8;
        ctx.lineWidth = 2.8 - i * 0.35;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + dir * (9 - t * 2), sy - 5, sx + dir * (16 - t * 4), sy - (12 - t * 2)); ctx.stroke();
      }
    }
    ctx.strokeStyle = isMale ? 'rgba(88,50,42,0.22)' : 'rgba(104,56,54,0.34)'; ctx.lineWidth = isMale ? 2.0 : 2.2;
    ctx.beginPath(); ctx.moveTo(ex - dir * rx * 0.74, ey - ry * 1.12);
    ctx.quadraticCurveTo(ex + (isMale ? 0 : dir * 4), ey - ry * (isMale ? 1.52 : 1.72), ex + dir * rx * (isMale ? 0.8 : 0.92), ey - ry * 1.04); ctx.stroke();
  }

  #drawEyebrow(ctx, bx, by, dir, av, isMale) {
    const x0 = bx - dir * 32, y0 = by + (isMale ? 4 : 5);
    const x1 = bx + dir * 12, y1 = by - (isMale ? 2 : 7);
    const x2 = bx + dir * 44, y2 = by + (isMale ? 3 : 4);
    const tIn = isMale ? 6.0 : 4.1, tMid = isMale ? 5.4 : 3.5;

    ctx.fillStyle = this.#hexToRgba(av.browHex, isMale ? 0.9 : 0.86);
    ctx.beginPath();
    ctx.moveTo(x0, y0 - tIn); ctx.quadraticCurveTo(x1, y1 - tMid, x2, y2);
    ctx.quadraticCurveTo(x1, y1 + tMid, x0, y0 + tIn); ctx.quadraticCurveTo(x0 - dir * 4, y0, x0, y0 - tIn);
    ctx.closePath(); ctx.fill();
  }

  #drawNose(ctx, cx, yTop, yBot, isMale) {
    for (const dir of [-1, 1]) {
      const side = ctx.createLinearGradient(cx + dir * 5, yTop, cx + dir * 12, yBot - 6);
      side.addColorStop(0, 'rgba(110,56,46,0.12)'); side.addColorStop(0.7, 'rgba(110,56,46,0.14)'); side.addColorStop(1, 'rgba(110,56,46,0)');
      ctx.fillStyle = side;
      ctx.beginPath(); ctx.ellipse(cx + dir * (isMale ? 9.5 : 8), (yTop + yBot) * 0.5, 4.2, 18, dir * 0.08, 0, Math.PI * 2); ctx.fill();
    }
    const bridge = ctx.createLinearGradient(cx, yTop, cx, yBot - 8);
    bridge.addColorStop(0, 'rgba(255,250,245,0.06)'); bridge.addColorStop(0.55, 'rgba(255,252,248,0.22)'); bridge.addColorStop(1, 'rgba(255,250,245,0.04)');
    ctx.fillStyle = bridge; ctx.beginPath(); ctx.ellipse(cx, yTop + 20, 4.5, 19, 0, 0, Math.PI * 2); ctx.fill();

    this.#fillRadial(ctx, cx, yBot - 11, 1, 9, [[0, 'rgba(255,252,248,0.26)'], [1, 'rgba(255,252,248,0)']]);
    this.#fillRadial(ctx, cx, yBot - 3, 2, isMale ? 15 : 12, [[0, 'rgba(104,50,42,0.22)'], [1, 'rgba(104,50,42,0)']], isMale ? 15 : 12, 6);
    ctx.fillStyle = 'rgba(92,42,36,0.20)';
    for (const dir of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(cx + dir * (isMale ? 9 : 7.5), yBot - 2, 3.2, 1.7, dir * -0.25, 0, Math.PI * 2); ctx.fill();
    }
  }

  #drawLips(ctx, cx, ly, av, isMale) {
    const w = isMale ? 33 : 40, hUp = isMale ? 9 : 14, hLow = isMale ? 12 : 19;
    this.#fillRadial(ctx, cx, ly + hLow + 5, 2, 22, [[0, 'rgba(100,46,42,0.16)'], [1, 'rgba(100,46,42,0)']], 22, 8);

    // Labio superior con arco de Cupido
    ctx.fillStyle = av.lipHex;
    ctx.beginPath(); ctx.moveTo(cx - w, ly - 1);
    ctx.bezierCurveTo(cx - w * 0.58, ly - hUp * 0.55, cx - w * 0.42, ly - hUp * 1.15, cx - w * 0.22, ly - hUp * 0.95);
    ctx.quadraticCurveTo(cx, ly - hUp * 0.42, cx + w * 0.22, ly - hUp * 0.95);
    ctx.bezierCurveTo(cx + w * 0.42, ly - hUp * 1.15, cx + w * 0.58, ly - hUp * 0.55, cx + w, ly - 1);
    ctx.quadraticCurveTo(cx, ly + 4, cx - w, ly - 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(72,18,36,0.12)'; ctx.fill();

    // Labio inferior y línea de sonrisa
    ctx.fillStyle = av.lipHex;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.92, ly);
    ctx.bezierCurveTo(cx - w * 0.48, ly + hLow * 1.26, cx + w * 0.48, ly + hLow * 1.26, cx + w * 0.92, ly);
    ctx.quadraticCurveTo(cx, ly + 4, cx - w * 0.92, ly); ctx.closePath(); ctx.fill();

    ctx.strokeStyle = 'rgba(88,24,42,0.46)'; ctx.lineCap = 'round'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.98, ly - 1.2); ctx.quadraticCurveTo(cx, ly + 4.4, cx + w * 0.98, ly - 1.2); ctx.stroke();

    // Brillo gloss satinado (femenino) o luz natural suave (masculino)
    if (!isMale) {
      ctx.fillStyle = 'rgba(255,244,250,0.62)';
      ctx.beginPath(); ctx.ellipse(cx - 4, ly + hLow * 0.52, 13, 4.2, -0.06, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,248,252,0.46)';
      ctx.beginPath(); ctx.ellipse(cx + 12, ly + hLow * 0.46, 3.8, 2.1, 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,246,252,0.32)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx - w * 0.28, ly - hUp * 0.92); ctx.quadraticCurveTo(cx, ly - hUp * 0.38, cx + w * 0.28, ly - hUp * 0.92); ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,242,238,0.14)';
      ctx.beginPath(); ctx.ellipse(cx, ly + hLow * 0.5, 11, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  #fillRadial(ctx, x, y, r0, r1, stops, rx = r1, ry = r1, rot = 0) {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (const [stop, color] of stops) g.addColorStop(stop, color);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill();
  }

  #hexToRgba(hex, alpha) {
    const c = hex.replace('#', '');
    return `rgba(${parseInt(c.slice(0, 2), 16)}, ${parseInt(c.slice(2, 4), 16)}, ${parseInt(c.slice(4, 6), 16)}, ${alpha})`;
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
