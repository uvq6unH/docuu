export interface TouchControlsCallbacks {
  onMovement: (moveX: -1 | 0 | 1, moveZ: -1 | 0 | 1) => void;
  onLook: (deltaYaw: number, deltaPitch: number) => void;
  onSprint: (sprinting: boolean) => void;
  onCrouch: (crouched: boolean) => void;
  onJump: () => void;
  onAction: (held: boolean) => void;
}

export class TouchController {
  private joystickZone: HTMLElement | null = null;
  private joystickKnob: HTMLElement | null = null;
  private joystickTouchId: number | null = null;
  private lookTouchId: number | null = null;
  private joystickCenter = { x: 0, y: 0 };
  private lastLookPos = { x: 0, y: 0 };
  private maxRadius = 45; // Maximum joystick drag radius in px
  private sprinting = false;
  private crouched = false;
  public enabled = false;

  constructor(private callbacks: TouchControlsCallbacks) {}

  public mount(container: HTMLElement): void {
    // Only auto-enable if touch points detected or forced
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      this.enabled = true;
    }

    this.joystickZone = container.querySelector('#touch-joystick-zone');
    this.joystickKnob = container.querySelector('#touch-joystick-knob');

    const touchOverlay = container.querySelector('#touch-controls');
    if (touchOverlay && this.enabled) {
      touchOverlay.removeAttribute('hidden');
    }

    this.setupListeners();
  }

  public setVisible(visible: boolean): void {
    this.enabled = visible;
    const touchOverlay = document.querySelector('#touch-controls');
    if (touchOverlay) {
      if (visible) {
        touchOverlay.removeAttribute('hidden');
      } else {
        touchOverlay.setAttribute('hidden', '');
      }
    }
  }

  public reset(): void {
    this.joystickTouchId = null;
    this.lookTouchId = null;
    this.sprinting = this.crouched = false;
    if (this.joystickKnob) this.joystickKnob.style.transform = 'translate(-50%, -50%)';
    document.querySelectorAll('#touch-controls .active').forEach(button => button.classList.remove('active'));
    this.callbacks.onMovement(0, 0);
    this.callbacks.onSprint(false);
    this.callbacks.onCrouch(false);
    this.callbacks.onAction(false);
  }

  private setupListeners(): void {
    // Joystick Touch
    if (this.joystickZone) {
      this.joystickZone.addEventListener('touchstart', (e) => {
        if (!this.enabled || this.joystickTouchId !== null) return;
        const touch = e.changedTouches[0];
        if (!touch) return;
        this.joystickTouchId = touch.identifier;
        const rect = this.joystickZone!.getBoundingClientRect();
        this.joystickCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
        this.updateJoystick(touch.clientX, touch.clientY);
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        if (!this.enabled || this.joystickTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i]!;
          if (touch.identifier === this.joystickTouchId) {
            this.updateJoystick(touch.clientX, touch.clientY);
            break;
          }
        }
      }, { passive: true });

      const clearJoystick = (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i]!.identifier === this.joystickTouchId) {
            this.joystickTouchId = null;
            if (this.joystickKnob) {
              this.joystickKnob.style.transform = 'translate(-50%, -50%)';
            }
            this.callbacks.onMovement(0, 0);
            break;
          }
        }
      };

      window.addEventListener('touchend', clearJoystick, { passive: true });
      window.addEventListener('touchcancel', clearJoystick, { passive: true });
    }

    // Right-Screen Touch Look
    window.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i]!;
        // Look area: right half of viewport, excluding top HUD
        if (touch.clientX > window.innerWidth * 0.45 && touch.clientY > 80 && this.lookTouchId === null) {
          // Avoid tapping action buttons directly
          const target = document.elementFromPoint(touch.clientX, touch.clientY);
          if (target && target.closest('button, input, select, textarea, .help-modal, .panel')) continue;

          this.lookTouchId = touch.identifier;
          this.lastLookPos = { x: touch.clientX, y: touch.clientY };
          break;
        }
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!this.enabled || this.lookTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i]!;
        if (touch.identifier === this.lookTouchId) {
          const dx = touch.clientX - this.lastLookPos.x;
          const dy = touch.clientY - this.lastLookPos.y;
          this.lastLookPos = { x: touch.clientX, y: touch.clientY };
          this.callbacks.onLook(dx, dy);
          break;
        }
      }
    }, { passive: true });

    const clearLook = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i]!.identifier === this.lookTouchId) {
          this.lookTouchId = null;
          break;
        }
      }
    };
    window.addEventListener('touchend', clearLook, { passive: true });
    window.addEventListener('touchcancel', clearLook, { passive: true });

    // Buttons
    const btnSprint = document.querySelector<HTMLButtonElement>('#touch-btn-sprint');
    btnSprint?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.sprinting = !this.sprinting;
      btnSprint.classList.toggle('active', this.sprinting);
      this.callbacks.onSprint(this.sprinting);
    });

    const btnJump = document.querySelector<HTMLButtonElement>('#touch-btn-jump');
    btnJump?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.callbacks.onJump();
    });

    const btnCrouch = document.querySelector<HTMLButtonElement>('#touch-btn-crouch');
    btnCrouch?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.crouched = !this.crouched;
      btnCrouch.classList.toggle('active', this.crouched);
      this.callbacks.onCrouch(this.crouched);
    });

    const btnAction = document.querySelector<HTMLButtonElement>('#touch-btn-action');
    btnAction?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      btnAction.classList.add('active');
      this.callbacks.onAction(true);
    });
    btnAction?.addEventListener('touchend', (e) => {
      e.preventDefault();
      btnAction.classList.remove('active');
      this.callbacks.onAction(false);
    });
  }

  private updateJoystick(clientX: number, clientY: number): void {
    const dx = clientX - this.joystickCenter.x;
    const dy = clientY - this.joystickCenter.y;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(this.maxRadius, dist);
    const angle = Math.atan2(dy, dx);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    if (this.joystickKnob) {
      this.joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
    }

    // Deadzone
    if (dist < 10) {
      this.callbacks.onMovement(0, 0);
      return;
    }

    // Map to discrete -1, 0, 1 for moveX (Right/Left), moveZ (Forward/Backward)
    // Up on screen is negative Y -> forward moveZ = 1
    const normX = dx / clampedDist;
    const normY = dy / clampedDist;

    const moveX = (normX > 0.35 ? 1 : normX < -0.35 ? -1 : 0) as -1 | 0 | 1;
    const moveZ = (normY < -0.35 ? 1 : normY > 0.35 ? -1 : 0) as -1 | 0 | 1;

    this.callbacks.onMovement(moveX, moveZ);
  }
}
