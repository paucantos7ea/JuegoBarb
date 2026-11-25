import * as THREE from 'three';
import { SpringValue } from '../core/SpringValue.js';
import { RIDER_POSE } from '../world/HorseAnatomy.js';
import { RIDER_LEAN_RANGE } from './RidingDrape.js';

const TAU = Math.PI * 2;
const THIGH = 0.44;
const SHIN = 0.45;
const LEG = THIGH + SHIN;
const LOCO = new Set(['walk', 'run', 'jump', 'riding']);
const MAX_SPRING_STEP = 1 / 120;

const clamp = THREE.MathUtils.clamp;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smoothstep = (k) => k * k * (3 - 2 * k);
const lerpTo = (cur, target, k) => cur + (target - cur) * k;

/**
 * Definiciones de emotes [1-4] y micro-gestos en reposo.
 */
export const EMOTE_DEFS = Object.freeze({
  wave: { duration: 2.2, label: 'Saludo Real', fadeIn: 0.25, fadeOut: 0.35 },
  spin: { duration: 1.5, label: 'Giro de Princesa', fadeIn: 0.2, fadeOut: 0.3 },
  curtsy: { duration: 2.4, label: 'Reverencia de Gala', fadeIn: 0.6, fadeOut: 0.65 },
  star: { duration: 2.8, label: 'Pose de Estrella', fadeIn: 0.35, fadeOut: 0.45 }
});

export const GESTURE_DEFS = Object.freeze({
  chest: 2.6,
  tilt: 2.2,
  look: 3.2,
  heel: 2.0
});

const GESTURE_KEYS_ALL = Object.keys(GESTURE_DEFS);
const GESTURE_KEYS_NO_LOOK = GESTURE_KEYS_ALL.filter((id) => id !== 'look');

/**
 * Biblioteca de poses absolutas para el rig estilizado.
 * Convención anatómica (el modelo mira a +Z local):
 *  - Hombro izquierdo en +X: rotation.z > 0 abre el brazo hacia fuera; derecho en -X: z < 0.
 *  - rotation.x < 0 en brazos/piernas lleva el miembro hacia delante; en espinilla, x > 0 flexiona la rodilla.
 *  - spineX > 0 inclina el torso hacia delante desde la cintura; headX > 0 baja la mirada.
 */
export class PoseLibrary {
  static reset(p, baseZ) {
    p.bodyX = 0; p.bodyY = 0; p.bodyRotX = 0; p.bodyRotY = 0; p.bodyRotZ = 0;
    p.spineX = 0; p.spineY = 0; p.spineZ = 0;
    p.headX = 0; p.headY = 0; p.headZ = 0;
    p.lArmX = 0; p.lArmZ = baseZ; p.rArmX = 0; p.rArmZ = -baseZ;
    p.lForeX = -0.22; p.lForeZ = 0.08; p.rForeX = -0.22; p.rForeZ = -0.08;
    p.lLegX = 0; p.rLegX = 0; p.lLegZ = 0; p.rLegZ = 0; p.lShinX = 0; p.rShinX = 0; p.lShinZ = 0; p.rShinZ = 0;
    p.breath = 0; p.flare = 0;
    return p;
  }

  /** Envolvente suave 0→1→0 con entrada y salida graduales. */
  static envelope(k, dur, fadeIn = 0.22, fadeOut = 0.3) {
    const t = k * dur;
    const w = Math.min(1, t / fadeIn, (dur - t) / fadeOut);
    return smoothstep(Math.max(0, w));
  }

  /** Mezcla parcial hacia otra pose con peso w (0..1). */
  static blend(p, partial, w) {
    if (w <= 0) return;
    for (const key in partial) p[key] += (partial[key] - p[key]) * w;
  }

  /** Reposo vivo: respiración, desplazamiento de peso, mirada suave y brazos fuera de la falda. */
  static idle(p, t, baseZ) {
    const breath = Math.sin(t * 1.9);
    const sway = Math.sin(t * 0.52);
    p.breath = breath;
    p.bodyX = sway * 0.012;
    p.bodyRotZ = sway * 0.014;
    p.spineZ = -sway * 0.024;
    p.spineX = breath * 0.008;
    p.headZ = sway * 0.012;
    p.headY = Math.sin(t * 0.37) * 0.16 + Math.sin(t * 0.91 + 1.3) * 0.05;
    p.headX = Math.sin(t * 0.61) * 0.035 - breath * 0.012;
    p.lArmZ = baseZ + breath * 0.018 + sway * 0.012;
    p.rArmZ = -(baseZ + breath * 0.018 - sway * 0.012);
    p.lArmX = Math.sin(t * 0.52 + 0.8) * 0.03;
    p.rArmX = Math.sin(t * 0.52 + 2.4) * 0.03;
    // El peso pasa a una pierna y la otra rodilla se relaja
    p.rLegX = -Math.max(0, sway) * 0.05; p.rShinX = Math.max(0, sway) * 0.11;
    p.lLegX = -Math.max(0, -sway) * 0.05; p.lShinX = Math.max(0, -sway) * 0.11;
  }

