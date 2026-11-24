/**
 * Controlador de la caja de diálogo interactivo con NPCs del Reino Rosa Imperial.
 */
export class DialogueUI {
  #boxEl = null;
  #speakerEl = null;
  #roleEl = null;
  #textEl = null;
  #actionsEl = null;
  #onClose;
  #isOpen = false;

  constructor({ onClose } = {}) {
    this.#onClose = onClose;
  }

  init() {
    this.#boxEl = document.getElementById('dialogue-box');
    this.#speakerEl = document.getElementById('dialogue-speaker');
    this.#roleEl = document.getElementById('dialogue-role');
    this.#textEl = document.getElementById('dialogue-text');
    this.#actionsEl = document.getElementById('dialogue-actions');
  }

  show(npc, onAction) {
    if (!this.#boxEl || !npc) return;
    this.#isOpen = true;
    this.#speakerEl.textContent = npc.name;
    this.#roleEl.textContent = npc.role;
    this.#textEl.textContent = npc.greeting;

    this.#actionsEl.innerHTML = '';
    const addBtn = (label, cls, handler) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = cls;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        btn.blur?.();
        this.hide();
        handler();
      });
      this.#actionsEl.appendChild(btn);
    };

    if (npc.actionLabel) {
      addBtn(npc.actionLabel, 'btn-primary btn-sm', () => onAction?.(npc.actionType));
    }
    if (npc.secondaryLabel) {
      addBtn(npc.secondaryLabel, 'btn-secondary btn-sm', () => onAction?.(npc.secondaryType));
    }
    addBtn('Cerrar', 'btn-secondary btn-sm', () => this.#onClose?.());

    this.#boxEl.classList.remove('hidden');
  }

  hide() {
    this.#isOpen = false;
    if (!this.#boxEl) return;
    this.#boxEl.classList.add('hidden');
    if (this.#boxEl.contains(document.activeElement)) {
      document.activeElement?.blur?.();
    }
  }

  isOpen() {
    return this.#isOpen;
  }

  dispose() {
    this.hide();
  }
}
