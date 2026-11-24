import * as THREE from 'three';

const HAIR_TINT_RE = /(hair|pelo|cabello|wig|braid|ponytail|locks|mane)/i;
const EXCLUDE_CLOTH_RE = /(skin|piel|face|cara|rostro|eye|ojo|iris|sclera|cornea|lip|labio|boca|mouth|hair|pelo|cabello|ceja|brow|lash|pestana|pestaña|tooth|teeth|diente|gum|encia|tongue|lengua|metal|gold|oro|silver|plata|bronze|bronce|iron|steel|chrome|gem|gema|crystal|cristal|diamond|diamante|jewel|joya|crown|corona|tiara|glass|lente|nail|una|uña)/i;
const SECONDARY_TINT_RE = /(joint|joints|secondary|trim|skirt|falda|blouse|blusa|shirt|camisa|cape|capa|ribbon|lazo|bow|belt|cint|shoe|zapato|boot|bota|collar|sleeve|manga|lining|forro|detail|detalle|accent|acento)/i;

const CLIP_MATCHERS = {
  idle: /idle|stand|breath|wait|rest|reposo|espera/i,
  walk: /walk|stroll|march|andar|caminar/i,
  run: /run|sprint|jog|correr/i,
  jump: /jump|leap|hop|air|saltar|salto/i,
  dance: /dance|samba|groove|party|baile|bailar/i,
  pose: /pose|wave|greet|salut|bow|model|runway|agree|posar|saludo/i
};

const HAIR_STYLE_TINTS = {
  ondas_reales: 0xffe6f4,
  recogido_imperial: 0xffe0a8,
  coleta_perla: 0xe6f0ff
};

/**
 * Controlador de un personaje 3D real (.glb) con esqueleto Mixamo.
 * Gestiona: AnimationMixer con crossFadeTo, personalización de materiales satinados
 * (ropa y cabello) y acoplamiento de accesorios 3D directamente a los huesos de cabeza y manos.
 */
export class GlbAvatarController {
  #entry = null;
  #mixer = null;
  #actions = {};
  #currentAction = null;
  #currentState = 'idle';
  #clothTargets = [];
  #hairTargets = [];
  #sockets = [];
  #accessoryNodes = {};
  #hairOrnaments = {};
  #geometries = [];
  #materials = null;
  #tmpPrimary = new THREE.Color();
  #tmpSecondary = new THREE.Color();
  #tmpHair = new THREE.Color();
  #tmpWhite = new THREE.Color(0xffffff);

  mount(loaded, materials, initialState = 'idle') {
    this.dispose();
    this.#entry = loaded;
    this.#materials = materials;

    this.#collectMaterialTargets(loaded.root);
    this.#setupAnimations(loaded.root, loaded.animations, initialState);
    // Evaluar el frame 0 de reposo antes de acoplar accesorios a los huesos
    // para que las manos y la cabeza estén en postura natural (no en T-Pose).
    this.#mixer?.update(0);
    loaded.root.updateMatrixWorld(true);
    this.#attachBoneAccessories(loaded.root);
  }

