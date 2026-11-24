import * as THREE from 'three';

/**
 * Minijuego 1: Pasarela de Moda Real (poses cronometradas y cámara cinematográfica).
 */
export class FashionRunwayGame {
  #scene;
  #camera;
  #player;
  #input;
  #audio;
  #overlayEl;
  #onExit;

  #group = null;
  #sparkles = null;
  #sparkleVel = null;
  #phase = 'walk';
  #currentZ = -6.5;
  #poseIndex = 0;
  #poseTimer = 0;
  #targetKey = 1;
  #score = 0;
  #hits = 0;
  #keyHandler = null;

  #stops = [
    { z: -0.5, label: 'Pose Estrella' },
    { z: 5.5, label: 'Giro Real' },
    { z: 11.5, label: 'Saludo Imperial' },
    { z: 17.5, label: 'Reverencia Final' }
  ];

  #poseNames = ['1 · Giro', '2 · Estrella', '3 · Saludo', '4 · Corona'];

  constructor(ctx) {
    this.#scene = ctx.scene;
    this.#camera = ctx.camera;
    this.#player = ctx.player;
    this.#input = ctx.input;
    this.#audio = ctx.audio;
    this.#overlayEl = ctx.overlayEl;
    this.#onExit = ctx.onExit;
  }

  init() {
    this.#input.setControlsLocked(true);
    this.#player.setExternalControl(true);
    this.#player.teleport(-26, 0.35, -6.5, 0);
    this.#player.setAnimState('walk');

    this.#buildVisuals();
    this.#renderUI();

    this.#keyHandler = (e) => {
      if (this.#phase !== 'pose') return;
      if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
        this.#submitPose(Number(e.code.replace('Digit', '')));
      }
    };
    window.addEventListener('keydown', this.#keyHandler);
    this.#audio?.playSparkle();
  }

  #buildVisuals() {
    this.#group = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(0.9, 1.25, 28);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd584,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78
    });

    for (const stop of this.#stops) {
      const m = new THREE.Mesh(ringGeo, ringMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(-26, 0.42, stop.z);
      this.#group.add(m);
    }

    const count = 70;
    const pos = new Float32Array(count * 3);
    this.#sparkleVel = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffe49e,
      size: 0.28,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.#sparkles = new THREE.Points(geo, mat);
    this.#group.add(this.#sparkles);
    this.#scene.add(this.#group);
  }

  #triggerBurst(z) {
    const pos = this.#sparkles.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, -26, 1.4, z);
      const a = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 3.5;
      this.#sparkleVel[i * 3] = Math.cos(a) * spd;
      this.#sparkleVel[i * 3 + 1] = 1.5 + Math.random() * 3.2;
      this.#sparkleVel[i * 3 + 2] = Math.sin(a) * spd;
    }
    pos.needsUpdate = true;
    this.#sparkles.material.opacity = 1;
  }

  #renderUI() {
    this.#overlayEl.innerHTML = `
      <div class="mg-top-bar glass-chip">
        <span class="mg-title">✦ Pasarela de Moda Real</span>
        <span class="mg-stat" id="mg-fashion-score">Estilo: 0</span>
        <span class="mg-stat" id="mg-fashion-step">Parada 1/4</span>
        <button id="mg-fashion-exit" class="btn-secondary btn-sm" type="button">Salir</button>
      </div>
      <div id="mg-fashion-card" class="mg-center-card glass-panel">
        <h3 id="mg-fashion-prompt">¡Desfila con elegancia hacia el primer foco!</h3>
        <div id="mg-fashion-keys" class="mg-pose-bar"></div>
      </div>
    `;

    const keysEl = this.#overlayEl.querySelector('#mg-fashion-keys');
    this.#poseNames.forEach((name, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mg-key-pill';
      btn.dataset.pose = String(idx + 1);
      btn.textContent = name;
      btn.addEventListener('click', () => this.#submitPose(idx + 1));
      keysEl.appendChild(btn);
    });

    this.#overlayEl.querySelector('#mg-fashion-exit').addEventListener('click', () => {
      this.#onExit?.({ minigame: 'fashion', score: this.#score });
    });
  }

  #startPosePrompt() {
    this.#phase = 'pose';
    this.#poseTimer = 2.6;
    this.#targetKey = 1 + Math.floor(Math.random() * 4);
    this.#player.setAnimState('idle');

    const stop = this.#stops[this.#poseIndex];
    const promptEl = this.#overlayEl.querySelector('#mg-fashion-prompt');
    const stepEl = this.#overlayEl.querySelector('#mg-fashion-step');
    if (promptEl) promptEl.textContent = `${stop.label} — ¡Pulsa la tecla ${this.#targetKey}!`;
    if (stepEl) stepEl.textContent = `Parada ${this.#poseIndex + 1}/4`;

    this.#overlayEl.querySelectorAll('.mg-key-pill').forEach((el) => {
      el.classList.toggle('target', Number(el.dataset.pose) === this.#targetKey);
    });
  }

  #submitPose(num) {
    if (this.#phase !== 'pose') return;
    const promptEl = this.#overlayEl.querySelector('#mg-fashion-prompt');

    if (num === this.#targetKey) {
      const bonus = Math.round(180 + this.#poseTimer * 80);
      this.#score += bonus;
      this.#hits++;
      this.#player.setAnimState('pose');
      this.#triggerBurst(this.#currentZ);
      this.#audio?.playSparkle();
      if (promptEl) promptEl.textContent = `✨ ¡Pose Deslumbrante! +${bonus} pts`;
    } else {
      this.#score += 40;
      this.#audio?.playMiss();
      if (promptEl) promptEl.textContent = '¡Buen intento! Sigue brillando (+40 pts)';
    }

    const scoreEl = this.#overlayEl.querySelector('#mg-fashion-score');
    if (scoreEl) scoreEl.textContent = `Estilo: ${this.#score}`;

    this.#overlayEl.querySelectorAll('.mg-key-pill').forEach((el) => el.classList.remove('target'));
    this.#poseIndex++;
    if (this.#poseIndex >= this.#stops.length) {
      this.#finishShow();
    } else {
      this.#phase = 'walk';
      this.#player.setAnimState('walk');
    }
  }

  #finishShow() {
    this.#phase = 'finish';
    this.#player.setAnimState('pose');
    this.#audio?.playQuestComplete();
    const stars = '★'.repeat(Math.max(1, Math.min(5, this.#hits + 1)));
    const card = this.#overlayEl.querySelector('#mg-fashion-card');
    if (card) {
      card.innerHTML = `
        <h3>♛ ¡Desfile Completado!</h3>
        <p style="margin:8px 0;font-size:1.15rem;color:#c74182;font-weight:800;">${stars} · ${this.#score} puntos de estilo</p>
        <p style="font-size:0.85rem;color:#6c4a60;margin-bottom:12px;">Poses perfectas: ${this.#hits}/4</p>
        <button id="mg-fashion-done" class="btn-primary" type="button">Volver al Reino</button>
      `;
      card.querySelector('#mg-fashion-done').addEventListener('click', () => {
        this.#onExit?.({ minigame: 'fashion', score: this.#score, completed: true });
      });
    }
  }

  update(dt) {
    if (this.#sparkles && this.#sparkles.material.opacity > 0) {
      const pos = this.#sparkles.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        this.#sparkleVel[i * 3 + 1] -= 5.2 * dt;
        pos.setXYZ(
          i,
          pos.getX(i) + this.#sparkleVel[i * 3] * dt,
          pos.getY(i) + this.#sparkleVel[i * 3 + 1] * dt,
          pos.getZ(i) + this.#sparkleVel[i * 3 + 2] * dt
        );
      }
      pos.needsUpdate = true;
      this.#sparkles.material.opacity = Math.max(0, this.#sparkles.material.opacity - dt * 0.85);
    }

    if (this.#phase === 'walk') {
      const targetStop = this.#stops[this.#poseIndex];
      this.#currentZ += dt * 4.4;
      if (this.#currentZ >= targetStop.z) {
        this.#currentZ = targetStop.z;
        this.#startPosePrompt();
      }
      this.#player.getPosition().set(-26, 0.35, this.#currentZ);
    } else if (this.#phase === 'pose') {
      this.#poseTimer -= dt;
      if (this.#poseTimer <= 0) {
        this.#submitPose(-1);
      }
    }

    const px = -26;
    const pz = this.#currentZ;
    const desiredCam = new THREE.Vector3(px + Math.sin(pz * 0.14) * 3.8, 2.25, pz + 4.8);
    this.#camera.position.lerp(desiredCam, Math.min(1, dt * 5));
    this.#camera.lookAt(px, 1.45, pz);
  }

  dispose() {
    if (this.#keyHandler) {
      window.removeEventListener('keydown', this.#keyHandler);
      this.#keyHandler = null;
    }
    if (this.#group) {
      this.#group.traverse((obj) => {
        obj.geometry?.dispose();
        obj.material?.dispose();
      });
      this.#scene.remove(this.#group);
      this.#group = null;
    }
    this.#player.setExternalControl(false);
    this.#player.setAnimState('idle');
    this.#input.setControlsLocked(false);
  }
}

