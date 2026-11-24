/**
 * Catálogo integral de Moda Real y Personalización 3D para Reino Rosa Imperial.
 * 100% autocontenido en el repositorio, sin descargas ni modelos externos.
 */
export class CatalogData {
  static OUTFITS = Object.freeze([
    {
      id: 'gala_rosa',
      name: 'Gala Rosa Imperial',
      icon: '👑',
      desc: 'Corpiño corazón dorado, mangas globo y falda multicapa abierta',
      primary: 0xf18bb8,
      secondary: 0xffdce9,
      accent: 0xf0be74,
      style: 'ballgown',
      swatch: 'linear-gradient(135deg,#ff9bc9,#ffdce9 55%,#e8b47c)'
    },
    {
      id: 'cristal_hielo',
      name: 'Princesa Cristal de Hielo',
      icon: '❄️',
      desc: 'Vestido azul celeste satinado con capa traslúcida y copos de oro',
      primary: 0x6ec3f0,
      secondary: 0xe3f6ff,
      accent: 0xffe096,
      style: 'ice_gown',
      swatch: 'linear-gradient(135deg,#6ec3f0,#dff6ff 60%,#ffe096)'
    },
    {
      id: 'atardecer_perla',
      name: 'Atardecer de Perla',
      icon: '🌅',
      desc: 'Vestido melocotón champán con volantes escalonados y lazo',
      primary: 0xf5ad8e,
      secondary: 0xfff0df,
      accent: 0xebb978,
      style: 'tiered_gown',
      swatch: 'linear-gradient(135deg,#f5ad8e,#fff0df 60%,#ebb978)'
    },
    {
      id: 'gala_nocturna',
      name: 'Gala Nocturna Estrellada',
      icon: '✨',
      desc: 'Violeta y magenta profundo con corpiño brillante y falda estelar',
      primary: 0x7339b8,
      secondary: 0xe35db2,
      accent: 0xffdf80,
      style: 'starry_gown',
      swatch: 'linear-gradient(135deg,#6f34b5,#e35db2 60%,#ffdf80)'
    },
    {
      id: 'chic_paseo',
      name: 'Chic Paseo Real',
      icon: '🎀',
      desc: 'Chaqueta entallada, blusa con lazo, falda plisada midi y botas',
      primary: 0xe97db2,
      secondary: 0xfff5fa,
      accent: 0xdca45d,
      style: 'chic_midi',
      swatch: 'linear-gradient(135deg,#f5a2ca,#fff5fa 60%,#dca45d)'
    },
    {
      id: 'amazona_palacio',
      name: 'Amazona de Palacio',
      icon: '🐎',
      desc: 'Levita real con botones dorados, pantalones de montar y botas',
      primary: 0x99255b,
      secondary: 0xf7e7d3,
      accent: 0xe6bc6a,
      style: 'riding',
      swatch: 'linear-gradient(135deg,#99255b,#f7e7d3 60%,#e6bc6a)'
    }
  ]);

  static NPC_OUTFITS = Object.freeze([
    {
      id: 'principe_gala',
      name: 'Gala del Príncipe',
      icon: '⚜️',
      desc: 'Casaca real azul zafiro con charreteras doradas, pantalón y botas',
      primary: 0x243b73,
      secondary: 0xf3ece4,
      accent: 0xebb965,
      style: 'prince',
      swatch: 'linear-gradient(135deg,#243b73,#ebb965)'
    }
  ]);

  static HAIRSTYLES = Object.freeze([
    { id: 'melena_ondulada', name: 'Melena Real Ondulada', icon: '🌊', desc: 'Ondas en cascada con semirrecogido y pasador cristal' },
    { id: 'coleta_alta', name: 'Coleta Alta Glamurosa', icon: '✨', desc: 'Coleta elevada en capas con lazo de perla' },
    { id: 'recogido_mono', name: 'Recogido de Gala con Moño', icon: '👑', desc: 'Moño alto trenzado con horquillas doradas' },
    { id: 'media_melena', name: 'Media Melena con Diadema', icon: '🎀', desc: 'Corte midi ondulado con diadema de perlas' },
    { id: 'trenza_lateral', name: 'Trenza Cascada Lateral', icon: '💫', desc: 'Trenza tejida sobre el hombro con lazo de oro' }
  ]);

