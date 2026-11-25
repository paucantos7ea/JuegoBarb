import * as THREE from 'three';
import { CollisionSystem } from '../world/CollisionSystem.js';
import { QuestSystem } from '../world/Quests.js';
import { MinigameManager } from '../world/Minigames.js';
import { PlayerController } from '../characters/PlayerController.js';
import { CatalogData } from '../characters/catalog/CatalogData.js';
import { NPCManager } from '../characters/NPCManager.js';
import { WardrobeUI } from '../wardrobe/WardrobeUI.js';
import { WardrobeCamera } from '../wardrobe/WardrobeCamera.js';
import { WardrobeFX } from '../wardrobe/WardrobeFX.js';
import { StateSync } from '../net/StateSync.js';
import { HudUI } from '../ui/HudUI.js';
import { DialogueUI } from '../ui/DialogueUI.js';

/**
 * Sesión principal de exploración y cooperativo LAN del Palacio de Cristal.
 * Coordina mundo 3D, jugador, NPCs, misiones, minijuegos, Vestidor en tiempo real
 * (cámara dedicada + humo mágico + pose) y sincronización P2P.
 */
export class CoopExploreMode {
  #active = false;
  #ctx = null;
  #worldId = 'palacio_cristal';
  #playerName = 'Estrella Real';
  #collision = null;
  #castle = null;
  #decor = null;
  #arena = null;
  #fauna = null;
  #casinoDome = null;
  #coins = null;
  #casinoGames = null;
  #player = null;
  #npcs = null;
  #quests = null;
  #stateSync = null;
  #minigames = null;
  #hud = null;
  #dialogue = null;
  #wardrobe = null;
  #wardrobeCamera = null;
  #wardrobeFX = null;
  #pendingWardrobeFx = null;
  #unsubs = [];
  #currentHotspot = null;
  #hudRefreshTimer = 0.05;
  #lastZoneName = '';

