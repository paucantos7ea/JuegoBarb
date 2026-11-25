import * as THREE from 'three';
import { CatalogData } from '../characters/catalog/CatalogData.js';
import { CasinoUI } from '../ui/CasinoUI.js';
import { DEALER_DEAL_LEAD } from './CasinoDomeBuilder.js';

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

// Naipes 3D (proporcionados a la mesa y a la cámara en primera persona)
const CARD_W = 0.14;
const CARD_T = 0.004;
const CARD_D = 0.20;
const CARD_POOL_SIZE = 24;
const PLAYER_CARD_SCALE = 1.12;
const PLAYER_CARD_STEP = 0.118;
const DEALER_CARD_STEP = 0.105;
const SHOE_CARD_YAW = -1.15;
const DEAL_INTERVAL = 0.28;
const DEAL_FLIGHT = 0.34;
const FLIP_TIME = 0.42;
const COLLECT_TIME = 0.26;
const DEALER_DRAW_PAUSE = 0.45;
const OWNER_PLAYER = 0;
const OWNER_DEALER = 1;
const ANIM_NONE = 0;
const ANIM_DEAL = 1;
const ANIM_FLIP = 2;
const ANIM_COLLECT = 3;
const OP_DEAL = 1;
const OP_FLIP = 2;
const OP_CALL = 3;
const OP_COLLECT = 4;
const CB_INITIAL = 1;
const CB_NATURAL = 2;
const CB_AFTER_HIT = 3;
const CB_AFTER_DOUBLE = 4;
const CB_DEALER_LOOP = 5;
const CB_RESOLVE = 6;
const CB_PLAYER_BUST = 7;

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

