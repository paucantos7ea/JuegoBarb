import { CharacterRig } from '../entities/CharacterRig.js';

export class WardrobeUI {
  #overlayEl;
  #audio;
  #onChange;
  #onClose;
  #isOpen = false;
  #current = {
    outfitId: 'gala_rosa',
    hairId: 'ondas_reales',
    accessories: ['tiara']
  };
  #cleanups = [];

  constructor({ audio, onChange, onClose }) {
    this.#overlayEl = document.getElementById('wardrobe-overlay');
    this.#audio = audio;
    this.#onChange = onChange;
    this.#onClose = onClose;
  }

  init() {
    this.#renderAll();
    const closeBtn = document.getElementById('btn-close-wardrobe');
    const doneBtn = document.getElementById('btn-wardrobe-done');
    const closeFn = () => this.close();
    closeBtn.addEventListener('click', closeFn);
    doneBtn.addEventListener('click', closeFn);
    this.#cleanups.push(
      () => closeBtn.removeEventListener('click', closeFn),
      () => doneBtn.removeEventListener('click', closeFn)
    );
  }

  #renderAll() {
    const outfitsEl = document.getElementById('wardrobe-outfits');
    const hairsEl = document.getElementById('wardrobe-hairs');
    const accEl = document.getElementById('wardrobe-accessories');

    outfitsEl.innerHTML = '';
    for (const o of CharacterRig.OUTFITS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wardrobe-item';
      btn.dataset.outfit = o.id;
      btn.innerHTML = `
        <span class="wardrobe-swatch" style="background:${o.swatch}"></span>
        <strong>${o.name}</strong>
        <span>${o.desc}</span>
      `;
      btn.addEventListener('click', () => {
        this.#current.outfitId = o.id;
        this.#audio?.playSparkle();
        this.#refreshSelection();
        this.#emitChange();
      });
      outfitsEl.appendChild(btn);
    }

    hairsEl.innerHTML = '';
    for (const h of CharacterRig.HAIRSTYLES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wardrobe-item';
      btn.dataset.hair = h.id;
      btn.innerHTML = `<strong>${h.name}</strong><span>${h.desc}</span>`;
      btn.addEventListener('click', () => {
        this.#current.hairId = h.id;
        this.#audio?.playClick();
        this.#refreshSelection();
        this.#emitChange();
      });
      hairsEl.appendChild(btn);
    }

    accEl.innerHTML = '';
    for (const a of CharacterRig.ACCESSORIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wardrobe-item';
      btn.dataset.acc = a.id;
      btn.innerHTML = `<strong>${a.name}</strong><span>${a.desc}</span>`;
      btn.addEventListener('click', () => {
        const set = new Set(this.#current.accessories);
        if (set.has(a.id)) set.delete(a.id);
        else set.add(a.id);
        this.#current.accessories = [...set];
        this.#audio?.playClick();
        this.#refreshSelection();
        this.#emitChange();
      });
      accEl.appendChild(btn);
    }

    this.#refreshSelection();
  }

  #refreshSelection() {
    document.querySelectorAll('#wardrobe-outfits .wardrobe-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.outfit === this.#current.outfitId);
    });
    document.querySelectorAll('#wardrobe-hairs .wardrobe-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.hair === this.#current.hairId);
    });
    const activeAcc = new Set(this.#current.accessories);
    document.querySelectorAll('#wardrobe-accessories .wardrobe-item').forEach((el) => {
      el.classList.toggle('active', activeAcc.has(el.dataset.acc));
    });
  }

  #emitChange() {
    this.#onChange?.({
      outfitId: this.#current.outfitId,
      hairId: this.#current.hairId,
      accessories: [...this.#current.accessories]
    });
  }

  open(currentAppearance) {
    if (currentAppearance) {
      this.#current = {
        outfitId: currentAppearance.outfitId || 'gala_rosa',
        hairId: currentAppearance.hairId || 'ondas_reales',
        accessories: [...(currentAppearance.accessories || [])]
      };
      this.#refreshSelection();
    }
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

  isOpen() {
    return this.#isOpen;
  }

  update() {}

  dispose() {
    for (const fn of this.#cleanups) fn();
    this.#cleanups.length = 0;
    this.#overlayEl.classList.add('hidden');
    this.#isOpen = false;
  }
}
