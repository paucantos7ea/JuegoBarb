import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const TARGET_HEIGHT = 1.75;
const MAX_ENV_INTENSITY = 0.6;

/**
 * Cargador y normalizador centralizado de modelos 3D en formato .glb/.gltf.
 * Gestiona caché compartida, carga silenciosa ante archivos ausentes,
 * clonado de esqueletos y materiales por instancia, y normalización de altura.
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

  /** Índice opcional de modelos presentes: evita peticiones 404 (y errores rojos en consola) por .glb ausentes. */
  static MANIFEST_URL = './assets/models/models.json';

  static #cache = new Map();
  static #missingUrls = new Set();
  static #inflight = new Map();
  static #loader = new GLTFLoader();
  static #manifestPromise = null;

  /**
   * Resuelve la ruta relativa de un modelo .glb a partir de un avatarId.
   * @param {string} avatarId
   * @returns {string|null}
   */
  static resolveModelUrl(avatarId) {
    return ModelLoader.MODEL_MAP[avatarId] || null;
  }

  static #fileKey(url) {
    return String(url).split(/[?#]/)[0].split('/').pop().toLowerCase();
  }

  /**
   * Lee assets/models/models.json una sola vez.
   * Devuelve un Set con los nombres de archivo disponibles, o null si el índice
   * no existe o es inválido (en ese caso se sondea cada .glb como antes).
   */
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
   * Carga de forma silenciosa y normaliza una instancia del modelo .glb indicado.
   * Devuelve null si el archivo no existe o no es un binario glTF válido.
   * @param {string} url
   * @returns {Promise<{root: THREE.Group, animations: THREE.AnimationClip[], dispose: () => void}|null>}
   */
  static async loadNormalizedModel(url) {
    if (!url || typeof url !== 'string') return null;

    const isBlob = url.startsWith('blob:');
    if (!isBlob && ModelLoader.#missingUrls.has(url)) {
      return null;
    }

    if (!isBlob) {
      const available = await ModelLoader.#getAvailableModels();
      if (available && !available.has(ModelLoader.#fileKey(url))) {
        ModelLoader.#missingUrls.add(url);
        return null;
      }
    }

    const entry = await ModelLoader.#getOrFetchEntry(url, isBlob);
    if (!entry) return null;

    return ModelLoader.#instantiateEntry(entry, isBlob);
  }

  static async #getOrFetchEntry(url, isBlob) {
    if (!isBlob && ModelLoader.#cache.has(url)) {
      return ModelLoader.#cache.get(url);
    }
    if (!isBlob && ModelLoader.#inflight.has(url)) {
      return ModelLoader.#inflight.get(url);
    }

    const promise = ModelLoader.#fetchAndParse(url, isBlob);
    if (!isBlob) {
      ModelLoader.#inflight.set(url, promise);
    }

    try {
      const result = await promise;
      if (result && !isBlob) {
        ModelLoader.#cache.set(url, result);
      }
      return result;
    } finally {
      if (!isBlob) {
        ModelLoader.#inflight.delete(url);
      }
    }
  }

  static async #fetchAndParse(url, isBlob) {
    try {
      const res = await fetch(url);
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

  static #instantiateEntry(entry, disposeGeometryAndTextures) {
    const clonedScene = SkeletonUtils.clone(entry.scene);
    const pivot = new THREE.Group();
    pivot.add(clonedScene);

    const root = new THREE.Group();
    root.add(pivot);

    ModelLoader.#normalizeTransform(pivot);
    const { clonedMaterials, geometries, textures } = ModelLoader.#prepareMeshesAndMaterials(clonedScene);

    const animations = entry.animations;
    const dispose = () => {
      for (const mat of clonedMaterials) {
        mat.dispose();
      }
      clonedMaterials.clear();

      if (disposeGeometryAndTextures) {
        for (const geo of geometries) geo.dispose();
        for (const tex of textures) tex.dispose();
      }
      geometries.clear();
      textures.clear();

      root.clear();
    };

    return { root, animations, dispose };
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
      if (obj.isSkinnedMesh) {
        obj.frustumCulled = false;
      }
      if (obj.geometry) {
        geometries.add(obj.geometry);
      }
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map(cloneMaterial);
      } else if (obj.material) {
        obj.material = cloneMaterial(obj.material);
      }
    });

    return { clonedMaterials, geometries, textures };
  }
}
