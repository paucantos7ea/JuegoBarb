import * as THREE from 'three';

const TAU = Math.PI * 2;
const THIGH = 0.44;
const SHIN = 0.45;
const LEG = THIGH + SHIN;
const LOCO = new Set(['walk', 'run', 'jump', 'riding']);
const MAX_SPRING_STEP = 1 / 120;

const clamp = THREE.MathUtils.clamp;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smoothstep = (k) => k * k * (3 - 2 * k);

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
    p.lLegX = 0; p.rLegX = 0; p.lLegZ = 0; p.rLegZ = 0; p.lShinX = 0; p.rShinX = 0;
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

  /** Monta a caballo: piernas abiertas en la silla, rodillas flexionadas a los estribos y manos en las riendas. */
  static riding(p, t, baseZ, speed = 0) {
    const isRunning = speed > 13.0;
    const isMoving = speed > 0.5;
    const freq = isRunning ? 12.5 : (isMoving ? 7.8 : 2.0);
    const bob = isMoving ? Math.sin(t * freq) * (isRunning ? 0.032 : 0.016) : Math.sin(t * 2.0) * 0.008;

    p.lLegZ = 0.44;
    p.rLegZ = -0.44;
    p.lLegX = -0.62;
    p.rLegX = -0.62;
    p.lShinX = 0.92;
    p.rShinX = 0.92;
    p.flare = 0.14;

    p.bodyY = bob;
    p.spineX = isRunning ? 0.16 : (isMoving ? 0.06 : 0.02);
    p.headX = -p.spineX * 0.6;
    p.headY = isMoving ? 0 : Math.sin(t * 0.45) * 0.1;

    p.lArmX = -0.62;
    p.rArmX = -0.62;
    p.lArmZ = baseZ * 0.55;
    p.rArmZ = -baseZ * 0.55;
    p.lForeX = -0.58 + bob * 1.2;
    p.rForeX = -0.58 + bob * 1.2;
    p.lForeZ = -0.14;
    p.rForeZ = 0.14;
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

    const hairX = clamp(m.fwd * 0.028 + falling * 0.022, -0.06, 0.36);
    const hairZ = clamp(-m.yawRate * 0.07 - m.side * 0.025, -0.24, 0.24);
    this.#hair.step(hairX, hairZ, dt);

    this.#flare.step(clamp(m.flare + falling * 0.012 + Math.abs(m.yawRate) * 0.012, 0, 0.2), 0, dt);
  }

  apply(skirtPivot, hairSwing) {
    if (skirtPivot) {
      const f = Math.max(-0.02, this.#flare.x);
      skirtPivot.rotation.set(this.#skirt.x, 0, this.#skirt.z);
      skirtPivot.scale.set(1 + f, 1 - f * 0.3, 1 + f);
    }
    if (hairSwing) {
      hairSwing.rotation.set(clamp(this.#hair.x, -0.1, 0.42), 0, clamp(this.#hair.z, -0.28, 0.28));
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
  #springIn = { fwd: 0, side: 0, vy: 0, yawRate: 0, sway: 0, flare: 0 };
  #partialPose = {};

  constructor(bones, isMale = false) {
    this.#b = bones;
    this.#isMale = isMale;
    if (bones.torso) this.#torsoBase.copy(bones.torso.scale);
    this.#shoulderY = bones.lShoulder.position.y;
    PoseLibrary.reset(this.#pose, this.#baseZ);
  }

  setBaseArmZ(z) { this.#baseZ = z; }

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

    const p = PoseLibrary.reset(this.#pose, this.#baseZ);
    let sway = 0;
    switch (state) {
      case 'walk': case 'run': sway = PoseLibrary.locomotion(p, t, this.#baseZ, state === 'run'); break;
      case 'jump': PoseLibrary.jump(p, this.#baseZ); break;
      case 'riding': PoseLibrary.riding(p, t, this.#baseZ, speed); break;
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

    this.#applyPose(dt, p, runFar);
    if (runMid) this.#updateBlink(dt);
    if (runFar) {
      const si = this.#springIn;
      si.fwd = motion.fwd;
      si.side = motion.side;
      si.vy = motion.vy;
      si.yawRate = this.#yawRate + motion.spinRate;
      si.sway = sway * (state === 'run' ? 1 : 0.6);
      si.flare = p.flare;
      this.#springs.update(dt, si);
      this.#springs.apply(this.#b.skirtPivot, this.#b.hairSwing);
    }
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

  #applyPose(dt, p, applyBreathing = true) {
    const b = this.#b;
    const a = 1 - Math.exp(-dt * 12);
    const L = (cur, target) => cur + (target - cur) * a;
    b.body.position.x = L(b.body.position.x, p.bodyX);
    b.body.position.y = L(b.body.position.y, p.bodyY);
    b.body.rotation.x = L(b.body.rotation.x, p.bodyRotX);
    b.body.rotation.z = L(b.body.rotation.z, p.bodyRotZ);
    this.#smoothYaw = L(this.#smoothYaw, p.bodyRotY);
    b.body.rotation.y = this.#smoothYaw + this.#spinAngle;
    b.spine.rotation.set(L(b.spine.rotation.x, p.spineX), L(b.spine.rotation.y, p.spineY), L(b.spine.rotation.z, p.spineZ));
    b.head.rotation.set(L(b.head.rotation.x, p.headX), L(b.head.rotation.y, p.headY), L(b.head.rotation.z, p.headZ));
    b.lShoulder.rotation.set(L(b.lShoulder.rotation.x, p.lArmX), 0, L(b.lShoulder.rotation.z, p.lArmZ));
    b.rShoulder.rotation.set(L(b.rShoulder.rotation.x, p.rArmX), 0, L(b.rShoulder.rotation.z, p.rArmZ));
    b.lFore.rotation.set(L(b.lFore.rotation.x, p.lForeX), 0, L(b.lFore.rotation.z, p.lForeZ));
    b.rFore.rotation.set(L(b.rFore.rotation.x, p.rForeX), 0, L(b.rFore.rotation.z, p.rForeZ));
    b.lLeg.rotation.x = L(b.lLeg.rotation.x, p.lLegX);
    b.rLeg.rotation.x = L(b.rLeg.rotation.x, p.rLegX);
    b.lLeg.rotation.z = L(b.lLeg.rotation.z, p.lLegZ);
    b.rLeg.rotation.z = L(b.rLeg.rotation.z, p.rLegZ);
    b.lShin.rotation.x = L(b.lShin.rotation.x, p.lShinX);
    b.rShin.rotation.x = L(b.rShin.rotation.x, p.rShinX);

    this.#breath = L(this.#breath, p.breath);
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
  }
}
