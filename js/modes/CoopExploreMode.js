import * as THREE from 'three';
import { BaseGameMode } from './BaseGameMode.js';
import { CollisionSystem } from '../world/CollisionSystem.js';
import { PlayerController } from '../entities/PlayerController.js';
import { NPCManager } from '../entities/NPCManager.js';
import { QuestSystem } from '../entities/QuestSystem.js';
import { StateSync } from '../network/StateSync.js';
import { MinigameManager } from '../minigames/MinigameManager.js';
import { HudUI } from '../ui/HudUI.js';
import { WardrobeUI } from '../ui/WardrobeUI.js';

export class CoopExploreMode extends BaseGameMode {
  #ctx = null;
  #worldId = 'palacio_cristal';
  #playerName = 'Estrella Real';
  #collision = null;
  #castle = null;
  #gardens = null;
  #player = null;
  #npcs = null;
  #quests = null;
  #stateSync = null;
  #minigames = null;
  #hud = null;
  #wardrobe = null;
  #unsubs = [];
  #currentHotspot = null;

  #hotspots = [
    { id: 'wardrobe_room', label: 'Usar Vestidor Real', pos: new THREE.Vector3(-18, 1.0, -35), radius: 3.4 },
    { id: 'minigame:fashion', label: 'Iniciar Pasarela de Moda Real', pos: new THREE.Vector3(-26, 0.35, -7), radius: 3.6 },
    { id: 'minigame:ball', label: 'Iniciar Baile en el Salón Real', pos: new THREE.Vector3(18, 1.0, -35), radius: 3.8 },
    { id: 'minigame:race', label: 'Iniciar Carrera por los Jardines', pos: new THREE.Vector3(10, 0, 12), radius: 3.6 }
  ];

  constructor() {
    super('coop_explore');
  }

  async onInit(context) {
    this.#ctx = context;
    this.#worldId = context.profile.worldId || 'palacio_cristal';
    this.#playerName = context.profile.name || 'Estrella Real';

    const scene = context.engine.getScene();
    const camera = context.engine.getCamera();

    this.#collision = new CollisionSystem();
    this.#collision.init();

    // Carga diferida (Lazy Loading) de generadores de mundo
    const [{ CastleBuilder }, { GardensBuilder }] = await Promise.all([
      import('../world/CastleBuilder.js'),
      import('../world/GardensBuilder.js')
    ]);

    this.#castle = new CastleBuilder(scene, context.textures, this.#collision);
    this.#castle.init();
    this.#gardens = new GardensBuilder(scene, context.textures, this.#collision);
    this.#gardens.init();

    this.#player = new PlayerController(scene, camera, context.input, this.#collision, context.audio);
    this.#player.init({
      avatarId: context.profile.avatarId,
      outfitId: 'gala_rosa',
      hairId: 'ondas_reales',
      accessories: ['tiara']
    });

    this.#npcs = new NPCManager(scene);
    this.#npcs.init();

    this.#quests = new QuestSystem(scene, context.audio, (snapshot, msg) => {
      this.#hud.updateQuests(this.#quests.getQuestSummary());
      if (msg) this.#hud.showToast(msg);
      this.#stateSync.broadcastQuests(snapshot, msg);
    });
    this.#quests.init();

    this.#hud = new HudUI({
      peerManager: context.peerManager,
      audio: context.audio,
      callbacks: {
        onToggleWardrobe: () => this.#toggleWardrobe(),
        onCycleWorld: () => this.#cycleWorld(),
        onReturnToMenu: () => context.onReturnToMenu?.(),
        onStartMinigame: (id) => this.#launchMinigame(id),
        onSendChat: (text) => this.#sendChat(text),
        onOpenInvite: () => {
          this.#hud.openInviteModal(this.#worldId);
          this.#syncControlLock();
        },
        onCloseInvite: () => this.#syncControlLock()
      }
    });
    this.#hud.init();

    this.#wardrobe = new WardrobeUI({
      audio: context.audio,
      onChange: (partial) => this.#applyWardrobeChange(partial),
      onClose: () => this.#syncControlLock()
    });
    this.#wardrobe.init();

    this.#stateSync = new StateSync(scene, context.peerManager, {
      onPartyChange: () => this.#refreshPartyHud(),
      onToast: (msg) => this.#hud.showToast(msg),
      onChatReceived: (sender, text) => this.#hud.appendChat(sender, text),
      onRemoteQuestSync: (snap, notice) => {
        this.#quests.applySnapshot(snap);
        this.#hud.updateQuests(this.#quests.getQuestSummary());
        if (notice) this.#hud.showToast(notice);
      },
      onRemoteWorldChange: (worldId) => this.#applyWorldTheme(worldId, false)
    });
    this.#stateSync.init(() => ({
      name: this.#playerName,
      pos: this.#player.getPosition(),
      yaw: this.#player.getYaw(),
      anim: this.#player.getAnimState(),
      appearance: this.#player.getAppearance(),
      worldId: this.#worldId,
      quests: this.#quests.getSnapshot()
    }));

    this.#minigames = new MinigameManager(
      {
        scene,
        camera,
        player: this.#player,
        input: context.input,
        audio: context.audio,
        castle: this.#castle
      },
      document.getElementById('minigame-overlay')
    );
    this.#minigames.init();

    this.#bindInputActions();
    this.#applyWorldTheme(this.#worldId, false);
    this.#hud.show();
    this.#hud.updateQuests(this.#quests.getQuestSummary());
    this.#refreshPartyHud();
    this.#hud.appendChat('Palacio', `¡Bienvenida/o ${this.#playerName}! Pulsa [C] para el vestidor o [E] cerca de un personaje.`);
    context.audio.startAmbient();
  }

  #bindInputActions() {
    const input = this.#ctx.input;
    this.#unsubs.push(
      input.onAction('wardrobe', () => {
        if (!this.#minigames.isActive()) this.#toggleWardrobe();
      }),
      input.onAction('chat', () => {
        if (!this.#minigames.isActive() && !this.#wardrobe.isOpen()) {
          this.#hud.focusChat();
        }
      }),
      input.onAction('interact', () => this.#handleInteract()),
      input.onAction('escape', () => {
        if (this.#minigames.isActive()) this.#minigames.stop({ completed: false });
        else if (this.#wardrobe.isOpen()) this.#wardrobe.close();
        else if (this.#hud.isDialogueOpen()) this.#hud.hideDialogue();
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
    this.#gardens?.applyTheme(theme);
    this.#ctx.audio?.setMood(theme.musicMood);
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
    this.#hud.hideDialogue();
    this.#wardrobe.toggle(this.#player.getAppearance());
    this.#syncControlLock();
  }

  #applyWardrobeChange(partial) {
    this.#player.applyAppearance(partial);
    const full = this.#player.getAppearance();
    this.#quests.recordWardrobeUpdate(full);
    this.#stateSync.broadcastAppearance(this.#playerName, full);
  }

  #sendChat(text) {
    this.#hud.appendChat(this.#playerName, text);
    this.#stateSync.broadcastChat(this.#playerName, text);
    this.#ctx.audio?.playClick();
  }

  #refreshPartyHud() {
    this.#hud.updateParty(this.#playerName, this.#stateSync.getRemoteList());
  }

  #syncControlLock() {
    const locked = this.#wardrobe.isOpen() || this.#hud.isInviteModalOpen();
    this.#ctx.input.setControlsLocked(locked);
  }

  #handleInteract() {
    if (this.#minigames.isActive() || this.#wardrobe.isOpen()) return;
    if (this.#hud.isDialogueOpen()) {
      this.#hud.hideDialogue();
      return;
    }

    const pos = this.#player.getPosition();
    const npc = this.#npcs.getNearestNPC(pos, 4.2);
    if (npc) {
      this.#ctx.audio?.playClick();
      this.#quests.recordNpcTalk(npc.id);
      this.#hud.showDialogue(npc, (actionType) => this.#handleDialogueAction(actionType));
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
    if (actionType === 'wardrobe') {
      this.#toggleWardrobe();
    } else if (actionType?.startsWith('minigame:')) {
      this.#launchMinigame(actionType.split(':')[1]);
    }
  }

  async #launchMinigame(id) {
    if (this.#minigames.isActive()) return;
    this.#wardrobe.close();
    this.#hud.hideDialogue();
    this.#hud.setInteractPrompt(null);
    this.#ctx.audio?.playSparkle();
    await this.#minigames.start(id, (summary) => {
      this.#syncControlLock();
      if (summary?.completed) {
        this.#hud.showToast('♛ ¡Actividad real completada con éxito!');
      }
    });
  }

  onUpdate(dt) {
    this.#castle?.update(dt);
    this.#gardens?.update(dt);
    this.#player?.update(dt);

    const pos = this.#player.getPosition();
    this.#npcs?.update(dt, pos);
    this.#quests?.update(dt, pos);
    this.#stateSync?.update(dt);

    if (this.#minigames.isActive()) {
      this.#minigames.update(dt);
      return;
    }

    // Actualizar brújula, zona actual, minimapa y prompt contextual
    this.#hud.updateCompass(this.#player.getCameraYaw());
    this.#hud.setZoneName(this.#collision.getZoneName(pos));
    this.#hud.drawMinimap(
      pos,
      this.#player.getYaw(),
      this.#stateSync.getRemoteList(),
      this.#quests.getUncollectedGemPositions()
    );

    const nearNpc = this.#npcs.getNearestNPC(pos, 4.2);
    if (nearNpc) {
      this.#currentHotspot = null;
      this.#hud.setInteractPrompt(`Hablar con ${nearNpc.name}`);
      return;
    }

    let found = null;
    for (const hs of this.#hotspots) {
      if (pos.distanceTo(hs.pos) <= hs.radius) {
        found = hs;
        break;
      }
    }
    this.#currentHotspot = found;
    this.#hud.setInteractPrompt(found ? found.label : null);
  }

  onDispose() {
    for (const u of this.#unsubs) u();
    this.#unsubs.length = 0;

    this.#minigames?.dispose();
    this.#wardrobe?.dispose();
    this.#hud?.dispose();
    this.#stateSync?.dispose();
    this.#quests?.dispose();
    this.#npcs?.dispose();
    this.#player?.dispose();
    this.#castle?.dispose();
    this.#gardens?.dispose();
    this.#collision?.dispose();
    this.#ctx?.input?.setControlsLocked(false);
  }
}
