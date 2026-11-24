import { CharacterRig } from '../entities/CharacterRig.js';

const TABS = Object.freeze([
  { id: 'outfits', label: '👗 Vestidos' },
  { id: 'hairs', label: '💇‍♀️ Peinados' },
  { id: 'colors', label: '🎨 Colores / Piel' },
  { id: 'accessories', label: '👑 Accesorios' }
]);

/**
 * Vestidor Real visual por pestañas (Vestidos, Peinados, Colores/Piel y Accesorios).
 * Aplica cambios instantáneos en 3D y los emite para sincronización P2P en tiempo real.
 */
export class WardrobeUI {
  #overlayEl;
  #audio;
  #onChange;
  #onClose;
  #isOpen = false;
  #activeTab = 'outfits';
  #cleanups = [];
  #current = {
    outfitId: 'gala_rosa',
    hairId: 'melena_ondulada',
    hairColorId: 'rubio_miel',
    skinId: 'porcelana',
    eyeColorId: 'zafiro',
    accessories: ['tiara']
  };

  constructor({ audio, onChange, onClose }) {
    this.#overlayEl = document.getElementById('wardrobe-overlay');
    this.#audio = audio;
    this.#onChange = onChange;
    this.#onClose = onClose;
  }

  init() {
    this.#renderTabs();
    this.#renderPanels();
    this.#switchTab('outfits', false);

    const closeBtn = document.getElementById('btn-close-wardrobe');
    const doneBtn = document.getElementById('btn-wardrobe-done');
    const closeFn = () => this.close();
    closeBtn?.addEventListener('click', closeFn);
    doneBtn?.addEventListener('click', closeFn);
    this.#cleanups.push(
      () => closeBtn?.removeEventListener('click', closeFn),
      () => doneBtn?.removeEventListener('click', closeFn)
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
        this.#audio?.playSparkle();
        this.#refreshSelection();
        this.#emitChange();
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
        this.#audio?.playClick();
        this.#refreshSelection();
        this.#emitChange();
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
        this.#audio?.playClick();
        this.#refreshSelection();
        this.#emitChange();
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
        this.#audio?.playSparkle();
        this.#refreshSelection();
        this.#emitChange();
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

  #emitChange() {
    this.#onChange?.({
      outfitId: this.#current.outfitId,
      hairId: this.#current.hairId,
      hairColorId: this.#current.hairColorId,
      skinId: this.#current.skinId,
      eyeColorId: this.#current.eyeColorId,
      accessories: [...this.#current.accessories]
    });
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
    this.#overlayEl.classList.remove('hidden');
  }

  close() {
    if (!this.#isOpen) return;
    this.#isOpen = false;
    this.#overlayEl.classList.add('hidden');
    this.#onClose?.();
  }

  toggle(currentAppearance) {
    if (this.#isOpen) this.close();
    else this.open(currentAppearance);
  }

  isOpen() { return this.#isOpen; }
  update() {}

  dispose() {
    for (const fn of this.#cleanups) fn();
    this.#cleanups.length = 0;
    this.#overlayEl?.classList.add('hidden');
    this.#isOpen = false;
  }
}
