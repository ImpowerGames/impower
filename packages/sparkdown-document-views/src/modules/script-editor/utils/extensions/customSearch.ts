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
  "[contenteditable]:empty::after, [contenteditable][data-empty]::after": {
    content: "attr(data-placeholder)",
    color: "#888",
    cursor: "text",
  },
});

const FIELD_BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIGURE",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TD",
  "TH",
  "TR",
  "UL",
]);

const readFieldText = (root: Node, trailingBreakIsFiller = true): string => {
  let text = "";
  let atLineStart = true;
  let pendingBreak = false;
  let trailingTextBreak = false;
  const endLine = () => {
    if (pendingBreak) {
      text += "\n";
      pendingBreak = false;
      atLineStart = true;
    }
  };
  const walk = (parent: Node) => {
    const children = parent.childNodes;
    for (let i = 0; i < children.length; i += 1) {
      const node = children[i]!;
      if (node.nodeType === Node.TEXT_NODE) {
        const data = (node as CharacterData).data;
        if (data) {
          endLine();
          text += data;
          atLineStart = data.endsWith("\n");
          trailingTextBreak = atLineStart;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (el.tagName === "BR") {
          if (!trailingBreakIsFiller || i < children.length - 1) {
            endLine();
            text += "\n";
            atLineStart = true;
            trailingTextBreak = false;
          }
        } else if (FIELD_BLOCK_TAGS.has(el.tagName)) {
          if (!atLineStart) {
            text += "\n";
            atLineStart = true;
          }
          pendingBreak = false;
          trailingTextBreak = false;
          walk(el);
          atLineStart = trailingTextBreak;
          pendingBreak = !trailingTextBreak;
        } else {
          walk(el);
        }
      }
    }
  };
  walk(root);
  if (trailingBreakIsFiller && trailingTextBreak) {
    return text.slice(0, -1);
  }
  return text;
};

const writeFieldText = (field: HTMLElement, text: string) => {
  if (readFieldText(field) === text) {
    return;
  }
  while (field.firstChild) {
    field.removeChild(field.firstChild);
  }
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (i > 0) {
      field.appendChild(document.createElement("br"));
    }
    if (line) {
      field.appendChild(document.createTextNode(line));
    }
  });
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    field.appendChild(document.createElement("br"));
  }
};

const fieldSelection = (field: HTMLElement): Selection | null => {
  const root = field.getRootNode() as Document | ShadowRoot;
  if (typeof (root as Document).getSelection === "function") {
    return (root as Document).getSelection();
  }
  return field.ownerDocument.defaultView?.getSelection() ?? null;
};

const offsetOfPosition = (
  field: HTMLElement,
  container: Node,
  offset: number,
) => {
  const prefix = field.ownerDocument.createRange();
  prefix.selectNodeContents(field);
  prefix.setEnd(container, offset);
  const holder = field.ownerDocument.createElement("div");
  holder.appendChild(prefix.cloneContents());
  return readFieldText(holder, false).length;
};

