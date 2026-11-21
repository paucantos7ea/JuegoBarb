import * as THREE from 'three';

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
  #phase = 'walk'; // 'walk' | 'pose' | 'finish'
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

    // Explosión de chispas doradas
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
    // Actualizar chispas
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

    // Cámara cinematográfica de pasarela
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
