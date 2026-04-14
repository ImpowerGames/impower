import { getIndentUnit } from "@codemirror/language";
import {
  EditorState,
  Facet,
  Line,
  RangeSetBuilder,
  combineConfig,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";

/** Thickness of indent guides. Probably should be integer pixel values. */
const MARKER_THICKNESS = "1px";

const indentationGuideTheme = EditorView.baseTheme({
  "&light.cm-editor": {
    "--indent-marker-bg-color": "#0000001A",
    "--indent-marker-active-bg-color": "#0000004D",
  },

  "&dark.cm-editor": {
    "--indent-marker-bg-color": "#ffffff1A",
    "--indent-marker-active-bg-color": "#ffffff4D",
  },

  ".cm-line": {
    position: "relative",
  },

  // this pseudo-element is used to draw the indent guides,
  // while still allowing the line to have its own background.
  ".cm-indent-guides::before": {
    content: '""',
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "var(--indent-guides)",
    pointerEvents: "none",
  },
});

function createGradient(
  markerCssProperty: string,
  indentWidth: number,
  startOffset: number,
  columns: number,
) {
  const gradient = `repeating-linear-gradient(to right, var(${markerCssProperty}) 0 ${MARKER_THICKNESS}, transparent ${MARKER_THICKNESS} ${indentWidth}ch)`;
  // Subtract one pixel from the background width to get rid of artifacts of pixel rounding
  return `${gradient} calc(${startOffset * indentWidth}ch) / calc(${
    indentWidth * columns
  }ch - 1px) no-repeat`;
}

function makeBackgroundCSS(
  entry: IndentEntry,
  indentWidth: number,
  visualLength: number,
  hideFirstIndent: boolean,
) {
  let { level, active, skipCapping } = entry;

  // Cap the level to prevent drawing guides past the visual length of the line.
  // We skip capping for empty lines that logically connect blocks.
  // Using Math.ceil ensures the guide appears as soon as the line is 1 space past the boundary.
  const maxLevel = skipCapping ? level : Math.ceil(visualLength / indentWidth);
  level = Math.min(level, maxLevel);

  if (hideFirstIndent && level === 0) {
    return "";
  }

  const startAt = hideFirstIndent ? 1 : 0;
  const backgrounds = [];

  // Only render the active marker if it falls within the line's allowed visual length
  if (active !== undefined && active <= maxLevel && active >= startAt + 1) {
    const guidesBeforeActive = active - startAt - 1;

    if (guidesBeforeActive > 0) {
      backgrounds.push(
        createGradient(
          "--indent-marker-bg-color",
          indentWidth,
          startAt,
          guidesBeforeActive,
        ),
      );
    }

    backgrounds.push(
      createGradient(
        "--indent-marker-active-bg-color",
        indentWidth,
        active - 1,
        1,
      ),
    );

    if (active !== level) {
      backgrounds.push(
        createGradient(
          "--indent-marker-bg-color",
          indentWidth,
          active,
          level - active,
        ),
      );
    }
  } else {
    // Fallback: draw regular guides up to the capped level
    if (level > startAt) {
      backgrounds.push(
        createGradient(
          "--indent-marker-bg-color",
          indentWidth,
          startAt,
          level - startAt,
        ),
      );
    }
  }

  return backgrounds.join(",");
}

export interface IndentEntry {
  line: Line;
  col: number;
  level: number;
  empty: boolean;
  active?: number;
  skipCapping?: boolean;
}

/**
 * Indentation map for a set of lines.
 *
 * This map will contain the indentation for lines that are not a part of the given set,
 * but this is because calculating the indentation for those lines was necessary to
 * calculate the indentation for the lines provided to the constructor.
 *
 * @see {@link IndentEntry}
 */
export class IndentationMap {
  /** The {@link EditorState} indentation is derived from. */
  private state: EditorState;

  /** The internal mapping of line numbers to {@link IndentEntry} objects. */
  private map: Map<number, IndentEntry>;

  /** The width of the editor's indent unit. */
  private unitWidth: number;

  /**
   * @param lines - The set of lines to get the indentation map for.
   * @param state - The {@link EditorState} to derive the indentation map from.
   * @param unitWidth - The width of the editor's indent unit.
   */
  constructor(lines: Line[], state: EditorState, unitWidth: number) {
    this.state = state;
    this.map = new Map();
    this.unitWidth = unitWidth;

    let minLine = state.doc.lines;
    let maxLine = 1;

    for (const line of lines) {
      if (line.number < minLine) minLine = line.number;
      if (line.number > maxLine) maxLine = line.number;
      this.add(line);
    }

    if (this.state.facet(indentationGuideConfig).highlightActiveBlock) {
      this.findAndSetActiveLines(minLine, maxLine);
    }
  }

  /**
   * Checks if the indentation map has an entry for the given line.
   *
   * @param line - The {@link Line} or line number to check for.
   */
  has(line: Line | number) {
    return this.map.has(typeof line === "number" ? line : line.number);
  }

  /**
   * Returns the {@link IndentEntry} for the given line.
   *
   * Note that this function will throw an error if the line does not exist in the map.
   *
   * @param line - The {@link Line} or line number to get the entry for.
   */
  get(line: Line | number) {
    const entry = this.map.get(typeof line === "number" ? line : line.number);

    if (!entry) {
      throw new Error("Line not found in indentation map");
    }

    return entry;
  }

  /**
   * Gets or computes the entry for a line, caching it in the map.
   */
  private getIEntry(lineNo: number): IndentEntry {
    if (this.has(lineNo)) {
      return this.get(lineNo);
    }
    const line = this.state.doc.line(lineNo);
    return this.add(line);
  }

  /**
   * Sets the {@link IndentEntry} for the given line.
   *
   * @param line - The {@link Line} to set the entry for.
   * @param col - The visual beginning whitespace width of the line.
   * @param level - The indentation level of the line.
   * @param skipCapping - Whether to bypass visual line length caps.
   */
  private set(line: Line, col: number, level: number, skipCapping = false) {
    const empty = !line.text.trim().length;
    const entry: IndentEntry = { line, col, level, empty, skipCapping };
    this.map.set(entry.line.number, entry);

    return entry;
  }

  /**
   * Adds a line to the indentation map.
   *
   * @param line - The {@link Line} to add to the map.
   */
  private add(line: Line) {
    if (this.has(line)) {
      return this.get(line);
    }

    // empty lines continue their indentation from surrounding lines
    if (!line.length || !line.text.trim().length) {
      // the very first line, if empty, is just ignored and set as a 0 indent level
      if (line.number === 1) {
        return this.set(line, 0, 0);
      }

      // if we're at the end, we'll just use the previous line's indentation
      if (line.number === this.state.doc.lines) {
        const prev = this.closestNonEmpty(line, -1);
        return this.set(line, 0, prev.level);
      }

      const prev = this.closestNonEmpty(line, -1);
      const next = this.closestNonEmpty(line, 1);

      const skipCapping = next.level >= prev.level;

      // if the next line ends the block, we'll use the previous line's indentation
      if (prev.level >= next.level) {
        return this.set(line, 0, prev.level, skipCapping);
      }

      // having an indent marker that starts from an empty line looks weird
      if (prev.empty && prev.level === 0 && next.level !== 0) {
        return this.set(line, 0, 0, skipCapping);
      }

      // if the next indentation level is greater than the previous,
      // we'll only increment up to the next indentation level. this prevents
      // a weirdly "backwards propagating" indentation.
      if (next.level > prev.level) {
        return this.set(line, 0, prev.level + 1, skipCapping);
      }

      // else, we default to the next line's indentation
      return this.set(line, 0, next.level, skipCapping);
    }

    const col = numColumns(line.text, this.state.tabSize);
    const level = Math.floor(col / this.unitWidth);

    return this.set(line, col, level);
  }

  /**
   * Finds the closest non-empty line, starting from the given line.
   *
   * @param from - The {@link Line} to start from.
   * @param dir - The direction to search in. Either `1` or `-1`.
   */
  private closestNonEmpty(from: Line, dir: -1 | 1) {
    let lineNo = from.number + dir;

    while (dir === -1 ? lineNo >= 1 : lineNo <= this.state.doc.lines) {
      if (this.has(lineNo)) {
        const entry = this.get(lineNo);
        if (!entry.empty) {
          return entry;
        }
      } else {
        // we check if the line is empty, if it's not, we can
        // just create a new entry for it and return it.
        const line = this.state.doc.line(lineNo);
        if (line.text.trim().length) {
          const col = numColumns(line.text, this.state.tabSize);
          const level = Math.floor(col / this.unitWidth);
          return this.set(line, col, level);
        }
      }
      lineNo += dir;
    }

    // if we're here, we didn't find anything.
    // that means we're at the beginning/end of the document,
    // and the first/last line is empty.
    const line = this.state.doc.line(dir === -1 ? 1 : this.state.doc.lines);
    return this.set(line, 0, 0);
  }

  /**
   * Finds the state's active block (via the current selection) and sets
   * the active indent level for the lines in the block.
   */
  private findAndSetActiveLines(minLine: number, maxLine: number) {
    const currentLine = getCurrentLine(this.state);
    let current = this.getIEntry(currentLine.number);

    // check if the current line is starting a new block, if yes, we want to
    // start from inside the block.
    if (current.line.number + 1 <= this.state.doc.lines) {
      const next = this.getIEntry(current.line.number + 1);
      if (next.level > current.level) {
        current = next;
      }
    }

    // same, but if the current line is ending a block
    if (current.line.number - 1 >= 1) {
      const prev = this.getIEntry(current.line.number - 1);
      if (prev.level > current.level) {
        current = prev;
      }
    }

    if (current.level === 0) {
      return;
    }

    current.active = current.level;

    // iterate to the start of the block (bounded by viewport minLine)
    for (let start = current.line.number; start > minLine; start--) {
      const prev = this.getIEntry(start - 1);
      if (prev.level < current.level) {
        break;
      }
      prev.active = current.level;
    }

    // iterate to the end of the block (bounded by viewport maxLine)
    for (let end = current.line.number; end < maxLine; end++) {
      const next = this.getIEntry(end + 1);
      if (next.level < current.level) {
        break;
      }
      next.active = current.level;
    }
  }
}

/**
 * Returns the number of columns that a string is indented, controlling for
 * tabs. This is useful for determining the indentation level of a line.
 *
 * Note that this only returns the number of _visible_ columns, not the number
 * of whitespace characters at the start of the string.
 *
 * @param str - The string to check.
 * @param tabSize - The size of a tab character. Usually 2 or 4.
 */
export function numColumns(str: string, tabSize: number) {
  let col = 0;

  // eslint-disable-next-line no-restricted-syntax
  loop: for (let i = 0; i < str.length; i++) {
    switch (str[i]) {
      case " ": {
        col += 1;
        continue loop;
      }
      case "\t": {
        // if the current column is a multiple of the tab size, we can just
        // add the tab size to the column. otherwise, we need to add the
        // difference between the tab size and the current column.
        col += tabSize - (col % tabSize);
        continue loop;
      }
      case "\r": {
        continue loop;
      }
      default: {
        break loop;
      }
    }
  }

  return col;
}

/**
 * Calculates the total visual length of a string, accounting for tabs.
 *
 * @param str - The string to check.
 * @param tabSize - The size of a tab character.
 */
export function getVisualLength(str: string, tabSize: number) {
  let length = 0;

  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\t") {
      length += tabSize - (length % tabSize);
    } else {
      length += 1;
    }
  }

  return length;
}

