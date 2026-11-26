import * as THREE from 'three';
import { CharacterRig } from './CharacterRig.js';
import { GraphicsSync, createContactShadow } from '../core/Engine.js';

const TAU = Math.PI * 2;
const LABEL_HIDE_SQ = 32 * 32;   // 1024: oculta etiquetas lejanas para mantener limpio el horizonte
const LOOK_DIST_SQ = 6.5 * 6.5;  // 42.25: seguimiento suave de cabeza hacia el jugador
const TURN_DIST_SQ = 4.2 * 4.2;  // 17.64: giro cortés de NPCs estáticos cercanos
const STOP_DIST_SQ = 3.2 * 3.2;  // 10.24: los paseantes se detienen amablemente al paso del jugador
const LOD_FULL_SQ = 35 * 35;     // 1225: LOD 0 (parpadeo + micro-gestos + física completa)
const LOD_NEAR_SQ = 55 * 55;     // 3025: 60 Hz locomoción y animación estilizada
const LOD_FAR_SQ = 85 * 85;      // 7225: 1 de cada 4 frames; > 85 u pausa completa (cero CPU)

function stepAngle(current, target, rate, dt) {
  let diff = target - current;
  while (diff > Math.PI) diff -= TAU;
  while (diff < -Math.PI) diff += TAU;
  return current + diff * Math.min(1, dt * rate);
}

/**
 * Gestor de población real y rutinas vivas del Reino Rosa Imperial (60 FPS, 100% GC-Free en update).
 * Coordina los 4 anfitriones principales de misiones/actividades y 16 ciudadanos de la corte
 * repartidos entre la Gran Cúpula del Casino, el Bulevar Imperial, los dos puentes sobre el río,
 * la antesala de la Gran Pasarela, los parterres de rosas del Palacio y los Establos Reales.
 */
export class NPCManager {
  #scene;
  #textures;
  #collision;
  #waterSystem = null;
  #npcs = [];
  #positionsView = [];
  #sharedRingGeo = null;
  #sharedRingMat = null;
  #frameCounter = 0;
  #elapsed = 0;
  #wasDialogueOpen = false;
  #lastSpeaker = null;

  #definitions = [
    // =========================================================================
    // ANFITRIONES PRINCIPALES DE MISIONES Y ACTIVIDADES REALES (IDs intactos)
    // =========================================================================
    {
      id: 'adrian',
      name: 'Príncipe Adrián',
      role: 'Heredero del Palacio de Cristal',
      questHost: true,
      position: [7.5, 0, -11.5],
      yaw: -0.5,
      appearance: {
        avatarId: 'npc_adrian',
        outfitId: 'principe_gala',
        hairId: 'principe_tupe',
        hairStyleOverride: 'prince_royal_tousled',
        courtPalette: 'starlight_sapphire',
        hairColorId: 'castano_chocolate',
        skinId: 'marfil',
        eyeColorId: 'zafiro',
        accessories: [],
        heightScale: 1.0
      },
      greeting: '¡Bienvenidos al Palacio de Cristal! Cinco Gemas del Reino brillan ocultas por los jardines, el Salón del Trono, el Balcón Imperial y la Biblioteca Real. ¡Ayúdanos a reunirlas antes de la gran gala!',
      greetings: [
        '¡Bienvenidos al Palacio de Cristal! Cinco Gemas del Reino brillan ocultas por los jardines, el Salón del Trono, el Balcón Imperial y la Biblioteca Real. ¡Ayúdanos a reunirlas antes de la gran gala!',
        'Esta Noche Estrellada hemos iluminado el Bulevar Imperial hasta la Gran Cúpula del Casino Real. Cruza el Puente Imperial sobre el río o cabalga en un corcel real para admirar su corona dorada.',
        'Dicen en la corte que cuando alguien logra Blackjack o el gran premio en la Cúpula de Cristal, estallan fuegos artificiales rosados y dorados sobre todo el valle.'
      ]
    },
    {
      id: 'sofia',
      name: 'Estilista Sofía',
      role: 'Directora del Vestidor Real',
      questHost: true,
      position: [-20, 1.0, -31],
      yaw: 0.75,
      appearance: {
        avatarId: 'npc_sofia',
        outfitId: 'gala_rosa',
        hairId: 'melena_ondulada',
        hairStyleOverride: 'princess_imperial_waves',
        courtPalette: 'petal_rose',
        courtSilhouette: 'princess_light',
        hairColorId: 'rosa_pastel',
        skinId: 'porcelana',
        eyeColorId: 'esmeralda',
        accessories: ['tiara', 'bolso'],
        heightScale: 0.99
      },
      greeting: '¡Fabuloso verte en el Vestidor Real! Pulsa [C] cuando quieras para cambiar de vestido, peinado, colores o accesorios. ¿Te animas a brillar en la Gran Pasarela con gradas?',
      greetings: [
        '¡Fabuloso verte en el Vestidor Real! Pulsa [C] cuando quieras para cambiar de vestido, peinado, colores o accesorios. ¿Te animas a brillar en la Gran Pasarela con gradas?',
        'Para cabalgar junto al río te recomiendo la levita Amazona de Palacio, y para deslumbrar bajo la araña de la Cúpula del Casino nada supera la Gala Nocturna Estrellada.',
        'Las modelos ya ensayan giros y poses en la antesala de la Pasarela Imperial. ¡Elige tu mejor tiara o corona y conquista al jurado!'
      ],
      actionLabel: '✦ Abrir Vestidor',
      actionType: 'wardrobe',
      secondaryLabel: '★ Ir a la Pasarela',
      secondaryType: 'minigame:fashion'
    },
    {
      id: 'camila',
      name: 'Princesa Camila',
      role: 'Anfitriona de los Jardines de Perla',
      questHost: true,
      position: [12.5, 0, 12.5],
      yaw: -0.75,
      appearance: {
        avatarId: 'npc_camila',
        outfitId: 'atardecer_perla',
        hairId: 'media_melena',
        hairStyleOverride: 'court_half_up',
        courtPalette: 'champagne_gold',
        courtSilhouette: 'court_tiered',
        hairColorId: 'pelirrojo_cobrizo',
        skinId: 'miel',
        eyeColorId: 'miel',
        accessories: ['gafas', 'tiara'],
        heightScale: 0.98
      },
      greeting: '¡Los jardines y bosques están llenos de vida hoy! Necesitamos entregar las Invitaciones Reales al Príncipe Adrián, a Estilista Sofía y a la Maestra de Ceremonias. ¿O prefieres una carrera contrarreloj?',
      greetings: [
        '¡Los jardines y bosques están llenos de vida hoy! Necesitamos entregar las Invitaciones Reales al Príncipe Adrián, a Estilista Sofía y a la Maestra de Ceremonias. ¿O prefieres una carrera contrarreloj?',
        '¿Has visto los cisnes blancos deslizarse bajo el Puente Sur de los Cisnes? Bajo la Noche Estrellada, los cerezos y las farolas se reflejan como cristal sobre el agua.',
        'Los corceles de los Establos Reales aguardan listos para galopar por las avenidas de mármol hasta las fuentes VIP de la Cúpula del Casino.'
      ],
      actionLabel: '♛ Carrera por los Jardines',
      actionType: 'minigame:race'
    },
    {
      id: 'maestra',
      name: 'Maestra de Ceremonias',
      role: 'Directora del Salón de Baile',
      questHost: true,
      position: [19.0, 1.0, -30.0],
      yaw: -0.65,
      appearance: {
        avatarId: 'npc_maestra',
        outfitId: 'gala_nocturna',
        hairId: 'recogido_mono',
        hairStyleOverride: 'court_updo_bun',
        courtPalette: 'imperial_lavender',
        courtSilhouette: 'court_starry',
        hairColorId: 'rubio_platino',
        skinId: 'canela',
        eyeColorId: 'violeta',
        accessories: ['corona', 'cetro'],
        heightScale: 1.02
      },
      greeting: 'La pista de mármol pulido y el piano de cola están listos en el Salón de Baile y Banquetes. ¡Todo el reino espera tu gran baile imperial! Sigue el ritmo con W, A, S y D.',
      greetings: [
        'La pista de mármol pulido y el piano de cola están listos en el Salón de Baile y Banquetes. ¡Todo el reino espera tu gran baile imperial! Sigue el ritmo con W, A, S y D.',
        'Toda la corte comenta el esplendor de esta velada: vals imperial aquí en el Palacio y emoción dorada en el Salón VIP de la Gran Cúpula de Cristal.',
        'Mantén la elegancia en cada compás; ¡hasta los anfitriones de gala en la escalinata del Casino se inclinarán a tu paso!'
      ],
      actionLabel: '♪ Iniciar Baile Real',
      actionType: 'minigame:ball'
    },

