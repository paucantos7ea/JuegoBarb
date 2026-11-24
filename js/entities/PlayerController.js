import * as THREE from 'three';
import { CharacterRig } from './CharacterRig.js';

export class PlayerController {
  #scene;
  #camera;
  #input;
  #collision;
  #audio;
  #textures;
  #rig = null;
  #position = new THREE.Vector3(0, 0, 15);
  #velocityY = 0;
  #isGrounded = true;
  #facingYaw = Math.PI; // Mirando hacia -Z (Castillo)
  #cameraYaw = 0;
  #cameraPitch = 0.34;
  #cameraDistance = 7.8;
  #animState = 'idle';
  #externalControl = false;
  #unsubJump = null;
  #desiredCamPos = new THREE.Vector3();

  constructor(scene, camera, inputManager, collisionSystem, audioSynth, textureFactory = null) {
    this.#scene = scene;
    this.#camera = camera;
    this.#input = inputManager;
    this.#collision = collisionSystem;
    this.#audio = audioSynth;
    this.#textures = textureFactory;
  }

  init(initialAppearance) {
    this.#rig = new CharacterRig(initialAppearance, this.#textures);
    const root = this.#rig.init();
    root.position.copy(this.#position);
    root.rotation.y = this.#facingYaw;
    this.#scene.add(root);

    this.#unsubJump = this.#input.onAction('jump', () => {
      if (!this.#externalControl && this.#isGrounded) {
        this.#velocityY = 7.4;
        this.#isGrounded = false;
        this.#audio?.playJump();
      }
    });
  }

  setExternalControl(active) {
    this.#externalControl = Boolean(active);
  }

  setAnimState(state) {
    this.#animState = state;
  }

  teleport(x, y, z, yaw = null) {
    this.#position.set(x, y, z);
    this.#velocityY = 0;
    this.#isGrounded = true;
    if (yaw !== null) {
      this.#facingYaw = yaw;
      this.#cameraYaw = yaw + Math.PI;
    }
    if (this.#rig) {
      this.#rig.getRoot().position.copy(this.#position);
      this.#rig.getRoot().rotation.y = this.#facingYaw;
    }
  }

  applyAppearance(appearance) {
    this.#rig?.applyAppearance(appearance);
  }

  /** @returns {Promise<boolean>} true si el modelo .glb solicitado está montado. */
  whenModelReady() {
    return this.#rig?.whenModelReady() ?? Promise.resolve(false);
  }

  getAppearance() {
    return this.#rig?.getAppearance();
  }

  getPosition() {
    return this.#position;
  }

  getYaw() {
    return this.#facingYaw;
  }

  getCameraYaw() {
    return this.#cameraYaw;
  }

  getAnimState() {
    return this.#animState;
  }

  getRig() {
    return this.#rig;
  }

  update(dt) {
    if (!this.#rig) return;

    if (this.#externalControl) {
      this.#input.consumeLookDelta();
      this.#rig.getRoot().position.copy(this.#position);
      this.#rig.getRoot().rotation.y = this.#facingYaw;
      this.#rig.update(dt, this.#animState, 0);
      return;
    }

    // Cámara orbital fluida con Pointer Lock o arrastre + teclado
    const look = this.#input.consumeLookDelta();
    const yawSens = look.pointerLocked ? 0.0028 : 0.005;
    const pitchSens = look.pointerLocked ? 0.0022 : 0.004;
    this.#cameraYaw -= look.x * yawSens;
    this.#cameraYaw += this.#input.getCameraKeyTurn() * dt * 2.1;
    this.#cameraPitch = Math.max(0.08, Math.min(1.12, this.#cameraPitch + look.y * pitchSens));
    this.#cameraDistance = Math.max(4.4, Math.min(13.5, this.#cameraDistance + look.zoom));

    // Movimiento relativo a la cámara
    const move = this.#input.getMoveVector();
    const isMoving = move.x !== 0 || move.z !== 0;
    const isSprinting = this.#input.isSprinting();
    const speed = isSprinting ? 10.6 : 6.4;

    if (isMoving) {
      const len = Math.hypot(move.x, move.z) || 1;
      const mx = move.x / len;
      const mz = move.z / len;

      const forwardX = -Math.sin(this.#cameraYaw);
      const forwardZ = -Math.cos(this.#cameraYaw);
      const rightX = Math.cos(this.#cameraYaw);
      const rightZ = -Math.sin(this.#cameraYaw);

      const dirX = forwardX * mz + rightX * mx;
      const dirZ = forwardZ * mz + rightZ * mx;

      this.#position.x += dirX * speed * dt;
      this.#position.z += dirZ * speed * dt;

      const targetYaw = Math.atan2(dirX, dirZ);
      let diff = targetYaw - this.#facingYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.#facingYaw += diff * Math.min(1, dt * 12);
    }

    // Colisiones horizontales
    this.#collision.resolveHorizontal(this.#position, 0.42, 1.75);

    // Física vertical + escaleras/suelos
    const groundY = this.#collision.getGroundHeight(this.#position.x, this.#position.z, this.#position.y, 1.15);
    this.#velocityY -= 19.5 * dt;
    this.#position.y += this.#velocityY * dt;

    if (this.#position.y <= groundY) {
      this.#position.y = groundY;
      this.#velocityY = 0;
      this.#isGrounded = true;
    } else if (this.#position.y - groundY < 0.24 && this.#velocityY <= 0) {
      // Pegado suave al bajar escaleras
      this.#position.y = groundY;
      this.#velocityY = 0;
      this.#isGrounded = true;
    } else {
      this.#isGrounded = false;
    }

    // Estado de animación
    if (!this.#isGrounded) {
      this.#animState = 'jump';
    } else if (isMoving) {
      this.#animState = isSprinting ? 'run' : 'walk';
    } else {
      this.#animState = 'idle';
    }

    // Actualizar modelo 3D
    const root = this.#rig.getRoot();
    root.position.copy(this.#position);
    root.rotation.y = this.#facingYaw;
    this.#rig.update(dt, this.#animState, isMoving ? speed : 0);

    // Actualizar cámara en tercera persona
    const targetX = this.#position.x;
    const targetY = this.#position.y + 1.55;
    const targetZ = this.#position.z;

    const horizDist = Math.cos(this.#cameraPitch) * this.#cameraDistance;
    const camX = targetX + Math.sin(this.#cameraYaw) * horizDist;
    const camY = Math.max(groundY + 0.65, targetY + Math.sin(this.#cameraPitch) * this.#cameraDistance);
    const camZ = targetZ + Math.cos(this.#cameraYaw) * horizDist;

    this.#desiredCamPos.set(camX, camY, camZ);
    this.#camera.position.lerp(this.#desiredCamPos, Math.min(1, dt * 10));
    this.#camera.lookAt(targetX, targetY, targetZ);
  }

  dispose() {
    if (this.#unsubJump) {
      this.#unsubJump();
      this.#unsubJump = null;
    }
    if (this.#rig) {
      this.#scene.remove(this.#rig.getRoot());
      this.#rig.dispose();
      this.#rig = null;
    }
  }
}
