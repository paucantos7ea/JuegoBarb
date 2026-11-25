import { GraphicsSync } from '../core/Engine.js';

/**
 * Catálogo de temas atmosféricos y sincronización con GraphicsSync.
 * Tema por defecto: 'gala_imperial' (Noche Estrellada · Gala Imperial).
 */
export class WorldThemes {
  static DEFAULT_THEME_ID = 'gala_imperial';

  #themes = [
    {
      id: 'gala_imperial',
      name: 'Gala Imperial',
      subtitle: 'Noche Estrellada · Bóveda celeste viva, luna creciente monumental y jardines iluminados',
      orbGradient: 'linear-gradient(135deg, #050414 0%, #441f68 52%, #f5a6d4 100%)',
      envThemeKey: 'night',
      skyTop: 0x050414,
      skyMidHigh: 0x171042,
      skyMid: 0x441f68,
      skyBottom: 0x8f4276,
      fogColor: 0x1f133e,
      fogDensity: 0.0022,
      hemiSky: 0x8a72c8,
      hemiGround: 0x1e2438,
      hemiIntensity: 0.65,
      sunColor: 0xdce6ff,
      sunIntensity: 1.18,
      moonColor: 0xfff1d6,
      moonDir: [0.1827, 0.4772, -0.8596], // Elevación ~28.5°, acimut +12° en cuadrante frontal al hacer spawn
      sunPosition: [17.36, 45.33, -81.66],
      fillColor: 0xff7ec8,
      fillIntensity: 0.0,
      exposure: 1.10,
      envIntensity: 0.85,
      bloomThreshold: 0.82,
      bloomStrength: 0.46,
      bloomRadius: 0.62,
      marbleRoughness: 0.42,
      starsOpacity: 1.0,
      nightMix: 1.0,
      moonOpacity: 1.0,
      isNight: true,
      moteColor: 0xffe8a3,
      moteSize: 0.34,
      lanternIntensity: 3.4,
      crystalEmissive: 1.25
    },
    {
      id: 'palacio_cristal',
      name: 'Palacio de Cristal',
      subtitle: 'Hora Dorada · Reino principal luminoso y jardines reales',
      orbGradient: 'linear-gradient(135deg, #fff2c6 0%, #ffb5d5 58%, #90c2ff 100%)',
      envThemeKey: 'day',
      skyTop: 0x4d92ec,
      skyMidHigh: 0x8ec2fb,
      skyMid: 0xffd2e5,
      skyBottom: 0xfff1d6,
      fogColor: 0xfbe8f1,
      fogDensity: 0.0024,
      hemiSky: 0xfff8fc,
      hemiGround: 0xc298b0,
      hemiIntensity: 0.72,
      sunColor: 0xfff3de,
      sunIntensity: 1.35,
      moonColor: 0xfff5e0,
      moonDir: [0.1827, 0.4772, -0.8596],
      sunPosition: [36, 48, 30],
      fillColor: 0xffbad7,
      fillIntensity: 0.28,
      exposure: 1.02,
      envIntensity: 0.72,
      bloomThreshold: 0.88,
      bloomStrength: 0.28,
      bloomRadius: 0.42,
      marbleRoughness: 0.46,
      starsOpacity: 0,
      nightMix: 0,
      moonOpacity: 0,
      isNight: false,
      moteColor: 0xffe7a8,
      moteSize: 0.28,
      lanternIntensity: 0.9,
      crystalEmissive: 0.35
    },
    {
      id: 'jardines_perla',
      name: 'Jardines de Perla',
      subtitle: 'Atardecer Rosa · Luz cálida, fuentes iluminadas y miradores',
      orbGradient: 'linear-gradient(135deg, #ffd1a6 0%, #f586b9 55%, #84599a 100%)',
      envThemeKey: 'sunset',
      skyTop: 0x2d1d54,
      skyMidHigh: 0x6b3a7c,
      skyMid: 0xe67eb0,
      skyBottom: 0xffc69e,
      fogColor: 0xc97da8,
      fogDensity: 0.0026,
      hemiSky: 0xffcfe6,
      hemiGround: 0x684364,
      hemiIntensity: 0.64,
      sunColor: 0xffb388,
      sunIntensity: 1.22,
      moonColor: 0xffe8cc,
      moonDir: [0.1827, 0.4772, -0.8596],
      sunPosition: [-46, 22, 24],
      fillColor: 0xff8bc4,
      fillIntensity: 0.32,
      exposure: 1.06,
      envIntensity: 0.78,
      bloomThreshold: 0.84,
      bloomStrength: 0.38,
      bloomRadius: 0.52,
      marbleRoughness: 0.44,
      starsOpacity: 0.45,
      nightMix: 0.5,
      moonOpacity: 0.55,
      isNight: false,
      moteColor: 0xffb8df,
      moteSize: 0.32,
      lanternIntensity: 2.1,
      crystalEmissive: 0.65
    }
  ];

  /**
   * Valores seguros para etiquetas Sprite flotantes sin quemado ni halo por bloom.
   */
  static getLabelDefaults() {
    return { toneMapped: false, tintHex: 0xc8c8c8, maxChannel: 0.78 };
  }

  /**
   * Escribe los parámetros del tema activo en GraphicsSync (100% GC-Free) y alinea la DirectionalLight.
   * @param {object} theme
   * @param {THREE.DirectionalLight|null} directionalLight
   */
  static syncGraphics(theme, directionalLight = null) {
    if (!theme) return;
    GraphicsSync.uSkyZenith.value.setHex(theme.skyTop ?? 0x050414);
    GraphicsSync.uSkyMid.value.setHex(theme.skyMid ?? 0x441f68);
    GraphicsSync.uSkyHorizon.value.setHex(theme.skyBottom ?? 0x8f4276);
    GraphicsSync.uFogColor.value.setHex(theme.fogColor ?? 0x1f133e);
    GraphicsSync.uFogDensity.value = theme.fogDensity ?? 0.0022;
    GraphicsSync.uNightFactor.value = theme.nightMix ?? (theme.isNight ? 1.0 : 0.0);
    GraphicsSync.uMoonColor.value.setHex(theme.moonColor ?? 0xfff1d6);

    if (Array.isArray(theme.moonDir) && theme.moonDir.length === 3) {
      GraphicsSync.uMoonDir.value.set(theme.moonDir[0], theme.moonDir[1], theme.moonDir[2]).normalize();
    }

    if (directionalLight) {
      directionalLight.color.setHex(theme.sunColor ?? 0xdce6ff);
      if (GraphicsSync.uNightFactor.value >= 0.45) {
        directionalLight.position.copy(GraphicsSync.uMoonDir.value).multiplyScalar(95);
      } else if (Array.isArray(theme.sunPosition) && theme.sunPosition.length === 3) {
        directionalLight.position.set(theme.sunPosition[0], theme.sunPosition[1], theme.sunPosition[2]);
      }
    }
  }

  syncGraphics(theme, directionalLight = null) {
    WorldThemes.syncGraphics(theme, directionalLight);
  }

  init() {
    WorldThemes.syncGraphics(this.getById(WorldThemes.DEFAULT_THEME_ID));
  }

  /** Devuelve una copia superficial de todos los temas disponibles. */
  getAll() {
    return this.#themes.map((t) => ({ ...t }));
  }

  /** Busca un tema por identificador o devuelve Gala Imperial por defecto. */
  getById(id) {
    return this.#themes.find((t) => t.id === id) || this.#themes[0];
  }

  /** Calcula el identificador del siguiente tema en rotación cíclica. */
  getNextThemeId(currentId) {
    const idx = this.#themes.findIndex((t) => t.id === currentId);
    const next = (idx + 1) % this.#themes.length;
    return this.#themes[next].id;
  }

  update() {}
  dispose() {}
}
