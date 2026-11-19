// Trạng thái thiết bị local, không phải InputFrame/wire contract.
export class InputState {
  private readonly held = new Set<string>();
  private jumpPressed = false;
  private capturePressed = false;

  press(code: string) {
    if (this.held.has(code)) return;
    this.held.add(code);
    if (code === 'Space') this.jumpPressed = true;
  }

  release(code: string) {
    this.held.delete(code);
  }

  capture() {
    this.capturePressed = true;
  }

  peek() {
    const axis = (positive: string, negative: string): -1 | 0 | 1 => {
      const value = Number(this.held.has(positive)) - Number(this.held.has(negative));
      return value > 0 ? 1 : value < 0 ? -1 : 0;
    };
    return {
      moveX: axis('KeyD', 'KeyA'),
      moveZ: axis('KeyW', 'KeyS'),
      sprint: this.held.has('ShiftLeft') || this.held.has('ShiftRight'),
      crouch: this.held.has('KeyC') || this.held.has('ControlLeft') || this.held.has('ControlRight'),
      rescueHeld: this.held.has('KeyE') || this.held.has('KeyF'),
      jumpPressed: this.jumpPressed,
      capturePressed: this.capturePressed,
    };
  }

  consume() {
    const state = this.peek();
    this.jumpPressed = false;
    this.capturePressed = false;
    return state;
  }

  clear() {
    this.held.clear();
    this.jumpPressed = false;
    this.capturePressed = false;
  }
}

export function applyLook(yaw: number, pitch: number, deltaX: number, deltaY: number, sensitivity: number) {
  if (![yaw, pitch, deltaX, deltaY, sensitivity].every(Number.isFinite)) return { yaw, pitch };
  const nextYaw = yaw - deltaX * sensitivity;
  const wrappedYaw = ((nextYaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return {
    yaw: wrappedYaw,
    pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch - deltaY * sensitivity)),
  };
}