  /** Caminar/correr: balanceo cruzado, rodilla flexionada en el avance, torsión y rebote. */
  static locomotion(p, t, baseZ, run) {
    const ph = t * (run ? 10.4 : 7.0);
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const stride = run ? 0.66 : 0.36;
    const arm = run ? 0.62 : 0.38;
    p.lLegX = s * stride; p.rLegX = -s * stride;
    p.lShinX = Math.max(0, -c) * (run ? 1.0 : 0.55) + 0.04;
    p.rShinX = Math.max(0, c) * (run ? 1.0 : 0.55) + 0.04;
    p.lArmX = -s * arm; p.rArmX = s * arm;
    p.lArmZ = baseZ + (run ? 0.08 : 0.03); p.rArmZ = -p.lArmZ;
    p.lForeX = (run ? -0.85 : -0.3) - Math.max(0, s) * 0.22;
    p.rForeX = (run ? -0.85 : -0.3) - Math.max(0, -s) * 0.22;
    p.bodyY = Math.max(0, Math.cos(ph * 2)) * (run ? 0.035 : 0.012);
    p.bodyRotX = run ? 0.035 : 0;
    p.spineX = run ? 0.13 : 0.035;
    p.spineY = -s * (run ? 0.1 : 0.06);
    p.spineZ = c * 0.02;
    p.headY = s * (run ? 0.07 : 0.045);
    p.headX = -p.spineX * 0.55;
    return s;
  }

  /** Salto de bailarina: brazos arriba y afuera, rodillas recogidas, torso ligeramente arqueado. */
  static jump(p, baseZ) {
    Object.assign(p, {
      spineX: -0.06, headX: -0.08,
      lArmX: -0.28, rArmX: -0.28, lArmZ: baseZ + 1.42, rArmZ: -(baseZ + 1.42),
      lForeX: -0.35, rForeX: -0.35, lForeZ: 0.32, rForeZ: -0.32,
      lLegX: -0.38, lShinX: 0.72, rLegX: 0.12, rShinX: 0.5, flare: 0.05
    });
  }

  /**
   * Monta a caballo: caderas abiertas lo justo para rodear el barril, rodillas flexionadas hacia
   * los estribos (pose calculada contra el volumen real del caballo), espalda erguida y codos
   * flexionados con las manos adelantadas sobre las riendas. `r` = estado físico del jinete.
   */
  static riding(p, t, r) {
    const P = RIDER_POSE;
    p.lLegX = P.legX; p.rLegX = P.legX;
    p.lLegZ = P.legZ; p.rLegZ = -P.legZ;
    p.lShinX = P.shinX; p.rShinX = P.shinX;
    p.lShinZ = P.shinZ; p.rShinZ = -P.shinZ;
    p.flare = 0;

    p.bodyY = r.residual + r.hop;
    p.spineX = r.lean;
    p.spineZ = r.inLean;
    p.headX = -r.lean * 0.65 + Math.sin(t * 0.7) * 0.015;
    p.headZ = -r.bank * 0.45;
    p.headY = r.speed < 0.5 ? Math.sin(t * 0.45) * 0.12 : 0;

    // Manos sobre las riendas: acompañan el rebote con los codos
    const give = r.residual * 2.2;
    p.lArmX = P.armX + give; p.rArmX = P.armX + give;
    p.lArmZ = P.armZ; p.rArmZ = -P.armZ;
    p.lForeX = P.foreX - give * 1.3; p.rForeX = P.foreX - give * 1.3;
    p.lForeZ = P.foreZ; p.rForeZ = -P.foreZ;
    p.breath = Math.sin(t * 1.9) * 0.5;
  }

