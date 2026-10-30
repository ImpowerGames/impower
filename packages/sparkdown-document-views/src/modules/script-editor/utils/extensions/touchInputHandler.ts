import {
  combineConfig,
  EditorSelection,
  EditorState,
  Facet,
  Transaction,
} from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";

const touchInputTheme = EditorView.baseTheme({
  "& .cm-content .cm-line": {
    paddingLeft: "0",
  },
});

const isTouchEnvironment = () =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  ) ||
  (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
  navigator.maxTouchPoints > 0;

let startedFocused = false;
let isDragging = false;
let isScrolling = false;
let isLongPressing = false;
let wasShowingContextMenuBeforeScroll = false;
let touchStartPos: number | null = null;
let touchEndPos: number | null = null;
let selectionAnchor: number | null = null;
let selectionHead: number | null = null;
let longPressTimer: any = undefined;

let startX = 0;
let startY = 0;

let velocityTracker: { y: number; time: number }[] = [];
let velocityY = 0;
let lastTouchY = 0;
let rafId: number | null = null;
let lastFrameTime = 0;
let stoppedMomentum = false;

const LONG_PRESS_DURATION = 500;
const SCROLL_THRESHOLD = 10;
const FRICTION = 0.95;
const VELOCITY_LIMIT = 0.5;
const VELOCITY_BOOST = 1.2;
const TRACKING_WINDOW_MS = 100;
const MS_PER_FRAME = 16.66;

const DOUBLE_TAP_INTERVAL = 300;
const DOUBLE_TAP_SLOP = 24;

let lastTap: { time: number; x: number; y: number; focused: boolean } | null =
  null;

const isKeyboardOpen = () => {
  const vv = window.visualViewport;
  return vv != null && window.innerHeight - vv.height > 0;
};

// workaround(android): focusing an already-focused field does not reopen an on-screen keyboard dismissed with Back, so blur then refocus
const focusWithKeyboard = (view: EditorView) => {
  if (!view.hasFocus) {
    view.focus();
  } else if (!isKeyboardOpen()) {
    view.contentDOM.blur();
    view.focus();
  }
};

const wordAtPoint = (view: EditorView, pos: number, x: number, y: number) => {
  const line = view.lineBlockAt(pos);
  const lineTop = view.documentTop + line.top;
  if (y < lineTop || y > lineTop + line.height) return null;
  const word = view.state.wordAt(pos);
  if (!word) return null;
  if (pos === word.to) {
    const end = view.coordsAtPos(word.to, -1);
    if (!end || x > end.right) return null;
  }
  if (pos === word.from) {
    const start = view.coordsAtPos(word.from, 1);
    if (!start || x < start.left) return null;
  }
  return word;
};

const selectAtPoint = (view: EditorView, pos: number, x: number, y: number) => {
  const config = view.state.facet(touchInputHandlerConfig);
  const word = wordAtPoint(view, pos, x, y);
  const selection = word
    ? EditorSelection.range(word.from, word.to)
    : EditorSelection.cursor(pos);
  focusWithKeyboard(view);
  view.dispatch({
    selection,
    scrollIntoView: false,
    userEvent: "select.touch",
  });
  config.showContextMenu?.(view, { pos: selection.from, end: selection.to });
  return selection;
};

const finishScroll = (view: EditorView) => {
  if (wasShowingContextMenuBeforeScroll) {
    wasShowingContextMenuBeforeScroll = false;
    const selection = view.state.selection.main;
    const config = view.state.facet(touchInputHandlerConfig);
    config.showContextMenu?.(view, {
      pos: selection.from,
      end: selection.to,
    });
  }
};

const stopMomentum = (view: EditorView) => {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
    finishScroll(view);
  }
  velocityY = 0;
};

const applyMomentum = (time: DOMHighResTimeStamp, view: EditorView) => {
  const dt = time - lastFrameTime;
  lastFrameTime = time;

  if (Math.abs(velocityY) < VELOCITY_LIMIT) {
    rafId = null;
    finishScroll(view);
    return;
  }

  const prevScrollTop = view.scrollDOM.scrollTop;
  view.scrollDOM.scrollTop += velocityY;

  if (view.scrollDOM.scrollTop === prevScrollTop) {
    rafId = null;
    finishScroll(view);
    return;
  }

  velocityY *= Math.pow(FRICTION, dt / MS_PER_FRAME);

  rafId = requestAnimationFrame((time) => applyMomentum(time, view));
};

