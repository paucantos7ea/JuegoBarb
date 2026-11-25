import * as THREE from 'three';
import { CharacterRig } from './CharacterRig.js';
import { createContactShadow } from '../core/Engine.js';

export class PlayerController {
  #scene;
  #camera;
  #input;
  #collision;
  #audio;
  #textures;
  #rig = null;
  #contactShadow = null;
  #waterSystem = null;
  #waterPhys = { inWater: false, speedScale: 1.0, pushX: 0, pushZ: 0, surfaceY: 0 };
  #position = new THREE.Vector3(0, 0, 15);
  #velocityY = 0;
  #isGrounded = true;
  #facingYaw = Math.PI; // Mirando hacia -Z (Castillo)
  #cameraYaw = 0;
  #cameraPitch = -0.09;
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

    this.#contactShadow = createContactShadow(0.72, 0.48);
    this.#contactShadow.position.set(this.#position.x, 0.025, this.#position.z);
    this.#scene.add(this.#contactShadow);

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

  setWaterSystem(waterSystem) {
    this.#waterSystem = waterSystem || null;
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
    this.#rig?.setRidingMode(true, horse.model?.mount ?? null);
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
      root.rotation.set(0, this.#facingYaw, 0);
      this.#rig.setRidingMode(false);
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
    let groundY = this.#collision.getGroundHeight(this.#position.x, this.#position.z, this.#position.y, 1.15);
    if (this.#waterSystem) {
      const bridgeY = this.#waterSystem.getBridgeHeightAt(this.#position.x, this.#position.z);
      if (bridgeY !== null && bridgeY <= this.#position.y + 1.15 && bridgeY > groundY) {
        groundY = bridgeY;
      }
    }
    const targetX = this.#position.x;
    const targetY = this.#position.y + 1.85 + this.#camHeightExtra;
    const targetZ = this.#position.z;

    const camDist = this.#cameraDistance + this.#camDistExtra;
    const horizDist = Math.cos(this.#cameraPitch) * camDist;
    const camX = targetX + Math.sin(this.#cameraYaw) * horizDist;
    const camY = Math.max(groundY + 0.85, targetY + Math.sin(this.#cameraPitch) * camDist);
    const camZ = targetZ + Math.cos(this.#cameraYaw) * horizDist;
    const lookUpBoost = Math.max(0, -this.#cameraPitch) * 3.2;

    outPos.set(camX, camY, camZ);
    outLookAt.set(targetX, targetY + lookUpBoost, targetZ);
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
    this.#cameraPitch = Math.max(-0.40, Math.min(1.12, this.#cameraPitch + look.y * pitchSens));
    this.#cameraDistance = Math.max(4.4, Math.min(13.5, this.#cameraDistance + look.zoom));

    // Suavizado de distancia y altura extra de cámara al montar
    const camAlpha = 1 - Math.exp(-dt * 6);
    this.#camDistExtra += ((this.#mountedHorse ? 2.6 : 0) - this.#camDistExtra) * camAlpha;
    this.#camHeightExtra += ((this.#mountedHorse ? 0.72 : 0) - this.#camHeightExtra) * camAlpha;

    // Movimiento relativo a la cámara + física del agua
    const mounted = Boolean(this.#mountedHorse);
    const move = this.#input.getMoveVector();
    const isMoving = move.x !== 0 || move.z !== 0;
    const isSprinting = this.#input.isSprinting();
    const baseSpeed = mounted ? (isSprinting ? 18.5 : 11.5) : (isSprinting ? 10.6 : 6.4);

    if (this.#waterSystem) {
      this.#waterSystem.applyPlayerWaterPhysics(this.#position, isMoving, mounted, dt, this.#waterPhys);
    } else {
      this.#waterPhys.inWater = false;
      this.#waterPhys.speedScale = 1.0;
      this.#waterPhys.pushX = 0;
      this.#waterPhys.pushZ = 0;
    }

    const speed = baseSpeed * this.#waterPhys.speedScale;

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

    if (this.#waterPhys.inWater) {
      this.#position.x += this.#waterPhys.pushX;
      this.#position.z += this.#waterPhys.pushZ;
    }

    // Colisiones horizontales
    if (mounted) {
      this.#collision.resolveHorizontal(this.#position, 0.68, 2.1);
    } else {
      this.#collision.resolveHorizontal(this.#position, 0.42, 1.75);
    }

    // Física vertical + escaleras/suelos + puentes barrocos exactos
    let groundY = this.#collision.getGroundHeight(this.#position.x, this.#position.z, this.#position.y, 1.15);
    let onBridge = false;
    if (this.#waterSystem) {
      const bridgeY = this.#waterSystem.getBridgeHeightAt(this.#position.x, this.#position.z);
      if (bridgeY !== null && bridgeY <= this.#position.y + 1.15 && bridgeY >= groundY) {
        groundY = bridgeY;
        onBridge = true;
      }
    }
    if (this.#waterPhys.inWater && !onBridge && groundY <= 0.001) {
      groundY = -0.18;
    }

    this.#velocityY -= 19.5 * dt;
    this.#position.y += this.#velocityY * dt;

    if (this.#position.y <= groundY) {
      this.#position.y = groundY;
      this.#velocityY = 0;
      this.#isGrounded = true;
    } else if (this.#position.y - groundY < 0.24 && this.#velocityY <= 0) {
      // Pegado suave al bajar escaleras o arco de puente
      this.#position.y = groundY;
      this.#velocityY = 0;
      this.#isGrounded = true;
    } else {
      this.#isGrounded = false;
    }

    // Sombra de contacto pegada al suelo/puente (100% GC-Free)
    if (this.#contactShadow) {
      const heightAbove = Math.max(0, this.#position.y - groundY);
      const shadowScale = (mounted ? 1.45 : 1.0) * Math.max(0.45, 1.0 - heightAbove * 0.14);
      this.#contactShadow.position.set(this.#position.x, groundY + 0.025, this.#position.z);
      this.#contactShadow.scale.setScalar(shadowScale);
      this.#contactShadow.material.opacity = 0.48 * Math.max(0.25, 1.0 - heightAbove * 0.22);
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

      // Pelvis exactamente sobre el asiento (rebote, cabeceo y banking del caballo incluidos)
      this.#horseSystem.placeRider(this.#mountedHorse, root);
      this.#animState = 'riding';
      this.#rig.setRidingMode(true, seat);
      this.#rig.update(dt, 'riding', isMoving ? speed : 0);
      this.#horseSystem.updateReins(this.#mountedHorse, this.#rig);
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
    this.#waterSystem = null;
    if (this.#unsubJump) {
      this.#unsubJump();
      this.#unsubJump = null;
    }
    if (this.#contactShadow) {
      this.#scene.remove(this.#contactShadow);
      this.#contactShadow.geometry?.dispose();
      this.#contactShadow.material?.dispose();
      this.#contactShadow = null;
    }
    if (this.#rig) {
      this.#scene.remove(this.#rig.getRoot());
      this.#rig.dispose();
      this.#rig = null;
    }
  }
}
