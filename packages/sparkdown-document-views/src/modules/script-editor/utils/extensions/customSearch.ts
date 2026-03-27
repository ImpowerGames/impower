import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  searchPanelOpen,
  SearchQuery,
  selectMatches,
  setSearchQuery,
} from "@codemirror/search";
import { EditorSelection, Prec, SelectionRange } from "@codemirror/state";
import {
  EditorView,
  keymap,
  Panel,
  runScopeHandlers,
  ViewUpdate,
} from "@codemirror/view";

export class SearchPanel implements Panel {
  dom: HTMLElement;

  searchInput: HTMLInputElement;

  matchesDisplay: HTMLDivElement;

  matchesLabel: HTMLSpanElement;

  replaceInput: HTMLInputElement;

  caseCheckbox: HTMLInputElement;

  caseLabel: HTMLLabelElement;

  reCheckbox: HTMLInputElement;

  reLabel: HTMLLabelElement;

  wordCheckbox: HTMLInputElement;

  wordLabel: HTMLLabelElement;

  nextButton: HTMLButtonElement;

  prevButton: HTMLButtonElement;

  allButton: HTMLButtonElement;

  replaceButton: HTMLButtonElement;

  replaceAllButton: HTMLButtonElement;

  closeButton: HTMLButtonElement;

  query: SearchQuery;

  constructor(readonly view: EditorView) {
    let query = (this.query = getSearchQuery(view.state));
    this.commit = this.commit.bind(this);

    this.searchInput = document.createElement("input");
    this.searchInput.className = "cm-textfield";
    this.searchInput.name = "search";
    this.searchInput.placeholder = "Find";
    this.searchInput.ariaLabel = "Find";
    this.searchInput.setAttribute("spellcheck", "false");
    this.searchInput.setAttribute("autocorrect", "off");
    this.searchInput.setAttribute("writingsuggestions", "false");
    this.searchInput.setAttribute("translate", "no");
    this.searchInput.setAttribute("role", "textbox");
    this.searchInput.setAttribute("aria-multiline", "true");
    this.searchInput.setAttribute("aria-autocomplete", "list");
    this.searchInput.setAttribute("data-form-type", "other");
    this.searchInput.setAttribute("main-field", "");
    this.searchInput.value = query.search;
    this.searchInput.onchange = this.commit;
    this.searchInput.onkeyup = this.commit;

    this.replaceInput = document.createElement("input");
    this.replaceInput.className = "cm-textfield";
    this.replaceInput.name = "replace";
    this.replaceInput.placeholder = "Replace";
    this.replaceInput.ariaLabel = "Replace";
    this.replaceInput.setAttribute("spellcheck", "false");
    this.replaceInput.setAttribute("autocorrect", "off");
    this.replaceInput.setAttribute("writingsuggestions", "false");
    this.replaceInput.setAttribute("translate", "no");
    this.replaceInput.setAttribute("role", "textbox");
    this.replaceInput.setAttribute("aria-multiline", "true");
    this.replaceInput.setAttribute("aria-autocomplete", "list");
    this.replaceInput.setAttribute("data-form-type", "other");
    this.replaceInput.value = query.replace;
    this.replaceInput.onchange = this.commit;
    this.replaceInput.onkeyup = this.commit;

    this.matchesDisplay = document.createElement("div");
    this.matchesDisplay.className = "cm-search-matches";

    this.matchesLabel = document.createElement("span");
    this.matchesLabel.className = "cm-search-matches-label";
    this.matchesLabel.ariaLabel = "Matches";
    this.matchesDisplay.appendChild(this.matchesLabel);

    this.caseCheckbox = document.createElement("input");
    this.caseCheckbox.name = "case";
    this.caseCheckbox.type = "checkbox";
    this.caseCheckbox.checked = query.caseSensitive;
    this.caseCheckbox.onchange = this.commit;

    this.caseLabel = document.createElement("label");
    this.caseLabel.appendChild(this.caseCheckbox);
    this.caseLabel.append("match case");

    this.reCheckbox = document.createElement("input");
    this.reCheckbox.name = "re";
    this.reCheckbox.type = "checkbox";
    this.reCheckbox.checked = query.regexp;
    this.reCheckbox.onchange = this.commit;

    this.reLabel = document.createElement("label");
    this.reLabel.appendChild(this.reCheckbox);
    this.reLabel.append("regex");

    this.wordCheckbox = document.createElement("input");
    this.wordCheckbox.name = "word";
    this.wordCheckbox.type = "checkbox";
    this.wordCheckbox.checked = query.wholeWord;
    this.wordCheckbox.onchange = this.commit;

    this.wordLabel = document.createElement("label");
    this.wordLabel.appendChild(this.wordCheckbox);
    this.wordLabel.append("by word");

    this.nextButton = document.createElement("button");
    this.nextButton.className = "cm-button";
    this.nextButton.name = "next";
    this.nextButton.textContent = "next";
    this.nextButton.type = "button";
    this.nextButton.onclick = () => findNext(view);

    this.prevButton = document.createElement("button");
    this.prevButton.className = "cm-button";
    this.prevButton.name = "prev";
    this.prevButton.textContent = "previous";
    this.prevButton.type = "button";
    this.prevButton.onclick = () => findPrevious(view);

    this.allButton = document.createElement("button");
    this.allButton.className = "cm-button";
    this.allButton.name = "select";
    this.allButton.textContent = "all";
    this.allButton.type = "button";
    this.allButton.onclick = () => selectMatches(view);

    this.replaceButton = document.createElement("button");
    this.replaceButton.className = "cm-button";
    this.replaceButton.name = "replace";
    this.replaceButton.textContent = "replace";
    this.replaceButton.type = "button";
    this.replaceButton.onclick = () => replaceNext(view);

    this.replaceAllButton = document.createElement("button");
    this.replaceAllButton.className = "cm-button";
    this.replaceAllButton.name = "replaceAll";
    this.replaceAllButton.textContent = "replace all";
    this.replaceAllButton.type = "button";
    this.replaceAllButton.onclick = () => replaceAll(view);

    this.closeButton = document.createElement("button");
    this.closeButton.className = "cm-button";
    this.closeButton.name = "close";
    this.closeButton.textContent = "×";
    this.closeButton.ariaLabel = "Close";
    this.closeButton.type = "button";
    this.closeButton.onclick = () => closeCustomSearchPanel(view);

    this.dom = document.createElement("div");
    this.dom.className = "cm-search";
    this.dom.onkeydown = (e: KeyboardEvent) => this.keydown(e);
    this.dom.appendChild(this.closeButton);
    this.dom.appendChild(this.searchInput);
    this.dom.appendChild(this.matchesDisplay);
    this.dom.appendChild(this.caseLabel);
    this.dom.appendChild(this.wordLabel);
    this.dom.appendChild(this.reLabel);
    this.dom.appendChild(this.prevButton);
    this.dom.appendChild(this.nextButton);
    this.dom.appendChild(this.allButton);
    if (!view.state.readOnly) {
      this.dom.append(document.createElement("br"));
      this.dom.appendChild(this.replaceInput);
      this.dom.appendChild(this.replaceButton);
      this.dom.appendChild(this.replaceAllButton);
    }
  }