  /** Limpia un objeto de pose parcial reutilizable sin reasignar. */
  static #clearOut(out) {
    for (const key in out) delete out[key];
    return out;
  }

  /** Aterrizaje amortiguado (se mezcla con una envolvente corta). */
  static landing(baseZ, out = {}) {
    PoseLibrary.#clearOut(out);
    out.lLegX = -0.32; out.lShinX = 0.58; out.rLegX = -0.12; out.rShinX = 0.52;
    out.spineX = 0.1; out.headX = 0.05;
    out.lArmZ = baseZ + 0.28; out.rArmZ = -(baseZ + 0.28);
    out.lArmX = -0.12; out.rArmX = -0.12;
    return out;
  }

  static dance(p, t) {
    const step = Math.sin(t * 4.8);
    Object.assign(p, {
      bodyY: Math.abs(Math.sin(t * 6.0)) * 0.05, bodyRotY: Math.sin(t * 3.0) * 0.14,
      lArmZ: 0.78 + step * 0.22, rArmZ: -(0.78 + Math.cos(t * 4.8) * 0.22),
      lArmX: -0.2 + Math.cos(t * 4.8) * 0.14, rArmX: -0.2 + step * 0.14,
      lForeX: -0.36, rForeX: -0.36, lLegX: step * 0.24, rLegX: -step * 0.24,
      lShinX: Math.max(0, -step * 0.26), rShinX: Math.max(0, step * 0.26),
      spineZ: Math.sin(t * 2.4) * 0.05, headY: Math.sin(t * 3.0) * 0.15,
      headZ: Math.sin(t * 2.4) * 0.05, flare: Math.abs(step) * 0.05, breath: Math.sin(t * 2.4)
    });
  }

  /** Pose de pasarela (minijuegos). */
  static pose(p, t, baseZ, isMale) {
    Object.assign(p, {
      bodyY: 0.01, bodyRotY: 0.08, lArmZ: baseZ + 0.14, lArmX: -0.1, lForeX: -0.36,
      rArmZ: isMale ? -(baseZ + 0.14) : -0.96, rArmX: isMale ? -0.16 : -0.3, rForeX: -0.32,
      lLegX: 0.1, rLegX: -0.14, lShinX: 0.08, rShinX: 0.16, spineZ: -0.03,
      headY: Math.sin(t * 2.0) * 0.12 - 0.05, headZ: 0.04
    });
  }

  /** Conversación de NPC: gestos de mano expresivos, asentimientos y leve torsión. */
  static talk(p, t, baseZ) {
    const g = Math.sin(t * 2.3);
    const g2 = Math.sin(t * 3.4 + 1.1);
    const open = Math.max(0, Math.sin(t * 0.9));
    p.rArmX = -0.42 + g * 0.12; p.rArmZ = -(baseZ + 0.05);
    p.rForeX = -1.05 + g2 * 0.22; p.rForeZ = 0.16 + g * 0.08;
    p.lArmX = -0.3 * open; p.lForeX = -0.22 - 0.6 * open; p.lForeZ = 0.08 - 0.22 * open;
    p.headX += Math.sin(t * 2.7) * 0.045;
    p.headZ += Math.sin(t * 1.3) * 0.06;
    p.spineY += g * 0.04;
  }

  /** Pose parcial de cada emote en el progreso k (0..1) y tiempo local te (s). */
  static emote(id, k, te, baseZ, out = {}) {
    PoseLibrary.#clearOut(out);
    switch (id) {
      case 'wave':
        out.rArmZ = -2.25; out.rArmX = -0.35; out.rForeX = -0.3;
        out.rForeZ = -0.15 + Math.sin(te * 11) * 0.42;
        out.lArmZ = baseZ + 0.06; out.headZ = 0.09; out.headY = -0.15; out.spineZ = 0.05;
        return out;
      case 'spin':
        out.lArmZ = 1.15; out.rArmZ = -1.15; out.lArmX = -0.12; out.rArmX = -0.12;
        out.lForeX = -0.2; out.rForeX = -0.2; out.lForeZ = 0.25; out.rForeZ = -0.25;
        out.headX = -0.06; out.lShinX = 0.12; out.rLegX = 0.1; out.rShinX = 0.32;
        out.bodyY = Math.sin(Math.PI * k) * 0.03; out.flare = Math.sin(Math.PI * k) * 0.17;
        return out;
      case 'curtsy':
        out.spineX = 0.24; out.headX = 0.26; out.headY = 0;
        out.lLegX = -0.28; out.lShinX = 0.3; out.rLegX = 0.18; out.rShinX = 0.2;
        out.lArmZ = baseZ + 0.5; out.rArmZ = -(baseZ + 0.5); out.lArmX = -0.12; out.rArmX = -0.12;
        out.lForeX = -0.12; out.rForeX = -0.12; out.lForeZ = 0.22; out.rForeZ = -0.22; out.flare = 0.04;
        return out;
      case 'star':
        out.lArmZ = 0.78; out.lArmX = 0.12; out.lForeX = -0.35; out.lForeZ = -1.5;
        out.rArmZ = -1.35; out.rArmX = -0.45; out.rForeX = -0.55; out.rForeZ = -0.35;
        out.headZ = -0.15; out.headY = 0.18; out.headX = -0.04; out.spineZ = -0.05; out.spineY = 0.12;
        out.bodyRotY = 0.18; out.bodyX = 0.02; out.rLegX = -0.14; out.rShinX = 0.28; out.lLegX = 0.04;
        return out;
      default:
        return out;
    }
  }

  /** Micro-gestos ocasionales en reposo. */
  static gesture(id, te, out = {}) {
    PoseLibrary.#clearOut(out);
    switch (id) {
      case 'chest':
        out.rArmX = -0.62; out.rArmZ = -0.12; out.rForeX = -1.55; out.rForeZ = 0.75; out.headZ = 0.06; out.headX = 0.04;
        return out;
      case 'tilt':
        out.headZ = 0.16; out.headY = 0.1; out.spineZ = -0.03;
        return out;
      case 'look':
        out.headY = Math.sin(te * 2.1) * 0.45; out.headX = -0.04;
        return out;
      case 'heel':
        out.rLegX = -0.08; out.rShinX = 0.24; out.bodyRotZ = 0.03; out.headZ = -0.06;
        return out;
      default:
        return out;
    }
  }
}

