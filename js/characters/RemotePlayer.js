import * as THREE from 'three';
import { CharacterRig } from './CharacterRig.js';

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

const ANIM_STATES = new Set(['idle', 'walk', 'run', 'jump', 'dance', 'pose']);

export class RemotePlayer {
  #scene;
  #peerId;
  #name;
  #rig = null;
  #targetPos = new THREE.Vector3(0, 0, 14);
  #currentPos = new THREE.Vector3(0, 0, 14);
  #targetYaw = Math.PI;
  #currentYaw = Math.PI;
  #animState = 'idle';
  #nameSprite = null;
  #chatSprite = null;
  #chatTimer = 0;
  #appearanceKey = '';
  #emoteSeq = -1;
  #pendingFxHandle = null;

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
    root.position.copy(this.#currentPos);
    this.#scene.add(root);

    this.#nameSprite = this.#createLabelSprite(this.#name, 'rgba(42, 16, 38, 0.78)', '#fff6fa');
    this.#nameSprite.position.set(0, 2.22, 0);
    this.#nameSprite.scale.set(1.9, 0.44, 1);
    root.add(this.#nameSprite);
  }

  #createLabelSprite(text, bg, fg) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(14, 18, 484, 92, 44);
    ctx.fill();
    ctx.strokeStyle = 'rgba(244, 198, 130, 0.85)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = fg;
    ctx.font = 'bold 40px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const trimmed = text.length > 26 ? `${text.slice(0, 25)}…` : text;
    ctx.fillText(trimmed, 256, 65);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: 0xc8c8c8,
      transparent: true,
      depthTest: false,
      toneMapped: false
    });
    return new THREE.Sprite(mat);
  }

  setProfile(name, rawAppearance) {
    if (name && name !== this.#name) {
      this.#name = name;
      this.#replaceSprite('name', name);
    }
    const appearance = sanitizeAppearance(rawAppearance);
    if (appearance && !this.#pendingFxHandle) {
      // Los paquetes 'state' llegan ~15 veces/seg con la apariencia incluida:
      // solo reconstruimos geometría cuando la ropa cambia de verdad.
      const key = JSON.stringify(appearance);
      if (key !== this.#appearanceKey) {
        this.#appearanceKey = key;
        this.#rig?.applyAppearance(appearance);
      }
    }
  }

  /**
   * Aplica un cambio de vestidor remoto con nube de humo mágico en vivo,
   * cambiando la vestimenta en el pico del humo (~120 ms) y lanzando la pose de alegría.
   */
  applyWardrobeChange(name, rawAppearance, wardrobeFX = null, emoteId = 'spin') {
    if (name && name !== this.#name) {
      this.#name = name;
      this.#replaceSprite('name', name);
    }
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

  #replaceSprite(kind, text) {
    const root = this.#rig?.getRoot();
    if (!root) return;
    if (kind === 'name' && this.#nameSprite) {
      this.#nameSprite.material.map?.dispose();
      this.#nameSprite.material.dispose();
      root.remove(this.#nameSprite);
      this.#nameSprite = this.#createLabelSprite(text, 'rgba(42, 16, 38, 0.78)', '#fff6fa');
      this.#nameSprite.position.set(0, 2.22, 0);
      this.#nameSprite.scale.set(1.9, 0.44, 1);
      root.add(this.#nameSprite);
    }
  }

  showChatBubble(message) {
    const root = this.#rig?.getRoot();
    if (!root) return;
    if (this.#chatSprite) {
      this.#chatSprite.material.map?.dispose();
      this.#chatSprite.material.dispose();
      root.remove(this.#chatSprite);
      this.#chatSprite = null;
    }
    this.#chatSprite = this.#createLabelSprite(message, 'rgba(255, 248, 252, 0.94)', '#7a1f4d');
    this.#chatSprite.position.set(0, 2.75, 0);
    this.#chatSprite.scale.set(2.55, 0.56, 1);
    root.add(this.#chatSprite);
    this.#chatTimer = 5.0;
  }

  applyNetworkState(state) {
    if (state.pos) {
      this.#targetPos.set(state.pos[0], state.pos[1], state.pos[2]);
    }
    if (typeof state.yaw === 'number') {
      this.#targetYaw = state.yaw;
    }
    if (ANIM_STATES.has(state.anim)) {
      this.#animState = state.anim;
    }
    // Emote remoto: se reproduce una vez por cada número de secuencia nuevo
    const emote = state.emote;
    if (emote && typeof emote.id === 'string' && Number.isFinite(emote.seq) && emote.seq !== this.#emoteSeq) {
      this.#emoteSeq = emote.seq;
      this.#rig?.playEmote(emote.id);
    }
    if (state.name || state.appearance) {
      this.setProfile(state.name, state.appearance);
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

  update(dt) {
    if (!this.#rig) return;
    const t = Math.min(1, dt * 11);
    this.#currentPos.lerp(this.#targetPos, t);

    let diff = this.#targetYaw - this.#currentYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.#currentYaw += diff * t;

    const root = this.#rig.getRoot();
    root.position.copy(this.#currentPos);
    root.rotation.y = this.#currentYaw;
    this.#rig.update(dt, this.#animState, 0);

    if (this.#chatTimer > 0) {
      this.#chatTimer -= dt;
      if (this.#chatTimer <= 0 && this.#chatSprite) {
        this.#chatSprite.material.map?.dispose();
        this.#chatSprite.material.dispose();
        root.remove(this.#chatSprite);
        this.#chatSprite = null;
      }
    }
  }

  dispose() {
    this.#pendingFxHandle?.cancelPeak();
    this.#pendingFxHandle = null;
    if (this.#nameSprite) {
      this.#nameSprite.material.map?.dispose();
      this.#nameSprite.material.dispose();
    }
    if (this.#chatSprite) {
      this.#chatSprite.material.map?.dispose();
      this.#chatSprite.material.dispose();
    }
    if (this.#rig) {
      this.#scene.remove(this.#rig.getRoot());
      this.#rig.dispose();
      this.#rig = null;
    }
  }
}