  #hotspots = [
    { id: 'wardrobe_room', label: 'Usar Vestidor Real', pos: new THREE.Vector3(-22, 1.0, -35), radius: 3.6 },
    { id: 'wardrobe_room', label: 'Usar Vestidor de la Suite', pos: new THREE.Vector3(-22, 7.5, -50.5), radius: 3.4 },
    { id: 'minigame:fashion', label: 'Iniciar Pasarela de Moda Real', pos: new THREE.Vector3(-36.5, 0, 0), radius: 4.5 },
    { id: 'minigame:fashion', label: 'Desfilar en Gran Pasarela', pos: new THREE.Vector3(-46, 0.65, -11.5), radius: 4.2 },
    { id: 'minigame:ball', label: 'Iniciar Baile en el Salón Real', pos: new THREE.Vector3(23, 1.0, -33), radius: 4.5 },
    { id: 'minigame:ball', label: 'Ir al Baile en el Salón Real', pos: new THREE.Vector3(42.5, 0, -36), radius: 4.0 },
    { id: 'minigame:race', label: 'Iniciar Carrera por los Jardines', pos: new THREE.Vector3(18, 0, 14), radius: 4.5 }
  ];

  async init(context) {
    this.#ctx = context;
    this.#worldId = context.profile.worldId || 'palacio_cristal';
    this.#playerName = context.profile.name || 'Estrella Real';

    const scene = context.engine.getScene();
    const camera = context.engine.getCamera();

    this.#collision = new CollisionSystem();
    this.#collision.init();

    const [
      { CastleBuilder },
      { WorldDecor },
      { ArenaBuilder },
      { FaunaSystem },
      { CasinoDomeBuilder },
      { CoinSystem },
      { CasinoGames }
    ] = await Promise.all([
      import('../world/CastleBuilder.js'),
      import('../world/WorldDecor.js'),
      import('../world/ArenaBuilder.js'),
      import('../world/FaunaSystem.js'),
      import('../world/CasinoDomeBuilder.js'),
      import('../world/CoinSystem.js'),
      import('../world/CasinoGames.js')
    ]);

    this.#castle = new CastleBuilder(scene, context.textures, this.#collision);
    this.#castle.init();
    this.#decor = new WorldDecor(scene, context.textures, this.#collision);
    this.#decor.init();
    this.#arena = new ArenaBuilder(scene, context.textures, this.#collision);
    this.#arena.init();
    this.#fauna = new FaunaSystem(scene);
    this.#fauna.init();
    this.#casinoDome = new CasinoDomeBuilder(scene, context.textures, this.#collision);
    this.#casinoDome.init();

    this.#player = new PlayerController(scene, camera, context.input, this.#collision, context.audio, context.textures);
    this.#player.init(CatalogData.getDefaultAppearance(context.profile.avatarId));

    this.#npcs = new NPCManager(scene, context.textures);
    this.#npcs.init();

    this.#quests = new QuestSystem(scene, context.audio, (snapshot, msg) => {
      this.#hud.updateQuests(this.#quests.getQuestSummary());
      if (msg) this.#hud.showToast(msg);
      this.#stateSync.broadcastQuests(snapshot, msg);
    });
    this.#quests.init();

    this.#coins = new CoinSystem(scene, context.audio, (balance, delta) => {
      this.#hud?.updateCoins?.(balance, delta);
    });
    this.#coins.init();

    this.#dialogue = new DialogueUI({
      onClose: () => this.#resumePointerLockIfFree()
    });
    this.#dialogue.init();

    this.#hud = new HudUI({
      engine: context.engine,
      peerManager: context.peerManager,
      audio: context.audio,
      callbacks: {
        onToggleWardrobe: () => this.#toggleWardrobe(),
        onCycleWorld: () => this.#cycleWorld(),
        onReturnToMenu: () => context.onReturnToMenu?.(),
        onStartMinigame: (id) => this.#launchMinigame(id),
        onSendChat: (text) => this.#sendChat(text),
        onChatOpen: () => this.#ctx.input.exitPointerLock(),
        onChatClose: () => this.#resumePointerLockIfFree(),
        onOpenInvite: () => {
          this.#hud.openInviteModal(this.#worldId);
          this.#syncControlLock();
        },
        onCloseInvite: () => this.#syncControlLock(true)
      }
    });
    this.#hud.init();
    this.#hud?.updateCoins?.(this.#coins.getBalance(), 0);

    // Sistema completo del Vestidor Real en tiempo real
    this.#wardrobeFX = new WardrobeFX(scene);
    this.#wardrobeFX.init();

    this.#wardrobeCamera = new WardrobeCamera(camera, this.#player, this.#collision);

    this.#wardrobe = new WardrobeUI({
      audio: context.audio,
      onChange: (partial, category) => this.#applyWardrobeChange(partial, category),
      onRotate: (deltaRad) => this.#wardrobeCamera.rotateCharacter(deltaRad),
      onResetRotate: () => this.#wardrobeCamera.resetRotation(),
      onClose: () => this.#handleWardrobeClosed()
    });
    this.#wardrobe.init();

    this.#casinoGames = new CasinoGames({
      scene,
      camera,
      player: this.#player,
      input: context.input,
      audio: context.audio,
      coinSystem: this.#coins,
      casinoDome: this.#casinoDome,
      onExit: () => this.#resumePointerLockIfFree(),
      onBlackjackCelebration: ({ game, payout }) => this.#handleBlackjackCelebration(game, payout),
      onActivityChange: () => {}
    });
    this.#casinoGames.init();

    this.#stateSync = new StateSync(
      scene,
      context.peerManager,
      {
        onPartyChange: () => this.#refreshPartyHud(),
        onToast: (msg) => this.#hud.showToast(msg),
        onChatReceived: (sender, text) => this.#hud.appendChat(sender, text),
        onRemoteQuestSync: (snap, notice) => {
          this.#quests.applySnapshot(snap);
          this.#hud.updateQuests(this.#quests.getQuestSummary());
          if (notice) this.#hud.showToast(notice);
        },
        onRemoteWorldChange: (worldId) => this.#applyWorldTheme(worldId, false),
        onRemoteCasinoFireworks: (senderName) => this.#triggerRemoteCasinoFireworks(senderName)
      },
      context.textures,
      this.#wardrobeFX
    );
    this.#stateSync.init((includeFull = false) => ({
      name: this.#playerName,
      pos: this.#player.getPosition(),
      yaw: this.#player.getYaw(),
      anim: this.#player.getAnimState(),
      emote: this.#player.getEmote(),
      appearance: this.#player.getAppearance(),
      casinoStation: this.#casinoGames?.getActiveActivity() || null,
      worldId: this.#worldId,
      quests: includeFull ? this.#quests.getSnapshot() : undefined
    }));

    this.#minigames = new MinigameManager(
      {
        scene,
        camera,
        player: this.#player,
        input: context.input,
        audio: context.audio,
        castle: this.#castle,
        arena: this.#arena
      },
      document.getElementById('minigame-overlay')
    );
    this.#minigames.init();

    this.#bindInputActions();
    context.input.setPointerLockGuard(() => this.#isUiBusy(false));
    context.input.setPointerLockEnabled(true);
    this.#applyWorldTheme(this.#worldId, false);
    this.#hud.show();
    this.#hud.setPointerLockState(context.input.isPointerLocked());
    this.#hud.updateQuests(this.#quests.getQuestSummary());
    this.#refreshPartyHud();
    this.#hud.appendChat(
      'Palacio',
      `¡Bienvenida/o ${this.#playerName}! Pulsa [C] para probar ropa en vivo, clic para capturar cámara y [Tab] para liberar el ratón.`
    );
    this.#active = true;
  }

  #bindInputActions() {
    const input = this.#ctx.input;
    this.#unsubs.push(
      input.onAction('pointerLockChange', (locked) => this.#hud.setPointerLockState(locked)),
      input.onAction('wardrobe', () => {
        if (!this.#minigames.isActive() && !this.#hud.isInviteModalOpen() && !this.#casinoGames?.isActive()) {
          this.#toggleWardrobe();
        }
      }),
      input.onAction('chat', () => {
        if (!this.#minigames.isActive() && !this.#wardrobe.isOpen() && !this.#casinoGames?.isActive()) {
          input.exitPointerLock();
          this.#hud.focusChat();
        }
      }),
      input.onAction('interact', () => this.#handleInteract()),
      input.onAction('emote', (id) => {
        if (!this.#isUiBusy()) this.#player.playEmote(id);
      }),
      input.onAction('escape', () => {
        if (this.#casinoGames?.isInSession()) {
          this.#casinoGames.exitStation();
          return;
        }
        if (this.#minigames.isActive()) this.#minigames.stop({ completed: false });
        else if (this.#wardrobe.isOpen()) this.#wardrobe.close();
        else if (this.#dialogue.isOpen()) this.#dialogue.hide();
        else if (this.#hud.isInviteModalOpen()) this.#hud.closeInviteModal();
        this.#syncControlLock();
      })
    );
  }

  #applyWorldTheme(worldId, broadcast = false) {
    this.#worldId = worldId;
    const theme = this.#ctx.worldThemes.getById(worldId);
    this.#ctx.engine.applyTheme(theme);
    this.#castle?.applyTheme(theme);
    this.#decor?.applyTheme(theme);
    this.#arena?.applyTheme(theme);
    this.#casinoDome?.applyTheme(theme);
    this.#hud?.setWorldInfo(theme.name, this.#collision.getZoneName(this.#player.getPosition()));
    if (broadcast) {
      this.#stateSync?.broadcastWorld(worldId);
      this.#hud?.showToast(`✨ Reino cambiado a ${theme.name}`);
    }
  }

  #cycleWorld() {
    const nextId = this.#ctx.worldThemes.getNextThemeId(this.#worldId);
    this.#ctx.audio?.playSparkle();
    this.#applyWorldTheme(nextId, true);
  }

  #toggleWardrobe() {
    if (this.#casinoGames?.isActive()) {
      this.#casinoGames.exitStation();
    }
    if (this.#wardrobe.isOpen()) {
      this.#wardrobe.close();
      return;
    }
    this.#dialogue.hide();
    this.#hud.setInteractPrompt(null);
    this.#ctx.input.exitPointerLock();
    this.#wardrobe.open(this.#player.getAppearance());
    this.#wardrobeCamera.enter();
    this.#player.setCameraOverride(true);
    this.#syncControlLock(false);
  }

  #handleWardrobeClosed() {
    this.#wardrobeCamera?.exit();
    this.#syncControlLock(true);
  }

  /**
   * Transformación mágica en vivo:
   * 1. Sonido suave de "poof/destello" + nube de humo rosado/blanco con destellos dorados.
   * 2. En el pico del humo (~120 ms), aplica la nueva prenda y lanza un giro o pose de alegría.
   * 3. Sincroniza el cambio y el humo mágico en tiempo real con el grupo P2P.
   */
  #applyWardrobeChange(partial, category = 'outfit') {
    const targetAppearance = {
      ...this.#player.getAppearance(),
      ...partial,
      accessories: [...(partial.accessories || this.#player.getAppearance().accessories || [])]
    };
    const joyEmote = category === 'accessory' || category === 'color' ? 'star' : 'spin';

    this.#ctx.audio?.playWardrobePoof();
    this.#stateSync.broadcastAppearance(this.#playerName, targetAppearance, {
      fx: true,
      emote: joyEmote
    });

    this.#pendingWardrobeFx?.cancelPeak();
    const root = this.#player.getRig()?.getRoot();
    this.#pendingWardrobeFx = this.#wardrobeFX.trigger(root, {
      peakMs: 120,
      onPeak: () => {
        this.#pendingWardrobeFx = null;
        this.#player.applyAppearance(targetAppearance);
        this.#player.playEmote(joyEmote, { silent: true });
        this.#quests.recordWardrobeUpdate(this.#player.getAppearance());
      }
    });
  }

  #sendChat(text) {
    this.#hud.appendChat(this.#playerName, text);
    this.#stateSync.broadcastChat(this.#playerName, text);
    this.#ctx.audio?.playClick();
  }

  #refreshPartyHud() {
    this.#hud.updateParty(this.#playerName, this.#stateSync.getRemoteList());
  }

  #isUiBusy(includeMinigame = true) {
    return Boolean(
      this.#wardrobe?.isOpen() ||
      this.#dialogue?.isOpen() ||
      this.#hud?.isInviteModalOpen() ||
      this.#casinoGames?.isActive() ||
      (includeMinigame && this.#minigames?.isActive())
    );
  }

  #resumePointerLockIfFree() {
    if (!this.#isUiBusy()) this.#ctx.input.requestPointerLock();
  }

  #syncControlLock(requestLockOnFree = false) {
    const locked = this.#wardrobe.isOpen() || this.#hud.isInviteModalOpen();
    this.#ctx.input.setControlsLocked(locked);
    if (!locked && requestLockOnFree) {
      this.#resumePointerLockIfFree();
    }
  }

  #handleInteract() {
    if (this.#minigames.isActive() || this.#wardrobe.isOpen() || this.#casinoGames?.isActive()) return;
    if (this.#dialogue.isOpen()) {
      this.#dialogue.hide();
      this.#resumePointerLockIfFree();
      return;
    }

    const pos = this.#player.getPosition();
    const npc = this.#npcs.getNearestNPC(pos, 4.2);
    if (npc) {
      this.#ctx.audio?.playClick();
      this.#ctx.input.exitPointerLock();
      this.#quests.recordNpcTalk(npc.id);
      this.#dialogue.show(npc, (actionType) => this.#handleDialogueAction(actionType));
      return;
    }

    const station = this.#casinoDome?.getNearestStation(pos, 2.35);
    if (station) {
      this.#ctx.audio?.playClick();
      this.#hud.setInteractPrompt(null);
      this.#casinoGames.enterStation(station);
      return;
    }

    if (this.#currentHotspot) {
      if (this.#currentHotspot.id === 'wardrobe_room') {
        this.#toggleWardrobe();
      } else if (this.#currentHotspot.id.startsWith('minigame:')) {
        this.#launchMinigame(this.#currentHotspot.id.split(':')[1]);
      }
    }
  }

  #handleDialogueAction(actionType) {
    if (actionType === 'wardrobe') this.#toggleWardrobe();
    else if (actionType?.startsWith('minigame:')) this.#launchMinigame(actionType.split(':')[1]);
  }

  #handleBlackjackCelebration(game, payout) {
    this.#stateSync?.broadcastCasinoFireworks(this.#playerName);
    this.#hud?.showToast(
      game === 'blackjack'
        ? `✨ ¡${this.#playerName} ha sacado BLACKJACK en la Cúpula Real! (+${payout} 🪙) 🎆`
        : `✨ ¡JACKPOT IMPERIAL en la Cúpula Real! (+${payout} 🪙) 🎆`
    );
  }

  #triggerRemoteCasinoFireworks(senderName) {
    this.#casinoDome?.triggerDomeFireworks();
    this.#ctx.audio?.playFireworks?.();
    this.#hud?.showToast(`✨ ¡${senderName} ha sacado BLACKJACK en la Cúpula Real! 🎆`);
  }

  async #launchMinigame(id) {
    if (this.#minigames.isActive()) return;
    if (this.#casinoGames?.isActive()) {
      this.#casinoGames.exitStation();
    }
    this.#wardrobe.close();
    this.#wardrobeCamera.dispose();
    this.#player.setCameraOverride(false);
    this.#dialogue.hide();
    this.#hud.setInteractPrompt(null);
    this.#ctx.input.exitPointerLock();
    this.#ctx.audio?.playSparkle();
    await this.#minigames.start(id, (summary) => {
      this.#syncControlLock(true);
      if (summary?.completed) {
        this.#hud.showToast('♛ ¡Actividad real completada con éxito!');
      }
    });
  }

  update(dt) {
    if (!this.#active) return;

    this.#castle?.update(dt);
    this.#decor?.update(dt);
    this.#arena?.update(dt);
    this.#casinoDome?.update(dt);
    this.#wardrobe?.update(dt);

    const camControlledByWardrobe = Boolean(this.#wardrobeCamera?.isControllingCamera());
    const inCasinoSession = Boolean(this.#casinoGames?.isActive());
    this.#player?.setCameraOverride(camControlledByWardrobe || inCasinoSession);
    this.#player?.update(dt);
    if (camControlledByWardrobe) {
      this.#wardrobeCamera.update(dt);
    }
    if (inCasinoSession) {
      this.#casinoGames.update(dt);
    }
    this.#wardrobeFX?.update(dt);

    const pos = this.#player.getPosition();
    this.#fauna?.update(dt, this.#ctx.engine.getElapsed(), pos, this.#ctx.input.isSprinting());
    this.#npcs?.update(dt, pos, Boolean(this.#dialogue?.isOpen()));
    this.#quests?.update(dt, pos);
    if (!this.#minigames.isActive() && !inCasinoSession) {
      this.#coins?.update(dt, pos);
    }
    this.#stateSync?.update(dt);

    if (this.#minigames.isActive()) {
      this.#minigames.update(dt);
      return;
    }

    if (inCasinoSession) {
      this.#hud.setInteractPrompt(null);
      return;
    }

    this.#hud.updateCompass(this.#player.getCameraYaw());
    this.#hudRefreshTimer += dt;
    if (this.#hudRefreshTimer >= 0.05) {
      this.#hudRefreshTimer = 0;
      const zoneName = this.#collision.getZoneName(pos);
      if (zoneName !== this.#lastZoneName) {
        this.#lastZoneName = zoneName;
        this.#hud.setZoneName(zoneName);
      }
      this.#hud.drawMinimap(
        pos,
        this.#player.getYaw(),
        this.#stateSync.getRemoteList(),
        this.#quests.getUncollectedGemPositions()
      );
    }

    if (this.#wardrobe.isOpen()) {
      this.#hud.setInteractPrompt(null);
      return;
    }

    const nearNpc = this.#npcs.getNearestNPC(pos, 4.2);
    if (nearNpc) {
      this.#currentHotspot = null;
      this.#hud.setInteractPrompt(`Hablar con ${nearNpc.name}`);
      return;
    }

    const nearStation = this.#casinoDome?.getNearestStation(pos, 2.35);
    if (nearStation) {
      this.#currentHotspot = null;
      this.#hud.setInteractPrompt(nearStation.label);
      return;
    }

    let found = null;
    for (const hs of this.#hotspots) {
      if (pos.distanceToSquared(hs.pos) <= hs.radius * hs.radius) {
        found = hs;
        break;
      }
    }
    this.#currentHotspot = found;
    this.#hud.setInteractPrompt(found ? found.label : null);
  }

  dispose() {
    this.#active = false;
    this.#pendingWardrobeFx?.cancelPeak();
    this.#pendingWardrobeFx = null;

    for (const u of this.#unsubs) u();
    this.#unsubs.length = 0;

    this.#minigames?.dispose();
    this.#casinoGames?.dispose();
    this.#coins?.dispose();
    this.#wardrobe?.dispose();
    this.#wardrobeCamera?.dispose();
    this.#wardrobeFX?.dispose();
    this.#dialogue?.dispose();
    this.#hud?.dispose();
    this.#stateSync?.dispose();
    this.#quests?.dispose();
    this.#npcs?.dispose();
    this.#player?.dispose();
    this.#casinoDome?.dispose();
    this.#arena?.dispose();
    this.#fauna?.dispose();
    this.#castle?.dispose();
    this.#decor?.dispose();
    this.#collision?.dispose();
    this.#ctx?.input?.setPointerLockGuard(null);
    this.#ctx?.input?.setPointerLockEnabled(false);
    this.#ctx?.input?.setControlsLocked(false);
  }
}