  commit() {
    let query = new SearchQuery({
      search: this.searchInput.value,
      caseSensitive: this.caseCheckbox.checked,
      regexp: this.reCheckbox.checked,
      wholeWord: this.wordCheckbox.checked,
      replace: this.replaceInput.value,
    });
    if (!query.eq(this.query)) {
      this.query = query;
      this.view.dispatch({ effects: setSearchQuery.of(query) });
    }
  }

  updateCount() {
    const { state } = this.view;
    if (!this.query.search) {
      this.matchesLabel.textContent = "";
      return;
    }

    const searchQuery = new SearchQuery(getSearchQuery(state));
    let cursor = searchQuery.getCursor(state);
    let total = 0;
    let current = 0;
    const mainSel = state.selection.main;

    let item = cursor.next();

    while (!item.done) {
      if (item.value.from <= mainSel.from && item.value.to >= mainSel.to) {
        current = total;
      }
      item = cursor.next();
      total++;
    }

    if (total === 0) {
      this.matchesLabel.textContent = state.phrase("No results");
    } else {
      this.matchesLabel.textContent = state.phrase(
        "$1 of $2",
        current + 1,
        String(total),
      );
    }
  }

  keydown(e: KeyboardEvent) {
    if (runScopeHandlers(this.view, e, "search-panel")) {
      e.preventDefault();
    } else if (e.target == this.searchInput) {
      if (e.key == "Enter") {
        e.preventDefault();
        (e.shiftKey ? findPrevious : findNext)(this.view);
      } else {
        const cursor = this.query.getCursor(this.view.state);
        const first = cursor.next();
        first.value;
        selectMatches(this.view);
        if (first.value) {
          this.view.dispatch({
            userEvent: "select.search.matches.first",
            effects: EditorView.scrollIntoView(
              EditorSelection.range(first.value.from, first.value.to),
              { y: "center" },
            ),
          });
        }
      }
    } else if (e.target == this.replaceInput) {
      if (e.key == "Enter") {
        e.preventDefault();
        replaceNext(this.view);
      }
    }
  }