    // =========================================================================
    // 1. ZONA DEL CASINO (2 Guardias/Anfitriones de Gala + 3 Invitados VIP)
    // =========================================================================
    {
      id: 'guardia_casino_norte',
      name: 'Capitán Valerio',
      role: 'Guardia de Gala de la Cúpula',
      position: [120.2, 0, -4.6],
      yaw: -Math.PI / 2,
      greetEmote: 'wave',
      greetRadius: 9.0,
      appearance: {
        avatarId: 'npc_adrian',
        outfitId: 'principe_gala',
        hairId: 'principe_tupe',
        hairStyleOverride: 'court_noble_short',
        courtPalette: 'velvet_burgundy',
        hairColorId: 'rubio_miel',
        skinId: 'miel',
        eyeColorId: 'zafiro',
        accessories: ['cetro'],
        heightScale: 1.01
      },
      greeting: '¡Bienvenida Su Alteza a la Gran Cúpula del Casino Real! Suba por la escalinata de alfombra imperial; la gala brilla en todo su esplendor.',
      greetings: [
        '¡Bienvenida Su Alteza a la Gran Cúpula del Casino Real! Suba por la escalinata de alfombra imperial; la gala brilla en todo su esplendor.',
        'Dentro hallará el ala norte de Tragaperras Reales, la Ruleta Imperial bajo la gran araña de cristal y la tarima VIP de Blackjack al sur.',
        'Si llega a galope por el Bulevar Imperial, la Amazona Elena cuida de los corceles reales aquí mismo en la Explanada Oeste.'
      ]
    },
    {
      id: 'anfitriona_casino_sur',
      name: 'Dama Aurelia',
      role: 'Anfitriona de Honor del Casino',
      position: [120.2, 0, 4.6],
      yaw: -Math.PI / 2,
      greetEmote: 'curtsy',
      greetRadius: 9.0,
      appearance: {
        avatarId: 'celeste',
        outfitId: 'cristal_hielo',
        hairId: 'recogido_mono',
        hairStyleOverride: 'court_updo_bun',
        courtPalette: 'starlight_sapphire',
        courtSilhouette: 'empire_shawl',
        hairColorId: 'rubio_platino',
        skinId: 'marfil',
        eyeColorId: 'zafiro',
        accessories: ['corona'],
        heightScale: 1.0
      },
      greeting: 'Un honor recibirle bajo la Corona Imperial de Cristal. Esta noche las veinticuatro costillas doradas de la cúpula iluminan el firmamento.',
      greetings: [
        'Un honor recibirle bajo la Corona Imperial de Cristal. Esta noche las veinticuatro costillas doradas de la cúpula iluminan el firmamento.',
        'Las princesas crupieres aguardan en el Salón VIP de Blackjack; quien suma veintiuno desata fuegos artificiales visibles desde el Palacio.',
        'No deje de visitar las Fuentes VIP del Norte y del Sur rodeadas de palmeras reales; la brisa nocturna allí es encantadora.'
      ]
    },
    {
      id: 'vip_fuente_norte',
      name: 'Duquesa Isidora',
      role: 'Invitada VIP · Jardines del Norte',
      position: [162.0, 0, -41.2],
      yaw: Math.PI,
      walkSpeed: 1.38,
      loopMode: 'loop',
      wpIndex: 1,
      waypoints: [
        { x: 162.0, z: -41.2, pause: 4.0, lookYaw: Math.PI, emote: 'star' },
        { x: 166.8, z: -43.2, pause: 0 },
        { x: 168.8, z: -48.0, pause: 3.6, lookYaw: -Math.PI / 2 },
        { x: 166.8, z: -52.8, pause: 0 },
        { x: 162.0, z: -54.8, pause: 4.2, lookYaw: 0, emote: 'curtsy' },
        { x: 157.2, z: -52.8, pause: 0 },
        { x: 155.2, z: -48.0, pause: 3.5, lookYaw: Math.PI / 2 },
        { x: 157.2, z: -43.2, pause: 0 }
      ],
      appearance: {
        avatarId: 'aurora',
        outfitId: 'gala_nocturna',
        hairId: 'media_melena',
        hairStyleOverride: 'court_half_up',
        courtPalette: 'imperial_lavender',
        courtSilhouette: 'princess_light',
        hairColorId: 'negro_azabache',
        skinId: 'porcelana',
        eyeColorId: 'violeta',
        accessories: ['tiara', 'bolso'],
        heightScale: 1.01
      },
      greeting: '¡Qué paz se respira junto a la Fuente VIP del Norte! El murmullo del agua y los destellos del cristal descansan la mente entre partida y partida.',
      greetings: [
        '¡Qué paz se respira junto a la Fuente VIP del Norte! El murmullo del agua y los destellos del cristal descansan la mente entre partida y partida.',
        'En la Ruleta Imperial siempre confío en mis colores favoritos antes de salir a pasear entre las palmeras iluminadas.',
        'Desde esta plaza circular se contempla de maravilla la estrella dorada que corona la Cúpula bajo la Noche Estrellada.'
      ]
    },
    {
      id: 'vip_jardines_sur',
      name: 'Conde Sebastián',
      role: 'Invitado VIP · Paseo del Sur',
      position: [148.0, 0, 39.0],
      yaw: -0.6,
      walkSpeed: 1.44,
      loopMode: 'loop',
      wpIndex: 1,
      waypoints: [
        { x: 148.0, z: 39.0, pause: 4.0, lookYaw: -0.65, emote: 'wave' },
        { x: 153.5, z: 41.2, pause: 0 },
        { x: 155.4, z: 46.8, pause: 3.8, lookYaw: 1.38 },
        { x: 158.0, z: 53.6, pause: 0 },
        { x: 164.5, z: 54.2, pause: 4.2, lookYaw: -2.75 },
        { x: 167.8, z: 49.4, pause: 0 },
        { x: 166.2, z: 42.2, pause: 3.4, lookYaw: -0.62 },
        { x: 159.5, z: 41.2, pause: 0 }
      ],
      appearance: {
        avatarId: 'npc_adrian',
        outfitId: 'principe_gala',
        hairId: 'principe_tupe',
        hairStyleOverride: 'prince_royal_tousled',
        courtPalette: 'palace_emerald',
        hairColorId: 'rubio_platino',
        skinId: 'marfil',
        eyeColorId: 'violeta',
        accessories: ['gafas'],
        heightScale: 0.99
      },
      greeting: 'Desde este paseo circular del Sur se disfruta a la vez de la Fuente VIP de cristal y de las vistas hacia el Lago de los Cisnes.',
      greetings: [
        'Desde este paseo circular del Sur se disfruta a la vez de la Fuente VIP de cristal y de las vistas hacia el Lago de los Cisnes.',
        'Acabo de celebrar una buena mano en el Blackjack VIP; ¡el secreto de los grandes jugadores es mantener la calma ante un dieciséis!',
        'La brisa suave que llega desde el Puente de los Cisnes trae el perfume de los cerezos y rosales de todo el reino.'
      ]
    },
    {
      id: 'vip_interior_cupula',
      name: 'Marquesa Bianca',
      role: 'Invitada de Gala · Salón de Cristal',
      position: [141.4, 0.60, -4.5],
      yaw: 1.45,
      walkSpeed: 1.32,
      loopMode: 'loop',
      wpIndex: 2,
      waypoints: [
        { x: 136.5, z: -7.6, pause: 3.6, lookYaw: 1.15 },
        { x: 141.4, z: -8.0, pause: 3.4, lookYaw: 1.35, emote: 'star' },
        { x: 142.0, z: -2.4, pause: 0 },
        { x: 142.0, z: 2.4, pause: 4.0, lookYaw: Math.PI / 2 },
        { x: 141.4, z: 8.0, pause: 3.6, lookYaw: 1.92 },
        { x: 136.5, z: 7.6, pause: 0 },
        { x: 135.8, z: 0.0, pause: 3.2, lookYaw: Math.PI / 2 }
      ],
      appearance: {
        avatarId: 'valentina',
        outfitId: 'atardecer_perla',
        hairId: 'trenza_lateral',
        hairStyleOverride: 'trenza_lateral',
        courtPalette: 'champagne_gold',
        courtSilhouette: 'court_tiered',
        hairColorId: 'castano_chocolate',
        skinId: 'marfil',
        eyeColorId: 'esmeralda',
        accessories: ['corona', 'bolso'],
        heightScale: 0.98
      },
      greeting: '¡Admira cómo gira la colosal lámpara de araña sobre la estrella de ocho puntas! No hay bóveda de cristal más sublime en el mundo.',
      greetings: [
        '¡Admira cómo gira la colosal lámpara de araña sobre la estrella de ocho puntas! No hay bóveda de cristal más sublime en el mundo.',
        'Me fascina el ambiente de esta cúpula: el tintineo alegre de las Tragaperras al norte y la elegancia del Blackjack al sur.',
        'Las vidrieras rosadas y doradas filtran el resplandor de la Noche Estrellada como si estuviéramos dentro de un diamante.'
      ]
    },

