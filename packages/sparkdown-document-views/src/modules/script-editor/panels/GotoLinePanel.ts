import {
  EditorSelection,
  StateField,
  StateEffect,
  Prec,
  EditorState,
} from "@codemirror/state";
import {
  EditorView,
  Command,
  Panel,
  getPanel,
  showPanel,
  keymap,
} from "@codemirror/view";

export class GotoLinePanel implements Panel {
  dom: HTMLElement;

  closeButton: HTMLButtonElement;

  input: HTMLInputElement;

  submitButton: HTMLButtonElement;

  constructor(readonly view: EditorView) {
    this.dom = document.createElement("form");
    this.dom.className = "cm-gotoLine";
    this.dom.onkeydown = this.keydown.bind(this);
    this.dom.onsubmit = this.submit.bind(this);

    this.closeButton = document.createElement("button");
    this.closeButton.className = "cm-button";
    this.closeButton.name = "close";
    this.closeButton.textContent = "×";
    this.closeButton.ariaLabel = "Close";
    this.closeButton.type = "button";
    this.closeButton.onclick = () => closeGotoLinePanel(view);

    this.input = document.createElement("input");
    this.input.className = "cm-textfield";
    this.input.name = "line";
    this.input.placeholder = view.state.phrase("Go to line");
    this.input.ariaLabel = view.state.phrase("Go to line");
    this.input.autocomplete = "off";
    this.input.setAttribute("main-field", "");

    this.submitButton = document.createElement("button");
    this.submitButton.className = "cm-button";
    this.submitButton.name = "submit";
    this.submitButton.type = "submit";
    this.submitButton.textContent = view.state.phrase("go");

    this.dom.appendChild(this.closeButton);
    this.dom.appendChild(this.input);
    this.dom.appendChild(this.submitButton);
  }

  keydown(event: KeyboardEvent) {
    if (event.keyCode == 27) {
      // Escape
      event.preventDefault();
      this.view.dispatch({ effects: goToLineEffect.of(false) });
      this.view.focus();
    } else if (event.keyCode == 13) {
      // Enter
      event.preventDefault();
      this.go();
    }
  }

  submit(event: SubmitEvent) {
    event.preventDefault();
    this.go();
  }

  go() {
    let match = /^([+-])?(\d+)?(:\d+)?(%)?$/.exec(this.input.value);
    if (!match) return;
    let { state } = this.view;
    let startLine = state.doc.lineAt(state.selection.main.head);
    let [, sign, ln, cl, percent] = match;
    let col = cl ? +cl.slice(1) : 0;
    let line = ln ? +ln : startLine.number;
    if (ln && percent) {
      let pc = line / 100;
      if (sign) {
        pc = pc * (sign == "-" ? -1 : 1) + startLine.number / state.doc.lines;
      }
      line = Math.round(state.doc.lines * pc);
    } else if (ln && sign) {
      line = line * (sign == "-" ? -1 : 1) + startLine.number;
    }
    let docLine = state.doc.line(Math.max(1, Math.min(state.doc.lines, line)));
    let selection = EditorSelection.cursor(
      docLine.from + Math.max(0, Math.min(col, docLine.length))
    );
    this.view.dispatch({
      effects: [
        goToLineEffect.of(false),
        EditorView.scrollIntoView(selection.from, { y: "center" }),
      ],
      selection,
    });
    this.view.focus();
  }

  mount() {
    this.input.focus();
    this.input.select();
  }

  get pos() {
    return 80;
  }

  get top() {
    return true;
  }
}

function createGotoLinePanel(view: EditorView): Panel {
  return new GotoLinePanel(view);
}

const goToLineEffect = StateEffect.define<boolean>();

const gotoLineField = StateField.define<boolean>({
  create() {
    return false;
  },
  update(value, tr) {
    for (let e of tr.effects) {
      if (e.is(goToLineEffect)) {
        value = e.value;
      }
    }
    return value;
  },
  provide: (f) =>
    showPanel.from(f, (val) => (val ? createGotoLinePanel : null)),
});

function getGotoLineInput(view: EditorView) {
  let panel = getPanel(view, createGotoLinePanel);
  return (
    panel &&
    (panel.dom.querySelector("[main-field]") as HTMLInputElement | null)
  );
}

/// Command that shows a dialog asking the user for a line number, and
/// when a valid position is provided, moves the cursor to that line.
///
/// Supports line numbers, relative line offsets prefixed with `+` or
/// `-`, document percentages suffixed with `%`, and an optional
/// column position by adding `:` and a second number after the line
/// number.
export const openGotoLinePanel: Command = (view) => {
  if (gotoLinePanelOpen(view.state)) {
    let input = getGotoLineInput(view);
    if (input && input != view.root.activeElement) {
      input.focus();
      input.select();
    }
  } else {
    view.dispatch({ effects: [goToLineEffect.of(true)] });
    getPanel(view, createGotoLinePanel);
  }
  return true;
};

export const closeGotoLinePanel: Command = (view) => {
  view.dispatch({ effects: [goToLineEffect.of(false)] });
  view.focus();
  return true;
};

export function gotoLinePanelOpen(state: EditorState) {
  return state.field(gotoLineField, false);
}

const gotoLinePanelTheme = EditorView.baseTheme({
  ".cm-panel.cm-gotoLine": {
    padding: "2px 6px 4px",
    "& label": { fontSize: "80%" },
  },
});

const gotoLinePanelKeymap = Prec.high(
  keymap.of([
    {
      key: "Mod-g",
      run: openGotoLinePanel,
    },
  ])
);

export const gotoLinePanel = () => [
  gotoLineField,
  gotoLinePanelTheme,
  gotoLinePanelKeymap,
];