  update(update: ViewUpdate) {
    for (let tr of update.transactions)
      for (let effect of tr.effects) {
        if (effect.is(setSearchQuery) && !effect.value.eq(this.query))
          this.setQuery(effect.value);
        this.updateCount();
      }
  }

  setQuery(query: SearchQuery) {
    this.query = query;
    this.searchInput.value = query.search;
    this.replaceInput.value = query.replace;
    this.caseCheckbox.checked = query.caseSensitive;
    this.reCheckbox.checked = query.regexp;
    this.wordCheckbox.checked = query.wholeWord;
  }

  mount() {
    this.searchInput.focus();
    this.searchInput.select();
  }

  get pos() {
    return 80;
  }

  get top() {
    return true;
  }
}

export function closeCustomSearchPanel(view: EditorView) {
  closeSearchPanel(view);
  view.focus();
  view.dispatch({ selection: view.state.selection.main });
  return true;
}

export function customSearchPanel() {
  return [
    Prec.highest(
      keymap.of([
        {
          key: "Mod-f",
          run: openSearchPanel,
          scope: "editor search-panel",
        },
        {
          key: "Escape",
          run: closeCustomSearchPanel,
          scope: "editor search-panel",
        },
      ]),
    ),
    search({
      createPanel: (view) => new SearchPanel(view),
      scrollToMatch: (range: SelectionRange) =>
        EditorView.scrollIntoView(range, { y: "center" }),
      top: true,
    }),
  ];
}

import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Command, getPanel, showPanel } from "@codemirror/view";

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
    this.closeButton.onclick = () => closeCustomGotoLinePanel(view);

    this.input = document.createElement("input");
    this.input.className = "cm-textfield";
    this.input.name = "line";
    this.input.setAttribute("spellcheck", "false");
    this.input.setAttribute("autocorrect", "off");
    this.input.setAttribute("writingsuggestions", "false");
    this.input.setAttribute("translate", "no");
    this.input.setAttribute("role", "textbox");
    this.input.setAttribute("aria-multiline", "true");
    this.input.setAttribute("aria-autocomplete", "list");
    this.input.placeholder = view.state.phrase("Go to line");
    this.input.ariaLabel = view.state.phrase("Go to line");
    this.input.setAttribute("data-form-type", "other");
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
      docLine.from + Math.max(0, Math.min(col, docLine.length)),
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
export const openCustomGotoLinePanel: Command = (view) => {
  if (customGotoLinePanelOpen(view.state)) {
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

export const closeCustomGotoLinePanel: Command = (view) => {
  view.dispatch({ effects: [goToLineEffect.of(false)] });
  view.focus();
  view.dispatch({ selection: view.state.selection.main });
  return true;
};

export function customGotoLinePanelOpen(state: EditorState) {
  return state.field(gotoLineField, false) ?? false;
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
      run: openCustomGotoLinePanel,
      scope: "editor gotoline-panel",
    },
    {
      key: "Escape",
      run: closeCustomGotoLinePanel,
      scope: "editor gotoline-panel",
    },
  ]),
);

export function customGotoLinePanel() {
  let wasSearchPanelOpen = false;
  let wasGoToPanelOpen = false;
  return [
    gotoLineField,
    gotoLinePanelTheme,
    gotoLinePanelKeymap,
    EditorView.updateListener.of((update) => {
      const isSearchPanelOpen = searchPanelOpen(update.state);
      const isGoToPanelOpen = customGotoLinePanelOpen(update.state);
      if (isSearchPanelOpen !== wasSearchPanelOpen) {
        wasSearchPanelOpen = searchPanelOpen(update.state);
        if (isSearchPanelOpen) {
          update.view.dispatch({ effects: [goToLineEffect.of(false)] });
        }
      } else if (isGoToPanelOpen !== wasGoToPanelOpen) {
        wasGoToPanelOpen = isGoToPanelOpen;
        if (isGoToPanelOpen) {
          closeSearchPanel(update.view);
        }
      }
    }),
  ];
}