/**
 * Minijuego 2: Baile en el Salón Real (juego de ritmo con W, A, S, D).
 */
export class RoyalBallRhythmGame {
  #camera;
  #player;
  #input;
  #audio;
  #castle;
  #overlayEl;
  #onExit;

  #notes = [];
  #songTime = 0;
  #score = 0;
  #combo = 0;
  #hits = 0;
  #totalNotes = 24;
  #finished = false;
  #keyHandler = null;
  #lanes = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];

  constructor(ctx) {
    this.#camera = ctx.camera;
    this.#player = ctx.player;
    this.#input = ctx.input;
    this.#audio = ctx.audio;
    this.#castle = ctx.castle;
    this.#overlayEl = ctx.overlayEl;
    this.#onExit = ctx.onExit;
  }

  init() {
    this.#input.setControlsLocked(true);
    this.#player.setExternalControl(true);
    this.#player.teleport(18, 1.03, -35, 0);
    this.#player.setAnimState('dance');

    this.#buildChart();
    this.#renderUI();

    this.#keyHandler = (e) => {
      if (this.#finished) return;
      const lane = this.#lanes.indexOf(e.code);
      if (lane !== -1) {
        this.#tryHit(lane);
      }
    };
    window.addEventListener('keydown', this.#keyHandler);
    this.#audio?.playCountdown(true);
  }

  #buildChart() {
    this.#notes = [];
    for (let i = 0; i < this.#totalNotes; i++) {
      this.#notes.push({
        id: i,
        lane: (i * 3 + (i % 2)) % 4,
        time: 1.5 + i * 0.72,
        judged: false,
        el: null
      });
    }
  }

  #renderUI() {
    this.#overlayEl.innerHTML = `
      <div class="mg-top-bar glass-chip">
        <span class="mg-title">♪ Baile en el Salón Real</span>
        <span class="mg-stat" id="ball-score">Puntos: 0</span>
        <span class="mg-stat" id="ball-combo">Combo: x0</span>
        <button id="ball-exit" class="btn-secondary btn-sm" type="button">Salir</button>
      </div>
      <div class="rhythm-stage" id="rhythm-stage">
        <div class="rhythm-feedback" id="ball-feedback">¡Sigue el ritmo con W A S D!</div>
        <div class="rhythm-lanes" id="rhythm-lanes">
          <div class="rhythm-lane" data-lane="0"></div>
          <div class="rhythm-lane" data-lane="1"></div>
          <div class="rhythm-lane" data-lane="2"></div>
          <div class="rhythm-lane" data-lane="3"></div>
        </div>
        <div class="rhythm-hit-line">
          <button type="button" class="btn-link" style="color:#fff;text-decoration:none" data-hit="0">W</button>
          <button type="button" class="btn-link" style="color:#fff;text-decoration:none" data-hit="1">A</button>
          <button type="button" class="btn-link" style="color:#fff;text-decoration:none" data-hit="2">S</button>
          <button type="button" class="btn-link" style="color:#fff;text-decoration:none" data-hit="3">D</button>
        </div>
      </div>
    `;

    const laneEls = this.#overlayEl.querySelectorAll('.rhythm-lane');
    for (const note of this.#notes) {
      const div = document.createElement('div');
      div.className = 'rhythm-note';
      div.style.top = '-40px';
      laneEls[note.lane].appendChild(div);
      note.el = div;
    }

    this.#overlayEl.querySelectorAll('[data-hit]').forEach((btn) => {
      btn.addEventListener('click', () => this.#tryHit(Number(btn.dataset.hit)));
    });

    this.#overlayEl.querySelector('#ball-exit').addEventListener('click', () => {
      this.#onExit?.({ minigame: 'ball', score: this.#score });
    });
  }

  #tryHit(lane) {
    let best = null;
    let bestDiff = 99;
    for (const note of this.#notes) {
      if (note.judged || note.lane !== lane) continue;
      const diff = Math.abs(note.time - this.#songTime);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = note;
      }
    }

    if (best && bestDiff <= 0.34) {
      best.judged = true;
      best.el.style.display = 'none';
      const perfect = bestDiff <= 0.16;
      this.#combo++;
      this.#hits++;
      const pts = (perfect ? 100 : 60) + this.#combo * 10;
      this.#score += pts;
      this.#audio?.playBeatNote(lane);
      this.#castle?.pulseBallroom(perfect ? 1.2 : 0.7);
      this.#player.setAnimState(perfect ? 'pose' : 'dance');
      this.#setFeedback(perfect ? `✨ ¡Perfecto! +${pts}` : `♪ ¡Bien! +${pts}`);
    } else {
      this.#combo = 0;
      this.#audio?.playMiss();
      this.#setFeedback('¡Un poco antes o después!');
    }
    this.#updateHud();
  }

  #setFeedback(text) {
    const fb = this.#overlayEl.querySelector('#ball-feedback');
    if (fb) fb.textContent = text;
  }

  #updateHud() {
    const sc = this.#overlayEl.querySelector('#ball-score');
    const cb = this.#overlayEl.querySelector('#ball-combo');
    if (sc) sc.textContent = `Puntos: ${this.#score}`;
    if (cb) cb.textContent = `Combo: x${this.#combo}`;
  }

  #finishBall() {
    this.#finished = true;
    this.#audio?.playQuestComplete();
    const stage = this.#overlayEl.querySelector('#rhythm-stage');
    if (stage) {
      stage.className = 'mg-center-card glass-panel';
      stage.innerHTML = `
        <h3>♛ ¡Gran Vals Completado!</h3>
        <p style="margin:8px 0;font-size:1.1rem;color:#c74182;font-weight:800;">Puntuación Imperial: ${this.#score}</p>
        <p style="font-size:0.86rem;color:#6c4a60;margin-bottom:12px;">Notas acertadas: ${this.#hits}/${this.#totalNotes}</p>
        <button id="ball-done" class="btn-primary" type="button">Volver al Salón</button>
      `;
      stage.querySelector('#ball-done').addEventListener('click', () => {
        this.#onExit?.({ minigame: 'ball', score: this.#score, completed: true });
      });
    }
  }

  update(dt) {
    if (!this.#finished) {
      this.#songTime += dt;
      const hitY = 246;
      const speedPx = 155;
      let remaining = 0;

      for (const note of this.#notes) {
        if (note.judged) continue;
        const delta = note.time - this.#songTime;
        if (delta < -0.34) {
          note.judged = true;
          note.el.style.display = 'none';
          this.#combo = 0;
          this.#updateHud();
          continue;
        }
        remaining++;
        const y = hitY - delta * speedPx;
        note.el.style.top = `${y}px`;
      }

      if (remaining === 0) {
        this.#finishBall();
      }
    }

    const angle = this.#songTime * 0.55;
    const camPos = new THREE.Vector3(18 + Math.sin(angle) * 5.2, 3.2, -35 + Math.cos(angle) * 5.2);
    this.#camera.position.lerp(camPos, Math.min(1, dt * 6));
    this.#camera.lookAt(18, 2.0, -35);
    this.#player.getRig().getRoot().rotation.y = Math.sin(this.#songTime * 2.2) * 0.6;
  }

  dispose() {
    if (this.#keyHandler) {
      window.removeEventListener('keydown', this.#keyHandler);
      this.#keyHandler = null;
    }
    this.#player.setExternalControl(false);
    this.#player.setAnimState('idle');
    this.#input.setControlsLocked(false);
  }
}

