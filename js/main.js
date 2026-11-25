import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { InputManager } from './core/InputManager.js';
import { AudioManager } from './core/AudioManager.js';
import { TextureFactory } from './core/TextureFactory.js';
import { PwaManager } from './core/PwaManager.js';
import { CoopExploreMode } from './core/CoopExploreMode.js';
import { PeerManager } from './net/PeerManager.js';
import { WorldThemes } from './world/WorldThemes.js';
import { CollisionSystem } from './world/CollisionSystem.js';
import { MenuUI } from './ui/MenuUI.js';

class ReinoRosaApp {
  #engine = null;
  #input = null;
  #audio = null;
  #textures = null;
  #pwa = null;
  #peerManager = null;
  #worldThemes = null;
  #session = null;
  #menuUI = null;
  #preview = null;
  #inGame = false;
  #orbitAngle = 0.22;
  #previewFocus = new THREE.Vector3(0, 0, -20);
  #lastFrameTime = 0;
  #rafId = null;

  async init() {
    this.#engine = new Engine(document.getElementById('canvas-container'));
    this.#textures = new TextureFactory();
    this.#audio = new AudioManager();
    this.#pwa = new PwaManager();
    this.#worldThemes = new WorldThemes();
    this.#peerManager = new PeerManager();

    this.#engine.init();
    this.#input = new InputManager(this.#engine.getDomElement());
    [this.#textures, this.#input, this.#audio, this.#pwa, this.#worldThemes, this.#peerManager].forEach((m) => m.init());

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

    await this.#loadMenuPreview('gala_imperial');
    this.#lastFrameTime = performance.now();
    this.#loop(this.#lastFrameTime);
  }

  async #loadMenuPreview(worldId) {
    this.#disposeMenuPreview();
    const scene = this.#engine.getScene();
    const dummyCol = new CollisionSystem();
    dummyCol.init();
    const [{ CastleBuilder }, { WorldDecor }, { ArenaBuilder }, { FaunaSystem }, { CasinoDomeBuilder }] = await Promise.all([
      import('./world/CastleBuilder.js'),
      import('./world/WorldDecor.js'),
      import('./world/ArenaBuilder.js'),
      import('./world/FaunaSystem.js'),
      import('./world/CasinoDomeBuilder.js')
    ]);
    const castle = new CastleBuilder(scene, this.#textures, dummyCol);
    const decor = new WorldDecor(scene, this.#textures, dummyCol);
    const arena = new ArenaBuilder(scene, this.#textures, dummyCol);
    const fauna = new FaunaSystem(scene);
    const casinoDome = new CasinoDomeBuilder(scene, this.#textures, dummyCol);
    castle.init();
    decor.init();
    arena.init();
    fauna.init();
    fauna.setWaterSystem?.(decor.getWaterSystem?.());
    casinoDome.init();
    this.#preview = { castle, decor, arena, fauna, casinoDome, dummyCol };
    this.#applyPreviewTheme(worldId);
  }

  #applyPreviewTheme(worldId) {
    const theme = this.#worldThemes.getById(worldId);
    this.#engine.applyTheme(theme);
    this.#preview?.castle?.applyTheme(theme);
    this.#preview?.decor?.applyTheme(theme);
    this.#preview?.fauna?.applyTheme?.(theme);
    this.#preview?.arena?.applyTheme(theme);
    this.#preview?.casinoDome?.applyTheme(theme);
  }

  #disposeMenuPreview() {
    if (!this.#preview) return;
    this.#preview.castle.dispose();
    this.#preview.decor.dispose();
    this.#preview.arena.dispose();
    this.#preview.fauna.dispose();
    this.#preview.casinoDome?.dispose();
    this.#preview.dummyCol.dispose();
    this.#preview = null;
  }

  async #startGame(profile) {
    if (this.#inGame) return;
    this.#inGame = true;
    this.#menuUI.hide();
    this.#disposeMenuPreview();
    try {
      this.#session?.dispose();
      this.#session = new CoopExploreMode();
      await this.#session.init({
        profile,
        engine: this.#engine,
        input: this.#input,
        audio: this.#audio,
        textures: this.#textures,
        peerManager: this.#peerManager,
        worldThemes: this.#worldThemes,
        onReturnToMenu: () => this.#returnToMenu()
      });
    } catch (err) {
      console.error('[ReinoRosa] Error al iniciar la partida:', err);
      await this.#returnToMenu();
    }
  }

  async #returnToMenu() {
    this.#inGame = false;
    this.#session?.dispose();
    this.#session = null;
    await this.#loadMenuPreview(this.#menuUI.getProfile().worldId);
    this.#menuUI.show();
  }

  #loop(now) {
    this.#rafId = requestAnimationFrame((t) => this.#loop(t));
    const dt = Math.min(0.05, Math.max(0.001, (now - this.#lastFrameTime) / 1000));
    this.#lastFrameTime = now;
    this.#engine.update(dt);
    if (this.#inGame) {
      this.#session?.update(dt);
    } else {
      this.#orbitAngle += dt * 0.14;
      const cam = this.#engine.getCamera();
      cam.position.set(
        Math.sin(this.#orbitAngle) * 38,
        9.5 + Math.sin(this.#orbitAngle * 1.5) * 1.8,
        Math.cos(this.#orbitAngle) * 38 - 6
      );
      cam.lookAt(0, 14.5, -36);
      this.#engine.updateShadowTarget(this.#previewFocus);
      this.#preview?.castle?.update(dt);
      this.#preview?.decor?.update(dt);
      this.#preview?.arena?.update(dt);
      this.#preview?.casinoDome?.update(dt);
      this.#preview?.fauna?.update(dt, this.#engine.getElapsed());
    }
    this.#engine.render();
  }

  dispose() {
    if (this.#rafId) cancelAnimationFrame(this.#rafId);
    this.#disposeMenuPreview();
    [this.#session, this.#menuUI, this.#peerManager, this.#pwa, this.#audio, this.#input, this.#textures, this.#engine].forEach((m) => m?.dispose());
  }
}

window.addEventListener('DOMContentLoaded', () => new ReinoRosaApp().init());