  static HAIR_COLORS = Object.freeze([
    { id: 'rubio_miel', name: 'Rubio Miel Dorado', hex: 0xf0c975, css: '#f0c975', brow: 0x9c743a },
    { id: 'rubio_platino', name: 'Rubio Platino', hex: 0xf2ebd9, css: '#f2ebd9', brow: 0xa69b88 },
    { id: 'castano_chocolate', name: 'Castaño Chocolate', hex: 0x522e1d, css: '#522e1d', brow: 0x381e12 },
    { id: 'pelirrojo_cobrizo', name: 'Pelirrojo Cobrizo', hex: 0xc2542d, css: '#c2542d', brow: 0x85371c },
    { id: 'negro_azabache', name: 'Negro Azabache', hex: 0x1e1824, css: '#1e1824', brow: 0x16111a },
    { id: 'rosa_fantasia', name: 'Rosa Fantasía', hex: 0xf088ba, css: '#f088ba', brow: 0xa84e79 }
  ]);

  static ACCESSORIES = Object.freeze([
    { id: 'tiara', name: 'Tiara de Diamantes', icon: '💎', desc: 'Diadema de oro rosa con cristales luminosos' },
    { id: 'corona', name: 'Corona Imperial', icon: '👑', desc: 'Corona real completa con perlas y rubíes' },
    { id: 'cetro', name: 'Cetro Estelar', icon: '🪄', desc: 'Cetro dorado con estrella de cristal en mano' },
    { id: 'bolso', name: 'Bolso de Mano Dorado', icon: '👜', desc: 'Bolso imperial dorado con broche de perla' },
    { id: 'gafas', name: 'Gafas de Sol Chic', icon: '🕶️', desc: 'Montura estilizada oro rosa con lentes oscuros' }
  ]);

  static SKIN_TONES = Object.freeze([
    { id: 'porcelana', name: 'Porcelana Rosada', hex: 0xfbe0d2, css: '#fbe0d2', blush: 0xf498b4, lip: 0xe35f90 },
    { id: 'marfil', name: 'Marfil Luminoso', hex: 0xffeede, css: '#ffeede', blush: 0xf5a2be, lip: 0xdc629b },
    { id: 'miel', name: 'Miel Dorada', hex: 0xd9a07b, css: '#d9a07b', blush: 0xd87b82, lip: 0xcf546d },
    { id: 'canela', name: 'Canela Real', hex: 0x824f38, css: '#824f38', blush: 0xa65064, lip: 0xb83f6c }
  ]);

  static EYE_COLORS = Object.freeze([
    { id: 'zafiro', name: 'Zafiro', iris: 0x2d78e6, ring: 0x164296, glow: 0x8ad6ff, css: 'radial-gradient(circle,#8ad6ff 15%,#2d78e6 60%,#164296 100%)' },
    { id: 'esmeralda', name: 'Esmeralda', iris: 0x269e6d, ring: 0x12543a, glow: 0x8be6bd, css: 'radial-gradient(circle,#8be6bd 15%,#269e6d 60%,#12543a 100%)' },
    { id: 'miel', name: 'Miel', iris: 0xc4822b, ring: 0x6e4110, glow: 0xf5cc7a, css: 'radial-gradient(circle,#f5cc7a 15%,#c4822b 60%,#6e4110 100%)' },
    { id: 'violeta', name: 'Violeta', iris: 0x8254d9, ring: 0x452687, glow: 0xd1b8ff, css: 'radial-gradient(circle,#d1b8ff 15%,#8254d9 60%,#452687 100%)' }
  ]);

