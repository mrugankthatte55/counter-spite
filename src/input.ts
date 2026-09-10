export class Input {
  keys = new Set<string>();
  mouseDown = false;
  mouseDown2 = false;
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  private pressed = new Set<string>();
  private clicked = false;
  private clicked2 = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (["Space", "KeyW", "KeyA", "KeyS", "KeyD", "ControlLeft", "Tab"].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("mousedown", (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouseDown = true; this.clicked = true; }
      if (e.button === 2) { this.mouseDown2 = true; this.clicked2 = true; }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseDown2 = false;
    });
    window.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener("wheel", (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener("blur", () => { this.keys.clear(); this.mouseDown = false; this.mouseDown2 = false; });
  }

  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  lock() {
    this.canvas.requestPointerLock();
  }

  down(code: string) { return this.keys.has(code); }
  /** True only on the frame the key was pressed. */
  justPressed(code: string) { return this.pressed.has(code); }
  /** True only on the frame the left mouse button was pressed. */
  justClicked() { return this.clicked; }
  /** True only on the frame the right mouse button was pressed. */
  justClicked2() { return this.clicked2; }

  endFrame() {
    this.pressed.clear();
    this.clicked = false;
    this.clicked2 = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