/**
 * Gets the line at the position of the primary cursor.
 *
 * @param state - The editor state from which to extract the line.
 */
export function getCurrentLine(state: EditorState) {
  const currentPos = state.selection.main.head;
  return state.doc.lineAt(currentPos);
}

/**
 * Gets the visible lines in the editor. Lines will not be repeated.
 *
 * @param view - The editor view to get the visible lines from.
 * @param state - The editor state. Defaults to the view's current one.
 */
export function getVisibleLines(view: EditorView, state = view.state) {
  const lines: Line[] = [];

  for (const { from, to } of view.visibleRanges) {
    let pos = from;

    while (pos <= to) {
      const line = state.doc.lineAt(pos);
      lines.push(line);
      pos = line.to + 1;
    }
  }

  return lines;
}

class IndentGuideClass implements PluginValue {
  view: EditorView;
  decorations!: DecorationSet;

  private unitWidth: number;
  private currentLineNumber: number;

  constructor(view: EditorView) {
    this.view = view;
    this.unitWidth = getIndentUnit(view.state);
    this.currentLineNumber = getCurrentLine(view.state).number;
    this.generate(view.state);
  }

  update(update: ViewUpdate) {
    const unitWidth = getIndentUnit(update.state);
    const unitWidthChanged = unitWidth !== this.unitWidth;
    if (unitWidthChanged) {
      this.unitWidth = unitWidth;
    }
    const lineNumber = getCurrentLine(update.state).number;
    const lineNumberChanged = lineNumber !== this.currentLineNumber;
    this.currentLineNumber = lineNumber;

    const activeBlockUpdateRequired =
      update.state.facet(indentationGuideConfig).highlightActiveBlock &&
      lineNumberChanged;

    if (
      update.docChanged ||
      update.viewportChanged ||
      unitWidthChanged ||
      activeBlockUpdateRequired
    ) {
      this.generate(update.state);
    }
  }

