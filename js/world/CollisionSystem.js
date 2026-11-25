const CELL_SIZE = 12;

export class CollisionSystem {
  #boxes = [];
  #surfaces = [];
  #boxGrid = new Map();
  #surfaceGrid = new Map();
  #queryStamp = 0;
  #worldBounds = { minX: -88, maxX: 222, minZ: -84, maxZ: 64 };

  init() {
    this.clear();
  }

  clear() {
    this.#boxes.length = 0;
    this.#surfaces.length = 0;
    this.#boxGrid.clear();
    this.#surfaceGrid.clear();
    this.#queryStamp = 0;
  }

  #cellKey(gx, gz) {
    return (gx + 2048) * 4096 + (gz + 2048);
  }

  #insertIntoGrid(grid, item, minX, maxX, minZ, maxZ) {
    const gx0 = Math.floor(minX / CELL_SIZE);
    const gx1 = Math.floor(maxX / CELL_SIZE);
    const gz0 = Math.floor(minZ / CELL_SIZE);
    const gz1 = Math.floor(maxZ / CELL_SIZE);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const key = this.#cellKey(gx, gz);
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = [];
          grid.set(key, bucket);
        }
        bucket.push(item);
      }
    }
  }

  setWorldBounds(minX, maxX, minZ, maxZ) {
    this.#worldBounds = { minX, maxX, minZ, maxZ };
  }

  addBox(minX, maxX, minY, maxY, minZ, maxZ) {
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const boundR = Math.hypot((maxX - minX) * 0.5, (maxZ - minZ) * 0.5);
    const box = { minX, maxX, minY, maxY, minZ, maxZ, cx, cz, boundR, stamp: 0 };
    this.#boxes.push(box);
    this.#insertIntoGrid(this.#boxGrid, box, minX, maxX, minZ, maxZ);
  }

  addCylinderCollider(cx, cz, radius, minY = 0, maxY = 4) {
    const box = {
      isCylinder: true,
      cx,
      cz,
      radius,
      boundR: radius,
      minY,
      maxY,
      stamp: 0
    };
    this.#boxes.push(box);
    this.#insertIntoGrid(this.#boxGrid, box, cx - radius, cx + radius, cz - radius, cz + radius);
  }

  addFlatSurface(minX, maxX, minZ, maxZ, y) {
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const boundR = Math.hypot((maxX - minX) * 0.5, (maxZ - minZ) * 0.5);
    const surface = {
      minX,
      maxX,
      minZ,
      maxZ,
      cx,
      cz,
      boundR,
      stamp: 0,
      getHeight: () => y
    };
    this.#surfaces.push(surface);
    this.#insertIntoGrid(this.#surfaceGrid, surface, minX, maxX, minZ, maxZ);
  }

  addDiscSurface(cx, cz, radius, y) {
    const rSq = radius * radius;
    const minX = cx - radius;
    const maxX = cx + radius;
    const minZ = cz - radius;
    const maxZ = cz + radius;
    const surface = {
      minX,
      maxX,
      minZ,
      maxZ,
      cx,
      cz,
      boundR: radius,
      stamp: 0,
      contains: (x, z) => (x - cx) * (x - cx) + (z - cz) * (z - cz) <= rSq,
      getHeight: () => y
    };
    this.#surfaces.push(surface);
    this.#insertIntoGrid(this.#surfaceGrid, surface, minX, maxX, minZ, maxZ);
  }

  addRampSurface(minX, maxX, minZ, maxZ, axis, startCoord, endCoord, startY, endY) {
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const boundR = Math.hypot((maxX - minX) * 0.5, (maxZ - minZ) * 0.5);
    const surface = {
      minX,
      maxX,
      minZ,
      maxZ,
      cx,
      cz,
      boundR,
      stamp: 0,
      getHeight: (x, z) => {
        const v = axis === 'z' ? z : x;
        const t = Math.max(0, Math.min(1, (v - startCoord) / (endCoord - startCoord)));
        return startY + (endY - startY) * t;
      }
    };
    this.#surfaces.push(surface);
    this.#insertIntoGrid(this.#surfaceGrid, surface, minX, maxX, minZ, maxZ);
  }

  getGroundHeight(x, z, currentY = 0, maxStepUp = 1.15) {
    let bestY = 0;
    const gx = Math.floor(x / CELL_SIZE);
    const gz = Math.floor(z / CELL_SIZE);
    const bucket = this.#surfaceGrid.get(this.#cellKey(gx, gz));
    if (!bucket) return bestY;

    for (let i = 0; i < bucket.length; i++) {
      const s = bucket[i];
      const dx = x - s.cx;
      const dz = z - s.cz;
      const maxR = s.boundR + 1e-4;
      if (dx * dx + dz * dz > maxR * maxR) continue;
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ && (!s.contains || s.contains(x, z))) {
        const h = s.getHeight(x, z);
        if (h <= currentY + maxStepUp && h > bestY) {
          bestY = h;
        }
      }
    }
    return bestY;
  }

  resolveHorizontal(pos, radius = 0.42, height = 1.75) {
    let x = Math.max(this.#worldBounds.minX, Math.min(this.#worldBounds.maxX, pos.x));
    let z = Math.max(this.#worldBounds.minZ, Math.min(this.#worldBounds.maxZ, pos.z));
    const feetY = pos.y + 0.18;
    const headY = pos.y + height;

    for (let pass = 0; pass < 2; pass++) {
      const stamp = ++this.#queryStamp;
      const gx0 = Math.floor((x - radius) / CELL_SIZE);
      const gx1 = Math.floor((x + radius) / CELL_SIZE);
      const gz0 = Math.floor((z - radius) / CELL_SIZE);
      const gz1 = Math.floor((z + radius) / CELL_SIZE);

      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
          const bucket = this.#boxGrid.get(this.#cellKey(gx, gz));
          if (!bucket) continue;

          for (let i = 0; i < bucket.length; i++) {
            const b = bucket[i];
            if (b.stamp === stamp) continue;
            b.stamp = stamp;

            if (headY <= b.minY || feetY >= b.maxY) continue;

            const cdx = x - b.cx;
            const cdz = z - b.cz;
            const maxR = b.boundR + radius;
            if (cdx * cdx + cdz * cdz > maxR * maxR) continue;

            if (b.isCylinder) {
              const minDist = b.radius + radius;
              const distSq = cdx * cdx + cdz * cdz;
              if (distSq < minDist * minDist) {
                const dist = Math.sqrt(distSq) || 0.0001;
                x = b.cx + (cdx / dist) * minDist;
                z = b.cz + (cdz / dist) * minDist;
              }
              continue;
            }

            const closestX = Math.max(b.minX, Math.min(x, b.maxX));
            const closestZ = Math.max(b.minZ, Math.min(z, b.maxZ));
            const dx = x - closestX;
            const dz = z - closestZ;
            const distSq = dx * dx + dz * dz;

            if (distSq < radius * radius) {
              if (distSq > 1e-6) {
                const dist = Math.sqrt(distSq);
                const push = radius - dist;
                x += (dx / dist) * push;
                z += (dz / dist) * push;
              } else {
                // Centro dentro del AABB: empujar hacia la cara más cercana
                const dLeft = Math.abs(x - b.minX);
                const dRight = Math.abs(b.maxX - x);
                const dFront = Math.abs(z - b.minZ);
                const dBack = Math.abs(b.maxZ - z);
                const m = Math.min(dLeft, dRight, dFront, dBack);
                if (m === dLeft) x = b.minX - radius;
                else if (m === dRight) x = b.maxX + radius;
                else if (m === dFront) z = b.minZ - radius;
                else z = b.maxZ + radius;
              }
            }
          }
        }
      }
    }

    pos.x = x;
    pos.z = z;
  }

  /**
   * Comprueba si un punto 3D queda dentro de un muro o fuera de los límites del mundo
   * (usado por la cámara del Vestidor Real para evitar recortes con paredes).
   */
  isPointBlocked(x, y, z, margin = 0.3) {
    if (
      x < this.#worldBounds.minX + margin ||
      x > this.#worldBounds.maxX - margin ||
      z < this.#worldBounds.minZ + margin ||
      z > this.#worldBounds.maxZ - margin
    ) {
      return true;
    }

    const stamp = ++this.#queryStamp;
    const gx0 = Math.floor((x - margin) / CELL_SIZE);
    const gx1 = Math.floor((x + margin) / CELL_SIZE);
    const gz0 = Math.floor((z - margin) / CELL_SIZE);
    const gz1 = Math.floor((z + margin) / CELL_SIZE);

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const bucket = this.#boxGrid.get(this.#cellKey(gx, gz));
        if (!bucket) continue;

        for (let i = 0; i < bucket.length; i++) {
          const b = bucket[i];
          if (b.stamp === stamp) continue;
          b.stamp = stamp;

          if (y < b.minY - margin || y > b.maxY + margin) continue;

          const cdx = x - b.cx;
          const cdz = z - b.cz;
          const maxR = b.boundR + margin;
          if (cdx * cdx + cdz * cdz > maxR * maxR) continue;

          if (b.isCylinder) {
            const r = b.radius + margin;
            if (cdx * cdx + cdz * cdz < r * r) return true;
            continue;
          }
          if (
            x >= b.minX - margin &&
            x <= b.maxX + margin &&
            z >= b.minZ - margin &&
            z <= b.maxZ + margin
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  getZoneName(pos) {
    if (pos.z < -54 && pos.z >= -77 && Math.abs(pos.x) <= 20.5) {
      return 'Salón del Trono Real';
    }
    if (pos.z <= -16.5 && pos.z >= -54.5 && pos.y >= 6.4) {
      if (pos.z > -22.2) return 'Balcón Imperial';
      if (pos.x < -14.5) return 'Suite Real de la Princesa';
      if (pos.x > 14.5) return 'Biblioteca Real y Sala de Té';
      return 'Galería Imperial (2ª Planta)';
    }
    if (pos.z <= -21.5 && pos.z >= -54.5 && Math.abs(pos.x) <= 36.5) {
      if (pos.x < -14) return 'Atelier del Vestidor Real';
      if (pos.x > 14) return 'Salón de Baile y Banquetes';
      return 'Gran Vestíbulo Imperial';
    }
    if (pos.x < -27 && pos.z > -18 && pos.z < 28) return 'Gran Pasarela de Moda';
    if (pos.x > 13 && pos.x < 28 && pos.z > 8 && pos.z < 22) return 'Arena de Carrera Real';
    if (pos.x >= 14 && pos.x <= 26 && pos.z >= -14.5 && pos.z <= -6.5) return 'Establos Reales';
    if (pos.x > 36 && pos.z < -28 && pos.z > -44) return 'Terraza Real de Baile';
    if (pos.z > 36 && Math.abs(pos.x) < 12) return 'Mirador del Lago Imperial';
    if (Math.hypot(pos.x - 162, pos.z) <= 36.5) return 'Gran Cúpula del Casino Real';
    if (Math.hypot(pos.x - 208, pos.z + 22) <= 7.0 || Math.hypot(pos.x - 208, pos.z - 22) <= 7.0) {
      return 'Glorieta Mirador del Casino';
    }
    if (pos.x >= 92 && pos.x <= 103 && Math.abs(pos.z) <= 5.2) return 'Puente Imperial del Río';
    if (pos.x >= 99 && pos.x <= 110 && pos.z >= 24.5 && pos.z <= 29.5) return 'Puente de los Cisnes';
    if (pos.x >= 88.5 && pos.x <= 99.5 && pos.z >= -40.5 && pos.z <= -35.5) return 'Puente Norte de los Cerezos';
    if (pos.x >= 42 && pos.x <= 126.5 && Math.abs(pos.z) <= 10) return 'Bulevar Imperial del Casino';
    const dxSwan = (pos.x - 106) / 25.0;
    const dzSwan = (pos.z - 45) / 16.0;
    if (dxSwan * dxSwan + dzSwan * dzSwan <= 1.0) return 'Lago de los Cisnes';
    if (Math.hypot(pos.x - 162, pos.z) <= 68.0) return 'Jardines VIP del Casino';
    if (pos.z >= -78 && pos.z <= 38) {
      const rcx = 97.5 + Math.sin(pos.z * 0.07) * 7.5 * Math.min(1, (pos.z * pos.z) / 144);
      if (Math.abs(pos.x - rcx) <= 11.5) return 'Ribera del Río Cristalino';
    }
    if (Math.hypot(pos.x, pos.z) < 15) return 'Plaza de la Gran Fuente';
    return 'Jardines y Bosques Reales';
  }

  update() {}

  dispose() {
    this.clear();
  }
}
