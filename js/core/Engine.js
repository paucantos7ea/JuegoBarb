import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WorldThemes } from '../world/WorldThemes.js';

const QUALITY_STORAGE_KEY = 'reino_rosa_quality_v1';

const QUALITY_PROFILES = {
  low: {
    id: 'low',
    label: 'Bajo',
    maxPixelRatio: 1.0,
    shadows: false,
    shadowMapSize: 1024,
    shadowType: THREE.PCFShadowMap,
    bloom: false,
    bloomScale: 0.5,
    autoDisableBloomBelowFps: 0,
    far: 145,
    fogBoost: 1.32,
    moteDrawCount: 80
  },
  medium: {
    id: 'medium',
    label: 'Medio',
    maxPixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 1024,
    shadowType: THREE.PCFShadowMap,
    bloom: true,
    bloomScale: 0.5,
    autoDisableBloomBelowFps: 35,
    far: 225,
    fogBoost: 1.0,
    moteDrawCount: 150
  },
  high: {
    id: 'high',
    label: 'Alto',
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 2048,
    shadowType: THREE.PCFSoftShadowMap,
    bloom: true,
    bloomScale: 0.75,
    autoDisableBloomBelowFps: 0,
    far: 330,
    fogBoost: 1.0,
    moteDrawCount: 240
  }
};

/**
 * Motor 3D principal: WebGLRenderer, iluminación, cielo, post-procesado y calibración PBR.
 */
export class Engine {
  #container;
  #renderer = null;
  #scene = null;
  #camera = null;
  #composer = null;
  #bloomPass = null;
  #pmremGenerator = null;
  #envRT = null;
  #hemiLight = null;
  #sunLight = null;
  #skyDome = null;
  #starField = null;
  #motes = null;
  #moteVelocities = null;
  #moteDrawCount = 150;
  #elapsed = 0;
  #onResizeBound = null;
  #onQualityEventBound = null;
  #envIntensity = 0.56;
  #marbleRoughness = 0.48;
  #currentTheme = null;
  #quality = 'medium';
  #calibrationVersion = 1;
  #sceneCheckTimer = 0;
  #lastSceneChildCount = 0;
  #bloomAutoDisabled = false;
  #warmupElapsed = 0;
  #lowFpsElapsed = 0;
  #fps = 60;
  #frameMs = 16.7;
  #frameCount = 0;
  #lastStatsSampleMs = 0;
  #lastRenderNowMs = 0;
  #statsListener = null;
  #statsPayload = { fps: 60, frameMs: 16.7, drawCalls: 0, quality: 'medium', bloomActive: true };

  constructor(container) {
    this.#container = container;
  }