  static AVATARS = Object.freeze([
    {
      id: 'aurora', name: 'Aurora', gender: 'female',
      skinId: 'porcelana', hairColorId: 'rubio_miel', eyeColorId: 'zafiro',
      hairId: 'melena_ondulada', outfitId: 'gala_rosa', accessories: ['tiara'],
      swatch: 'linear-gradient(135deg,#ffe5a3,#f698c4)'
    },
    {
      id: 'valentina', name: 'Valentina', gender: 'female',
      skinId: 'miel', hairColorId: 'castano_chocolate', eyeColorId: 'esmeralda',
      hairId: 'coleta_alta', outfitId: 'atardecer_perla', accessories: ['tiara'],
      swatch: 'linear-gradient(135deg,#c97a5b,#e564a1)'
    },
    {
      id: 'celeste', name: 'Celeste', gender: 'female',
      skinId: 'marfil', hairColorId: 'rubio_platino', eyeColorId: 'violeta',
      hairId: 'recogido_mono', outfitId: 'cristal_hielo', accessories: ['tiara'],
      swatch: 'linear-gradient(135deg,#e4d4ff,#99c9ff)'
    },
    {
      id: 'amara', name: 'Amara', gender: 'female',
      skinId: 'canela', hairColorId: 'negro_azabache', eyeColorId: 'miel',
      hairId: 'trenza_lateral', outfitId: 'gala_nocturna', accessories: ['corona'],
      swatch: 'linear-gradient(135deg,#a96a48,#e4b15e)'
    }
  ]);

  static NPC_AVATARS = Object.freeze([
    { id: 'npc_adrian', name: 'Príncipe Adrián', gender: 'male', skinId: 'miel', hairColorId: 'castano_chocolate', eyeColorId: 'zafiro', hairId: 'principe_tupe', outfitId: 'principe_gala' },
    { id: 'npc_sofia', name: 'Estilista Sofía', gender: 'female', skinId: 'porcelana', hairColorId: 'rosa_fantasia', eyeColorId: 'esmeralda', hairId: 'melena_ondulada', outfitId: 'gala_rosa' },
    { id: 'npc_camila', name: 'Princesa Camila', gender: 'female', skinId: 'miel', hairColorId: 'pelirrojo_cobrizo', eyeColorId: 'miel', hairId: 'media_melena', outfitId: 'atardecer_perla' },
    { id: 'npc_maestra', name: 'Maestra de Ceremonias', gender: 'female', skinId: 'canela', hairColorId: 'rubio_platino', eyeColorId: 'violeta', hairId: 'recogido_mono', outfitId: 'gala_nocturna' }
  ]);

  static #LEGACY_OUTFIT = { casual_chic: 'chic_paseo', equitacion_real: 'amazona_palacio', cristal_nocturno: 'gala_nocturna' };
  static #LEGACY_HAIR = { ondas_reales: 'melena_ondulada', recogido_imperial: 'recogido_mono', coleta_perla: 'coleta_alta' };

  static getAvatar(id) {
    return CatalogData.AVATARS.find((a) => a.id === id)
      || CatalogData.NPC_AVATARS.find((a) => a.id === id)
      || CatalogData.AVATARS[0];
  }

  static getOutfit(id) {
    const norm = CatalogData.#LEGACY_OUTFIT[id] || id;
    return CatalogData.OUTFITS.find((o) => o.id === norm)
      || CatalogData.NPC_OUTFITS.find((o) => o.id === norm)
      || CatalogData.OUTFITS[0];
  }

  static normalizeHairId(id) {
    return CatalogData.#LEGACY_HAIR[id] || id || 'melena_ondulada';
  }

  static getHairColor(id) {
    return CatalogData.HAIR_COLORS.find((c) => c.id === id) || CatalogData.HAIR_COLORS[0];
  }

  static getSkinTone(id) {
    return CatalogData.SKIN_TONES.find((s) => s.id === id) || CatalogData.SKIN_TONES[0];
  }

  static getEyeColor(id) {
    return CatalogData.EYE_COLORS.find((e) => e.id === id) || CatalogData.EYE_COLORS[0];
  }

  static getDefaultAppearance(avatarId = 'aurora') {
    const av = CatalogData.getAvatar(avatarId);
    return {
      avatarId: av.id,
      outfitId: av.outfitId || 'gala_rosa',
      hairId: av.hairId || 'melena_ondulada',
      hairColorId: av.hairColorId || 'rubio_miel',
      skinId: av.skinId || 'porcelana',
      eyeColorId: av.eyeColorId || 'zafiro',
      accessories: [...(av.accessories || ['tiara'])]
    };
  }
}
