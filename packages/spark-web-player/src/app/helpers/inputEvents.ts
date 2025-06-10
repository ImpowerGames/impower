/**
 * The type of input device used for a pointer event.
 */
type PointerType = "mouse" | "pen" | "touch";

/**
 * Stores the internal state of pointer interaction,
 * including drag state and pointer coordinates.
 */
export interface InputState {
  down: boolean;
  dragging: boolean;
  downX: number;
  downY: number;
  dragThresholds: Record<PointerType, number>;
}

/**
 * A collection of callback functions for various pointer interaction events.
 */
export interface InputEventCallbacks {
  onDown?: (e: PointerEvent) => void;
  onMove?: (e: PointerEvent) => void;
  onUp?: (e: PointerEvent) => void;
  onTap?: (e: PointerEvent) => void;
  onDragStart?: (
    e: PointerEvent,
    threshold: number,
    dx: number,
    dy: number
  ) => void;
  onDrag?: (e: PointerEvent) => void;
  onDragEnd?: (e: PointerEvent) => void;
  onKeyPress?: (e: KeyboardEvent) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  onKeyUp?: (e: KeyboardEvent) => void;
}

/**
 * Creates a new InputState with default drag thresholds.
 */
export function createInputState(): InputState {
  return {
    down: false,
    dragging: false,
    downX: 0,
    downY: 0,
    dragThresholds: {
      mouse: 1,
      pen: 2,
      touch: 4,
    },
  };
}

/**
 * Attaches pointer event listeners to a canvas element.
 * Handles down, move, up, drag, and tap detection.
 *
 * @param canvas - The HTML canvas element to attach listeners to
 * @param state - A PointerState object for tracking pointer interaction
 * @param callbacks - Optional callback hooks for each interaction phase
 * @returns A cleanup function to detach the listeners
 */
export function attachInputEvents(
  canvas: HTMLElement | null,
  state: InputState,
  callbacks: InputEventCallbacks
) {
  if (!canvas) return;

  const handleDown = (e: PointerEvent) => {
    state.down = true;
    state.dragging = false;
    state.downX = e.offsetX;
    state.downY = e.offsetY;
    callbacks.onDown?.(e);
  };

  const handleMove = (e: PointerEvent) => {
    callbacks.onMove?.(e);
    if (!state.down) return;

    const dx = e.offsetX - state.downX;
    const dy = e.offsetY - state.downY;
    const distSq = dx ** 2 + dy ** 2;
    const threshold = state.dragThresholds[e.pointerType as PointerType] ?? 4;

    if (!state.dragging && distSq > threshold ** 2) {
      state.dragging = true;
      callbacks.onDragStart?.(e, threshold, dx, dy);
    }

    if (state.dragging) {
      callbacks.onDrag?.(e);
    }
  };

  const handleUp = (e: PointerEvent | MouseEvent) => {
    callbacks.onUp?.(e as PointerEvent);
    if (state.down) {
      if (state.dragging) {
        callbacks.onDragEnd?.(e as PointerEvent);
      } else {
        callbacks.onTap?.(e as PointerEvent);
      }
    }
    state.down = false;
    state.dragging = false;
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length === 0) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const touch = e.changedTouches[0]!;
      const pointerEvent = {
        ...e,
        pointerType: "touch",
        offsetX: touch.clientX - rect.left,
        offsetY: touch.clientY - rect.top,
      } as unknown as PointerEvent;
      handleUp(pointerEvent);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    callbacks.onKeyDown?.(e);
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    callbacks.onKeyUp?.(e);
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    callbacks.onKeyPress?.(e);
  };

  canvas.addEventListener("pointerdown", handleDown);
  canvas.addEventListener("pointermove", handleMove);
  window.addEventListener("mouseup", handleUp);
  window.addEventListener("touchend", handleTouchEnd);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("keypress", handleKeyPress);

  return () => {
    canvas.removeEventListener("pointerdown", handleDown);
    canvas.removeEventListener("pointermove", handleMove);
    window.removeEventListener("mouseup", handleUp);
    window.removeEventListener("touchend", handleTouchEnd);
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    window.removeEventListener("keypress", handleKeyPress);
  };
}
