import { combineConfig, Facet } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";

export interface TouchInputHandlerConfig {
  showContextMenu?: (view: EditorView, pos: number) => void;
  hideContextMenu?: (view: EditorView) => void;
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
  let lastTapTime = 0;
  let isDragging = false;
  let isScrolling = false;
  let isLongPressing = false;
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
      rafId = null;
      return;
    }
    view.scrollDOM.scrollTop += velocityY;
    velocityY *= FRICTION;
    rafId = requestAnimationFrame(() => applyMomentum(view));
  };

  const selectionHandleTheme = EditorView.baseTheme({
    ".cm-touch-selection-handle": {
      position: "absolute",
      width: "18px",
      height: "18px",
      backgroundColor: "#1976d2",
      borderRadius: "50%",
      zIndex: 100,
      pointerEvents: "auto",
      transition: "opacity 0.05s linear",
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

        this.attachHandleListeners(this.startHandle, true);
        this.attachHandleListeners(this.endHandle, false);
        this.attachCursorListeners(this.cursorHandle);

        this.scheduleUpdate();
      }

      attachHandleListeners(handle: HTMLElement, isStart: boolean) {
        let selectionHandleAnchor: number | null = null;
        let selectionHandleHead: number | null = null;

        // Prevent default to stop scrolling, stop propagation so the main
        // editor touchstart doesn't wipe the selection.
        handle.addEventListener("touchstart", (e) => {
          e.preventDefault();
          e.stopPropagation();
          config.hideContextMenu?.(this.view);
        });

        handle.addEventListener("touchmove", (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (selectionHandleAnchor != null) {
            const touch = e.touches[0]!;
            if (touch) {
              const pos = this.view.posAtCoords(
                {
                  x: touch.clientX,
                  y: touch.clientY - handle.offsetHeight,
                },
                false,
              );
              selectionHandleHead = pos;
              if (selectionHandleAnchor != null) {
                this.view.dispatch({
                  selection: {
                    anchor: selectionHandleAnchor,
                    head: selectionHandleHead,
                  },
                  scrollIntoView: false,
                  userEvent: "select.touch",
                });
              }
            }
          } else {
            const selection = this.view.state.selection.main;
            if (selection) {
              selectionHandleAnchor = selection.anchor;
              selectionHandleHead = selection.head;
              this.view.dispatch({
                selection: {
                  anchor: selectionHandleAnchor,
                  head: selectionHandleHead,
                },
                scrollIntoView: false,
                userEvent: "select.touch",
              });
            }
          }
        });

        handle.addEventListener("touchend", (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Wait for dispatch to finish, then show menu
          setTimeout(() => {
            const currentSel = this.view.state.selection.main;
            config.showContextMenu?.(
              this.view,
              isStart ? currentSel.from : currentSel.to,
            );
          }, 10);
        });
      }

      attachCursorListeners(handle: HTMLElement) {
        handle.addEventListener("touchstart", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const config = this.view.state.facet(touchInputHandlerConfig);
          config.hideContextMenu?.(this.view);
        });

        handle.addEventListener("touchmove", (e) => {
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
            this.view.dispatch({
              selection: { anchor: pos },
              scrollIntoView: true,
              userEvent: "select.touch",
            });
          }
        });

        handle.addEventListener("touchend", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const config = this.view.state.facet(touchInputHandlerConfig);
          setTimeout(() => {
            config.showContextMenu?.(
              this.view,
              this.view.state.selection.main.head,
            );
          }, 50);
        });
      }

      update(update: ViewUpdate) {
        if (
          update.selectionSet ||
          update.geometryChanged ||
          update.viewportChanged ||
          update.docChanged
        ) {
          this.scheduleUpdate();
        }
      }

      scheduleUpdate() {
        this.view.requestMeasure({
          read: (view) => {
            const sel = view.state.selection.main;
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
                left: coords.left - editorRect.left,
                top: coords.bottom - editorRect.top,
                visible: isVisible,
              };
            };

            if (sel.empty) {
              return { type: "cursor", cursor: getHandleInfo(sel.head) };
            } else {
              return {
                type: "range",
                start: getHandleInfo(sel.from),
                end: getHandleInfo(sel.to),
              };
            }
          },
          write: (measure) => {
            if (!measure) return;

            const updateHandle = (
              el: HTMLElement,
              info:
                | { left: number; top: number; visible: boolean }
                | null
                | undefined,
            ) => {
              if (info && info.visible) {
                el.style.opacity = "1";
                el.style.left = `${info.left}px`;
                el.style.top = `${info.top}px`;
              } else {
                el.style.opacity = "0";
              }
            };

            if (measure.type === "cursor") {
              this.startHandle.style.opacity = "0";
              this.endHandle.style.opacity = "0";
              updateHandle(this.cursorHandle, measure.cursor);
            } else {
              this.cursorHandle.style.opacity = "0";
              updateHandle(this.startHandle, measure.start);
              updateHandle(this.endHandle, measure.end);
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
        scroll() {
          this.scheduleUpdate();
        },
      },
    },
  );

  return [
    touchInputHandlerConfig.of(config),

    drawSelection(),

    selectionHandleTheme,
    selectionHandlePlugin,

    EditorView.baseTheme({
      "& .cm-line": {
        paddingLeft: "0 !important",
      },
    }),

    EditorView.domEventHandlers({
      touchstart(event, view) {
        event.preventDefault();
        stopMomentum();

        const touch = event.touches[0]!;
        if (touch == null) return;

        startX = touch.clientX;
        startY = touch.clientY;
        lastTouchY = startY;
        lastTimestamp = Date.now();

        isDragging = false;
        isScrolling = false;
        isLongPressing = false;

        const pos = view.posAtCoords({ x: startX, y: startY });
        if (pos == null) return;

        const now = Date.now();

        const config = view.state.facet(touchInputHandlerConfig);

        longPressTimer = setTimeout(() => {
          if (isScrolling) return;

          isLongPressing = true;

          const word = view.state.wordAt(pos);
          isDragging = true;
          selectionAnchor = word ? word.from : pos;
          selectionHead = word ? word.to : pos;

          view.dispatch({
            selection: { anchor: selectionAnchor, head: selectionHead },
            scrollIntoView: false,
            userEvent: "select.touch",
          });

          config.showContextMenu?.(view, pos);
        }, LONG_PRESS_DURATION);

        if (now - lastTapTime < 300) {
          clearTimeout(longPressTimer);
          const word = view.state.wordAt(pos);
          if (word) {
            view.dispatch({
              selection: { anchor: word.from, head: word.to },
              scrollIntoView: false,
              userEvent: "select.touch",
            });
            config.showContextMenu?.(view, pos);
          }
          lastTapTime = 0;
          return true;
        }

        lastTapTime = now;
        selectionAnchor = pos;
        selectionHead = pos;
        return true;
      },

      touchmove(event, view) {
        const touch = event.touches[0]!;
        if (touch == null) return;

        const now = Date.now();
        const dt = now - lastTimestamp;

        const diffX = Math.abs(touch.clientX - startX);
        const diffY = Math.abs(touch.clientY - startY);

        const config = view.state.facet(touchInputHandlerConfig);

        if (!isDragging) {
          if (
            !isScrolling &&
            (diffY > SCROLL_THRESHOLD || diffX > SCROLL_THRESHOLD)
          ) {
            isScrolling = true;
            clearTimeout(longPressTimer);
          }

          if (isScrolling) {
            config.hideContextMenu?.(view);
            const deltaY = lastTouchY - touch.clientY;
            view.scrollDOM.scrollTop += deltaY;
            if (dt > 0) velocityY = deltaY / (dt / 16);
          }
        } else if (isDragging && selectionAnchor != null) {
          config.hideContextMenu?.(view);
          selectionHead = view.posAtCoords({
            x: touch.clientX,
            y: touch.clientY - 30,
          });

          if (selectionHead !== null) {
            view.dispatch({
              selection: { anchor: selectionAnchor, head: selectionHead },
              scrollIntoView: false,
              userEvent: "select.touch",
            });
          }
        }

        lastTouchY = touch.clientY;
        lastTimestamp = now;
      },

      touchend(event, view) {
        clearTimeout(longPressTimer);

        const config = view.state.facet(touchInputHandlerConfig);

        if (isScrolling) {
          rafId = requestAnimationFrame(() => applyMomentum(view));
        } else if (isDragging) {
          if (selectionHead != null) {
            if (!isLongPressing) {
              config.showContextMenu?.(view, selectionHead);
            }
          }
        } else {
          config.hideContextMenu?.(view);
          if (!view.hasFocus) view.focus();
          if (selectionAnchor != null) {
            view.dispatch({
              selection: { anchor: selectionAnchor },
              scrollIntoView: false,
              userEvent: "select.touch",
            });
          } else {
            const touch = event.touches[0]!;
            if (touch) {
              const pos = view.posAtCoords({
                x: touch.clientX,
                y: touch.clientY,
              });
              if (pos != null) {
                view.dispatch({
                  selection: { anchor: pos },
                  scrollIntoView: false,
                  userEvent: "select.touch",
                });
              }
            }
          }
        }

        isDragging = false;
        isScrolling = false;
        selectionAnchor = null;
        selectionHead = null;
      },

      touchcancel() {
        clearTimeout(longPressTimer);
        stopMomentum();
        isDragging = false;
        isScrolling = false;
        selectionAnchor = null;
      },
    }),
  ];
}
