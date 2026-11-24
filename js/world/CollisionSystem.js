export class CollisionSystem {
  #boxes = [];
  #surfaces = [];
  #worldBounds = { minX: -88, maxX: 88, minZ: -84, maxZ: 64 };

  init() {
    this.clear();
  }

  clear() {
    this.#boxes.length = 0;
    this.#surfaces.length = 0;
  }

  setWorldBounds(minX, maxX, minZ, maxZ) {
    this.#worldBounds = { minX, maxX, minZ, maxZ };
  }

  addBox(minX, maxX, minY, maxY, minZ, maxZ) {
    this.#boxes.push({ minX, maxX, minY, maxY, minZ, maxZ });
  }

  addCylinderCollider(cx, cz, radius, minY = 0, maxY = 4) {
    this.#boxes.push({
      isCylinder: true,
      cx,
      cz,
      radius,
      minY,
      maxY
    });
  }

  addFlatSurface(minX, maxX, minZ, maxZ, y) {
    this.#surfaces.push({
      minX,
      maxX,
      minZ,
      maxZ,
      getHeight: () => y
    });
  }

  addDiscSurface(cx, cz, radius, y) {
    const rSq = radius * radius;
    this.#surfaces.push({
      minX: cx - radius,
      maxX: cx + radius,
      minZ: cz - radius,
      maxZ: cz + radius,
      contains: (x, z) => (x - cx) * (x - cx) + (z - cz) * (z - cz) <= rSq,
      getHeight: () => y
    });
  }

  addRampSurface(minX, maxX, minZ, maxZ, axis, startCoord, endCoord, startY, endY) {
    this.#surfaces.push({
      minX,
      maxX,
      minZ,
      maxZ,
      getHeight: (x, z) => {
        const v = axis === 'z' ? z : x;
        const t = Math.max(0, Math.min(1, (v - startCoord) / (endCoord - startCoord)));
        return startY + (endY - startY) * t;
      }
    });
  }

  getGroundHeight(x, z, currentY = 0, maxStepUp = 1.15) {
    let bestY = 0;
    for (const s of this.#surfaces) {
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
      for (const b of this.#boxes) {
        if (headY <= b.minY || feetY >= b.maxY) continue;

        if (b.isCylinder) {
          const dx = x - b.cx;
          const dz = z - b.cz;
          const minDist = b.radius + radius;
          const distSq = dx * dx + dz * dz;
          if (distSq < minDist * minDist) {
            const dist = Math.sqrt(distSq) || 0.0001;
            x = b.cx + (dx / dist) * minDist;
            z = b.cz + (dz / dist) * minDist;
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
    for (const b of this.#boxes) {
      if (y < b.minY - margin || y > b.maxY + margin) continue;
      if (b.isCylinder) {
        const dx = x - b.cx;
        const dz = z - b.cz;
        const r = b.radius + margin;
        if (dx * dx + dz * dz < r * r) return true;
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
    if (pos.x > 36 && pos.z < -28 && pos.z > -44) return 'Terraza Real de Baile';
    if (pos.z > 36 && Math.abs(pos.x) < 12) return 'Mirador del Lago Imperial';
    if (Math.hypot(pos.x, pos.z) < 15) return 'Plaza de la Gran Fuente';
    return 'Jardines y Bosques Reales';
  }

  update() {}

  dispose() {
    this.clear();
  }
}
