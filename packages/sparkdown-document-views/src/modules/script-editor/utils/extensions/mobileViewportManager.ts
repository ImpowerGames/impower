import { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { fitToKeyboard, keyboard } from "@impower/impower-ui/layout";
import {
  closeKeyboardToolbar,
  hasScriptMode,
  openKeyboardToolbar,
} from "./keyboardToolbar";

const viewportTheme = EditorView.baseTheme({
  "&": {
    overscrollBehavior: "none !important",
    touchAction: "pan-y !important",
  },
  "& *": {
    overscrollBehavior: "none !important",
    touchAction: "pan-y !important",
  },
  ".cm-scroller": {
    WebkitOverflowScrolling: "touch !important",
  },
});

const CLOSE_KEYBOARD_DELAY = 150;

const viewportPlugin = ViewPlugin.fromClass(
  class {
    view: EditorView;
    closeTimeout?: ReturnType<typeof setTimeout>;
    destroyed = false;
    releaseFit: () => void;

    constructor(view: EditorView) {
      this.view = view;
      this.releaseFit = fitToKeyboard(() => this.onKeyboardUpdate());
      this.bind();
      this.onKeyboardUpdate();
    }

    openKeyboardUI() {
      requestAnimationFrame(() => {
        if (this.destroyed) return;
        this.view.dom.classList.add("keyboard-open");
        if (!hasScriptMode(this.view.state)) {
          openKeyboardToolbar(this.view);
        }
      });
    }

    closeKeyboardUI() {
      requestAnimationFrame(() => {
        if (this.destroyed) return;
        this.view.dom.classList.remove("keyboard-open");
        if (!hasScriptMode(this.view.state)) {
          closeKeyboardToolbar(this.view);
        }
      });
    }

    onKeyboardUpdate = (e?: Event) => {
      const root = this.view.dom.getRootNode() as Document | ShadowRoot;

      const activeElt = root.activeElement;
      const isActiveEltEditable =
        activeElt &&
        (activeElt instanceof HTMLInputElement ||
          activeElt instanceof HTMLTextAreaElement ||
          (activeElt as HTMLElement).isContentEditable);
      const isEditorInputFocused =
        this.view.hasFocus ||
        (activeElt && this.view.dom.contains(activeElt) && isActiveEltEditable);

      const isFocusEvent = e?.type === "focusin" || e?.type === "focus";

      const isBlurEvent = e?.type === "focusout" || e?.type === "blur";

      const isKeyboardVisible = keyboard().open;

      if (
        isKeyboardVisible &&
        !isFocusEvent &&
        (isBlurEvent || !isEditorInputFocused)
      ) {
        if (!this.closeTimeout) {
          this.closeTimeout = setTimeout(() => {
            this.closeKeyboardUI();
            this.closeTimeout = undefined;
          }, CLOSE_KEYBOARD_DELAY);
        }
        return;
      }

      if (this.closeTimeout) {
        clearTimeout(this.closeTimeout);
        this.closeTimeout = undefined;
      }

      if (isKeyboardVisible) {
        this.openKeyboardUI();
      } else {
        this.closeKeyboardUI();
      }

      if (isKeyboardVisible && this.view.hasFocus) {
        requestAnimationFrame(() => {
          this.view.dispatch({
            effects: EditorView.scrollIntoView(this.view.state.selection.main, {
              y: "nearest",
            }),
          });
        });
      }
    };

    bind() {
      window.addEventListener("focusout", this.onKeyboardUpdate);
      this.view.scrollDOM.addEventListener("focus", this.onKeyboardUpdate);
      this.view.scrollDOM.addEventListener("blur", this.onKeyboardUpdate);
    }

    unbind() {
      window.removeEventListener("focusout", this.onKeyboardUpdate);
      this.view.scrollDOM.removeEventListener("focus", this.onKeyboardUpdate);
      this.view.scrollDOM.removeEventListener("blur", this.onKeyboardUpdate);
      if (this.closeTimeout) {
        clearTimeout(this.closeTimeout);
      }
    }

    destroy() {
      this.destroyed = true;
      this.unbind();
      this.releaseFit();
      this.view.dom.classList.remove("keyboard-open");
    }
  },
);

export function mobileViewportManager(): Extension {
  return [
    viewportTheme,
    viewportPlugin,
    EditorView.domEventObservers({
      focus: (e, view) => {
        view.plugin(viewportPlugin)?.onKeyboardUpdate(e);
      },
      blur: (e, view) => {
        view.plugin(viewportPlugin)?.onKeyboardUpdate(e);
      },
    }),
  ];
}
