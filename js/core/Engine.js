import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WorldThemes } from '../world/WorldThemes.js';

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
  #fillLight = null;
  #skyDome = null;
  #starField = null;
  #motes = null;
  #moteVelocities = null;
  #elapsed = 0;
  #onResizeBound = null;
  #envIntensity = 0.56;
  #marbleRoughness = 0.48;
  #envSyncTimer = 1;

  constructor(container) {
    this.#container = container;
  }

  init() {
    const width = this.#container.clientWidth || window.innerWidth;
    const height = this.#container.clientHeight || window.innerHeight;

    this.#renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.#renderer.setSize(width, height);
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 0.90;
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#container.appendChild(this.#renderer.domElement);

    this.#scene = new THREE.Scene();
    this.#scene.fog = new THREE.FogExp2(0xffe7f0, 0.0065);

    this.#camera = new THREE.PerspectiveCamera(54, width / height, 0.15, 280);
    this.#camera.position.set(22, 16, 26);

    // Entorno PBR realista para metales oro rosa y cristales
    this.#pmremGenerator = new THREE.PMREMGenerator(this.#renderer);
    this.#envRT = this.#pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.#scene.environment = this.#envRT.texture;

    this.#setupLights();
    this.#setupSkyAndParticles();
    this.#setupPostProcessing(width, height);

    this.#onResizeBound = () => this.#handleResize();
    window.addEventListener('resize', this.#onResizeBound);
  }

  #setupLights() {
    this.#hemiLight = new THREE.HemisphereLight(0xfff5fa, 0xc79ab0, 0.68);
    this.#scene.add(this.#hemiLight);

    this.#sunLight = new THREE.DirectionalLight(0xfff3e0, 1.3);
    this.#sunLight.position.set(34, 48, 28);
    this.#sunLight.castShadow = true;
    this.#sunLight.shadow.mapSize.set(2048, 2048);
    this.#sunLight.shadow.camera.near = 6;
    this.#sunLight.shadow.camera.far = 160;
    const d = 68;
    this.#sunLight.shadow.camera.left = -d;
    this.#sunLight.shadow.camera.right = d;
    this.#sunLight.shadow.camera.top = d;
    this.#sunLight.shadow.camera.bottom = -d;
    this.#sunLight.shadow.bias = -0.0005;
    this.#sunLight.shadow.normalBias = 0.03;
    this.#scene.add(this.#sunLight);

    this.#fillLight = new THREE.DirectionalLight(0xffb6d5, 0.36);
    this.#fillLight.position.set(-30, 22, -25);
    this.#scene.add(this.#fillLight);
  }

  #setupSkyAndParticles() {
    const skyGeo = new THREE.SphereGeometry(190, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTopColor: { value: new THREE.Color(0x88b4f8) },
        uMidColor: { value: new THREE.Color(0xffcde2) },
        uBottomColor: { value: new THREE.Color(0xfff3dc) }
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uBottomColor;
        varying vec3 vWorldPos;
        void main() {
          float h = normalize(vWorldPos).y;
          vec3 col = mix(uBottomColor, uMidColor, smoothstep(-0.08, 0.25, h));
          col = mix(col, uTopColor, smoothstep(0.22, 0.85, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.#skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.#scene.add(this.#skyDome);

    // Campo estelar para Gala Imperial
    const starCount = 420;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.18 + Math.random() * 0.82);
      const r = 165;
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
    this.#scene.add(this.#starField);

    // Partículas ambientales flotantes (motas doradas / pétalos / luciérnagas)
    const moteCount = 180;
    const motePos = new Float32Array(moteCount * 3);
    this.#moteVelocities = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      motePos[i * 3] = (Math.random() - 0.5) * 105;
      motePos[i * 3 + 1] = 1 + Math.random() * 18;
      motePos[i * 3 + 2] = (Math.random() - 0.5) * 105 - 5;
      this.#moteVelocities[i * 3] = (Math.random() - 0.5) * 0.45;
      this.#moteVelocities[i * 3 + 1] = 0.15 + Math.random() * 0.35;
      this.#moteVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.45;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
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

  #setupPostProcessing(width, height) {
    this.#composer = new EffectComposer(this.#renderer);
    this.#composer.addPass(new RenderPass(this.#scene, this.#camera));
    this.#bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
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

  /**
   * Aplica un tema visual calibrando luces, exposición, bloom, entorno PBR y etiquetas.
   */
  applyTheme(theme) {
    if (!theme) return;
    const u = this.#skyDome.material.uniforms;
    u.uTopColor.value.setHex(theme.skyTop);
    u.uMidColor.value.setHex(theme.skyMid);
    u.uBottomColor.value.setHex(theme.skyBottom);

    this.#scene.fog.color.setHex(theme.fogColor);
    this.#scene.fog.density = theme.fogDensity;

    this.#hemiLight.color.setHex(theme.hemiSky);
    this.#hemiLight.groundColor.setHex(theme.hemiGround);
    this.#hemiLight.intensity = theme.hemiIntensity;

    this.#sunLight.color.setHex(theme.sunColor ?? 0xfff3e0);
    this.#sunLight.intensity = Math.min(1.3, theme.sunIntensity ?? 1.3);
    this.#sunLight.position.set(...theme.sunPosition);

    this.#fillLight.color.setHex(theme.fillColor);
    this.#fillLight.intensity = theme.fillIntensity;

    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = Math.min(0.90, theme.exposure ?? 0.90);
    // three r160 no soporta scene.environmentIntensity (llegó en r163):
    // lo aplicamos material a material con envMapIntensity.
    this.#envIntensity = Math.min(theme.envIntensity ?? 0.56, 0.60);
    this.#marbleRoughness = Math.max(0.48, theme.marbleRoughness ?? 0.48);
    this.#syncEnvIntensity();
    this.#calibrateSceneMaterials();

    this.#bloomPass.threshold = Math.max(0.96, theme.bloomThreshold ?? 0.96);
    this.#bloomPass.strength = Math.min(0.20, theme.bloomStrength ?? 0.20);
    this.#bloomPass.radius = theme.bloomRadius ?? 0.30;

    this.#starField.material.opacity = theme.starsOpacity;
    this.#motes.material.color.setHex(theme.moteColor);
    this.#motes.material.size = theme.moteSize;
  }

  #syncEnvIntensity() {
    if (!this.#scene) return;
    const value = Math.min(this.#envIntensity, 0.60);
    this.#scene.traverse((obj) => {
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      for (const m of mats) {
        if ('envMapIntensity' in m) {
          const target = m.isMeshPhysicalMaterial ? Math.min(value, 0.60) : value;
          if (m.envMapIntensity !== target) m.envMapIntensity = target;
        }
      }
    });
  }

  #calibrateSceneMaterials() {
    if (!this.#scene) return;
    const labelDefaults = WorldThemes.getLabelDefaults();
    const minRoughness = Math.max(0.48, this.#marbleRoughness);
    this.#scene.traverse((obj) => {
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      for (const mat of mats) {
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
    // Los personajes/objetos creados después del tema (jugadores remotos, minijuegos) también lo reciben
    this.#envSyncTimer += dt;
    if (this.#envSyncTimer >= 1) {
      this.#envSyncTimer = 0;
      this.#syncEnvIntensity();
      this.#calibrateSceneMaterials();
    }
    if (this.#motes) {
      const pos = this.#motes.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i) + Math.sin(this.#elapsed * 0.7 + i) * 0.008 + this.#moteVelocities[i * 3] * dt;
        let y = pos.getY(i) + this.#moteVelocities[i * 3 + 1] * dt;
        let z = pos.getZ(i) + this.#moteVelocities[i * 3 + 2] * dt;
        if (y > 20) y = 0.8;
        if (x > 55) x = -55;
        if (x < -55) x = 55;
        if (z > 52) z = -56;
        if (z < -56) z = 52;
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    }
    if (this.#starField && this.#starField.material.opacity > 0.05) {
      this.#starField.rotation.y += dt * 0.006;
    }
  }

  render() {
    this.#composer.render();
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

  #handleResize() {
    const width = this.#container.clientWidth || window.innerWidth;
    const height = this.#container.clientHeight || window.innerHeight;
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setSize(width, height);
    this.#composer.setSize(width, height);
    this.#bloomPass.setSize(width, height);
  }

  dispose() {
    if (this.#onResizeBound) {
      window.removeEventListener('resize', this.#onResizeBound);
    }
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