const setCaret = (field: HTMLElement, target: number) => {
  const selection = fieldSelection(field);
  if (!selection) {
    return;
  }
  const range = field.ownerDocument.createRange();
  const children = field.childNodes;
  let placed = false;
  let pos = 0;
  for (let i = 0; i < children.length && !placed; i += 1) {
    const node = children[i]!;
    if (node.nodeType === Node.TEXT_NODE) {
      const length = (node as CharacterData).data.length;
      if (target <= pos + length) {
        range.setStart(node, target - pos);
        placed = true;
      } else {
        pos += length;
      }
    } else if ((node as Element).tagName === "BR") {
      if (i < children.length - 1) {
        if (target <= pos) {
          range.setStartBefore(node);
          placed = true;
        } else {
          pos += 1;
        }
      }
    }
  }
  if (!placed) {
    const last = field.lastChild;
    if (last && (last as Element).tagName === "BR") {
      range.setStartBefore(last);
    } else {
      range.selectNodeContents(field);
      range.collapse(false);
    }
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
};

const insertIntoField = (field: HTMLElement, insert: string) => {
  const value = readFieldText(field);
  let start = value.length;
  let end = value.length;
  const selection = fieldSelection(field);
  const range =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  if (
    range &&
    field.contains(range.startContainer) &&
    field.contains(range.endContainer)
  ) {
    start = Math.min(
      offsetOfPosition(field, range.startContainer, range.startOffset),
      value.length,
    );
    end = Math.min(
      offsetOfPosition(field, range.endContainer, range.endOffset),
      value.length,
    );
  }
  writeFieldText(field, value.slice(0, start) + insert + value.slice(end));
  setCaret(field, start + insert.length);
};

const typeIntoField = (field: HTMLElement, text: string) => {
  const doc = field.ownerDocument;
  const before = readFieldText(field);
  try {
    if (
      typeof doc.execCommand === "function" &&
      doc.execCommand("insertText", false, text) &&
      readFieldText(field) !== before
    ) {
      return;
    }
  } catch {
  }
  insertIntoField(field, text);
};

const normalizeLineEndings = (text: string) => text.replace(/\r\n?/g, "\n");

const fieldText = (field: HTMLElement) =>
  readFieldText(field).replace(/\u00A0/g, " ");

const normalizeLineSpaces = (line: string) =>
  line
    .replace(/^\u00A0+|\u00A0+$/g, (m) => " ".repeat(m.length))
    .replace(/\u00A0(?=[ \u00A0])/g, " ")
    .replace(/(?<=[ ])\u00A0/g, " ");

const searchFieldText = (field: HTMLElement) =>
  readFieldText(field).split("\n").map(normalizeLineSpaces).join("\n");

export const COUNT_INTERVAL = 250;

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

  matched:
    | {
        doc: Text;
        query: SearchQuery;
        valid: boolean;
        froms: number[];
        tos: number[];
      }
    | undefined;

  rendered: { from: number; to: number } | undefined;

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
    writeFieldText(this.searchInput, query.search);
    this.searchInput.onchange = this.commit;
    this.searchInput.onkeyup = this.commit;
    this.searchInput.addEventListener("input", (e) => {
      this.afterInput(this.searchInput, e as InputEvent);
    });
    this.searchInput.addEventListener("paste", (e) => this.paste(e));

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
    writeFieldText(this.replaceInput, query.replace);
    this.replaceInput.addEventListener("input", (e) => {
      this.afterInput(this.replaceInput, e as InputEvent);
    });
    this.replaceInput.addEventListener("paste", (e) => this.paste(e));

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

  clearEmptied(field: HTMLElement) {
    if (!readFieldText(field)) {
      field.innerHTML = "";
    }
  }

  markEmptiness(field: HTMLElement) {
    if (readFieldText(field)) {
      field.removeAttribute("data-empty");
    } else {
      field.setAttribute("data-empty", "");
    }
  }

  afterInput(field: HTMLElement, e: InputEvent) {
    if (e.inputType !== "historyUndo" && e.inputType !== "historyRedo") {
      this.clearEmptied(field);
    }
    this.markEmptiness(field);
    this.commit();
  }

  paste(e: ClipboardEvent) {
    const field = e.currentTarget as HTMLElement;
    const clipboard = e.clipboardData;
    if (!clipboard) {
      return;
    }
    e.preventDefault();
    const text = clipboard.getData("text/plain");
    if (!text) {
      return;
    }
    typeIntoField(field, normalizeLineEndings(text));
    this.clearEmptied(field);
    this.markEmptiness(field);
    this.commit();
  }

  commit() {
    let query = new SearchQuery({
      search: searchFieldText(this.searchInput),
      caseSensitive: this.caseCheckbox.checked,
      regexp: this.reCheckbox.checked,
      wholeWord: this.wordCheckbox.checked,
      replace: fieldText(this.replaceInput),
    });
    if (!query.eq(this.query)) {
      const moved = !sameMatches(this.query, query);
      this.query = query;
      this.view.dispatch({ effects: setSearchQuery.of(query) });
      if (moved) {
        this.revealFirstMatch();
      }
    }
  }

  revealFirstMatch() {
    const { state } = this.view;
    const first = this.firstMatch(state, getSearchQuery(state));
    if (!first) {
      return;
    }
    this.view.dispatch({
      selection: EditorSelection.single(first.from, first.to),
      userEvent: "select.search.matches.first",
      effects: EditorView.scrollIntoView(
        EditorSelection.range(first.from, first.to),
        { y: "center" },
      ),
    });
  }

  hasMatches(state: EditorState, query: SearchQuery) {
    const matched = this.matched;
    return (
      !!matched && matched.doc === state.doc && sameMatches(matched.query, query)
    );
  }

  findMatches(state: EditorState, query: SearchQuery) {
    this.rendered = undefined;

    const searchQuery = new SearchQuery(query);
    // workaround(@codemirror/search): SearchQuery.getCursor throws on an invalid regex, which from a timer surfaces as an unhandled error
    if (!searchQuery.valid) {
      this.matched = {
        doc: state.doc,
        query,
        valid: false,
        froms: [],
        tos: [],
      };
      return;
    }

    const froms: number[] = [];
    const tos: number[] = [];
    const cursor = searchQuery.getCursor(state);

    let item = cursor.next();
    while (!item.done) {
      froms.push(item.value.from);
      tos.push(item.value.to);
      item = cursor.next();
    }

    this.matched = { doc: state.doc, query, valid: true, froms, tos };
  }

  indexAt(from: number, to: number) {
    const { froms, tos } = this.matched!;

    let lo = 0;
    let hi = froms.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (froms[mid]! <= from) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    return found >= 0 && tos[found]! >= to ? found : 0;
  }

  renderCount(state: EditorState) {
    const matched = this.matched;
    if (!matched) {
      return;
    }

    const mainSel = state.selection.main;
    const rendered = this.rendered;
    if (
      rendered &&
      rendered.from === mainSel.from &&
      rendered.to === mainSel.to
    ) {
      return;
    }
    this.rendered = { from: mainSel.from, to: mainSel.to };

    const total = matched.froms.length;
    if (!matched.valid) {
      this.matchesLabel.textContent = "";
    } else if (total === 0) {
      this.matchesLabel.textContent = state.phrase("No results");
    } else {
      this.matchesLabel.textContent = state.phrase(
        "$1 of $2",
        this.indexAt(mainSel.from, mainSel.to) + 1,
        String(total),
      );
    }
  }

  updateCount() {
    const { state } = this.view;
    const query = getSearchQuery(state);
    if (!this.hasMatches(state, query)) {
      this.findMatches(state, query);
    }
    this.renderCount(state);
  }

  firstMatch(state: EditorState, query: SearchQuery) {
    if (this.hasMatches(state, query)) {
      const { valid, froms, tos } = this.matched!;
      return valid && froms.length ? { from: froms[0]!, to: tos[0]! } : null;
    }

    const searchQuery = new SearchQuery(query);
    if (!searchQuery.valid) {
      return null;
    }
    const first = searchQuery.getCursor(state).next();
    return first.done
      ? null
      : { from: first.value.from, to: first.value.to };
  }

  breakLine(field: HTMLElement) {
    typeIntoField(field, "\n");
    this.clearEmptied(field);
    this.markEmptiness(field);
    this.commit();
  }

  wantsBreak(e: KeyboardEvent) {
    return (e.ctrlKey || e.metaKey) && !e.shiftKey;
  }

  keydown(e: KeyboardEvent) {
    if (runScopeHandlers(this.view, e, "search-panel")) {
      e.preventDefault();
    } else if (e.target == this.searchInput) {
      if (e.key == "Enter") {
        e.preventDefault();
        if (this.wantsBreak(e)) {
          this.breakLine(this.searchInput);
        } else {
          (e.shiftKey ? findPrevious : findNext)(this.view);
        }
      }
    } else if (e.target == this.replaceInput) {
      if (e.key == "Enter") {
        e.preventDefault();
        if (this.wantsBreak(e)) {
          this.breakLine(this.replaceInput);
        } else {
          replaceNext(this.view);
        }
      }
    }
  }

  update(update: ViewUpdate) {
    for (let tr of update.transactions)
      for (let effect of tr.effects)
        if (effect.is(setSearchQuery) && !effect.value.eq(this.query))
          this.setQuery(effect.value);

    const { state } = this.view;
    if (this.hasMatches(state, getSearchQuery(state))) {
      this.renderCount(state);
    } else {
      this.scheduleCount();
    }
  }

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
    writeFieldText(this.searchInput, query.search);
    writeFieldText(this.replaceInput, query.replace);
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
    this.input.setAttribute("aria-multiline", "false");
    this.input.setAttribute("aria-autocomplete", "list");
    this.input.setAttribute(
      "data-placeholder",
      view.state.phrase("Go to line"),
    );
    this.input.ariaLabel = view.state.phrase("Go to line");
    this.input.addEventListener("input", () => {
      if (!this.input.textContent) {
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
      event.preventDefault();
      this.view.dispatch({ effects: goToLineEffect.of(false) });
      this.view.focus();
    } else if (event.keyCode == 13) {
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
  "[contenteditable]:empty::after, [contenteditable][data-empty]::after": {
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
