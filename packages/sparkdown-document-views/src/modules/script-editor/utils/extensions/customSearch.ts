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
import {
  EditorSelection,
  Prec,
  SelectionRange,
  Text,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  Panel,
  runScopeHandlers,
  ViewUpdate,
} from "@codemirror/view";

const searchPanelTheme = EditorView.baseTheme({
  "[contenteditable]:empty::after": {
    content: "attr(data-placeholder)",
    color: "#888",
    cursor: "text",
  },
});

/**
 * Read what the user typed out of one of the panel's `contenteditable`
 * fields.
 *
 * A contenteditable under `white-space: normal` cannot hold a space that
 * would collapse, so Chromium hardens it: type "hi " and `textContent` comes
 * back as "hi\u00A0". Committed as-is that makes a search match nothing, and
 * writes an invisible non-breaking space into the script in place of the
 * space the user asked for.
 */
const fieldText = (field: HTMLElement) =>
  (field.textContent ?? "").replace(/\u00A0/g, " ");

/**
 * How long the match count may lag the document, in milliseconds.
 *
 * Counting is a walk over every match, so it runs on a trailing timer rather
 * than on the update that made it stale: a burst of typing costs one walk per
 * window instead of one per keystroke, and the walk lands between keystrokes
 * instead of inside one. Long enough to swallow a fast typist's gaps, short
 * enough that the number reads as live.
 */
export const COUNT_INTERVAL = 250;

/**
 * Whether two queries select the same ranges out of the same document.
 *
 * Every field that steers matching, and only those. `SearchQuery.eq` compares
 * `replace` as well, which is the one field that cannot move a match: the
 * replacement text decides what a replace writes, never where the matches are.
 * Counting them is a walk over the whole document, so the distinction is worth
 * drawing -- the replace field commits on every keystroke, and each of those
 * commits carries a query that matches exactly what the previous one did.
 *
 * `literal` is compared even though `eq` ignores it, because it decides whether
 * an escape in the pattern stands for a newline or for a backslash.
 */
const sameMatches = (a: SearchQuery, b: SearchQuery) =>
  a.search === b.search &&
  a.caseSensitive === b.caseSensitive &&
  a.regexp === b.regexp &&
  a.wholeWord === b.wholeWord &&
  a.literal === b.literal &&
  a.test === b.test;

export class SearchPanel implements Panel {
  dom: HTMLElement;

  searchInput: HTMLElement;

  matchesDisplay: HTMLDivElement;

  matchesLabel: HTMLSpanElement;

  replaceInput: HTMLElement;

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

  /** What the count currently on screen was computed from. */
  counted:
    | { doc: Text; from: number; to: number; query: SearchQuery }
    | undefined;

