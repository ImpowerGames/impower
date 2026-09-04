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
  // A field the user has emptied can still be holding the break a browser
  // leaves behind, which is enough to keep it from being `:empty`. The
  // attribute says it is empty in that case, so the placeholder returns with
  // the text rather than waiting for the next keystroke.
  "[contenteditable]:empty::after, [contenteditable][data-empty]::after": {
    content: "attr(data-placeholder)",
    color: "#888",
    cursor: "text",
  },
});

/**
 * Elements that put whatever they contain on a line of its own.
 *
 * The panel writes nothing but text nodes and `<br>` into a field, but a drop,
 * an input method, or a paste that never reached a handler can still leave a
 * block element behind -- and one of those shows on screen as a new line, so
 * reading the field has to count it as one.
 */
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

/**
 * The text a `contenteditable` holds, line breaks included.
 *
 * `textContent` concatenates text nodes and drops every element boundary, so a
 * field displaying two lines reads back as the two lines run together with
 * nothing between them. This walks the content instead and writes a newline
 * wherever the field shows one: at a `<br>`, and where a block element starts.
 *
 * `trailingBreakIsFiller` covers the break a browser (and `writeFieldText`
 * below) leaves at the end, which the field does not show. Measured in the
 * running editor, where the field is 32px tall holding `abc`, `abc` and a
 * trailing newline character, or `abc` and one `<br>`, and 55px holding `abc`
 * and two `<br>` -- so a single trailing break of either kind adds no line,
 * while a second one does. Counting the invisible one would commit a trailing
 * newline the user never entered, and replace-all would then push every
 * following line of the script down by one.
 *
 * Both kinds occur: the panel and the browser's editing both write `<br>`,
 * and the browser's insert command writes newline characters. A PREFIX of the
 * content is measured with `false`, since a break at the end of a prefix is by
 * definition followed by more content and is a line like any other.
 */
const readFieldText = (root: Node, trailingBreakIsFiller = true): string => {
  let text = "";
  // Whether the line being built is still empty. A block takes a line of its
  // own, so it opens one only when the current line already has something on
  // it; nesting a block inside a block therefore adds no second break, since
  // the outer one has already opened the line the inner one wants.
  let atLineStart = true;
  // Whether a line ended and nothing has begun the next one. A block ends its
  // line as surely as it starts one, but the break belongs before whatever
  // comes next rather than after the block -- a block at the very end of the
  // content adds no trailing newline. A following block supersedes it, having
  // opened the line itself.
  let pendingBreak = false;
  // Whether the last thing written was a newline character ending a text node,
  // which is the invisible trailing break in its other form. Tracked rather
  // than tested for on the finished text, so that a trailing `<br>` counted as
  // a line above is not mistaken for one and dropped.
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
          // The block's line is over, whether or not it put anything on one --
          // unless its own last text ended the line already, in which case
          // counting it again would put an empty line after the block that the
          // block does not show.
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

/**
 * Put `text` in a field, showing every line of it.
 *
 * Lines are separated by `<br>` rather than by newline characters in a text
 * node: a `<br>` breaks the line whatever the field's `white-space` is, and it
 * is the shape a browser's own editing leaves behind, so what the panel writes
 * and what the user types read back through the same rules.
 *
 * An unchanged value is left alone. Rewriting the field's nodes on a value it
 * already holds collapses the caret to the start, and the replace field commits
 * -- and so can be written back -- on every keystroke.
 */
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
  // A break with nothing after it leaves a line the browser gives no height, so
  // an empty last line needs a second one to be visible at all.
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    field.appendChild(document.createElement("br"));
  }
};

/**
 * The selection the field's caret lives in.
 *
 * A shadow root keeps its own selection in Chromium, and asking the document
 * for one there answers with a node outside the field.
 */
const fieldSelection = (field: HTMLElement): Selection | null => {
  const root = field.getRootNode() as Document | ShadowRoot;
  if (typeof (root as Document).getSelection === "function") {
    return (root as Document).getSelection();
  }
  return field.ownerDocument.defaultView?.getSelection() ?? null;
};

/** How far into the field's text a DOM position sits. */
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