  #collectMaterialTargets(root) {
    const seen = new Set();
    const allMats = [];

    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat?.color || seen.has(mat)) continue;
        seen.add(mat);
        allMats.push({ mat, label: `${mat.name || ''} ${obj.name || ''}` });
      }
    });

    const isSingleAtlas = allMats.length === 1 && Boolean(allMats[0].mat.map);
    for (const { mat, label } of allMats) {
      const baseColor = mat.color.clone();
      const baseRoughness = typeof mat.roughness === 'number' ? mat.roughness : 0.6;
      const baseMetalness = typeof mat.metalness === 'number' ? mat.metalness : 0.05;

      if (HAIR_TINT_RE.test(label) && !isSingleAtlas) {
        this.#hairTargets.push({ mat, baseColor, baseRoughness });
      } else if (!EXCLUDE_CLOTH_RE.test(label) || isSingleAtlas) {
        this.#clothTargets.push({
          mat,
          baseColor,
          baseRoughness,
          baseMetalness,
          isSecondary: !isSingleAtlas && SECONDARY_TINT_RE.test(label),
          isUnifiedAtlas: isSingleAtlas
        });
      }
    }
  }

  #findSkeletonBones(root) {
    let headBone = null;
    let neckBone = null;
    let leftHand = null;
    let rightHand = null;

    root.traverse((obj) => {
      if (!obj.isBone) return;
      const n = String(obj.name || '').toLowerCase();
      if (!headBone && /(^|[:_\s.-])head($|[^a-z0-9])/i.test(n) && !/top|end/.test(n)) {
        headBone = obj;
      } else if (!neckBone && /(^|[:_\s.-])neck($|[^a-z0-9])/i.test(n)) {
        neckBone = obj;
      }

      const isFinger = /thumb|index|middle|ring|pinky|finger|end/i.test(n);
      if (!isFinger && /hand/i.test(n)) {
        if (!leftHand && /(left|[^a-z]l[_.-]?hand|_l$|\.l$)/i.test(n)) leftHand = obj;
        else if (!rightHand && /(right|[^a-z]r[_.-]?hand|_r$|\.r$)/i.test(n)) rightHand = obj;
      }
    });

    return { headBone: headBone || neckBone, leftHand, rightHand };
  }

  /**
   * Crea un socket hijo directo del hueso compensando escala y orientación de bind-pose
   * para que 1 unidad dentro del socket equivalga exactamente a 1 metro en coordenadas del personaje.
   */
  #createBoneSocket(bone, root) {
    if (!bone) return null;
    root.updateMatrixWorld(true);
    const worldScale = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const rootQuat = new THREE.Quaternion();
    bone.getWorldScale(worldScale);
    bone.getWorldQuaternion(worldQuat);
    root.getWorldQuaternion(rootQuat);

    const avgScale = Math.max(0.0001, (Math.abs(worldScale.x) + Math.abs(worldScale.y) + Math.abs(worldScale.z)) / 3);
    const invScale = 1 / avgScale;

    const socket = new THREE.Group();
    socket.scale.setScalar(invScale);
    socket.quaternion.copy(worldQuat).invert().multiply(rootQuat);
    bone.add(socket);
    this.#sockets.push({ bone, socket });
    return socket;
  }

  #track(geo) {
    this.#geometries.push(geo);
    return geo;
  }

  #attachBoneAccessories(root) {
    const m = this.#materials;
    if (!m) return;

    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const { headBone, leftHand, rightHand } = this.#findSkeletonBones(root);

    // Calcular desplazamiento exacto desde el hueso de la cabeza hasta la coronilla
    let crownOffsetY = 0.21;
    if (headBone && !box.isEmpty()) {
      const headPos = new THREE.Vector3();
      headBone.getWorldPosition(headPos);
      const deltaTop = box.max.y - headPos.y;
      if (deltaTop > 0.08 && deltaTop < 0.42) crownOffsetY = deltaTop;
    }

    const headSocket = this.#createBoneSocket(headBone, root);
    if (headSocket) {
      // Tiara imperial de diamantes acoplada al hueso de la cabeza
      const tiara = new THREE.Group();
      tiara.position.set(0, crownOffsetY - 0.035, 0.015);
      const band = new THREE.Mesh(this.#track(new THREE.TorusGeometry(0.115, 0.011, 8, 24, Math.PI)), m.roseGold);
      band.rotation.x = Math.PI / 2 - 0.34;
      const centerGem = new THREE.Mesh(this.#track(new THREE.OctahedronGeometry(0.034, 0)), m.crystal);
      centerGem.position.set(0, 0.052, 0.082);
      const sideGeo = this.#track(new THREE.OctahedronGeometry(0.019, 0));
      for (const s of [-1, 1]) {
        const g = new THREE.Mesh(sideGeo, m.crystal);
        g.position.set(s * 0.052, 0.032, 0.07);
        tiara.add(g);
      }
      tiara.add(band, centerGem);
      headSocket.add(tiara);
      this.#accessoryNodes.tiara = tiara;

      // Gafas de sol oro rosa acopladas a la altura de los ojos
      const gafas = new THREE.Group();
      gafas.position.set(0, crownOffsetY * 0.42, 0.118);
      const lensGeo = this.#track(new THREE.CylinderGeometry(0.032, 0.029, 0.01, 14));
      const frameGeo = this.#track(new THREE.TorusGeometry(0.032, 0.005, 8, 16));
      for (const s of [-1, 1]) {
        const lens = new THREE.Mesh(lensGeo, m.dark);
        lens.rotation.x = Math.PI / 2;
        lens.scale.set(1.16, 1, 0.82);
        lens.position.set(s * 0.044, 0, 0);
        const frame = new THREE.Mesh(frameGeo, m.roseGold);
        frame.scale.set(1.16, 0.82, 1);
        frame.position.set(s * 0.044, 0, 0.004);
        gafas.add(lens, frame);
      }
      const bridge = new THREE.Mesh(this.#track(new THREE.BoxGeometry(0.026, 0.007, 0.008)), m.roseGold);
      bridge.position.set(0, 0.005, 0.003);
      gafas.add(bridge);
      headSocket.add(gafas);
      this.#accessoryNodes.gafas = gafas;

      // Adornos reales de peinado (reflejan la selección de peinado del Vestidor [C])
      this.#buildHairOrnaments(headSocket, crownOffsetY, m);
    }

    const leftSocket = this.#createBoneSocket(leftHand, root);
    if (leftSocket) {
      const bolso = new THREE.Group();
      const bag = new THREE.Mesh(this.#track(new THREE.BoxGeometry(0.14, 0.12, 0.068)), m.primary);
      bag.position.set(0, -0.145, 0.015); bag.castShadow = true;
      const clasp = new THREE.Mesh(this.#track(new THREE.SphereGeometry(0.017, 8, 8)), m.roseGold);
      clasp.position.set(0, -0.115, 0.052);
      const strap = new THREE.Mesh(this.#track(new THREE.TorusGeometry(0.046, 0.008, 6, 14, Math.PI)), m.roseGold);
      strap.position.set(0, -0.085, 0.015);
      bolso.add(bag, clasp, strap); leftSocket.add(bolso); this.#accessoryNodes.bolso = bolso;
    }

    const rightSocket = this.#createBoneSocket(rightHand, root);
    if (rightSocket) {
      const cetro = new THREE.Group();
      const rod = new THREE.Mesh(this.#track(new THREE.CylinderGeometry(0.013, 0.011, 0.72, 10)), m.roseGold);
      rod.rotation.x = Math.PI / 2 - 0.32; rod.position.set(0, 0.04, 0.17); rod.castShadow = true;
      const orb = new THREE.Mesh(this.#track(new THREE.OctahedronGeometry(0.068, 0)), m.crystal);
      orb.position.set(0, 0.17, 0.49);
      cetro.add(rod, orb); rightSocket.add(cetro); this.#accessoryNodes.cetro = cetro;
    }
  }

  #buildHairOrnaments(headSocket, crownOffsetY, m) {
    const clasp = new THREE.Group(); clasp.position.set(0, crownOffsetY * 0.56, -0.11);
    const bowRing = new THREE.Mesh(this.#track(new THREE.TorusGeometry(0.032, 0.007, 8, 16)), m.roseGold);
    bowRing.scale.set(1.3, 0.72, 1);
    const bowGem = new THREE.Mesh(this.#track(new THREE.OctahedronGeometry(0.022, 0)), m.crystal);
    bowGem.position.z = -0.008; clasp.add(bowRing, bowGem); headSocket.add(clasp);
    this.#hairOrnaments.ondas_reales = clasp;

    const pin = new THREE.Group(); pin.position.set(0, crownOffsetY - 0.02, -0.095);
    const needle = new THREE.Mesh(this.#track(new THREE.CylinderGeometry(0.006, 0.005, 0.19, 8)), m.roseGold);
    needle.rotation.z = Math.PI * 0.42;
    const gem = new THREE.Mesh(this.#track(new THREE.OctahedronGeometry(0.022, 0)), m.crystal);
    gem.position.set(0.088, 0.022, 0); pin.add(needle, gem); headSocket.add(pin);
    this.#hairOrnaments.recogido_imperial = pin;

    const pearlTie = new THREE.Group(); pearlTie.position.set(0, crownOffsetY * 0.72, -0.115);
    const band = new THREE.Mesh(this.#track(new THREE.TorusGeometry(0.038, 0.011, 10, 18)), m.roseGold);
    band.rotation.x = 0.55;
    const pearl = new THREE.Mesh(this.#track(new THREE.SphereGeometry(0.018, 10, 8)), m.crystal);
    pearl.position.set(0, 0.012, -0.032); pearlTie.add(band, pearl); headSocket.add(pearlTie);
    this.#hairOrnaments.coleta_perla = pearlTie;
  }

  #setupAnimations(root, clips, initialState) {
    this.#mixer = new THREE.AnimationMixer(root);
    this.#actions = this.#buildClipMap(clips);
    this.#currentState = initialState;
    const start = this.#actions[initialState] || this.#actions.idle || null;
    if (start) { start.reset().play(); this.#currentAction = start; }
  }

  #buildClipMap(clips) {
    if (!clips?.length) return {};
    const makeAction = (clip, once) => {
      const a = this.#mixer.clipAction(clip);
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
      a.clampWhenFinished = once;
      return a;
    };
    const map = {};
    for (const [state, re] of Object.entries(CLIP_MATCHERS)) {
      const clip = clips.find((c) => re.test(c.name || ''));
      if (clip) map[state] = makeAction(clip, state === 'jump');
    }
    const idle = map.idle || makeAction(clips[0], false), walk = map.walk || map.run || idle, run = map.run || walk;
    const dance = map.dance || map.pose || idle, pose = map.pose || dance || idle;
    return { idle, walk, run, jump: map.jump || run || idle, dance, pose };
  }

  /**
   * Aplica colores/acabados satinados de vestuario y cabello, y muestra los accesorios acoplados.
   */
  applyAppearance(avatar, outfit, hairId, accessories, isMale = false) {
    if (!this.#entry) return;

    this.#tmpPrimary.setHex(outfit.primary);
    this.#tmpSecondary.setHex(outfit.secondary);

    for (const t of this.#clothTargets) {
      const targetColor = t.isSecondary ? this.#tmpSecondary : this.#tmpPrimary;
      if (t.isUnifiedAtlas) {
        // Atlas único (ej. Michelle.glb): tinte luminoso satinado que estiliza ropa sin oscurecer rostro
        this.#tmpHair.copy(this.#tmpWhite).lerp(targetColor, 0.44);
        t.mat.color.copy(t.baseColor).multiply(this.#tmpHair);
        if ('roughness' in t.mat) t.mat.roughness = Math.min(0.56, Math.max(0.48, t.baseRoughness));
        if ('metalness' in t.mat) t.mat.metalness = Math.max(t.baseMetalness, 0.08);
      } else if (outfit.style === 'prince') {
        // Príncipe Adrián (Xbot/Soldier): traje de gala real azul zafiro y detalles oro rosa
        const princeColor = t.isSecondary ? 0xe8bf72 : outfit.primary;
        t.mat.color.setHex(princeColor);
        if ('roughness' in t.mat) t.mat.roughness = t.isSecondary ? 0.30 : 0.48;
        if ('metalness' in t.mat) t.mat.metalness = t.isSecondary ? 0.62 : 0.18;
      } else {
        t.mat.color.copy(t.baseColor).lerp(targetColor, 0.85);
        if ('roughness' in t.mat) t.mat.roughness = 0.48;
        if ('metalness' in t.mat) t.mat.metalness = t.isSecondary ? 0.16 : 0.10;
      }
      t.mat.needsUpdate = true;
    }

    if (this.#hairTargets.length && avatar) {
      this.#tmpHair.setHex(avatar.hair);
      if (HAIR_STYLE_TINTS[hairId]) {
        this.#tmpHair.lerp(new THREE.Color(HAIR_STYLE_TINTS[hairId]), 0.18);
      }
      for (const h of this.#hairTargets) {
        h.mat.color.copy(h.baseColor).lerp(this.#tmpHair, 0.78);
        if ('roughness' in h.mat) h.mat.roughness = 0.38;
        h.mat.needsUpdate = true;
      }
    }

    const activeAcc = new Set(accessories || []);
    for (const [id, node] of Object.entries(this.#accessoryNodes)) {
      node.visible = activeAcc.has(id);
    }

    for (const [id, ornament] of Object.entries(this.#hairOrnaments)) {
      ornament.visible = !isMale && id === hairId;
    }
  }

  update(dt, animState = 'idle') {
    if (!this.#mixer) return;
    this.#mixer.update(dt);

    if (animState !== this.#currentState) {
      const next = this.#actions[animState] || this.#actions.idle || null;
      if (next && next !== this.#currentAction) {
        next.reset().setEffectiveTimeScale(animState === 'jump' ? 0.65 : 1).play();
        this.#currentAction?.crossFadeTo(next, 0.22, true);
        this.#currentAction = next;
      }
      this.#currentState = animState;
    }
  }

  isMounted() {
    return Boolean(this.#entry);
  }

  getEntry() {
    return this.#entry;
  }

  dispose() {
    for (const { bone, socket } of this.#sockets) {
      bone?.remove(socket);
    }
    this.#sockets.length = 0;
    this.#accessoryNodes = {};
    this.#hairOrnaments = {};

    for (const geo of this.#geometries) geo.dispose();
    this.#geometries.length = 0;

    if (this.#mixer && this.#entry) {
      this.#mixer.stopAllAction();
      this.#mixer.uncacheRoot(this.#entry.root);
    }
    this.#mixer = null;
    this.#actions = {};
    this.#currentAction = null;
    this.#clothTargets = [];
    this.#hairTargets = [];

    if (this.#entry) {
      this.#entry.dispose();
      this.#entry = null;
    }
  }
}
