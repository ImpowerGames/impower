import {
  EditorSelection,
  StateField,
  StateEffect,
  Prec,
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

  input: HTMLInputElement;

  button: HTMLButtonElement;

  constructor(readonly view: EditorView) {
    this.dom = document.createElement("form");
    this.dom.className = "cm-gotoLine";
    this.dom.onkeydown = this.keydown.bind(this);
    this.dom.onsubmit = this.submit.bind(this);

    this.input = document.createElement("input");
    this.input.className = "cm-textfield";
    this.input.name = "line";
    this.input.placeholder = view.state.phrase("Go to line");
    this.input.ariaLabel = view.state.phrase("Go to line");
    this.input.autocomplete = "off";
    this.input.onblur = this.blur.bind(this);

    this.button = document.createElement("button");
    this.button.className = "cm-button";
    this.button.type = "submit";
    this.button.textContent = view.state.phrase("go");

    this.dom.appendChild(this.input);
    this.dom.appendChild(this.button);
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

  blur(_event: FocusEvent) {
    this.view.dispatch({ effects: goToLineEffect.of(false) });
    this.view.focus();
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
    this.input.select();
  }

  get pos() {
    return 80;
  }

  get top() {
    return true;
  }
}

function createLineDialog(view: EditorView): Panel {
  return new GotoLinePanel(view);
}

const goToLineEffect = StateEffect.define<boolean>();

const gotoLineField = StateField.define<boolean>({
  create() {
    return true;
  },
  update(value, tr) {
    for (let e of tr.effects) {
      if (e.is(goToLineEffect)) {
        value = e.value;
      }
    }
    return value;
  },
  provide: (f) => showPanel.from(f, (val) => (val ? createLineDialog : null)),
});

/// Command that shows a dialog asking the user for a line number, and
/// when a valid position is provided, moves the cursor to that line.
///
/// Supports line numbers, relative line offsets prefixed with `+` or
/// `-`, document percentages suffixed with `%`, and an optional
/// column position by adding `:` and a second number after the line
/// number.
export const openGotoLinePanel: Command = (view) => {
  let panel = getPanel(view, createLineDialog);
  if (!panel) {
    view.dispatch({ effects: [goToLineEffect.of(true)] });
    panel = getPanel(view, createLineDialog);
  }
  return true;
};

export const closeGotoLinePanel: Command = (view) => {
  view.dispatch({ effects: [goToLineEffect.of(false)] });
  view.focus();
  return true;
};

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