/**
 * Muelle amortiguado de 2 ejes (x/z) integrado con Euler semi-implícito en sub-pasos fijos.
 */
class Spring2 {
  x = 0; z = 0; vx = 0; vz = 0;
  #k; #c;

  constructor(stiffness, damping) {
    this.#k = stiffness;
    this.#c = damping;
  }

  step(tx, tz, dt) {
    let remaining = dt;
    while (remaining > 1e-6) {
      const h = Math.min(MAX_SPRING_STEP, remaining);
      this.vx += ((tx - this.x) * this.#k - this.vx * this.#c) * h;
      this.vz += ((tz - this.z) * this.#k - this.vz * this.#c) * h;
      this.x += this.vx * h;
      this.z += this.vz * h;
      remaining -= h;
    }
  }

  reset() {
    this.x = this.z = this.vx = this.vz = 0;
  }
}

/**
 * Física secundaria ligera para el pelo largo y el vuelo de la falda.
 */
class SpringMotion {
  #skirt = new Spring2(85, 7.2);
  #hair = new Spring2(46, 5.0);
  #flare = new Spring2(70, 8.5);

  update(dt, m) {
    const falling = Math.max(0, -m.vy);
    const skirtX = clamp(m.fwd * 0.011, -0.08, 0.13);
    const skirtZ = clamp(-m.yawRate * 0.05 - m.side * 0.012, -0.2, 0.2) + m.sway * 0.035;
    this.#skirt.step(skirtX, skirtZ, dt);

    const hairCap = m.riding ? 0.52 : 0.36;
    const flutter = m.riding ? Math.sin(m.t * 9.5) * 0.035 * clamp(m.fwd / 15, 0, 1) : 0;
    const hairX = clamp(m.fwd * (m.riding ? 0.032 : 0.028) + falling * 0.022 + flutter, -0.06, hairCap);
    const hairZ = clamp(-m.yawRate * 0.07 - m.side * 0.025, -0.24, 0.24);
    this.#hair.step(hairX, hairZ, dt);

    this.#flare.step(clamp(m.flare + falling * 0.012 + Math.abs(m.yawRate) * 0.012, 0, 0.2), 0, dt);
  }

  /** rideT ∈ [0,1]: a caballo la falda deja el vuelo rígido (lo gestionan los morphs de montar). */
  apply(skirtPivot, hairSwing, rideT = 0) {
    if (skirtPivot) {
      const free = 1 - rideT;
      const f = Math.max(-0.02, this.#flare.x) * free;
      skirtPivot.rotation.set(this.#skirt.x * free, 0, this.#skirt.z * free);
      skirtPivot.scale.set(1 + f, 1 - f * 0.3, 1 + f);
    }
    if (hairSwing) {
      hairSwing.rotation.set(clamp(this.#hair.x, -0.1, 0.55), 0, clamp(this.#hair.z, -0.28, 0.28));
    }
  }

  reset() {
    this.#skirt.reset();
    this.#hair.reset();
    this.#flare.reset();
  }
}

/**
 * Animador expresivo del rig: reposo vivo (respiración, peso, mirada, parpadeo y micro-gestos),
 * locomoción con inclinación en giros, salto de bailarina con aterrizaje amortiguado,
 * emotes, conversación, anclaje de pies al suelo y física secundaria en pelo y falda.
 */
export class CharacterAnimator {
  static EMOTES = EMOTE_DEFS;

  #b; #isMale; #baseZ = 0.32; #t = Math.random() * 10;
  #pose = {}; #prevState = 'idle'; #landT = -1;
  #emote = null; #emoteSeq = 0;
  #gesture = null; #gestureTimer = 3 + Math.random() * 4;
  #blinkTimer = 1 + Math.random() * 3; #blinkT = -1; #pendingBlink = false;
  #lookTarget = null; #lookW = 0;
  #springs = new SpringMotion();
  #prevPos = new THREE.Vector3(); #vel = new THREE.Vector3(); #velS = new THREE.Vector3();
  #prevYaw = 0; #yawRate = 0; #hasPrev = false; #spinAngle = 0; #smoothYaw = 0; #breath = 0;
  #torsoBase = new THREE.Vector3(1, 1, 1); #shoulderY = 0;
  #motionOut = { fwd: 0, side: 0, vy: 0, spinRate: 0 };
  #springIn = { fwd: 0, side: 0, vy: 0, yawRate: 0, sway: 0, flare: 0, riding: false, t: 0 };
  // Montura: transición de la falda, muelle vertical del jinete, inclinación y pesos de la tela
  #ride = { on: false, k: 0, T: 0, hopT: 1, data: null, resetY: true };
  #rideState = { residual: 0, hop: 0, lean: 0, inLean: 0, bank: 0, speed: 0 };
  #riderY = new SpringValue(320, 30);
  #lean = new SpringValue(55, 11);
  #rideLift = new SpringValue(30, 6.5);
  #rideOut = new SpringValue(40, 7);
  #wavePhase = 0;
  #rideWeights = { T: 0, lift: 0, waveS: 0, waveC: 0, outPos: 0, outNeg: 0 };
  #partialPose = {};

  constructor(bones, isMale = false) {
    this.#b = bones;
    this.#isMale = isMale;
    if (bones.torso) this.#torsoBase.copy(bones.torso.scale);
    this.#shoulderY = bones.lShoulder.position.y;
    PoseLibrary.reset(this.#pose, this.#baseZ);
  }

  setBaseArmZ(z) { this.#baseZ = z; }

  /**
   * Activa/desactiva el modo montura. `horseData` es el objeto prealocado del caballo
   * (rebote, cabeceo, banking, velocidad, aceleración, vy, giro, marcha); se lee cada fotograma.
   */
  setRidingMode(isRiding, horseData = null) {
    const r = this.#ride;
    if (horseData) r.data = horseData;
    if (isRiding === r.on) return;
    r.on = isRiding;
    if (isRiding) {
      r.hopT = 0;
      r.resetY = true;
    } else {
      r.data = null;
    }
  }

  isRiding() { return this.#ride.on; }

  /** Pesos de los morph targets de montar (transición, viento, onda, giros). */
  getRideWeights() { return this.#rideWeights; }

  /** Lanza un emote ('wave' | 'spin' | 'curtsy' | 'star'). Devuelve false si no existe. */
  playEmote(id) {
    const def = EMOTE_DEFS[id];
    if (!def) return false;
    this.#emoteSeq += 1;
    this.#emote = { id, t: 0, def, seq: this.#emoteSeq };
    this.#gesture = null;
    return true;
  }

  cancelEmote() { this.#emote = null; }

  getEmote() { return this.#emote ? { id: this.#emote.id, seq: this.#emote.seq } : null; }

  /** Punto del mundo al que mira la cabeza (o null para mirada libre). */
  setLookTarget(worldPos) { this.#lookTarget = worldPos || null; }

  update(dt, state = 'idle', speed = 0, lod = 0) {
    dt = Math.max(0, Math.min(dt, 0.1));
    if (dt <= 0) return;
    this.#t += dt;
    const t = this.#t;
    const motion = this.#trackMotion(dt);

    if (this.#prevState === 'jump' && state !== 'jump') this.#landT = 0;
    this.#prevState = state;
    if (LOCO.has(state)) this.#emote = null;

    this.#updateRideTransition(dt);
    const riding = state === 'riding';
    if (riding) this.#updateRider(dt, motion);
    const p = PoseLibrary.reset(this.#pose, this.#baseZ);
    let sway = 0;
    switch (state) {
      case 'walk': case 'run': sway = PoseLibrary.locomotion(p, t, this.#baseZ, state === 'run'); break;
      case 'jump': PoseLibrary.jump(p, this.#baseZ); break;
      case 'riding': PoseLibrary.riding(p, t, this.#rideState); break;
      case 'dance': PoseLibrary.dance(p, t); break;
      case 'pose': PoseLibrary.pose(p, t, this.#baseZ, this.#isMale); break;
      case 'talk': PoseLibrary.idle(p, t, this.#baseZ); PoseLibrary.talk(p, t, this.#baseZ); break;
      default: PoseLibrary.idle(p, t, this.#baseZ); break;
    }

    if (state === 'idle' && (lod === 0 || this.#emote)) this.#updateGesture(dt, p);
    else this.#gesture = null;
    this.#updateEmote(dt, p);

    const hasEmote = Boolean(this.#emote);
    const runMid = lod === 0 || hasEmote;
    const runFar = lod < 2 || hasEmote;

    if (this.#landT >= 0) {
      this.#landT += dt;
      const k = this.#landT / 0.3;
      if (k >= 1) this.#landT = -1;
      else PoseLibrary.blend(p, PoseLibrary.landing(this.#baseZ, this.#partialPose), Math.sin(Math.PI * k) * 0.9);
    }

    this.#applyLook(dt, p);
    if (state === 'walk' || state === 'run') {
      p.bodyRotZ += clamp(-this.#yawRate * (state === 'run' ? 0.055 : 0.04), -0.17, 0.17);
    }
    if (state !== 'jump' && state !== 'riding' && runFar) this.#plantFeet(p);

    this.#applyPose(dt, p, runFar, riding);
    if (runMid) this.#updateBlink(dt);
    if (runFar) {
      const si = this.#springIn;
      si.fwd = motion.fwd;
      si.side = motion.side;
      si.vy = motion.vy;
      si.yawRate = this.#yawRate + motion.spinRate;
      si.sway = sway * (state === 'run' ? 1 : 0.6);
      si.flare = p.flare;
      si.riding = riding;
      si.t = t;
      this.#springs.update(dt, si);
      this.#springs.apply(this.#b.skirtPivot, this.#b.hairSwing, this.#ride.T);
    }
    this.#updateRideWeights(dt, motion, t);
  }

  /** Transición suave (~0.25 s) de la falda entre forma normal y caída a caballo. */
  #updateRideTransition(dt) {
    const r = this.#ride;
    r.k = r.on ? Math.min(1, r.k + dt / 0.25) : Math.max(0, r.k - dt / 0.25);
    r.T = r.on ? 1 - (1 - r.k) ** 3 : smoothstep(r.k);
    if (r.hopT < 1) r.hopT = Math.min(1, r.hopT + dt / 0.28);
  }

  /** Física del jinete: amortiguación vertical, inclinación por marcha/aceleración y banking. */
  #updateRider(dt, motion) {
    const r = this.#ride;
    const rs = this.#rideState;
    const d = r.data;
    const rootY = this.#b.root.position.y;
    const sp = this.#riderY;
    if (r.resetY) {
      sp.reset(rootY);
      this.#lean.reset(0.04);
      r.resetY = false;
    }
    // El jinete no está soldado: absorbe el ritmo con retardo, pero la silla nunca le deja hundirse
    sp.step(rootY, dt);
    if (sp.x < rootY) {
      sp.x = rootY;
      if (sp.v < 0) sp.v = 0;
    } else if (sp.x > rootY + 0.025) {
      sp.x = rootY + 0.025;
      if (sp.v > 0) sp.v = 0;
    }
    rs.residual = sp.x - rootY;
    rs.hop = 0.30 * (1 - smoothstep(r.hopT));

    const speed = d ? d.speed : Math.hypot(motion.fwd, motion.side);
    const accel = d ? d.accel : 0;
    const vy = d ? d.vy : motion.vy;
    const gait = d ? d.gait : 'idle';
    let leanT = gait === 'run' ? 0.17 : gait === 'walk' ? 0.07 : 0.03;
    if (gait === 'jump') leanT = vy > 0 ? 0.22 : 0.06;
    leanT += clamp(accel * 0.012, -0.10, 0.06);
    rs.lean = this.#lean.stepClamped(leanT, dt, RIDER_LEAN_RANGE.min, RIDER_LEAN_RANGE.max);
    rs.bank = d ? d.bank : 0;
    rs.inLean = clamp(rs.bank * 0.35, -0.05, 0.05);
    rs.speed = speed;
  }

  /** Pesos de la falda a caballo: viento/galope, caída de saltos, onda viajera y giros. */
  #updateRideWeights(dt, motion, t) {
    const w = this.#rideWeights;
    const r = this.#ride;
    w.T = r.T;
    if (r.T <= 0) {
      this.#rideLift.reset(0);
      this.#rideOut.reset(0);
      w.lift = w.waveS = w.waveC = w.outPos = w.outNeg = 0;
      return;
    }
    const d = r.data;
    const speed = d ? d.speed : 0;
    const vy = d ? d.vy : motion.vy;
    const yawRate = d ? d.yawRate : this.#yawRate;
    const gait = d ? d.gait : 'idle';
    const liftT = clamp(speed / 18, 0, 1) * 0.85 + clamp(-vy * 0.06, 0, 0.45) + (gait === 'idle' ? 0.05 + Math.sin(t * 0.8) * 0.04 : 0);
    const lift = this.#rideLift.stepClamped(Math.min(1, liftT), dt, 0, 1);
    this.#wavePhase = (this.#wavePhase + dt * (6 + speed * 0.35)) % TAU;
    const amp = lift * 0.85;
    w.lift = lift;
    w.waveS = amp * Math.cos(this.#wavePhase);
    w.waveC = -amp * Math.sin(this.#wavePhase);
    const out = this.#rideOut.stepClamped(clamp(yawRate * clamp(speed / 10, 0, 1.2) * 0.45, -1, 1), dt, -1, 1);
    // Giro hacia +X (yawRate > 0) => el exterior de la curva es -X
    w.outNeg = out > 0 ? out : 0;
    w.outPos = out < 0 ? -out : 0;
  }

  #trackMotion(dt) {
    const r = this.#b.root;
    const yaw = r.rotation.y;
    if (!this.#hasPrev) {
      this.#prevPos.copy(r.position);
      this.#prevYaw = yaw;
      this.#hasPrev = true;
    }
    this.#vel.subVectors(r.position, this.#prevPos).divideScalar(dt);
    if (this.#vel.lengthSq() > 900) this.#vel.set(0, 0, 0);
    this.#prevPos.copy(r.position);
    this.#velS.lerp(this.#vel, 1 - Math.exp(-dt * 12));

    const rate = clamp(wrapAngle(yaw - this.#prevYaw) / dt, -8, 8);
    this.#prevYaw = yaw;
    this.#yawRate += (rate - this.#yawRate) * (1 - Math.exp(-dt * 10));

    const prevSpin = this.#spinAngle;
    this.#spinAngle = this.#emote?.id === 'spin' ? smoothstep(Math.min(1, this.#emote.t / this.#emote.def.duration)) * TAU : 0;
    const spinRate = this.#spinAngle > prevSpin ? (this.#spinAngle - prevSpin) / dt : 0;

    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    const v = this.#velS;
    const mo = this.#motionOut;
    mo.fwd = v.x * s + v.z * c;
    mo.side = v.x * c - v.z * s;
    mo.vy = v.y;
    mo.spinRate = spinRate;
    return mo;
  }

  #updateEmote(dt, p) {
    const e = this.#emote;
    if (!e) return;
    e.t += dt;
    const dur = e.def.duration;
    if (e.t >= dur) {
      this.#emote = null;
      return;
    }
    const k = e.t / dur;
    const w = PoseLibrary.envelope(k, dur, e.def.fadeIn, e.def.fadeOut);
    PoseLibrary.blend(p, PoseLibrary.emote(e.id, k, e.t, this.#baseZ, this.#partialPose), e.id === 'spin' ? Math.max(w, 0.6) : w);
  }

  #updateGesture(dt, p) {
    if (this.#emote) return;
    if (!this.#gesture) {
      this.#gestureTimer -= dt;
      if (this.#gestureTimer > 0) return;
      const ids = this.#lookTarget ? GESTURE_KEYS_NO_LOOK : GESTURE_KEYS_ALL;
      const id = ids[Math.floor(Math.random() * ids.length)];
      this.#gesture = { id, t: 0, dur: GESTURE_DEFS[id] };
      this.#gestureTimer = 4 + Math.random() * 4;
    }
    const g = this.#gesture;
    g.t += dt;
    if (g.t >= g.dur) {
      this.#gesture = null;
      return;
    }
    PoseLibrary.blend(p, PoseLibrary.gesture(g.id, g.t, this.#partialPose), PoseLibrary.envelope(g.t / g.dur, g.dur, 0.5, 0.6));
  }

  #applyLook(dt, p) {
    const target = this.#lookTarget;
    this.#lookW += ((target ? 1 : 0) - this.#lookW) * (1 - Math.exp(-dt * 4));
    if (this.#lookW < 0.01 || !target) return;
    const r = this.#b.root;
    const yaw = wrapAngle(Math.atan2(target.x - r.position.x, target.z - r.position.z) - r.rotation.y);
    const headYaw = clamp(yaw, -0.95, 0.95);
    const dist = Math.hypot(target.x - r.position.x, target.z - r.position.z) || 1;
    const pitch = clamp(-Math.atan2(target.y - r.position.y, dist) * 0.6, -0.25, 0.25);
    const w = this.#lookW;
    p.headY += (headYaw * 0.8 - p.headY) * w;
    p.spineY += (headYaw * 0.18) * w;
    p.headX += (pitch - p.headX) * w * 0.7;
  }

  #plantFeet(p) {
    const dl = THIGH * Math.cos(p.lLegX) + SHIN * Math.cos(p.lLegX + p.lShinX);
    const dr = THIGH * Math.cos(p.rLegX) + SHIN * Math.cos(p.rLegX + p.rShinX);
    p.bodyY += Math.max(dl, dr) - LEG;
  }

  #applyPose(dt, p, applyBreathing = true, riding = false) {
    const b = this.#b;
    const a = 1 - Math.exp(-dt * 12);
    b.body.position.x = lerpTo(b.body.position.x, p.bodyX, a);
    // A caballo la altura la dicta el muelle del jinete (sin retardo extra que lo hundiría en la silla)
    b.body.position.y = riding ? p.bodyY : lerpTo(b.body.position.y, p.bodyY, a);
    b.body.rotation.x = lerpTo(b.body.rotation.x, p.bodyRotX, a);
    b.body.rotation.z = lerpTo(b.body.rotation.z, p.bodyRotZ, a);
    this.#smoothYaw = lerpTo(this.#smoothYaw, p.bodyRotY, a);
    b.body.rotation.y = this.#smoothYaw + this.#spinAngle;
    b.spine.rotation.set(lerpTo(b.spine.rotation.x, p.spineX, a), lerpTo(b.spine.rotation.y, p.spineY, a), lerpTo(b.spine.rotation.z, p.spineZ, a));
    b.head.rotation.set(lerpTo(b.head.rotation.x, p.headX, a), lerpTo(b.head.rotation.y, p.headY, a), lerpTo(b.head.rotation.z, p.headZ, a));
    b.lShoulder.rotation.set(lerpTo(b.lShoulder.rotation.x, p.lArmX, a), 0, lerpTo(b.lShoulder.rotation.z, p.lArmZ, a));
    b.rShoulder.rotation.set(lerpTo(b.rShoulder.rotation.x, p.rArmX, a), 0, lerpTo(b.rShoulder.rotation.z, p.rArmZ, a));
    b.lFore.rotation.set(lerpTo(b.lFore.rotation.x, p.lForeX, a), 0, lerpTo(b.lFore.rotation.z, p.lForeZ, a));
    b.rFore.rotation.set(lerpTo(b.rFore.rotation.x, p.rForeX, a), 0, lerpTo(b.rFore.rotation.z, p.rForeZ, a));
    // Piernas: a caballo convergen más rápido a la pose de estribos (rodean el barril al instante)
    const al = riding ? 1 - Math.exp(-dt * 26) : a;
    b.lLeg.rotation.x = lerpTo(b.lLeg.rotation.x, p.lLegX, al);
    b.rLeg.rotation.x = lerpTo(b.rLeg.rotation.x, p.rLegX, al);
    b.lLeg.rotation.z = lerpTo(b.lLeg.rotation.z, p.lLegZ, al);
    b.rLeg.rotation.z = lerpTo(b.rLeg.rotation.z, p.rLegZ, al);
    b.lShin.rotation.x = lerpTo(b.lShin.rotation.x, p.lShinX, al);
    b.rShin.rotation.x = lerpTo(b.rShin.rotation.x, p.rShinX, al);
    b.lShin.rotation.z = lerpTo(b.lShin.rotation.z, p.lShinZ, al);
    b.rShin.rotation.z = lerpTo(b.rShin.rotation.z, p.rShinZ, al);

    this.#breath = lerpTo(this.#breath, p.breath, a);
    if (applyBreathing) {
      if (b.torso) {
        const tb = this.#torsoBase;
        b.torso.scale.set(tb.x * (1 + this.#breath * 0.014), tb.y * (1 + this.#breath * 0.004), tb.z * (1 + this.#breath * 0.02));
      }
      const sy = this.#shoulderY + this.#breath * 0.005;
      b.lShoulder.position.y = sy;
      b.rShoulder.position.y = sy;
    }
  }

  #updateBlink(dt) {
    if (this.#blinkT < 0) {
      this.#blinkTimer -= dt;
      if (this.#blinkTimer <= 0) {
        this.#blinkT = 0;
        if (this.#pendingBlink) {
          this.#pendingBlink = false;
          this.#blinkTimer = 3 + Math.random() * 2;
        } else if (Math.random() < 0.15) {
          this.#pendingBlink = true;
          this.#blinkTimer = 0.12;
        } else {
          this.#blinkTimer = 3 + Math.random() * 2;
        }
      }
    }
    let s = 1;
    if (this.#blinkT >= 0) {
      this.#blinkT += dt;
      const k = this.#blinkT / 0.15;
      if (k >= 1) this.#blinkT = -1;
      else s = 1 - Math.sin(Math.PI * k) * 0.9;
    }
    for (const eye of this.#b.eyes) eye.scale.y = s;
  }

  resetMotion() {
    this.#hasPrev = false;
    this.#velS.set(0, 0, 0);
    this.#yawRate = 0;
    this.#springs.reset();
    this.#ride.resetY = true;
  }
}
