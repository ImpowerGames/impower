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
  showContextMenu?: (view: EditorView, pos: number, end: number) => void;
  hideContextMenu?: (view: EditorView) => void;
  isContextMenuOpen?: (view: EditorView) => boolean;
}

const touchInputHandlerConfig = Facet.define<
  TouchInputHandlerConfig,
  TouchInputHandlerConfig
>({
  combine(configs) {
    return combineConfig(configs, {});
  },
});

/**
 * A custom CodeMirror 6 extension to handle mobile touch interactions
 * without triggering the "scroll-to-input" browser behavior,
 * (includes manual context menu management and drag handles)
 */
export function touchInputHandler(config: TouchInputHandlerConfig = {}) {
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
  let lastTouchY = 0;
  let lastTimestamp = 0;
  let velocityY = 0;
  let rafId: number | null = null;

  const LONG_PRESS_DURATION = 500;
  const SCROLL_THRESHOLD = 10;
  const FRICTION = 0.95;
  const VELOCITY_LIMIT = 0.5;

  const stopMomentum = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    velocityY = 0;
  };

  const applyMomentum = (view: EditorView) => {
    if (Math.abs(velocityY) < VELOCITY_LIMIT) {
      // Done scrolling
      rafId = null;
      if (wasShowingContextMenuBeforeScroll) {
        const selection = view.state.selection.main;
        config.showContextMenu?.(view, selection.from, selection.to);
      }
      return;
    }
    view.scrollDOM.scrollTop += velocityY;
    velocityY *= FRICTION;
    rafId = requestAnimationFrame(() => applyMomentum(view));
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
        transform: "translate(-50%, -50%)",
        width: "48px",
        height: "48px",
      },
    },
    ".cm-touch-selection-handle-start": {
      borderTopRightRadius: "0",
      transform: "translate(-100%, 0)",
    },
    ".cm-touch-selection-handle-end": {
      borderTopLeftRadius: "0",
    },
    ".cm-touch-selection-handle-cursor": {
      /* Android-style cursor handle: balanced teardrop pointing up */
      borderTopLeftRadius: "0",
      transform: "translate(-50%, 0) rotate(45deg)",
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

        // Prevent default to stop scrolling, stop propagation so the main
        // editor touchstart doesn't wipe the selection.
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
            config.showContextMenu?.(this.view, from, to);
          }, 10);
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
              this.startHandle.style.opacity = "0";
              this.startHandle.style.pointerEvents = "none";
              this.endHandle.style.opacity = "0";
              this.endHandle.style.pointerEvents = "none";
              this.cursorHandle.style.opacity = "0";
              this.cursorHandle.style.pointerEvents = "none";
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
                el.style.opacity = "1";
                el.style.pointerEvents = "auto";
                el.style.left = `${info.left}px`;
                el.style.top = `${info.top}px`;
              } else {
                el.style.opacity = "0";
                el.style.pointerEvents = "none";
              }
            };

            if (measure.type === "cursor") {
              this.startHandle.style.opacity = "0";
              this.startHandle.style.pointerEvents = "none";
              this.endHandle.style.opacity = "0";
              this.endHandle.style.pointerEvents = "none";
              updateHandle(this.cursorHandle, measure.head);
            } else {
              this.cursorHandle.style.opacity = "0";
              this.cursorHandle.style.pointerEvents = "none";
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
      constructor(view: EditorView) {
        this.view = view;
        view.contentDOM.addEventListener("touchstart", this.onTouchStart, {
          passive: false,
        });
        view.contentDOM.addEventListener("touchmove", this.onTouchMove, {
          passive: false,
        });
        view.contentDOM.addEventListener("touchend", this.onTouchEnd, {
          passive: false,
        });
        view.contentDOM.addEventListener("touchcancel", this.onTouchCancel, {
          passive: false,
        });
      }

      onTouchStart = (event: TouchEvent) => {
        event.preventDefault();
        event.stopPropagation();
        stopMomentum();

        const touch = event.touches[0]!;
        if (touch == null) return;

        startX = touch.clientX;
        startY = touch.clientY;
        lastTouchY = startY;
        lastTimestamp = Date.now();

        startedFocused = this.view.hasFocus;
        isDragging = false;
        isScrolling = false;
        isLongPressing = false;
        wasShowingContextMenuBeforeScroll = false;

        const pos = this.view.posAtCoords({ x: startX, y: startY });
        if (pos == null) return;

        touchStartPos = pos;

        const config = this.view.state.facet(touchInputHandlerConfig);

        longPressTimer = setTimeout(() => {
          if (isScrolling) return;

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

          config.showContextMenu?.(this.view, selection.from, selection.to);

          isLongPressing = true;
        }, LONG_PRESS_DURATION);

        selectionAnchor = pos;
        selectionHead = pos;
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

        const now = Date.now();
        const dt = now - lastTimestamp;

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
            if (dt > 0) velocityY = deltaY / (dt / 16);
          }
        } else if (isDragging) {
          if (startedFocused && this.view.hasFocus) {
            config.hideContextMenu?.(this.view);
            selectionHead = this.view.posAtCoords({
              x: touch.clientX,
              y: touch.clientY,
            });
            if (selectionAnchor != null && selectionHead !== null) {
              this.view.dispatch({
                selection: { anchor: selectionAnchor, head: selectionHead },
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
        lastTimestamp = now;
      };

      onTouchEnd = (event: TouchEvent) => {
        event.preventDefault();
        event.stopPropagation();

        clearTimeout(longPressTimer);

        const config = this.view.state.facet(touchInputHandlerConfig);

        if (isScrolling) {
          rafId = requestAnimationFrame(() => applyMomentum(this.view));
        } else if (isDragging && touchStartPos !== touchEndPos) {
          if (startedFocused) {
            const selection = this.view.state.selection.main;
            config.showContextMenu?.(this.view, selection.from, selection.to);
          }
        } else if (!isLongPressing) {
          config.hideContextMenu?.(this.view);
          const tapPos = selectionAnchor ?? touchEndPos;
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
        this.view.contentDOM.removeEventListener(
          "touchstart",
          this.onTouchStart,
        );
        this.view.contentDOM.removeEventListener("touchmove", this.onTouchMove);
        this.view.contentDOM.removeEventListener("touchend", this.onTouchEnd);
        this.view.contentDOM.removeEventListener(
          "touchcancel",
          this.onTouchCancel,
        );
      }
    },
  );

  return [
    touchInputHandlerConfig.of(config),

    drawSelection(),

    selectionHandleTheme,
    selectionHandlePlugin,

    touchEventsPlugin,

    EditorView.baseTheme({
      "& .cm-line": {
        paddingLeft: "0 !important",
      },
    }),
  ];
}
