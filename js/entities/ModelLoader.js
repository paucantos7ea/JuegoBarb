import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const TARGET_HEIGHT = 1.75;
const MAX_ENV_INTENSITY = 0.6;

const CDN_BASE = 'https://threejs.org/examples/models/gltf/';
const CDN_MICHELLE = `${CDN_BASE}Michelle.glb`;
const CDN_XBOT = `${CDN_BASE}Xbot.glb`;
const CDN_SOLDIER = `${CDN_BASE}Soldier.glb`;

const LOCOMOTION_STATES = Object.freeze({
  idle: /idle|stand|breath|wait|rest|reposo|espera/i,
  walk: /walk|stroll|march|andar|caminar/i,
  run: /run|sprint|jog|correr/i
});

/**
 * Cargador y normalizador centralizado de modelos 3D en formato .glb/.gltf.
 * Prioriza: 1) archivo local elegido en Vestidor, 2) .glb en assets/models/models.json,
 * 3) modelos 3D reales con esqueleto Mixamo desde el CDN oficial de Three.js.
 */
export class ModelLoader {
  static MODEL_MAP = Object.freeze({
    aurora: './assets/models/avatar_1.glb',
    valentina: './assets/models/avatar_2.glb',
    celeste: './assets/models/avatar_3.glb',
    amara: './assets/models/avatar_4.glb',
    npc_adrian: './assets/models/principe_adrian.glb',
    npc_sofia: './assets/models/estilista_sofia.glb',
    npc_camila: './assets/models/princesa_camila.glb',
    npc_maestra: './assets/models/maestra_ceremonias.glb'
  });

  static CDN_MODEL_MAP = Object.freeze({
    aurora: [CDN_MICHELLE],
    valentina: [CDN_MICHELLE],
    celeste: [CDN_MICHELLE],
    amara: [CDN_MICHELLE],
    npc_sofia: [CDN_MICHELLE],
    npc_camila: [CDN_MICHELLE],
    npc_maestra: [CDN_MICHELLE],
    npc_adrian: [CDN_XBOT, CDN_SOLDIER]
  });

  static MANIFEST_URL = './assets/models/models.json';

  static #cache = new Map();
  static #missingUrls = new Set();
  static #inflight = new Map();
  static #loader = new GLTFLoader();
  static #manifestPromise = null;
  static #mixamoClipsPromise = null;

  /** Precarga en segundo plano los modelos CDN por defecto para evitar esperas al entrar. */
  static preloadDefaults() {
    void ModelLoader.#getOrFetchEntry(CDN_MICHELLE, false);
    void ModelLoader.#getOrFetchEntry(CDN_XBOT, false);
  }

  static resolveModelUrl(avatarId) {
    return ModelLoader.MODEL_MAP[avatarId] || null;
  }

  static resolveCdnUrls(avatarId) {
    return ModelLoader.CDN_MODEL_MAP[avatarId] || [CDN_MICHELLE];
  }

  static #fileKey(url) {
    return String(url).split(/[?#]/)[0].split('/').pop().toLowerCase();
  }

  static #isRemoteUrl(url) {
    return /^https?:\/\//i.test(url);
  }

