import * as THREE from 'three';
import { CatalogData } from '../characters/catalog/CatalogData.js';
import { CasinoUI } from '../ui/CasinoUI.js';

const SUITS = Object.freeze(['♠', '♥', '♦', '♣']);
const RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
const DEFAULT_SLOT_SYMBOLS = Object.freeze(['crown', 'seven', 'gem', 'star', 'heart', 'bell']);
const COIN_RAIN_POOL_SIZE = 64;

const SYMBOL_LABELS = Object.freeze({
  crown: 'Corona Real',
  seven: '7 Imperial',
  gem: 'Diamante',
  star: 'Estrella',
  heart: 'Corazón',
  bell: 'Campana',
  cherry: 'Cereza'
});

const PIP_LAYOUTS = Object.freeze({
  2: [[0.5, 0.25], [0.5, 0.75]],
  3: [[0.5, 0.22], [0.5, 0.5], [0.5, 0.78]],
  4: [[0.32, 0.25], [0.68, 0.25], [0.32, 0.75], [0.68, 0.75]],
  5: [[0.32, 0.25], [0.68, 0.25], [0.5, 0.5], [0.32, 0.75], [0.68, 0.75]],
  6: [[0.32, 0.23], [0.68, 0.23], [0.32, 0.5], [0.68, 0.5], [0.32, 0.77], [0.68, 0.77]],
  7: [[0.32, 0.22], [0.68, 0.22], [0.5, 0.36], [0.32, 0.5], [0.68, 0.5], [0.32, 0.78], [0.68, 0.78]],
  8: [[0.32, 0.21], [0.68, 0.21], [0.5, 0.35], [0.32, 0.5], [0.68, 0.5], [0.5, 0.65], [0.32, 0.79], [0.68, 0.79]],
  9: [[0.32, 0.2], [0.68, 0.2], [0.32, 0.4], [0.68, 0.4], [0.5, 0.5], [0.32, 0.6], [0.68, 0.6], [0.32, 0.8], [0.68, 0.8]],
  10: [[0.32, 0.2], [0.68, 0.2], [0.5, 0.31], [0.32, 0.41], [0.68, 0.41], [0.32, 0.59], [0.68, 0.59], [0.5, 0.69], [0.32, 0.8], [0.68, 0.8]]
});

function toVec3(src, out = new THREE.Vector3()) {
  if (!src) return out.set(0, 0, 0);
  return out.set(src.x ?? 0, src.y ?? 0, src.z ?? 0);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function calcHandValue(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === 'A') {
      aces += 1;
      total += 11;
    } else if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') {
      total += 10;
    } else {
      total += Number(card.rank) || 0;
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, isSoft: aces > 0 };
}

function cardSingleValue(card) {
  if (!card) return 0;
  if (card.rank === 'A') return 11;
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
  return Number(card.rank) || 0;
}

/**
 * Controlador de Juegos de Casino en Primera Persona:
 * - Tragaperras Real con brazo en primera persona, palanca 3D sincronizada y 3 rodillos con rebote elástico.
 * - Blackjack Animado con cartas 3D volando desde el zapato, giro en el aire y tapete en tiempo real.
 */
export class CasinoGames {
  #scene;
  #camera;
  #player;
  #input;
  #audio;
  #coinSystem;
  #casinoDome;
  #onExit;
  #onBlackjackCelebration;
  #onActivityChange;

  #ui = null;
  #state = 'idle'; // 'idle' | 'entering' | 'playing' | 'exiting'
  #station = null;
  #mode = null; // 'slots' | 'blackjack'
  #localRigHidden = false;

  // Transición de cámara
  #camElapsed = 0;
  #camDuration = 0.45;
  #camStartPos = new THREE.Vector3();
  #camStartLookAt = new THREE.Vector3();
  #camTargetPos = new THREE.Vector3();
  #camTargetLookAt = new THREE.Vector3();
  #tmpVec = new THREE.Vector3();
  #tmpLook = new THREE.Vector3();
  #tmpRight = new THREE.Vector3();
  #tmpUp = new THREE.Vector3();
  #tmpFwd = new THREE.Vector3();
  #tmpRestPos = new THREE.Vector3();
  #tmpKnobPos = new THREE.Vector3();
  #tmpLookTarget = new THREE.Vector3();
  #tmpPivotOffset = new THREE.Vector3();
  #tmpVec2 = new THREE.Vector3();
  #xAxis = new THREE.Vector3(1, 0, 0);

  // Recursos compartidos 3D
  #cardGeometry = null;
  #cardBackTex = null;
  #cardBackMat = null;
  #cardEdgeMat = null;
  #cardCache = new Map(); // `${suit}_${rank}` -> { texture, material }
  #coinGeo = null;
  #coinMat = null;

  // Lluvia de monedas VFX (pool fijo InstancedMesh)
  #coinRainMesh = null;
  #coinParticles = [];
  #coinCursor = 0;
  #coinDummy = new THREE.Object3D();

  // Estado Tragaperras
  #slotsSpin = null;
  #armGroup = null;
  #armMats = [];
  #armGeos = [];

  // Estado Blackjack
  #bjPhase = 'betting'; // 'betting' | 'dealing' | 'playerTurn' | 'dealerTurn' | 'result'
  #bjBet = 10;
  #bjDeck = [];
  #bjPlayerHand = [];
  #bjDealerHand = [];
  #bjTableGroup = null;
  #bjCardMeshes = [];
  #bjAnimations = [];
  #bjTimeline = [];
  #bjReadyFns = [];
  #bjYawTowardPlayer = 0;
  #bjRightLocal = new THREE.Vector3(1, 0, 0);
  #bjForwardLocal = new THREE.Vector3(0, 0, 1);

  constructor({
    scene,
    camera,
    player,
    input,
    audio,
    coinSystem,
    casinoDome,
    onExit,
    onBlackjackCelebration,
    onActivityChange
  }) {
    this.#scene = scene;
    this.#camera = camera;
    this.#player = player;
    this.#input = input;
    this.#audio = audio;
    this.#coinSystem = coinSystem;
    this.#casinoDome = casinoDome;
    this.#onExit = onExit;
    this.#onBlackjackCelebration = onBlackjackCelebration;
    this.#onActivityChange = onActivityChange;
  }

