import { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { fitToKeyboard, keyboard } from "@impower/impower-ui/layout";
import {
  closeKeyboardToolbar,
  hasScriptMode,
  openKeyboardToolbar,
} from "./keyboardToolbar";
import { scrollCaretIntoView } from "./caretScrollMargin";

const viewportTheme = EditorView.baseTheme({
  "&": {
    overscrollBehavior: "none !important",
    touchAction: "pan-y pinch-zoom !important",
  },
  "& *": {
    overscrollBehavior: "none !important",
    touchAction: "pan-y pinch-zoom !important",
  },
  ".cm-scroller": {
    WebkitOverflowScrolling: "touch !important",
  },
});

const viewportPlugin = ViewPlugin.fromClass(
  class {
    view: EditorView;
    frame?: number;
    destroyed = false;
    releaseFit: () => void;

    constructor(view: EditorView) {
      this.view = view;
      this.releaseFit = fitToKeyboard(() => this.onKeyboardUpdate());
      this.bind();
      this.onKeyboardUpdate();
    }

    editorFocused() {
      const root = this.view.dom.getRootNode() as Document | ShadowRoot;
      const active = root.activeElement;
      return (
        this.view.hasFocus ||
        (active != null &&
          this.view.dom.contains(active) &&
          (active instanceof HTMLInputElement ||
            active instanceof HTMLTextAreaElement ||
            (active as HTMLElement).isContentEditable))
      );
    }

    apply() {
      const open = keyboard().open && this.editorFocused();
      this.view.dom.classList.toggle("keyboard-open", open);
      if (!hasScriptMode(this.view.state)) {
        if (open) openKeyboardToolbar(this.view);
        else closeKeyboardToolbar(this.view);
      }
      if (open && this.view.hasFocus) {
        scrollCaretIntoView(this.view);
      }
    }

    onKeyboardUpdate = () => {
      if (this.frame != null) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = undefined;
        if (!this.destroyed) this.apply();
      });
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
      if (this.frame != null) {
        cancelAnimationFrame(this.frame);
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
      focus: (_, view) => {
        view.plugin(viewportPlugin)?.onKeyboardUpdate();
      },
      blur: (_, view) => {
        view.plugin(viewportPlugin)?.onKeyboardUpdate();
      },
    }),
  ];
}