    // =========================================================================
    // 2. BULEVAR IMPERIAL Y PUENTES DEL RÍO (4 Damas y Caballeros ~1.55 m/s)
    // =========================================================================
    {
      id: 'dama_bulevar_norte',
      name: 'Lady Clara del Cristal',
      role: 'Dama de la Corte Imperial',
      position: [72.0, 0, -2.5],
      yaw: Math.PI / 2,
      walkSpeed: 1.55,
      loopMode: 'pingpong',
      wpIndex: 2,
      waypoints: [
        { x: 48.5, z: -2.5, pause: 3.4, lookYaw: -Math.PI / 2 },
        { x: 72.0, z: -2.5, pause: 0 },
        { x: 92.2, z: -2.5, pause: 0 },
        { x: 97.5, z: -2.5, pause: 4.2, lookYaw: Math.PI },
        { x: 102.8, z: -2.5, pause: 0 },
        { x: 111.5, z: -2.5, pause: 3.5, lookYaw: Math.PI / 2, emote: 'wave' }
      ],
      appearance: {
        avatarId: 'aurora',
        outfitId: 'gala_rosa',
        hairId: 'coleta_alta',
        hairStyleOverride: 'coleta_alta',
        courtPalette: 'petal_rose',
        courtSilhouette: 'princess_light',
        hairColorId: 'rubio_miel',
        skinId: 'porcelana',
        eyeColorId: 'zafiro',
        accessories: ['tiara'],
        heightScale: 0.97
      },
      greeting: 'Pasear por el Bulevar Imperial bajo las catorce farolas de oro rosa es mi tradición favorita de la Gala Nocturna.',
      greetings: [
        'Pasear por el Bulevar Imperial bajo las catorce farolas de oro rosa es mi tradición favorita de la Gala Nocturna.',
        'Siempre hago una pausa en lo alto del Puente Imperial para contemplar cómo destellan las aguas cristalinas del río.',
        'Al final de la alfombra real ya resplandece el pórtico de la Gran Cúpula del Casino; ¡es imposible no maravillarse!'
      ]
    },
    {
      id: 'caballero_bulevar_sur',
      name: 'Lord Mateo de Perla',
      role: 'Caballero de la Corte Real',
      position: [103.2, 0, 2.5],
      yaw: -Math.PI / 2,
      walkSpeed: 1.56,
      loopMode: 'pingpong',
      wpIndex: 2,
      waypoints: [
        { x: 111.5, z: 2.5, pause: 3.2, lookYaw: Math.PI / 2 },
        { x: 102.8, z: 2.5, pause: 0 },
        { x: 97.5, z: 2.5, pause: 4.5, lookYaw: 0 },
        { x: 92.2, z: 2.5, pause: 0 },
        { x: 74.0, z: 2.5, pause: 0 },
        { x: 48.5, z: 2.5, pause: 3.6, lookYaw: -Math.PI / 2 }
      ],
      appearance: {
        avatarId: 'npc_adrian',
        outfitId: 'principe_gala',
        hairId: 'principe_tupe',
        hairStyleOverride: 'court_noble_short',
        courtPalette: 'imperial_lavender',
        hairColorId: 'negro_azabache',
        skinId: 'canela',
        eyeColorId: 'miel',
        accessories: ['corona'],
        heightScale: 1.0
      },
      greeting: '¡Buenas noches! Desde la cresta del Puente Imperial se divisan los cisnes reales deslizándose aguas abajo hacia la laguna.',
      greetings: [
        '¡Buenas noches! Desde la cresta del Puente Imperial se divisan los cisnes reales deslizándose aguas abajo hacia la laguna.',
        'Las fuentes gemelas del bulevar y los cerezos iluminados convierten el paseo entre el Palacio y el Casino en puro ensueño.',
        'Si te apetece poner a prueba tu agilidad, la Princesa Camila organiza carreras contrarreloj por los jardines reales.'
      ]
    },
    {
      id: 'dama_dos_puentes',
      name: 'Condesa Rosalía',
      role: 'Dama del Paseo Fluvial',
      position: [110.8, 0, 16.0],
      yaw: 0.05,
      walkSpeed: 1.54,
      loopMode: 'loop',
      wpIndex: 6,
      waypoints: [
        { x: 88.8, z: 2.6, pause: 0 },
        { x: 92.4, z: 2.1, pause: 0 },
        { x: 97.5, z: 2.1, pause: 3.8, lookYaw: 0 },
        { x: 102.8, z: 2.1, pause: 0 },
        { x: 109.8, z: 3.2, pause: 0 },
        { x: 111.2, z: 14.5, pause: 0 },
        { x: 110.0, z: 26.6, pause: 0 },
        { x: 104.5, z: 26.6, pause: 4.4, lookYaw: Math.PI, emote: 'curtsy' },
        { x: 99.2, z: 26.6, pause: 0 },
        { x: 93.8, z: 19.5, pause: 0 },
        { x: 89.6, z: 10.5, pause: 0 }
      ],
      appearance: {
        avatarId: 'amara',
        outfitId: 'cristal_hielo',
        hairId: 'trenza_lateral',
        hairStyleOverride: 'trenza_lateral',
        courtPalette: 'petal_rose',
        courtSilhouette: 'empire_shawl',
        hairColorId: 'castano_chocolate',
        skinId: 'canela',
        eyeColorId: 'miel',
        accessories: ['tiara', 'bolso'],
        heightScale: 0.99
      },
      greeting: 'Me encanta enlazar el Puente Imperial con el Puente de los Cisnes bordeando la ribera; el rumor del agua acompaña cada paso.',
      greetings: [
        'Me encanta enlazar el Puente Imperial con el Puente de los Cisnes bordeando la ribera; el rumor del agua acompaña cada paso.',
        'Los cisnes blancos se acercan sin timidez al puente sur cuando las estrellas se reflejan entre los nenúfares.',
        '¿Has probado el vestido Princesa Cristal de Hielo en el Vestidor? Sus destellos celestes armonizan de maravilla con el río.'
      ]
    },
    {
      id: 'caballero_puente_cisnes',
      name: 'Marqués Gael del Río',
      role: 'Poeta del Puente de los Cisnes',
      position: [104.5, 0.78, 27.5],
      yaw: 0,
      walkSpeed: 1.52,
      loopMode: 'loop',
      wpIndex: 3,
      initialPause: 3.2,
      waypoints: [
        { x: 97.2, z: 27.5, pause: 2.6, lookYaw: 0.45 },
        { x: 99.5, z: 27.5, pause: 0 },
        { x: 104.5, z: 27.5, pause: 4.6, lookYaw: 0 },
        { x: 109.5, z: 27.5, pause: 0 },
        { x: 112.0, z: 27.0, pause: 2.8, lookYaw: 0.9 },
        { x: 109.5, z: 26.3, pause: 0 },
        { x: 104.5, z: 26.3, pause: 3.9, lookYaw: Math.PI },
        { x: 99.5, z: 26.3, pause: 0 }
      ],
      appearance: {
        avatarId: 'npc_adrian',
        outfitId: 'principe_gala',
        hairId: 'principe_tupe',
        hairStyleOverride: 'prince_royal_tousled',
        courtPalette: 'starlight_sapphire',
        hairColorId: 'pelirrojo_cobrizo',
        skinId: 'miel',
        eyeColorId: 'esmeralda',
        accessories: ['corona'],
        heightScale: 0.98
      },
      greeting: 'El Puente Sur de los Cisnes es el rincón más romántico del valle: aguas serenas a nuestros pies y la Cúpula dorada al horizonte.',
      greetings: [
        'El Puente Sur de los Cisnes es el rincón más romántico del valle: aguas serenas a nuestros pies y la Cúpula dorada al horizonte.',
        'Cuenta una antigua leyenda de palacio que pedir un deseo al paso de dos cisnes blancos trae fortuna durante toda la gala.',
        'Siguiendo la orilla oriental llegarás directo a los jardines VIP del Casino Real y a su fuente de cristal del sur.'
      ]
    },