/**
 * Put the caret `target` characters into the field's text.
 *
 * A position is claimed by the break that starts its line before it is looked
 * for in any text, because a line can begin with no text at all -- the start of
 * a field whose first line is empty has no text node in front of it to count
 * from, and looking for one there would measure backwards past the breaks
 * already counted.
 */
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
    // Past the end of everything that can hold a caret, which includes the
    // empty last line: its caret goes before the filler break, not after it.
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

/**
 * Replace whatever the field has selected with `insert`, and leave the caret
 * after it.
 *
 * The whole value is rebuilt rather than the selection edited in place, so the
 * field ends up in the same shape `writeFieldText` produces however the browser
 * had arranged what was there before. With no caret in the field -- which is
 * what a shadow root that hides its selection looks like -- the text is
 * appended, which is where a paste into an empty field would have landed anyway.
 */
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
    // A range's start never follows its end, so the two are already in order.
    // They are clamped because measuring a prefix counts every break in it,
    // including one the whole field would have read as filler.
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

/**
 * Put `text` in at the caret the way typing would.
 *
 * The browser's own insert command is what a keystroke goes through, so the
 * browser records it on the field's undo history and Ctrl+Z takes it back --
 * which it cannot do for an edit the panel performs on the DOM itself. The
 * command also raises `input`, so the field's listener commits what it left,
 * and commits again when the user undoes or redoes it.
 *
 * Where the command is missing, refuses, or reports success and leaves the
 * field saying what it said before, the field is rewritten instead. That puts
 * the same text in and is not undoable. The last of those is checked rather
 * than assumed because what the command leaves behind is the browser's own
 * business: Chromium writes the newline and a second one after it, so a break
 * entered at the end of the text is still a line and still reads as one, but
 * nothing promises that, and a browser that wrote a single newline would have
 * it read as the invisible trailing break and lose it. Comparing the value
 * makes the outcome the same either way.
 */
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
    // An environment that defines the command and throws on it is one without
    // it, and is served by the same fallback.
  }
  insertIntoField(field, text);
};

/** Every way a line ends, as the one way this panel writes it. */
const normalizeLineEndings = (text: string) => text.replace(/\r\n?/g, "\n");

/**
 * Read what the user typed out of one of the panel's `contenteditable`
 * fields.
 *
 * A contenteditable cannot hold a space that its `white-space` would collapse,
 * so a browser hardens one into a non-breaking space where it has to: type
 * "hi " and the field comes back holding "hi\u00A0". Committed as-is that makes a
 * search match nothing, and writes an invisible hard space into the script in
 * place of the space the user asked for. The panel's fields preserve their
 * whitespace, which is what lets a replacement carry an indent, and a browser
 * hardens nothing under that rule -- but a hard space still reaches a field by
 * paste, by a restored query, or from a platform whose editing hardens anyway.
 *
 * The REPLACE field normalizes every one of them: the one thing replace must
 * never do is write an invisible hard space the user didn't ask for.
 */
const fieldText = (field: HTMLElement) =>
  readFieldText(field).replace(/\u00A0/g, " ");

/**
 * The SEARCH field normalizes only the hard spaces that hardening can account
 * for -- those at a position where a typed space would have collapsed: the
 * start or end of a line, or adjacent to another space. An interior isolated
 * one (`word\u00A0word`) can only have been pasted or typed deliberately, and it
 * must survive verbatim or a hard space already IN the script -- including
 * one written by the pre-#358 replace-all -- becomes unfindable (#367).
 * (A search for nothing BUT a hard space still normalizes, since a lone one
 * sits at a line edge; that residual case needs the regexp mode.)
 *
 * A line break bounds a line's whitespace exactly as the field's own edges do,
 * so each line of a multi-line query is normalized on its own.
 */
const normalizeLineSpaces = (line: string) =>
  line
    .replace(/^\u00A0+|\u00A0+$/g, (m) => " ".repeat(m.length))
    .replace(/\u00A0(?=[ \u00A0])/g, " ")
    .replace(/(?<=[ ])\u00A0/g, " ");

