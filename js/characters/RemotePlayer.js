import * as THREE from 'three';
import { CharacterRig } from './CharacterRig.js';
import { createHorseModel, animateHorseModel, placeRiderOnHorse, updateHorseReins } from '../world/HorseSystem.js';
import { NameTag, ChatBubble } from './SpeechBubble.js';

/**
 * Valida los campos del catálogo 3D recibidos por red para sincronizar
 * vestidos, peinados, colores de cabello, piel, ojos y accesorios en tiempo real.
 */
function sanitizeAppearance(appearance) {
  if (!appearance || typeof appearance !== 'object') return null;
  const clean = {};
  for (const key of ['avatarId', 'outfitId', 'hairId', 'hairColorId', 'skinId', 'eyeColorId']) {
    if (typeof appearance[key] === 'string') clean[key] = appearance[key];
  }
  if (Array.isArray(appearance.accessories)) {
    clean.accessories = appearance.accessories.filter((a) => typeof a === 'string');
  }
  return clean;
}

const ANIM_STATES = new Set(['idle', 'walk', 'run', 'jump', 'dance', 'pose', 'riding']);

export class RemotePlayer {
  #scene;
  #peerId;
  #name;
  #rig = null;
  #targetPos = new THREE.Vector3(0, 0, 14);
  #currentPos = new THREE.Vector3(0, 0, 14);
  #vel = new THREE.Vector3();
  #predPos = new THREE.Vector3();
  #targetYaw = Math.PI;
  #currentYaw = Math.PI;
  #animState = 'idle';
  #nameTag = null;
  #chatBubble = null;
  #lastSeq = -1;
  #appearanceKey = '';
  #emoteSeq = -1;
  #pendingFxHandle = null;
  #hasNetState = false;
  #lastNetTime = 0;
  #timeSinceNet = 0;
  #horseModel = null;
  #mountVariant = null;
  #mountAnim = 'idle';
  #horseLodAcc = 0;
  #horseLodFrame = 0;

  constructor(scene, peerId, profile = {}, textureFactory = null) {
    this.#scene = scene;
    this.#peerId = peerId;
    this.#name = profile.name || 'Compañero Real';
    const appearance = sanitizeAppearance(profile.appearance);
    this.#rig = new CharacterRig(appearance, textureFactory);
    this.#appearanceKey = appearance ? JSON.stringify(appearance) : '';
  }

