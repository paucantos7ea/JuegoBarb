/**
 * Interfaz flotante Cristal / Oro-Rosa para los juegos de Casino en Primera Persona
 * (Tragaperras Real y Blackjack Animado).
 * Deja el centro de la pantalla totalmente despejado para ver los rodillos y las cartas 3D.
 */
export class CasinoUI {
  #rootEl = null;
  #overlayEl = null;
  #styleEl = null;
  #initialized = false;
  #mode = null; // 'slots' | 'blackjack'
  #balance = 0;
  #slotsBet = 10;
  #bjBet = 10;
  #bannerTimer = null;

  #callbacks = {
    onSpin: null,
    onDeal: null,
    onHit: null,
    onStand: null,
    onDouble: null,
    onExit: null
  };

  #els = {};
  #cleanups = [];

  static #SLOT_BETS = [10, 25, 50];
  static #BJ_BETS = [10, 25, 50, 100];

  init() {
    if (this.#initialized) return;
    this.#initialized = true;

    this.#injectStyles();
    this.#mountOverlay();
    this.#bindEvents();
  }

  #injectStyles() {
    if (document.getElementById('casino-ui-style')) {
      this.#styleEl = document.getElementById('casino-ui-style');
      return;
    }

    const style = document.createElement('style');
    style.id = 'casino-ui-style';
    style.textContent = `
      body.casino-open .hud-left,
      body.casino-open .hud-right,
      body.casino-open .hud-brand,
      body.casino-open .hud-compass,
      body.casino-open .chat-panel,
      body.casino-open .interact-prompt,
      body.casino-open .pointer-lock-hint,
      body.casino-open .emote-hint,
      body.casino-open .hud-actions {
        opacity: 0;
        pointer-events: none !important;
        transition: opacity 0.2s ease;
      }

      .casino-overlay {
        position: absolute;
        inset: 0;
        z-index: 24;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        padding: 14px 18px 18px;
      }

      .casino-overlay.hidden {
        display: none !important;
      }

      .casino-top-bar {
        width: 100%;
        max-width: 1120px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        pointer-events: none;
      }

      .casino-title-chip {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 18px;
        border-radius: 999px;
        background: rgba(255, 246, 251, 0.86);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(229, 184, 105, 0.65);
        box-shadow: 0 8px 24px rgba(72, 22, 52, 0.18);
      }

      .casino-title-icon {
        font-size: 1.25rem;
        line-height: 1;
      }

      .casino-title-text {
        display: flex;
        flex-direction: column;
      }

      .casino-kicker {
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--gold-deep, #b9823c);
      }

      .casino-title-main {
        font-family: var(--font-display, Georgia, serif);
        font-size: 1rem;
        font-weight: 700;
        color: var(--rose-600, #992961);
      }

      .casino-top-right {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .casino-balance-chip {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 8px 16px;
        border-radius: 999px;
        background: linear-gradient(135deg, rgba(48, 18, 42, 0.86), rgba(88, 28, 66, 0.86));
        color: #fff3d6;
        border: 1px solid rgba(229, 184, 105, 0.8);
        box-shadow: 0 6px 20px rgba(45, 16, 40, 0.28);
        font-weight: 800;
        font-size: 0.94rem;
      }

      .casino-exit-btn {
        padding: 8px 16px;
        border-radius: 999px;
        background: rgba(255, 248, 252, 0.9);
        color: var(--rose-600, #992961);
        border: 1px solid rgba(212, 77, 143, 0.38);
        font-weight: 700;
        font-size: 0.84rem;
        box-shadow: 0 6px 18px rgba(72, 22, 52, 0.16);
      }

      .casino-exit-btn:hover {
        background: var(--rose-500, #c74182);
        color: #fff;
        border-color: transparent;
      }

      .casino-top-center {
        position: absolute;
        top: 66px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        pointer-events: none;
        width: min(560px, 90vw);
      }

      .casino-dealer-badge {
        padding: 6px 16px;
        border-radius: 999px;
        background: rgba(38, 16, 35, 0.82);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(229, 184, 105, 0.65);
        color: #fff3fa;
        font-size: 0.86rem;
        font-weight: 700;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.24);
      }

      .casino-dealer-badge strong {
        color: #ffe29a;
        margin-left: 4px;
      }

      .casino-celebration-banner {
        padding: 10px 26px;
        border-radius: 999px;
        background: linear-gradient(135deg, #fff1ba 0%, #f4c668 48%, #f374ae 100%);
        color: #361028;
        font-family: var(--font-display, Georgia, serif);
        font-size: 1.15rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        border: 2px solid #fff8df;
        box-shadow: 0 10px 32px rgba(243, 185, 76, 0.55), 0 0 24px rgba(255, 224, 140, 0.65);
        animation: casinoBannerPop 0.36s cubic-bezier(0.22, 1, 0.36, 1);
        text-align: center;
      }

      @keyframes casinoBannerPop {
        0% { opacity: 0; transform: scale(0.75) translateY(-10px); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }

      .casino-bottom-dock {
        pointer-events: auto;
        width: min(740px, calc(100vw - 24px));
        padding: 12px 18px 14px;
        border-radius: 22px;
        background: rgba(255, 246, 251, 0.86);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.78);
        box-shadow: 0 14px 38px rgba(68, 18, 52, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.9);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .casino-status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }

      .casino-result-text {
        font-size: 0.92rem;
        font-weight: 700;
        color: var(--ink-dark, #2c1626);
        flex: 1;
        min-width: 180px;
      }

      .casino-result-text.is-big-win {
        color: #9e5a08;
        text-shadow: 0 0 12px rgba(245, 198, 92, 0.45);
      }

      .casino-player-score {
        padding: 4px 12px;
        border-radius: 999px;
        background: rgba(199, 65, 130, 0.14);
        border: 1px solid rgba(199, 65, 130, 0.35);
        color: var(--rose-600, #992961);
        font-size: 0.84rem;
        font-weight: 800;
      }

      .casino-controls-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      .casino-bet-group {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      .casino-bet-label {
        font-size: 0.76rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--ink-muted, #6c4a60);
        margin-right: 4px;
      }

      .casino-bet-btn {
        padding: 7px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.86);
        color: var(--rose-600, #992961);
        border: 1px solid rgba(212, 77, 143, 0.32);
        font-size: 0.82rem;
        font-weight: 800;
      }

      .casino-bet-btn:hover:not(:disabled) {
        background: #fff;
        border-color: var(--rose-400, #e564a1);
      }

      .casino-bet-btn.active {
        background: linear-gradient(135deg, #f374ae, #c74182);
        color: #fff;
        border-color: transparent;
        box-shadow: 0 4px 12px rgba(199, 65, 130, 0.32);
      }

      .casino-actions-group {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
        flex-wrap: wrap;
      }

      .casino-btn-gold {
        padding: 10px 22px;
        border-radius: 12px;
        background: linear-gradient(135deg, #f6cf78 0%, #d8963e 55%, #c74182 100%);
        color: #fff;
        font-size: 0.94rem;
        font-weight: 800;
        letter-spacing: 0.02em;
        box-shadow: 0 6px 18px rgba(199, 108, 65, 0.36);
      }

      .casino-btn-gold:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 8px 24px rgba(199, 108, 65, 0.5);
      }

      .casino-btn-action {
        padding: 9px 16px;
        border-radius: 11px;
        font-size: 0.88rem;
        font-weight: 800;
      }

      .casino-btn-hit {
        background: linear-gradient(135deg, #f374ae, #d44d8f);
        color: #fff;
        box-shadow: 0 5px 14px rgba(199, 65, 130, 0.34);
      }

      .casino-btn-stand {
        background: rgba(255, 255, 255, 0.92);
        color: var(--rose-600, #992961);
        border: 1px solid rgba(212, 77, 143, 0.38);
      }

      .casino-btn-double {
        background: linear-gradient(135deg, #f5ce73, #cf8e35);
        color: #2d1424;
        box-shadow: 0 5px 14px rgba(207, 142, 53, 0.34);
      }

      .casino-payout-hint {
        font-size: 0.72rem;
        color: var(--ink-muted, #6c4a60);
        text-align: center;
      }
    `;
    document.head.appendChild(style);
    this.#styleEl = style;
  }

  #mountOverlay() {
    this.#rootEl = document.getElementById('app-root') || document.body;

    const existing = document.getElementById('casino-overlay');
    if (existing) existing.remove();

    const section = document.createElement('section');
    section.id = 'casino-overlay';
    section.className = 'casino-overlay hidden';
    section.setAttribute('aria-label', 'Salón de Juegos del Palacio');

    section.innerHTML = `
      <div class="casino-top-bar">
        <div class="casino-title-chip">
          <span id="casino-title-icon" class="casino-title-icon">🎰</span>
          <div class="casino-title-text">
            <span class="casino-kicker">Palacio de Cristal · Primera Persona</span>
            <span id="casino-title-main" class="casino-title-main">Tragaperras Real</span>
          </div>
        </div>

        <div class="casino-top-right">
          <div class="casino-balance-chip" aria-live="polite">
            <span>🪙</span>
            <span id="casino-balance-val">0</span>
          </div>
          <button id="casino-btn-exit" class="casino-exit-btn" type="button">✕ Salir</button>
        </div>
      </div>

      <div class="casino-top-center">
        <div id="casino-dealer-badge" class="casino-dealer-badge hidden">
          Banca: <strong id="casino-dealer-score">?</strong>
        </div>
        <div id="casino-celebration-banner" class="casino-celebration-banner hidden" role="status"></div>
      </div>

      <div class="casino-bottom-dock">
        <div class="casino-status-row">
          <div id="casino-result-text" class="casino-result-text">Elige tu apuesta y prueba tu suerte.</div>
          <div id="casino-player-badge" class="casino-player-score hidden">
            Tu mano: <span id="casino-player-score">0</span>
          </div>
        </div>

        <div id="casino-slots-panel" class="casino-controls-row hidden">
          <div id="casino-slots-bets" class="casino-bet-group"></div>
          <div class="casino-actions-group">
            <button id="casino-btn-spin" class="casino-btn-gold" type="button">🎰 Tirar</button>
          </div>
        </div>

        <div id="casino-slots-hint" class="casino-payout-hint hidden">
          2 iguales: ×2 · 3 iguales: ×6 · Triple Corona o Triple 7: ×15 (Jackpot Imperial)
        </div>

        <div id="casino-bj-panel" class="casino-controls-row hidden">
          <div id="casino-bj-bets" class="casino-bet-group"></div>
          <div class="casino-actions-group">
            <button id="casino-btn-deal" class="casino-btn-gold" type="button">🃏 Repartir</button>
            <button id="casino-btn-hit" class="casino-btn-action casino-btn-hit hidden" type="button">Pedir carta</button>
            <button id="casino-btn-stand" class="casino-btn-action casino-btn-stand hidden" type="button">Plantarse</button>
            <button id="casino-btn-double" class="casino-btn-action casino-btn-double hidden" type="button">Doblar</button>
          </div>
        </div>
      </div>
    `;

    this.#rootEl.appendChild(section);
    this.#overlayEl = section;

    this.#els = {
      titleIcon: section.querySelector('#casino-title-icon'),
      titleMain: section.querySelector('#casino-title-main'),
      balanceVal: section.querySelector('#casino-balance-val'),
      btnExit: section.querySelector('#casino-btn-exit'),
      dealerBadge: section.querySelector('#casino-dealer-badge'),
      dealerScore: section.querySelector('#casino-dealer-score'),
      banner: section.querySelector('#casino-celebration-banner'),
      resultText: section.querySelector('#casino-result-text'),
      playerBadge: section.querySelector('#casino-player-badge'),
      playerScore: section.querySelector('#casino-player-score'),
      slotsPanel: section.querySelector('#casino-slots-panel'),
      slotsBets: section.querySelector('#casino-slots-bets'),
      slotsHint: section.querySelector('#casino-slots-hint'),
      btnSpin: section.querySelector('#casino-btn-spin'),
      bjPanel: section.querySelector('#casino-bj-panel'),
      bjBets: section.querySelector('#casino-bj-bets'),
      btnDeal: section.querySelector('#casino-btn-deal'),
      btnHit: section.querySelector('#casino-btn-hit'),
      btnStand: section.querySelector('#casino-btn-stand'),
      btnDouble: section.querySelector('#casino-btn-double')
    };

    this.#renderBetButtons(this.#els.slotsBets, CasinoUI.#SLOT_BETS, 'slots');
    this.#renderBetButtons(this.#els.bjBets, CasinoUI.#BJ_BETS, 'blackjack');
  }

  #renderBetButtons(container, bets, game) {
    container.innerHTML = `<span class="casino-bet-label">Apuesta</span>`;
    for (const amount of bets) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'casino-bet-btn';
      btn.dataset.bet = String(amount);
      btn.dataset.game = game;
      btn.textContent = `${amount} 🪙`;
      container.appendChild(btn);
    }
  }

  #bindEvents() {
    const on = (el, ev, fn) => {
      if (!el) return;
      el.addEventListener(ev, fn);
      this.#cleanups.push(() => el.removeEventListener(ev, fn));
    };

    on(this.#els.btnExit, 'click', () => {
      this.#els.btnExit.blur();
      this.#callbacks.onExit?.();
    });

    on(this.#els.slotsBets, 'click', (e) => {
      const btn = e.target.closest('.casino-bet-btn');
      if (!btn || btn.disabled) return;
      btn.blur();
      this.#slotsBet = Number(btn.dataset.bet) || 10;
      this.#syncBetButtons(this.#els.slotsBets, this.#slotsBet);
    });

    on(this.#els.bjBets, 'click', (e) => {
      const btn = e.target.closest('.casino-bet-btn');
      if (!btn || btn.disabled) return;
      btn.blur();
      this.#bjBet = Number(btn.dataset.bet) || 10;
      this.#syncBetButtons(this.#els.bjBets, this.#bjBet);
    });

    on(this.#els.btnSpin, 'click', () => {
      this.#els.btnSpin.blur();
      this.#hideBanner();
      this.#callbacks.onSpin?.(this.#slotsBet);
    });

    on(this.#els.btnDeal, 'click', () => {
      this.#els.btnDeal.blur();
      this.#hideBanner();
      this.#callbacks.onDeal?.(this.#bjBet);
    });

    on(this.#els.btnHit, 'click', () => {
      this.#els.btnHit.blur();
      this.#callbacks.onHit?.();
    });

    on(this.#els.btnStand, 'click', () => {
      this.#els.btnStand.blur();
      this.#callbacks.onStand?.();
    });

    on(this.#els.btnDouble, 'click', () => {
      this.#els.btnDouble.blur();
      this.#callbacks.onDouble?.();
    });
  }

  #syncBetButtons(container, activeBet, disabled = false) {
    if (!container) return;
    container.querySelectorAll('.casino-bet-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.bet) === activeBet);
      btn.disabled = Boolean(disabled);
    });
  }

  #hideBanner() {
    if (this.#bannerTimer) {
      clearTimeout(this.#bannerTimer);
      this.#bannerTimer = null;
    }
    this.#els.banner?.classList.add('hidden');
  }

  openSlots({ balance = 0, onSpin = null, onExit = null } = {}) {
    if (!this.#initialized) this.init();
    this.#mode = 'slots';
    this.#slotsBet = 10;
    this.#callbacks = { onSpin, onDeal: null, onHit: null, onStand: null, onDouble: null, onExit };

    this.#els.titleIcon.textContent = '🎰';
    this.#els.titleMain.textContent = 'Tragaperras Imperial';
    this.#els.slotsPanel.classList.remove('hidden');
    this.#els.slotsHint.classList.remove('hidden');
    this.#els.bjPanel.classList.add('hidden');
    this.#els.dealerBadge.classList.add('hidden');
    this.#els.playerBadge.classList.add('hidden');

    this.#hideBanner();
    this.setBalance(balance);
    this.setSlotsState({
      spinning: false,
      bet: this.#slotsBet,
      resultText: 'Elige tu apuesta y tira de la palanca real.',
      isBigWin: false
    });

    this.#overlayEl.classList.remove('hidden');
    document.body.classList.toggle('casino-open', true);
  }

  openBlackjack({ balance = 0, onDeal = null, onHit = null, onStand = null, onDouble = null, onExit = null } = {}) {
    if (!this.#initialized) this.init();
    this.#mode = 'blackjack';
    this.#bjBet = 10;
    this.#callbacks = { onSpin: null, onDeal, onHit, onStand, onDouble, onExit };

    this.#els.titleIcon.textContent = '🃏';
    this.#els.titleMain.textContent = 'Blackjack del Palacio';
    this.#els.slotsPanel.classList.add('hidden');
    this.#els.slotsHint.classList.add('hidden');
    this.#els.bjPanel.classList.remove('hidden');
    this.#els.dealerBadge.classList.remove('hidden');
    this.#els.playerBadge.classList.remove('hidden');

    this.#hideBanner();
    this.setBalance(balance);
    this.setBlackjackState({
      phase: 'betting',
      bet: this.#bjBet,
      playerScore: '-',
      dealerScore: '-',
      canDouble: false,
      resultText: 'Elige tu apuesta y pulsa Repartir para comenzar.',
      isBlackjack: false
    });

    this.#overlayEl.classList.remove('hidden');
    document.body.classList.toggle('casino-open', true);
  }

  setBalance(balance) {
    this.#balance = Math.max(0, Math.floor(Number(balance) || 0));
    if (this.#els.balanceVal) {
      this.#els.balanceVal.textContent = String(this.#balance);
    }
  }

  setSlotsState({ spinning = false, bet, resultText, isBigWin = false } = {}) {
    if (typeof bet === 'number' && CasinoUI.#SLOT_BETS.includes(bet)) {
      this.#slotsBet = bet;
    }
    this.#syncBetButtons(this.#els.slotsBets, this.#slotsBet, spinning);

    if (this.#els.btnSpin) {
      this.#els.btnSpin.disabled = Boolean(spinning);
      this.#els.btnSpin.textContent = spinning ? '✨ Girando...' : '🎰 Tirar';
    }
    if (typeof resultText === 'string' && this.#els.resultText) {
      this.#els.resultText.textContent = resultText;
      this.#els.resultText.classList.toggle('is-big-win', Boolean(isBigWin));
    }
  }

  setBlackjackState({ phase = 'betting', bet, playerScore, dealerScore, canDouble = false, resultText, isBlackjack = false } = {}) {
    if (typeof bet === 'number' && CasinoUI.#BJ_BETS.includes(bet)) {
      this.#bjBet = bet;
    }

    const canBetOrDeal = phase === 'betting' || phase === 'result';
    const isPlayerTurn = phase === 'playerTurn';

    this.#syncBetButtons(this.#els.bjBets, this.#bjBet, !canBetOrDeal);
    this.#els.bjBets?.classList.toggle('hidden', !canBetOrDeal);

    this.#els.btnDeal?.classList.toggle('hidden', !canBetOrDeal);
    if (this.#els.btnDeal) {
      this.#els.btnDeal.disabled = !canBetOrDeal;
      this.#els.btnDeal.textContent = phase === 'result' ? '🃏 Nueva Mano' : '🃏 Repartir';
    }

    this.#els.btnHit?.classList.toggle('hidden', !isPlayerTurn);
    this.#els.btnStand?.classList.toggle('hidden', !isPlayerTurn);
    this.#els.btnDouble?.classList.toggle('hidden', !isPlayerTurn);

    if (this.#els.btnHit) this.#els.btnHit.disabled = !isPlayerTurn;
    if (this.#els.btnStand) this.#els.btnStand.disabled = !isPlayerTurn;
    if (this.#els.btnDouble) this.#els.btnDouble.disabled = !isPlayerTurn || !canDouble;

    if (playerScore !== undefined && this.#els.playerScore) {
      this.#els.playerScore.textContent = String(playerScore);
    }
    if (dealerScore !== undefined && this.#els.dealerScore) {
      this.#els.dealerScore.textContent = String(dealerScore);
    }
    if (typeof resultText === 'string' && this.#els.resultText) {
      this.#els.resultText.textContent = resultText;
      this.#els.resultText.classList.toggle('is-big-win', Boolean(isBlackjack));
    }
  }

  showCelebrationBanner(text) {
    if (!this.#els.banner || !text) return;
    this.#hideBanner();
    this.#els.banner.textContent = text;
    this.#els.banner.classList.remove('hidden');
    this.#bannerTimer = setTimeout(() => {
      this.#els.banner?.classList.add('hidden');
      this.#bannerTimer = null;
    }, 3800);
  }

  close() {
    this.#mode = null;
    this.#hideBanner();
    this.#overlayEl?.classList.add('hidden');
    document.body.classList.toggle('casino-open', false);
  }

  dispose() {
    this.close();
    for (const fn of this.#cleanups) fn();
    this.#cleanups.length = 0;
    this.#callbacks = { onSpin: null, onDeal: null, onHit: null, onStand: null, onDouble: null, onExit: null };

    if (this.#overlayEl) {
      this.#overlayEl.remove();
      this.#overlayEl = null;
    }
    if (this.#styleEl) {
      this.#styleEl.remove();
      this.#styleEl = null;
    }
    this.#els = {};
    this.#initialized = false;
  }
}