/**
 * Minijuego 3: Carrera Contrarreloj por los Jardines (8 aros dorados con haz guía).
 */
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

const MINIGAME_CLASSES = {
  fashion: FashionRunwayGame,
  ball: RoyalBallRhythmGame,
  race: GardenRaceGame
};

/**
 * Gestor unificado de minijuegos del Reino Rosa Imperial.
 */
export class MinigameManager {
  #context;
  #overlayEl;
  #activeGame = null;
  #activeId = null;
  #onFinishCallback = null;
  #disposed = false;

  constructor(context, overlayEl) {
    this.#context = context;
    this.#overlayEl = overlayEl;
  }

  init() {}

  async start(id, onFinish = null) {
    if (this.#disposed) return;
    if (this.#activeGame) {
      this.stop();
    }

    const GameClass = MINIGAME_CLASSES[id];
    if (!GameClass) {
      console.error('[MinigameManager] Minijuego desconocido:', id);
      onFinish?.(null);
      return;
    }

    this.#activeId = id;
    this.#onFinishCallback = onFinish;
    this.#overlayEl.innerHTML = '';
    this.#overlayEl.classList.remove('hidden');

    this.#activeGame = new GameClass({
      ...this.#context,
      overlayEl: this.#overlayEl,
      onExit: (summary) => this.stop(summary)
    });
    this.#activeGame.init();
  }

  isActive() {
    return this.#activeGame !== null;
  }

  getActiveId() {
    return this.#activeId;
  }

  update(dt) {
    this.#activeGame?.update(dt);
  }

  stop(summary = null) {
    if (this.#activeGame) {
      this.#activeGame.dispose();
      this.#activeGame = null;
    }
    this.#activeId = null;
    this.#overlayEl.innerHTML = '';
    this.#overlayEl.classList.add('hidden');
    if (this.#onFinishCallback) {
      const cb = this.#onFinishCallback;
      this.#onFinishCallback = null;
      cb(summary);
    }
  }

  dispose() {
    this.#disposed = true;
    this.#onFinishCallback = null;
    this.stop();
  }
}
