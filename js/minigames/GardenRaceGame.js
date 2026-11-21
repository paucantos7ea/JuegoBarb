import * as THREE from 'three';

export class GardenRaceGame {
  #scene;
  #player;
  #audio;
  #overlayEl;
  #onExit;

  #group = null;
  #ringMeshes = [];
  #beacon = null;
  #currentIdx = 0;
  #countdown = 3.0;
  #lastCountInt = 4;
  #raceTime = 0;
  #started = false;
  #finished = false;

  #ringCoords = [
    [12, 1.5, 2],
    [25, 1.5, -4],
    [28, 1.5, 14],
    [9, 1.5, 27],
    [0, 2.7, 42],
    [-14, 1.5, 25],
    [-26, 1.85, 6],
    [-10, 1.5, -10]
  ];

  constructor(ctx) {
    this.#scene = ctx.scene;
    this.#player = ctx.player;
    this.#audio = ctx.audio;
    this.#overlayEl = ctx.overlayEl;
    this.#onExit = ctx.onExit;
  }

  init() {
    this.#player.teleport(10, 0, 12, Math.PI);
    this.#buildRings();
    this.#renderUI();
  }

  #buildRings() {
    this.#group = new THREE.Group();
    const torusGeo = new THREE.TorusGeometry(1.75, 0.16, 12, 32);

    this.#ringCoords.forEach((coord, i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffd56b,
        emissive: 0xffa834,
        emissiveIntensity: i === 0 ? 1.2 : 0.25,
        metalness: 0.85,
        roughness: 0.18,
        transparent: true,
        opacity: i === 0 ? 1.0 : 0.32
      });
      const mesh = new THREE.Mesh(torusGeo, mat);
      mesh.position.set(...coord);
      this.#group.add(mesh);
      this.#ringMeshes.push({ mesh, pos: new THREE.Vector3(...coord) });
    });

    // Haz luminoso sobre el aro activo
    const beamGeo = new THREE.CylinderGeometry(0.18, 0.45, 14, 12, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffe48f,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.#beacon = new THREE.Mesh(beamGeo, beamMat);
    this.#updateActiveHighlight();
    this.#group.add(this.#beacon);
    this.#scene.add(this.#group);
  }

  #updateActiveHighlight() {
    this.#ringMeshes.forEach((item, idx) => {
      const passed = idx < this.#currentIdx;
      const active = idx === this.#currentIdx;
      item.mesh.visible = !passed;
      item.mesh.material.opacity = active ? 1.0 : 0.28;
      item.mesh.material.emissiveIntensity = active ? 1.25 : 0.2;
    });
    if (this.#currentIdx < this.#ringMeshes.length) {
      const target = this.#ringMeshes[this.#currentIdx].pos;
      this.#beacon.visible = true;
      this.#beacon.position.set(target.x, target.y + 7, target.z);
    } else {
      this.#beacon.visible = false;
    }
  }

  #renderUI() {
    this.#overlayEl.innerHTML = `
      <div class="mg-top-bar glass-chip">
        <span class="mg-title">♛ Carrera por los Jardines</span>
        <span class="mg-stat" id="race-rings">Aros: 0/8</span>
        <span class="mg-stat" id="race-timer">00.0 s</span>
        <button id="race-exit" class="btn-secondary btn-sm" type="button">Salir</button>
      </div>
      <div id="race-banner" class="mg-center-card glass-panel">
        <h3 id="race-banner-title">¡Prepárate! 3...</h3>
        <p style="font-size:0.84rem;color:#6c4a60;margin-top:4px;">Usa <strong>Shift</strong> para correr y atraviesa los 8 aros dorados siguiendo el haz de luz.</p>
      </div>
    `;

    this.#overlayEl.querySelector('#race-exit').addEventListener('click', () => {
      this.#onExit?.({ minigame: 'race', completed: false });
    });
  }

  #finishRace() {
    this.#finished = true;
    this.#audio?.playQuestComplete();
    const medal = this.#raceTime <= 34 ? '🥇 Medalla de Oro Real'
      : this.#raceTime <= 48 ? '🥈 Medalla de Plata Perla'
        : '🥉 Medalla de Bronce Rosa';

    const banner = this.#overlayEl.querySelector('#race-banner');
    if (banner) {
      banner.classList.remove('hidden');
      banner.innerHTML = `
        <h3>♛ ¡Meta Alcanzada!</h3>
        <p style="margin:8px 0;font-size:1.15rem;color:#c74182;font-weight:800;">${this.#raceTime.toFixed(1)} segundos · ${medal}</p>
        <button id="race-done" class="btn-primary" type="button">Volver a los Jardines</button>
      `;
      banner.querySelector('#race-done').addEventListener('click', () => {
        this.#onExit?.({ minigame: 'race', time: this.#raceTime, completed: true });
      });
    }
  }

  update(dt) {
    for (const item of this.#ringMeshes) {
      if (item.mesh.visible) {
        item.mesh.rotation.y += dt * 1.6;
      }
    }

    if (this.#finished) return;

    if (!this.#started) {
      this.#countdown -= dt;
      const num = Math.ceil(this.#countdown);
      if (num < this.#lastCountInt && num > 0) {
        this.#lastCountInt = num;
        this.#audio?.playCountdown(false);
        const title = this.#overlayEl.querySelector('#race-banner-title');
        if (title) title.textContent = `¡Prepárate! ${num}...`;
      }
      if (this.#countdown <= 0) {
        this.#started = true;
        this.#audio?.playCountdown(true);
        const banner = this.#overlayEl.querySelector('#race-banner');
        if (banner) banner.classList.add('hidden');
      }
      return;
    }

    this.#raceTime += dt;
    const timerEl = this.#overlayEl.querySelector('#race-timer');
    if (timerEl) timerEl.textContent = `${this.#raceTime.toFixed(1)} s`;

    const target = this.#ringMeshes[this.#currentIdx];
    const pPos = this.#player.getPosition();
    const dist = Math.hypot(pPos.x - target.pos.x, (pPos.y + 0.9) - target.pos.y, pPos.z - target.pos.z);

    if (dist < 2.45) {
      this.#currentIdx++;
      this.#audio?.playGemCollect();
      const ringsEl = this.#overlayEl.querySelector('#race-rings');
      if (ringsEl) ringsEl.textContent = `Aros: ${this.#currentIdx}/8`;
      this.#updateActiveHighlight();
      if (this.#currentIdx >= this.#ringMeshes.length) {
        this.#finishRace();
      }
    }
  }

  dispose() {
    if (this.#group) {
      const disposedGeo = new Set();
      this.#group.traverse((obj) => {
        if (obj.geometry && !disposedGeo.has(obj.geometry)) {
          obj.geometry.dispose();
          disposedGeo.add(obj.geometry);
        }
        obj.material?.dispose();
      });
      this.#scene.remove(this.#group);
      this.#group = null;
    }
    this.#ringMeshes.length = 0;
  }
}
