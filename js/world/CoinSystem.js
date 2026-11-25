import * as THREE from 'three';

const STORAGE_KEY = 'reino_rosa_coins_v1';
const DEFAULT_COINS = 150;
const COIN_VALUE = 10;
const PICKUP_RADIUS_SQ = 1.65 * 1.65;
const PICKUP_Y_TOLERANCE = 1.8;
const COLLECT_DURATION = 0.32;
const RESPAWN_MIN_SEC = 45;
const RESPAWN_RANGE_SEC = 15;
const RESPAWN_POP_SEC = 0.5;
const PARTICLE_POOL_SIZE = 60;
const ACTIVE_CULL_SQ = 55 * 55;

/**
 * Crea las posiciones distribuidas de ~60 monedas doradas imperiales por todo el reino.
 * @returns {Array<{x: number, baseY: number, z: number}>}
 */
function buildCoinSpawns() {
  const spawns = [];
  const push = (x, baseY, z) => spawns.push({ x, baseY, z });

  // 1. Plaza de la Fuente (anillo exterior r ≈ 8.5–13.5)
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + 0.18;
    const radius = i % 2 === 0 ? 9.4 : 12.6;
    push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  }

  // 2. Paseo Central Norte-Sur (X ∈ [-3.5, 3.5], Z ∈ [-15, 35])
  const paseoCoords = [
    [-2.6, -14.5],
    [2.6, -11.5],
    [-2.4, 13.5],
    [2.4, 17.5],
    [-2.8, 22.0],
    [2.8, 26.0],
    [-2.2, 30.5],
    [2.2, 34.5]
  ];
  for (const [x, z] of paseoCoords) {
    push(x, 0, z);
  }

  // 3. Alrededores y entrada de la Cúpula Real del Casino (-18.6, 17.0)
  // Arco Este (X ∈ [-10, -5], Z ∈ [15, 19])
  push(-5.8, 0, 17.0);
  push(-7.6, 0, 15.6);
  push(-9.4, 0, 18.4);
  // Perímetro exterior (r ≈ 10.5)
  for (let i = 0; i < 7; i++) {
    const angle = 0.55 + (i / 7) * (Math.PI * 2 - 0.85);
    push(-18.6 + Math.cos(angle) * 10.5, 0, 17.0 + Math.sin(angle) * 10.5);
  }

  // 4. Explanada del Palacio (Y = 1.0 en Z = -25..-32)
  const palaceCoords = [
    [-14.0, -26.0],
    [-7.0, -28.5],
    [0.0, -30.8],
    [7.0, -28.5],
    [14.0, -26.0],
    [0.0, -25.4]
  ];
  for (const [x, z] of palaceCoords) {
    push(x, 1.0, z);
  }

  // 5. Mirador Sur ((0, 1.2, 46))
  push(0, 1.2, 45.2);
  push(-3.4, 1.2, 46.2);
  push(3.4, 1.2, 46.2);
  push(0, 1.2, 49.0);

  // 6. Puentes ((34, 0.75, 24) y (-21, 0.75, 34))
  push(32.2, 0.75, 24.0);
  push(34.0, 0.75, 24.0);
  push(35.8, 0.75, 24.0);
  push(-22.8, 0.75, 34.0);
  push(-21.0, 0.75, 34.0);
  push(-19.2, 0.75, 34.0);

  // 7. Frente de la Gran Pasarela ((-34, 0, 0..20))
  for (let i = 0; i < 5; i++) {
    push(-34.0, 0, i * 5.0);
  }

  // 8. Jardines Este/Oeste y senderos curvos
  const gardenCoords = [
    [18.0, -10.0],
    [24.5, -3.5],
    [28.0, 4.5],
    [24.0, 12.5],
    [30.5, 17.0],
    [38.0, 14.0],
    [-18.0, -14.0],
    [-24.5, -8.0],
    [-28.0, -1.0],
    [-22.0, 4.0],
    [-16.0, -4.0]
  ];
  for (const [x, z] of gardenCoords) {
    push(x, 0, z);
  }

  return spawns;
}

/**
 * Dibuja la textura con relieve de corona imperial y estrella dorada para las caras de la moneda.
 */
function createCoinFaceTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;

  // Fondo metálico oro imperial con degradado radial suave (evita valores quemados para bloom)
  const bg = ctx.createRadialGradient(cx - 24, cy - 28, 12, cx, cy, 124);
  bg.addColorStop(0, '#ffe484');
  bg.addColorStop(0.58, '#e3ae2c');
  bg.addColorStop(0.88, '#b87d14');
  bg.addColorStop(1, '#8c5a08');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Borde fresado exterior
  ctx.strokeStyle = '#704505';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, 114, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#fff0a8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 105, 0, Math.PI * 2);
  ctx.stroke();

  // Muescas radiales del bisel
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 24; i++) {
    ctx.rotate((Math.PI * 2) / 24);
    ctx.fillStyle = i % 2 === 0 ? '#784c06' : '#f7d160';
    ctx.fillRect(-2, -110, 4, 8);
  }
  ctx.restore();

  // Anillo interior hundido
  ctx.fillStyle = 'rgba(130, 82, 8, 0.35)';
  ctx.beginPath();
  ctx.arc(cx, cy, 88, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffe894';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 86, 0, Math.PI * 2);
  ctx.stroke();

  // Estrella imperial de 8 puntas en el fondo del relieve
  ctx.save();
  ctx.translate(cx, cy + 4);
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 72 : 31;
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const starGrad = ctx.createLinearGradient(0, -72, 0, 72);
  starGrad.addColorStop(0, '#fff2b2');
  starGrad.addColorStop(0.5, '#f0be41');
  starGrad.addColorStop(1, '#9c680b');
  ctx.fillStyle = starGrad;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#754904';
  ctx.stroke();
  ctx.restore();

  // Corona real en relieve en el centro
  ctx.save();
  ctx.translate(cx, cy + 18);

  // Sombra sutil de relieve
  ctx.fillStyle = 'rgba(90, 52, 4, 0.45)';
  ctx.beginPath();
  ctx.moveTo(-40, 12);
  ctx.lineTo(-46, -24);
  ctx.lineTo(-22, -6);
  ctx.lineTo(0, -34);
  ctx.lineTo(22, -6);
  ctx.lineTo(46, -24);
  ctx.lineTo(40, 12);
  ctx.closePath();
  ctx.fill();

  // Cuerpo dorado de la corona
  ctx.translate(0, -3);
  const crownGrad = ctx.createLinearGradient(0, -36, 0, 16);
  crownGrad.addColorStop(0, '#fff7cc');
  crownGrad.addColorStop(0.55, '#ffd24c');
  crownGrad.addColorStop(1, '#b57b10');
  ctx.fillStyle = crownGrad;
  ctx.strokeStyle = '#6b4103';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-40, 10);
  ctx.lineTo(-46, -24);
  ctx.lineTo(-22, -6);
  ctx.lineTo(0, -34);
  ctx.lineTo(22, -6);
  ctx.lineTo(46, -24);
  ctx.lineTo(40, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Base de la corona
  ctx.fillStyle = '#e6ad2b';
  ctx.fillRect(-40, 10, 80, 12);
  ctx.strokeRect(-40, 10, 80, 12);

  // Perlas en las puntas y rubí rosa central
  const tips = [
    [-46, -25],
    [0, -35],
    [46, -25]
  ];
  for (const [tx, ty] of tips) {
    ctx.fillStyle = '#fff5c8';
    ctx.beginPath();
    ctx.arc(tx, ty, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = '#f05aa3';
  ctx.beginPath();
  ctx.arc(0, -2, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7a3b14';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Crea la textura estriada para el canto dorado de la moneda.
 */
function createCoinRimTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#cfa028';
  ctx.fillRect(0, 0, 128, 32);

  for (let x = 0; x < 128; x += 4) {
    ctx.fillStyle = (x / 4) % 2 === 0 ? '#f0c64d' : '#9c6b0d';
    ctx.fillRect(x, 0, 2, 32);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(3, 1);
  texture.needsUpdate = true;
  return texture;
}

export class CoinSystem {
  #scene;
  #audioManager;
  #onBalanceChange;
  #balance = DEFAULT_COINS;
  #coins = [];
  #coinMesh = null;
  #haloMesh = null;
  #particleMesh = null;
  #particles = [];
  #particleCursor = 0;
  #geometries = [];
  #materials = [];
  #textures = [];
  #elapsed = 0;
  #dummy = new THREE.Object3D();
  #initialized = false;

  /**
   * @param {THREE.Scene} scene
   * @param {object|null} audioManager
   * @param {((balance: number, delta: number, reason: string) => void)|null} onBalanceChange
   */
  constructor(scene, audioManager, onBalanceChange = null) {
    this.#scene = scene;
    this.#audioManager = audioManager;
    this.#onBalanceChange = onBalanceChange;
  }

  init() {
    if (this.#initialized) return;
    this.#initialized = true;

    this.#loadOrInitBalance();
    this.#onBalanceChange?.(this.#balance, 0, 'init');

    const spawns = buildCoinSpawns();
    this.#coins = spawns.map((s, idx) => ({
      x: s.x,
      baseY: s.baseY,
      z: s.z,
      phase: idx * 0.73,
      state: 'active',
      collectTimer: 0,
      collectStartX: s.x,
      collectStartY: s.baseY + 0.9,
      collectStartZ: s.z,
      collectRotY: idx * 0.73,
      respawnTimer: 0,
      appearTimer: RESPAWN_POP_SEC
    }));

    // Geometría de moneda vertical (cilindro delgado rotado 90° para quedar de pie)
    const coinGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.08, 18);
    coinGeo.rotateZ(Math.PI / 2);
    coinGeo.rotateY(Math.PI / 2);

    // Corregir UVs de la tapa trasera (normal Z < -0.5) para que la corona quede derecha en ambos lados
    const normAttr = coinGeo.attributes.normal;
    const uvAttr = coinGeo.attributes.uv;
    if (normAttr && uvAttr) {
      for (let i = 0; i < normAttr.count; i++) {
        if (normAttr.getZ(i) < -0.5) {
          uvAttr.setXY(i, 1 - uvAttr.getX(i), 1 - uvAttr.getY(i));
        }
      }
      uvAttr.needsUpdate = true;
    }

    const faceTex = createCoinFaceTexture();
    const rimTex = createCoinRimTexture();
    this.#textures.push(faceTex, rimTex);

    const rimMat = new THREE.MeshStandardMaterial({
      map: rimTex,
      color: 0xffd55a,
      metalness: 0.85,
      roughness: 0.22,
      emissive: 0xb8860b,
      emissiveIntensity: 0.22
    });
    rimMat.userData.preserveRoughness = true;

    const faceMat = new THREE.MeshStandardMaterial({
      map: faceTex,
      color: 0xffe48f,
      metalness: 0.85,
      roughness: 0.22,
      emissive: 0xb8860b,
      emissiveIntensity: 0.22
    });
    faceMat.userData.preserveRoughness = true;

    this.#geometries.push(coinGeo);
    this.#materials.push(rimMat, faceMat);

    this.#coinMesh = new THREE.InstancedMesh(coinGeo, [rimMat, faceMat, faceMat], this.#coins.length);
    this.#coinMesh.name = 'ImperialCoinsInstanced';
    this.#coinMesh.castShadow = false;
    this.#coinMesh.receiveShadow = false;
    this.#coinMesh.frustumCulled = false;

    // Halo dorado sutil en el suelo bajo cada moneda activa
    const haloGeo = new THREE.RingGeometry(0.24, 0.48, 18);
    haloGeo.rotateX(-Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffd25a,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    haloMat.userData.isVfx = true;
    this.#geometries.push(haloGeo);
    this.#materials.push(haloMat);

    this.#haloMesh = new THREE.InstancedMesh(haloGeo, haloMat, this.#coins.length);
    this.#haloMesh.name = 'ImperialCoinsHalos';
    this.#haloMesh.frustumCulled = false;

    // Pool de partículas doradas para el estallido al recoger monedas
    const particleGeo = new THREE.OctahedronGeometry(0.085, 0);
    const particleMat = new THREE.MeshBasicMaterial({
      color: 0xffdc6b,
      transparent: true,
      opacity: 0.92,
      depthWrite: false
    });
    particleMat.userData.isVfx = true;
    this.#geometries.push(particleGeo);
    this.#materials.push(particleMat);

    this.#particleMesh = new THREE.InstancedMesh(particleGeo, particleMat, PARTICLE_POOL_SIZE);
    this.#particleMesh.name = 'ImperialCoinParticles';
    this.#particleMesh.frustumCulled = false;
    this.#particleMesh.visible = false;

    this.#particles = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 0.45,
      rot: 0
    }));

    this.#syncInitialMatrices();

    if (this.#scene) {
      this.#scene.add(this.#coinMesh);
      this.#scene.add(this.#haloMesh);
      this.#scene.add(this.#particleMesh);
    }
  }

  getBalance() {
    return this.#balance;
  }

  canAfford(amount) {
    return typeof amount === 'number' && Number.isFinite(amount) && amount > 0 && this.#balance >= amount;
  }

  spendCoins(amount) {
    if (!this.canAfford(amount)) return false;
    const spent = Math.round(amount);
    if (spent <= 0 || this.#balance < spent) return false;
    this.#balance -= spent;
    this.#saveBalance();
    this.#onBalanceChange?.(this.#balance, -spent, 'bet');
    return true;
  }

  addCoins(amount, reason = 'win') {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return this.#balance;
    }
    const gained = Math.round(amount);
    if (gained <= 0) return this.#balance;
    this.#balance += gained;
    this.#saveBalance();
    this.#onBalanceChange?.(this.#balance, gained, reason);
    return this.#balance;
  }

  update(dt, playerPos) {
    if (!this.#initialized || !this.#coinMesh) return;

    const animDt = Math.min(Math.max(dt || 0, 0), 0.1);
    const timerDt = Math.min(Math.max(dt || 0, 0), 1.0);
    this.#elapsed += animDt;

    const hasPlayer = Boolean(playerPos);
    const dummy = this.#dummy;
    let coinDirty = false;
    let haloDirty = false;

    for (let i = 0; i < this.#coins.length; i++) {
      const c = this.#coins[i];

      if (c.state === 'active') {
        let distSq = 0;
        if (hasPlayer) {
          const dx = playerPos.x - c.x;
          const dz = playerPos.z - c.z;
          distSq = dx * dx + dz * dz;
          if (distSq > ACTIVE_CULL_SQ && c.appearTimer >= RESPAWN_POP_SEC) {
            continue;
          }
        }

        if (c.appearTimer < RESPAWN_POP_SEC) {
          c.appearTimer = Math.min(RESPAWN_POP_SEC, c.appearTimer + animDt);
        }

        const floatY = c.baseY + 0.9 + Math.sin(this.#elapsed * 2.5 + c.phase) * 0.14;
        const rotY = c.phase + this.#elapsed * 2.15;

        if (hasPlayer && distSq < PICKUP_RADIUS_SQ && Math.abs(playerPos.y - c.baseY) < PICKUP_Y_TOLERANCE) {
          c.state = 'collecting';
          c.collectTimer = 0;
          c.collectStartX = c.x;
          c.collectStartY = floatY;
          c.collectStartZ = c.z;
          c.collectRotY = rotY;
          this.#spawnBurst(c.x, floatY, c.z);
          this.addCoins(COIN_VALUE, 'pickup');
          this.#audioManager?.playCoin?.();
        }

        if (c.state === 'active') {
          const popRatio = c.appearTimer / RESPAWN_POP_SEC;
          const scale = popRatio >= 1 ? 1 : 1 - Math.pow(1 - popRatio, 3);

          dummy.position.set(c.x, floatY, c.z);
          dummy.rotation.set(0, rotY, 0);
          dummy.scale.setScalar(scale);
          dummy.updateMatrix();
          this.#coinMesh.setMatrixAt(i, dummy.matrix);

          dummy.position.set(c.x, c.baseY + 0.04, c.z);
          dummy.rotation.set(0, rotY * 0.5, 0);
          const haloPulse = scale * (0.92 + Math.sin(this.#elapsed * 3.2 + c.phase) * 0.1);
          dummy.scale.setScalar(haloPulse);
          dummy.updateMatrix();
          this.#haloMesh.setMatrixAt(i, dummy.matrix);
          coinDirty = true;
          haloDirty = true;
          continue;
        }
      }

      if (c.state === 'collecting') {
        c.collectTimer += animDt;
        const t = Math.min(1, c.collectTimer / COLLECT_DURATION);
        const ease = 1 - Math.pow(1 - t, 2);

        const targetX = hasPlayer ? playerPos.x : c.collectStartX;
        const targetY = (hasPlayer ? playerPos.y : c.baseY) + 1.15;
        const targetZ = hasPlayer ? playerPos.z : c.collectStartZ;

        const px = c.collectStartX + (targetX - c.collectStartX) * ease;
        const py = c.collectStartY + (targetY - c.collectStartY) * ease + Math.sin(t * Math.PI) * 0.42;
        const pz = c.collectStartZ + (targetZ - c.collectStartZ) * ease;
        c.collectRotY += animDt * (12 + t * 20);
        const scale = Math.max(0.001, (1 - t * 0.8) * (1 + 0.18 * Math.sin(t * Math.PI)));

        dummy.position.set(px, py, pz);
        dummy.rotation.set(0, c.collectRotY, 0);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        this.#coinMesh.setMatrixAt(i, dummy.matrix);

        dummy.position.set(c.x, c.baseY + 0.04, c.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(Math.max(0.001, (1 - t) * 0.8));
        dummy.updateMatrix();
        this.#haloMesh.setMatrixAt(i, dummy.matrix);
        coinDirty = true;
        haloDirty = true;

        if (t >= 1) {
          c.state = 'hidden';
          c.respawnTimer = RESPAWN_MIN_SEC + Math.random() * RESPAWN_RANGE_SEC;
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          this.#coinMesh.setMatrixAt(i, dummy.matrix);
          this.#haloMesh.setMatrixAt(i, dummy.matrix);
        }
        continue;
      }

      // Estado 'hidden'
      c.respawnTimer -= timerDt;
      if (c.respawnTimer <= 0) {
        c.state = 'active';
        c.appearTimer = 0;
      }
    }

    if (coinDirty) this.#coinMesh.instanceMatrix.needsUpdate = true;
    if (haloDirty) this.#haloMesh.instanceMatrix.needsUpdate = true;

    this.#updateParticles(animDt);
  }

  dispose() {
    if (this.#scene) {
      if (this.#coinMesh) this.#scene.remove(this.#coinMesh);
      if (this.#haloMesh) this.#scene.remove(this.#haloMesh);
      if (this.#particleMesh) this.#scene.remove(this.#particleMesh);
    }
    this.#coinMesh = null;
    this.#haloMesh = null;
    this.#particleMesh = null;

    for (const geo of this.#geometries) geo.dispose();
    for (const mat of this.#materials) mat.dispose();
    for (const tex of this.#textures) tex.dispose();

    this.#geometries.length = 0;
    this.#materials.length = 0;
    this.#textures.length = 0;
    this.#coins.length = 0;
    this.#particles.length = 0;
    this.#initialized = false;
  }

  #loadOrInitBalance() {
    let loaded = null;
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
        const parsed = Number.parseInt(raw.trim(), 10);
        if (Number.isSafeInteger(parsed) && parsed >= 0) {
          loaded = parsed;
        }
      }
    } catch {
      loaded = null;
    }

    if (loaded === null) {
      this.#balance = DEFAULT_COINS;
      this.#saveBalance();
    } else {
      this.#balance = loaded;
    }
  }

  #saveBalance() {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, String(this.#balance));
    } catch {
      // Ignorar errores de almacenamiento en modos restringidos
    }
  }

  #syncInitialMatrices() {
    const dummy = this.#dummy;
    for (let i = 0; i < this.#coins.length; i++) {
      const c = this.#coins[i];
      dummy.position.set(c.x, c.baseY + 0.9, c.z);
      dummy.rotation.set(0, c.phase, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.#coinMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(c.x, c.baseY + 0.04, c.z);
      dummy.rotation.set(0, c.phase * 0.5, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.#haloMesh.setMatrixAt(i, dummy.matrix);
    }
    this.#coinMesh.instanceMatrix.needsUpdate = true;
    this.#haloMesh.instanceMatrix.needsUpdate = true;

    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.#particleMesh.setMatrixAt(i, dummy.matrix);
    }
    this.#particleMesh.instanceMatrix.needsUpdate = true;
  }

  #spawnBurst(x, y, z) {
    if (this.#particleMesh) this.#particleMesh.visible = true;
    const count = 10;
    for (let i = 0; i < count; i++) {
      const p = this.#particles[this.#particleCursor];
      this.#particleCursor = (this.#particleCursor + 1) % PARTICLE_POOL_SIZE;

      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.45;
      const speed = 1.6 + Math.random() * 2.1;
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.cos(angle) * speed;
      p.vy = 2.0 + Math.random() * 2.4;
      p.vz = Math.sin(angle) * speed;
      p.life = 0;
      p.maxLife = 0.36 + Math.random() * 0.16;
      p.rot = Math.random() * Math.PI * 2;
    }
  }

  #updateParticles(dt) {
    if (!this.#particleMesh || !this.#particleMesh.visible) return;
    let dirty = false;
    let activeCount = 0;
    const dummy = this.#dummy;

    for (let i = 0; i < this.#particles.length; i++) {
      const p = this.#particles[i];
      if (!p.active) continue;

      dirty = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        this.#particleMesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      activeCount++;
      p.vy -= 8.8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += dt * 9;

      const t = p.life / p.maxLife;
      const scale = Math.sin((1 - t) * Math.PI * 0.5) * 1.15;

      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rot, p.rot * 0.7, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      this.#particleMesh.setMatrixAt(i, dummy.matrix);
    }

    if (dirty) {
      this.#particleMesh.instanceMatrix.needsUpdate = true;
    }
    this.#particleMesh.visible = activeCount > 0;
  }
}
