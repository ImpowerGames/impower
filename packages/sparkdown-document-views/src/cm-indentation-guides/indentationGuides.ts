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

  const maxLevel = skipCapping ? level : Math.ceil(visualLength / indentWidth);
  level = Math.min(level, maxLevel);

  if (hideFirstIndent && level === 0) {
    return "";
  }

  const startAt = hideFirstIndent ? 1 : 0;
  const backgrounds = [];

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

export class IndentationMap {
  private state: EditorState;

  private map: Map<number, IndentEntry>;

  private unitWidth: number;

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

  has(line: Line | number) {
    return this.map.has(typeof line === "number" ? line : line.number);
  }

  get(line: Line | number) {
    const entry = this.map.get(typeof line === "number" ? line : line.number);

    if (!entry) {
      throw new Error("Line not found in indentation map");
    }

    return entry;
  }

  private getIEntry(lineNo: number): IndentEntry {
    if (this.has(lineNo)) {
      return this.get(lineNo);
    }
    const line = this.state.doc.line(lineNo);
    return this.add(line);
  }

  private set(line: Line, col: number, level: number, skipCapping = false) {
    const empty = !line.text.trim().length;
    const entry: IndentEntry = { line, col, level, empty, skipCapping };
    this.map.set(entry.line.number, entry);

    return entry;
  }

  private add(line: Line) {
    if (this.has(line)) {
      return this.get(line);
    }

    if (!line.length || !line.text.trim().length) {
      if (line.number === 1) {
        return this.set(line, 0, 0);
      }

      if (line.number === this.state.doc.lines) {
        const prev = this.closestNonEmpty(line, -1);
        return this.set(line, 0, prev.level);
      }

      const prev = this.closestNonEmpty(line, -1);
      const next = this.closestNonEmpty(line, 1);

      const skipCapping = next.level >= prev.level;

      if (prev.level >= next.level) {
        return this.set(line, 0, prev.level, skipCapping);
      }

      if (prev.empty && prev.level === 0 && next.level !== 0) {
        return this.set(line, 0, 0, skipCapping);
      }

      if (next.level > prev.level) {
        return this.set(line, 0, prev.level + 1, skipCapping);
      }

      return this.set(line, 0, next.level, skipCapping);
    }

    const col = numColumns(line.text, this.state.tabSize);
    const level = Math.floor(col / this.unitWidth);

    return this.set(line, col, level);
  }

  private closestNonEmpty(from: Line, dir: -1 | 1) {
    let lineNo = from.number + dir;

    while (dir === -1 ? lineNo >= 1 : lineNo <= this.state.doc.lines) {
      if (this.has(lineNo)) {
        const entry = this.get(lineNo);
        if (!entry.empty) {
          return entry;
        }
      } else {
        const line = this.state.doc.line(lineNo);
        if (line.text.trim().length) {
          const col = numColumns(line.text, this.state.tabSize);
          const level = Math.floor(col / this.unitWidth);
          return this.set(line, col, level);
        }
      }
      lineNo += dir;
    }

    const line = this.state.doc.line(dir === -1 ? 1 : this.state.doc.lines);
    return this.set(line, 0, 0);
  }

  private findAndSetActiveLines(minLine: number, maxLine: number) {
    const currentLine = getCurrentLine(this.state);
    let current = this.getIEntry(currentLine.number);

    if (current.line.number + 1 <= this.state.doc.lines) {
      const next = this.getIEntry(current.line.number + 1);
      if (next.level > current.level) {
        current = next;
      }
    }

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

    for (let start = current.line.number; start > minLine; start--) {
      const prev = this.getIEntry(start - 1);
      if (prev.level < current.level) {
        break;
      }
      prev.active = current.level;
    }

    for (let end = current.line.number; end < maxLine; end++) {
      const next = this.getIEntry(end + 1);
      if (next.level < current.level) {
        break;
      }
      next.active = current.level;
    }
  }
}

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

export function getCurrentLine(state: EditorState) {
  const currentPos = state.selection.main.head;
  return state.doc.lineAt(currentPos);
}

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
  highlightActiveBlock?: boolean;

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
