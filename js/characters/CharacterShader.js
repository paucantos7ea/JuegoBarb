import * as THREE from 'three';
import { GraphicsSync } from '../core/Engine.js';

const _neutralVec3 = new THREE.Vector3(0, 0, 0);

/**
 * Crea un bloque prealocado de uniforms por personaje (0 GC por frame).
 * Compartido entre todos los materiales NPR del mismo personaje.
 */
export function createMotionUniforms() {
  return {
    uMoveVel: { value: new THREE.Vector3(0, 0, 0) },
    uSwayAmp: { value: 0.16 },
    uTurnVel: { value: 0.0 },
    uBlink: { value: 0.0 },
    uRideFactor: { value: 0.0 }
  };
}

function getMotionRef(motionUniforms) {
  if (motionUniforms) return motionUniforms;
  return {
    uMoveVel: { value: _neutralVec3 },
    uSwayAmp: { value: 0.12 },
    uTurnVel: { value: 0.0 },
    uBlink: { value: 0.0 },
    uRideFactor: { value: 0.0 }
  };
}

/**
 * Fábrica unificada de materiales NPR-Lumen estilizados para personajes (Three.js r160 / WebGL2).
 * Integrada con GraphicsSync, sin heightFog, con sombreado cálido en piel, Angel Ring en pelo,
 * Fresnel sheen y sway GPU en sedas/tul, y picos HDR controlados solo en gemas/oro.
 *
 * @param {'skin'|'face'|'eyes'|'hair'|'silk'|'velvet'|'tulleSparkle'|'goldFiligree'|'crystalGem'} preset
 * @param {object} [params]
 * @param {object|null} [motionUniforms]
 * @returns {THREE.MeshStandardMaterial}
 */
