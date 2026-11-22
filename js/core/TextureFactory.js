import * as THREE from 'three';

export class TextureFactory {
  #cache = new Map();

  init() {}

  getTexture(key, repeatX = 1, repeatY = 1) {
    const cacheKey = `${key}_${repeatX}_${repeatY}`;
    if (this.#cache.has(cacheKey)) return this.#cache.get(cacheKey);
    const baseKey = `${key}_base`;
    let baseCanvas = this.#cache.get(baseKey);
    if (!baseCanvas) { baseCanvas = this.#buildCanvas(key); this.#cache.set(baseKey, baseCanvas); }
    const tex = new THREE.CanvasTexture(baseCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    this.#cache.set(cacheKey, tex);
    return tex;
  }

  createFaceTexture(avatar) { return this.getFaceTexture(avatar); }

  getFaceTexture(avatar) {
    const key = `face_${avatar.id}`;
    if (this.#cache.has(key)) return this.#cache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    this.#drawDollFace(canvas.getContext('2d'), 1024, avatar);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    this.#cache.set(key, tex);
    return tex;
  }

  getHairTexture(avatar) {
    const key = `hair_${avatar.id}`;
    if (this.#cache.has(key)) return this.#cache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = avatar.hairHex || '#f3d082';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = i % 5 === 0 ? 'rgba(255,248,214,0.34)' : i % 3 === 0 ? 'rgba(130,82,34,0.16)' : 'rgba(255,232,178,0.18)';
      ctx.fillRect((i / 160) * 256, 0, 1.2 + (i % 3) * 0.9, 256);
    }
    const sheen = ctx.createLinearGradient(0, 0, 0, 256);
    sheen.addColorStop(0, 'rgba(90,54,24,0.14)'); sheen.addColorStop(0.32, 'rgba(255,250,232,0.22)');
    sheen.addColorStop(0.55, 'rgba(255,255,255,0)'); sheen.addColorStop(0.76, 'rgba(255,244,210,0.16)');
    sheen.addColorStop(1, 'rgba(80,46,20,0.12)');
    ctx.fillStyle = sheen; ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4; tex.needsUpdate = true;
    this.#cache.set(key, tex);
    return tex;
  }

  #drawDollFace(ctx, s, av) {
    const isMale = av.gender === 'male', cx = s * 0.5;
    ctx.fillStyle = av.skinHex; ctx.fillRect(0, 0, s, s);
    const contour = ctx.createRadialGradient(cx, 532, 95, cx, 538, 330);
    contour.addColorStop(0, 'rgba(255,252,248,0.11)'); contour.addColorStop(0.58, 'rgba(255,255,255,0)');
    contour.addColorStop(0.86, 'rgba(122,62,48,0.10)'); contour.addColorStop(1, 'rgba(98,48,38,0.15)');
    ctx.fillStyle = contour; ctx.fillRect(0, 0, s, s);
    this.#fillRadial(ctx, cx, 396, 18, 155, [[0, 'rgba(255,252,246,0.14)'], [1, 'rgba(255,252,246,0)']]);
    this.#fillRadial(ctx, cx, 696, 6, 48, [[0, 'rgba(255,250,245,0.12)'], [1, 'rgba(255,250,245,0)']]);

    // Compensación horizontal UV esférica (evita ojos y boca estirados)
    ctx.save(); ctx.translate(512, 0); ctx.scale(0.76, 1); ctx.translate(-512, 0);
    const blushA = isMale ? 0.09 : 0.36;
    for (const dir of [-1, 1]) {
      this.#fillRadial(ctx, cx + dir * 116, 588, 6, 64, [
        [0, this.#rgba(av.blushHex, blushA)], [0.52, this.#rgba(av.blushHex, blushA * 0.44)], [1, this.#rgba(av.blushHex, 0)]
      ], 68, 52, dir * -0.14);
      this.#drawEye(ctx, cx + dir * 76, 526, dir, av, isMale);
      this.#drawEyebrow(ctx, cx + dir * 76, 466, dir, av, isMale);
    }
    this.#drawNose(ctx, cx, 540, 586, isMale);
    this.#drawLips(ctx, cx, 642, av, isMale);
    ctx.restore();
  }

  #drawEye(ctx, ex, ey, dir, av, isMale) {
    const rx = isMale ? 32 : 41, ry = isMale ? 19 : 28;
    const innerX = ex - dir * rx, outerX = ex + dir * rx, outerY = ey - (isMale ? 0 : 2.5);
    if (!isMale) {
      this.#fillRadial(ctx, ex + dir * 6, ey - 17, 6, rx * 1.48, [
        [0, this.#rgba(av.shadowHex, 0.50)], [0.58, this.#rgba(av.shadowHex, 0.22)], [1, this.#rgba(av.shadowHex, 0)]
      ], rx * 1.48, ry * 1.24, dir * -0.1);
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(innerX, ey + 5);
    ctx.bezierCurveTo(ex - dir * rx * 0.48, ey - ry * 1.38, ex + dir * rx * 0.56, ey - ry * 1.32, outerX, outerY);
    ctx.bezierCurveTo(ex + dir * rx * 0.46, ey + ry * 0.96, ex - dir * rx * 0.46, ey + ry * 0.96, innerX, ey + 5);
    ctx.closePath();
    ctx.fillStyle = '#f5f7fb'; ctx.fill(); ctx.clip();
    this.#fillRadial(ctx, innerX + dir * 4, ey + 4, 1, 12, [[0, 'rgba(232,144,148,0.52)'], [1, 'rgba(232,144,148,0)']]);

    // Iris radial luminoso (azul zafiro / esmeralda / violeta / miel)
    const irisR = isMale ? 16.5 : 24.5, ix = ex - dir * 1.5, iy = ey + 1.5;
    const rad = ctx.createRadialGradient(ix, iy + 5, irisR * 0.22, ix, iy, irisR);
    rad.addColorStop(0, av.eyeBot); rad.addColorStop(0.54, av.eyeMid); rad.addColorStop(0.86, av.eyeTop); rad.addColorStop(1, '#101830');
    ctx.fillStyle = rad; ctx.beginPath(); ctx.arc(ix, iy, irisR, 0, Math.PI * 2); ctx.fill();
    this.#fillRadial(ctx, ix, iy + irisR * 0.45, 2, irisR * 0.62, [
      [0, 'rgba(230,248,255,0.68)'], [0.6, this.#rgba(av.eyeBot, 0.35)], [1, 'rgba(255,255,255,0)']
    ], irisR * 0.68, irisR * 0.42);
    ctx.strokeStyle = this.#rgba(av.eyeTop, 0.85); ctx.lineWidth = 3.2; ctx.beginPath(); ctx.arc(ix, iy, irisR - 1, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#100a16'; ctx.beginPath(); ctx.arc(ix, iy, irisR * 0.43, 0, Math.PI * 2); ctx.fill();

    const lidSh = ctx.createLinearGradient(ex, ey - ry, ex, ey + 2);
    lidSh.addColorStop(0, 'rgba(26,14,32,0.38)'); lidSh.addColorStop(1, 'rgba(26,14,32,0)');
    ctx.fillStyle = lidSh; ctx.fillRect(ex - rx, ey - ry, rx * 2, ry + 2);

    // Tres catchlights blancos de brillo princesa
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.beginPath(); ctx.ellipse(ix - 8.5, iy - 8.2, 6.8, 5.4, -0.35, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath(); ctx.arc(ix + 7.8, iy + 8.0, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ix + 8.6, iy - 6.8, 2.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Delineado superior, línea inferior y pestañas superiores/inferiores
    ctx.lineCap = 'round'; ctx.strokeStyle = isMale ? '#281a20' : '#1b0f1b'; ctx.lineWidth = isMale ? 4.0 : 6.6;
    ctx.beginPath(); ctx.moveTo(innerX, ey + 5);
    ctx.bezierCurveTo(ex - dir * rx * 0.48, ey - ry * 1.38, ex + dir * rx * 0.56, ey - ry * 1.32, outerX + dir * (isMale ? 1 : 5), outerY - (isMale ? 0 : 2.5));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(72,42,56,0.34)'; ctx.lineWidth = 2.0;
    ctx.beginPath(); ctx.moveTo(innerX + dir * 10, ey + ry * 0.44); ctx.quadraticCurveTo(ex, ey + ry * 0.88, outerX - dir * 5, outerY + 4); ctx.stroke();

    if (!isMale) {
      ctx.strokeStyle = '#1b0f1b';
      for (let i = 0; i < 5; i++) {
        const t = i / 4, bx = outerX - dir * (t * 24), by = outerY - Math.sin(t * Math.PI * 0.72) * 14, len = 16 - i * 2.2;
        ctx.lineWidth = 3.0 - i * 0.35; ctx.beginPath(); ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + dir * len * 0.55, by - len * 0.5, bx + dir * len, by - len * 0.92); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(42,24,38,0.48)'; ctx.lineWidth = 1.6;
      for (let i = 0; i < 4; i++) {
        const lx = ex + dir * (6 + i * 7.5), ly = ey + ry * 0.66 - i * 2.4;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + dir * 3.5, ly + 6.5); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(116,68,66,0.42)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(innerX + dir * 7, ey - ry * 0.65); ctx.quadraticCurveTo(ex + dir * 3, ey - ry * 1.72, outerX + dir * 3, outerY - 12); ctx.stroke();
    }
  }

  #drawEyebrow(ctx, ex, by, dir, av, isMale) {
    const x0 = ex - dir * (isMale ? 34 : 38), xArch = ex + dir * (isMale ? 8 : 11), x1 = ex + dir * (isMale ? 40 : 44);
    const yArch = by - (isMale ? 5 : 13);
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = this.#rgba(av.browHex, 0.76); ctx.lineWidth = isMale ? 8.5 : 5.6;
    ctx.beginPath(); ctx.moveTo(x0, by + 5); ctx.quadraticCurveTo(xArch, yArch, x1, by + 4); ctx.stroke();
    ctx.strokeStyle = this.#rgba(av.browHex, 0.45); ctx.lineWidth = 1.8;
    for (let i = 0; i < 12; i++) {
      const t = i / 11, u = 1 - t;
      const px = u * u * x0 + 2 * u * t * xArch + t * t * x1;
      const py = u * u * (by + 5) + 2 * u * t * yArch + t * t * (by + 4);
      ctx.beginPath(); ctx.moveTo(px - dir * 3, py + 2.5); ctx.lineTo(px + dir * 4, py - 3.2); ctx.stroke();
    }
    ctx.restore();
  }

  #drawNose(ctx, cx, topY, tipY, isMale) {
    const a = isMale ? 0.14 : 0.10;
    for (const dir of [-1, 1]) this.#fillRadial(ctx, cx + dir * 13, (topY + tipY) * 0.5, 2, 19, [[0, `rgba(128,74,62,${a})`], [1, 'rgba(128,74,62,0)']], 10, 26);
    this.#fillRadial(ctx, cx, tipY - 8, 2, 13, [[0, 'rgba(255,252,248,0.22)'], [1, 'rgba(255,252,248,0)']]);
    this.#fillRadial(ctx, cx, tipY + 6, 2, 16, [[0, 'rgba(122,68,58,0.18)'], [1, 'rgba(122,68,58,0)']], 18, 7);
    ctx.fillStyle = 'rgba(110,58,50,0.22)';
    for (const dir of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + dir * 10, tipY + 3, 4.2, 2.2, dir * -0.25, 0, Math.PI * 2); ctx.fill(); }
  }

  #drawLips(ctx, cx, ly, av, isMale) {
    const w = isMale ? 34 : 40, hUp = isMale ? 9 : 14, hLo = isMale ? 10 : 18;
    const g = ctx.createLinearGradient(cx, ly - hUp, cx, ly + hLo);
    g.addColorStop(0, this.#rgba(av.lipHex, isMale ? 0.72 : 0.94)); g.addColorStop(0.55, av.lipHex); g.addColorStop(1, this.#rgba(av.lipHex, isMale ? 0.65 : 0.92));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(cx - w, ly - 1.5);
    ctx.bezierCurveTo(cx - w * 0.56, ly - hUp * 1.15, cx - w * 0.16, ly - hUp * 1.18, cx, ly - hUp * 0.52);
    ctx.bezierCurveTo(cx + w * 0.16, ly - hUp * 1.18, cx + w * 0.56, ly - hUp * 1.15, cx + w, ly - 1.5);
    ctx.quadraticCurveTo(cx, ly + 4.5, cx - w, ly - 1.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - w * 0.92, ly);
    ctx.bezierCurveTo(cx - w * 0.48, ly + hLo * 1.32, cx + w * 0.48, ly + hLo * 1.32, cx + w * 0.92, ly);
    ctx.quadraticCurveTo(cx, ly + 4.2, cx - w * 0.92, ly); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(104,34,54,0.44)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - w * 0.96, ly - 2.2); ctx.quadraticCurveTo(cx, ly + 4.8, cx + w * 0.96, ly - 2.2); ctx.stroke();
    if (!isMale) this.#fillRadial(ctx, cx - 5, ly + hLo * 0.5, 2, 16, [[0, 'rgba(255,244,250,0.72)'], [0.65, 'rgba(255,232,244,0.28)'], [1, 'rgba(255,240,248,0)']], 16, 6.2, -0.06);
    this.#fillRadial(ctx, cx, ly + hLo + 9, 2, 24, [[0, 'rgba(120,66,58,0.16)'], [1, 'rgba(120,66,58,0)']], 24, 6.5);
  }

  #fillRadial(ctx, x, y, r0, r1, stops, rx = r1, ry = r1, rot = 0) {
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (rx !== ry) ctx.scale(rx / r1, ry / r1);
    const g = ctx.createRadialGradient(0, 0, r0, 0, 0, r1);
    for (const [o, c] of stops) g.addColorStop(Number(o), c);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  #rgba(hex, a) {
    const c = hex.replace('#', '');
    return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`;
  }

  #buildCanvas(key) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const fn = {
      marble: () => this.#drawMarble(ctx, 256), marbleFloor: () => this.#drawMarbleFloor(ctx, 256),
      roseGold: () => this.#drawRoseGold(ctx, 256), grass: () => this.#drawGrass(ctx, 256),
      hedge: () => this.#drawHedge(ctx, 256), water: () => this.#drawWater(ctx, 256),
      stainedCrystal: () => this.#drawStainedCrystal(ctx, 256), danceFloor: () => this.#drawDanceFloor(ctx, 256),
      carpet: () => this.#drawCarpet(ctx, 256)
    }[key];
    if (fn) fn(); else { ctx.fillStyle = '#fff5fa'; ctx.fillRect(0, 0, 256, 256); }
    return canvas;
  }

  #drawMarble(ctx, s) {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#f7f1f4'); g.addColorStop(0.5, '#ede2e8'); g.addColorStop(1, '#f5edf1');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 14; i++) {
      ctx.beginPath(); let x = Math.random() * s, y = 0; ctx.moveTo(x, y);
      while (y < s) { x += (Math.random() - 0.45) * 24; y += 16; ctx.lineTo(x, y); }
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(210,158,158,0.24)' : 'rgba(175,155,172,0.2)';
      ctx.lineWidth = 0.8 + Math.random() * 2.2; ctx.stroke();
    }
  }

  #drawMarbleFloor(ctx, s) {
    this.#drawMarble(ctx, s);
    ctx.strokeStyle = 'rgba(204,154,112,0.55)'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, s - 4, s - 4);
    ctx.beginPath(); ctx.moveTo(s / 2, 14); ctx.lineTo(s - 14, s / 2); ctx.lineTo(s / 2, s - 14); ctx.lineTo(14, s / 2); ctx.closePath();
    ctx.fillStyle = 'rgba(248,218,232,0.34)'; ctx.fill(); ctx.strokeStyle = 'rgba(212,162,114,0.65)'; ctx.lineWidth = 2; ctx.stroke();
  }

  #drawRoseGold(ctx, s) {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#f3c6bd'); g.addColorStop(0.5, '#df9e9a'); g.addColorStop(1, '#f0c8b0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; for (let y = 0; y < s; y += 3) ctx.fillRect(0, y, s, 1);
  }

  #drawGrass(ctx, s) {
    ctx.fillStyle = '#5da46d'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 650; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(130,198,128,0.25)' : 'rgba(56,115,68,0.22)';
      ctx.fillRect(Math.random() * s, Math.random() * s, 4, 9);
    }
  }

  #drawHedge(ctx, s) {
    ctx.fillStyle = '#2f6d46'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 480; i++) {
      ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, 3 + Math.random() * 6, 0, Math.PI * 2);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(84,158,98,0.38)' : i % 5 === 0 ? 'rgba(255,168,208,0.22)' : 'rgba(26,72,42,0.35)';
      ctx.fill();
    }
  }

  #drawWater(ctx, s) {
    const g = ctx.createRadialGradient(s / 2, s / 2, 10, s / 2, s / 2, s * 0.7);
    g.addColorStop(0, '#a6eaf8'); g.addColorStop(0.6, '#65cbe6'); g.addColorStop(1, '#50aed4');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) { ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, 10 + Math.random() * 28, 0, Math.PI * 2); ctx.stroke(); }
  }

  #drawStainedCrystal(ctx, s) {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#ffd4ec'); g.addColorStop(0.5, '#d5ecff'); g.addColorStop(1, '#ffe4b8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s); ctx.strokeStyle = '#d9a48c'; ctx.lineWidth = 5;
    for (let i = -s; i < s * 2; i += 42) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + s, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + s, 0); ctx.lineTo(i, s); ctx.stroke();
    }
    ctx.strokeRect(4, 4, s - 8, s - 8);
  }

  #drawDanceFloor(ctx, s) {
    ctx.fillStyle = '#3b1c47'; ctx.fillRect(0, 0, s, s); const cell = s / 4;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#f8a5cf' : '#c6a2ff'; ctx.fillRect(c * cell + 3, r * cell + 3, cell - 6, cell - 6);
      ctx.strokeStyle = '#ffe5ad'; ctx.lineWidth = 2; ctx.strokeRect(c * cell + 3, r * cell + 3, cell - 6, cell - 6);
    }
  }

  #drawCarpet(ctx, s) {
    ctx.fillStyle = '#b63173'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#e7bd74'; ctx.fillRect(10, 0, 12, s); ctx.fillRect(s - 22, 0, 12, s);
    ctx.strokeStyle = 'rgba(255,224,165,0.35)'; ctx.lineWidth = 2;
    for (let y = 16; y < s; y += 32) { ctx.beginPath(); ctx.arc(s / 2, y, 14, 0, Math.PI * 2); ctx.stroke(); }
  }

  update() {}

  dispose() {
    for (const val of this.#cache.values()) { if (val && typeof val.dispose === 'function') val.dispose(); }
    this.#cache.clear();
  }
}
