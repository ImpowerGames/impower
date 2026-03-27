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

const viewportPlugin = ViewPlugin.fromClass(
  class {
    view: EditorView;

    lastKeyboardHeight = 0;

    constructor(view: EditorView) {
      this.view = view;
      this.bind();
      this.onVisualViewportUpdate();
    }

    onVisualViewportUpdate = (e?: Event) => {
      const config = this.view.state.facet(mobileViewportManagerConfig);

      if (!config.isTouchEnvironment()) {
        return;
      }

      const vv = window.visualViewport;
      if (!vv) return;

      // Prevent the browser from trying to scroll the hidden body
      // when the input is focused.
      window.scrollTo(0, 0);

      // Get the root (either document or the ShadowRoot)
      const root = this.view.dom.getRootNode() as Document | ShadowRoot;

      // Check if focus is in the main text area OR inside any editor panel/widget
      // We check both the global activeElement and the ShadowRoot's activeElement
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

      // If the editor is losing focus or doesn't currently have focus,
      // release the height constraint and ignore the trailing resize events
      // from the keyboard animation.
      if (!isFocusEvent && (isBlurEvent || !isEditorInputFocused)) {
        document.body.style.height = "";
        document.documentElement.classList.remove("keyboard-open");
        this.view.dom.classList.remove("keyboard-open");
        closeKeyboardToolbar(this.view);
        this.lastKeyboardHeight = 0;
        return;
      }

      // We only reach here if the editor has focus, so we can safely
      // lock the body height to the visual viewport.
      document.body.style.height = `${vv.height}px`;

      // Measure keyboard height
      const keyboardHeight = window.innerHeight - vv.height;

      if (keyboardHeight > 0) {
        openKeyboardToolbar(this.view);
        closeLintPanel(this.view);
        closeReferencePanel(this.view);
      } else {
        closeKeyboardToolbar(this.view);
      }

      if (keyboardHeight > 0) {
        document.body.style.setProperty(
          "--keyboard-height",
          `${keyboardHeight}px`,
        );
      }

      if (keyboardHeight > this.lastKeyboardHeight) {
        // Is opening keyboard
        document.documentElement.classList.add("keyboard-open");
        this.view.dom.classList.add("keyboard-open");
      } else if (
        keyboardHeight === 0 ||
        keyboardHeight < this.lastKeyboardHeight
      ) {
        // Is closing keyboard
        document.documentElement.classList.remove("keyboard-open");
        this.view.dom.classList.remove("keyboard-open");
      }

      if (keyboardHeight > 0 && this.view.hasFocus) {
        // Scroll so cursor remains visible
        this.view.dispatch({
          effects: EditorView.scrollIntoView(this.view.state.selection.main, {
            y: "nearest",
          }),
        });
      }

      this.lastKeyboardHeight = keyboardHeight;
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
      this.view.scrollDOM.addEventListener(
        "focus",
        this.onVisualViewportUpdate,
      );
      this.view.scrollDOM.addEventListener("blur", this.onVisualViewportUpdate);
    }

    destroy() {
      this.unbind();
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
