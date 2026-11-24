/**
 * Catálogo de temas atmosféricos y parámetros calibrados de iluminación/PBR.
 */
export class WorldThemes {
  #themes = [
    {
      id: 'palacio_cristal',
      name: 'Palacio de Cristal',
      subtitle: 'Hora Dorada · Reino principal luminoso y jardines reales',
      orbGradient: 'linear-gradient(135deg, #fff2c6 0%, #ffb5d5 58%, #90c2ff 100%)',
      skyTop: 0x7cb2f8,
      skyMid: 0xffd2e5,
      skyBottom: 0xfff3d8,
      fogColor: 0xffedf4,
      fogDensity: 0.0048,
      hemiSky: 0xfff8fc,
      hemiGround: 0xd4a6bc,
      hemiIntensity: 0.64,
      sunColor: 0xfff3e0,
      sunIntensity: 1.3,
      sunPosition: [36, 48, 30],
      fillColor: 0xffbad7,
      fillIntensity: 0.34,
      exposure: 0.90,
      envIntensity: 0.56,
      bloomStrength: 0.20,
      bloomRadius: 0.30,
      bloomThreshold: 0.96,
      marbleRoughness: 0.52,
      starsOpacity: 0,
      moteColor: 0xffe7a8,
      moteSize: 0.28,
      lanternIntensity: 0.9,
      crystalEmissive: 0.35,
      musicMood: 'golden'
    },
    {
      id: 'jardines_perla',
      name: 'Jardines de Perla',
      subtitle: 'Atardecer Rosa · Luz cálida, fuentes iluminadas y miradores',
      orbGradient: 'linear-gradient(135deg, #ffd1a6 0%, #f586b9 55%, #84599a 100%)',
      skyTop: 0x6f4b8c,
      skyMid: 0xf492bd,
      skyBottom: 0xffcba4,
      fogColor: 0xfac3d7,
      fogDensity: 0.0062,
      hemiSky: 0xffd4e8,
      hemiGround: 0x9b6682,
      hemiIntensity: 0.62,
      sunColor: 0xffb388,
      sunIntensity: 1.25,
      sunPosition: [-46, 20, 24],
      fillColor: 0xff8bc4,
      fillIntensity: 0.42,
      exposure: 0.90,
      envIntensity: 0.54,
      bloomStrength: 0.20,
      bloomRadius: 0.30,
      bloomThreshold: 0.96,
      marbleRoughness: 0.50,
      starsOpacity: 0.28,
      moteColor: 0xffb8df,
      moteSize: 0.32,
      lanternIntensity: 2.1,
      crystalEmissive: 0.65,
      musicMood: 'sunset'
    },
    {
      id: 'gala_imperial',
      name: 'Gala Imperial',
      subtitle: 'Noche Estrellada · Cristales brillantes y pista de baile iluminada',
      orbGradient: 'linear-gradient(135deg, #2b1d52 0%, #6d3a8a 55%, #f5a6d0 100%)',
      skyTop: 0x120d2e,
      skyMid: 0x351e5e,
      skyBottom: 0x6b3678,
      fogColor: 0x2a1847,
      fogDensity: 0.0072,
      hemiSky: 0x9b86dc,
      hemiGround: 0x45244d,
      hemiIntensity: 0.56,
      sunColor: 0xc9dcff,
      sunIntensity: 0.95,
      sunPosition: [28, 44, -22],
      fillColor: 0xff7ec8,
      fillIntensity: 0.46,
      exposure: 0.90,
      envIntensity: 0.52,
      bloomStrength: 0.20,
      bloomRadius: 0.30,
      bloomThreshold: 0.96,
      marbleRoughness: 0.48,
      starsOpacity: 0.95,
      moteColor: 0xffe8a3,
      moteSize: 0.36,
      lanternIntensity: 3.2,
      crystalEmissive: 1.05,
      musicMood: 'gala'
    }
  ];

  /**
   * Valores seguros para etiquetas Sprite flotantes sin quemado ni halo por bloom.
   */
  static getLabelDefaults() {
    return { toneMapped: false, tintHex: 0xc8c8c8, maxChannel: 0.78 };
  }

  init() {}

  /** Devuelve una copia superficial de todos los temas disponibles. */
  getAll() {
    return this.#themes.map((t) => ({ ...t }));
  }

  /** Busca un tema por identificador o devuelve el tema principal por defecto. */
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
