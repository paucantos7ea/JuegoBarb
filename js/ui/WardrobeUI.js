import { CharacterRig } from '../entities/CharacterRig.js';

const DEFAULT_MODEL_TIP = 'Prueba un personaje .glb/.gltf (Mixamo o Blender) en vista local.';

export class WardrobeUI {
  #overlayEl;
  #audio;
  #onChange;
  #onClose;
  #isOpen = false;
  #current = { outfitId: 'gala_rosa', hairId: 'ondas_reales', accessories: ['tiara'] };
  #cleanups = [];
  #customModelUrl = null;
  #customModelName = null;
  #customGroupEl = null;
  #fileInputEl = null;
  #resetModelBtn = null;
  #modelTipEl = null;

  constructor({ audio, onChange, onClose }) {
    this.#overlayEl = document.getElementById('wardrobe-overlay');
    this.#audio = audio;
    this.#onChange = onChange;
    this.#onClose = onClose;
  }

  init() {
    this.#renderAll();
    this.#injectCustomModelSection();
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
      btn.innerHTML = `<span class="wardrobe-swatch" style="background:${o.swatch}"></span><strong>${o.name}</strong><span>${o.desc}</span>`;
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

  #injectCustomModelSection() {
    const bodyEl = this.#overlayEl?.querySelector('.wardrobe-body');
    if (!bodyEl) return;

    this.#customGroupEl?.remove();
    const group = document.createElement('div');
    group.className = 'wardrobe-group';

    const title = document.createElement('h3');
    title.textContent = 'Modelo 3D Personalizado (.GLB)';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:10px';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.glb,.gltf';
    fileInput.hidden = true;

    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'btn-secondary btn-sm';
    uploadBtn.textContent = '📂 Probar modelo .GLB local';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn-secondary btn-sm hidden';
    resetBtn.textContent = '↺ Volver al avatar base';

    const tip = document.createElement('span');
    tip.className = 'wardrobe-tip';
    tip.textContent = DEFAULT_MODEL_TIP;

    const onUpload = () => { this.#audio?.playClick(); fileInput.click(); };
    const onFile = () => {
      const file = fileInput.files?.[0];
      // Vaciar el input permite volver a elegir el mismo archivo (si no, 'change' no se dispara)
      fileInput.value = '';
      if (!file) return;
      // La URL anterior se revoca aquí; el CharacterRig libera la malla/texturas del modelo
      // anterior al montar el nuevo (o al volver al rig procedural).
      this.#revokeCustomModelUrl();
      const url = URL.createObjectURL(file);
      this.#customModelUrl = url;
      this.#customModelName = file.name;
      this.#audio?.playSparkle();
      this.#refreshCustomModelState();
      if (this.#modelTipEl) this.#modelTipEl.textContent = `Cargando ${file.name}...`;
      const result = this.#onChange?.({ ...this.#current, accessories: [...this.#current.accessories], customModelUrl: url });
      Promise.resolve(result).then((ok) => {
        // Ignorar si el usuario ya eligió otro archivo o restauró el avatar
        if (this.#customModelUrl !== url) return;
        if (ok === false) {
          this.#revokeCustomModelUrl();
          this.#customModelName = null;
          this.#onChange?.({ ...this.#current, accessories: [...this.#current.accessories], customModelUrl: null });
          this.#refreshCustomModelState();
          if (this.#modelTipEl) this.#modelTipEl.textContent = `No se pudo cargar ${file.name}: usa un .glb válido (o .gltf con todo embebido).`;
        } else {
          this.#refreshCustomModelState();
        }
      }).catch(() => {});
    };
    const onReset = () => {
      this.#revokeCustomModelUrl();
      this.#customModelName = null;
      fileInput.value = '';
      this.#audio?.playClick();
      this.#refreshCustomModelState();
      this.#onChange?.({ ...this.#current, accessories: [...this.#current.accessories], customModelUrl: null });
    };

    uploadBtn.addEventListener('click', onUpload);
    fileInput.addEventListener('change', onFile);
    resetBtn.addEventListener('click', onReset);
    this.#cleanups.push(
      () => uploadBtn.removeEventListener('click', onUpload),
      () => fileInput.removeEventListener('change', onFile),
      () => resetBtn.removeEventListener('click', onReset)
    );

    row.append(fileInput, uploadBtn, resetBtn, tip);
    group.append(title, row);
    bodyEl.appendChild(group);

    this.#customGroupEl = group;
    this.#fileInputEl = fileInput;
    this.#resetModelBtn = resetBtn;
    this.#modelTipEl = tip;
    this.#refreshCustomModelState();
  }

  #refreshCustomModelState() {
    if (!this.#resetModelBtn || !this.#modelTipEl) return;
    const active = Boolean(this.#customModelUrl);
    this.#resetModelBtn.classList.toggle('hidden', !active);
    this.#modelTipEl.textContent = active
      ? `Modelo local activo: ${this.#customModelName || 'archivo.glb'} (elige un conjunto arriba para teñir)`
      : DEFAULT_MODEL_TIP;
  }

  #revokeCustomModelUrl() {
    if (this.#customModelUrl) {
      URL.revokeObjectURL(this.#customModelUrl);
      this.#customModelUrl = null;
    }
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
    this.#refreshCustomModelState();
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
    this.#revokeCustomModelUrl();
    this.#customModelName = null;
    if (this.#fileInputEl) this.#fileInputEl.value = '';
    for (const fn of this.#cleanups) fn();
    this.#cleanups.length = 0;
    this.#customGroupEl?.remove();
    this.#customGroupEl = null;
    this.#fileInputEl = null;
    this.#resetModelBtn = null;
    this.#modelTipEl = null;
    this.#overlayEl.classList.add('hidden');
    this.#isOpen = false;
  }
}
