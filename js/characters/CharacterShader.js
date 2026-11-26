import * as THREE from 'three';
import { GraphicsSync } from '../core/Engine.js';
import { FACE_UV } from './CharacterFaceHair.js';

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
    defaults.roughness = stdParams.roughness ?? 0.82;
    defaults.metalness = stdParams.metalness ?? 0.0;
    defaults.vertexColors = stdParams.vertexColors ?? true;
  } else if (isEyes) {
    defaults.roughness = stdParams.roughness ?? 0.16;
    defaults.metalness = stdParams.metalness ?? 0.04;
  } else if (isHair) {
    defaults.roughness = stdParams.roughness ?? 0.56;
    defaults.metalness = stdParams.metalness ?? 0.02;
    defaults.side = stdParams.side ?? THREE.DoubleSide;
    defaults.vertexColors = stdParams.vertexColors ?? true;
  } else if (isSilk) {
    defaults.roughness = stdParams.roughness ?? 0.70;
    defaults.metalness = stdParams.metalness ?? 0.02;
    defaults.vertexColors = stdParams.vertexColors ?? true;
  } else if (isVelvet) {
    defaults.roughness = stdParams.roughness ?? 0.78;
    defaults.metalness = stdParams.metalness ?? 0.02;
    defaults.vertexColors = stdParams.vertexColors ?? true;
  } else if (isTulle) {
    defaults.roughness = stdParams.roughness ?? 0.45;
    defaults.metalness = stdParams.metalness ?? 0.0;
    defaults.transparent = true;
    defaults.depthWrite = false;
    defaults.side = stdParams.side ?? THREE.FrontSide;
    defaults.opacity = stdParams.opacity ?? 0.36;
  } else if (isGold) {
    defaults.roughness = stdParams.roughness ?? 0.28;
    defaults.metalness = stdParams.metalness ?? 0.78;
    defaults.vertexColors = stdParams.vertexColors ?? true;
  } else if (isGem) {
    defaults.roughness = stdParams.roughness ?? 0.14;
    defaults.metalness = stdParams.metalness ?? 0.12;
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
        (isSkin ? 0xe2979c : isHair ? 0xc88a78 : isVelvet ? 0x201846 : 0x562c5c)
    )
  };
  const uSheenColRef = {
    value: new THREE.Color(
      sheenColor ??
        (isSkin ? 0xffd8ea : isHair ? 0xffe8c6 : isVelvet ? 0x9aaeff : isTulle ? 0xffe8fc : 0xffd6ec)
    )
  };
  const uSheenStrengthRef = {
    value: sheenStrength ?? (isSilk ? 0.34 : isVelvet ? 0.28 : isTulle ? 0.48 : isHair ? 0.32 : 0.22)
  };

  mat.userData.uBlinkMap = uBlinkMapRef;
  mat.userData.uHasBlinkMap = uHasBlinkMapRef;
  mat.userData.uSheenCol = uSheenColRef;
  mat.userData.uShadowTint = uShadowTintRef;

  const eyeUL = (FACE_UV?.eyeUL ?? 0.375).toFixed(4);
  const eyeUR = (FACE_UV?.eyeUR ?? 0.625).toFixed(4);
  const eyeV = (FACE_UV?.eyeV ?? 0.487).toFixed(4);

  const cacheKey = `char_npr_${preset}_v2`;
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
        ${isSkin ? '#define USE_SMOOTH_NORMAL' : ''}
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
        varying vec3 vCharViewNormal;
        varying vec2 vCharUv;
        varying float vCharSway;
        `
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        #include <beginnormal_vertex>
        #ifdef USE_SMOOTH_NORMAL
          if (length(aSmoothNormal) > 0.01) {
            float faceFrontMask = smoothstep(-0.1, 0.45, objectNormal.z);
            objectNormal = normalize(mix(objectNormal, normalize(aSmoothNormal), 0.82 * faceFrontMask));
          }
        #endif
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
          vec3 drag = vec3(-uMoveVel.x * 0.024, 0.0, -uMoveVel.z * 0.026);
          float maxDrag = ${isHair ? '0.085' : '0.065'};
          float dragLen = length(drag);
          if (dragLen > maxDrag) {
            drag *= maxDrag / dragLen;
          }

          vec2 radialDir = vec2(transformed.x, transformed.z);
          float radLen = length(radialDir);
          vec2 outXZ = radLen > 0.005 ? radialDir / radLen : vec2(0.0, -1.0);

          float outPush = (0.006 + 0.008 * breeze) * (0.35 + uWindStrength * 0.65 + amp);
          ${isHair
            ? `transformed.x += (breeze * 0.009 * (0.4 + amp) + drag.x - uTurnVel * 0.008) * wCurve;
               transformed.z += (ripple * 0.007 * (0.4 + amp) + drag.z - abs(uTurnVel) * 0.005) * wCurve;`
            : `transformed.x += (outXZ.x * max(0.0, outPush) + ripple * 0.006 * (0.3 + amp) + drag.x * dampRide - uTurnVel * 0.007 * dampRide) * wCurve;
               transformed.z += (outXZ.y * max(0.0, outPush) + breeze * 0.006 * (0.3 + amp) + drag.z * dampRide) * wCurve;`
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
        #ifdef USE_INSTANCING
          charLocalN = mat3(instanceMatrix) * charLocalN;
        #endif
        vec3 charWorldN = mat3(modelMatrix) * charLocalN;
        vCharWorldNormal = length(charWorldN) > 1e-5 ? normalize(charWorldN) : vec3(0.0, 1.0, 0.0);
        vCharViewNormal = length(transformedNormal) > 1e-5 ? normalize(transformedNormal) : vec3(0.0, 0.0, 1.0);
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
        varying vec3 vCharViewNormal;
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
          // Ventana UV simétrica sincronizada con FACE_UV (eyeUL, eyeUR, eyeV)
          float dxL = abs(vCharUv.x - ${eyeUL});
          float dxR = abs(vCharUv.x - ${eyeUR});
          float dxEye = min(dxL, dxR);
          float dyEye = abs(vCharUv.y - ${eyeV});
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
        vec3 charMoonDir = normalize(uMoonDir);
        float nightF = clamp(uNightFactor, 0.0, 1.0);

        ${isSkin ? /* glsl */ `
        // Iluminación retrato anime/RPG cálida y luminosa (normales ya suavizadas en vertex shader)
        float hemiT = charN.y * 0.5 + 0.5;
        vec3 portraitHemi = mix(vec3(0.94, 0.77, 0.76), vec3(0.97, 0.89, 0.93), hemiT);
        vec3 portraitFill = diffuseColor.rgb * portraitHemi * mix(0.20, 0.38, nightF);

        float ndl = dot(charN, charMoonDir) * 0.5 + 0.5;
        float shadowBand = 1.0 - smoothstep(0.28, 0.62, ndl);
        vec3 warmSkinShadow = diffuseColor.rgb * mix(vec3(0.96, 0.75, 0.76), uShadowTint, 0.42);
        outgoingLight = max(outgoingLight, portraitFill * 0.85);
        outgoingLight = mix(outgoingLight, max(outgoingLight, warmSkinShadow * 0.56 + portraitFill * 0.48), shadowBand * 0.72);
        outgoingLight += portraitFill * 0.32;

        ${isFace ? /* glsl */ `
        // Lift unlit controlado en región frontal/ocular (iris zafiro, pestañas y catchlights nítidos)
        float fDx = min(abs(vCharUv.x - ${eyeUL}), abs(vCharUv.x - ${eyeUR}));
        float fDy = abs(vCharUv.y - ${eyeV});
        float irisWin = (1.0 - smoothstep(0.036, 0.072, fDx)) * (1.0 - smoothstep(0.030, 0.062, fDy));
        outgoingLight += diffuseColor.rgb * irisWin * (1.0 - clamp(uBlink, 0.0, 1.0)) * mix(0.26, 0.30, nightF);
        ` : ''}

        // Rim light lunar delicado en bordes
        float skinFresnel = pow(1.0 - max(dot(charN, charV), 0.0), 3.4);
        outgoingLight += skinFresnel * 0.22 * uSheenCol;

        // Soft-clamp estricto anti-bloom en piel (< 0.775)
        float skinLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        if (skinLum > 0.56) {
          float targetLum = 0.56 + (skinLum - 0.56) / (1.0 + (skinLum - 0.56) * 4.65);
          outgoingLight *= min(1.0, min(targetLum, 0.775) / max(skinLum, 1e-4));
        }
        ` : ''}

        ${isEyes ? /* glsl */ `
        outgoingLight += diffuseColor.rgb * mix(0.16, 0.28, nightF);
        float eyeLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        if (eyeLum > 0.78) {
          outgoingLight *= 0.78 / eyeLum;
        }
        ` : ''}

        ${isHair ? /* glsl */ `
        // Lift nocturno cálido para rubio champagne y caoba cálida en castaño oscuro
        float hairLiftAmt = mix(0.26, 0.40, nightF);
        outgoingLight += diffuseColor.rgb * hairLiftAmt;

        float hairLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        float hairDarkMask = 1.0 - smoothstep(0.03, 0.34, hairLum);
        vec3 mahoganyLift = diffuseColor.rgb * vec3(1.28, 0.96, 0.86) * 0.48 + vec3(0.038, 0.018, 0.012);
        outgoingLight = mix(outgoingLight, max(outgoingLight, mahoganyLift), (0.28 + 0.34 * nightF) * hairDarkMask);

        // Banda especular anisotrópica "Angel Ring" en espacio de vista + hebras finas
        vec3 hairViewN = normalize(vCharViewNormal);
        if (!gl_FrontFacing) hairViewN = -hairViewN;
        vec3 hairViewT = normalize(vec3(0.0, 1.0, 0.0) - hairViewN * hairViewN.y + vec3(1e-4, 0.0, 0.0));
        vec3 hairViewMoon = normalize((viewMatrix * vec4(charMoonDir, 0.0)).xyz);
        vec3 hairViewH = normalize(hairViewMoon * 0.55 + vec3(0.0, 0.35, 0.85));
        float tDotH = dot(hairViewT, hairViewH);
        float strandShift = (sin(vCharUv.x * 44.0) * 0.045 + cos(vCharUv.x * 18.0) * 0.03);
        float angelBand = exp(-pow((tDotH - 0.18 + strandShift) * 5.2, 2.0));
        float crownMask = smoothstep(0.08, 0.42, 1.0 - vCharUv.y) * smoothstep(0.0, 0.28, vCharUv.y);
        float strandNoise = 0.78 + 0.22 * sin(vCharUv.x * 74.0 + vCharUv.y * 5.0);
        outgoingLight += angelBand * crownMask * strandNoise * mix(0.20, 0.30, nightF) * uSheenCol * (0.45 + 0.55 * diffuseColor.rgb);

        // Rim dorado-lunar suave
        float hairRim = pow(1.0 - max(dot(charN, charV), 0.0), 2.8);
        vec3 goldenLunarRim = mix(vec3(1.0, 0.90, 0.70), uSheenCol, 0.5);
        outgoingLight += hairRim * (0.18 + 0.24 * nightF) * goldenLunarRim * (0.40 + 0.60 * diffuseColor.rgb);

        // Soft-clamp estricto anti-bloom en cabello (< 0.78)
        float finalHairLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        if (finalHairLum > 0.58) {
          float targetHairLum = 0.58 + (finalHairLum - 0.58) / (1.0 + (finalHairLum - 0.58) * 5.0);
          outgoingLight *= min(1.0, min(targetHairLum, 0.78) / max(finalHairLum, 1e-4));
        }
        ` : ''}

        ${(isSilk || isVelvet) ? /* glsl */ `
        // Sheen satinado/terciopelo en pliegues + fill nocturno para rosas pastel y azul medianoche saturado
        float clothNdotV = max(dot(charN, charV), 0.0);
        float sheenPower = ${isVelvet ? '2.2' : '2.8'};
        float clothFresnel = pow(1.0 - clothNdotV, sheenPower);
        float moonAlign = 0.45 + 0.55 * max(dot(charN, charMoonDir), 0.0);
        outgoingLight += clothFresnel * moonAlign * uSheenStrength * (0.35 + 0.65 * nightF) * mix(diffuseColor.rgb, uSheenCol, 0.48);

        float cLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        float cDarkMask = 1.0 - smoothstep(0.02, 0.42, cLum);
        vec3 clothFillBase = ${isVelvet
          ? 'max(diffuseColor.rgb * 0.42, diffuseColor.rgb * 0.30 + uSheenCol * 0.045)'
          : 'diffuseColor.rgb * 0.34'};
        outgoingLight += clothFillBase * mix(0.32, 1.0, nightF) * (0.45 + 0.55 * cDarkMask);
        outgoingLight = mix(outgoingLight, max(outgoingLight, diffuseColor.rgb * mix(vec3(0.85), uShadowTint, 0.35) * 0.52), 0.28 * nightF * cDarkMask);

        // Soft-clamp estricto anti-bloom en telas (< 0.79)
        float finalClothLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        if (finalClothLum > 0.60) {
          float targetClothLum = 0.60 + (finalClothLum - 0.60) / (1.0 + (finalClothLum - 0.60) * 5.26);
          outgoingLight *= min(1.0, min(targetClothLum, 0.79) / max(finalClothLum, 1e-4));
        }
        ` : ''}

        ${isTulle ? /* glsl */ `
        // Tul estelar: transparencia Fresnel limpia (0.14 centro -> 0.42 silueta) + micro-destellos finos
        float tNdotV = max(dot(charN, charV), 0.0);
        float tFresnel = pow(1.0 - tNdotV, 2.3);
        diffuseColor.a = mix(0.14, 0.42, tFresnel);
        outgoingLight += (diffuseColor.rgb * 0.22 + tFresnel * uSheenCol * uSheenStrength * 0.75) * (0.35 + 0.65 * nightF);

        vec2 cell = floor(vCharUv * vec2(120.0, 88.0) * uSparkleDensity);
        vec2 fCell = fract(vCharUv * vec2(120.0, 88.0) * uSparkleDensity) - 0.5;
        float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
        if (h > 0.945) {
          float tw = 0.5 + 0.5 * sin(uTime * 3.4 + h * 40.0 + dot(charV, vec3(4.0, 3.0, 5.0)));
          float starDot = exp(-dot(fCell, fCell) * 68.0);
          float sparkle = starDot * tw * smoothstep(0.945, 0.995, h);
          outgoingLight += vec3(1.0, 0.90, 0.98) * sparkle * (0.42 + 0.30 * nightF);
          diffuseColor.a = max(diffuseColor.a, sparkle * 0.62);
        }

        float finalTulleLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        if (finalTulleLum > 0.79) {
          outgoingLight *= 0.79 / finalTulleLum;
        }
        ` : ''}

        ${isGold ? /* glsl */ `
        float goldNdotV = max(dot(charN, charV), 0.0);
        float goldFresnel = pow(1.0 - goldNdotV, 2.6);
        float goldLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        float goldDarkMask = 1.0 - smoothstep(0.04, 0.38, goldLum);
        vec3 satinGoldShadow = max(diffuseColor.rgb * vec3(0.68, 0.54, 0.32), vec3(0.18, 0.13, 0.06));
        outgoingLight = mix(outgoingLight, max(outgoingLight, satinGoldShadow), (0.35 + 0.35 * nightF) * goldDarkMask);
        outgoingLight += goldFresnel * vec3(1.0, 0.88, 0.64) * (0.16 + 0.18 * nightF);

        float finalGoldLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        if (finalGoldLum > 0.78) {
          outgoingLight *= 0.78 / finalGoldLum;
        }
        ` : ''}

        ${isGem ? /* glsl */ `
        float gemFresnel = pow(1.0 - max(dot(charN, charV), 0.0), 2.2);
        outgoingLight += gemFresnel * uSheenCol * (0.30 + 0.36 * nightF);
        float gemLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        if (gemLum > 0.88) {
          float targetGemLum = 0.88 + (gemLum - 0.88) / (1.0 + (gemLum - 0.88) * 5.0);
          outgoingLight *= min(targetGemLum, 1.08) / gemLum;
        }
        ` : ''}

        #include <opaque_fragment>
        `
      );
  };

  return mat;
}
