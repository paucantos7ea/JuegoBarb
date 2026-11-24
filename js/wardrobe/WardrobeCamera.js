import * as THREE from 'three';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Cámara cinemática dedicada al Vestidor Real en tiempo real:
 * - Se coloca con interpolación fluida frente al personaje encuadrándolo de cuerpo entero
 *   en el lado libre derecho de la pantalla (dejando ~36% izquierdo para el panel).
 * - Evita colisiones con muros eligiendo el ángulo más despejado si el jugador está pegado a una pared.
 * - Permite girar al personaje 360° suavemente (arrastre de ratón o botones ⟲ / ⟳).
 * - Al cerrar el vestidor, devuelve la cámara con transición fluida a tercera persona.
 */
export class WardrobeCamera {
  #camera;
  #player;
  #collision;

  #state = 'inactive'; // 'inactive' | 'active' | 'exiting'
  #framingAngle = 0;   // Dirección desde el personaje hacia la cámara
  #targetYaw = 0;      // Yaw deseado del personaje (frente a la cámara + giro del usuario)
  #currentYaw = 0;
  #savedYaw = 0;
  #distance = 3.25;
  #exitElapsed = 0;

  #currentLookAt = new THREE.Vector3();
  #desiredCamPos = new THREE.Vector3();
  #desiredLookAt = new THREE.Vector3();
  #tmpDir = new THREE.Vector3();
  #exitPose = {
    position: new THREE.Vector3(),
    lookAt: new THREE.Vector3()
  };

  constructor(camera, playerController, collisionSystem = null) {
    this.#camera = camera;
    this.#player = playerController;
    this.#collision = collisionSystem;
  }

  isActive() {
    return this.#state === 'active';
  }

  isControllingCamera() {
    return this.#state !== 'inactive';
  }

  /** Abre el enfoque de probador frente al personaje. */
  enter() {
    if (!this.#camera || !this.#player) return;

    const pos = this.#player.getPosition();
    this.#savedYaw = this.#player.getYaw();
    this.#currentYaw = this.#savedYaw;

    // Capturar hacia dónde mira actualmente la cámara para interpolar sin saltos
    if (this.#state === 'inactive') {
      this.#camera.getWorldDirection(this.#tmpDir);
      const dist = Math.max(2, this.#camera.position.distanceTo(pos));
      this.#currentLookAt.copy(this.#camera.position).addScaledVector(this.#tmpDir, dist);
    }

    // Elegir ángulo despejado preferentemente de frente al personaje
    this.#framingAngle = this.#pickClearFramingAngle(pos, this.#savedYaw);
    this.#targetYaw = this.#framingAngle;
    this.#state = 'active';
    this.#exitElapsed = 0;
  }

  /** Inicia la transición suave de regreso a la cámara en tercera persona. */
  exit() {
    if (this.#state === 'inactive') return;
    this.#state = 'exiting';
    this.#exitElapsed = 0;
    this.#player?.setFacingYaw?.(this.#currentYaw);
  }

  /** Restaura al personaje mirando directamente hacia la cámara del probador. */
  resetRotation() {
    if (this.#state !== 'active') return;
    this.#targetYaw = this.#framingAngle;
  }

  /** Gira al personaje en el probador (radianes; positivo = sentido antihorario visto desde arriba). */
  rotateCharacter(deltaRadians) {
    if (this.#state !== 'active') return;
    this.#targetYaw = wrapAngle(this.#targetYaw + deltaRadians);
  }

  #pickClearFramingAngle(playerPos, preferredYaw) {
    if (!this.#collision?.isPointBlocked) {
      return preferredYaw;
    }
    const candidates = [0, 0.55, -0.55, 1.15, -1.15, Math.PI * 0.5, -Math.PI * 0.5, Math.PI * 0.78, -Math.PI * 0.78, Math.PI];
    for (const offset of candidates) {
      const ang = wrapAngle(preferredYaw + offset);
      if (this.#isAngleClear(playerPos, ang, this.#distance)) {
        return ang;
      }
    }
    return preferredYaw;
  }

  #isAngleClear(playerPos, angle, distance) {
    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);
    const checkY = playerPos.y + 1.15;
    for (const frac of [0.45, 0.75, 1.0]) {
      const x = playerPos.x + sinA * distance * frac;
      const z = playerPos.z + cosA * distance * frac;
      if (this.#collision.isPointBlocked(x, checkY, z, 0.35)) {
        return false;
      }
    }
    return true;
  }

  #getPanelWidthRatio() {
    const panel = document.querySelector('#wardrobe-overlay .wardrobe-modal');
    if (panel && window.innerWidth > 0) {
      const rect = panel.getBoundingClientRect();
      if (rect.width > 0) {
        return Math.min(0.44, Math.max(0.26, (rect.right + 8) / window.innerWidth));
      }
    }
    return 0.36;
  }

  update(dt) {
    if (this.#state === 'inactive' || !this.#camera || !this.#player) return;

    if (this.#state === 'active') {
      const pos = this.#player.getPosition();

      // Rotación suave del personaje (para ver vestido y peinado 360°)
      const diff = wrapAngle(this.#targetYaw - this.#currentYaw);
      this.#currentYaw = wrapAngle(this.#currentYaw + diff * (1 - Math.exp(-dt * 11)));
      this.#player.setFacingYaw(this.#currentYaw);

      // Cálculo de encuadre cuerpo entero centrado en el área libre derecha
      const fovRad = THREE.MathUtils.degToRad(this.#camera.fov);
      const halfH = Math.tan(fovRad * 0.5) * this.#distance;
      const halfW = halfH * this.#camera.aspect;
      const panelRatio = this.#getPanelWidthRatio();
      // Desplazar cámara y foco hacia la izquierda de la cámara sitúa al personaje en el centro libre derecho
      const lateralShift = panelRatio * halfW * 0.94;

      const sinA = Math.sin(this.#framingAngle);
      const cosA = Math.cos(this.#framingAngle);
      // Vector derecho de la cámara mirando hacia el personaje (-sinA, 0, -cosA) × (0, 1, 0) = (cosA, 0, -sinA)
      const camRightX = cosA;
      const camRightZ = -sinA;

      const focusY = pos.y + 0.98;
      this.#desiredLookAt.set(
        pos.x - camRightX * lateralShift,
        focusY,
        pos.z - camRightZ * lateralShift
      );
      this.#desiredCamPos.set(
        this.#desiredLookAt.x + sinA * this.#distance,
        pos.y + 1.18,
        this.#desiredLookAt.z + cosA * this.#distance
      );

      const alpha = 1 - Math.exp(-dt * 7.5);
      this.#camera.position.lerp(this.#desiredCamPos, alpha);
      this.#currentLookAt.lerp(this.#desiredLookAt, alpha);
      this.#camera.lookAt(this.#currentLookAt);
      return;
    }

    // Estado 'exiting': volver con suavidad a la cámara de tercera persona del jugador
    this.#exitElapsed += dt;
    this.#player.getThirdPersonCameraPose(this.#exitPose.position, this.#exitPose.lookAt);

    const alpha = 1 - Math.exp(-dt * 9.0);
    this.#camera.position.lerp(this.#exitPose.position, alpha);
    this.#currentLookAt.lerp(this.#exitPose.lookAt, alpha);
    this.#camera.lookAt(this.#currentLookAt);

    const posDist = this.#camera.position.distanceTo(this.#exitPose.position);
    const lookDist = this.#currentLookAt.distanceTo(this.#exitPose.lookAt);
    if ((posDist < 0.06 && lookDist < 0.06) || this.#exitElapsed >= 0.6) {
      this.#state = 'inactive';
    }
  }

  dispose() {
    this.#state = 'inactive';
  }
}
