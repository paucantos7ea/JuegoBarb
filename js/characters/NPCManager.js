import * as THREE from 'three';
import { CharacterRig } from './CharacterRig.js';

export class NPCManager {
  #scene;
  #textures;
  #npcs = [];
  #frameCounter = 0;

  #definitions = [
    {
      id: 'adrian',
      name: 'Príncipe Adrián',
      role: 'Heredero del Palacio de Cristal',
      position: [7.5, 0, -11.5],
      yaw: -0.5,
      appearance: {
        avatarId: 'npc_adrian',
        outfitId: 'principe_gala',
        hairId: 'principe_tupe',
        hairColorId: 'castano_chocolate',
        skinId: 'miel',
        eyeColorId: 'zafiro',
        accessories: ['corona', 'cetro']
      },
      greeting: '¡Bienvenidos al Palacio de Cristal! Cinco Gemas del Reino brillan ocultas por los jardines, el Salón del Trono, el Balcón Imperial y la Biblioteca Real. ¡Ayúdanos a reunirlas antes de la gran gala!'
    },
    {
      id: 'sofia',
      name: 'Estilista Sofía',
      role: 'Directora del Vestidor Real',
      position: [-20, 1.0, -31],
      yaw: 0.75,
      appearance: {
        avatarId: 'npc_sofia',
        outfitId: 'gala_rosa',
        hairId: 'melena_ondulada',
        hairColorId: 'rosa_pastel',
        skinId: 'porcelana',
        eyeColorId: 'esmeralda',
        accessories: ['tiara', 'bolso']
      },
      greeting: '¡Fabuloso verte en el Vestidor Real! Pulsa [C] cuando quieras para cambiar de vestido, peinado, colores o accesorios. ¿Te animas a brillar en la Gran Pasarela con gradas?',
      actionLabel: '✦ Abrir Vestidor',
      actionType: 'wardrobe',
      secondaryLabel: '★ Ir a la Pasarela',
      secondaryType: 'minigame:fashion'
    },
    {
      id: 'camila',
      name: 'Princesa Camila',
      role: 'Anfitriona de los Jardines de Perla',
      position: [12.5, 0, 12.5],
      yaw: -0.75,
      appearance: {
        avatarId: 'npc_camila',
        outfitId: 'atardecer_perla',
        hairId: 'media_melena',
        hairColorId: 'pelirrojo_cobrizo',
        skinId: 'miel',
        eyeColorId: 'miel',
        accessories: ['gafas', 'tiara']
      },
      greeting: '¡Los jardines y bosques están llenos de vida hoy! Necesitamos entregar las Invitaciones Reales al Príncipe Adrián, a Estilista Sofía y a la Maestra de Ceremonias. ¿O prefieres una carrera contrarreloj?',
      actionLabel: '♛ Carrera por los Jardines',
      actionType: 'minigame:race'
    },
    {
      id: 'maestra',
      name: 'Maestra de Ceremonias',
      role: 'Directora del Salón de Baile',
      position: [19.0, 1.0, -30.0],
      yaw: -0.65,
      appearance: {
        avatarId: 'npc_maestra',
        outfitId: 'gala_nocturna',
        hairId: 'recogido_mono',
        hairColorId: 'rubio_platino',
        skinId: 'canela',
        eyeColorId: 'violeta',
        accessories: ['corona', 'cetro']
      },
      greeting: 'La pista de mármol pulido y el piano de cola están listos en el Salón de Baile y Banquetes. ¡Todo el reino espera tu gran baile imperial! Sigue el ritmo con W, A, S y D.',
      actionLabel: '♪ Iniciar Baile Real',
      actionType: 'minigame:ball'
    }
  ];

  constructor(scene, textureFactory = null) {
    this.#scene = scene;
    this.#textures = textureFactory;
  }

  init() {
    for (const def of this.#definitions) {
      const rig = new CharacterRig(def.appearance, this.#textures);
      const root = rig.init();
      root.userData.isCharacter = true;
      root.position.set(...def.position);
      root.rotation.y = def.yaw;

      const label = this.#createTag(def.name);
      label.position.set(0, 2.15, 0);
      label.scale.set(2.05, 0.42, 1);
      root.add(label);

      // Halo sutil dorado en los pies para indicar NPC interactivo
      const ringGeo = new THREE.RingGeometry(0.55, 0.72, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xcfa45a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      ring.castShadow = false;
      root.add(ring);

      this.#scene.add(root);
      this.#npcs.push({
        def,
        rig,
        root,
        label,
        ring,
        pos: new THREE.Vector3(...def.position),
        look: new THREE.Vector3(),
        accumDt: 0
      });
    }
  }

  #createTag(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 108;
    const ctx = canvas.getContext('2d');

    // Fondo ciruela oscuro y texto champán suave: evita quemado por UnrealBloomPass
    ctx.fillStyle = 'rgba(34, 14, 34, 0.88)';
    ctx.beginPath();
    ctx.roundRect(14, 14, 484, 80, 38);
    ctx.fill();
    ctx.strokeStyle = '#b98c58';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#dfd0db';
    ctx.font = 'bold 34px "Palatino Linotype", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`♛ ${name}`, 256, 55);

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

  getNearestNPC(playerPos, maxDist = 4.2) {
    let nearest = null;
    let bestSq = maxDist * maxDist;
    for (const npc of this.#npcs) {
      const dSq = npc.pos.distanceToSquared(playerPos);
      if (dSq < bestSq) {
        bestSq = dSq;
        nearest = npc.def;
      }
    }
    return nearest;
  }

  getAllPositions() {
    return this.#npcs.map((n) => ({ id: n.def.id, name: n.def.name, pos: n.pos }));
  }

  /**
   * NPCs con vida propia: reposo vivo con respiración y parpadeo, la cabeza sigue al jugador
   * al acercarse, el cuerpo se gira con calma al entrar en distancia de charla y, con el
   * diálogo abierto, el NPC más cercano gesticula mientras habla.
   */
  update(dt, playerPos, dialogueOpen = false) {
    this.#frameCounter = (this.#frameCounter + 1) | 0;
    const speaker = dialogueOpen && playerPos ? this.getNearestNPC(playerPos, 4.2) : null;
    for (let i = 0; i < this.#npcs.length; i++) {
      const npc = this.#npcs[i];
      const distSq = playerPos ? npc.pos.distanceToSquared(playerPos) : 999999;
      const talking = speaker === npc.def;
      if (distSq < 36 && playerPos) {
        npc.look.copy(playerPos);
        npc.rig.setLookTarget(npc.look);
        if (distSq < 17.64) {
          const targetYaw = Math.atan2(playerPos.x - npc.pos.x, playerPos.z - npc.pos.z);
          let diff = targetYaw - npc.root.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          npc.root.rotation.y += diff * Math.min(1, dt * (talking ? 3.0 : 1.4));
        }
      } else {
        npc.rig.setLookTarget(null);
      }

      if (distSq > 2025 && !talking) {
        npc.accumDt += dt;
        if ((this.#frameCounter + i) % 3 === 0) {
          const stepDt = npc.accumDt;
          npc.accumDt = 0;
          npc.ring.rotation.z += stepDt * 0.9;
          npc.rig.update(stepDt, 'idle', 0, 2);
        }
        continue;
      }

      const stepDt = dt + npc.accumDt;
      npc.accumDt = 0;
      const lod = distSq > 625 ? 1 : 0;
      npc.ring.rotation.z += stepDt * 0.9;
      npc.rig.update(stepDt, talking ? 'talk' : 'idle', 0, talking ? 0 : lod);
    }
  }

  dispose() {
    for (const npc of this.#npcs) {
      npc.label.material.map?.dispose();
      npc.label.material.dispose();
      npc.ring.geometry.dispose();
      npc.ring.material.dispose();
      this.#scene.remove(npc.root);
      npc.rig.dispose();
    }
    this.#npcs.length = 0;
  }
}