export function createCharacterMaterial(preset, params = {}, motionUniforms = null) {
  const {
    blinkMap = null,
    swayScale = 1.0,
    swayFreq = 2.4,
    sheenColor = null,
    sheenStrength = null,
    shadowTint = null,
    sparkleDensity = 1.0,
    ...stdParams
  } = params;

  const isFace = preset === 'face';
  const isSkin = preset === 'skin' || isFace;
  const isEyes = preset === 'eyes';
  const isHair = preset === 'hair';
  const isSilk = preset === 'silk';
  const isVelvet = preset === 'velvet';
  const isTulle = preset === 'tulleSparkle';
  const isGold = preset === 'goldFiligree';
  const isGem = preset === 'crystalGem';

  const defaults = {};
  if (isSkin) {
    defaults.roughness = stdParams.roughness ?? 0.66;
    defaults.metalness = stdParams.metalness ?? 0.0;
  } else if (isEyes) {
    defaults.roughness = stdParams.roughness ?? 0.16;
    defaults.metalness = stdParams.metalness ?? 0.04;
  } else if (isHair) {
    defaults.roughness = stdParams.roughness ?? 0.34;
    defaults.metalness = stdParams.metalness ?? 0.06;
    defaults.side = stdParams.side ?? THREE.DoubleSide;
    defaults.vertexColors = stdParams.vertexColors ?? true;
  } else if (isSilk) {
    defaults.roughness = stdParams.roughness ?? 0.40;
    defaults.metalness = stdParams.metalness ?? 0.08;
    defaults.vertexColors = stdParams.vertexColors ?? true;
  } else if (isVelvet) {
    defaults.roughness = stdParams.roughness ?? 0.68;
    defaults.metalness = stdParams.metalness ?? 0.04;
    defaults.vertexColors = stdParams.vertexColors ?? true;
  } else if (isTulle) {
    defaults.roughness = stdParams.roughness ?? 0.24;
    defaults.metalness = stdParams.metalness ?? 0.05;
    defaults.transparent = true;
    defaults.depthWrite = false;
    defaults.side = THREE.DoubleSide;
    defaults.opacity = stdParams.opacity ?? 0.44;
  } else if (isGold) {
    defaults.roughness = stdParams.roughness ?? 0.23;
    defaults.metalness = stdParams.metalness ?? 0.86;
    defaults.vertexColors = stdParams.vertexColors ?? true;
  } else if (isGem) {
    defaults.roughness = stdParams.roughness ?? 0.12;
    defaults.metalness = stdParams.metalness ?? 0.15;
    defaults.emissiveIntensity = stdParams.emissiveIntensity ?? 0.92;
  }

  const mat = new THREE.MeshStandardMaterial({ ...defaults, ...stdParams });
  mat.userData.preserveRoughness = true;
  mat.userData.charPreset = preset;

  const motion = getMotionRef(motionUniforms);
  const uBlinkMapRef = { value: blinkMap };
  const uHasBlinkMapRef = { value: blinkMap ? 1.0 : 0.0 };
  const uSwayScaleRef = { value: swayScale };
  const uSwayFreqRef = { value: swayFreq };
  const uSparkleDensityRef = { value: sparkleDensity };
  const uShadowTintRef = {
    value: new THREE.Color(
      shadowTint ??
        (isSkin ? 0xe2979c : isHair ? 0xb586b8 : isVelvet ? 0x201846 : 0x562c5c)
    )
  };
  const uSheenColRef = {
    value: new THREE.Color(
      sheenColor ??
        (isSkin ? 0xffd8ea : isHair ? 0xffe8c6 : isVelvet ? 0x9aaeff : isTulle ? 0xffe8fc : 0xffd6ec)
    )
  };
  const uSheenStrengthRef = {
    value: sheenStrength ?? (isSilk ? 0.36 : isVelvet ? 0.28 : isTulle ? 0.55 : isHair ? 0.34 : 0.22)
  };

  mat.userData.uBlinkMap = uBlinkMapRef;
  mat.userData.uHasBlinkMap = uHasBlinkMapRef;
  mat.userData.uSheenCol = uSheenColRef;
  mat.userData.uShadowTint = uShadowTintRef;

  const cacheKey = `char_npr_${preset}_v1`;
  mat.customProgramCacheKey = () => cacheKey;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = GraphicsSync.uTime;
    shader.uniforms.uNightFactor = GraphicsSync.uNightFactor;
    shader.uniforms.uMoonDir = GraphicsSync.uMoonDir;
    shader.uniforms.uMoonColor = GraphicsSync.uMoonColor;
    shader.uniforms.uWindDir = GraphicsSync.uWindDir;
    shader.uniforms.uWindStrength = GraphicsSync.uWindStrength;

    shader.uniforms.uMoveVel = motion.uMoveVel;
    shader.uniforms.uSwayAmp = motion.uSwayAmp;
    shader.uniforms.uTurnVel = motion.uTurnVel;
    shader.uniforms.uBlink = motion.uBlink;
    shader.uniforms.uRideFactor = motion.uRideFactor;

    shader.uniforms.uBlinkMap = uBlinkMapRef;
    shader.uniforms.uHasBlinkMap = uHasBlinkMapRef;
    shader.uniforms.uSwayScale = uSwayScaleRef;
    shader.uniforms.uSwayFreq = uSwayFreqRef;
    shader.uniforms.uSparkleDensity = uSparkleDensityRef;
    shader.uniforms.uShadowTint = uShadowTintRef;
    shader.uniforms.uSheenCol = uSheenColRef;
    shader.uniforms.uSheenStrength = uSheenStrengthRef;

    const enableVertexSway = isHair || isSilk || isVelvet || isTulle;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        attribute vec3 aSmoothNormal;
        attribute float aSwayWeight;
        attribute float aStrandPhase;

        uniform float uTime;
        uniform float uWindStrength;
        uniform vec3 uMoveVel;
        uniform float uSwayAmp;
        uniform float uTurnVel;
        uniform float uRideFactor;
        uniform float uSwayScale;
        uniform float uSwayFreq;

        varying vec3 vCharWorldPos;
        varying vec3 vCharWorldNormal;
        varying vec3 vCharSmoothNormal;
        varying vec2 vCharUv;
        varying float vCharSway;
        `
      )
      .replace(
        '#include <morphtarget_vertex>',
        /* glsl */ `
        #include <morphtarget_vertex>
        ${enableVertexSway ? /* glsl */ `
        float charSwayW = clamp(aSwayWeight, 0.0, 1.0);
        if (charSwayW > 0.001) {
          float phase = aStrandPhase;
          float wCurve = charSwayW * charSwayW;
          float dampRide = ${isHair ? '1.0' : '(1.0 - clamp(uRideFactor, 0.0, 1.0) * 0.85)'};
          float amp = uSwayAmp * uSwayScale * dampRide;

          float breeze = sin(uTime * uSwayFreq + phase + transformed.y * 4.2 + transformed.x * 2.5);
          float ripple = cos(uTime * (uSwayFreq * 1.47) + phase * 1.7 + transformed.z * 5.0);

          // Arrastre hacia atrás al caminar/correr/galopar + brisa orgánica sin penetrar piernas
          vec3 drag = vec3(-uMoveVel.x * 0.028, 0.0, -uMoveVel.z * 0.032);
          float maxDrag = ${isHair ? '0.16' : '0.095'};
          float dragLen = length(drag);
          if (dragLen > maxDrag) {
            drag *= maxDrag / dragLen;
          }

          vec2 radialDir = vec2(transformed.x, transformed.z);
          float radLen = length(radialDir);
          vec2 outXZ = radLen > 0.005 ? radialDir / radLen : vec2(0.0, -1.0);

          float outPush = (0.012 + 0.016 * breeze) * (0.35 + uWindStrength * 0.65 + amp);
          ${isHair
            ? `transformed.x += (breeze * 0.020 * (0.4 + amp) + drag.x - uTurnVel * 0.014) * wCurve;
               transformed.z += (ripple * 0.016 * (0.4 + amp) + drag.z - abs(uTurnVel) * 0.008) * wCurve;`
            : `transformed.x += (outXZ.x * max(0.0, outPush) + ripple * 0.011 * (0.3 + amp) + drag.x - uTurnVel * 0.012) * wCurve;
               transformed.z += (outXZ.y * max(0.0, outPush) + breeze * 0.011 * (0.3 + amp) + drag.z) * wCurve;`
          }
        }
        ` : ''}
        `
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */ `
        #include <project_vertex>
        vec4 charWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          charWp = instanceMatrix * charWp;
        #endif
        charWp = modelMatrix * charWp;
        vCharWorldPos = charWp.xyz;

        vec3 charLocalN = objectNormal;
        vec3 charSmoothLocal = length(aSmoothNormal) > 0.01 ? normalize(aSmoothNormal) : objectNormal;
        #ifdef USE_INSTANCING
          charLocalN = mat3(instanceMatrix) * charLocalN;
          charSmoothLocal = mat3(instanceMatrix) * charSmoothLocal;
        #endif
        vCharWorldNormal = normalize(mat3(modelMatrix) * charLocalN);
        vCharSmoothNormal = normalize(mat3(modelMatrix) * charSmoothLocal);
        vCharSway = clamp(aSwayWeight, 0.0, 1.0);

        #ifdef USE_UV
          vCharUv = uv;
        #else
          vCharUv = vec2(0.5 + atan(transformed.x, transformed.z) * 0.15915, clamp((transformed.y + 0.5) * 0.85, 0.0, 1.0));
        #endif
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform float uNightFactor;
        uniform vec3 uMoonDir;
        uniform vec3 uMoonColor;
        uniform float uBlink;
        uniform sampler2D uBlinkMap;
        uniform float uHasBlinkMap;
        uniform float uSparkleDensity;
        uniform vec3 uShadowTint;
        uniform vec3 uSheenCol;
        uniform float uSheenStrength;

        varying vec3 vCharWorldPos;
        varying vec3 vCharWorldNormal;
        varying vec3 vCharSmoothNormal;
        varying vec2 vCharUv;
        varying float vCharSway;
        `
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        #include <map_fragment>
        ${isFace ? /* glsl */ `
        if (uHasBlinkMap > 0.5 && uBlink > 0.002) {
          // Ventana UV simétrica de ambos ojos en el atlas 1024x1024
          float dxL = abs(vCharUv.x - 0.316);
          float dxR = abs(vCharUv.x - 0.684);
          float dxEye = min(dxL, dxR);
          float dyEye = abs(vCharUv.y - 0.485);
          if (dxEye < 0.095 && dyEye < 0.085) {
            float maskX = 1.0 - smoothstep(0.068, 0.095, dxEye);
            float maskY = 1.0 - smoothstep(0.056, 0.085, dyEye);
            float eyeMask = maskX * maskY;
            vec4 blinkSample = texture2D(uBlinkMap, vCharUv);
            float blinkBlend = smoothstep(0.18, 0.72, uBlink);
            diffuseColor.rgb = mix(diffuseColor.rgb, blinkSample.rgb, eyeMask * blinkBlend);
          }
        }
        ` : ''}
        `
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        vec3 charV = normalize(cameraPosition - vCharWorldPos);
        vec3 charN = normalize(vCharWorldNormal);
        if (!gl_FrontFacing) charN = -charN;
        vec3 charSmoothN = normalize(vCharSmoothNormal);
        if (!gl_FrontFacing) charSmoothN = -charSmoothN;
        vec3 charMoonDir = normalize(uMoonDir);
        float nightF = clamp(uNightFactor, 0.0, 1.0);

        ${isSkin ? /* glsl */ `
        // Sombreado facial suavizado tipo anime/RPG 3D (sin sombras duras en nariz ni gris sucio)
        float ndl = dot(charSmoothN, charMoonDir) * 0.5 + 0.5;
        float shadowBand = 1.0 - smoothstep(0.32, 0.64, ndl);
        vec3 warmSkinShadow = diffuseColor.rgb * mix(vec3(0.95, 0.74, 0.75), uShadowTint, 0.55);
        vec3 nightLift = mix(vec3(0.0), vec3(0.055, 0.025, 0.065), nightF);
        outgoingLight = mix(outgoingLight, max(outgoingLight * 0.82, warmSkinShadow + nightLift), shadowBand * 0.65);

        ${isFace ? /* glsl */ `
        // Legibilidad nocturna suave solo en la zona del iris/ojos sin quemar bloom
        float fDx = min(abs(vCharUv.x - 0.316), abs(vCharUv.x - 0.684));
        float fDy = abs(vCharUv.y - 0.485);
        float irisWin = (1.0 - smoothstep(0.036, 0.066, fDx)) * (1.0 - smoothstep(0.032, 0.058, fDy));
        outgoingLight += diffuseColor.rgb * irisWin * (1.0 - clamp(uBlink, 0.0, 1.0)) * mix(0.10, 0.24, nightF);
        ` : ''}

        // Rim light lunar delicado en bordes de rostro/brazos, atenuado en el centro frontal
        float skinFresnel = pow(1.0 - max(dot(charSmoothN, charV), 0.0), 3.2);
        float skinMoonFace = 0.38 + 0.62 * max(dot(charSmoothN, charMoonDir), 0.0);
        outgoingLight += skinFresnel * skinMoonFace * (0.14 + 0.22 * nightF) * uSheenCol;

        // Soft-clamp estricto anti-bloom en piel (< 0.775)
        float skinLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        if (skinLum > 0.58) {
          float targetLum = 0.58 + (skinLum - 0.58) / (1.0 + (skinLum - 0.58) * 5.2);
          outgoingLight *= min(1.0, min(targetLum, 0.775) / max(skinLum, 1e-4));
        }
        ` : ''}

        ${isEyes ? /* glsl */ `
        outgoingLight += diffuseColor.rgb * mix(0.12, 0.24, nightF);
        float eyeLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        if (eyeLum > 0.78) {
          outgoingLight *= 0.78 / eyeLum;
        }
        ` : ''}

        ${isHair ? /* glsl */ `
        // Banda especular anisotrópica "Angel Ring" + hebras finas y sombra cálida
        vec3 hairT = normalize(vec3(0.0, 1.0, 0.0) - charN * charN.y + vec3(1e-4));
        vec3 hairH = normalize(charMoonDir + charV);
        float tDotH = dot(hairT, hairH);
        float strandShift = (sin(vCharUv.x * 46.0) * 0.06 + cos(vCharUv.x * 19.0) * 0.04);
        float angelBand = exp(-pow((tDotH - 0.22 + strandShift) * 5.8, 2.0));
        float crownMask = smoothstep(0.08, 0.42, 1.0 - vCharUv.y) * smoothstep(0.0, 0.28, vCharUv.y);
        float strandNoise = 0.74 + 0.26 * sin(vCharUv.x * 78.0 + vCharUv.y * 6.0);
        outgoingLight += angelBand * crownMask * strandNoise * mix(0.24, 0.34, nightF) * uSheenCol * (0.45 + 0.55 * diffuseColor.rgb);

        float hairLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        float hairDarkMask = 1.0 - smoothstep(0.04, 0.36, hairLum);
        outgoingLight = mix(outgoingLight, max(outgoingLight, diffuseColor.rgb * uShadowTint * 0.85), 0.30 * nightF * hairDarkMask);

        float hairRim = pow(1.0 - max(dot(charN, charV), 0.0), 2.7);
        outgoingLight += hairRim * (0.20 + 0.28 * nightF) * uSheenCol * (0.4 + 0.6 * diffuseColor.rgb);

        float finalHairLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        if (finalHairLum > 0.78) {
          outgoingLight *= (0.78 + (finalHairLum - 0.78) * 0.18) / finalHairLum;
        }
        ` : ''}

        ${(isSilk || isVelvet) ? /* glsl */ `
        // Sheen de seda satinada o terciopelo profundo + sombra enriquecida en pliegues
        float clothNdotV = max(dot(charN, charV), 0.0);
        float sheenPower = ${isVelvet ? '2.1' : '2.9'};
        float clothFresnel = pow(1.0 - clothNdotV, sheenPower);
        float moonAlign = 0.35 + 0.65 * max(dot(charN, charMoonDir), 0.0);
        outgoingLight += clothFresnel * moonAlign * uSheenStrength * (0.35 + 0.65 * nightF) * mix(diffuseColor.rgb, uSheenCol, 0.55);

        float cLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        float cDarkMask = 1.0 - smoothstep(0.02, 0.34, cLum);
        outgoingLight = mix(outgoingLight, max(outgoingLight, diffuseColor.rgb * uShadowTint * 1.15), 0.24 * nightF * cDarkMask);
        ` : ''}

        ${isTulle ? /* glsl */ `
        // Tul estelar: más visible en siluetas Fresnel, translúcido en el centro + polvo estelar animado
        float tNdotV = max(dot(charN, charV), 0.0);
        float tFresnel = pow(1.0 - tNdotV, 2.2);
        diffuseColor.a = clamp(diffuseColor.a * (0.36 + tFresnel * 1.35), 0.12, 0.88);
        outgoingLight += tFresnel * uSheenCol * uSheenStrength * (0.32 + 0.68 * nightF);

        vec2 cell = floor(vCharUv * vec2(58.0, 42.0) * uSparkleDensity);
        vec2 fCell = fract(vCharUv * vec2(58.0, 42.0) * uSparkleDensity) - 0.5;
        float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
        if (h > 0.90) {
          float tw = 0.5 + 0.5 * sin(uTime * 3.4 + h * 40.0 + dot(charV, vec3(4.0, 3.0, 5.0)));
          float starDot = exp(-dot(fCell, fCell) * 28.0);
          float sparkle = starDot * tw * smoothstep(0.90, 0.99, h);
          outgoingLight += vec3(1.0, 0.88, 0.98) * sparkle * (0.75 + 0.55 * nightF);
          diffuseColor.a = max(diffuseColor.a, sparkle * 0.85);
        }
        ` : ''}

        ${isGold ? /* glsl */ `
        float goldFresnel = pow(1.0 - max(dot(charN, charV), 0.0), 2.8);
        outgoingLight += goldFresnel * vec3(1.0, 0.88, 0.64) * (0.18 + 0.22 * nightF);
        ` : ''}

        ${isGem ? /* glsl */ `
        float gemFresnel = pow(1.0 - max(dot(charN, charV), 0.0), 2.4);
        outgoingLight += gemFresnel * uSheenCol * (0.28 + 0.34 * nightF);
        ` : ''}

        #include <opaque_fragment>
        `
      );
  };

  return mat;
}
