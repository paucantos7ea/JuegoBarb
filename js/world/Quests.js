import * as THREE from 'three';

export class QuestSystem {
  #scene;
  #audio;
  #onChange;
  #gemGroup = null;
  #gemNodes = [];
  #elapsed = 0;

  #state = {
    galaChangedOutfit: false,
    galaEquippedAccessory: false,
    galaTalkedSofia: false,
    collectedGems: [],
    invitedNpcs: []
  };

  #gemSpecs = [
    { id: 'gem_rubi', name: 'Rubí de los Jardines', pos: [0, 1.15, 25], color: 0xff5fa8 },
    { id: 'gem_zafiro', name: 'Zafiro del Mirador', pos: [0, 2.35, 46], color: 0x67b8ff },
    { id: 'gem_diamante', name: 'Diamante del Balcón Imperial', pos: [0, 8.65, -19.2], color: 0xfff0ff },
    { id: 'gem_amatista', name: 'Amatista del Salón del Trono', pos: [0, 2.75, -69.5], color: 0xc27aff },
    { id: 'gem_cuarzo', name: 'Cuarzo de la Biblioteca Real', pos: [25.0, 8.65, -38.0], color: 0xffd27d }
  ];

  #requiredInvites = ['adrian', 'sofia', 'maestra'];

  constructor(scene, audioSynth, onChange) {
    this.#scene = scene;
    this.#audio = audioSynth;
    this.#onChange = onChange;
  }

  init() {
    this.#gemGroup = new THREE.Group();
    this.#gemGroup.name = 'RoyalGems';

    const geo = new THREE.OctahedronGeometry(0.42, 0);
    const haloGeo = new THREE.RingGeometry(0.45, 0.58, 20);

    for (const spec of this.#gemSpecs) {
      const mat = new THREE.MeshStandardMaterial({
        color: spec.color,
        emissive: spec.color,
        emissiveIntensity: 0.9,
        metalness: 0.25,
        roughness: 0.08
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...spec.pos);
      mesh.scale.set(0.85, 1.35, 0.85);

      const haloMat = new THREE.MeshBasicMaterial({
        color: spec.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(spec.pos[0], spec.pos[1] - 0.65, spec.pos[2]);
      halo.rotation.x = -Math.PI / 2;

      this.#gemGroup.add(mesh, halo);
      this.#gemNodes.push({
        spec,
        mesh,
        halo,
        baseY: spec.pos[1],
        pos: new THREE.Vector3(...spec.pos)
      });
    }

    this.#scene.add(this.#gemGroup);
    this.#syncGemVisibility();
  }

  #syncGemVisibility() {
    const collected = new Set(this.#state.collectedGems);
    for (const node of this.#gemNodes) {
      const visible = !collected.has(node.spec.id);
      node.mesh.visible = visible;
      node.halo.visible = visible;
    }
  }

  recordWardrobeUpdate(appearance) {
    let changed = false;
    if (!this.#state.galaChangedOutfit) {
      this.#state.galaChangedOutfit = true;
      changed = true;
    }
    if (appearance?.accessories?.length > 0 && !this.#state.galaEquippedAccessory) {
      this.#state.galaEquippedAccessory = true;
      changed = true;
    }
    if (changed) {
      this.#notify('¡Estilo real actualizado para la Gala!');
    }
  }

  recordNpcTalk(npcId) {
    let changed = false;
    let message = null;

    if (npcId === 'sofia' && !this.#state.galaTalkedSofia) {
      this.#state.galaTalkedSofia = true;
      changed = true;
      message = 'Estilista Sofía ha aprobado tu presencia para la Gala.';
    }
    if (this.#requiredInvites.includes(npcId) && !this.#state.invitedNpcs.includes(npcId)) {
      this.#state.invitedNpcs.push(npcId);
      changed = true;
      message = `Invitación Real entregada (${this.#state.invitedNpcs.length}/3).`;
    }

    if (changed) {
      this.#notify(message);
    }
  }

  #notify(toastMessage) {
    this.#syncGemVisibility();
    const list = this.getQuestSummary();
    if (toastMessage) {
      const justDone = list.every((q) => q.completed);
      if (justDone) {
        this.#audio?.playQuestComplete();
      }
    }
    this.#onChange?.(this.getSnapshot(), toastMessage);
  }

  getSnapshot() {
    return {
      galaChangedOutfit: this.#state.galaChangedOutfit,
      galaEquippedAccessory: this.#state.galaEquippedAccessory,
      galaTalkedSofia: this.#state.galaTalkedSofia,
      collectedGems: [...this.#state.collectedGems],
      invitedNpcs: [...this.#state.invitedNpcs]
    };
  }

  applySnapshot(remote) {
    if (!remote) return;
    const prevGems = this.#state.collectedGems.length;
    this.#state.galaChangedOutfit = Boolean(this.#state.galaChangedOutfit || remote.galaChangedOutfit);
    this.#state.galaEquippedAccessory = Boolean(this.#state.galaEquippedAccessory || remote.galaEquippedAccessory);
    this.#state.galaTalkedSofia = Boolean(this.#state.galaTalkedSofia || remote.galaTalkedSofia);

    const gemSet = new Set([...this.#state.collectedGems, ...(remote.collectedGems || [])]);
    this.#state.collectedGems = [...gemSet];

    const invSet = new Set([...this.#state.invitedNpcs, ...(remote.invitedNpcs || [])]);
    this.#state.invitedNpcs = [...invSet];

    this.#syncGemVisibility();
    if (this.#state.collectedGems.length > prevGems) {
      this.#audio?.playGemCollect();
    }
  }

  getQuestSummary() {
    const galaSteps = (this.#state.galaChangedOutfit ? 1 : 0)
      + (this.#state.galaEquippedAccessory ? 1 : 0)
      + (this.#state.galaTalkedSofia ? 1 : 0);

    const gemsCount = this.#state.collectedGems.length;
    const invCount = this.#state.invitedNpcs.length;

    return [
      {
        id: 'gala_ready',
        title: 'Lista para la Gala',
        detail: galaSteps >= 3
          ? '¡Completada! Estilo imperial aprobado.'
          : `Vestidor [C] + Accesorio + Hablar con Sofía (${galaSteps}/3)`,
        completed: galaSteps >= 3
      },
      {
        id: 'royal_gems',
        title: 'Las Gemas del Reino',
        detail: gemsCount >= 5
          ? '¡Las 5 gemas brillan en el Palacio!'
          : `Encuentra las gemas ocultas (${gemsCount}/5)`,
        completed: gemsCount >= 5
      },
      {
        id: 'royal_invites',
        title: 'Invitaciones Reales',
        detail: invCount >= 3
          ? '¡Todos los anfitriones han sido invitados!'
          : `Habla con Adrián, Sofía y Maestra (${invCount}/3)`,
        completed: invCount >= 3
      }
    ];
  }

  getUncollectedGemPositions() {
    const collected = new Set(this.#state.collectedGems);
    return this.#gemNodes
      .filter((n) => !collected.has(n.spec.id))
      .map((n) => n.pos);
  }

  update(dt, playerPos) {
    this.#elapsed += dt;
    const collected = new Set(this.#state.collectedGems);

    for (const node of this.#gemNodes) {
      if (collected.has(node.spec.id)) continue;
      node.mesh.rotation.y += dt * 1.9;
      node.mesh.position.y = node.baseY + Math.sin(this.#elapsed * 2.8 + node.baseY) * 0.16;
      node.halo.rotation.z -= dt * 1.4;

      if (playerPos && playerPos.distanceTo(node.pos) < 1.85) {
        this.#state.collectedGems.push(node.spec.id);
        this.#audio?.playGemCollect();
        const count = this.#state.collectedGems.length;
        const msg = count >= 5
          ? '💎 ¡Misión completada! Reuniste las 5 Gemas del Reino.'
          : `💎 ¡Encontraste ${node.spec.name}! (${count}/5)`;
        this.#notify(msg);
      }
    }
  }

  dispose() {
    if (this.#gemGroup) {
      this.#scene.remove(this.#gemGroup);
    }
    const disposedGeo = new Set();
    for (const n of this.#gemNodes) {
      if (!disposedGeo.has(n.mesh.geometry)) {
        n.mesh.geometry.dispose();
        disposedGeo.add(n.mesh.geometry);
      }
      if (!disposedGeo.has(n.halo.geometry)) {
        n.halo.geometry.dispose();
        disposedGeo.add(n.halo.geometry);
      }
      n.mesh.material.dispose();
      n.halo.material.dispose();
    }
    this.#gemNodes.length = 0;
  }
}