    // =========================================================================
    // 3. PASARELA DE MODA, JARDINES DEL PALACIO Y ESTABLOS (7 NPCs)
    // =========================================================================
    {
      id: 'modelo_conversando',
      name: 'Modelo Valeria',
      role: 'Estrella de la Pasarela Imperial',
      position: [-27.8, 0, -5.8],
      yaw: 0,
      conversePhase: 0.0,
      converseEmote: 'star',
      appearance: {
        avatarId: 'valentina',
        outfitId: 'gala_nocturna',
        hairId: 'coleta_alta',
        hairStyleOverride: 'coleta_alta',
        courtPalette: 'imperial_lavender',
        courtSilhouette: 'court_starry',
        hairColorId: 'rosa_pastel',
        skinId: 'marfil',
        eyeColorId: 'violeta',
        accessories: ['tiara', 'gafas'],
        heightScale: 1.02
      },
      greeting: '¡Qué alegría verte en la antesala de la Gran Pasarela! Estamos ultimando detalles con el cronista antes del próximo desfile.',
      greetings: [
        '¡Qué alegría verte en la antesala de la Gran Pasarela! Estamos ultimando detalles con el cronista antes del próximo desfile.',
        'El secreto para brillar en los cuatro medallones iluminados es marcar tu pose justo bajo los haces de luz rosada.',
        '¡Combina un vestido de gala con tiara o gafas chic en el Vestidor Real [C] y el público de las gradas aplaudirá en pie!'
      ],
      actionLabel: '★ Desfilar en Pasarela',
      actionType: 'minigame:fashion'
    },
    {
      id: 'fotografo_real',
      name: 'Cronista Leo',
      role: 'Retratista de Moda y Corte',
      position: [-27.8, 0, -4.3],
      yaw: Math.PI,
      conversePhase: 4.5,
      converseEmote: 'wave',
      appearance: {
        avatarId: 'npc_adrian',
        outfitId: 'principe_gala',
        hairId: 'principe_tupe',
        hairStyleOverride: 'court_noble_short',
        courtPalette: 'champagne_gold',
        hairColorId: 'castano_chocolate',
        skinId: 'porcelana',
        eyeColorId: 'miel',
        accessories: ['gafas'],
        heightScale: 0.97
      },
      greeting: '¡Qué porte tan regio! Los focos cenitales de la Pasarela en T y el telón carmesí logran retratos dignos de la galería imperial.',
      greetings: [
        '¡Qué porte tan regio! Los focos cenitales de la Pasarela en T y el telón carmesí logran retratos dignos de la galería imperial.',
        'Desde las gradas escalonadas se consigue una perspectiva espectacular cuando las modelos hacen el giro en el medallón central.',
        'Más tarde iré a la Cúpula del Casino para inmortalizar la lámpara de araña y los fuegos artificiales de medianoche.'
      ]
    },
    {
      id: 'modelo_poses',
      name: 'Top Model Miranda',
      role: 'Solista de Alta Costura Real',
      position: [-27.8, 0, 7.5],
      yaw: -Math.PI / 2,
      walkSpeed: 1.40,
      loopMode: 'pingpong',
      wpIndex: 1,
      waypoints: [
        { x: -27.8, z: 5.9, pause: 4.4, lookYaw: -Math.PI / 2, state: 'pose', emote: 'star' },
        { x: -27.8, z: 9.2, pause: 4.2, lookYaw: -1.15, state: 'pose', emote: 'spin' }
      ],
      appearance: {
        avatarId: 'celeste',
        outfitId: 'chic_paseo',
        hairId: 'melena_ondulada',
        hairStyleOverride: 'princess_imperial_waves',
        courtPalette: 'velvet_burgundy',
        courtSilhouette: 'court_chic',
        hairColorId: 'pelirrojo_cobrizo',
        skinId: 'porcelana',
        eyeColorId: 'esmeralda',
        accessories: ['tiara', 'bolso'],
        heightScale: 1.03
      },
      greeting: 'Paso elegante, giro de princesa y... ¡pose de estrella! Ensayar en la antesala es el ritual infalible antes de salir a escena.',
      greetings: [
        'Paso elegante, giro de princesa y... ¡pose de estrella! Ensayar en la antesala es el ritual infalible antes de salir a escena.',
        'Recuerda que puedes lucir tus propios gestos reales en cualquier rincón con las teclas [1] al [4]: saludo, giro, reverencia y estrella.',
        'El conjunto Chic Paseo Real estiliza muchísimo tanto bajo los focos de la pasarela como paseando por el Bulevar Imperial.'
      ]
    },
    {
      id: 'jardinera_palacio_oeste',
      name: 'Jardinera Real Flora',
      role: 'Maestra de los Rosales del Oeste',
      position: [-19.5, 0, -12.6],
      yaw: Math.PI,
      walkSpeed: 1.12,
      loopMode: 'pingpong',
      wpIndex: 2,
      initialPause: 2.5,
      waypoints: [
        { x: -22.8, z: -12.6, pause: 4.2, lookYaw: Math.PI },
        { x: -19.5, z: -12.6, pause: 4.5, lookYaw: Math.PI, emote: 'wave' },
        { x: -16.8, z: -12.6, pause: 3.8, lookYaw: Math.PI }
      ],
      appearance: {
        avatarId: 'aurora',
        outfitId: 'chic_paseo',
        hairId: 'trenza_lateral',
        hairStyleOverride: 'trenza_lateral',
        courtPalette: 'palace_emerald',
        courtSilhouette: 'court_chic',
        hairColorId: 'castano_chocolate',
        skinId: 'miel',
        eyeColorId: 'esmeralda',
        accessories: [],
        heightScale: 0.96
      },
      greeting: 'Cuidamos con mimo cada rosal frente al Palacio de Cristal para que sus pétalos perfumados den la bienvenida a toda la corte.',
      greetings: [
        'Cuidamos con mimo cada rosal frente al Palacio de Cristal para que sus pétalos perfumados den la bienvenida a toda la corte.',
        'Si te adentras bajo los cerezos en flor verás flotar una suave lluvia de pétalos rosados iluminados por las farolas.',
        'Entre los senderos del jardín y el Mirador del Lago hemos visto relucir algunas de las Gemas del Reino del Príncipe Adrián.'
      ]
    },
    {
      id: 'jardinero_palacio_este',
      name: 'Botánico Real Julián',
      role: 'Guardián de los Parterres del Este',
      position: [19.5, 0, -12.6],
      yaw: Math.PI,
      walkSpeed: 1.12,
      loopMode: 'pingpong',
      wpIndex: 1,
      initialPause: 3.0,
      waypoints: [
        { x: 19.5, z: -12.6, pause: 4.4, lookYaw: Math.PI },
        { x: 22.6, z: -12.6, pause: 3.9, lookYaw: Math.PI },
        { x: 25.6, z: -12.6, pause: 4.2, lookYaw: Math.PI }
      ],
      appearance: {
        avatarId: 'npc_adrian',
        outfitId: 'principe_gala',
        hairId: 'principe_tupe',
        hairStyleOverride: 'court_noble_short',
        courtPalette: 'palace_emerald',
        hairColorId: 'rubio_miel',
        skinId: 'marfil',
        eyeColorId: 'zafiro',
        accessories: [],
        heightScale: 0.99
      },
      greeting: '¡Qué velada tan espléndida para los jardines! Hemos engalanado tanto estos rosales de Palacio como las palmeras reales del Casino.',
      greetings: [
        '¡Qué velada tan espléndida para los jardines! Hemos engalanado tanto estos rosales de Palacio como las palmeras reales del Casino.',
        'Cerca de la Glorieta de las Rosas al este y del Estanque de los Cisnes se respira una calma mágica bajo las estrellas.',
        'Los tulipanes dorados que rodean la Gran Fuente central parecen pequeñas coronas encendidas al reflejar la luz nocturna.'
      ]
    },
    {
      id: 'caballerizo_real',
      name: 'Caballerizo Darío',
      role: 'Maestro de los Establos de Palacio',
      position: [16.2, 0, -4.5],
      yaw: 0.62,
      interactRadius: 2.35,
      appearance: {
        avatarId: 'npc_adrian',
        outfitId: 'principe_gala',
        hairId: 'principe_tupe',
        hairStyleOverride: 'prince_royal_tousled',
        courtPalette: 'champagne_gold',
        hairColorId: 'negro_azabache',
        skinId: 'canela',
        eyeColorId: 'zafiro',
        accessories: [],
        heightScale: 1.01
      },
      greeting: '¡Estribos dorados listos! Nuestro noble corcel Castaño Miel acaba de ser cepillado y aguarda con su silla real de terciopelo.',
      greetings: [
        '¡Estribos dorados listos! Nuestro noble corcel Castaño Miel acaba de ser cepillado y aguarda con su silla real de terciopelo.',
        'Acércate a cualquiera de los caballos reales y pulsa [E] para montar; con [Shift] galoparás como el viento y con [Espacio] saltarás con gracia.',
        'Cruzar a caballo el Puente Imperial por el Bulevar hasta la Cúpula del Casino es el recorrido más majestuoso del reino.'
      ]
    },
    {
      id: 'amazona_casino',
      name: 'Amazona Real Elena',
      role: 'Guardiana de Corceles del Casino',
      position: [116.2, 0, -9.2],
      yaw: 0.80,
      interactRadius: 2.35,
      appearance: {
        avatarId: 'amara',
        outfitId: 'amazona_palacio',
        hairId: 'coleta_alta',
        hairStyleOverride: 'coleta_alta',
        courtPalette: 'velvet_burgundy',
        hairColorId: 'rubio_miel',
        skinId: 'canela',
        eyeColorId: 'miel',
        accessories: ['tiara'],
        heightScale: 1.0
      },
      greeting: 'Bienvenida a la Explanada Real del Casino. Aquí descansan Negro Azabache y Blanco Imperial mientras los invitados disfrutan de la Cúpula.',
      greetings: [
        'Bienvenida a la Explanada Real del Casino. Aquí descansan Negro Azabache y Blanco Imperial mientras los invitados disfrutan de la Cúpula.',
        'Esta levita de Amazona de Palacio con botones dorados y botas altas es perfecta para cabalgar bajo las estrellas con total elegancia.',
        'Cuando regreses hacia el Palacio de Cristal, prueba a cabalgar hacia el sur hasta el Puente de los Cisnes: la vista del río es inolvidable.'
      ]
    }
  ];

  constructor(scene, textureFactory = null, collisionSystem = null) {
    this.#scene = scene;
    this.#textures = textureFactory;
    this.#collision = collisionSystem;
  }

  init() {
    this.dispose();

    // Geometría y material únicos compartidos para el halo imperial oro-rosa de suelo de todos los NPCs
    this.#sharedRingGeo = new THREE.RingGeometry(0.55, 0.72, 24);
    this.#sharedRingMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: GraphicsSync.uTime,
        uNightFactor: GraphicsSync.uNightFactor
      },
      vertexShader: /* glsl */ `
        varying vec2 vLocalPos;
        void main() {
          vLocalPos = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uNightFactor;
        varying vec2 vLocalPos;

        void main() {
          float r = length(vLocalPos);
          float radial = clamp((r - 0.55) / 0.17, 0.0, 1.0);
          float edgeMask = smoothstep(0.0, 0.22, radial) * (1.0 - smoothstep(0.68, 1.0, radial));
          float innerCore = smoothstep(0.32, 0.50, radial) * (1.0 - smoothstep(0.50, 0.68, radial));

          float angle = atan(vLocalPos.y, vLocalPos.x);
          float shimmer = 0.84 + 0.16 * sin(angle * 6.0 - uTime * 2.2);
          float pulse = 0.80 + 0.20 * sin(uTime * 2.4);

          vec3 goldCol = vec3(0.96, 0.78, 0.42);
          vec3 roseCol = vec3(1.00, 0.62, 0.80);
          vec3 auraCol = mix(goldCol, roseCol, 0.35 + 0.25 * sin(angle * 2.0 + uTime * 1.4));
          vec3 finalCol = auraCol * (0.78 + 0.45 * innerCore) * shimmer;

          float nightBoost = mix(0.42, 0.72, clamp(uNightFactor, 0.0, 1.0));
          float alpha = (edgeMask * 0.68 + innerCore * 0.35) * pulse * nightBoost;
          gl_FragColor = vec4(finalCol, alpha);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.#sharedRingMat.userData.isVfx = true;

    for (let i = 0; i < this.#definitions.length; i++) {
      const def = this.#definitions[i];
      if (Array.isArray(def.greetings) && def.greetings.length > 0 && !def.greeting) {
        def.greeting = def.greetings[0];
      }

      const rig = new CharacterRig(def.appearance, this.#textures);
      const root = rig.init();
      root.userData.isCharacter = true;

      const baseY = def.position[1] || 0;
      const startX = def.position[0];
      const startZ = def.position[2];
      const startY = this.#sampleGroundY(startX, startZ, baseY, baseY);

      root.position.set(startX, startY, startZ);
      root.rotation.y = def.yaw;

      const label = this.#createTag(def.name, Boolean(def.questHost));
      label.position.set(0, 2.15, 0);
      label.scale.set(2.05, 0.42, 1);
      root.add(label);

      const ring = new THREE.Mesh(this.#sharedRingGeo, this.#sharedRingMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      ring.castShadow = false;
      root.add(ring);

      // Pose inicial relajada para que luzca natural incluso antes de entrar en radio activo
      rig.update(0.016, 'idle', 0, 1);

      const shadow = createContactShadow(0.68, 0.44);
      shadow.position.set(startX, startY + 0.025, startZ);
      this.#scene.add(shadow);

      this.#scene.add(root);

      const pos = new THREE.Vector3(startX, startY, startZ);
      const greetR = def.greetRadius || 0;
      const interactR = def.interactRadius || 0;

      const entry = {
        def,
        rig,
        root,
        shadow,
        label,
        ring,
        pos,
        look: new THREE.Vector3(),
        baseY,
        accumDt: 0,
        animState: 'idle',
        curSpeed: 0,
        lookingAtPlayer: false,
        wasSleeping: false,
        talkCount: 0,
        seed: i * 4.7 + 1.3,
        interactRadiusSq: interactR > 0 ? interactR * interactR : Infinity,
        // Saludo elegante al paso (Guardias / Anfitriones del Casino)
        greetEmote: def.greetEmote || null,
        greetRadiusSq: greetR * greetR,
        greetCooldown: (i % 2) * 0.65,
        greetJitter: (i % 3) * 0.55,
        // Conversación viva en pareja (Antesala de Pasarela)
        hasConverse: typeof def.conversePhase === 'number',
        converseTimer: def.conversePhase || 0,
        converseEmote: def.converseEmote || null,
        converseEmoteCooldown: 6.0 + (i % 3) * 2.5,
        // Patrulla suave por waypoints
        waypoints: def.waypoints || null,
        loopMode: def.loopMode || 'loop',
        wpIndex: def.wpIndex || 0,
        wpDir: 1,
        pauseTimer: def.initialPause || 0,
        pauseLookYaw: def.yaw,
        pauseHasLook: false,
        pauseState: 'idle',
        pausePendingEmote: null,
        pauseEmoteDelay: 0,
        stuckTimer: 0
      };

      this.#npcs.push(entry);
      this.#positionsView.push({ id: def.id, name: def.name, pos });
    }
  }

  #createTag(name, isQuestHost = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 108;
    const ctx = canvas.getContext('2d');

    // Fondo ciruela oscuro y texto champán suave: nítido y sin quemar el UnrealBloomPass
    ctx.fillStyle = 'rgba(34, 14, 34, 0.88)';
    ctx.beginPath();
    ctx.roundRect(14, 14, 484, 80, 38);
    ctx.fill();
    ctx.strokeStyle = isQuestHost ? '#d4a66a' : '#a97f52';
    ctx.lineWidth = isQuestHost ? 4.5 : 3.5;
    ctx.stroke();

    ctx.fillStyle = '#dfd0db';
    ctx.font = 'bold 31px "Palatino Linotype", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icon = isQuestHost ? '♛' : '✦';
    ctx.fillText(`${icon} ${name}`, 256, 55, 452);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: 0xc8c8c8,
      transparent: true,
      depthWrite: false,
      toneMapped: false
    });
    return new THREE.Sprite(mat);
  }

  /**
   * Respaldo analítico exacto de altura para puentes, escalinata e interior del Casino y Palacio
   * cuando `collisionSystem` no está disponible o devuelve cota base.
   */
  #getAnalyticalGroundY(x, z, baseY) {
    // Interior de la Gran Cúpula del Casino: centro (162, 0), radio útil 34.5, Y = 0.60
    const dxC = x - 162.0;
    if (dxC * dxC + z * z < 1190.25) {
      return 0.60;
    }
    // Escalinata Oeste del Casino: X ∈ [121.2, 128.5], Z ∈ [-6.5, 6.5]
    if (x >= 121.2 && x <= 128.5 && z >= -6.5 && z <= 6.5) {
      const t = (x - 121.2) / 7.0;
      return t <= 0 ? 0 : t >= 1 ? 0.60 : t * 0.60;
    }
    // Puente Imperial del Bulevar sobre el Río: centro (97.5, 0), rampas X ∈ [92.4, 102.6], cresta Y = 0.76
    if (x >= 92.4 && x <= 102.6 && Math.abs(z) <= 4.5) {
      return Math.max(0, 0.76 * (1 - Math.abs(x - 97.5) / 5.1));
    }
    // Puente Sur de los Cisnes: centro (104.5, 27.0), X ∈ [99.5, 109.5], Z ∈ [25.0, 29.0], cresta Y = 0.78
    if (x >= 99.5 && x <= 109.5 && z >= 25.0 && z <= 29.0) {
      return Math.max(0, 0.78 * (1 - Math.abs(x - 104.5) / 5.0));
    }
    // Interior del Palacio de Cristal (p.ej. Sofía y Maestra en Y = 1.0)
    if (x >= -36.0 && x <= 36.0 && z >= -76.0 && z <= -22.0) {
      return baseY;
    }
    return 0;
  }

  setWaterSystem(waterSystem) {
    this.#waterSystem = waterSystem || null;
  }

  #sampleGroundY(x, z, curY, baseY) {
    const analyticY = this.#getAnalyticalGroundY(x, z, baseY);
    let bestY = analyticY;
    if (this.#collision) {
      const colY = this.#collision.getGroundHeight(x, z, curY, 1.2);
      if (colY > 0) bestY = colY;
    }
    if (this.#waterSystem) {
      const bridgeY = this.#waterSystem.getBridgeHeightAt(x, z);
      if (bridgeY !== null && bridgeY <= curY + 1.2 && bridgeY >= bestY) {
        bestY = bridgeY;
      }
    }
    return bestY;
  }

  #findNearestEntry(playerPos, maxDist = 4.2) {
    if (!playerPos) return null;
    let best = null;
    let bestSq = maxDist * maxDist;
    const px = playerPos.x;
    const py = playerPos.y;
    const pz = playerPos.z;

    for (let i = 0; i < this.#npcs.length; i++) {
      const npc = this.#npcs[i];
      const dx = npc.pos.x - px;
      const dy = npc.pos.y - py;
      const dz = npc.pos.z - pz;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq < bestSq && dSq <= npc.interactRadiusSq) {
        bestSq = dSq;
        best = npc;
      }
    }
    return best;
  }

  getNearestNPC(playerPos, maxDist = 4.2) {
    const best = this.#findNearestEntry(playerPos, maxDist);
    if (!best) return null;

    const def = best.def;
    const list = def.greetings;
    if (list && list.length > 0) {
      // Los 4 anfitriones de misión muestran su instrucción principal al primer encuentro
      // y rotan en charlas sucesivas; los ciudadanos rotan al hablar y según el momento.
      const idx = def.questHost
        ? (best.talkCount % list.length)
        : ((best.talkCount + ((this.#elapsed + best.seed) * 0.055 | 0)) % list.length);
      def.greeting = list[idx];
    }
    return def;
  }

  getAllPositions() {
    return this.#positionsView;
  }

  #advanceWaypointIndex(npc, count) {
    if (count <= 1) {
      npc.wpIndex = 0;
      return;
    }
    if (npc.loopMode === 'pingpong') {
      let next = npc.wpIndex + npc.wpDir;
      if (next >= count) {
        npc.wpDir = -1;
        next = count - 2;
      } else if (next < 0) {
        npc.wpDir = 1;
        next = 1;
      }
      npc.wpIndex = next;
    } else {
      npc.wpIndex = (npc.wpIndex + 1) % count;
    }
  }

  #stepRoutine(npc, stepDt, playerPos, distSq, talking, allowEmotes) {
    const wps = npc.waypoints;

    // --- A. NPCs Paseantes con Rutas de Waypoints ---
    if (wps && wps.length > 0) {
      // Si el jugador está muy cerca (< 3.2 u) o charlando, se detiene amablemente y lo mira
      if ((talking || distSq < STOP_DIST_SQ) && playerPos) {
        npc.curSpeed = 0;
        npc.animState = talking ? 'talk' : 'idle';
        const targetYaw = Math.atan2(playerPos.x - npc.pos.x, playerPos.z - npc.pos.z);
        npc.root.rotation.y = stepAngle(npc.root.rotation.y, targetYaw, talking ? 3.4 : 2.4, stepDt);
        return;
      }

      // En pausa natural sobre puente, fuente, pasarela o parterre de rosas
      if (npc.pauseTimer > 0) {
        npc.pauseTimer -= stepDt;
        npc.curSpeed = 0;
        npc.animState = npc.pauseState;
        if (npc.pauseHasLook) {
          npc.root.rotation.y = stepAngle(npc.root.rotation.y, npc.pauseLookYaw, 2.6, stepDt);
        }
        if (npc.pausePendingEmote) {
          npc.pauseEmoteDelay -= stepDt;
          if (npc.pauseEmoteDelay <= 0) {
            if (allowEmotes) npc.rig.playEmote(npc.pausePendingEmote);
            npc.pausePendingEmote = null;
          }
        }
        if (npc.pauseTimer <= 0) {
          npc.pauseState = 'idle';
          npc.pausePendingEmote = null;
          this.#advanceWaypointIndex(npc, wps.length);
        }
        return;
      }

      const wp = wps[npc.wpIndex];
      const dx = wp.x - npc.pos.x;
      const dz = wp.z - npc.pos.z;
      const dist = Math.hypot(dx, dz);
      const speed = npc.def.walkSpeed || 1.5;

      if (dist <= Math.max(0.18, speed * stepDt * 1.15) || npc.stuckTimer > 2.8) {
        npc.stuckTimer = 0;
        if (dist <= 0.65) {
          npc.pos.x = wp.x;
          npc.pos.z = wp.z;
          npc.pos.y = this.#sampleGroundY(npc.pos.x, npc.pos.z, npc.pos.y, npc.baseY);
          npc.root.position.copy(npc.pos);
        }

        if (wp.pause && wp.pause > 0) {
          npc.pauseTimer = wp.pause;
          npc.pauseState = wp.state || 'idle';
          npc.pauseHasLook = typeof wp.lookYaw === 'number';
          if (npc.pauseHasLook) npc.pauseLookYaw = wp.lookYaw;
          npc.pausePendingEmote = wp.emote || null;
          npc.pauseEmoteDelay = 0.65;
          npc.curSpeed = 0;
          npc.animState = npc.pauseState;
        } else {
          this.#advanceWaypointIndex(npc, wps.length);
        }
        return;
      }

      const invDist = 1 / dist;
      const dirX = dx * invDist;
      const dirZ = dz * invDist;
      const prevX = npc.pos.x;
      const prevZ = npc.pos.z;
      const moveStep = Math.min(dist, speed * stepDt);

      npc.pos.x += dirX * moveStep;
      npc.pos.z += dirZ * moveStep;
      npc.pos.y = this.#sampleGroundY(npc.pos.x, npc.pos.z, npc.pos.y, npc.baseY);
      if (this.#collision) {
        this.#collision.resolveHorizontal(npc.pos, 0.36, 1.75);
        npc.pos.y = this.#sampleGroundY(npc.pos.x, npc.pos.z, npc.pos.y, npc.baseY);
      }

      const movedSq = (npc.pos.x - prevX) * (npc.pos.x - prevX) + (npc.pos.z - prevZ) * (npc.pos.z - prevZ);
      if (movedSq < 1e-5 * stepDt) {
        npc.stuckTimer += stepDt;
      } else {
        npc.stuckTimer = 0;
      }

      npc.root.position.copy(npc.pos);
      if (npc.shadow) {
        npc.shadow.position.set(npc.pos.x, npc.pos.y + 0.025, npc.pos.z);
      }
      const travelYaw = Math.atan2(dirX, dirZ);
      npc.root.rotation.y = stepAngle(npc.root.rotation.y, travelYaw, 5.2, stepDt);
      npc.curSpeed = speed;
      npc.animState = 'walk';
      return;
    }

    // --- B. NPCs Estáticos, Guardias y Pareja Conversando ---
    npc.curSpeed = 0;

    if (talking && playerPos) {
      npc.animState = 'talk';
      const targetYaw = Math.atan2(playerPos.x - npc.pos.x, playerPos.z - npc.pos.z);
      npc.root.rotation.y = stepAngle(npc.root.rotation.y, targetYaw, 3.2, stepDt);
      return;
    }

    const turnThresholdSq = npc.hasConverse ? STOP_DIST_SQ : TURN_DIST_SQ;
    if (distSq < turnThresholdSq && playerPos) {
      npc.animState = 'idle';
      const targetYaw = Math.atan2(playerPos.x - npc.pos.x, playerPos.z - npc.pos.z);
      npc.root.rotation.y = stepAngle(npc.root.rotation.y, targetYaw, 1.6, stepDt);
      return;
    }

    // Retorno suave a su orientación escénica original cuando el jugador se aleja
    npc.root.rotation.y = stepAngle(npc.root.rotation.y, npc.def.yaw, 1.5, stepDt);

    if (npc.hasConverse) {
      npc.converseTimer = (npc.converseTimer + stepDt) % 9.0;
      npc.animState = npc.converseTimer < 4.2 ? 'talk' : 'idle';
      if (npc.converseEmote) {
        npc.converseEmoteCooldown -= stepDt;
        if (npc.converseEmoteCooldown <= 0) {
          if (allowEmotes && npc.animState === 'idle') {
            npc.rig.playEmote(npc.converseEmote);
          }
          npc.converseEmoteCooldown = 11.0 + npc.greetJitter * 3.0;
        }
      }
      return;
    }

    npc.animState = 'idle';
  }

  /**
   * Actualización 100% libre de GC con 3 niveles estrictos de LOD:
   *  - < 45 u: 60 Hz locomoción completa, seguimiento de mirada, saludos reales y físicas.
   *  - 45–85 u: 1 de cada 4 frames patrulla ligera + rig LOD 2.
   *  - > 85 u: pausa total de rig.update (cero coste de CPU).
   */
  update(dt, playerPos, dialogueOpen = false) {
    if (dt <= 0) return;
    this.#frameCounter = (this.#frameCounter + 1) | 0;
    this.#elapsed += dt;

    const speakerEntry = dialogueOpen && playerPos ? this.#findNearestEntry(playerPos, 4.2) : null;
    if (this.#wasDialogueOpen && !dialogueOpen && this.#lastSpeaker) {
      this.#lastSpeaker.talkCount = (this.#lastSpeaker.talkCount + 1) | 0;
    }
    this.#wasDialogueOpen = Boolean(dialogueOpen && speakerEntry);
    if (speakerEntry) this.#lastSpeaker = speakerEntry;

    const hasPlayer = Boolean(playerPos);
    const px = hasPlayer ? playerPos.x : 0;
    const py = hasPlayer ? playerPos.y : 0;
    const pz = hasPlayer ? playerPos.z : 0;

    for (let i = 0; i < this.#npcs.length; i++) {
      const npc = this.#npcs[i];
      let distSq = 999999;
      if (hasPlayer) {
        const dx = px - npc.pos.x;
        const dy = py - npc.pos.y;
        const dz = pz - npc.pos.z;
        distSq = dx * dx + dy * dy + dz * dz;
      }

      const talking = speakerEntry === npc;
      const showLabel = distSq < LABEL_HIDE_SQ;
      if (npc.label.visible !== showLabel) {
        npc.label.visible = showLabel;
      }

      // LOD 3 (> 85 u): pausa completa de CPU hasta que el jugador se acerque
      if (distSq > LOD_FAR_SQ && !talking) {
        npc.accumDt = 0;
        npc.wasSleeping = true;
        if (npc.lookingAtPlayer) {
          npc.rig.setLookTarget(null);
          npc.lookingAtPlayer = false;
        }
        continue;
      }

      if (npc.wasSleeping) {
        npc.wasSleeping = false;
        npc.rig.resetMotion();
      }

      // LOD 2 (45–85 u): patrulla ligera + animación simplificada solo 1 de cada 4 frames
      if (distSq >= LOD_NEAR_SQ && !talking) {
        if (npc.lookingAtPlayer) {
          npc.rig.setLookTarget(null);
          npc.lookingAtPlayer = false;
        }
        npc.accumDt += dt;
        if (((this.#frameCounter + i) & 3) === 0) {
          const stepDt = npc.accumDt;
          npc.accumDt = 0;
          this.#stepRoutine(npc, stepDt, playerPos, distSq, false, false);
          npc.ring.rotation.z += stepDt * 0.9;
          npc.rig.update(stepDt, npc.animState, npc.curSpeed, 2);
        }
        continue;
      }

      // LOD 1 / 0 (< 45 u): 60 Hz locomoción completa, mirada suave y saludos de cortesía
      const stepDt = dt + npc.accumDt;
      npc.accumDt = 0;

      if (distSq < LOOK_DIST_SQ && hasPlayer) {
        npc.look.copy(playerPos);
        npc.rig.setLookTarget(npc.look);
        npc.lookingAtPlayer = true;
      } else if (npc.lookingAtPlayer) {
        npc.rig.setLookTarget(null);
        npc.lookingAtPlayer = false;
      }

      if (npc.greetEmote) {
        if (npc.greetCooldown > 0) npc.greetCooldown -= stepDt;
        if (distSq < npc.greetRadiusSq && !talking && npc.greetCooldown <= 0) {
          npc.rig.playEmote(npc.greetEmote);
          npc.greetCooldown = 12.0 + npc.greetJitter;
        }
      }

      const lod = talking ? 0 : (distSq > LOD_FULL_SQ ? 1 : 0);
      this.#stepRoutine(npc, stepDt, playerPos, distSq, talking, lod === 0);
      npc.ring.rotation.z += stepDt * 0.9;
      npc.rig.update(stepDt, npc.animState, npc.curSpeed, lod);
    }
  }

  getNearestNpcPosition(refPos, outVec) {
    if (!refPos || !outVec || this.#npcs.length === 0) return false;
    let bestDistSq = Infinity;
    let found = false;
    for (let i = 0; i < this.#npcs.length; i++) {
      const p = this.#npcs[i].pos;
      const dx = p.x - refPos.x;
      const dy = p.y - refPos.y;
      const dz = p.z - refPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        outVec.copy(p);
        found = true;
      }
    }
    return found;
  }

  dispose() {
    for (let i = 0; i < this.#npcs.length; i++) {
      const npc = this.#npcs[i];
      npc.label.material.map?.dispose();
      npc.label.material.dispose();
      if (npc.shadow) {
        this.#scene.remove(npc.shadow);
        npc.shadow.material?.dispose();
        npc.shadow = null;
      }
      this.#scene.remove(npc.root);
      npc.rig.dispose();
    }
    this.#npcs.length = 0;
    this.#positionsView.length = 0;
    this.#sharedRingGeo?.dispose();
    this.#sharedRingMat?.dispose();
    this.#sharedRingGeo = null;
    this.#sharedRingMat = null;
    this.#lastSpeaker = null;
    this.#wasDialogueOpen = false;
  }
}
