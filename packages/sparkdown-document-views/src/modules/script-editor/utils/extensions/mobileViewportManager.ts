import { closeLintPanel } from "@codemirror/lint";
import { combineConfig, Extension, Facet } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { closeReferencePanel } from "@impower/codemirror-vscode-lsp-client/src";
import { closeKeyboardToolbar, openKeyboardToolbar } from "./keyboardToolbar";

const isTouchEnvironment = () =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  ) ||
  (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
  navigator.maxTouchPoints > 0;

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
    lockedLayout = false;

    constructor(view: EditorView) {
      this.view = view;
      this.bind();
      this.onVisualViewportUpdate();
    }

    openKeyboardUI(keyboardHeight: number) {
      requestAnimationFrame(() => {
        if (this.destroyed) return;
        document.body.style.setProperty(
          "--keyboard-height",
          `${keyboardHeight}px`,
        );
        document.documentElement.classList.add("keyboard-open");
        this.view.dom.classList.add("keyboard-open");
        openKeyboardToolbar(this.view);
        closeLintPanel(this.view);
        closeReferencePanel(this.view);
      });
    }

    closeKeyboardUI() {
      requestAnimationFrame(() => {
        if (this.destroyed) return;
        this.lockedLayout = false;
        document.body.style.height = "";
        document.documentElement.classList.remove("keyboard-open");
        this.view.dom.classList.remove("keyboard-open");
        closeKeyboardToolbar(this.view);
      });
    }

    onVisualViewportUpdate = (e?: Event) => {
      const config = this.view.state.facet(mobileViewportManagerConfig);

      if (!config.isTouchEnvironment()) {
        return;
      }

      const vv = window.visualViewport;
      if (!vv) return;

      window.scrollTo(0, 0);

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

      const keyboardHeight = window.innerHeight - vv.height;

      if (
        keyboardHeight > 0 &&
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

      this.lockedLayout = true;
      document.body.style.height = `${vv.height}px`;

      const isKeyboardVisible = keyboardHeight > 0;

      if (isKeyboardVisible) {
        this.openKeyboardUI(keyboardHeight);
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
      window.visualViewport?.addEventListener(
        "resize",
        this.onVisualViewportUpdate,
      );
      window.visualViewport?.addEventListener(
        "scroll",
        this.onVisualViewportUpdate,
      );
      window.addEventListener("focusout", this.onVisualViewportUpdate);
      this.view.scrollDOM.addEventListener(
        "focus",
        this.onVisualViewportUpdate,
      );
      this.view.scrollDOM.addEventListener("blur", this.onVisualViewportUpdate);
    }

    unbind() {
      window.visualViewport?.removeEventListener(
        "resize",
        this.onVisualViewportUpdate,
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        this.onVisualViewportUpdate,
      );
      window.removeEventListener("focusout", this.onVisualViewportUpdate);
      this.view.scrollDOM.removeEventListener(
        "focus",
        this.onVisualViewportUpdate,
      );
      this.view.scrollDOM.removeEventListener(
        "blur",
        this.onVisualViewportUpdate,
      );
      if (this.closeTimeout) {
        clearTimeout(this.closeTimeout);
      }
    }

    destroy() {
      this.destroyed = true;
      this.unbind();
      if (this.lockedLayout) {
        document.body.style.height = "";
        document.documentElement.classList.remove("keyboard-open");
      }
    }
  },
);

export interface MobileViewportManagerOptions {
  isTouchEnvironment?: () => boolean;
}

export interface MobileViewportManagerConfig extends MobileViewportManagerOptions {
  isTouchEnvironment: () => boolean;
}

const mobileViewportManagerConfig = Facet.define<
  MobileViewportManagerConfig,
  MobileViewportManagerConfig
>({
  combine(configs) {
    return combineConfig(configs, {});
  },
});

export function mobileViewportManager(
  options: MobileViewportManagerOptions = {},
): Extension {
  const config: MobileViewportManagerConfig = {
    isTouchEnvironment,
    ...options,
  };

  if (!config.isTouchEnvironment()) {
    return [];
  }

  return [
    viewportTheme,
    viewportPlugin,
    mobileViewportManagerConfig.of(config),
    EditorView.domEventObservers({
      focus: (e, view) => {
        view.plugin(viewportPlugin)?.onVisualViewportUpdate(e);
      },
      blur: (e, view) => {
        view.plugin(viewportPlugin)?.onVisualViewportUpdate(e);
      },
    }),
  ];
}