  static #normalizeBoneKey(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/^mixamorig\d*[:_.-]?/, '')
      .replace(/[^a-z0-9]/g, '');
  }

  static #getAvailableModels() {
    if (!ModelLoader.#manifestPromise) {
      ModelLoader.#manifestPromise = (async () => {
        try {
          const res = await fetch(ModelLoader.MANIFEST_URL, { cache: 'no-cache' });
          const contentType = (res.headers.get('content-type') || '').toLowerCase();
          if (!res.ok || contentType.includes('text/html')) return null;
          const data = await res.json();
          const list = Array.isArray(data) ? data : data?.available;
          if (!Array.isArray(list)) return null;
          return new Set(list.filter((f) => typeof f === 'string' && f).map((f) => ModelLoader.#fileKey(f)));
        } catch {
          return null;
        }
      })();
    }
    return ModelLoader.#manifestPromise;
  }

  /**
   * Resuelve y carga el modelo 3D real para un personaje respetando el orden de prioridad:
   * 1) customUrl (Vestidor) -> 2) localUrl / assets/models/models.json -> 3) CDN Three.js.
   */
  static async loadCharacterModel({ avatarId = 'aurora', localUrl = null, customUrl = null } = {}) {
    if (customUrl) {
      return ModelLoader.loadNormalizedModel(customUrl);
    }

    const candidates = [];
    const localCandidate = localUrl || ModelLoader.resolveModelUrl(avatarId);
    if (localCandidate) candidates.push(localCandidate);
    for (const cdnUrl of ModelLoader.resolveCdnUrls(avatarId)) {
      if (!candidates.includes(cdnUrl)) candidates.push(cdnUrl);
    }

    for (const url of candidates) {
      const loaded = await ModelLoader.loadNormalizedModel(url);
      if (loaded) return loaded;
    }
    return null;
  }

  /**
   * Carga y normaliza una instancia del modelo .glb indicado.
   * Devuelve null si no está disponible (sin lanzar excepciones no controladas).
   */
  static async loadNormalizedModel(url) {
    if (!url || typeof url !== 'string') return null;

    const isBlob = url.startsWith('blob:');
    const isRemote = ModelLoader.#isRemoteUrl(url);
    if (!isBlob && ModelLoader.#missingUrls.has(url)) return null;

    if (!isBlob && !isRemote) {
      const available = await ModelLoader.#getAvailableModels();
      if (available && !available.has(ModelLoader.#fileKey(url))) {
        ModelLoader.#missingUrls.add(url);
        return null;
      }
    }

    const entry = await ModelLoader.#getOrFetchEntry(url, isBlob);
    if (!entry) return null;

    return ModelLoader.#instantiateEntry(entry, url, isBlob);
  }

  static async #getOrFetchEntry(url, isBlob) {
    if (!isBlob && ModelLoader.#cache.has(url)) return ModelLoader.#cache.get(url);
    if (!isBlob && ModelLoader.#inflight.has(url)) return ModelLoader.#inflight.get(url);

    const promise = ModelLoader.#fetchAndParse(url, isBlob);
    if (!isBlob) ModelLoader.#inflight.set(url, promise);

    try {
      const result = await promise;
      if (result && !isBlob) ModelLoader.#cache.set(url, result);
      return result;
    } finally {
      if (!isBlob) ModelLoader.#inflight.delete(url);
    }
  }

  static async #fetchAndParse(url, isBlob) {
    try {
      const res = await fetch(url, isBlob ? undefined : { mode: 'cors' });
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok || contentType.includes('text/html')) {
        if (!isBlob) ModelLoader.#missingUrls.add(url);
        return null;
      }

      const buffer = await res.arrayBuffer();
      if (!buffer || buffer.byteLength < 12) {
        if (!isBlob) ModelLoader.#missingUrls.add(url);
        return null;
      }

      const basePath = isBlob ? '' : url.slice(0, url.lastIndexOf('/') + 1);
      const gltf = await new Promise((resolve, reject) => {
        ModelLoader.#loader.parse(buffer, basePath, resolve, reject);
      });

      if (!gltf?.scene) {
        if (!isBlob) ModelLoader.#missingUrls.add(url);
        return null;
      }

      return {
        scene: gltf.scene,
        animations: Array.isArray(gltf.animations) ? gltf.animations : []
      };
    } catch {
      if (!isBlob) ModelLoader.#missingUrls.add(url);
      return null;
    }
  }

  static async #getSharedMixamoClips() {
    if (!ModelLoader.#mixamoClipsPromise) {
      ModelLoader.#mixamoClipsPromise = (async () => {
        const donor = (await ModelLoader.#getOrFetchEntry(CDN_XBOT, false))
          || (await ModelLoader.#getOrFetchEntry(CDN_SOLDIER, false));
        return donor?.animations || [];
      })();
    }
    return ModelLoader.#mixamoClipsPromise;
  }

  /**
   * Si un modelo Mixamo (como Michelle.glb) carece de clips idle/walk/run propios,
   * transfiere las pistas de rotación (.quaternion) compatibles desde Xbot/Soldier.
   */
  static async #buildEffectiveAnimations(clonedScene, rawClips) {
    const clips = Array.isArray(rawClips) ? [...rawClips] : [];
    const missingStates = Object.entries(LOCOMOTION_STATES)
      .filter(([, re]) => !clips.some((c) => re.test(c.name || '')))
      .map(([state]) => state);

    if (!missingStates.length) return clips;

    const boneMap = new Map();
    let hasMixamoRig = false;
    clonedScene.traverse((obj) => {
      if (!obj.isBone) return;
      if (/mixamorig/i.test(obj.name)) hasMixamoRig = true;
      const key = ModelLoader.#normalizeBoneKey(obj.name);
      if (key && !boneMap.has(key)) boneMap.set(key, obj.name);
    });

    if (!hasMixamoRig || !boneMap.has('hips')) return clips;

    const donorClips = await ModelLoader.#getSharedMixamoClips();
    if (!donorClips.length) return clips;

    // Preservar el clip nativo (ej. Samba de Michelle.glb) como baile real
    const remappedNative = clips.map((clip, idx) => {
      const name = clip.name || '';
      const isGeneric = !name || /^(mixamo\.com|take\s*0*1|animation)$/i.test(name);
      if (idx === 0 && isGeneric) {
        const danceCopy = clip.clone();
        danceCopy.name = 'Dance';
        return danceCopy;
      }
      return clip;
    });

    for (const state of missingStates) {
      const donor = donorClips.find((c) => LOCOMOTION_STATES[state].test(c.name || ''));
      if (!donor) continue;
      const tracks = [];
      for (const track of donor.tracks) {
        const dot = track.name.lastIndexOf('.');
        if (dot <= 0) continue;
        const prop = track.name.slice(dot + 1);
        if (prop !== 'quaternion') continue;
        const rawBone = track.name.slice(0, dot);
        const targetBone = boneMap.get(ModelLoader.#normalizeBoneKey(rawBone));
        if (!targetBone) continue;
        const clonedTrack = track.clone();
        clonedTrack.name = `${targetBone}.quaternion`;
        tracks.push(clonedTrack);
      }
      if (tracks.length >= 6) {
        remappedNative.push(new THREE.AnimationClip(state, donor.duration, tracks));
      }
    }

    return remappedNative;
  }

  static async #instantiateEntry(entry, url, disposeGeometryAndTextures) {
    const clonedScene = SkeletonUtils.clone(entry.scene);
    // Soldier.glb mira hacia -Z en el repositorio de Three.js; lo giramos a +Z
    if (/soldier\.glb(?:[?#]|$)/i.test(url)) {
      clonedScene.rotation.y = Math.PI;
    }

    const pivot = new THREE.Group();
    pivot.add(clonedScene);

    const root = new THREE.Group();
    root.add(pivot);

    ModelLoader.#normalizeTransform(pivot);
    const { clonedMaterials, geometries, textures } = ModelLoader.#prepareMeshesAndMaterials(clonedScene);
    const animations = await ModelLoader.#buildEffectiveAnimations(clonedScene, entry.animations);

    const dispose = () => {
      for (const mat of clonedMaterials) mat.dispose();
      clonedMaterials.clear();
      if (disposeGeometryAndTextures) {
        for (const geo of geometries) geo.dispose();
        for (const tex of textures) tex.dispose();
      }
      geometries.clear();
      textures.clear();
      root.clear();
    };

    return { root, animations, sourceUrl: url, dispose };
  }

  static #normalizeTransform(pivot) {
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pivot);
    if (box.isEmpty()) return;

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const height = size.y > 0.001 ? size.y : TARGET_HEIGHT;
    const scale = TARGET_HEIGHT / height;

    pivot.scale.setScalar(scale);
    pivot.position.set(
      -center.x * scale,
      -box.min.y * scale,
      -center.z * scale
    );
    pivot.updateMatrixWorld(true);
  }

  static #prepareMeshesAndMaterials(scene) {
    const clonedMaterials = new Set();
    const geometries = new Set();
    const textures = new Set();
    const materialClones = new Map();

    const cloneMaterial = (mat) => {
      if (!mat) return mat;
      if (materialClones.has(mat)) return materialClones.get(mat);

      const clone = mat.clone();
      if (clone.isMeshStandardMaterial) {
        const hasEmissive = Boolean(clone.emissiveMap)
          || (clone.emissive && clone.emissive.getHex() !== 0 && (clone.emissiveIntensity ?? 1) > 0);
        if (!hasEmissive) {
          const currentEnv = typeof clone.envMapIntensity === 'number' ? clone.envMapIntensity : 1;
          clone.envMapIntensity = Math.min(currentEnv, MAX_ENV_INTENSITY);
        }
      }

      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
        if (clone[key]?.isTexture) textures.add(clone[key]);
      }

      materialClones.set(mat, clone);
      clonedMaterials.add(clone);
      return clone;
    };

    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (obj.isSkinnedMesh) obj.frustumCulled = false;
      if (obj.geometry) geometries.add(obj.geometry);
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map(cloneMaterial);
      } else if (obj.material) {
        obj.material = cloneMaterial(obj.material);
      }
    });

    return { clonedMaterials, geometries, textures };
  }
}