const searchFieldText = (field: HTMLElement) =>
  readFieldText(field).split("\n").map(normalizeLineSpaces).join("\n");

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

  /**
   * Every match of `query` in `doc`, in document order, as parallel arrays of
   * start and end offsets.
   *
   * Kept rather than just the total because stepping from one match to the next
   * changes only the "N" of "N of M", and with the matches in hand that is a
   * binary search -- where recomputing them is another walk over the whole
   * document. Holding them costs two numbers per match, which is bounded by the
   * size of the script itself.
   */
  matched:
    | {
        doc: Text;
        query: SearchQuery;
        valid: boolean;
        froms: number[];
        tos: number[];
      }
    | undefined;

  /** The selection the label on screen was rendered for. */
  rendered: { from: number; to: number } | undefined;

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
    // The replace text only reaches `replaceNext`/`replaceAll` through the
    // committed SearchQuery, so every keystroke has to commit. Without this the
    // field is decorative: the query keeps whatever replacement was current the
    // last time the find field or a toggle committed.
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

  /**
   * Take a field the user has emptied back to actually empty.
   *
   * Deleting the last character of a `contenteditable` leaves a `<br>` behind,
   * and an element holding one is not `:empty`, so the placeholder that rule
   * draws never comes back. Emptiness is judged on the field's text and not on
   * `textContent`, which cannot tell a leftover break from a line the user
   * entered: a field holding one empty line and nothing else is not empty.
   */
  clearEmptied(field: HTMLElement) {
    if (!readFieldText(field)) {
      field.innerHTML = "";
    }
  }

  /**
   * Say whether a field is holding nothing, for the placeholder to read.
   *
   * The placeholder is drawn on a field with no content at all, which the
   * field is not while a leftover break sits in it -- and that break is left
   * where it is through an undo, so the browser's record of the field keeps
   * pointing at something. The attribute says the field is empty without
   * emptying it, so the placeholder comes back at the moment the text goes.
   */
  markEmptiness(field: HTMLElement) {
    if (readFieldText(field)) {
      field.removeAttribute("data-empty");
    } else {
      field.setAttribute("data-empty", "");
    }
  }

  /**
   * Bring the query up to date with what a field now holds.
   *
   * Undo and redo are the browser replaying its own record of the field, so the
   * leftover break is left where it is on those: tidying the DOM underneath
   * that record is what leaves the next redo with nothing to redo into. It goes
   * as soon as the user edits the field again.
   */
  afterInput(field: HTMLElement, e: InputEvent) {
    if (e.inputType !== "historyUndo" && e.inputType !== "historyRedo") {
      this.clearEmptied(field);
    }
    this.markEmptiness(field);
    this.commit();
  }

  /**
   * Paste as plain text, keeping the line breaks.
   *
   * Left to itself a `contenteditable` pastes markup, which puts fonts, colors
   * and arbitrary elements inside a field whose whole content is a search
   * pattern. Inserting the clipboard's plain text keeps the field to text and
   * breaks, and reaches the same code path that reads it back.
   */
  paste(e: ClipboardEvent) {
    const field = e.currentTarget as HTMLElement;
    const clipboard = e.clipboardData;
    if (!clipboard) {
      // Nothing to read. Taking the event over here would leave the user with
      // a paste that does nothing at all.
      return;
    }
    // Refused whatever the clipboard turns out to hold, because the browser's
    // own paste puts markup -- or an image -- inside a field whose entire
    // content is a search pattern.
    e.preventDefault();
    const text = clipboard.getData("text/plain");
    if (!text) {
      return;
    }
    typeIntoField(field, normalizeLineEndings(text));
    this.clearEmptied(field);
    this.markEmptiness(field);
    // The insert command raises `input` and the field's listener commits on
    // it, but the fallback edits the DOM directly and raises nothing. The
    // commit is repeated here for that case; a second one costs nothing, since
    // committing an unchanged query does nothing.
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
      // Whether the ranges moved has to be decided against the outgoing query,
      // before it is replaced.
      const moved = !sameMatches(this.query, query);
      this.query = query;
      this.view.dispatch({ effects: setSearchQuery.of(query) });
      if (moved) {
        this.revealFirstMatch();
      }
    }
  }

  /**
   * Put the cursor on the first match and bring it into view.
   *
   * Runs after the query has been committed, so it looks for what the field
   * currently says. Hanging this off `keydown` instead would read the field one
   * keystroke stale: type "the light" and the cursor lands on "the ligh", which
   * is not a match of the query on screen, so nothing carries the current-match
   * highlight.
   *
   * Only the one match is selected. The rest are highlighted, and
   * `@codemirror/search` draws those decorations for the visible ranges alone,
   * so what it costs to show them does not grow with the script.
   */
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

  /**
   * Whether the recorded matches are still the matches of `query` in this
   * document.
   *
   * `doc` compares by identity because an unchanged document is the same `Text`
   * object. Together with `sameMatches` that covers what the match set is a
   * function of in this editor, though not everything `getCursor` can read: a
   * whole-word search resolves its word characters from language data, and
   * `test` predicates are handed the state. Neither varies here while the
   * document and the query both stand still.
   */
  hasMatches(state: EditorState, query: SearchQuery) {
    const matched = this.matched;
    return (
      !!matched && matched.doc === state.doc && sameMatches(matched.query, query)
    );
  }

  /** Walk the document and record where the query matches. */
  findMatches(state: EditorState, query: SearchQuery) {
    // Whatever is on the label was rendered against the old match set.
    this.rendered = undefined;

    const searchQuery = new SearchQuery(query);
    // A blank or malformed pattern has nothing to count, and `getCursor` throws
    // outright on an invalid regex. The walk runs from a timer, so a throw here
    // has no CodeMirror frame above it to land in -- it surfaces as an unhandled
    // error and the count silently stops tracking. `valid` covers both cases: it
    // requires a non-empty search, and for regex mode a pattern that compiles.
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

    // Recorded only once the walk has finished, so a throw part-way through
    // leaves the previous match set in place and the next update tries again,
    // rather than publishing a half-built one.
    this.matched = { doc: state.doc, query, valid: true, froms, tos };
  }

  /**
   * Which match the selection sits inside, or 0 when it sits inside none -- the
   * label reads "1 of M" until the user lands on one.
   */
  indexAt(from: number, to: number) {
    const { froms, tos } = this.matched!;

    // The rightmost match starting at or before the selection. Matches never
    // overlap, so every earlier one ends earlier still, and if this one does not
    // reach past the selection then none of them does.
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

  /** Write the standing match set and the selection onto the label. */
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

  /**
   * Where the query first matches, or null if it never does.
   *
   * Answered from the recorded matches when they are current. Opening a cursor
   * instead is cheap when a match turns up early and a walk over the whole
   * document when none does -- which is exactly the case a search field is in
   * halfway through a word being typed.
   */
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

  /**
   * Add a line break to a field, where the caret is.
   *
   * Enter belongs to the search itself in both fields, so a break is entered
   * with the modifier held, the same combination the same fields answer to in
   * other editors.
   */
  breakLine(field: HTMLElement) {
    typeIntoField(field, "\n");
    this.clearEmptied(field);
    this.markEmptiness(field);
    this.commit();
  }

  /**
   * Whether this Enter asks for a line break rather than for the search.
   *
   * Shift is excluded because Shift+Enter already means "the previous match",
   * and a combination that includes it belongs to whatever it meant before.
   */
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
      // Everything else a find-field keystroke does happens once it has been
      // committed, in `revealFirstMatch`.
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
      // The matches still stand, so the only thing that can have moved is which
      // one the selection is on -- a binary search, cheap enough to do here.
      // Deferring it would make `next` and `previous` renumber a quarter of a
      // second after the match they highlighted.
      this.renderCount(state);
    } else {
      this.scheduleCount();
    }
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
    // A line number is one line. The find and replace fields opposite carry
    // `aria-multiline` because they take more than one and this one does not.
    this.input.setAttribute("aria-multiline", "false");
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
  // A field the user has emptied can still be holding the break a browser
  // leaves behind, which is enough to keep it from being `:empty`. The
  // attribute says it is empty in that case, so the placeholder returns with
  // the text rather than waiting for the next keystroke.
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