const selectionHandleTheme = EditorView.baseTheme({
  ".cm-touch-selection-handle": {
    position: "absolute",
    width: "20px",
    height: "20px",
    backgroundColor: "#1976d2",
    borderRadius: "50%",
    zIndex: 100,
    pointerEvents: "auto",
    transition: "opacity 0.05s linear",
    "&::after": {
      pointerEvents: "auto",
      content: "''",
      position: "absolute",
      top: "50%",
      left: "50%",
      width: "32px",
      height: "32px",
    },
  },
  ".cm-touch-selection-handle-start": {
    borderTopRightRadius: "0",
    transform: "translate(-100%, 0)",
    "&::after": {
      transform: "translate(-50%, -30%)",
    },
  },
  ".cm-touch-selection-handle-end": {
    borderTopLeftRadius: "0",
    "&::after": {
      transform: "translate(-50%, -30%)",
    },
  },
  ".cm-touch-selection-handle-cursor": {
    borderTopLeftRadius: "0",
    transform: "translate(-50%, 0) rotate(45deg)",
    "&::after": {
      transform: "translate(-30%, -30%)",
    },
  },
  ".cm-touch-selection-handle.cm-touch-selection-handle-inert": {
    pointerEvents: "none",
    "&::after": {
      pointerEvents: "none",
    },
  },
});

const setHandlesInert = (view: EditorView, inert: boolean) => {
  for (const handle of view.dom.querySelectorAll(
    ".cm-touch-selection-handle",
  )) {
    handle.classList.toggle("cm-touch-selection-handle-inert", inert);
  }
};