  init() {
    this.#ui = new CasinoUI();
    this.#ui.init();

    // Geometría compartida exacta para cartas 3D
    this.#cardGeometry = new THREE.BoxGeometry(0.16, 0.004, 0.23);

    // Reverso real dorado/rosa
    this.#cardBackTex = this.#createCardBackTexture();
    this.#cardBackMat = new THREE.MeshStandardMaterial({
      map: this.#cardBackTex,
      roughness: 0.35,
      metalness: 0.08
    });
    this.#cardBackMat.userData.preserveRoughness = true;

    this.#cardEdgeMat = new THREE.MeshStandardMaterial({
      color: 0xf4ead8,
      roughness: 0.35,
      metalness: 0.04
    });
    this.#cardEdgeMat.userData.preserveRoughness = true;

    // Caché completa de las 52 cartas
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const key = `${suit}_${rank}`;
        const texture = this.#createCardFrontTexture(suit, rank);
        const material = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.35,
          metalness: 0.04
        });
        material.userData.preserveRoughness = true;
        this.#cardCache.set(key, { texture, material });
      }
    }

    // Geometría y material VFX compartidos para lluvia de monedas
    this.#coinGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.012, 16);
    this.#coinMat = new THREE.MeshStandardMaterial({
      color: 0xffd24c,
      roughness: 0.25,
      metalness: 0.72
    });
    this.#coinMat.userData.isVfx = true;

    this.#coinRainMesh = new THREE.InstancedMesh(this.#coinGeo, this.#coinMat, COIN_RAIN_POOL_SIZE);
    this.#coinRainMesh.name = 'CasinoCoinRain';
    this.#coinRainMesh.castShadow = false;
    this.#coinRainMesh.receiveShadow = false;
    this.#coinRainMesh.frustumCulled = false;
    this.#coinRainMesh.visible = false;

    this.#coinParticles = Array.from({ length: COIN_RAIN_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      vrx: 0,
      vry: 0,
      floorY: 0,
      life: 0,
      maxLife: 2
    }));

    this.#coinDummy.scale.setScalar(0);
    this.#coinDummy.updateMatrix();
    for (let i = 0; i < COIN_RAIN_POOL_SIZE; i++) {
      this.#coinRainMesh.setMatrixAt(i, this.#coinDummy.matrix);
    }
    this.#coinRainMesh.instanceMatrix.needsUpdate = true;
    this.#scene?.add(this.#coinRainMesh);
  }

  #createCardFrontTexture(suit, rank) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 368;
    const ctx = canvas.getContext('2d');
    const isRed = suit === '♥' || suit === '♦';
    const ink = isRed ? '#c62448' : '#1e1624';

    // Marfil cálido para evitar reflejo blanco bajo bloom
    ctx.fillStyle = '#fcf6ec';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Doble marco dorado sutil
    ctx.strokeStyle = '#d4a857';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.strokeStyle = 'rgba(212, 168, 87, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(15, 15, canvas.width - 30, canvas.height - 30);

    // Índices esquina superior izquierda
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 34px "Segoe UI", Arial, sans-serif';
    ctx.fillText(rank, 35, 42);
    ctx.font = '28px "Segoe UI Symbol", "Apple Color Emoji", Arial, sans-serif';
    ctx.fillText(suit, 35, 74);

    // Índices esquina inferior derecha invertidos
    ctx.save();
    ctx.translate(canvas.width - 35, canvas.height - 42);
    ctx.rotate(Math.PI);
    ctx.font = 'bold 34px "Segoe UI", Arial, sans-serif';
    ctx.fillText(rank, 0, 0);
    ctx.font = '28px "Segoe UI Symbol", "Apple Color Emoji", Arial, sans-serif';
    ctx.fillText(suit, 0, 32);
    ctx.restore();

    // Dibujo central
    const numVal = Number(rank);
    if (rank === 'A') {
      ctx.save();
      ctx.strokeStyle = 'rgba(212, 168, 87, 0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(128, 184, 58, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.font = '94px "Segoe UI Symbol", "Apple Color Emoji", Arial, sans-serif';
      ctx.fillText(suit, 128, 188);
      ctx.restore();
    } else if (rank === 'J' || rank === 'Q' || rank === 'K') {
      ctx.save();
      ctx.fillStyle = isRed ? 'rgba(232, 92, 138, 0.12)' : 'rgba(42, 26, 52, 0.08)';
      ctx.fillRect(58, 72, 140, 224);
      ctx.strokeStyle = '#d4a857';
      ctx.lineWidth = 3;
      ctx.strokeRect(58, 72, 140, 224);

      const emblem = rank === 'K' ? '♛' : rank === 'Q' ? '👑' : '⚜️';
      ctx.font = '46px "Segoe UI Symbol", "Apple Color Emoji", Arial, sans-serif';
      ctx.fillStyle = '#c88c32';
      ctx.fillText(emblem, 128, 134);

      ctx.fillStyle = ink;
      ctx.font = 'bold 58px Georgia, serif';
      ctx.fillText(rank, 128, 194);
      ctx.font = '44px "Segoe UI Symbol", "Apple Color Emoji", Arial, sans-serif';
      ctx.fillText(suit, 128, 248);
      ctx.restore();
    } else if (PIP_LAYOUTS[numVal]) {
      ctx.fillStyle = ink;
      ctx.font = '38px "Segoe UI Symbol", "Apple Color Emoji", Arial, sans-serif';
      for (const [nx, ny] of PIP_LAYOUTS[numVal]) {
        const px = 56 + (nx - 0.3) * (144 / 0.4);
        const py = 54 + (ny - 0.18) * (260 / 0.64);
        ctx.save();
        ctx.translate(px, py);
        if (ny > 0.55) ctx.rotate(Math.PI);
        ctx.fillText(suit, 0, 0);
        ctx.restore();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  #createCardBackTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 368;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 256, 368);
    grad.addColorStop(0, '#882055');
    grad.addColorStop(0.5, '#b63978');
    grad.addColorStop(1, '#6f1845');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 368);

    // Marco marfil y oro
    ctx.strokeStyle = '#fcf2dc';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 246, 358);

    ctx.strokeStyle = '#f2c972';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, 220, 332);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(25, 25, 206, 318);

    // Enrejado de rombos dorados
    ctx.strokeStyle = 'rgba(248, 214, 138, 0.28)';
    ctx.lineWidth = 1.2;
    for (let y = 32; y < 336; y += 26) {
      for (let x = 32; x < 224; x += 26) {
        ctx.beginPath();
        ctx.moveTo(x + 13, y);
        ctx.lineTo(x + 26, y + 13);
        ctx.lineTo(x + 13, y + 26);
        ctx.lineTo(x, y + 13);
        ctx.closePath();
        ctx.stroke();
      }
    }

    // Medallón central con corona
    ctx.fillStyle = '#5a1236';
    ctx.beginPath();
    ctx.arc(128, 184, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f4cd76';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.fillStyle = '#ffe59e';
    ctx.font = '46px "Segoe UI Symbol", "Apple Color Emoji", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♛', 128, 186);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  #getBalance() {
    return this.#coinSystem?.getBalance?.() ?? 0;
  }

  #addCoins(amount) {
    if (!this.#coinSystem || amount <= 0) return;
    if (typeof this.#coinSystem.addCoins === 'function') {
      this.#coinSystem.addCoins(amount);
    } else if (typeof this.#coinSystem.earnCoins === 'function') {
      this.#coinSystem.earnCoins(amount);
    }
  }

  #detectStationMode(station) {
    const kind = String(station.type || station.game || station.kind || '').toLowerCase();
    if (kind.includes('slot') || kind.includes('tragaperra')) return 'slots';
    if (kind.includes('blackjack') || kind.includes('21')) return 'blackjack';
    if (station.reels) return 'slots';
    return 'blackjack';
  }

  enterStation(station) {
    if (!station) return;
    if (this.#state !== 'idle') {
      this.#forceResetSession(false);
    }

    this.#station = station;
    this.#mode = this.#detectStationMode(station);

    this.#input?.exitPointerLock?.();
    this.#input?.setControlsLocked?.(true);

    const stand = toVec3(station.playerStandPos, this.#tmpVec);
    this.#player?.teleport?.(stand.x, stand.y, stand.z, station.playerYaw);
    this.#player?.setExternalControl?.(true);
    this.#player?.setCameraOverride?.(true);
    this.#player?.setAnimState?.('pose');

    // Captura pose actual de cámara para interpolación fluida ~0.45 s
    this.#camStartPos.copy(this.#camera.position);
    toVec3(station.cameraPos, this.#camTargetPos);
    toVec3(station.cameraLookAt, this.#camTargetLookAt);

    this.#camera.getWorldDirection(this.#tmpVec);
    const lookDist = Math.max(2, this.#camera.position.distanceTo(this.#camTargetLookAt));
    this.#camStartLookAt.copy(this.#camera.position).addScaledVector(this.#tmpVec, lookDist);

    this.#camElapsed = 0;
    this.#camDuration = 0.45;
    this.#localRigHidden = false;
    this.#state = 'entering';

    this.#onActivityChange?.(station.id);

    if (this.#mode === 'slots') {
      this.#slotsSpin = null;
      this.#ui.openSlots({
        balance: this.#getBalance(),
        onSpin: (bet) => this.#handleSlotSpin(bet),
        onExit: () => this.exitStation()
      });
    } else {
      this.#initBlackjackTableFrame();
      this.#bjPhase = 'betting';
      this.#bjDeck = [];
      this.#bjPlayerHand = [];
      this.#bjDealerHand = [];
      this.#ui.openBlackjack({
        balance: this.#getBalance(),
        onDeal: (bet) => this.#handleBlackjackDeal(bet),
        onHit: () => this.#handleBlackjackHit(),
        onStand: () => this.#handleBlackjackStand(),
        onDouble: () => this.#handleBlackjackDouble(),
        onExit: () => this.exitStation()
      });
    }
  }

  exitStation() {
    if (this.#state === 'idle' || this.#state === 'exiting') return;

    const rigRoot = this.#player?.getRig?.()?.getRoot?.();
    if (rigRoot) rigRoot.visible = true;
    this.#localRigHidden = false;

    this.#cleanupSessionVisuals();
    this.#ui?.close();
    this.#onActivityChange?.(null);

    this.#camStartPos.copy(this.#camera.position);
    this.#camera.getWorldDirection(this.#tmpVec);
    this.#camStartLookAt.copy(this.#camera.position).addScaledVector(this.#tmpVec, 3.5);

    this.#camElapsed = 0;
    this.#camDuration = 0.45;
    this.#state = 'exiting';
  }

  #forceResetSession(notifyExit) {
    const rigRoot = this.#player?.getRig?.()?.getRoot?.();
    if (rigRoot) rigRoot.visible = true;
    this.#localRigHidden = false;

    this.#cleanupSessionVisuals();
    this.#ui?.close();
    this.#onActivityChange?.(null);

    this.#state = 'idle';
    this.#station = null;
    this.#mode = null;

    this.#player?.setAnimState?.('idle');
    this.#player?.setExternalControl?.(false);
    this.#player?.setCameraOverride?.(false);
    this.#input?.setControlsLocked?.(false);
    if (notifyExit) this.#onExit?.();
  }

  #finishExit() {
    this.#state = 'idle';
    this.#station = null;
    this.#mode = null;

    this.#player?.setAnimState?.('idle');
    this.#player?.setExternalControl?.(false);
    this.#player?.setCameraOverride?.(false);
    this.#input?.setControlsLocked?.(false);
    this.#onExit?.();
  }

  isActive() {
    return this.#state !== 'idle';
  }

  isInSession() {
    return this.#state === 'entering' || this.#state === 'playing';
  }

  getActiveActivity() {
    return this.isInSession() && this.#station ? this.#station.id : null;
  }

  // =========================================================================
  // MECÁNICA 1: TRAGAPERRAS EN PRIMERA PERSONA
  // =========================================================================

  #getSlotSymbols(station) {
    if (Array.isArray(station?.symbols) && station.symbols.length > 0) {
      return station.symbols.map((s) => (typeof s === 'string' ? s : (s?.id || s?.key || s?.name || 'gem')));
    }
    if (Array.isArray(station?.reelSymbols) && station.reelSymbols.length > 0) {
      return station.reelSymbols.map((s) => (typeof s === 'string' ? s : (s?.id || s?.key || s?.name || 'gem')));
    }
    return [...DEFAULT_SLOT_SYMBOLS];
  }

  #getReelTargetAngle(station, symIdx, symCount) {
    if (typeof station?.getReelAngleForSymbol === 'function') {
      return station.getReelAngleForSymbol(symIdx);
    }
    return (symIdx / Math.max(1, symCount)) * Math.PI * 2;
  }

  #isJackpotSymbol(symId) {
    const lower = String(symId).toLowerCase();
    return lower === 'crown' || lower === 'seven' || lower === 'corona' || lower === '7';
  }

  #handleSlotSpin(bet) {
    if (!this.isInSession() || this.#mode !== 'slots' || this.#slotsSpin) return;
    if (![10, 25, 50].includes(bet)) return;

    if (this.#coinSystem && !this.#coinSystem.spendCoins(bet)) {
      this.#audio?.playMiss?.();
      this.#ui.setBalance(this.#getBalance());
      this.#ui.setSlotsState({
        spinning: false,
        bet,
        resultText: 'No tienes suficientes monedas para esta apuesta.',
        isBigWin: false
      });
      return;
    }

    this.#ui.setBalance(this.#getBalance());
    this.#ui.setSlotsState({
      spinning: true,
      bet,
      resultText: 'Tirando de la palanca real...',
      isBigWin: false
    });

    const symbols = this.#getSlotSymbols(this.#station);
    const symCount = symbols.length;
    const targetIndices = [
      Math.floor(Math.random() * symCount),
      Math.floor(Math.random() * symCount),
      Math.floor(Math.random() * symCount)
    ];

    const reels = Array.isArray(this.#station?.reels) ? this.#station.reels : [];
    const targetAngles = targetIndices.map((idx) => this.#getReelTargetAngle(this.#station, idx, symCount));

    this.#ensureFirstPersonArm();

    this.#slotsSpin = {
      bet,
      elapsed: 0,
      leverSoundPlayed: false,
      symbols,
      targetIndices,
      targetAngles,
      stopTimes: [1.15, 1.65, 2.20],
      decelDur: 0.48,
      decelStartAngles: [null, null, null],
      decelEndAngles: [0, 0, 0],
      stopped: [false, false, false],
      spinSpeeds: [20.5, 22.0, 23.5],
      lastAngles: reels.map((r) => r?.rotation?.x ?? 0)
    };
  }

  #ensureFirstPersonArm() {
    this.#removeFirstPersonArm();

    const ap = this.#player?.getAppearance?.() || CatalogData.getDefaultAppearance();
    const skinHex = CatalogData.getSkinTone(ap.skinId).hex;
    const outfit = CatalogData.getOutfit(ap.outfitId);

    const sleeveMat = new THREE.MeshStandardMaterial({
      color: outfit.primary,
      roughness: 0.45,
      metalness: 0.08
    });
    sleeveMat.userData.preserveRoughness = true;

    const cuffMat = new THREE.MeshStandardMaterial({
      color: outfit.accent ?? 0xf0be74,
      roughness: 0.35,
      metalness: 0.52
    });
    cuffMat.userData.preserveRoughness = true;

    const skinMat = new THREE.MeshStandardMaterial({
      color: skinHex,
      roughness: 0.45,
      metalness: 0.02
    });
    skinMat.userData.preserveRoughness = true;

    const group = new THREE.Group();

    // Manga real (desde el hombro/codo hacia la muñeca en eje -Z local)
    const sleeveGeo = new THREE.CylinderGeometry(0.042, 0.056, 0.25, 14);
    sleeveGeo.rotateX(Math.PI / 2);
    const sleeveMesh = new THREE.Mesh(sleeveGeo, sleeveMat);
    sleeveMesh.position.set(0, 0, 0.22);
    group.add(sleeveMesh);

    // Puño dorado en la muñeca
    const cuffGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.024, 14);
    cuffGeo.rotateX(Math.PI / 2);
    const cuffMesh = new THREE.Mesh(cuffGeo, cuffMat);
    cuffMesh.position.set(0, 0, 0.095);
    group.add(cuffMesh);

    // Antebrazo / muñeca
    const forearmGeo = new THREE.CylinderGeometry(0.032, 0.038, 0.11, 14);
    forearmGeo.rotateX(Math.PI / 2);
    const forearmMesh = new THREE.Mesh(forearmGeo, skinMat);
    forearmMesh.position.set(0, 0, 0.045);
    group.add(forearmMesh);

    // Mano (palma + dedos curvados listos para agarrar el pomo)
    const palmGeo = new THREE.BoxGeometry(0.064, 0.044, 0.072);
    const palmMesh = new THREE.Mesh(palmGeo, skinMat);
    palmMesh.position.set(0, 0, -0.02);
    group.add(palmMesh);

    const fingersGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.062, 12);
    fingersGeo.rotateZ(Math.PI / 2);
    const fingersMesh = new THREE.Mesh(fingersGeo, skinMat);
    fingersMesh.position.set(0, -0.012, -0.054);
    group.add(fingersMesh);

    this.#armGroup = group;
    this.#armMats = [sleeveMat, cuffMat, skinMat];
    this.#armGeos = [sleeveGeo, cuffGeo, forearmGeo, palmGeo, fingersGeo];
    this.#scene.add(group);
  }

  #removeFirstPersonArm() {
    if (this.#armGroup) {
      this.#scene?.remove(this.#armGroup);
      this.#armGroup = null;
    }
    for (const g of this.#armGeos) g.dispose();
    for (const m of this.#armMats) m.dispose();
    this.#armGeos.length = 0;
    this.#armMats.length = 0;
  }

  #getLeverKnobWorldPos(leverAngle, out = this.#tmpKnobPos) {
    const station = this.#station;
    if (!station?.group) {
      return out.copy(this.#camTargetLookAt);
    }
    if (station.leverGrabLocal) {
      toVec3(station.leverGrabLocal, this.#tmpVec2);
    } else {
      this.#tmpVec2.set(0.55, 1.4, 0.18);
    }
    if (station.leverPivot) {
      const pivotLocal = station.leverPivot.position;
      this.#tmpPivotOffset.copy(this.#tmpVec2).sub(pivotLocal);
      this.#tmpPivotOffset.applyAxisAngle(this.#xAxis, leverAngle);
      out.copy(pivotLocal).add(this.#tmpPivotOffset);
      return station.group.localToWorld(out);
    }
    out.copy(this.#tmpVec2);
    return station.group.localToWorld(out);
  }

  #updateSlotSpin(dt) {
    const spin = this.#slotsSpin;
    if (!spin) return;

    spin.elapsed += dt;
    const t = spin.elapsed;

    // 1. Palanca y brazo en primera persona (0 -> 0.68 s)
    let leverAngle = 0;
    if (t <= 0.18) {
      leverAngle = 0;
    } else if (t <= 0.44) {
      if (!spin.leverSoundPlayed) {
        spin.leverSoundPlayed = true;
        this.#audio?.playLeverPull?.();
      }
      const p = (t - 0.18) / 0.26;
      leverAngle = 1.05 * easeInOutCubic(p);
    } else if (t <= 0.68) {
      const p = (t - 0.44) / 0.24;
      leverAngle = 1.05 * (1 - easeOutCubic(p));
    } else {
      leverAngle = 0;
    }

    if (this.#station?.leverPivot) {
      this.#station.leverPivot.rotation.x = leverAngle;
    }

    if (this.#armGroup) {
      this.#tmpRight.set(1, 0, 0).applyQuaternion(this.#camera.quaternion);
      this.#tmpUp.set(0, 1, 0).applyQuaternion(this.#camera.quaternion);
      this.#tmpFwd.set(0, 0, -1).applyQuaternion(this.#camera.quaternion);

      this.#tmpRestPos
        .copy(this.#camera.position)
        .addScaledVector(this.#tmpRight, 0.30)
        .addScaledVector(this.#tmpUp, -0.28)
        .addScaledVector(this.#tmpFwd, 0.38);

      if (t <= 0.18) {
        const reach = easeOutCubic(t / 0.18);
        const knob = this.#getLeverKnobWorldPos(0, this.#tmpKnobPos);
        this.#armGroup.position.lerpVectors(this.#tmpRestPos, knob, reach);
        this.#tmpLookTarget.copy(knob).addScaledVector(this.#tmpFwd, 0.2);
        this.#armGroup.lookAt(this.#tmpLookTarget);
      } else if (t <= 0.46) {
        const knob = this.#getLeverKnobWorldPos(leverAngle, this.#tmpKnobPos);
        this.#armGroup.position.copy(knob);
        this.#tmpLookTarget
          .copy(knob)
          .addScaledVector(this.#tmpFwd, 0.18)
          .addScaledVector(this.#tmpUp, -0.08 * leverAngle);
        this.#armGroup.lookAt(this.#tmpLookTarget);
      } else if (t <= 0.72) {
        const retract = easeInOutCubic((t - 0.46) / 0.26);
        const knob = this.#getLeverKnobWorldPos(leverAngle, this.#tmpKnobPos);
        this.#armGroup.position.lerpVectors(knob, this.#tmpRestPos, retract);
        this.#armGroup.lookAt(knob);
      } else {
        this.#removeFirstPersonArm();
      }
    }

    // 2. Rotación y parada secuencial de los 3 rodillos con rebote elástico
    const reels = Array.isArray(this.#station?.reels) ? this.#station.reels : [];
    const spinStart = 0.22;

    for (let i = 0; i < 3; i++) {
      if (spin.stopped[i]) continue;
      const reel = reels[i];
      const stopT = spin.stopTimes[i];
      const decelStart = stopT - spin.decelDur;

      if (t < spinStart) continue;

      if (t < decelStart) {
        const ramp = Math.min(1, (t - spinStart) / 0.18);
        const angle = (reel?.rotation?.x ?? spin.lastAngles[i]) + spin.spinSpeeds[i] * ramp * dt;
        spin.lastAngles[i] = angle;
        if (reel) reel.rotation.x = angle;
      } else if (t < stopT) {
        if (spin.decelStartAngles[i] === null) {
          const cur = reel?.rotation?.x ?? spin.lastAngles[i];
          spin.decelStartAngles[i] = cur;
          let delta = ((spin.targetAngles[i] - cur) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          if (delta < Math.PI * 1.1) delta += Math.PI * 2;
          spin.decelEndAngles[i] = cur + delta;
        }
        const u = Math.min(1, (t - decelStart) / spin.decelDur);
        const base = 1 - Math.pow(1 - u, 3);
        const bounce = u > 0.72 ? Math.sin(((u - 0.72) / 0.28) * Math.PI) * 0.08 * (1 - u) * 3.2 : 0;
        const angle = spin.decelStartAngles[i] + (spin.decelEndAngles[i] - spin.decelStartAngles[i]) * (base + bounce);
        spin.lastAngles[i] = angle;
        if (reel) reel.rotation.x = angle;
      } else {
        spin.stopped[i] = true;
        if (reel) reel.rotation.x = spin.targetAngles[i];
        this.#audio?.playReelStop?.(i);
      }
    }

    if (spin.stopped[0] && spin.stopped[1] && spin.stopped[2]) {
      this.#resolveSlotOutcome(spin);
      this.#slotsSpin = null;
    }
  }

  #resolveSlotOutcome(spin) {
    const s0 = spin.symbols[spin.targetIndices[0]];
    const s1 = spin.symbols[spin.targetIndices[1]];
    const s2 = spin.symbols[spin.targetIndices[2]];
    const bet = spin.bet;

    const label = (sym) => SYMBOL_LABELS[String(sym).toLowerCase()] || String(sym);

    if (s0 === s1 && s1 === s2 && this.#isJackpotSymbol(s0)) {
      const payout = bet * 15;
      this.#addCoins(payout);
      this.#spawnCoinRain(46);
      this.#casinoDome?.triggerDomeFireworks?.();
      this.#audio?.playWin?.(true);
      this.#audio?.playFireworks?.();
      this.#onBlackjackCelebration?.({ game: 'slots', payout, label: 'JACKPOT IMPERIAL' });
      this.#ui.showCelebrationBanner('👑 ¡JACKPOT IMPERIAL ×15! 👑');
      this.#ui.setSlotsState({
        spinning: false,
        bet,
        resultText: `¡JACKPOT IMPERIAL! Triple ${label(s0)} · +${payout} 🪙`,
        isBigWin: true
      });
    } else if (s0 === s1 && s1 === s2) {
      const payout = bet * 6;
      this.#addCoins(payout);
      this.#spawnCoinRain(28);
      this.#audio?.playWin?.(true);
      this.#ui.setSlotsState({
        spinning: false,
        bet,
        resultText: `¡TRÍO REAL! Triple ${label(s0)} · +${payout} 🪙 (×6)`,
        isBigWin: true
      });
    } else if (s0 === s1 || s1 === s2 || s0 === s2) {
      const payout = bet * 2;
      this.#addCoins(payout);
      this.#audio?.playWin?.(false);
      this.#ui.setSlotsState({
        spinning: false,
        bet,
        resultText: `¡Doble acierto! · +${payout} 🪙 (×2)`,
        isBigWin: false
      });
    } else {
      this.#ui.setSlotsState({
        spinning: false,
        bet,
        resultText: 'Sin premio esta vez. ¡Tira de nuevo para probar suerte! ✨',
        isBigWin: false
      });
    }

    this.#ui.setBalance(this.#getBalance());
  }

  // =========================================================================
  // MECÁNICA 2: BLACKJACK ANIMADO CON CARTAS 3D
  // =========================================================================

  #initBlackjackTableFrame() {
    this.#clearCards();
    this.#bjTableGroup = new THREE.Group();
    if (this.#station?.group) {
      this.#station.group.add(this.#bjTableGroup);
    } else {
      this.#scene.add(this.#bjTableGroup);
    }

    // Orientación de cartas hacia el jugador en espacio local de station.group
    const playerLocal = new THREE.Vector3();
    const lookLocal = new THREE.Vector3();
    toVec3(this.#station?.playerStandPos, playerLocal);
    toVec3(this.#station?.cameraLookAt, lookLocal);
    if (this.#station?.group) {
      this.#station.group.worldToLocal(playerLocal);
      this.#station.group.worldToLocal(lookLocal);
    }

    const dx = playerLocal.x - lookLocal.x;
    const dz = playerLocal.z - lookLocal.z;
    this.#bjYawTowardPlayer = Math.atan2(dx, dz);
    this.#bjForwardLocal.set(Math.sin(this.#bjYawTowardPlayer), 0, Math.cos(this.#bjYawTowardPlayer));
    this.#bjRightLocal.set(Math.cos(this.#bjYawTowardPlayer), 0, -Math.sin(this.#bjYawTowardPlayer));
  }

  #buildShuffledDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank });
      }
    }
    // Fisher-Yates
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }
    return deck;
  }

  #createCardMesh(card) {
    const entry = this.#cardCache.get(`${card.suit}_${card.rank}`);
    const frontMat = entry?.material || this.#cardEdgeMat;

    // BoxGeometry faces: 0:+X, 1:-X, 2:+Y(cara), 3:-Y(reverso), 4:+Z, 5:-Z
    const mats = [
      this.#cardEdgeMat,
      this.#cardEdgeMat,
      frontMat,
      this.#cardBackMat,
      this.#cardEdgeMat,
      this.#cardEdgeMat
    ];

    const holder = new THREE.Group();
    holder.rotation.y = this.#bjYawTowardPlayer;

    const mesh = new THREE.Mesh(this.#cardGeometry, mats);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.rotation.z = Math.PI; // empieza boca abajo
    holder.add(mesh);

    this.#bjTableGroup?.add(holder);
    this.#bjCardMeshes.push(holder);
    return { holder, mesh };
  }

  #getCardTargetPos(owner, index) {
    const origin = owner === 'player'
      ? toVec3(this.#station?.playerCardOriginLocal, new THREE.Vector3(0, 0.92, 0.25))
      : toVec3(this.#station?.dealerCardOriginLocal, new THREE.Vector3(0, 0.92, -0.25));

    const lateralOffset = (index - 0.5) * 0.105;
    const forwardOffset = index * 0.022;
    const stackY = index * 0.0048;

    return origin
      .addScaledVector(this.#bjRightLocal, lateralOffset)
      .addScaledVector(this.#bjForwardLocal, forwardOffset)
      .add(new THREE.Vector3(0, stackY, 0));
  }

  #queueDealAnimation(card, owner, index, faceUp, onLanded) {
    const { holder, mesh } = this.#createCardMesh(card);
    const startPos = toVec3(this.#station?.shoeLocalPos, new THREE.Vector3(0.42, 0.96, -0.18));
    const endPos = this.#getCardTargetPos(owner, index);

    holder.position.copy(startPos);
    this.#audio?.playCardDeal?.();

    const anim = {
      type: 'deal',
      holder,
      mesh,
      startPos,
      endPos,
      faceUp,
      elapsed: 0,
      duration: 0.38,
      onDone: onLanded
    };
    this.#bjAnimations.push(anim);
    return anim;
  }

  #queueFlipReveal(cardObj, onRevealed) {
    this.#audio?.playCardDeal?.();
    this.#bjAnimations.push({
      type: 'flip',
      holder: cardObj.holder,
      mesh: cardObj.mesh,
      baseY: cardObj.holder.position.y,
      elapsed: 0,
      duration: 0.36,
      onDone: onRevealed
    });
  }

  #scheduleStep(delay, fn) {
    this.#bjTimeline.push({ remaining: delay, fn });
  }

  #handleBlackjackDeal(bet) {
    if (!this.isInSession() || this.#mode !== 'blackjack') return;
    if (this.#bjPhase !== 'betting' && this.#bjPhase !== 'result') return;
    if (![10, 25, 50, 100].includes(bet)) return;

    if (this.#coinSystem && !this.#coinSystem.spendCoins(bet)) {
      this.#audio?.playMiss?.();
      this.#ui.setBalance(this.#getBalance());
      this.#ui.setBlackjackState({
        phase: this.#bjPhase,
        bet,
        resultText: 'No tienes suficientes monedas para esta apuesta.',
        isBlackjack: false
      });
      return;
    }

    this.#bjBet = bet;
    this.#ui.setBalance(this.#getBalance());

    this.#clearCards();
    this.#bjDeck = this.#buildShuffledDeck();
    this.#bjPlayerHand = [];
    this.#bjDealerHand = [];
    this.#bjPhase = 'dealing';

    this.#ui.setBlackjackState({
      phase: 'dealing',
      bet: this.#bjBet,
      playerScore: '...',
      dealerScore: '?',
      canDouble: false,
      resultText: 'Repartiendo cartas desde el zapato real...',
      isBlackjack: false
    });

    const p1 = this.#bjDeck.pop();
    const d1 = this.#bjDeck.pop();
    const p2 = this.#bjDeck.pop();
    const d2 = this.#bjDeck.pop();

    this.#bjPlayerHand.push(p1, p2);
    this.#bjDealerHand.push(d1, d2);

    this.#scheduleStep(0.02, () => {
      p1.visual = this.#queueDealAnimation(p1, 'player', 0, true);
    });
    this.#scheduleStep(0.22, () => {
      d1.visual = this.#queueDealAnimation(d1, 'dealer', 0, true);
    });
    this.#scheduleStep(0.42, () => {
      p2.visual = this.#queueDealAnimation(p2, 'player', 1, true);
    });
    this.#scheduleStep(0.62, () => {
      d2.visual = this.#queueDealAnimation(d2, 'dealer', 1, false, () => {
        this.#onInitialDealComplete();
      });
    });
  }

  #onInitialDealComplete() {
    if (!this.isInSession() || this.#mode !== 'blackjack') return;

    const pVal = calcHandValue(this.#bjPlayerHand);
    const dVal = calcHandValue(this.#bjDealerHand);
    const dUp = cardSingleValue(this.#bjDealerHand[0]);

    if (pVal.total === 21 || dVal.total === 21) {
      // Revelar la 2ª carta de la banca antes de liquidar Blackjack natural
      this.#bjPhase = 'dealerTurn';
      this.#ui.setBlackjackState({
        phase: 'dealerTurn',
        bet: this.#bjBet,
        playerScore: pVal.total,
        dealerScore: `${dUp} + ?`,
        canDouble: false,
        resultText: pVal.total === 21 ? '¡Posible Blackjack! Comprobando la banca...' : 'La banca comprueba su carta oculta...'
      });

      this.#scheduleStep(0.18, () => {
        const hole = this.#bjDealerHand[1];
        this.#queueFlipReveal(hole.visual, () => {
          this.#resolveNaturalBlackjack(pVal.total, dVal.total);
        });
      });
      return;
    }

    const canAffordDouble = typeof this.#coinSystem?.canAfford === 'function'
      ? this.#coinSystem.canAfford(this.#bjBet)
      : this.#getBalance() >= this.#bjBet;

    this.#bjPhase = 'playerTurn';
    this.#ui.setBlackjackState({
      phase: 'playerTurn',
      bet: this.#bjBet,
      playerScore: pVal.total,
      dealerScore: `${dUp} + ?`,
      canDouble: canAffordDouble,
      resultText: 'Tu turno: pide carta, plántate o dobla tu apuesta.'
    });
  }

  #resolveNaturalBlackjack(pTotal, dTotal) {
    this.#bjPhase = 'result';
    let resultText = '';
    let isBlackjack = false;

    if (pTotal === 21 && dTotal === 21) {
      this.#addCoins(this.#bjBet);
      resultText = `Empate de Blackjack (21 vs 21). Recuperas ${this.#bjBet} 🪙.`;
    } else if (pTotal === 21) {
      const payout = Math.round(this.#bjBet * 2.5);
      this.#addCoins(payout);
      isBlackjack = true;
      resultText = `¡BLACKJACK NATURAL! Pago 3:2 · +${payout} 🪙`;
      this.#triggerBlackjackCelebration(payout);
    } else {
      this.#audio?.playMiss?.();
      resultText = `La banca tiene Blackjack (21 contra ${pTotal}).`;
    }

    this.#ui.setBalance(this.#getBalance());
    this.#ui.setBlackjackState({
      phase: 'result',
      bet: this.#bjBet,
      playerScore: pTotal,
      dealerScore: dTotal,
      canDouble: false,
      resultText,
      isBlackjack
    });
  }

  #handleBlackjackHit() {
    if (!this.isInSession() || this.#mode !== 'blackjack' || this.#bjPhase !== 'playerTurn') return;

    const card = this.#bjDeck.pop();
    if (!card) return;
    const idx = this.#bjPlayerHand.length;
    this.#bjPlayerHand.push(card);
    this.#bjPhase = 'dealing';

    const dUp = cardSingleValue(this.#bjDealerHand[0]);
    this.#ui.setBlackjackState({
      phase: 'dealing',
      bet: this.#bjBet,
      playerScore: calcHandValue(this.#bjPlayerHand.slice(0, -1)).total,
      dealerScore: `${dUp} + ?`,
      canDouble: false,
      resultText: 'Repartiendo carta...'
    });

    card.visual = this.#queueDealAnimation(card, 'player', idx, true, () => {
      const pVal = calcHandValue(this.#bjPlayerHand);
      if (pVal.total > 21) {
        this.#bjPhase = 'dealerTurn';
        this.#ui.setBlackjackState({
          phase: 'dealerTurn',
          bet: this.#bjBet,
          playerScore: pVal.total,
          dealerScore: `${dUp} + ?`,
          canDouble: false,
          resultText: `Te pasaste con ${pVal.total}...`
        });
        this.#scheduleStep(0.18, () => {
          const hole = this.#bjDealerHand[1];
          this.#queueFlipReveal(hole.visual, () => {
            this.#bjPhase = 'result';
            this.#audio?.playMiss?.();
            this.#ui.setBalance(this.#getBalance());
            this.#ui.setBlackjackState({
              phase: 'result',
              bet: this.#bjBet,
              playerScore: pVal.total,
              dealerScore: calcHandValue(this.#bjDealerHand).total,
              canDouble: false,
              resultText: `Te pasaste (${pVal.total}). Gana la banca.`,
              isBlackjack: false
            });
          });
        });
      } else if (pVal.total === 21) {
        this.#startDealerTurn();
      } else {
        this.#bjPhase = 'playerTurn';
        this.#ui.setBlackjackState({
          phase: 'playerTurn',
          bet: this.#bjBet,
          playerScore: pVal.total,
          dealerScore: `${dUp} + ?`,
          canDouble: false,
          resultText: 'Tu turno: ¿pides otra carta o te plantas?'
        });
      }
    });
  }

  #handleBlackjackDouble() {
    if (!this.isInSession() || this.#mode !== 'blackjack' || this.#bjPhase !== 'playerTurn') return;
    if (this.#bjPlayerHand.length !== 2) return;

    if (this.#coinSystem && !this.#coinSystem.spendCoins(this.#bjBet)) {
      this.#audio?.playMiss?.();
      return;
    }

    this.#bjBet *= 2;
    this.#ui.setBalance(this.#getBalance());

    const card = this.#bjDeck.pop();
    if (!card) return;
    const idx = this.#bjPlayerHand.length;
    this.#bjPlayerHand.push(card);
    this.#bjPhase = 'dealing';

    const dUp = cardSingleValue(this.#bjDealerHand[0]);
    this.#ui.setBlackjackState({
      phase: 'dealing',
      bet: this.#bjBet,
      playerScore: calcHandValue(this.#bjPlayerHand.slice(0, -1)).total,
      dealerScore: `${dUp} + ?`,
      canDouble: false,
      resultText: `¡Apuesta doblada a ${this.#bjBet} 🪙! Repartiendo carta final...`
    });

    card.visual = this.#queueDealAnimation(card, 'player', idx, true, () => {
      const pVal = calcHandValue(this.#bjPlayerHand);
      if (pVal.total > 21) {
        this.#bjPhase = 'dealerTurn';
        this.#scheduleStep(0.18, () => {
          const hole = this.#bjDealerHand[1];
          this.#queueFlipReveal(hole.visual, () => {
            this.#bjPhase = 'result';
            this.#audio?.playMiss?.();
            this.#ui.setBalance(this.#getBalance());
            this.#ui.setBlackjackState({
              phase: 'result',
              bet: this.#bjBet,
              playerScore: pVal.total,
              dealerScore: calcHandValue(this.#bjDealerHand).total,
              canDouble: false,
              resultText: `Te pasaste al doblar (${pVal.total}). Gana la banca.`,
              isBlackjack: false
            });
          });
        });
      } else {
        this.#startDealerTurn();
      }
    });
  }

  #handleBlackjackStand() {
    if (!this.isInSession() || this.#mode !== 'blackjack' || this.#bjPhase !== 'playerTurn') return;
    this.#startDealerTurn();
  }

  #startDealerTurn() {
    this.#bjPhase = 'dealerTurn';
    const pTotal = calcHandValue(this.#bjPlayerHand).total;
    const dUp = cardSingleValue(this.#bjDealerHand[0]);

    this.#ui.setBlackjackState({
      phase: 'dealerTurn',
      bet: this.#bjBet,
      playerScore: pTotal,
      dealerScore: `${dUp} + ?`,
      canDouble: false,
      resultText: 'Turno de la banca: revelando carta oculta...'
    });

    this.#scheduleStep(0.16, () => {
      const hole = this.#bjDealerHand[1];
      this.#queueFlipReveal(hole.visual, () => {
        this.#continueDealerDraw();
      });
    });
  }

  #continueDealerDraw() {
    if (!this.isInSession() || this.#mode !== 'blackjack') return;

    const pTotal = calcHandValue(this.#bjPlayerHand).total;
    const dVal = calcHandValue(this.#bjDealerHand);

    this.#ui.setBlackjackState({
      phase: 'dealerTurn',
      bet: this.#bjBet,
      playerScore: pTotal,
      dealerScore: dVal.total,
      canDouble: false,
      resultText: dVal.total < 17 ? `Banca con ${dVal.total}: pide carta...` : `Banca se planta con ${dVal.total}.`
    });

    if (dVal.total < 17) {
      this.#scheduleStep(0.28, () => {
        const card = this.#bjDeck.pop();
        if (!card) {
          this.#resolveBlackjackHand();
          return;
        }
        const idx = this.#bjDealerHand.length;
        this.#bjDealerHand.push(card);
        card.visual = this.#queueDealAnimation(card, 'dealer', idx, true, () => {
          this.#continueDealerDraw();
        });
      });
    } else {
      this.#scheduleStep(0.24, () => {
        this.#resolveBlackjackHand();
      });
    }
  }

  #resolveBlackjackHand() {
    if (!this.isInSession() || this.#mode !== 'blackjack') return;

    this.#bjPhase = 'result';
    const pTotal = calcHandValue(this.#bjPlayerHand).total;
    const dTotal = calcHandValue(this.#bjDealerHand).total;

    let resultText = '';
    let isBlackjack = false;

    if (dTotal > 21 || pTotal > dTotal) {
      const payout = this.#bjBet * 2;
      this.#addCoins(payout);
      if (pTotal === 21) {
        isBlackjack = true;
        resultText = `¡VICTORIA CON 21 REAL! · +${payout} 🪙`;
        this.#triggerBlackjackCelebration(payout);
      } else {
        this.#audio?.playWin?.(false);
        this.#spawnCoinRain(18);
        resultText = dTotal > 21
          ? `¡La banca se pasó (${dTotal})! Ganas +${payout} 🪙`
          : `¡Victoria! ${pTotal} contra ${dTotal} · +${payout} 🪙`;
      }
    } else if (pTotal === dTotal) {
      this.#addCoins(this.#bjBet);
      resultText = `Empate (${pTotal} vs ${dTotal}). Recuperas ${this.#bjBet} 🪙.`;
    } else {
      this.#audio?.playMiss?.();
      resultText = `La banca gana (${dTotal} contra ${pTotal}).`;
    }

    this.#ui.setBalance(this.#getBalance());
    this.#ui.setBlackjackState({
      phase: 'result',
      bet: this.#bjBet,
      playerScore: pTotal,
      dealerScore: dTotal,
      canDouble: false,
      resultText,
      isBlackjack
    });
  }

  #triggerBlackjackCelebration(payout) {
    this.#casinoDome?.triggerDomeFireworks?.();
    this.#audio?.playFireworks?.();
    this.#audio?.playWin?.(true);
    this.#spawnCoinRain(34);
    this.#ui.showCelebrationBanner('✨ ¡BLACKJACK REAL 21! ✨');
    this.#onBlackjackCelebration?.({ game: 'blackjack', payout });
  }

  #updateBlackjack(dt) {
    if (this.#bjTimeline.length > 0) {
      this.#bjReadyFns.length = 0;
      for (let i = this.#bjTimeline.length - 1; i >= 0; i--) {
        this.#bjTimeline[i].remaining -= dt;
        if (this.#bjTimeline[i].remaining <= 0) {
          this.#bjReadyFns.push(this.#bjTimeline[i].fn);
          this.#bjTimeline.splice(i, 1);
        }
      }
      for (let i = 0; i < this.#bjReadyFns.length; i++) {
        this.#bjReadyFns[i]();
      }
      this.#bjReadyFns.length = 0;
    }

    for (let i = this.#bjAnimations.length - 1; i >= 0; i--) {
      const anim = this.#bjAnimations[i];
      anim.elapsed += dt;
      const u = Math.min(1, anim.elapsed / anim.duration);

      if (anim.type === 'deal') {
        const horiz = easeOutCubic(u);
        anim.holder.position.x = THREE.MathUtils.lerp(anim.startPos.x, anim.endPos.x, horiz);
        anim.holder.position.z = THREE.MathUtils.lerp(anim.startPos.z, anim.endPos.z, horiz);
        anim.holder.position.y = THREE.MathUtils.lerp(anim.startPos.y, anim.endPos.y, horiz) + Math.sin(u * Math.PI) * 0.17;

        if (anim.faceUp) {
          anim.mesh.rotation.z = Math.PI * (1 - easeInOutCubic(u));
          anim.mesh.rotation.x = Math.sin(u * Math.PI) * 0.22;
        } else {
          anim.mesh.rotation.z = Math.PI;
          anim.mesh.rotation.x = Math.sin(u * Math.PI) * 0.12;
        }
      } else if (anim.type === 'flip') {
        anim.holder.position.y = anim.baseY + Math.sin(u * Math.PI) * 0.10;
        anim.mesh.rotation.z = Math.PI * (1 - easeInOutCubic(u));
        anim.mesh.rotation.x = Math.sin(u * Math.PI) * 0.16;
      }

      if (u >= 1) {
        if (anim.type === 'deal') {
          anim.holder.position.copy(anim.endPos);
          anim.mesh.rotation.z = anim.faceUp ? 0 : Math.PI;
          anim.mesh.rotation.x = 0;
        } else if (anim.type === 'flip') {
          anim.holder.position.y = anim.baseY;
          anim.mesh.rotation.z = 0;
          anim.mesh.rotation.x = 0;
        }
        this.#bjAnimations.splice(i, 1);
        anim.onDone?.();
      }
    }
  }

  #clearCards() {
    this.#bjTimeline.length = 0;
    this.#bjAnimations.length = 0;
    for (const holder of this.#bjCardMeshes) {
      this.#bjTableGroup?.remove(holder);
    }
    this.#bjCardMeshes.length = 0;
    if (this.#bjTableGroup) {
      this.#bjTableGroup.parent?.remove(this.#bjTableGroup);
      this.#bjTableGroup = null;
    }
  }

  // =========================================================================
  // LLUVIA DE MONEDAS 3D (VFX)
  // =========================================================================

  #spawnCoinRain(count = 28) {
    if (!this.#coinRainMesh) return;
    const center = this.#camTargetLookAt;
    const dummy = this.#coinDummy;
    const spawnCount = Math.min(count, COIN_RAIN_POOL_SIZE);

    for (let i = 0; i < spawnCount; i++) {
      let slot = null;
      let slotIdx = -1;
      for (let attempt = 0; attempt < COIN_RAIN_POOL_SIZE; attempt++) {
        const idx = (this.#coinCursor + attempt) % COIN_RAIN_POOL_SIZE;
        if (!this.#coinParticles[idx].active) {
          slot = this.#coinParticles[idx];
          slotIdx = idx;
          this.#coinCursor = (idx + 1) % COIN_RAIN_POOL_SIZE;
          break;
        }
      }
      if (!slot) {
        slotIdx = this.#coinCursor;
        slot = this.#coinParticles[slotIdx];
        this.#coinCursor = (this.#coinCursor + 1) % COIN_RAIN_POOL_SIZE;
      }

      slot.active = true;
      slot.x = center.x + (Math.random() - 0.5) * 1.15;
      slot.y = center.y + 0.75 + Math.random() * 0.75;
      slot.z = center.z + (Math.random() - 0.5) * 0.95;
      slot.rx = Math.random() * Math.PI;
      slot.ry = Math.random() * Math.PI;
      slot.rz = Math.random() * Math.PI;
      slot.vx = (Math.random() - 0.5) * 1.1;
      slot.vy = 0.9 + Math.random() * 1.6;
      slot.vz = (Math.random() - 0.5) * 1.1;
      slot.vrx = 4 + Math.random() * 7;
      slot.vry = 3 + Math.random() * 6;
      slot.floorY = center.y - 0.25;
      slot.life = 0;
      slot.maxLife = 1.9 + Math.random() * 0.7;

      dummy.position.set(slot.x, slot.y, slot.z);
      dummy.rotation.set(slot.rx, slot.ry, slot.rz);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.#coinRainMesh.setMatrixAt(slotIdx, dummy.matrix);
    }

    this.#coinRainMesh.instanceMatrix.needsUpdate = true;
    this.#coinRainMesh.visible = true;
  }

  #updateCoinRain(dt) {
    if (!this.#coinRainMesh || !this.#coinRainMesh.visible) return;

    const dummy = this.#coinDummy;
    let activeCount = 0;
    let dirty = false;

    for (let i = 0; i < COIN_RAIN_POOL_SIZE; i++) {
      const p = this.#coinParticles[i];
      if (!p.active) continue;

      dirty = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        this.#coinRainMesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      activeCount++;
      p.vy -= 5.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.vrx * dt;
      p.ry += p.vry * dt;

      if (p.y <= p.floorY && p.vy < 0) {
        p.y = p.floorY;
        p.vy = -p.vy * 0.42;
      }

      const s = p.life > p.maxLife - 0.35 ? Math.max(0.01, (p.maxLife - p.life) / 0.35) : 1;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, p.rz);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      this.#coinRainMesh.setMatrixAt(i, dummy.matrix);
    }

    if (dirty) {
      this.#coinRainMesh.instanceMatrix.needsUpdate = true;
    }
    this.#coinRainMesh.visible = activeCount > 0;
  }

  #clearCoinRain() {
    if (!this.#coinRainMesh) return;
    const dummy = this.#coinDummy;
    let dirty = false;
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < COIN_RAIN_POOL_SIZE; i++) {
      const p = this.#coinParticles[i];
      if (p.active) {
        p.active = false;
        this.#coinRainMesh.setMatrixAt(i, dummy.matrix);
        dirty = true;
      }
    }
    if (dirty) {
      this.#coinRainMesh.instanceMatrix.needsUpdate = true;
    }
    this.#coinRainMesh.visible = false;
  }

  #cleanupSessionVisuals() {
    this.#slotsSpin = null;
    this.#removeFirstPersonArm();
    if (this.#station?.leverPivot) {
      this.#station.leverPivot.rotation.x = 0;
    }
    this.#clearCards();
    this.#clearCoinRain();
  }

  // =========================================================================
  // BUCLE PRINCIPAL DE ACTUALIZACIÓN Y LIMPIEZA
  // =========================================================================

  update(dt) {
    if (this.#state === 'idle') return;
    const step = Math.min(Math.max(dt, 0), 0.05);

    if (this.#state === 'entering') {
      this.#camElapsed += step;
      const t = Math.min(1, this.#camElapsed / this.#camDuration);
      const ease = easeInOutCubic(t);

      this.#camera.position.lerpVectors(this.#camStartPos, this.#camTargetPos, ease);
      this.#tmpLook.lerpVectors(this.#camStartLookAt, this.#camTargetLookAt, ease);
      this.#camera.lookAt(this.#tmpLook);

      if (!this.#localRigHidden && (t >= 0.65 || this.#camera.position.distanceTo(this.#camTargetPos) < 0.65)) {
        const rigRoot = this.#player?.getRig?.()?.getRoot?.();
        if (rigRoot) rigRoot.visible = false;
        this.#localRigHidden = true;
      }

      if (t >= 1) {
        this.#camera.position.copy(this.#camTargetPos);
        this.#camera.lookAt(this.#camTargetLookAt);
        this.#state = 'playing';
      }
    } else if (this.#state === 'playing') {
      this.#camera.position.copy(this.#camTargetPos);
      this.#camera.lookAt(this.#camTargetLookAt);
    } else if (this.#state === 'exiting') {
      this.#camElapsed += step;
      const t = Math.min(1, this.#camElapsed / this.#camDuration);
      const ease = easeInOutCubic(t);

      this.#player?.getThirdPersonCameraPose?.(this.#camTargetPos, this.#camTargetLookAt);
      this.#camera.position.lerpVectors(this.#camStartPos, this.#camTargetPos, ease);
      this.#tmpLook.lerpVectors(this.#camStartLookAt, this.#camTargetLookAt, ease);
      this.#camera.lookAt(this.#tmpLook);

      if (t >= 1) {
        this.#finishExit();
      }
      return;
    }

    if (this.#mode === 'slots') {
      this.#updateSlotSpin(step);
    } else if (this.#mode === 'blackjack') {
      this.#updateBlackjack(step);
    }

    this.#updateCoinRain(step);
  }

  dispose() {
    if (this.#state !== 'idle') {
      this.#forceResetSession(true);
    } else {
      this.#cleanupSessionVisuals();
    }

    if (this.#cardGeometry) {
      this.#cardGeometry.dispose();
      this.#cardGeometry = null;
    }
    if (this.#cardBackTex) {
      this.#cardBackTex.dispose();
      this.#cardBackTex = null;
    }
    if (this.#cardBackMat) {
      this.#cardBackMat.dispose();
      this.#cardBackMat = null;
    }
    if (this.#cardEdgeMat) {
      this.#cardEdgeMat.dispose();
      this.#cardEdgeMat = null;
    }
    for (const entry of this.#cardCache.values()) {
      entry.texture.dispose();
      entry.material.dispose();
    }
    this.#cardCache.clear();

    if (this.#coinRainMesh) {
      this.#scene?.remove(this.#coinRainMesh);
      this.#coinRainMesh = null;
    }
    this.#coinParticles.length = 0;

    if (this.#coinGeo) {
      this.#coinGeo.dispose();
      this.#coinGeo = null;
    }
    if (this.#coinMat) {
      this.#coinMat.dispose();
      this.#coinMat = null;
    }

    this.#ui?.dispose();
    this.#ui = null;
  }
}
