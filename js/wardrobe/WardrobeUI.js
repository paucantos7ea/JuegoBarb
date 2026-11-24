import { CharacterRig } from '../characters/CharacterRig.js';

const TABS = Object.freeze([
  { id: 'outfits', label: '👗 Vestidos' },
  { id: 'hairs', label: '💇‍♀️ Peinados' },
  { id: 'colors', label: '🎨 Colores' },
  { id: 'accessories', label: '👑 Accesorios' }
]);

/**
 * Vestidor Real interactivo en tiempo real:
 * - Panel lateral izquierdo (~36% del ancho máximo) dejando el resto totalmente libre y transparente.
 * - Zona de arrastre sobre el personaje 3D + botones discretos ⟲ / ⟳ para girarlo 360°.
 * - Emite cada cambio con categoría para lanzar el humo mágico y la pose de alegría sincronizada.
 */
export class WardrobeUI {
  #overlayEl;
  #stageEl;
  #audio;
  #onChange;
  #onRotate;
  #onResetRotate;
  #onClose;

  #isOpen = false;
  #activeTab = 'outfits';
  #cleanups = [];
  #dragging = false;
  #lastPointerX = 0;
  #holdSpinDir = 0; // -1 izq, 0 quieto, +1 der
  #current = {
    outfitId: 'gala_rosa',
    hairId: 'melena_ondulada',
    hairColorId: 'rubio_miel',
    skinId: 'porcelana',
    eyeColorId: 'zafiro',
    accessories: ['tiara']
  };

  constructor({ audio, onChange, onRotate, onResetRotate, onClose }) {
    this.#overlayEl = document.getElementById('wardrobe-overlay');
    this.#stageEl = document.getElementById('wardrobe-stage-area');
    this.#audio = audio;
    this.#onChange = onChange;
    this.#onRotate = onRotate;
    this.#onResetRotate = onResetRotate;
    this.#onClose = onClose;
  }

  init() {
    this.#renderTabs();
    this.#renderPanels();
    this.#switchTab('outfits', false);
    this.#bindControls();
  }

  #bindControls() {
    const closeBtn = document.getElementById('btn-close-wardrobe');
    const doneBtn = document.getElementById('btn-wardrobe-done');
    const closeFn = () => {
      this.#audio?.playClick();
      this.close();
    };
    closeBtn?.addEventListener('click', closeFn);
    doneBtn?.addEventListener('click', closeFn);
    this.#cleanups.push(
      () => closeBtn?.removeEventListener('click', closeFn),
      () => doneBtn?.removeEventListener('click', closeFn)
    );

    // Arrastre con ratón/táctil sobre el lado libre del personaje para girar 360°
    if (this.#stageEl) {
      const onPointerDown = (e) => {
        if (!this.#isOpen || e.target.closest('button')) return;
        this.#dragging = true;
        this.#lastPointerX = e.clientX;
        this.#stageEl.classList.add('is-dragging');
        this.#stageEl.setPointerCapture?.(e.pointerId);
      };
      const onPointerMove = (e) => {
        if (!this.#dragging || !this.#isOpen) return;
        const dx = e.clientX - this.#lastPointerX;
        this.#lastPointerX = e.clientX;
        if (Math.abs(dx) > 0) {
          this.#onRotate?.(dx * 0.0115);
        }
      };
      const onPointerUp = (e) => {
        if (!this.#dragging) return;
        this.#dragging = false;
        this.#stageEl.classList.remove('is-dragging');
        this.#stageEl.releasePointerCapture?.(e.pointerId);
      };
      const onDblClick = (e) => {
        if (!this.#isOpen || e.target.closest('button')) return;
        this.#onResetRotate?.();
      };

      this.#stageEl.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      this.#stageEl.addEventListener('dblclick', onDblClick);
      this.#cleanups.push(
        () => this.#stageEl.removeEventListener('pointerdown', onPointerDown),
        () => window.removeEventListener('pointermove', onPointerMove),
        () => window.removeEventListener('pointerup', onPointerUp),
        () => window.removeEventListener('pointercancel', onPointerUp),
        () => this.#stageEl.removeEventListener('dblclick', onDblClick)
      );
    }

    // Botones discretos ⟲ / ⟳ (clic para giro rápido o mantener pulsado para giro continuo)
    this.#bindTurnButton('btn-wardrobe-turn-left', -1);
    this.#bindTurnButton('btn-wardrobe-turn-right', 1);

    const stopHold = () => { this.#holdSpinDir = 0; };
    window.addEventListener('pointerup', stopHold);
    window.addEventListener('blur', stopHold);
    this.#cleanups.push(
      () => window.removeEventListener('pointerup', stopHold),
      () => window.removeEventListener('blur', stopHold)
    );
  }

  #bindTurnButton(id, dir) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const onDown = (e) => {
      e.stopPropagation();
      this.#holdSpinDir = dir;
      this.#onRotate?.(dir * 0.42);
      this.#audio?.playClick();
    };
    const onUp = () => {
      if (this.#holdSpinDir === dir) this.#holdSpinDir = 0;
    };
    btn.addEventListener('pointerdown', onDown);
    btn.addEventListener('pointerup', onUp);
    btn.addEventListener('pointerleave', onUp);
    this.#cleanups.push(
      () => btn.removeEventListener('pointerdown', onDown),
      () => btn.removeEventListener('pointerup', onUp),
      () => btn.removeEventListener('pointerleave', onUp)
    );
  }

  #renderTabs() {
    const tabsEl = document.getElementById('wardrobe-tabs');
    if (!tabsEl) return;
    tabsEl.innerHTML = '';

    for (const tab of TABS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wardrobe-tab';
      btn.dataset.tab = tab.id;
      btn.setAttribute('role', 'tab');
      btn.textContent = tab.label;
      const fn = () => this.#switchTab(tab.id, true);
      btn.addEventListener('click', fn);
      this.#cleanups.push(() => btn.removeEventListener('click', fn));
      tabsEl.appendChild(btn);
    }
  }

  #switchTab(tabId, playSound = true) {
    this.#activeTab = tabId;
    if (playSound) this.#audio?.playClick();

    this.#overlayEl?.querySelectorAll('.wardrobe-tab').forEach((btn) => {
      const active = btn.dataset.tab === tabId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    this.#overlayEl?.querySelectorAll('.wardrobe-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === tabId);
    });
  }

  #renderPanels() {
    this.#renderOutfits();
    this.#renderHairs();
    this.#renderColorSwatches();
    this.#renderAccessories();
    this.#refreshSelection();
  }

  #renderOutfits() {
    const el = document.getElementById('wardrobe-outfits');
    if (!el) return;
    el.innerHTML = '';
    for (const o of CharacterRig.OUTFITS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wardrobe-item';
      btn.dataset.outfit = o.id;
      btn.innerHTML = `
        <div class="wardrobe-card-head">
          <span class="wardrobe-swatch" style="background:${o.swatch}"></span>
          <span class="wardrobe-icon">${o.icon}</span>
        </div>
        <strong>${o.name}</strong>
        <span>${o.desc}</span>
      `;
      const fn = () => {
        this.#current.outfitId = o.id;
        this.#refreshSelection();
        this.#emitChange('outfit');
      };
      btn.addEventListener('click', fn);
      this.#cleanups.push(() => btn.removeEventListener('click', fn));
      el.appendChild(btn);
    }
  }

  #renderHairs() {
    const el = document.getElementById('wardrobe-hairs');
    if (!el) return;
    el.innerHTML = '';
    for (const h of CharacterRig.HAIRSTYLES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wardrobe-item';
      btn.dataset.hair = h.id;
      btn.innerHTML = `
        <div class="wardrobe-card-head"><span class="wardrobe-icon">${h.icon}</span></div>
        <strong>${h.name}</strong>
        <span>${h.desc}</span>
      `;
      const fn = () => {
        this.#current.hairId = h.id;
        this.#refreshSelection();
        this.#emitChange('hair');
      };
      btn.addEventListener('click', fn);
      this.#cleanups.push(() => btn.removeEventListener('click', fn));
      el.appendChild(btn);
    }
  }

  #renderColorSwatches() {
    this.#renderSwatchGrid('wardrobe-hair-colors', CharacterRig.HAIR_COLORS, 'hairColor', (item) => {
      this.#current.hairColorId = item.id;
    });
    this.#renderSwatchGrid('wardrobe-skin-tones', CharacterRig.SKIN_TONES, 'skinTone', (item) => {
      this.#current.skinId = item.id;
    });
    this.#renderSwatchGrid('wardrobe-eye-colors', CharacterRig.EYE_COLORS, 'eyeColor', (item) => {
      this.#current.eyeColorId = item.id;
    });
  }

  #renderSwatchGrid(containerId, items, dataAttr, onPick) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wardrobe-swatch-card';
      btn.dataset[dataAttr] = item.id;
      btn.innerHTML = `
        <span class="swatch-dot" style="background:${item.css}"></span>
        <span>${item.name}</span>
      `;
      const fn = () => {
        onPick(item);
        this.#refreshSelection();
        this.#emitChange('color');
      };
      btn.addEventListener('click', fn);
      this.#cleanups.push(() => btn.removeEventListener('click', fn));
      el.appendChild(btn);
    }
  }

  #renderAccessories() {
    const el = document.getElementById('wardrobe-accessories');
    if (!el) return;
    el.innerHTML = '';
    for (const a of CharacterRig.ACCESSORIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wardrobe-item';
      btn.dataset.acc = a.id;
      btn.innerHTML = `
        <div class="wardrobe-card-head"><span class="wardrobe-icon">${a.icon}</span></div>
        <strong>${a.name}</strong>
        <span>${a.desc}</span>
      `;
      const fn = () => {
        const set = new Set(this.#current.accessories);
        if (set.has(a.id)) set.delete(a.id);
        else set.add(a.id);
        this.#current.accessories = [...set];
        this.#refreshSelection();
        this.#emitChange('accessory');
      };
      btn.addEventListener('click', fn);
      this.#cleanups.push(() => btn.removeEventListener('click', fn));
      el.appendChild(btn);
    }
  }

  #refreshSelection() {
    const root = this.#overlayEl;
    if (!root) return;
    root.querySelectorAll('#wardrobe-outfits .wardrobe-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.outfit === this.#current.outfitId);
    });
    root.querySelectorAll('#wardrobe-hairs .wardrobe-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.hair === this.#current.hairId);
    });
    root.querySelectorAll('#wardrobe-hair-colors .wardrobe-swatch-card').forEach((el) => {
      el.classList.toggle('active', el.dataset.hairColor === this.#current.hairColorId);
    });
    root.querySelectorAll('#wardrobe-skin-tones .wardrobe-swatch-card').forEach((el) => {
      el.classList.toggle('active', el.dataset.skinTone === this.#current.skinId);
    });
    root.querySelectorAll('#wardrobe-eye-colors .wardrobe-swatch-card').forEach((el) => {
      el.classList.toggle('active', el.dataset.eyeColor === this.#current.eyeColorId);
    });
    const activeAcc = new Set(this.#current.accessories);
    root.querySelectorAll('#wardrobe-accessories .wardrobe-item').forEach((el) => {
      el.classList.toggle('active', activeAcc.has(el.dataset.acc));
    });
  }

  #emitChange(category) {
    this.#onChange?.({
      outfitId: this.#current.outfitId,
      hairId: this.#current.hairId,
      hairColorId: this.#current.hairColorId,
      skinId: this.#current.skinId,
      eyeColorId: this.#current.eyeColorId,
      accessories: [...this.#current.accessories]
    }, category);
  }

  open(currentAppearance) {
    if (currentAppearance) {
      this.#current = {
        outfitId: currentAppearance.outfitId || 'gala_rosa',
        hairId: currentAppearance.hairId || 'melena_ondulada',
        hairColorId: currentAppearance.hairColorId || 'rubio_miel',
        skinId: currentAppearance.skinId || 'porcelana',
        eyeColorId: currentAppearance.eyeColorId || 'zafiro',
        accessories: [...(currentAppearance.accessories || [])]
      };
      this.#refreshSelection();
    }
    this.#switchTab(this.#activeTab, false);
    this.#isOpen = true;
    this.#dragging = false;
    this.#holdSpinDir = 0;
    document.body.classList.add('wardrobe-open');
    this.#overlayEl?.classList.remove('hidden');
  }

  close() {
    if (!this.#isOpen) return;
    this.#isOpen = false;
    this.#dragging = false;
    this.#holdSpinDir = 0;
    this.#stageEl?.classList.remove('is-dragging');
    document.body.classList.remove('wardrobe-open');
    this.#overlayEl?.classList.add('hidden');
    this.#onClose?.();
  }

  toggle(currentAppearance) {
    if (this.#isOpen) this.close();
    else this.open(currentAppearance);
  }

  isOpen() {
    return this.#isOpen;
  }

  update(dt) {
    if (this.#isOpen && this.#holdSpinDir !== 0) {
      this.#onRotate?.(this.#holdSpinDir * dt * 2.2);
    }
  }

  dispose() {
    for (const fn of this.#cleanups) fn();
    this.#cleanups.length = 0;
    document.body.classList.remove('wardrobe-open');
    this.#overlayEl?.classList.add('hidden');
    this.#isOpen = false;
    this.#dragging = false;
    this.#holdSpinDir = 0;
  }
}
