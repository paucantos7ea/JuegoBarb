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
  #cameraOverride = false;
  #unsubJump = null;
  #desiredCamPos = new THREE.Vector3();
  #desiredLookAt = new THREE.Vector3();
  #horseSystem = null;
  #mountedHorse = null;
  #horseAnim = 'idle';
  #horseSpeedRatio = 0;
  #camDistExtra = 0;
  #camHeightExtra = 0;
  #mountSeat = null;
  #mountInfo = { v: 'imperial_white', a: 'idle' };

  constructor(scene, camera, inputManager, collisionSystem, audioManager, textureFactory = null) {
    this.#scene = scene;
    this.#camera = camera;
    this.#input = inputManager;
    this.#collision = collisionSystem;
    this.#audio = audioManager;
    this.#textures = textureFactory;
  }

  init(initialAppearance) {
    this.#rig = new CharacterRig(initialAppearance, this.#textures);
    const root = this.#rig.init();
    root.userData.isCharacter = true;
    root.position.copy(this.#position);
    root.rotation.y = this.#facingYaw;
    this.#scene.add(root);

    this.#unsubJump = this.#input.onAction('jump', () => {
      if (!this.#externalControl && this.#isGrounded) {
        if (this.#mountedHorse) {
          this.#velocityY = 8.8;
          this.#isGrounded = false;
          this.#audio?.playJump?.();
        } else {
          this.#velocityY = 7.4;
          this.#isGrounded = false;
          this.#audio?.playJump();
        }
      }
    });
  }

  setHorseSystem(horseSystem) {
    this.#horseSystem = horseSystem || null;
  }

  isMounted() {
    return Boolean(this.#mountedHorse);
  }

  getMountedHorse() {
    return this.#mountedHorse;
  }

  getMountInfo() {
    if (!this.#mountedHorse) return null;
    this.#mountInfo.v = this.#mountedHorse.variantId;
    this.#mountInfo.a = this.#horseAnim;
    return this.#mountInfo;
  }

  mountHorse(horse) {
    if (!horse || !this.#horseSystem) return false;
    if (this.#mountedHorse) this.dismountHorse();
    this.#horseSystem.mountHorse(horse);
    this.#mountedHorse = horse;
    this.#position.set(horse.x, horse.y, horse.z);
    this.#facingYaw = horse.yaw;
    this.#velocityY = 0;
    this.#isGrounded = true;
    this.#horseAnim = 'idle';
    this.#horseSpeedRatio = 0;
    this.#rig?.cancelEmote();
    return true;
  }

  dismountHorse() {
    if (!this.#mountedHorse) return false;
    const exitPos = this.#horseSystem.dismountHorse(this.#mountedHorse);
    this.#mountedHorse = null;
    this.#horseAnim = 'idle';
    this.#horseSpeedRatio = 0;
    this.#mountSeat = null;
    this.#position.set(exitPos.x, exitPos.y, exitPos.z);
    if (this.#rig) {
      const root = this.#rig.getRoot();
      root.position.copy(this.#position);
      root.rotation.y = this.#facingYaw;
      this.#rig.resetMotion();
    }
    return true;
  }

  setExternalControl(active) {
    this.#externalControl = Boolean(active);
    if (this.#externalControl) this.#rig?.cancelEmote();
  }

  /** Pausa el posicionamiento de cámara en tercera persona mientras WardrobeCamera dirige el plano. */
  setCameraOverride(active) {
    this.#cameraOverride = Boolean(active);
  }

  setAnimState(state) {
    this.#animState = state;
  }

  setFacingYaw(yaw) {
    if (!Number.isFinite(yaw)) return;
    this.#facingYaw = yaw;
    if (this.#rig) {
      this.#rig.getRoot().rotation.y = this.#facingYaw;
    }
  }

  teleport(x, y, z, yaw = null) {
    if (this.#mountedHorse) this.dismountHorse();
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
      this.#rig.resetMotion();
    }
  }

  /** Emotes [1-4]: solo con el personaje en el suelo, desmontado y fuera de minijuegos. */
  playEmote(id, { silent = false } = {}) {
    if (!this.#rig || this.#externalControl || !this.#isGrounded || this.#mountedHorse) return false;
    const ok = this.#rig.playEmote(id);
    if (ok && !silent) this.#audio?.playSparkle();
    return ok;
  }

  getEmote() {
    return this.#rig?.getEmote() ?? null;
  }

  applyAppearance(appearance) {
    this.#rig?.applyAppearance(appearance);
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

  /** Calcula la posición y punto de mira deseados de la cámara en tercera persona. */
  getThirdPersonCameraPose(outPos, outLookAt) {
    const groundY = this.#collision.getGroundHeight(this.#position.x, this.#position.z, this.#position.y, 1.15);
    const targetX = this.#position.x;
    const targetY = this.#position.y + 1.55 + this.#camHeightExtra;
    const targetZ = this.#position.z;

    const camDist = this.#cameraDistance + this.#camDistExtra;
    const horizDist = Math.cos(this.#cameraPitch) * camDist;
    const camX = targetX + Math.sin(this.#cameraYaw) * horizDist;
    const camY = Math.max(groundY + 0.65, targetY + Math.sin(this.#cameraPitch) * camDist);
    const camZ = targetZ + Math.cos(this.#cameraYaw) * horizDist;

    outPos.set(camX, camY, camZ);
    outLookAt.set(targetX, targetY, targetZ);
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

    // Suavizado de distancia y altura extra de cámara al montar
    const camAlpha = 1 - Math.exp(-dt * 6);
    this.#camDistExtra += ((this.#mountedHorse ? 2.6 : 0) - this.#camDistExtra) * camAlpha;
    this.#camHeightExtra += ((this.#mountedHorse ? 0.72 : 0) - this.#camHeightExtra) * camAlpha;

    // Movimiento relativo a la cámara
    const mounted = Boolean(this.#mountedHorse);
    const move = this.#input.getMoveVector();
    const isMoving = move.x !== 0 || move.z !== 0;
    const isSprinting = this.#input.isSprinting();
    const speed = mounted ? (isSprinting ? 18.5 : 11.5) : (isSprinting ? 10.6 : 6.4);

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
      this.#facingYaw += diff * Math.min(1, dt * (mounted ? 7.5 : 12));
    }

    // Colisiones horizontales
    if (mounted) {
      this.#collision.resolveHorizontal(this.#position, 0.68, 2.1);
    } else {
      this.#collision.resolveHorizontal(this.#position, 0.42, 1.75);
    }

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

    // Estado de animación y modelo 3D
    const root = this.#rig.getRoot();
    if (mounted) {
      const horseAnim = !this.#isGrounded ? 'jump' : isMoving ? (isSprinting ? 'run' : 'walk') : 'idle';
      const speedRatio = isMoving ? (isSprinting ? 1.0 : 0.55) : 0;
      this.#horseAnim = horseAnim;
      this.#horseSpeedRatio = speedRatio;

      const seat = this.#horseSystem.syncMountedHorse(
        this.#mountedHorse,
        this.#position,
        this.#facingYaw,
        horseAnim,
        speedRatio,
        dt
      );
      this.#mountSeat = seat;

      const sinY = Math.sin(this.#facingYaw);
      const cosY = Math.cos(this.#facingYaw);
      root.position.set(
        this.#position.x + sinY * seat.seatZ,
        this.#position.y + seat.seatY + seat.bounceY,
        this.#position.z + cosY * seat.seatZ
      );
      root.rotation.y = this.#facingYaw;
      this.#animState = 'riding';
      this.#rig.update(dt, 'riding', isMoving ? speed : 0);
    } else {
      if (!this.#isGrounded) {
        this.#animState = 'jump';
      } else if (isMoving) {
        this.#animState = isSprinting ? 'run' : 'walk';
      } else {
        this.#animState = 'idle';
      }

      root.position.copy(this.#position);
      root.rotation.y = this.#facingYaw;
      this.#rig.update(dt, this.#animState, isMoving ? speed : 0);
    }

    // Actualizar cámara en tercera persona salvo cuando el Vestidor dirige el plano
    if (!this.#cameraOverride) {
      this.getThirdPersonCameraPose(this.#desiredCamPos, this.#desiredLookAt);
      this.#camera.position.lerp(this.#desiredCamPos, Math.min(1, dt * 10));
      this.#camera.lookAt(this.#desiredLookAt);
    }
  }

  dispose() {
    this.#mountedHorse = null;
    this.#horseSystem = null;
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