  /** Handle of the trailing recount, while one is owed. */
  countTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(readonly view: EditorView) {
    let query = (this.query = getSearchQuery(view.state));
    this.commit = this.commit.bind(this);

    this.searchInput = document.createElement("div");
    this.searchInput.className = "cm-textfield";
    this.searchInput.setAttribute("contenteditable", "true");
    this.searchInput.setAttribute("name", "search");
    this.searchInput.setAttribute("data-placeholder", "Find");
    this.searchInput.ariaLabel = "Find";
    this.searchInput.setAttribute("spellcheck", "false");
    this.searchInput.setAttribute("autocorrect", "off");
    this.searchInput.setAttribute("writingsuggestions", "false");
    this.searchInput.setAttribute("translate", "no");
    this.searchInput.setAttribute("role", "textbox");
    this.searchInput.setAttribute("aria-multiline", "true");
    this.searchInput.setAttribute("aria-autocomplete", "list");
    this.searchInput.textContent = query.search;
    this.searchInput.onchange = this.commit;
    this.searchInput.onkeyup = this.commit;
    this.searchInput.addEventListener("input", () => {
      if (!this.searchInput.textContent) {
        // Force-clear hidden <br> tags
        this.searchInput.innerHTML = "";
      }
      this.commit();
    });

    this.replaceInput = document.createElement("div");
    this.replaceInput.className = "cm-textfield";
    this.replaceInput.setAttribute("contenteditable", "true");
    this.replaceInput.setAttribute("name", "replace");
    this.replaceInput.setAttribute("data-placeholder", "Replace");
    this.replaceInput.ariaLabel = "Replace";
    this.replaceInput.setAttribute("spellcheck", "false");
    this.replaceInput.setAttribute("autocorrect", "off");
    this.replaceInput.setAttribute("writingsuggestions", "false");
    this.replaceInput.setAttribute("translate", "no");
    this.replaceInput.setAttribute("role", "textbox");
    this.replaceInput.setAttribute("aria-multiline", "true");
    this.replaceInput.setAttribute("aria-autocomplete", "list");
    this.replaceInput.textContent = query.replace;
    this.replaceInput.addEventListener("input", () => {
      if (!this.replaceInput.textContent) {
        // Force-clear hidden <br> tags
        this.replaceInput.innerHTML = "";
      }
      // The replace text only reaches `replaceNext`/`replaceAll` through the
      // committed SearchQuery, so every keystroke has to commit. Without this
      // the field is decorative: the query keeps whatever replacement was
      // current the last time the find field or a toggle committed.
      this.commit();
    });

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
      search: fieldText(this.searchInput),
      caseSensitive: this.caseCheckbox.checked,
      regexp: this.reCheckbox.checked,
      wholeWord: this.wordCheckbox.checked,
      replace: fieldText(this.replaceInput),
    });
    if (!query.eq(this.query)) {
      this.query = query;
      this.view.dispatch({ effects: setSearchQuery.of(query) });
    }
  }

  updateCount() {
    const { state } = this.view;
    const query = getSearchQuery(state);
    const mainSel = state.selection.main;

    // Counting walks every match in the document -- tens of milliseconds on a
    // feature-length script. It is reached from `update`, which runs for every
    // view update there is: scrolls, decorations, and the replace field's
    // per-keystroke commits alike. So remember what the standing count was
    // computed from, and walk again only once one of those moved. `doc`
    // compares by identity because an unchanged document is the same `Text`
    // object.
    //
    // The key covers what the count is a function of in this editor, not
    // everything `getCursor` can read: a whole-word search resolves its word
    // characters from language data, and `test` predicates are handed the
    // state. Neither varies here while the document, selection and query all
    // stand still.
    const counted = this.counted;
    if (
      counted &&
      counted.doc === state.doc &&
      counted.from === mainSel.from &&
      counted.to === mainSel.to &&
      sameMatches(counted.query, query)
    ) {
      return;
    }

    const searchQuery = new SearchQuery(query);
    // A blank or malformed pattern has nothing to count, and `getCursor` throws
    // outright on an invalid regex. The walk runs from a timer, so a throw here
    // has no CodeMirror frame above it to land in -- it surfaces as an unhandled
    // error and the count silently stops tracking. `valid` covers both cases: it
    // requires a non-empty search, and for regex mode a pattern that compiles.
    if (!searchQuery.valid) {
      this.counted = { doc: state.doc, from: mainSel.from, to: mainSel.to, query };
      this.matchesLabel.textContent = "";
      return;
    }

    let cursor = searchQuery.getCursor(state);
    let total = 0;
    let current = 0;

    let item = cursor.next();

    while (!item.done) {
      if (item.value.from <= mainSel.from && item.value.to >= mainSel.to) {
        current = total;
      }
      item = cursor.next();
      total++;
    }

    // Recorded only once the walk has finished, so a throw part-way through
    // leaves the memo empty and the next update tries again, rather than
    // claiming a count that never reached the label.
    this.counted = { doc: state.doc, from: mainSel.from, to: mainSel.to, query };

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
      for (let effect of tr.effects)
        if (effect.is(setSearchQuery) && !effect.value.eq(this.query))
          this.setQuery(effect.value);
    this.scheduleCount();
  }

  /**
   * Ask for the count to be brought up to date, some time in the next
   * `COUNT_INTERVAL`.
   *
   * A timer already in flight is left alone rather than pushed back, so the
   * count keeps refreshing on its own cadence while the user holds a key down
   * instead of waiting for them to stop.
   */
  scheduleCount() {
    if (this.countTimer !== undefined) {
      return;
    }
    this.countTimer = setTimeout(() => {
      this.countTimer = undefined;
      this.updateCount();
    }, COUNT_INTERVAL);
  }

  destroy() {
    if (this.countTimer !== undefined) {
      clearTimeout(this.countTimer);
      this.countTimer = undefined;
    }
  }

  setQuery(query: SearchQuery) {
    this.query = query;
    this.searchInput.textContent = query.search;
    this.replaceInput.textContent = query.replace;
    this.caseCheckbox.checked = query.caseSensitive;
    this.reCheckbox.checked = query.regexp;
    this.wordCheckbox.checked = query.wholeWord;
  }

  mount() {
    this.searchInput.focus();
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(this.searchInput);
    sel?.removeAllRanges();
    sel?.addRange(range);
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

const customSearchPanelKeymap = [
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
];

export function customSearchPanel() {
  return [
    searchPanelTheme,
    Prec.highest(keymap.of(customSearchPanelKeymap)),
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

  input: HTMLElement;

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

    this.input = document.createElement("div");
    this.input.className = "cm-textfield";
    this.input.setAttribute("contenteditable", "true");
    this.input.setAttribute("name", "line");
    this.input.setAttribute("spellcheck", "false");
    this.input.setAttribute("autocorrect", "off");
    this.input.setAttribute("writingsuggestions", "false");
    this.input.setAttribute("translate", "no");
    this.input.setAttribute("role", "textbox");
    this.input.setAttribute("aria-multiline", "true");
    this.input.setAttribute("aria-autocomplete", "list");
    this.input.setAttribute(
      "data-placeholder",
      view.state.phrase("Go to line"),
    );
    this.input.ariaLabel = view.state.phrase("Go to line");
    this.input.addEventListener("input", () => {
      if (!this.input.textContent) {
        // Force-clear hidden <br> tags
        this.input.innerHTML = "";
      }
    });

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
    let match = /^([+-])?(\d+)?(:\d+)?(%)?$/.exec(this.input.textContent);
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
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(this.input);
    sel?.removeAllRanges();
    sel?.addRange(range);
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
  "[contenteditable]:empty::after": {
    content: "attr(data-placeholder)",
    color: "#888",
    cursor: "text",
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