  #readSavedQuality() {
    try {
      const saved = localStorage.getItem(QUALITY_STORAGE_KEY);
      if (saved && Object.hasOwn(QUALITY_PROFILES, saved)) return saved;
    } catch {
      // Sin acceso a localStorage
    }
    return 'medium';
  }

  #saveQuality(quality) {
    try {
      localStorage.setItem(QUALITY_STORAGE_KEY, quality);
    } catch {
      // Sin acceso a localStorage
    }
  }

  init() {
    const width = this.#container.clientWidth || window.innerWidth;
    const height = this.#container.clientHeight || window.innerHeight;
    this.#quality = this.#readSavedQuality();
    const profile = QUALITY_PROFILES[this.#quality];
    this.#moteDrawCount = profile.moteDrawCount;

    this.#renderer = new THREE.WebGLRenderer({
      antialias: this.#quality !== 'low',
      powerPreference: 'high-performance'
    });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio));
    this.#renderer.setSize(width, height);
    this.#renderer.shadowMap.enabled = profile.shadows;
    this.#renderer.shadowMap.type = profile.shadowType;
    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 0.90;
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#container.appendChild(this.#renderer.domElement);
    this.#container.__engine = this;

    this.#scene = new THREE.Scene();
    this.#scene.fog = new THREE.FogExp2(0xffe7f0, 0.0065 * profile.fogBoost);

    this.#camera = new THREE.PerspectiveCamera(54, width / height, 0.15, profile.far);
    this.#camera.position.set(28, 19, 32);

    // Entorno PBR realista para metales oro rosa y cristales
    this.#pmremGenerator = new THREE.PMREMGenerator(this.#renderer);
    this.#envRT = this.#pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.#scene.environment = this.#envRT.texture;

    this.#setupLights(profile);
    this.#setupSkyAndParticles(profile);
    this.#setupPostProcessing(width, height, profile);

    this.#onResizeBound = () => this.#handleResize();
    this.#onQualityEventBound = (e) => {
      const q = e?.detail?.quality;
      if (q) this.setQuality(q);
    };
    window.addEventListener('resize', this.#onResizeBound);
    window.addEventListener('reino:set-quality', this.#onQualityEventBound);
  }

  #setupLights(profile) {
    this.#hemiLight = new THREE.HemisphereLight(0xfff5fa, 0xc79ab0, 0.68);
    this.#scene.add(this.#hemiLight);

    this.#sunLight = new THREE.DirectionalLight(0xfff3e0, 1.3);
    this.#sunLight.position.set(34, 48, 28);
    this.#sunLight.castShadow = profile.shadows;
    this.#sunLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
    this.#sunLight.shadow.camera.near = 6;
    this.#sunLight.shadow.camera.far = 210;
    const d = 86;
    this.#sunLight.shadow.camera.left = -d;
    this.#sunLight.shadow.camera.right = d;
    this.#sunLight.shadow.camera.top = d;
    this.#sunLight.shadow.camera.bottom = -d;
    this.#sunLight.shadow.bias = -0.0005;
    this.#sunLight.shadow.normalBias = 0.03;
    this.#sunLight.target.position.set(0, 0, -12);
    this.#scene.add(this.#sunLight.target);
    this.#scene.add(this.#sunLight);
  }

  #setupSkyAndParticles(profile) {
    const skyGeo = new THREE.SphereGeometry(240, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTopColor: { value: new THREE.Color(0x88b4f8) },
        uMidColor: { value: new THREE.Color(0xffcde2) },
        uBottomColor: { value: new THREE.Color(0xfff3dc) }
      },
      vertexShader: `
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = position;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uBottomColor;
        varying vec3 vLocalPos;
        void main() {
          float h = normalize(vLocalPos).y;
          vec3 col = mix(uBottomColor, uMidColor, smoothstep(-0.08, 0.25, h));
          col = mix(col, uTopColor, smoothstep(0.22, 0.85, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.#skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.#skyDome.frustumCulled = false;
    this.#scene.add(this.#skyDome);

    // Campo estelar para Gala Imperial
    const starCount = 420;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.18 + Math.random() * 0.82);
      const r = 215;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xfff5d6,
      size: 1.5,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.#starField = new THREE.Points(starGeo, starMat);
    this.#starField.frustumCulled = false;
    this.#starField.visible = false;
    this.#scene.add(this.#starField);

    // Partículas ambientales flotantes (motas doradas / pétalos / luciérnagas)
    const moteCount = 240;
    const motePos = new Float32Array(moteCount * 3);
    this.#moteVelocities = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      motePos[i * 3] = (Math.random() - 0.5) * 170;
      motePos[i * 3 + 1] = 1 + Math.random() * 20;
      motePos[i * 3 + 2] = (Math.random() - 0.5) * 160 - 8;
      this.#moteVelocities[i * 3] = (Math.random() - 0.5) * 0.45;
      this.#moteVelocities[i * 3 + 1] = 0.15 + Math.random() * 0.35;
      this.#moteVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.45;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    moteGeo.setDrawRange(0, profile.moteDrawCount);
    const moteMat = new THREE.PointsMaterial({
      color: 0xffe4a8,
      size: 0.28,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.#motes = new THREE.Points(moteGeo, moteMat);
    this.#scene.add(this.#motes);
  }

  #setupPostProcessing(width, height, profile) {
    this.#composer = new EffectComposer(this.#renderer);
    this.#composer.addPass(new RenderPass(this.#scene, this.#camera));
    const bloomW = Math.max(1, Math.floor(width * profile.bloomScale));
    const bloomH = Math.max(1, Math.floor(height * profile.bloomScale));
    this.#bloomPass = new UnrealBloomPass(
      new THREE.Vector2(bloomW, bloomH),
      0.20,
      0.30,
      0.96
    );
    this.#bloomPass.threshold = 0.96;
    this.#bloomPass.strength = 0.20;
    this.#bloomPass.radius = 0.30;
    this.#composer.addPass(this.#bloomPass);
    this.#composer.addPass(new OutputPass());
  }

  #updateBloomSize(width, height) {
    if (!this.#bloomPass) return;
    const profile = QUALITY_PROFILES[this.#quality];
    const bloomW = Math.max(1, Math.floor(width * profile.bloomScale));
    const bloomH = Math.max(1, Math.floor(height * profile.bloomScale));
    this.#bloomPass.setSize(bloomW, bloomH);
  }

  #isBloomActive() {
    const profile = QUALITY_PROFILES[this.#quality];
    return Boolean(profile.bloom && !this.#bloomAutoDisabled);
  }

  /**
   * Cambia el perfil de calidad gráfica ('low' | 'medium' | 'high') sin recrear el canvas.
   */
  setQuality(quality) {
    if (!Object.hasOwn(QUALITY_PROFILES, quality)) return;
    const prevQuality = this.#quality;
    this.#quality = quality;
    this.#saveQuality(quality);
    this.#bloomAutoDisabled = false;
    this.#lowFpsElapsed = 0;
    this.#warmupElapsed = 0;

    if (!this.#renderer || !this.#camera || !this.#scene) return;
    const profile = QUALITY_PROFILES[quality];
    const width = this.#container.clientWidth || window.innerWidth;
    const height = this.#container.clientHeight || window.innerHeight;

    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio));
    this.#renderer.setSize(width, height);
    this.#composer?.setSize(width, height);
    this.#updateBloomSize(width, height);

    if (this.#camera.far !== profile.far) {
      this.#camera.far = profile.far;
      this.#camera.updateProjectionMatrix();
    }

    if (this.#scene.fog) {
      const baseDensity = this.#currentTheme?.fogDensity ?? 0.0048;
      this.#scene.fog.density = baseDensity * profile.fogBoost;
    }

    this.#moteDrawCount = profile.moteDrawCount;
    this.#motes?.geometry?.setDrawRange(0, profile.moteDrawCount);

    const prevShadowsEnabled = this.#renderer.shadowMap.enabled;
    const prevShadowType = this.#renderer.shadowMap.type;
    const prevMapSize = this.#sunLight ? this.#sunLight.shadow.mapSize.x : profile.shadowMapSize;
    const shadowToggleChanged = prevShadowsEnabled !== profile.shadows;
    const shadowTypeChanged = prevShadowType !== profile.shadowType;
    const mapSizeChanged = prevMapSize !== profile.shadowMapSize;

    if (shadowToggleChanged || shadowTypeChanged || mapSizeChanged) {
      if (this.#sunLight?.shadow?.map) {
        this.#sunLight.shadow.map.dispose();
        this.#sunLight.shadow.map = null;
      }
      this.#renderer.shadowMap.enabled = profile.shadows;
      this.#renderer.shadowMap.type = profile.shadowType;
      if (this.#sunLight) {
        this.#sunLight.castShadow = profile.shadows;
        this.#sunLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
        this.#sunLight.shadow.needsUpdate = true;
      }
      if (shadowToggleChanged || shadowTypeChanged) {
        this.#scene.traverse((obj) => {
          const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
          for (const mat of mats) {
            mat.needsUpdate = true;
          }
        });
      }
    }

    if (prevQuality !== quality) {
      this.#calibrationVersion += 1;
      this.#calibrateSceneMaterials();
    }

    this.#emitStats(this.#renderer.info.render.calls);
  }

  getQuality() {
    return this.#quality;
  }

  getFps() {
    return this.#fps;
  }

  setStatsListener(fn) {
    this.#statsListener = typeof fn === 'function' ? fn : null;
    if (this.#statsListener && this.#renderer) {
      this.#emitStats(this.#renderer.info.render.calls);
    }
  }

  #emitStats(drawCalls) {
    this.#statsPayload.fps = this.#fps;
    this.#statsPayload.frameMs = this.#frameMs;
    this.#statsPayload.drawCalls = drawCalls;
    this.#statsPayload.quality = this.#quality;
    this.#statsPayload.bloomActive = this.#isBloomActive();
    this.#statsListener?.(this.#statsPayload);
  }

  /**
   * Aplica un tema visual calibrando luces, exposición, bloom, entorno PBR y etiquetas.
   */
  applyTheme(theme) {
    if (!theme) return;
    this.#currentTheme = theme;
    const profile = QUALITY_PROFILES[this.#quality];

    const u = this.#skyDome.material.uniforms;
    u.uTopColor.value.setHex(theme.skyTop);
    u.uMidColor.value.setHex(theme.skyMid);
    u.uBottomColor.value.setHex(theme.skyBottom);

    this.#scene.fog.color.setHex(theme.fogColor);
    this.#scene.fog.density = theme.fogDensity * profile.fogBoost;

    this.#hemiLight.color.setHex(theme.hemiSky);
    this.#hemiLight.groundColor.setHex(theme.hemiGround);
    this.#hemiLight.intensity = theme.hemiIntensity + (theme.fillIntensity ?? 0.34) * 0.42;

    this.#sunLight.color.setHex(theme.sunColor ?? 0xfff3e0);
    this.#sunLight.intensity = Math.min(1.3, theme.sunIntensity ?? 1.3);
    this.#sunLight.position.set(...theme.sunPosition);

    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = Math.min(0.90, theme.exposure ?? 0.90);
    // three r160 no soporta scene.environmentIntensity (llegó en r163):
    // lo aplicamos material a material con envMapIntensity.
    this.#envIntensity = Math.min(theme.envIntensity ?? 0.56, 0.60);
    this.#marbleRoughness = Math.max(0.48, theme.marbleRoughness ?? 0.48);

    this.#calibrationVersion += 1;
    this.#lastSceneChildCount = this.#scene.children.length;
    this.#calibrateSceneMaterials();

    this.#bloomPass.threshold = Math.max(0.96, theme.bloomThreshold ?? 0.96);
    this.#bloomPass.strength = Math.min(0.20, theme.bloomStrength ?? 0.20);
    this.#bloomPass.radius = theme.bloomRadius ?? 0.30;

    this.#starField.material.opacity = theme.starsOpacity;
    this.#starField.visible = theme.starsOpacity > 0.01;
    this.#motes.material.color.setHex(theme.moteColor);
    this.#motes.material.size = theme.moteSize;
  }

  #isInsideCharacter(obj) {
    let cur = obj;
    while (cur) {
      if (cur.userData?.isCharacter === true) return true;
      cur = cur.parent;
    }
    return false;
  }

  #calibrateSceneMaterials() {
    if (!this.#scene) return;
    const labelDefaults = WorldThemes.getLabelDefaults();
    const minRoughness = Math.max(0.48, this.#marbleRoughness);
    const envValue = Math.min(this.#envIntensity, 0.60);
    const version = this.#calibrationVersion;

    this.#scene.traverse((obj) => {
      if (obj.userData?.__shadowCalibratedVersion !== version) {
        if (obj.userData) obj.userData.__shadowCalibratedVersion = version;
        if (obj.isPoints || obj.isSprite) {
          obj.castShadow = false;
        } else if (obj.isMesh && obj.castShadow && !this.#isInsideCharacter(obj)) {
          if (obj.geometry && !obj.geometry.boundingSphere) {
            obj.geometry.computeBoundingSphere();
          }
          const radius = obj.geometry?.boundingSphere?.radius ?? 1;
          if (
            radius < 0.45 ||
            (obj.isInstancedMesh && (obj.userData?.isCoin || obj.userData?.isFlower || obj.userData?.isParticle))
          ) {
            obj.castShadow = false;
          }
        }
      }

      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      for (const mat of mats) {
        if (!mat || mat.userData?.__calibratedVersion === version) continue;
        if (mat.userData) mat.userData.__calibratedVersion = version;

        if ('envMapIntensity' in mat) {
          const target = mat.isMeshPhysicalMaterial ? Math.min(envValue, 0.60) : envValue;
          if (mat.envMapIntensity !== target) mat.envMapIntensity = target;
        }

        if (mat.userData?.isVfx) {
          if (obj.isInstancedMesh) obj.castShadow = false;
          continue;
        }
        if (obj.isSprite || mat.isSpriteMaterial) {
          if (mat.toneMapped !== labelDefaults.toneMapped) {
            // toneMapped forma parte de la clave del shader: requiere recompilar
            mat.toneMapped = labelDefaults.toneMapped;
            mat.needsUpdate = true;
          }
          if (mat.color) {
            const maxCh = labelDefaults.maxChannel;
            mat.color.r = Math.min(mat.color.r, maxCh);
            mat.color.g = Math.min(mat.color.g, maxCh);
            mat.color.b = Math.min(mat.color.b, maxCh);
          }
          continue;
        }
        if (mat.isMeshPhysicalMaterial) {
          mat.envMapIntensity = Math.min(mat.envMapIntensity ?? 1, 0.60);
        } else if (
          mat.isMeshStandardMaterial &&
          !mat.userData?.preserveRoughness &&
          mat.metalness < 0.35 &&
          (!mat.emissiveIntensity || mat.emissiveIntensity < 0.2)
        ) {
          mat.roughness = Math.max(mat.roughness, minRoughness);
          mat.envMapIntensity = Math.min(mat.envMapIntensity ?? 1, 0.60);
        }
      }
    });
  }

  update(dt) {
    this.#elapsed += dt;
    // Calibrar solo objetos nuevos si cambió la jerarquía raíz de la escena (cada 2.5s)
    this.#sceneCheckTimer += dt;
    if (this.#sceneCheckTimer >= 2.5) {
      this.#sceneCheckTimer = 0;
      const count = this.#scene ? this.#scene.children.length : 0;
      if (count !== this.#lastSceneChildCount) {
        this.#lastSceneChildCount = count;
        this.#calibrateSceneMaterials();
      }
    }
    if (this.#motes) {
      const pos = this.#motes.geometry.attributes.position;
      const activeCount = Math.min(this.#moteDrawCount, pos.count);
      for (let i = 0; i < activeCount; i++) {
        let x = pos.getX(i) + Math.sin(this.#elapsed * 0.7 + i) * 0.008 + this.#moteVelocities[i * 3] * dt;
        let y = pos.getY(i) + this.#moteVelocities[i * 3 + 1] * dt;
        let z = pos.getZ(i) + this.#moteVelocities[i * 3 + 2] * dt;
        if (y > 22) y = 0.8;
        if (x > 85) x = -85;
        if (x < -85) x = 85;
        if (z > 72) z = -88;
        if (z < -88) z = 72;
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    }
    if (this.#starField && this.#starField.visible && this.#starField.material.opacity > 0.05) {
      this.#starField.rotation.y += dt * 0.006;
    }
  }

  render() {
    if (this.#camera && this.#skyDome && this.#starField) {
      const skyScale = (this.#camera.far * 0.82) / 240;
      this.#skyDome.position.copy(this.#camera.position);
      this.#skyDome.scale.setScalar(skyScale);
      this.#starField.position.copy(this.#camera.position);
      this.#starField.scale.setScalar(skyScale);
    }

    const bloomActive = this.#isBloomActive();
    if (bloomActive) {
      this.#composer.render();
    } else {
      this.#renderer.render(this.#scene, this.#camera);
    }

    const now = performance.now();
    const frameDeltaSec = this.#lastRenderNowMs > 0 ? (now - this.#lastRenderNowMs) / 1000 : 0;
    this.#lastRenderNowMs = now;

    if (document.hidden || frameDeltaSec > 0.5) {
      this.#lastStatsSampleMs = now;
      this.#frameCount = 0;
      this.#lowFpsElapsed = 0;
      return;
    }

    if (this.#lastStatsSampleMs === 0) {
      this.#lastStatsSampleMs = now;
    }
    this.#frameCount += 1;
    const elapsedMs = now - this.#lastStatsSampleMs;
    if (elapsedMs >= 400) {
      const intervalSec = elapsedMs / 1000;
      this.#fps = Math.round(this.#frameCount / intervalSec);
      this.#frameMs = elapsedMs / this.#frameCount;
      this.#frameCount = 0;
      this.#lastStatsSampleMs = now;

      const threshold = QUALITY_PROFILES[this.#quality].autoDisableBloomBelowFps;
      if (threshold > 0 && !this.#bloomAutoDisabled) {
        this.#warmupElapsed += intervalSec;
        if (this.#warmupElapsed >= 3.5) {
          if (this.#fps < threshold) {
            this.#lowFpsElapsed += intervalSec;
            if (this.#lowFpsElapsed >= 2.2) {
              this.#bloomAutoDisabled = true;
            }
          } else {
            this.#lowFpsElapsed = 0;
          }
        }
      }

      this.#emitStats(this.#renderer.info.render.calls);
    }
  }

  getScene() {
    return this.#scene;
  }

  getCamera() {
    return this.#camera;
  }

  getRenderer() {
    return this.#renderer;
  }

  getDomElement() {
    return this.#renderer?.domElement ?? null;
  }

  getElapsed() {
    return this.#elapsed;
  }

  #handleResize() {
    const width = this.#container.clientWidth || window.innerWidth;
    const height = this.#container.clientHeight || window.innerHeight;
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setSize(width, height);
    this.#composer.setSize(width, height);
    this.#updateBloomSize(width, height);
  }

  dispose() {
    if (this.#onResizeBound) {
      window.removeEventListener('resize', this.#onResizeBound);
    }
    if (this.#onQualityEventBound) {
      window.removeEventListener('reino:set-quality', this.#onQualityEventBound);
    }
    if (this.#container?.__engine === this) {
      delete this.#container.__engine;
    }
    this.#statsListener = null;
    this.#skyDome?.geometry.dispose();
    this.#skyDome?.material.dispose();
    this.#starField?.geometry.dispose();
    this.#starField?.material.dispose();
    this.#motes?.geometry.dispose();
    this.#motes?.material.dispose();
    this.#envRT?.dispose();
    this.#pmremGenerator?.dispose();
    this.#composer?.dispose();
    this.#renderer?.dispose();
    if (this.#renderer?.domElement?.parentNode) {
      this.#renderer.domElement.parentNode.removeChild(this.#renderer.domElement);
    }
  }
}
