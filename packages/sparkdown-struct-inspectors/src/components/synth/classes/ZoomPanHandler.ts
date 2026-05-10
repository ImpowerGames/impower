export interface View {
  start: number;
  end: number;
}

export interface ZoomPanOptions {
  initial?: View;
  onChange?: (view: View) => void;
}

export interface InteractionState {
  isDragging: boolean;
  startX: number;
  startView: View;
  pinchDist: number;
  pinchCenter: number;
}

export class ZoomPanHandler {
  public el: HTMLElement;
  public view: View;
  public onChange: (view: View) => void;
  private state: InteractionState;

  constructor(element: HTMLElement, options: ZoomPanOptions = {}) {
    this.el = element;
    this.view = options.initial || { start: 0, end: 1 };
    this.onChange = options.onChange || (() => {});

    // Internal interaction state
    this.state = {
      isDragging: false,
      startX: 0,
      startView: { start: 0, end: 1 },
      pinchDist: 0,
      pinchCenter: 0,
    };

    // Bind event handlers to maintain class context ('this')
    this.onWheel = this.onWheel.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);

    this.init();
  }

  private getRect(): DOMRect {
    return this.el.getBoundingClientRect();
  }

  public setView(newView: View): void {
    this.view = newView;
    this.onChange(this.view);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.getRect();
    const v = this.view;
    const viewWidth = v.end - v.start;

    // Smooth zooming for trackpad and mice
    const scale = Math.exp(e.deltaY * 0.002);
    const nW = Math.max(0.01, Math.min(1, viewWidth * scale));

    const mouseX = e.clientX - rect.left;
    const centerRel = Math.max(0, Math.min(1, mouseX / rect.width));
    const viewCenter = v.start + centerRel * viewWidth;

    let nS = viewCenter - centerRel * nW;
    let nE = viewCenter + (1 - centerRel) * nW;

    if (nS < 0) {
      nE -= nS;
      nS = 0;
    }
    if (nE > 1) {
      nS -= nE - 1;
      nE = 1;
    }

    this.setView({ start: Math.max(0, nS), end: Math.min(1, nE) });
  }

  private onTouchStart(e: TouchEvent): void {
    const rect = this.getRect();

    if (e.touches.length === 1) {
      this.state = {
        ...this.state,
        isDragging: true,
        startX: e.touches[0].clientX,
        startView: { ...this.view },
      };
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      this.state = {
        ...this.state,
        isDragging: false,
        pinchDist: Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY),
        pinchCenter: (t1.clientX + t2.clientX) / 2 - rect.left,
        startView: { ...this.view },
      };
    }
  }

  private onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    const rect = this.getRect();
    const v = this.state.startView;
    const viewWidth = v.end - v.start;

    if (e.touches.length === 1 && this.state.isDragging) {
      const shift =
        -(e.touches[0].clientX - this.state.startX) * (viewWidth / rect.width);
      let nS = v.start + shift;
      let nE = v.end + shift;

      if (nS < 0) {
        nS = 0;
        nE = viewWidth;
      }
      if (nE > 1) {
        nE = 1;
        nS = 1 - viewWidth;
      }

      this.setView({ start: nS, end: nE });
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(
        t1.clientX - t2.clientX,
        t1.clientY - t2.clientY,
      );

      if (this.state.pinchDist === 0) return;

      const scale = this.state.pinchDist / currentDist;
      const centerRel = this.state.pinchCenter / rect.width;
      const viewCenter = v.start + centerRel * viewWidth;
      const nW = Math.max(0.01, Math.min(1, viewWidth * scale));

      let nS = viewCenter - centerRel * nW;
      let nE = viewCenter + (1 - centerRel) * nW;

      if (nS < 0) {
        nE -= nS;
        nS = 0;
      }
      if (nE > 1) {
        nS -= nE - 1;
        nE = 1;
      }

      this.setView({ start: Math.max(0, nS), end: Math.min(1, nE) });
    }
  }

  private onMouseDown(e: MouseEvent): void {
    e.preventDefault(); // Prevents native drag-and-drop & selection
    this.state = {
      ...this.state,
      isDragging: true,
      startX: e.clientX,
      startView: { ...this.view },
    };
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.state.isDragging) return;

    // Safety check: if mouse button was released outside window
    if (e.buttons === 0) {
      this.state.isDragging = false;
      return;
    }

    e.preventDefault();

    const rect = this.getRect();
    const v = this.state.startView;
    const viewWidth = v.end - v.start;

    const shift = -(e.clientX - this.state.startX) * (viewWidth / rect.width);
    let nS = v.start + shift;
    let nE = v.end + shift;

    if (nS < 0) {
      nS = 0;
      nE = viewWidth;
    }
    if (nE > 1) {
      nE = 1;
      nS = 1 - viewWidth;
    }

    this.setView({ start: nS, end: nE });
  }

  private onMouseUp(): void {
    if (this.state.isDragging) {
      this.state.isDragging = false;
    }
  }

  // Attach all event listeners
  public init(): void {
    this.el.addEventListener("wheel", this.onWheel as EventListener, {
      passive: false,
    });
    this.el.addEventListener("touchstart", this.onTouchStart as EventListener, {
      passive: false,
    });
    this.el.addEventListener("touchmove", this.onTouchMove as EventListener, {
      passive: false,
    });
    this.el.addEventListener("mousedown", this.onMouseDown as EventListener);
    window.addEventListener("mousemove", this.onMouseMove as EventListener, {
      passive: false,
    });
    window.addEventListener("mouseup", this.onMouseUp as EventListener);
    document.addEventListener("mouseleave", this.onMouseUp as EventListener);
  }

  // Cleanup method to replace the useEffect return function
  public destroy(): void {
    this.el.removeEventListener("wheel", this.onWheel as EventListener);
    this.el.removeEventListener(
      "touchstart",
      this.onTouchStart as EventListener,
    );
    this.el.removeEventListener("touchmove", this.onTouchMove as EventListener);
    this.el.removeEventListener("mousedown", this.onMouseDown as EventListener);
    window.removeEventListener("mousemove", this.onMouseMove as EventListener);
    window.removeEventListener("mouseup", this.onMouseUp as EventListener);
    document.removeEventListener("mouseleave", this.onMouseUp as EventListener);
  }
}
