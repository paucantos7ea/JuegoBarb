import { Engine } from './core/Engine.js';
import { InputManager } from './core/InputManager.js';
import { AudioSynthesizer } from './core/AudioSynthesizer.js';
import { TextureFactory } from './core/TextureFactory.js';
import { PwaManager } from './core/PwaManager.js';
import { PeerManager } from './network/PeerManager.js';
import { WorldThemes } from './world/WorldThemes.js';
import { CollisionSystem } from './world/CollisionSystem.js';
import { GameModeManager } from './modes/GameModeManager.js';
import { CoopExploreMode } from './modes/CoopExploreMode.js';
import { MenuUI } from './ui/MenuUI.js';

class ReinoRosaApp {
  #engine = null;
  #input = null;
  #audio = null;
  #textures = null;
  #pwa = null;
  #peerManager = null;
  #worldThemes = null;
  #modeManager = null;
  #menuUI = null;
  #preview = null;
  #inGame = false;
  #orbitAngle = 0.55;
  #lastFrameTime = 0;
  #rafId = null;

  async init() {
    this.#engine = new Engine(document.getElementById('canvas-container'));
    this.#textures = new TextureFactory();
    this.#audio = new AudioSynthesizer();
    this.#pwa = new PwaManager();
    this.#worldThemes = new WorldThemes();
    this.#peerManager = new PeerManager();
    this.#modeManager = new GameModeManager();
    this.#engine.init();
    this.#input = new InputManager(this.#engine.getDomElement());
    [this.#textures, this.#input, this.#audio, this.#pwa, this.#worldThemes, this.#peerManager, this.#modeManager].forEach((m) => m.init());
    this.#modeManager.register('coop_explore', () => new CoopExploreMode());

    this.#menuUI = new MenuUI({
      peerManager: this.#peerManager,
      worldThemes: this.#worldThemes,
      audio: this.#audio,
      callbacks: {
        onPreviewWorld: (id) => this.#applyPreviewTheme(id),
        onStartGame: (profile) => this.#startGame(profile)
      }
    });
    this.#menuUI.init();

    this.#peerManager.on('message', ({ packet }) => {
      if (!this.#inGame && packet?.type === 'start_game') {
        const profile = this.#menuUI.getProfile();
        profile.worldId = packet.worldId || profile.worldId;
        this.#startGame(profile);
      }
    });

    await this.#loadMenuPreview('palacio_cristal');
    this.#lastFrameTime = performance.now();
    this.#loop(this.#lastFrameTime);
  }

  async #loadMenuPreview(worldId) {
    this.#disposeMenuPreview();
    const scene = this.#engine.getScene();
    const dummyCol = new CollisionSystem();
    dummyCol.init();
    const [{ CastleBuilder }, { GardensBuilder }] = await Promise.all([
      import('./world/CastleBuilder.js'),
      import('./world/GardensBuilder.js')
    ]);
    const castle = new CastleBuilder(scene, this.#textures, dummyCol);
    const gardens = new GardensBuilder(scene, this.#textures, dummyCol);
    castle.init();
    gardens.init();
    this.#preview = { castle, gardens, dummyCol };
    this.#applyPreviewTheme(worldId);
  }

  #applyPreviewTheme(worldId) {
    const theme = this.#worldThemes.getById(worldId);
    this.#engine.applyTheme(theme);
    this.#preview?.castle?.applyTheme(theme);
    this.#preview?.gardens?.applyTheme(theme);
    this.#audio.setMood(theme.musicMood);
  }

  #disposeMenuPreview() {
    if (!this.#preview) return;
    this.#preview.castle.dispose();
    this.#preview.gardens.dispose();
    this.#preview.dummyCol.dispose();
    this.#preview = null;
  }

  async #startGame(profile) {
    if (this.#inGame) return;
    this.#inGame = true;
    this.#menuUI.hide();
    this.#disposeMenuPreview();
    try {
      await this.#modeManager.switchMode('coop_explore', {
        profile, engine: this.#engine, input: this.#input, audio: this.#audio,
        textures: this.#textures, peerManager: this.#peerManager,
        worldThemes: this.#worldThemes, onReturnToMenu: () => this.#returnToMenu()
      });
    } catch (err) {
      console.error('[ReinoRosa] Error al iniciar la partida:', err);
      await this.#returnToMenu();
    }
  }

  async #returnToMenu() {
    this.#inGame = false;
    this.#modeManager.dispose();
    this.#modeManager.register('coop_explore', () => new CoopExploreMode());
    this.#audio.stopAmbient();
    await this.#loadMenuPreview(this.#menuUI.getProfile().worldId);
    this.#menuUI.show();
  }

  #loop(now) {
    this.#rafId = requestAnimationFrame((t) => this.#loop(t));
    const dt = Math.min(0.05, Math.max(0.001, (now - this.#lastFrameTime) / 1000));
    this.#lastFrameTime = now;
    this.#engine.update(dt);
    this.#audio.update(dt);
    if (this.#inGame) {
      this.#modeManager.update(dt);
    } else {
      this.#orbitAngle += dt * 0.14;
      const cam = this.#engine.getCamera();
      cam.position.set(Math.sin(this.#orbitAngle) * 34, 15.5 + Math.sin(this.#orbitAngle * 1.5) * 2.0, Math.cos(this.#orbitAngle) * 32 - 10);
      cam.lookAt(0, 7.5, -24);
      this.#preview?.castle?.update(dt);
      this.#preview?.gardens?.update(dt);
    }
    this.#engine.render();
  }

  dispose() {
    if (this.#rafId) cancelAnimationFrame(this.#rafId);
    this.#disposeMenuPreview();
    [this.#modeManager, this.#menuUI, this.#peerManager, this.#pwa, this.#audio, this.#input, this.#textures, this.#engine].forEach((m) => m?.dispose());
  }
}

window.addEventListener('DOMContentLoaded', () => new ReinoRosaApp().init());
