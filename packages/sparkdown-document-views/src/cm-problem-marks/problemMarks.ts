import {
  type Diagnostic,
  forEachDiagnostic,
  setDiagnosticsEffect,
} from "@codemirror/lint";
import { EditorState, Range, RangeSet, StateField } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  GutterMarker,
  gutterLineClass,
} from "@codemirror/view";

type ProblemSeverity = "error" | "warning" | "info";

const SEVERITY_RANK: Record<ProblemSeverity, number> = {
  info: 1,
  warning: 2,
  error: 3,
};

const isProblemSeverity = (
  severity: Diagnostic["severity"],
): severity is ProblemSeverity => severity in SEVERITY_RANK;

const lineMarks: Record<ProblemSeverity, Decoration> = {
  error: Decoration.line({ class: "cm-problem-line cm-problem-line-error" }),
  warning: Decoration.line({
    class: "cm-problem-line cm-problem-line-warning",
  }),
  info: Decoration.line({ class: "cm-problem-line cm-problem-line-info" }),
};

class ProblemGutterClass extends GutterMarker {
  constructor(readonly severity: ProblemSeverity) {
    super();
    this.elementClass = `cm-problem-gutter-${severity}`;
  }

  override eq(other: ProblemGutterClass) {
    return other.severity === this.severity;
  }
}

const gutterClasses: Record<ProblemSeverity, ProblemGutterClass> = {
  error: new ProblemGutterClass("error"),
  warning: new ProblemGutterClass("warning"),
  info: new ProblemGutterClass("info"),
};

interface ProblemLines {
  lines: DecorationSet;
  gutter: RangeSet<GutterMarker>;
}

const EMPTY_PROBLEM_LINES: ProblemLines = {
  lines: Decoration.none,
  gutter: RangeSet.empty,
};

const getProblemLineSeverities = (
  state: EditorState,
): Map<number, ProblemSeverity> => {
  const severities = new Map<number, ProblemSeverity>();
  forEachDiagnostic(state, ({ severity }, from) => {
    if (!isProblemSeverity(severity)) {
      return;
    }
    const lineNumber = state.doc.lineAt(from).number;
    const current = severities.get(lineNumber);
    if (!current || SEVERITY_RANK[severity] > SEVERITY_RANK[current]) {
      severities.set(lineNumber, severity);
    }
  });
  return severities;
};

const buildProblemLines = (state: EditorState): ProblemLines => {
  const severities = [...getProblemLineSeverities(state)].sort(
    ([a], [b]) => a - b,
  );
  if (severities.length === 0) {
    return EMPTY_PROBLEM_LINES;
  }
  const lines: Range<Decoration>[] = [];
  const gutter: Range<GutterMarker>[] = [];
  for (const [lineNumber, severity] of severities) {
    const from = state.doc.line(lineNumber).from;
    lines.push(lineMarks[severity].range(from));
    gutter.push(gutterClasses[severity].range(from));
  }
  return {
    lines: Decoration.set(lines),
    gutter: RangeSet.of(gutter),
  };
};

const problemLinesField = StateField.define<ProblemLines>({
  create(state) {
    return buildProblemLines(state);
  },
  update(value, tr) {
    if (
      tr.docChanged ||
      tr.effects.some((effect) => effect.is(setDiagnosticsEffect))
    ) {
      return buildProblemLines(tr.state);
    }
    return value;
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.lines),
    gutterLineClass.from(f, (v) => v.gutter),
  ],
});

const mark = (glyph: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>`,
  )}")`;

const PROBLEM_MARKS: Record<ProblemSeverity, string> = {
  error: mark(`<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6m0-6 6 6"/>`),
  warning: mark(`<path d="m12 3 10 18H2zM12 9v5m0 3h.01"/>`),
  info: mark(`<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>`),
};

const PROBLEM_COLORS: Record<ProblemSeverity, string> = {
  error: "var(--editor-problem-error)",
  warning: "var(--editor-problem-warning)",
  info: "var(--editor-problem-info)",
};

const severityRules = (severity: ProblemSeverity) => ({
  [`& .cm-problem-line-${severity}::after`]: {
    backgroundColor: PROBLEM_COLORS[severity],
    maskImage: PROBLEM_MARKS[severity],
    WebkitMaskImage: PROBLEM_MARKS[severity],
  },
  [`&.cm-line-numbers .cm-lineNumbers .cm-gutterElement.cm-problem-gutter-${severity}`]:
    {
      color: PROBLEM_COLORS[severity],
      opacity: "1",
    },
});

const problemMarksTheme = EditorView.baseTheme({
  "& .cm-line.cm-problem-line": {
    position: "relative",
  },
  "& .cm-problem-line::after": {
    content: "''",
    position: "absolute",
    top: "calc((var(--script-leading, 1.5) * 1em - 1em) / 2)",
    right: "calc(6px - var(--script-margin, 30px))",
    width: "1em",
    height: "1em",
    maskPosition: "center",
    maskSize: "contain",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    WebkitMaskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    pointerEvents: "none",
  },
  ...severityRules("error"),
  ...severityRules("warning"),
  ...severityRules("info"),
});

export const problemMarks = () => [problemLinesField, problemMarksTheme];
