import { combineConfig, Extension, Facet } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";

const isTouchEnvironment = () =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  ) ||
  (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
  navigator.maxTouchPoints > 0;

const viewportTheme = EditorView.baseTheme({
  "&": {
    overscrollBehavior: "none !important",
  },
  "& *": {
    overscrollBehavior: "none !important",
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

      // We only reach here if the editor has focus, so we can safely
      // lock the body height to the visual viewport.
      document.body.style.height = `${vv.height}px`;

      // Measure keyboard height
      const keyboardHeight = window.innerHeight - vv.height;

      if (keyboardHeight > this.lastKeyboardHeight) {
        // Is opening keyboard
        document.documentElement.classList.add("keyboard-open");
      } else if (
        keyboardHeight === 0 ||
        keyboardHeight < this.lastKeyboardHeight
      ) {
        // Is closing keyboard
        document.documentElement.classList.remove("keyboard-open");
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
      window.addEventListener("focusin", this.onVisualViewportUpdate);
      window.addEventListener("focusout", this.onVisualViewportUpdate);
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
      window.removeEventListener("focusin", this.onVisualViewportUpdate);
      window.removeEventListener("focusout", this.onVisualViewportUpdate);
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