  init() {
    const root = this.#rig.init();
    root.userData.isCharacter = true;
    root.position.copy(this.#currentPos);
    this.#scene.add(root);

    this.#nameTag = new NameTag(this.#name, { y: 2.22 });
    root.add(this.#nameTag.sprite);
    this.#chatBubble = new ChatBubble({ y: 2.82 });
    root.add(this.#chatBubble.sprite);
  }

  setProfile(name, rawAppearance) {
    this.#setName(name);
    if (rawAppearance && !this.#pendingFxHandle) {
      const appearance = sanitizeAppearance(rawAppearance);
      if (appearance) {
        // Solo reconstruimos geometría cuando la ropa cambia de verdad.
        const key = JSON.stringify(appearance);
        if (key !== this.#appearanceKey) {
          this.#appearanceKey = key;
          this.#rig?.applyAppearance(appearance);
        }
      }
    }
  }

  /**
   * Aplica un cambio de vestidor remoto con nube de humo mágico en vivo,
   * cambiando la vestimenta en el pico del humo (~120 ms) y lanzando la pose de alegría.
   */
  applyWardrobeChange(name, rawAppearance, wardrobeFX = null, emoteId = 'spin') {
    this.#setName(name);
    const appearance = sanitizeAppearance(rawAppearance);
    if (!appearance) return;

    const root = this.#rig?.getRoot();
    if (!wardrobeFX || !root) {
      this.#appearanceKey = JSON.stringify(appearance);
      this.#rig?.applyAppearance(appearance);
      if (emoteId) this.#rig?.playEmote(emoteId);
      return;
    }

    this.#pendingFxHandle?.cancelPeak();
    const key = JSON.stringify(appearance);
    const handle = wardrobeFX.trigger(root, {
      peakMs: 120,
      onPeak: () => {
        if (this.#pendingFxHandle === handle) {
          this.#pendingFxHandle = null;
        }
        this.#appearanceKey = key;
        this.#rig?.applyAppearance(appearance);
        if (emoteId) this.#rig?.playEmote(emoteId);
      }
    });
    this.#pendingFxHandle = handle;
  }

  #setName(name) {
    if (typeof name !== 'string' || !name || name === this.#name) return;
    this.#name = name.slice(0, 18);
    this.#nameTag?.setText(this.#name);
  }

  showChatBubble(message) {
    this.#chatBubble?.show(message);
  }

  /** Reinicia la secuencia de estados (el compañero volvió a entrar en partida). */
  resetSequence() {
    this.#lastSeq = -1;
  }

  applyNetworkState(state, { initial = false } = {}) {
    // Canal no ordenado: descartamos estados más viejos que el último aplicado.
    // Un salto grande hacia atrás significa que el emisor reinició su contador.
    const seq = state.s;
    if (Number.isFinite(seq)) {
      if (seq <= this.#lastSeq && this.#lastSeq - seq < 500) return;
      this.#lastSeq = seq;
    }
    if (ANIM_STATES.has(state.anim)) {
      this.#animState = state.anim;
    }
    if (state.pos) {
      const nx = state.pos[0];
      const ny = state.pos[1];
      const nz = state.pos[2];
      const now = performance.now() * 0.001;

      if (!this.#hasNetState) {
        this.#hasNetState = true;
        this.#currentPos.set(nx, ny, nz);
        this.#targetPos.set(nx, ny, nz);
        this.#vel.set(0, 0, 0);
        this.#lastNetTime = now;
        this.#timeSinceNet = 0;
      } else {
        const dx = nx - this.#targetPos.x;
        const dy = ny - this.#targetPos.y;
        const dz = nz - this.#targetPos.z;
        const jumpDistSq = dx * dx + dy * dy + dz * dz;
        if (jumpDistSq > 144) {
          this.#currentPos.set(nx, ny, nz);
          this.#targetPos.set(nx, ny, nz);
          this.#vel.set(0, 0, 0);
          this.#rig?.resetMotion();
        } else if (this.#animState === 'idle') {
          this.#targetPos.set(nx, ny, nz);
          this.#vel.set(0, 0, 0);
        } else {
          const dtNet = Math.max(0.02, Math.min(0.25, now - this.#lastNetTime));
          let vx = dx / dtNet;
          let vy = dy / dtNet;
          let vz = dz / dtNet;
          const speedSq = vx * vx + vy * vy + vz * vz;
          if (speedSq > 484) {
            const s = 22 / Math.sqrt(speedSq);
            vx *= s;
            vy *= s;
            vz *= s;
          }
          this.#vel.set(vx, vy, vz);
          this.#targetPos.set(nx, ny, nz);
        }
        this.#lastNetTime = now;
        this.#timeSinceNet = 0;
      }
    }
    if (typeof state.yaw === 'number') {
      this.#targetYaw = state.yaw;
    }
    // Emote remoto: se reproduce una vez por cada número de secuencia nuevo
    const emote = state.emote;
    if (emote && typeof emote.id === 'string' && Number.isFinite(emote.seq) && emote.seq !== this.#emoteSeq) {
      this.#emoteSeq = emote.seq;
      // Estado inicial del roster: no repetimos un emote que ya terminó
      if (!initial) this.#rig?.playEmote(emote.id);
    }
    if ((state.name && state.name !== this.#name) || state.appearance) {
      this.setProfile(state.name, state.appearance);
    }

    if (state.mount && typeof state.mount.v === 'string') {
      if (this.#mountVariant !== state.mount.v) {
        if (this.#horseModel) {
          this.#scene.remove(this.#horseModel.root);
          this.#horseModel.dispose();
          this.#horseModel = null;
        }
        this.#horseModel = createHorseModel(state.mount.v);
        this.#horseModel.root.position.copy(this.#currentPos);
        this.#horseModel.root.rotation.y = this.#currentYaw;
        this.#scene.add(this.#horseModel.root);
        this.#mountVariant = state.mount.v;
        this.#rig?.setRidingMode(true, this.#horseModel.mount);
      }
      const a = state.mount.a;
      this.#mountAnim = a === 'walk' || a === 'run' || a === 'jump' ? a : 'idle';
    } else if (this.#horseModel) {
      this.#scene.remove(this.#horseModel.root);
      this.#horseModel.dispose();
      this.#horseModel = null;
      this.#mountVariant = null;
      this.#mountAnim = 'idle';
      const root = this.#rig?.getRoot();
      if (root) root.rotation.set(0, this.#currentYaw, 0);
      this.#rig?.setRidingMode(false);
    }
  }

  getPeerId() {
    return this.#peerId;
  }

  getName() {
    return this.#name;
  }

  getPosition() {
    return this.#currentPos;
  }

  update(dt, localPlayerPos = null) {
    if (!this.#rig) return;
    this.#timeSinceNet += dt;
    const extrap = Math.min(this.#timeSinceNet, 0.10);
    this.#predPos.copy(this.#targetPos).addScaledVector(this.#vel, extrap);

    const alpha = 1 - Math.exp(-dt * 13);
    if (this.#currentPos.distanceToSquared(this.#predPos) > 144) {
      this.#currentPos.copy(this.#predPos);
      this.#rig.resetMotion();
    } else {
      this.#currentPos.lerp(this.#predPos, alpha);
    }

    let diff = this.#targetYaw - this.#currentYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.#currentYaw += diff * alpha;

    const root = this.#rig.getRoot();
    root.rotation.y = this.#currentYaw;

    let lod = 0;
    let horseLod = 0;
    if (localPlayerPos) {
      const distSq = this.#currentPos.distanceToSquared(localPlayerPos);
      if (distSq > 2025) lod = 2;
      else if (distSq > 625) lod = 1;
      if (distSq > 8100) horseLod = 2;
      else if (distSq > 2500) horseLod = 1;
    }

    if (this.#horseModel) {
      const hm = this.#horseModel;
      hm.root.position.copy(this.#currentPos);
      hm.root.rotation.y = this.#currentYaw;
      const horseSpeedRatio = this.#mountAnim === 'run' ? 1 : this.#mountAnim === 'walk' ? 0.55 : 0;
      // LOD del caballo remoto: lejos se anima 1 de cada 3 fotogramas y sin micro-animaciones
      let animate = true;
      let hdt = dt;
      if (horseLod > 0) {
        this.#horseLodAcc += dt;
        this.#horseLodFrame++;
        animate = this.#horseLodFrame % 3 === 0;
        hdt = this.#horseLodAcc;
      }
      if (animate) {
        animateHorseModel(hm, this.#mountAnim, hdt, horseSpeedRatio, horseLod < 2);
        this.#horseLodAcc = 0;
      }
      placeRiderOnHorse(hm, root);
      this.#rig.setRidingMode(true, hm.mount);
      const riderSpeed = this.#mountAnim === 'run' ? 18 : this.#mountAnim === 'walk' ? 11 : 0;
      this.#rig.update(dt, 'riding', riderSpeed, lod);
      if (horseLod < 2) updateHorseReins(hm, this.#rig);
    } else {
      root.position.copy(this.#currentPos);
      this.#rig.update(dt, this.#animState, 0, lod);
    }

    this.#chatBubble?.update(dt);
  }

  dispose() {
    this.#pendingFxHandle?.cancelPeak();
    this.#pendingFxHandle = null;
    this.#nameTag?.dispose();
    this.#nameTag = null;
    this.#chatBubble?.dispose();
    this.#chatBubble = null;
    if (this.#horseModel) {
      this.#scene.remove(this.#horseModel.root);
      this.#horseModel.dispose();
      this.#horseModel = null;
      this.#mountVariant = null;
    }
    if (this.#rig) {
      this.#scene.remove(this.#rig.getRoot());
      this.#rig.dispose();
      this.#rig = null;
    }
  }
}
