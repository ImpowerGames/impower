import {
  combineConfig,
  EditorSelection,
  EditorState,
  Facet,
} from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";

export interface TouchInputHandlerConfig {
  showContextMenu?: (
    view: EditorView,
    spec: { pos: number; end?: number; above?: boolean },
  ) => void;
  hideContextMenu?: (view: EditorView) => void;
  isContextMenuOpen?: (view: EditorView) => boolean;
  isTouchEnvironment?: () => boolean;
}

const touchInputHandlerConfig = Facet.define<
  TouchInputHandlerConfig,
  TouchInputHandlerConfig
>({
  combine(configs) {
    return combineConfig(configs, {});
  },
});

const isTouchEnvironment = () =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  ) ||
  (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
  navigator.maxTouchPoints > 0;

/**
 * A custom CodeMirror 6 extension to handle mobile touch interactions
 * without triggering the "scroll-to-input" browser behavior,
 * (includes manual context menu management and drag handles)
 */
export function touchInputHandler(config: TouchInputHandlerConfig = {}) {
  const isTouch = config.isTouchEnvironment ?? isTouchEnvironment;
  if (!isTouch()) {
    return [];
  }

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

  // Momentum variables
  let velocityTracker: { y: number; time: number }[] = [];
  let velocityY = 0;
  let lastTouchY = 0;
  let rafId: number | null = null;
  let lastFrameTime = 0;
  let stoppedMomentum = false;

  const LONG_PRESS_DURATION = 500;
  const SCROLL_THRESHOLD = 10;
  const FRICTION = 0.95; // Applied per 60fps frame (16.66ms)
  const VELOCITY_LIMIT = 0.5;
  const VELOCITY_BOOST = 1.2;
  const TRACKING_WINDOW_MS = 100;
  const MS_PER_FRAME = 16.66; // 16.66ms is roughly 1 frame at 60fps.

  const stopMomentum = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    velocityY = 0;
  };

  const applyMomentum = (time: DOMHighResTimeStamp, view: EditorView) => {
    const dt = time - lastFrameTime;
    lastFrameTime = time;

    if (Math.abs(velocityY) < VELOCITY_LIMIT) {
      rafId = null; // Done scrolling
      if (wasShowingContextMenuBeforeScroll) {
        const selection = view.state.selection.main;
        config.showContextMenu?.(view, {
          pos: selection.from,
          end: selection.to,
          above: true,
        });
      }
      return;
    }

    const prevScrollTop = view.scrollDOM.scrollTop;
    view.scrollDOM.scrollTop += velocityY;

    // If we hit the top or bottom, the browser clamps scrollTop.
    // If it didn't change, we hit a wall and should stop animating.
    if (view.scrollDOM.scrollTop === prevScrollTop) {
      rafId = null;
      return;
    }

    // Apply time-based friction (frame-rate independent)
    // 16.66ms is roughly 1 frame at 60fps.
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
      /* Invisible Touch Target */
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
      /* Android-style cursor handle: balanced teardrop pointing up */
      borderTopLeftRadius: "0",
      transform: "translate(-50%, 0) rotate(45deg)",
      "&::after": {
        transform: "translate(-30%, -30%)",
      },
    },
  });

  const selectionHandlePlugin = ViewPlugin.fromClass(
    class {
      startHandle: HTMLElement;
      endHandle: HTMLElement;
      cursorHandle: HTMLElement;
      view: EditorView;
      isSelecting = false;

      constructor(view: EditorView) {
        this.view = view;

        // Create DOM elements for handles
        this.startHandle = document.createElement("div");
        this.startHandle.className =
          "cm-touch-selection-handle cm-touch-selection-handle-start";

        this.endHandle = document.createElement("div");
        this.endHandle.className =
          "cm-touch-selection-handle cm-touch-selection-handle-end";

        this.cursorHandle = document.createElement("div");
        this.cursorHandle.className =
          "cm-touch-selection-handle cm-touch-selection-handle-cursor";

        // Append to the main editor DOM
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

        // Prevent default to stop scrolling
        handle.addEventListener("touchstart", (e) => {
          this.isSelecting = true;
          e.preventDefault();
          e.stopPropagation();
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
          // Wait for dispatch to finish, then show menu
          setTimeout(() => {
            const from = this.view.state.selection.main.from;
            const to = this.view.state.selection.main.to;
            config.showContextMenu?.(this.view, {
              pos: from,
              end: to,
              above: true,
            });
          }, 10);
        });

        handle.addEventListener("touchcancel", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
      }

      attachCursorHandleListeners(handle: HTMLElement) {
        handle.addEventListener("touchstart", (e) => {
          if (this.isSelecting) return;
          e.preventDefault();
          e.stopPropagation();
          const config = this.view.state.facet(touchInputHandlerConfig);
          config.hideContextMenu?.(this.view);
        });

        handle.addEventListener("touchmove", (e) => {
          if (this.isSelecting) return;
          const touch = e.touches[0]!;
          if (touch == null) return;

          e.preventDefault();
          e.stopPropagation();

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
          this.scheduleUpdate(update.state);
        }
      }

      scheduleUpdate(state: EditorState) {
        this.view.requestMeasure({
          read: (view) => {
            // Don't show handles if not focused
            if (!view.hasFocus) return null;

            const sel = state.selection.main;
            const editorRect = view.dom.getBoundingClientRect();

            // We need to know if the handle is actually within the visible scroller area
            const scrollRect = view.scrollDOM.getBoundingClientRect();

            const getHandleInfo = (pos: number) => {
              const coords = view.coordsAtPos(pos);
              if (!coords) return null;

              // Check if pos is vertically within the scroller's visible area
              const isVisible =
                coords.bottom > scrollRect.top &&
                coords.top < scrollRect.bottom;

              return {
                pos,
                left: coords.left - editorRect.left,
                top: coords.bottom - editorRect.top,
                visible: isVisible,
              };
            };

            return {
              type: !sel.empty || this.isSelecting ? "range" : "cursor",
              anchor: getHandleInfo(sel.anchor),
              head: getHandleInfo(sel.head),
            };
          },
          write: (measure) => {
            if (!measure) {
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
      /* Listen to scroll events specifically to re-measure handle positions */
      eventHandlers: {
        scroll(event, view) {
          this.scheduleUpdate(view.state);
        },
      },
    },
  );

  const touchEventsPlugin = ViewPlugin.fromClass(
    class {
      view: EditorView;

      keyboardHeight = 0;

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
        this.view.scrollDOM.addEventListener(
          "touchcancel",
          this.onTouchCancel,
          {
            passive: false,
          },
        );
        window.visualViewport?.addEventListener(
          "resize",
          this.onVisualViewportChange,
        );
        window.visualViewport?.addEventListener(
          "scroll",
          this.onVisualViewportChange,
        );
        window.addEventListener("focusin", this.onVisualViewportChange);
        window.addEventListener("focusout", this.onVisualViewportChange);
      }

      unbind() {
        this.view.scrollDOM.removeEventListener(
          "touchstart",
          this.onTouchStart,
        );
        this.view.scrollDOM.removeEventListener("touchmove", this.onTouchMove);
        this.view.scrollDOM.removeEventListener("touchend", this.onTouchEnd);
        this.view.scrollDOM.removeEventListener(
          "touchcancel",
          this.onTouchCancel,
        );
        window.visualViewport?.removeEventListener(
          "resize",
          this.onVisualViewportChange,
        );
        window.visualViewport?.removeEventListener(
          "scroll",
          this.onVisualViewportChange,
        );
        window.removeEventListener("focusin", this.onVisualViewportChange);
        window.removeEventListener("focusout", this.onVisualViewportChange);
      }

      onVisualViewportChange = () => {
        const vv = window.visualViewport;
        if (!vv) return;
        const oldKeyboardHeight = this.keyboardHeight;
        this.keyboardHeight = window.innerHeight - vv.height;
        if (oldKeyboardHeight > this.keyboardHeight) {
          // Is closing keyboard, so unfocus editor
          this.view.contentDOM.blur();
        }
      };

      onTouchStart = (event: TouchEvent) => {
        event.preventDefault();
        event.stopPropagation();

        stoppedMomentum = rafId !== null;

        stopMomentum();

        const touch = event.touches[0]!;

        if (touch == null) return;

        startX = touch.clientX;
        startY = touch.clientY;
        lastTouchY = startY;

        startedFocused = this.view.hasFocus;
        isDragging = false;
        isScrolling = false;
        isLongPressing = false;

        // Reset velocity tracking
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

          const config = this.view.state.facet(touchInputHandlerConfig);

          const word = this.view.state.wordAt(pos);
          selectionAnchor = word ? word.from : pos;
          selectionHead = word ? word.to : pos;

          const selection = EditorSelection.range(
            selectionAnchor,
            selectionHead,
          );

          if (!this.view.hasFocus) this.view.focus();

          this.view.dispatch({
            selection,
            scrollIntoView: false,
            userEvent: "select.touch",
          });

          config.showContextMenu?.(this.view, {
            pos: selection.from,
            end: selection.to,
            above: true,
          });

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
          }

          if (isScrolling) {
            if (config.isContextMenuOpen?.(this.view)) {
              wasShowingContextMenuBeforeScroll = true;
            }
            config.hideContextMenu?.(this.view);

            const deltaY = lastTouchY - touch.clientY;
            this.view.scrollDOM.scrollTop += deltaY;

            // Track movement for velocity calculation
            velocityTracker.push({ y: touch.clientY, time: now });

            // Prune old tracking points (keep only the last 100ms)
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
            const to = Math.max(
              ...[pos, selectionHead].filter((n) => n != null),
            );
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

        clearTimeout(longPressTimer);

        const config = this.view.state.facet(touchInputHandlerConfig);

        if (isScrolling) {
          const now = performance.now();

          // Clean up points that are older than our window just before releasing
          velocityTracker = velocityTracker.filter(
            (p) => now - p.time <= TRACKING_WINDOW_MS,
          );

          if (velocityTracker.length > 1) {
            const oldest = velocityTracker[0]!;
            const newest = velocityTracker[velocityTracker.length - 1]!;
            const dt = newest.time - oldest.time;

            if (dt > 0) {
              // Calculate velocity normalized to a 60fps frame
              const rawVelocity = ((oldest.y - newest.y) / dt) * MS_PER_FRAME;
              // Apply non-linear scaling to amplify fast flicks and dampen slow ones.
              // Squaring the velocity magnitude creates a more expressive curve.
              const magnitude = Math.abs(rawVelocity);
              const direction = Math.sign(rawVelocity);

              // Using Math.pow(magnitude, 1.2) for a subtle curve,
              // or magnitude * magnitude for a very aggressive one.
              velocityY = direction * Math.pow(magnitude, VELOCITY_BOOST);
            }
          }

          // If there is enough velocity, start the momentum loop
          if (Math.abs(velocityY) > VELOCITY_LIMIT) {
            lastFrameTime = performance.now();
            rafId = requestAnimationFrame((time) =>
              applyMomentum(time, this.view),
            );
          }
        } else if (isDragging && touchStartPos !== touchEndPos) {
          if (startedFocused) {
            const selection = this.view.state.selection.main;
            config.showContextMenu?.(this.view, {
              pos: selection.from,
              end: selection.to,
              above: true,
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
            if (!this.view.hasFocus) this.view.focus();
            this.view.dispatch({
              selection: { anchor: tapPos },
              scrollIntoView: false,
              userEvent: "select.touch",
            });
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

      onTouchCancel = () => {
        clearTimeout(longPressTimer);
        stopMomentum();
        isScrolling = false;
        isLongPressing = false;
        isDragging = false;
        touchStartPos = null;
        touchEndPos = null;
        selectionAnchor = null;
        selectionHead = null;
      };

      destroy() {
        this.unbind();
      }
    },
  );

  return [
    touchInputHandlerConfig.of(config),

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
