import * as THREE from 'three';
import { PoseLibrary, EMOTE_DEFS, GESTURE_DEFS } from './animation/PoseLibrary.js';
import { SpringMotion } from './animation/SpringMotion.js';

const TAU = Math.PI * 2;
const THIGH = 0.44;
const SHIN = 0.45;
const LEG = THIGH + SHIN;
const LOCO = new Set(['walk', 'run', 'jump']);
const clamp = THREE.MathUtils.clamp;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smoothstep = (k) => k * k * (3 - 2 * k);

/**
 * Animador expresivo del rig: reposo vivo (respiración, peso, mirada, parpadeo y micro-gestos),
 * locomoción con inclinación en giros, salto de bailarina con aterrizaje amortiguado,
 * emotes, conversación, anclaje de pies al suelo y física secundaria en pelo y falda.
 * Todas las articulaciones se interpolan hacia ángulos absolutos (nunca se cruzan los brazos).
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

  /**
   * @param {Object} bones root, body, spine, head, hairSwing, skirtPivot, torso, eyes[],
   *   lShoulder, rShoulder, lFore, rFore, lLeg, rLeg, lShin, rShin
   */
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

  update(dt, state = 'idle', _speed = 0) {
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
      case 'dance': PoseLibrary.dance(p, t); break;
      case 'pose': PoseLibrary.pose(p, t, this.#baseZ, this.#isMale); break;
      case 'talk': PoseLibrary.idle(p, t, this.#baseZ); PoseLibrary.talk(p, t, this.#baseZ); break;
      default: PoseLibrary.idle(p, t, this.#baseZ); break;
    }

    if (state === 'idle') this.#updateGesture(dt, p);
    else this.#gesture = null;
    this.#updateEmote(dt, p);

    if (this.#landT >= 0) {
      this.#landT += dt;
      const k = this.#landT / 0.3;
      if (k >= 1) this.#landT = -1;
      else PoseLibrary.blend(p, PoseLibrary.landing(this.#baseZ), Math.sin(Math.PI * k) * 0.9);
    }

    this.#applyLook(dt, p);
    if (state === 'walk' || state === 'run') {
      p.bodyRotZ += clamp(-this.#yawRate * (state === 'run' ? 0.055 : 0.04), -0.17, 0.17);
    }
    if (state !== 'jump') this.#plantFeet(p);

    this.#applyPose(dt, p);
    this.#updateBlink(dt);
    this.#springs.update(dt, {
      fwd: motion.fwd, side: motion.side, vy: motion.vy,
      yawRate: this.#yawRate + motion.spinRate, sway: sway * (state === 'run' ? 1 : 0.6), flare: p.flare
    });
    this.#springs.apply(this.#b.skirtPivot, this.#b.hairSwing);
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
    if (this.#vel.lengthSq() > 900) this.#vel.set(0, 0, 0); // teletransporte
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
    return { fwd: v.x * s + v.z * c, side: v.x * c - v.z * s, vy: v.y, spinRate };
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
    PoseLibrary.blend(p, PoseLibrary.emote(e.id, k, e.t, this.#baseZ), e.id === 'spin' ? Math.max(w, 0.6) : w);
  }

  #updateGesture(dt, p) {
    if (this.#emote) return;
    if (!this.#gesture) {
      this.#gestureTimer -= dt;
      if (this.#gestureTimer > 0) return;
      const ids = Object.keys(GESTURE_DEFS).filter((id) => !(id === 'look' && this.#lookTarget));
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
    PoseLibrary.blend(p, PoseLibrary.gesture(g.id, g.t), PoseLibrary.envelope(g.t / g.dur, g.dur, 0.5, 0.6));
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

  /** Baja la cadera lo justo para que el pie más bajo apoye en el suelo al flexionar rodillas. */
  #plantFeet(p) {
    const dl = THIGH * Math.cos(p.lLegX) + SHIN * Math.cos(p.lLegX + p.lShinX);
    const dr = THIGH * Math.cos(p.rLegX) + SHIN * Math.cos(p.rLegX + p.rShinX);
    p.bodyY += Math.max(dl, dr) - LEG;
  }

  #applyPose(dt, p) {
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
    b.lShin.rotation.x = L(b.lShin.rotation.x, p.lShinX);
    b.rShin.rotation.x = L(b.rShin.rotation.x, p.rShinX);

    // Respiración orgánica: pecho que se expande y hombros que suben levemente
    this.#breath = L(this.#breath, p.breath);
    if (b.torso) {
      const tb = this.#torsoBase;
      b.torso.scale.set(tb.x * (1 + this.#breath * 0.014), tb.y * (1 + this.#breath * 0.004), tb.z * (1 + this.#breath * 0.02));
    }
    const sy = this.#shoulderY + this.#breath * 0.005;
    b.lShoulder.position.y = sy;
    b.rShoulder.position.y = sy;
  }

  /** Parpadeo natural cada 3-5 s (a veces doble), cerrando los ojos con scale.y suave. */
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

  /** Reinicia el muestreo de velocidad (tras teletransportes o cambios de mundo). */
  resetMotion() {
    this.#hasPrev = false;
    this.#velS.set(0, 0, 0);
    this.#yawRate = 0;
    this.#springs.reset();
  }
}