const selectionHandlePlugin = ViewPlugin.fromClass(
  class {
    startHandle: HTMLElement;
    endHandle: HTMLElement;
    cursorHandle: HTMLElement;
    view: EditorView;
    isSelecting = false;
    showsHandles = false;

    constructor(view: EditorView) {
      this.view = view;

      this.startHandle = document.createElement("div");
      this.startHandle.className =
        "cm-touch-selection-handle cm-touch-selection-handle-start";

      this.endHandle = document.createElement("div");
      this.endHandle.className =
        "cm-touch-selection-handle cm-touch-selection-handle-end";

      this.cursorHandle = document.createElement("div");
      this.cursorHandle.className =
        "cm-touch-selection-handle cm-touch-selection-handle-cursor";

      this.view.dom.appendChild(this.startHandle);
      this.view.dom.appendChild(this.endHandle);
      this.view.dom.appendChild(this.cursorHandle);

      this.attachRangeHandleListeners(this.startHandle, true);
      this.attachRangeHandleListeners(this.endHandle, false);
      this.attachCursorHandleListeners(this.cursorHandle);

      this.scheduleUpdate(view.state);
    }

    attachRangeHandleListeners(handle: HTMLElement, isStartHandle: boolean) {
      let selectionHandleAnchor: number | null = null;
      let selectionHandleHead: number | null = null;

      handle.addEventListener("touchstart", (e) => {
        this.isSelecting = true;
        e.preventDefault();
        e.stopPropagation();
        const config = this.view.state.facet(touchInputHandlerConfig);
        config.hideContextMenu?.(this.view);
        const selection = this.view.state.selection.main;
        if (selection) {
          selectionHandleAnchor = selection.anchor;
          selectionHandleHead = selection.head;
        }
      });

      handle.addEventListener("touchmove", (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (selectionHandleAnchor != null && selectionHandleHead != null) {
          const touch = e.touches[0]!;
          const pos = touch
            ? this.view.posAtCoords({
                x: touch.clientX,
                y: touch.clientY - handle.offsetHeight,
              })
            : null;
          if (isStartHandle) {
            selectionHandleAnchor = pos;
          } else {
            selectionHandleHead = pos;
          }
          if (selectionHandleAnchor != null && selectionHandleHead != null) {
            if (!this.view.hasFocus) this.view.focus();
            this.view.dispatch({
              selection: {
                anchor: selectionHandleAnchor,
                head: selectionHandleHead,
              },
              scrollIntoView: false,
              userEvent: "select.touch.handle",
            });
          }
        }
      });

      handle.addEventListener("touchend", (e) => {
        this.isSelecting = false;
        e.preventDefault();
        e.stopPropagation();
        setTimeout(() => {
          const from = this.view.state.selection.main.from;
          const to = this.view.state.selection.main.to;
          const config = this.view.state.facet(touchInputHandlerConfig);
          config.showContextMenu?.(this.view, {
            pos: from,
            end: to,
          });
        }, 10);
      });

      handle.addEventListener("touchcancel", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    }

    attachCursorHandleListeners(handle: HTMLElement) {
      let menuWasOpen = false;
      let moved = false;
      let handleStartX = 0;
      let handleStartY = 0;

      handle.addEventListener("touchstart", (e) => {
        if (this.isSelecting) return;
        e.preventDefault();
        e.stopPropagation();
        const touch = e.touches[0];
        handleStartX = touch?.clientX ?? 0;
        handleStartY = touch?.clientY ?? 0;
        moved = false;
        const config = this.view.state.facet(touchInputHandlerConfig);
        menuWasOpen = config.isContextMenuOpen?.(this.view) ?? false;
        config.hideContextMenu?.(this.view);
      });

      handle.addEventListener("touchmove", (e) => {
        if (this.isSelecting) return;
        const touch = e.touches[0]!;
        if (touch == null) return;

        e.preventDefault();
        e.stopPropagation();

        if (
          Math.abs(touch.clientX - handleStartX) > SCROLL_THRESHOLD ||
          Math.abs(touch.clientY - handleStartY) > SCROLL_THRESHOLD
        ) {
          moved = true;
        }

        const pos = this.view.posAtCoords(
          {
            x: touch.clientX,
            y: touch.clientY - handle.offsetHeight,
          },
          false,
        );

        if (pos != null) {
          if (!this.view.hasFocus) this.view.focus();
          this.view.dispatch({
            selection: { anchor: pos },
            scrollIntoView: true,
            userEvent: "select.touch.handle",
          });
        }
      });

      handle.addEventListener("touchend", (e) => {
        if (this.isSelecting) return;
        e.preventDefault();
        e.stopPropagation();
        if (!moved && !menuWasOpen) {
          const head = this.view.state.selection.main.head;
          const config = this.view.state.facet(touchInputHandlerConfig);
          config.showContextMenu?.(this.view, { pos: head, end: head });
        }
      });

      handle.addEventListener("touchcancel", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    }

    update(update: ViewUpdate) {
      if (
        update.selectionSet ||
        update.geometryChanged ||
        update.viewportChanged ||
        update.docChanged ||
        update.focusChanged
      ) {
        this.scheduleUpdate(update.state, update);
      }
    }

    scheduleUpdate(state: EditorState, update?: ViewUpdate) {
      this.view.requestMeasure({
        read: (view) => {
          if (!view.hasFocus) {
            return null;
          }

          const isTouchSelection =
            update?.selectionSet &&
            update.transactions.some((tr) => tr.isUserEvent("select.touch"));

          const isProgrammaticSelection =
            update?.selectionSet && !isTouchSelection;

          const sel = state.selection.main;
          const editorRect = view.dom.getBoundingClientRect();

          const scrollRect = view.scrollDOM.getBoundingClientRect();

          const getHandleInfo = (pos: number) => {
            const coords = view.coordsAtPos(pos);
            if (!coords) return null;

            const isVisible =
              coords.bottom > scrollRect.top && coords.top < scrollRect.bottom;

            return {
              isProgrammaticSelection,
              isTouchSelection,
              pos,
              left: coords.left - editorRect.left,
              top: coords.bottom - editorRect.top,
              visible: isVisible,
            };
          };

          return {
            isProgrammaticSelection,
            isTouchSelection,
            type: !sel.empty || this.isSelecting ? "range" : "cursor",
            anchor: getHandleInfo(sel.anchor),
            head: getHandleInfo(sel.head),
          };
        },
        write: (measure) => {
          if (!measure || measure.isProgrammaticSelection) {
            this.showsHandles = false;
          } else if (measure.isTouchSelection) {
            this.showsHandles = true;
          }
          if (!measure || !this.showsHandles) {
            this.startHandle.style.display = "none";
            this.endHandle.style.display = "none";
            this.cursorHandle.style.display = "none";
            return;
          }

          const updateHandle = (
            el: HTMLElement,
            info:
              | { left: number; top: number; visible: boolean }
              | null
              | undefined,
          ) => {
            if (info && info.visible) {
              el.style.display = "block";
              el.style.left = `${info.left}px`;
              el.style.top = `${info.top}px`;
            } else {
              el.style.display = "none";
            }
          };

          if (measure.type === "cursor") {
            this.startHandle.style.display = "none";
            this.endHandle.style.display = "none";
            updateHandle(this.cursorHandle, measure.head);
          } else {
            this.cursorHandle.style.display = "none";
            updateHandle(this.startHandle, measure.anchor);
            updateHandle(this.endHandle, measure.head);
          }
        },
      });
    }

    destroy() {
      this.startHandle.remove();
      this.endHandle.remove();
      this.cursorHandle.remove();
    }
  },
  {
    eventHandlers: {
      scroll(_, view) {
        this.scheduleUpdate(view.state);
      },
    },
  },
);

const touchEventsPlugin = ViewPlugin.fromClass(
  class {
    view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      this.bind();
    }

    bind() {
      this.view.scrollDOM.addEventListener("touchstart", this.onTouchStart, {
        passive: false,
      });
      this.view.scrollDOM.addEventListener("touchmove", this.onTouchMove, {
        passive: false,
      });
      this.view.scrollDOM.addEventListener("touchend", this.onTouchEnd, {
        passive: false,
      });
      this.view.scrollDOM.addEventListener("touchcancel", this.onTouchCancel, {
        passive: false,
      });
      document.addEventListener("selectstart", this.onSelectStart, true);
      for (const type of ["touchstart", "touchend", "touchcancel"] as const) {
        this.view.dom.addEventListener(type, this.onViewTouch, {
          capture: true,
          passive: true,
        });
      }
      this.view.contentDOM.addEventListener("focusout", this.onFocusOut);
    }

    unbind() {
      this.view.scrollDOM.removeEventListener("touchstart", this.onTouchStart);
      this.view.scrollDOM.removeEventListener("touchmove", this.onTouchMove);
      this.view.scrollDOM.removeEventListener("touchend", this.onTouchEnd);
      this.view.scrollDOM.removeEventListener(
        "touchcancel",
        this.onTouchCancel,
      );
      document.removeEventListener("selectstart", this.onSelectStart, true);
      for (const type of ["touchstart", "touchend", "touchcancel"] as const) {
        this.view.dom.removeEventListener(type, this.onViewTouch, {
          capture: true,
        });
      }
      this.view.contentDOM.removeEventListener("focusout", this.onFocusOut);
    }

    isTouching = false;

    setTouching(touching: boolean) {
      this.isTouching = touching;
      setHandlesInert(this.view, touching);
    }

    onSelectStart = (event: Event) => {
      if (this.isTouching) {
        event.preventDefault();
      }
    };

    touchesOnView = 0;
    focusedAtTouch = false;

    onViewTouch = (event: TouchEvent) => {
      if (event.type === "touchstart" && this.touchesOnView === 0) {
        this.focusedAtTouch = this.view.hasFocus;
      }
      this.touchesOnView = event.touches.length;
    };

    onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (
        this.touchesOnView === 0 ||
        !this.focusedAtTouch ||
        (next instanceof Node && this.view.dom.contains(next))
      ) {
        return;
      }
      queueMicrotask(() => {
        if (!this.view.hasFocus) this.view.focus();
      });
    };

    onTouchStart = (event: TouchEvent) => {
      event.preventDefault();
      event.stopPropagation();

      this.setTouching(true);

      stoppedMomentum = rafId !== null;

      stopMomentum(this.view);

      const touch = event.touches[0]!;

      if (touch == null) return;

      startX = touch.clientX;
      startY = touch.clientY;
      lastTouchY = startY;

      startedFocused = this.view.hasFocus;
      isDragging = false;
      isScrolling = false;
      isLongPressing = false;

      velocityTracker = [{ y: startY, time: performance.now() }];
      velocityY = 0;

      const pos = this.view.posAtCoords({ x: startX, y: startY });

      if (pos == null) return;

      touchStartPos = pos;
      touchEndPos = pos;

      selectionAnchor = pos;
      selectionHead = pos;

      longPressTimer = setTimeout(() => {
        if (isScrolling) return;

        const selection = selectAtPoint(this.view, pos, startX, startY);
        selectionAnchor = selection.anchor;
        selectionHead = selection.head;
        lastTap = null;

        isLongPressing = true;
      }, LONG_PRESS_DURATION);
    };

    onTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const touch = event.touches[0]!;
      if (touch == null) return;

      const pos = this.view.posAtCoords(
        { x: touch.clientX, y: touch.clientY },
        false,
      );
      if (pos != null) {
        touchEndPos = pos;
      }

      const now = performance.now();
      const diffX = Math.abs(touch.clientX - startX);
      const diffY = Math.abs(touch.clientY - startY);

      const config = this.view.state.facet(touchInputHandlerConfig);

      if (!isLongPressing) {
        if (
          !isScrolling &&
          (diffY > SCROLL_THRESHOLD || diffX > SCROLL_THRESHOLD)
        ) {
          isScrolling = true;
          clearTimeout(longPressTimer);
          lastTap = null;
        }

        if (isScrolling) {
          if (config.isContextMenuOpen?.(this.view)) {
            wasShowingContextMenuBeforeScroll = true;
          }
          config.hideContextMenu?.(this.view);

          const deltaY = lastTouchY - touch.clientY;
          this.view.scrollDOM.scrollTop += deltaY;

          velocityTracker.push({ y: touch.clientY, time: now });

          velocityTracker = velocityTracker.filter(
            (p) => now - p.time <= TRACKING_WINDOW_MS,
          );
        }
      } else if (isDragging) {
        if (startedFocused && this.view.hasFocus) {
          config.hideContextMenu?.(this.view);
          const pos = this.view.posAtCoords({
            x: touch.clientX,
            y: touch.clientY,
          });
          const from = Math.min(
            ...[pos, selectionAnchor].filter((n) => n != null),
          );
          const to = Math.max(...[pos, selectionHead].filter((n) => n != null));
          if (from != null && to != null) {
            this.view.dispatch({
              selection: { anchor: from, head: to },
              scrollIntoView: false,
              userEvent: "select.touch",
            });
          }
        }
      } else if (
        isLongPressing &&
        touchStartPos !== touchEndPos &&
        startedFocused &&
        this.view.hasFocus
      ) {
        isDragging = true;
      }

      lastTouchY = touch.clientY;
    };

    onTouchEnd = (event: TouchEvent) => {
      event.preventDefault();
      event.stopPropagation();

      this.setTouching(event.touches.length > 0);

      clearTimeout(longPressTimer);

      const config = this.view.state.facet(touchInputHandlerConfig);

      if (isScrolling) {
        const now = performance.now();

        velocityTracker = velocityTracker.filter(
          (p) => now - p.time <= TRACKING_WINDOW_MS,
        );

        if (velocityTracker.length > 1) {
          const oldest = velocityTracker[0]!;
          const newest = velocityTracker[velocityTracker.length - 1]!;
          const dt = newest.time - oldest.time;

          if (dt > 0) {
            const rawVelocity = ((oldest.y - newest.y) / dt) * MS_PER_FRAME;
            const magnitude = Math.abs(rawVelocity);
            const direction = Math.sign(rawVelocity);

            velocityY = direction * Math.pow(magnitude, VELOCITY_BOOST);
          }
        }

        if (Math.abs(velocityY) > VELOCITY_LIMIT) {
          lastFrameTime = performance.now();
          rafId = requestAnimationFrame((time) =>
            applyMomentum(time, this.view),
          );
        } else {
          finishScroll(this.view);
        }
      } else if (isDragging && touchStartPos !== touchEndPos) {
        if (startedFocused) {
          const selection = this.view.state.selection.main;
          config.showContextMenu?.(this.view, {
            pos: selection.from,
            end: selection.to,
          });
        }
      } else if (
        !isLongPressing &&
        !isDragging &&
        !stoppedMomentum &&
        touchStartPos === touchEndPos
      ) {
        wasShowingContextMenuBeforeScroll = false;
        config.hideContextMenu?.(this.view);
        const tapPos = touchStartPos;
        if (tapPos != null) {
          const now = performance.now();
          const isDoubleTap =
            lastTap != null &&
            lastTap.focused &&
            now - lastTap.time <= DOUBLE_TAP_INTERVAL &&
            Math.abs(startX - lastTap.x) <= DOUBLE_TAP_SLOP &&
            Math.abs(startY - lastTap.y) <= DOUBLE_TAP_SLOP;
          if (
            isDoubleTap &&
            wordAtPoint(this.view, tapPos, startX, startY) != null
          ) {
            selectAtPoint(this.view, tapPos, startX, startY);
            lastTap = null;
          } else {
            focusWithKeyboard(this.view);
            this.view.dispatch({
              selection: { anchor: tapPos },
              scrollIntoView: false,
              userEvent: "select.touch",
            });
            lastTap = {
              time: now,
              x: startX,
              y: startY,
              focused: startedFocused,
            };
          }
        }
      }

      isScrolling = false;
      isLongPressing = false;
      isDragging = false;
      touchStartPos = null;
      touchEndPos = null;
      selectionAnchor = null;
      selectionHead = null;
    };

    onTouchCancel = (event: TouchEvent) => {
      this.setTouching(event.touches.length > 0);
      clearTimeout(longPressTimer);
      stopMomentum(this.view);
      if (isScrolling) {
        finishScroll(this.view);
      }
      isScrolling = false;
      isLongPressing = false;
      isDragging = false;
      touchStartPos = null;
      touchEndPos = null;
      selectionAnchor = null;
      selectionHead = null;
    };

    update(update: ViewUpdate) {
      if (
        update.docChanged &&
        update.transactions.some((tr) => tr.annotation(Transaction.userEvent))
      ) {
        wasShowingContextMenuBeforeScroll = false;
      }
    }

    destroy() {
      this.unbind();
      clearTimeout(longPressTimer);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      velocityY = 0;
      wasShowingContextMenuBeforeScroll = false;
      isScrolling = false;
      isLongPressing = false;
      isDragging = false;
      touchStartPos = null;
      touchEndPos = null;
      selectionAnchor = null;
      selectionHead = null;
      lastTap = null;
    }
  },
);

export interface TouchInputHandlerOptions {
  showContextMenu?: (
    view: EditorView,
    spec: { pos: number; end?: number },
  ) => void;
  hideContextMenu?: (view: EditorView) => void;
  isContextMenuOpen?: (view: EditorView) => boolean;
  isTouchEnvironment?: () => boolean;
}

export interface TouchInputHandlerConfig extends TouchInputHandlerOptions {
  isTouchEnvironment: () => boolean;
}

const touchInputHandlerConfig = Facet.define<
  TouchInputHandlerConfig,
  TouchInputHandlerConfig
>({
  combine(configs) {
    return combineConfig(configs, {});
  },
});

export function touchInputHandler(options: TouchInputHandlerOptions = {}) {
  const config: TouchInputHandlerConfig = {
    isTouchEnvironment,
    ...options,
  };

  if (!config.isTouchEnvironment()) {
    return [];
  }

  return [
    touchInputHandlerConfig.of(config),
    touchInputTheme,

    drawSelection(),

    selectionHandleTheme,
    selectionHandlePlugin,

    touchEventsPlugin,

    EditorView.domEventHandlers({
      touchstart: () => true,
      touchmove: () => true,
      touchend: () => true,
      touchcancel: () => true,
    }),
  ];
}
