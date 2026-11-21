import * as THREE from 'three';

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
  #laneLabels = ['W', 'A', 'S', 'D'];

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

    // Cámara orbital festiva en el Salón de Baile
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