/** Total de las n primeras cartas de una mano (sin asignaciones). */
function handTotal(hand, n = hand.length) {
  let total = 0;
  let aces = 0;
  for (let i = 0; i < n; i++) {
    const card = hand[i];
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
  return total;
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
  #cardCache = new Map(); // palo+rango -> { texture, material } (dibujado bajo demanda, una sola vez)
  #cardPool = [];
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
  #bjPlayerLanded = 0;
  #bjDealerLanded = 0;
  #bjHoleRevealed = false;
  #bjCanDouble = false;
  #bjInFlight = 0;
  #bjQueue = Array.from({ length: 32 }, () => ({ op: 0, owner: 0, index: 0, faceUp: true, wait: 0, cb: 0 }));
  #bjQueueHead = 0;
  #bjQueueLen = 0;
  #bjStepTimer = 0;
  #slotTmp = { x: 0, y: 0, z: 0, yaw: 0 };
  #uiState = { phase: 'betting', bet: 10, playerScore: '-', dealerScore: '-', canDouble: false, resultText: undefined, isBlackjack: false };

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

    // Geometría ultrafina compartida para todos los naipes 3D
    this.#cardGeometry = new THREE.BoxGeometry(CARD_W, CARD_T, CARD_D);

    // Dorso único compartido (burdeos imperial con filigrana y corona dorada)
    this.#cardBackTex = this.#createCardBackTexture();
    this.#cardBackMat = new THREE.MeshStandardMaterial({ map: this.#cardBackTex, roughness: 0.4, metalness: 0.06 });
    this.#cardBackMat.userData.preserveRoughness = true;
    this.#cardEdgeMat = new THREE.MeshStandardMaterial({ color: 0xf6eedd, roughness: 0.45, metalness: 0.02 });
    this.#cardEdgeMat.userData.preserveRoughness = true;
    this.#buildCardPool();

    // LOD de las Princesas Crupier: referencia viva a la posición del jugador
    this.#casinoDome?.setDealerViewer?.(this.#player?.getPosition?.() ?? null);

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
    const W = 280;
    const H = 400;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const isRed = suit === '♥' || suit === '♦';
    const ink = isRed ? '#b3001b' : '#0d0d0d';
    const suitFont = (px) => `${px}px "Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", Arial, sans-serif`;

    // Marfil cálido + borde dorado sutil (doble filete)
    ctx.fillStyle = '#e2dcd0';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#8a6a2a';
    ctx.lineWidth = 6;
    ctx.strokeRect(9, 9, W - 18, H - 18);
    ctx.strokeStyle = 'rgba(214, 170, 88, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(19, 19, W - 38, H - 38);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    const corner = (x, y, rot) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.font = `bold ${rank === '10' ? 62 : 74}px Georgia, "Times New Roman", serif`;
      ctx.fillText(rank, 0, 0);
      ctx.font = 'bold ' + suitFont(56);
      ctx.fillText(suit, 0, 62);
      ctx.restore();
    };
    corner(48, 58, 0);
    corner(W - 48, H - 58, Math.PI);

    // Palo grande y nítido en el centro (figuras con corona dorada)
    const face = rank === 'J' || rank === 'Q' || rank === 'K';
    if (face) {
      ctx.fillStyle = isRed ? 'rgba(232, 92, 138, 0.10)' : 'rgba(42, 26, 52, 0.07)';
      ctx.fillRect(76, 92, W - 152, H - 184);
      ctx.strokeStyle = '#d6aa58';
      ctx.lineWidth = 3;
      ctx.strokeRect(76, 92, W - 152, H - 184);
      ctx.fillStyle = '#c98f2e';
      ctx.font = suitFont(58);
      ctx.fillText('♛', W / 2, 150);
      ctx.fillStyle = ink;
      ctx.font = 'bold 90px Georgia, "Times New Roman", serif';
      ctx.fillText(rank, W / 2, 222);
      ctx.font = 'bold ' + suitFont(78);
      ctx.fillText(suit, W / 2, 290);
    } else {
      if (rank === 'A') {
        ctx.strokeStyle = 'rgba(214, 170, 88, 0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 84, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.font = 'bold ' + suitFont(rank === 'A' ? 180 : 160);
      ctx.fillText(suit, W / 2, H / 2 + 6);
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

    if (this.#player?.isMounted?.()) {
      this.#player.dismountHorse?.();
    }

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
      this.#resetBlackjackRound();
      this.#casinoDome?.setActiveBlackjackTable?.(station.id);
      station.dealer?.playIdle();
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

    // Recogida rápida de las cartas mientras la cámara sale (vuelven al pool al terminar)
    if (this.#mode === 'blackjack') {
      this.#resetQueue();
      this.#execCollect();
      this.#station?.dealer?.playIdle();
    }
    this.#slotsSpin = null;
    this.#removeFirstPersonArm();
    if (this.#station?.leverPivot) this.#station.leverPivot.rotation.x = 0;
    this.#clearCoinRain();
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
    this.#resetBlackjackRound();
    this.#casinoDome?.setActiveBlackjackTable?.(null);
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
  // MECÁNICA 2: BLACKJACK CON PRINCESA CRUPIER Y CARTAS 3D EN EL TAPETE
  // =========================================================================

  /** Material de la cara frontal (caché global: cada naipe se dibuja una sola vez, bajo demanda). */
  #getFrontMaterial(card) {
    const key = card.suit + card.rank;
    let entry = this.#cardCache.get(key);
    if (!entry) {
      const texture = this.#createCardFrontTexture(card.suit, card.rank);
      const material = new THREE.MeshBasicMaterial({ map: texture, color: 0xd8d4cc });
      material.userData.preserveRoughness = true;
      entry = { texture, material };
      this.#cardCache.set(key, entry);
    }
    return entry.material;
  }

  /** Object Pool fijo de naipes 3D: geometría y materiales de dorso/canto compartidos. */
  #buildCardPool() {
    for (let i = 0; i < CARD_POOL_SIZE; i++) {
      // Caras de BoxGeometry: 0 +X, 1 -X, 2 +Y (frente), 3 -Y (dorso), 4 +Z, 5 -Z
      const mats = [this.#cardEdgeMat, this.#cardEdgeMat, this.#cardEdgeMat, this.#cardBackMat, this.#cardEdgeMat, this.#cardEdgeMat];
      const mesh = new THREE.Mesh(this.#cardGeometry, mats);
      mesh.name = 'BlackjackCard';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.visible = false;
      this.#cardPool.push({
        mesh,
        mats,
        active: false,
        owner: 0,
        index: 0,
        faceUp: true,
        anim: ANIM_NONE,
        delay: 0,
        t: 0,
        dur: 0,
        sx: 0, sy: 0, sz: 0,
        ex: 0, ey: 0, ez: 0,
        yaw0: 0, yaw1: 0,
        rz0: 0, rz1: 0,
        arc: 0
      });
    }
  }

  #acquireCard() {
    for (let i = 0; i < this.#cardPool.length; i++) {
      const c = this.#cardPool[i];
      if (!c.active) {
        c.active = true;
        return c;
      }
    }
    return null;
  }

  #releaseCard(c) {
    c.active = false;
    c.anim = ANIM_NONE;
    c.mesh.visible = false;
    c.mesh.removeFromParent();
  }

  #releaseAllCards() {
    for (let i = 0; i < this.#cardPool.length; i++) {
      if (this.#cardPool[i].active) this.#releaseCard(this.#cardPool[i]);
    }
    this.#bjInFlight = 0;
  }

  /** Posición/orientación final de un naipe (marco de cardsContainer). */
  #slotFor(owner, index, out) {
    const st = this.#station;
    const isPlayer = owner === OWNER_PLAYER;
    const row = isPlayer ? st?.playerRowLocal : st?.dealerRowLocal;
    const step = isPlayer ? PLAYER_CARD_STEP : DEALER_CARD_STEP;
    const scale = isPlayer ? PLAYER_CARD_SCALE : 1;
    out.x = (row?.x ?? 0) + index * step;
    out.z = (row?.z ?? 0) + (isPlayer ? (index % 2) * 0.008 : 0);
    // +2 mm por carta: sin z-fighting en el solapamiento
    out.y = (CARD_T * scale) * 0.5 + index * 0.002;
    out.yaw = (((index * 37) % 7) - 3) * 0.011;
    return out;
  }

  // --- Cola de pasos (sin closures: códigos de operación y de continuación) ---

  #pushStep(op, owner = 0, index = 0, faceUp = true, wait = 0, cb = 0) {
    if (this.#bjQueueLen >= this.#bjQueue.length) return;
    const s = this.#bjQueue[(this.#bjQueueHead + this.#bjQueueLen) % this.#bjQueue.length];
    s.op = op;
    s.owner = owner;
    s.index = index;
    s.faceUp = faceUp;
    s.wait = wait;
    s.cb = cb;
    this.#bjQueueLen++;
  }

  #resetQueue() {
    this.#bjQueueHead = 0;
    this.#bjQueueLen = 0;
    this.#bjStepTimer = 0;
  }

  #processQueue(dt) {
    if (this.#bjStepTimer > 0) this.#bjStepTimer -= dt;
    while (this.#bjQueueLen > 0 && this.#bjStepTimer <= 0) {
      const s = this.#bjQueue[this.#bjQueueHead];
      // Las continuaciones esperan a que aterricen todas las cartas en vuelo
      if ((s.op === OP_CALL || s.op === OP_FLIP) && this.#bjInFlight > 0) return;
      this.#bjQueueHead = (this.#bjQueueHead + 1) % this.#bjQueue.length;
      this.#bjQueueLen--;
      this.#bjStepTimer = s.wait;
      const op = s.op;
      const owner = s.owner;
      const index = s.index;
      const faceUp = s.faceUp;
      const cb = s.cb;
      if (op === OP_DEAL) this.#execDeal(owner, index, faceUp);
      else if (op === OP_FLIP) this.#execFlipHole();
      else if (op === OP_COLLECT) this.#execCollect();
      else if (op === OP_CALL) this.#runCallback(cb);
    }
  }

  #execDeal(owner, index, faceUp) {
    const hand = owner === OWNER_PLAYER ? this.#bjPlayerHand : this.#bjDealerHand;
    const card = hand[index];
    const st = this.#station;
    const c = this.#acquireCard();
    if (!card || !c || !st?.cardsContainer) {
      if (c) this.#releaseCard(c);
      this.#onCardLanded(owner);
      return;
    }
    c.mats[2] = this.#getFrontMaterial(card);
    c.owner = owner;
    c.index = index;
    c.faceUp = faceUp;
    card.pool = c;

    const mouth = st.shoeMouthLocal;
    const slot = this.#slotFor(owner, index, this.#slotTmp);
    c.sx = mouth?.x ?? 0.3;
    c.sy = (mouth?.y ?? 0.03) + 0.004;
    c.sz = mouth?.z ?? -0.2;
    c.ex = slot.x;
    c.ey = slot.y;
    c.ez = slot.z;
    c.yaw0 = SHOE_CARD_YAW;
    c.yaw1 = slot.yaw;
    c.rz0 = Math.PI; // sale del zapato boca abajo
    c.rz1 = faceUp ? 0 : Math.PI;
    c.arc = owner === OWNER_PLAYER ? 0.13 : 0.09;
    c.anim = ANIM_DEAL;
    c.delay = DEALER_DEAL_LEAD;
    c.t = 0;
    c.dur = DEAL_FLIGHT;
    const s = owner === OWNER_PLAYER ? PLAYER_CARD_SCALE : 1;
    c.mesh.scale.set(s, 1, s);
    c.mesh.visible = false;
    c.mesh.position.set(c.sx, c.sy, c.sz);
    c.mesh.rotation.set(0, c.yaw0, c.rz0);
    st.cardsContainer.add(c.mesh);
    this.#bjInFlight++;

    // La crupier lleva la mano al zapato y desliza la carta hacia su sitio
    st.dealer?.playDeal(slot.x, slot.z);
    this.#audio?.playCardDeal?.();
  }

  #execFlipHole() {
    const hole = this.#bjDealerHand[1];
    const c = hole?.pool;
    if (!c || !c.active) {
      this.#bjHoleRevealed = true;
      return;
    }
    c.anim = ANIM_FLIP;
    c.delay = 0.16;
    c.t = 0;
    c.dur = FLIP_TIME;
    c.sy = c.mesh.position.y;
    c.rz0 = Math.PI;
    c.rz1 = 0;
    this.#bjInFlight++;
    this.#station?.dealer?.playFlip(c.ex, c.ez);
    this.#audio?.playCardDeal?.();
  }

  /** Recogida rápida hacia la bandeja de descartes; al terminar vuelven al pool. */
  #execCollect() {
    const discard = this.#station?.discardLocal;
    let k = 0;
    for (let i = 0; i < this.#cardPool.length; i++) {
      const c = this.#cardPool[i];
      if (!c.active) continue;
      c.anim = ANIM_COLLECT;
      c.delay = k * 0.025;
      c.t = 0;
      c.dur = COLLECT_TIME;
      c.sx = c.mesh.position.x;
      c.sy = c.mesh.position.y;
      c.sz = c.mesh.position.z;
      c.ex = discard?.x ?? -0.6;
      c.ey = 0.003 + k * 0.002;
      c.ez = discard?.z ?? -0.1;
      c.yaw0 = c.mesh.rotation.y;
      c.yaw1 = 0.35;
      c.rz0 = c.mesh.rotation.z;
      c.rz1 = Math.PI;
      this.#bjInFlight++;
      k++;
    }
    this.#bjHoleRevealed = false;
  }

  #updateCardAnims(dt) {
    for (let i = 0; i < this.#cardPool.length; i++) {
      const c = this.#cardPool[i];
      if (!c.active || c.anim === ANIM_NONE) continue;
      if (c.delay > 0) {
        c.delay -= dt;
        if (c.delay > 0) continue;
      }
      c.mesh.visible = true;
      c.t += dt;
      const u = Math.min(1, c.t / c.dur);
      const m = c.mesh;

      if (c.anim === ANIM_DEAL) {
        // Trayectoria parabólica suave + giro de 180° en Z para aterrizar boca arriba
        const h = easeOutCubic(u);
        m.position.set(
          c.sx + (c.ex - c.sx) * h,
          c.sy + (c.ey - c.sy) * h + Math.sin(u * Math.PI) * c.arc,
          c.sz + (c.ez - c.sz) * h
        );
        const f = easeInOutCubic(u);
        m.rotation.set(Math.sin(u * Math.PI) * 0.22, c.yaw0 + (c.yaw1 - c.yaw0) * h, c.rz0 + (c.rz1 - c.rz0) * f);
      } else if (c.anim === ANIM_FLIP) {
        // Se eleva, gira 180° en el aire y aterriza boca arriba
        m.position.y = c.sy + Math.sin(u * Math.PI) * 0.085;
        m.rotation.x = Math.sin(u * Math.PI) * 0.18;
        m.rotation.z = c.rz0 + (c.rz1 - c.rz0) * easeInOutCubic(u);
      } else if (c.anim === ANIM_COLLECT) {
        const h = easeInOutCubic(u);
        m.position.set(
          c.sx + (c.ex - c.sx) * h,
          c.sy + (c.ey - c.sy) * h + Math.sin(u * Math.PI) * 0.04,
          c.sz + (c.ez - c.sz) * h
        );
        m.rotation.set(0, c.yaw0 + (c.yaw1 - c.yaw0) * h, c.rz0 + (c.rz1 - c.rz0) * h);
      }

      if (u >= 1) {
        const anim = c.anim;
        c.anim = ANIM_NONE;
        this.#bjInFlight = Math.max(0, this.#bjInFlight - 1);
        if (anim === ANIM_DEAL) {
          m.position.set(c.ex, c.ey, c.ez);
          m.rotation.set(0, c.yaw1, c.rz1);
          this.#onCardLanded(c.owner);
        } else if (anim === ANIM_FLIP) {
          m.position.y = c.sy;
          m.rotation.set(0, m.rotation.y, 0);
          this.#bjHoleRevealed = true;
          this.#refreshScores();
        } else {
          this.#releaseCard(c);
        }
      }
    }
  }

  /** El HUD se actualiza justo cuando aterriza cada carta. */
  #onCardLanded(owner) {
    if (owner === OWNER_PLAYER) this.#bjPlayerLanded++;
    else this.#bjDealerLanded++;
    this.#refreshScores();
  }

  #refreshScores() {
    const s = this.#uiState;
    const pN = Math.min(this.#bjPlayerLanded, this.#bjPlayerHand.length);
    s.playerScore = pN > 0 ? handTotal(this.#bjPlayerHand, pN) : '...';
    s.dealerScore = this.#dealerScoreLabel();
    s.phase = this.#bjPhase;
    s.bet = this.#bjBet;
    s.canDouble = this.#bjCanDouble && this.#bjPhase === 'playerTurn';
    s.resultText = undefined;
    s.isBlackjack = false;
    this.#ui?.setBlackjackState(s);
  }

  #dealerScoreLabel() {
    const n = Math.min(this.#bjDealerLanded, this.#bjDealerHand.length);
    if (n === 0) return '?';
    if (!this.#bjHoleRevealed) return n >= 2 ? `${cardSingleValue(this.#bjDealerHand[0])} + ?` : String(cardSingleValue(this.#bjDealerHand[0]));
    return handTotal(this.#bjDealerHand, n);
  }

  #setUI(phase, resultText, isBlackjack = false) {
    this.#bjPhase = phase;
    const s = this.#uiState;
    const pN = Math.min(this.#bjPlayerLanded, this.#bjPlayerHand.length);
    s.phase = phase;
    s.bet = this.#bjBet;
    s.playerScore = pN > 0 ? handTotal(this.#bjPlayerHand, pN) : '-';
    s.dealerScore = this.#dealerScoreLabel();
    s.canDouble = this.#bjCanDouble && phase === 'playerTurn';
    s.resultText = resultText;
    s.isBlackjack = isBlackjack;
    this.#ui?.setBlackjackState(s);
  }

  #runCallback(cb) {
    if (!this.isInSession() || this.#mode !== 'blackjack') return;
    switch (cb) {
      case CB_INITIAL: this.#onInitialDealComplete(); break;
      case CB_NATURAL: this.#resolveNaturalBlackjack(); break;
      case CB_AFTER_HIT: this.#afterPlayerCard(false); break;
      case CB_AFTER_DOUBLE: this.#afterPlayerCard(true); break;
      case CB_DEALER_LOOP: this.#continueDealerDraw(); break;
      case CB_RESOLVE: this.#resolveBlackjackHand(); break;
      case CB_PLAYER_BUST: this.#resolvePlayerBust(); break;
      default: break;
    }
  }

  #buildShuffledDeck() {
    const deck = this.#bjDeck;
    deck.length = 0;
    for (const suit of SUITS) {
      for (const rank of RANKS) deck.push({ suit, rank, pool: null });
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }
    return deck;
  }

  #handleBlackjackDeal(bet) {
    if (!this.isInSession() || this.#mode !== 'blackjack') return;
    if (this.#bjPhase !== 'betting' && this.#bjPhase !== 'result') return;
    if (![10, 25, 50, 100].includes(bet)) return;

    if (this.#coinSystem && !this.#coinSystem.spendCoins(bet)) {
      this.#audio?.playMiss?.();
      this.#ui.setBalance(this.#getBalance());
      this.#setUI(this.#bjPhase, 'No tienes suficientes monedas para esta apuesta.');
      return;
    }

    this.#bjBet = bet;
    this.#ui.setBalance(this.#getBalance());
    this.#resetQueue();
    this.#station?.dealer?.playIdle();

    // Recoge la ronda anterior (vuelve al pool) y reparte la nueva
    let hasCards = false;
    for (let i = 0; i < this.#cardPool.length; i++) hasCards = hasCards || this.#cardPool[i].active;
    if (hasCards) this.#pushStep(OP_COLLECT, 0, 0, true, COLLECT_TIME + 0.12);

    this.#buildShuffledDeck();
    this.#bjPlayerHand.length = 0;
    this.#bjDealerHand.length = 0;
    this.#bjPlayerLanded = 0;
    this.#bjDealerLanded = 0;
    this.#bjHoleRevealed = false;
    this.#bjCanDouble = false;
    this.#bjPlayerHand.push(this.#bjDeck.pop(), this.#bjDeck.pop());
    this.#bjDealerHand.push(this.#bjDeck.pop(), this.#bjDeck.pop());
    this.#setUI('dealing', 'La Princesa Crupier reparte desde el zapato real...');

    // Jugador ↑, banca ↑, jugador ↑, banca ↓ (oculta) cada ~0.28 s
    this.#pushStep(OP_DEAL, OWNER_PLAYER, 0, true, DEAL_INTERVAL);
    this.#pushStep(OP_DEAL, OWNER_DEALER, 0, true, DEAL_INTERVAL);
    this.#pushStep(OP_DEAL, OWNER_PLAYER, 1, true, DEAL_INTERVAL);
    this.#pushStep(OP_DEAL, OWNER_DEALER, 1, false, 0);
    this.#pushStep(OP_CALL, 0, 0, true, 0, CB_INITIAL);
  }

  #onInitialDealComplete() {
    const pTotal = handTotal(this.#bjPlayerHand, this.#bjPlayerHand.length);
    const dTotal = handTotal(this.#bjDealerHand, this.#bjDealerHand.length);
    if (pTotal === 21 || dTotal === 21) {
      this.#setUI('dealerTurn', pTotal === 21 ? '¡Posible Blackjack! La crupier comprueba su carta...' : 'La banca comprueba su carta oculta...');
      this.#pushStep(OP_FLIP, 0, 0, true, 0.1);
      this.#pushStep(OP_CALL, 0, 0, true, 0, CB_NATURAL);
      return;
    }
    this.#bjCanDouble = typeof this.#coinSystem?.canAfford === 'function'
      ? this.#coinSystem.canAfford(this.#bjBet)
      : this.#getBalance() >= this.#bjBet;
    this.#setUI('playerTurn', 'Tu turno: pide carta, plántate o dobla tu apuesta.');
  }

  #resolveNaturalBlackjack() {
    const pTotal = handTotal(this.#bjPlayerHand, this.#bjPlayerHand.length);
    const dTotal = handTotal(this.#bjDealerHand, this.#bjDealerHand.length);
    const dealer = this.#station?.dealer;
    let text;
    let isBJ = false;
    if (pTotal === 21 && dTotal === 21) {
      this.#addCoins(this.#bjBet);
      text = `Empate de Blackjack (21 vs 21). Recuperas ${this.#bjBet} 🪙.`;
      dealer?.playIdle();
    } else if (pTotal === 21) {
      const payout = Math.round(this.#bjBet * 2.5);
      this.#addCoins(payout);
      isBJ = true;
      text = `¡BLACKJACK NATURAL! Pago 3:2 · +${payout} 🪙`;
      this.#triggerBlackjackCelebration(payout);
      dealer?.playCelebrate();
    } else {
      this.#audio?.playMiss?.();
      text = `La banca tiene Blackjack (21 contra ${pTotal}).`;
      dealer?.playBow();
    }
    this.#ui.setBalance(this.#getBalance());
    this.#setUI('result', text, isBJ);
  }

  #handleBlackjackHit() {
    if (!this.isInSession() || this.#mode !== 'blackjack' || this.#bjPhase !== 'playerTurn') return;
    const card = this.#bjDeck.pop();
    if (!card) return;
    this.#bjPlayerHand.push(card);
    this.#bjCanDouble = false;
    // Botones bloqueados mientras la crupier reparte la nueva carta (~0.35 s)
    this.#setUI('dealing', 'Repartiendo carta...');
    this.#pushStep(OP_DEAL, OWNER_PLAYER, this.#bjPlayerHand.length - 1, true, 0);
    this.#pushStep(OP_CALL, 0, 0, true, 0, CB_AFTER_HIT);
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
    this.#bjPlayerHand.push(card);
    this.#bjCanDouble = false;
    this.#setUI('dealing', `¡Apuesta doblada a ${this.#bjBet} 🪙! Carta final...`);
    this.#pushStep(OP_DEAL, OWNER_PLAYER, this.#bjPlayerHand.length - 1, true, 0);
    this.#pushStep(OP_CALL, 0, 0, true, 0, CB_AFTER_DOUBLE);
  }

  #afterPlayerCard(doubled) {
    const pTotal = handTotal(this.#bjPlayerHand, this.#bjPlayerHand.length);
    if (pTotal > 21) {
      this.#setUI('dealerTurn', doubled ? `Te pasaste al doblar (${pTotal})...` : `Te pasaste con ${pTotal}...`);
      this.#pushStep(OP_FLIP, 0, 0, true, 0.1);
      this.#pushStep(OP_CALL, 0, 0, true, 0, CB_PLAYER_BUST);
    } else if (doubled || pTotal === 21) {
      this.#startDealerTurn();
    } else {
      this.#setUI('playerTurn', 'Tu turno: ¿pides otra carta o te plantas?');
    }
  }

  #resolvePlayerBust() {
    const pTotal = handTotal(this.#bjPlayerHand, this.#bjPlayerHand.length);
    this.#audio?.playMiss?.();
    this.#station?.dealer?.playBow();
    this.#ui.setBalance(this.#getBalance());
    this.#setUI('result', `Te pasaste (${pTotal}). Gana la banca.`);
  }

  #handleBlackjackStand() {
    if (!this.isInSession() || this.#mode !== 'blackjack' || this.#bjPhase !== 'playerTurn') return;
    this.#startDealerTurn();
  }

  /** La carta oculta se eleva, gira 180° y aterriza; después la banca juega. */
  #startDealerTurn() {
    this.#setUI('dealerTurn', 'Turno de la banca: la crupier revela su carta oculta...');
    this.#pushStep(OP_FLIP, 0, 0, true, 0.12);
    this.#pushStep(OP_CALL, 0, 0, true, 0, CB_DEALER_LOOP);
  }

  #continueDealerDraw() {
    const dTotal = handTotal(this.#bjDealerHand, this.#bjDealerHand.length);
    if (dTotal < 17) {
      const card = this.#bjDeck.pop();
      if (!card) {
        this.#resolveBlackjackHand();
        return;
      }
      this.#bjDealerHand.push(card);
      this.#setUI('dealerTurn', `Banca con ${dTotal}: la crupier se reparte otra carta...`);
      // Pausa natural antes de cada carta de la banca
      this.#bjStepTimer = Math.max(this.#bjStepTimer, DEALER_DRAW_PAUSE);
      this.#pushStep(OP_DEAL, OWNER_DEALER, this.#bjDealerHand.length - 1, true, 0);
      this.#pushStep(OP_CALL, 0, 0, true, 0, CB_DEALER_LOOP);
    } else {
      this.#setUI('dealerTurn', `La banca se planta con ${dTotal}.`);
      this.#bjStepTimer = Math.max(this.#bjStepTimer, 0.3);
      this.#pushStep(OP_CALL, 0, 0, true, 0, CB_RESOLVE);
    }
  }

  #resolveBlackjackHand() {
    const pTotal = handTotal(this.#bjPlayerHand, this.#bjPlayerHand.length);
    const dTotal = handTotal(this.#bjDealerHand, this.#bjDealerHand.length);
    const dealer = this.#station?.dealer;
    let text;
    let isBJ = false;

    if (dTotal > 21 || pTotal > dTotal) {
      const payout = this.#bjBet * 2;
      this.#addCoins(payout);
      dealer?.playCelebrate();
      if (pTotal === 21) {
        isBJ = true;
        text = `¡VICTORIA CON 21 REAL! · +${payout} 🪙`;
        this.#triggerBlackjackCelebration(payout);
      } else {
        this.#audio?.playWin?.(false);
        this.#spawnCoinRain(18);
        text = dTotal > 21
          ? `¡La banca se pasó (${dTotal})! Ganas +${payout} 🪙`
          : `¡Victoria! ${pTotal} contra ${dTotal} · +${payout} 🪙`;
      }
    } else if (pTotal === dTotal) {
      this.#addCoins(this.#bjBet);
      dealer?.playIdle();
      text = `Empate (${pTotal} vs ${dTotal}). Recuperas ${this.#bjBet} 🪙.`;
    } else {
      this.#audio?.playMiss?.();
      dealer?.playBow();
      text = `La banca gana (${dTotal} contra ${pTotal}).`;
    }
    this.#ui.setBalance(this.#getBalance());
    this.#setUI('result', text, isBJ);
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
    this.#processQueue(dt);
    this.#updateCardAnims(dt);
  }

  #resetBlackjackRound() {
    this.#resetQueue();
    this.#releaseAllCards();
    this.#bjPlayerHand.length = 0;
    this.#bjDealerHand.length = 0;
    this.#bjPlayerLanded = 0;
    this.#bjDealerLanded = 0;
    this.#bjHoleRevealed = false;
    this.#bjCanDouble = false;
    this.#bjPhase = 'betting';
  }

  // =========================================================================
  // LLUVIA DE MONEDAS 3D (VFX)
  // =========================================================================

  #spawnCoinRain(count = 28) {
    if (!this.#coinRainMesh) return;
    const center = this.#camTargetLookAt;
    const floorBase = this.#station?.tableSurfaceY ?? (this.#camTargetLookAt.y - 0.25);
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
      slot.floorY = floorBase;
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
    this.#resetBlackjackRound();
    this.#casinoDome?.setActiveBlackjackTable?.(null);
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

      if (this.#mode === 'blackjack') this.#updateCardAnims(step);
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
    for (const c of this.#cardPool) c.mesh.removeFromParent();
    this.#cardPool.length = 0;

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