  private generate(state: EditorState) {
    const builder = new RangeSetBuilder<Decoration>();

    const lines = getVisibleLines(this.view, state);
    const map = new IndentationMap(lines, state, this.unitWidth);
    const { hideFirstIndent } = state.facet(indentationGuideConfig);
    const tabSize = state.tabSize;

    for (const line of lines) {
      const entry = map.get(line.number);
      const visualLength = getVisualLength(line.text, tabSize);

      const backgrounds = makeBackgroundCSS(
        entry,
        this.unitWidth,
        visualLength,
        hideFirstIndent,
      );

      // Only decorate if there are backgrounds to paint
      if (backgrounds.length > 0) {
        builder.add(
          line.from,
          line.from,
          Decoration.line({
            class: "cm-indent-guides",
            attributes: {
              style: `--indent-guides: ${backgrounds}`,
            },
          }),
        );
      }
    }

    this.decorations = builder.finish();
  }
}

export interface IndentationGuideConfiguration {
  /**
   * Determines whether active block marker is styled differently.
   */
  highlightActiveBlock?: boolean;

  /**
   * Determines whether markers in the first column are omitted.
   */
  hideFirstIndent?: boolean;
}

export const indentationGuideConfig = Facet.define<
  IndentationGuideConfiguration,
  Required<IndentationGuideConfiguration>
>({
  combine(configs) {
    return combineConfig(configs, {
      highlightActiveBlock: true,
      hideFirstIndent: false,
    });
  },
});

export function indentationGuides(config: IndentationGuideConfiguration = {}) {
  return [
    indentationGuideConfig.of(config),
    indentationGuideTheme,
    ViewPlugin.fromClass(IndentGuideClass, {
      decorations: (v) => v.decorations,
    }),
  ];
}
