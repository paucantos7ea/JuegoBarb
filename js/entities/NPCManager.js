import * as THREE from 'three';
import { CharacterRig } from './CharacterRig.js';

export class NPCManager {
  #scene;
  #textures;
  #npcs = [];

  #definitions = [
    {
      id: 'adrian',
      name: 'Príncipe Adrián',
      role: 'Heredero del Palacio de Cristal',
      position: [6.5, 0, -6.5],
      yaw: -0.55,
      appearance: {
        avatarId: 'npc_adrian',
        outfitId: 'principe_gala',
        hairId: 'principe_corto',
        accessories: ['cetro']
      },
      greeting: '¡Bienvenidos al Palacio de Cristal! Cinco Gemas del Reino brillan ocultas por los jardines, la escalinata y el Balcón Real. ¡Ayúdanos a reunirlas antes de la gran gala!'
    },
    {
      id: 'sofia',
      name: 'Estilista Sofía',
      role: 'Directora del Vestidor Real',
      position: [-16, 1.0, -31],
      yaw: 0.75,
      appearance: {
        avatarId: 'npc_sofia',
        outfitId: 'gala_rosa',
        hairId: 'ondas_reales',
        accessories: ['tiara', 'bolso']
      },
      greeting: '¡Fabuloso verte en el Vestidor Real! Pulsa [C] cuando quieras para cambiar de conjunto o combinar accesorios. ¿Te animas a brillar en la Pasarela de Moda Real?',
      actionLabel: '✦ Abrir Vestidor',
      actionType: 'wardrobe',
      secondaryLabel: '★ Ir a la Pasarela',
      secondaryType: 'minigame:fashion'
    },
    {
      id: 'camila',
      name: 'Princesa Camila',
      role: 'Anfitriona de los Jardines de Perla',
      position: [16, 0, 10],
      yaw: -0.9,
      appearance: {
        avatarId: 'npc_camila',
        outfitId: 'casual_chic',
        hairId: 'coleta_perla',
        accessories: ['gafas', 'tiara']
      },
      greeting: '¡Los jardines están radiantes hoy! Necesitamos entregar las Invitaciones Reales al Príncipe Adrián, a Estilista Sofía y a la Maestra de Ceremonias. ¿O prefieres una carrera contrarreloj?',
      actionLabel: '♛ Carrera por los Jardines',
      actionType: 'minigame:race'
    },
    {
      id: 'maestra',
      name: 'Maestra de Ceremonias',
      role: 'Directora del Salón de Baile',
      position: [16, 1.0, -31],
      yaw: -0.75,
      appearance: {
        avatarId: 'npc_maestra',
        outfitId: 'cristal_nocturno',
        hairId: 'recogido_imperial',
        accessories: ['tiara', 'cetro']
      },
      greeting: 'La pista de cristal está lista y la orquesta afinada. ¡Todo el reino espera tu gran baile imperial! Sigue el ritmo con W, A, S y D.',
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
      root.position.set(...def.position);
      root.rotation.y = def.yaw;

      const label = this.#createTag(def.name);
      label.position.set(0, 2.24, 0);
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
      root.add(ring);

      this.#scene.add(root);
      this.#npcs.push({
        def,
        rig,
        root,
        label,
        ring,
        pos: new THREE.Vector3(...def.position)
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

  update(dt, playerPos) {
    for (const npc of this.#npcs) {
      const dist = playerPos ? npc.pos.distanceTo(playerPos) : 99;
      if (dist < 6.0 && playerPos) {
        const targetYaw = Math.atan2(playerPos.x - npc.pos.x, playerPos.z - npc.pos.z);
        let diff = targetYaw - npc.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        npc.root.rotation.y += diff * Math.min(1, dt * 4);
      }
      npc.ring.rotation.z += dt * 0.9;
      npc.rig.update(dt, dist < 4.2 ? 'pose' : 'idle', 0);
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
