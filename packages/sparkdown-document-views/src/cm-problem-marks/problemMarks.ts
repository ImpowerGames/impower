import {
  type Action,
  type Diagnostic,
  forEachDiagnostic,
  linter,
  setDiagnosticsEffect,
} from "@codemirror/lint";
import {
  EditorState,
  Range,
  RangeSet,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  GutterMarker,
  gutterLineClass,
  showTooltip,
  type Tooltip,
  type TooltipView,
  ViewPlugin,
} from "@codemirror/view";
import { coarsePointer } from "@impower/codemirror-vscode-lsp-client/src";
import { FixMenu } from "@impower/impower-ui/fix-menu";
import { h, render } from "preact";

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

export const PROBLEM_POPOVER_GRACE = 220;

export const PROBLEM_POPOVER_DELAY = 300;

interface PopoverTarget {
  pos: number;
  line: boolean;
}

interface PlacedDiagnostic {
  diagnostic: Diagnostic;
  from: number;
  to: number;
}

interface PopoverState extends PopoverTarget {
  diagnostics: PlacedDiagnostic[];
}

export const setProblemPopover = StateEffect.define<PopoverTarget | null>();

const problemsAt = (
  state: EditorState,
  { pos, line }: PopoverTarget,
): PlacedDiagnostic[] => {
  const found: PlacedDiagnostic[] = [];
  const { from: lineFrom, to: lineTo } = state.doc.lineAt(pos);
  forEachDiagnostic(state, (diagnostic, from, to) => {
    if (line ? from >= lineFrom && from <= lineTo : from <= pos && pos <= to) {
      found.push({ diagnostic, from, to });
    }
  });
  return found;
};

const popoverAt = (
  state: EditorState,
  target: PopoverTarget,
): PopoverState | null => {
  const diagnostics = problemsAt(state, target);
  return diagnostics.length ? { ...target, diagnostics } : null;
};

const renderPopover = (
  view: EditorView,
  popover: PopoverState,
): TooltipView => {
  const dom = document.createElement("ul");
  dom.className = "cm-tooltip-lint cm-problem-popover";
  const hosts: HTMLElement[] = [];
  const choose = (action: Action, from: number, to: number) => {
    view.dispatch({ effects: setProblemPopover.of(null) });
    action.apply(view, from, to);
  };
  for (const { diagnostic, from, to } of popover.diagnostics) {
    const item = document.createElement("li");
    item.className = `cm-diagnostic cm-diagnostic-${diagnostic.severity}`;
    const text = document.createElement("span");
    text.className = "cm-diagnosticText";
    text.append(
      diagnostic.renderMessage
        ? diagnostic.renderMessage(view)
        : diagnostic.message,
    );
    item.append(text);
    const actions = diagnostic.actions ?? [];
    if (actions.length) {
      const host = document.createElement("div");
      host.className = "cm-problem-fix";
      item.append(host);
      hosts.push(host);
      render(
        h(FixMenu<Action>, {
          actions,
          onChoose: (action: Action) => choose(action, from, to),
          onOpenChange: (open: boolean) =>
            view.plugin(problemPopoverPointer)?.holdForMenu(open),
        }),
        host,
      );
    }
    dom.append(item);
  }
  return {
    dom,
    mount: () => view.plugin(problemPopoverPointer)?.watch(dom),
    destroy: () => hosts.forEach((host) => render(null, host)),
  };
};

const popoverTooltip = (popover: PopoverState): Tooltip => {
  const from = Math.min(...popover.diagnostics.map((d) => d.from));
  const to = Math.max(...popover.diagnostics.map((d) => d.to));
  return {
    pos: popover.line ? from : popover.pos,
    end: popover.line ? undefined : to,
    above: true,
    create: (view) => renderPopover(view, popover),
  };
};

const problemPopoverField = StateField.define<PopoverState | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setProblemPopover)) {
        return effect.value ? popoverAt(tr.state, effect.value) : null;
      }
    }
    if (!value) {
      return value;
    }
    if (tr.docChanged) {
      return null;
    }
    if (tr.effects.some((effect) => effect.is(setDiagnosticsEffect))) {
      return popoverAt(tr.state, value);
    }
    return value;
  },
  provide: (field) =>
    showTooltip.compute([field], (state) => {
      const popover = state.field(field);
      return popover ? popoverTooltip(popover) : null;
    }),
});

const sameProblems = (state: EditorState, a: number, b: number) => {
  const at = problemsAt(state, { pos: a, line: false });
  const other = problemsAt(state, { pos: b, line: false });
  return (
    at.length === other.length &&
    at.every((placed, i) => placed.diagnostic === other[i]!.diagnostic)
  );
};

const overRange = (
  view: EditorView,
  { from, to }: PlacedDiagnostic,
  x: number,
  y: number,
) => {
  const start = view.coordsAtPos(from, 1);
  const end = view.coordsAtPos(to, -1);
  if (!start || !end || y < start.top || y > end.bottom) {
    return false;
  }
  return start.top !== end.top || (x >= start.left - 2 && x <= end.right + 2);
};

const problemLineAt = (view: EditorView, x: number, y: number) => {
  const block = view.lineBlockAtHeight(y - view.documentTop);
  const line = view.state.doc.lineAt(block.from);
  if (!getProblemLineSeverities(view.state).has(line.number)) {
    return null;
  }
  const node = view.domAtPos(line.from).node;
  const element = (
    node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
  ) as Element | null;
  const lineElement = element?.closest(".cm-line");
  if (!lineElement || x <= lineElement.getBoundingClientRect().right) {
    return null;
  }
  return line;
};

const problemPopoverPointer = ViewPlugin.fromClass(
  class {
    showTimer = -1;
    pendingPos: number | null = null;
    hideTimer = -1;
    menuOpen = false;
    insidePopover = false;

    constructor(readonly view: EditorView) {
      view.dom.addEventListener("pointermove", this.move);
      view.dom.addEventListener("pointerleave", this.leave);
    }

    get open() {
      return this.view.state.field(problemPopoverField, false) ?? null;
    }

    fine(event: PointerEvent) {
      return (
        event.pointerType !== "touch" && !this.view.state.facet(coarsePointer)
      );
    }

    watch(dom: HTMLElement) {
      dom.addEventListener("pointerenter", () => {
        this.insidePopover = true;
        this.cancelHide();
      });
      dom.addEventListener("pointerleave", (event) => {
        this.insidePopover = false;
        if (this.fine(event)) {
          this.scheduleHide();
        }
      });
    }

    holdForMenu(open: boolean) {
      this.menuOpen = open;
      if (open) {
        this.cancelHide();
      } else if (
        !this.insidePopover &&
        !this.view.state.facet(coarsePointer)
      ) {
        this.scheduleHide();
      }
    }

    move = (event: PointerEvent) => {
      if (!this.fine(event)) {
        return;
      }
      if ((event.target as Element | null)?.closest?.(".cm-problem-popover")) {
        this.cancelHide();
        return;
      }
      const { clientX: x, clientY: y } = event;
      const pos = this.view.posAtCoords({ x, y });
      const over =
        pos != null &&
        problemsAt(this.view.state, { pos, line: false }).some((placed) =>
          overRange(this.view, placed, x, y),
        );
      if (!over) {
        this.cancelShow();
        if (this.open) {
          this.scheduleHide();
        }
        return;
      }
      this.cancelHide();
      const open = this.open;
      const covers = (at: number | null) =>
        at !== null && sameProblems(this.view.state, at, pos);
      if (open && !open.line && covers(open.pos)) {
        this.cancelShow();
        return;
      }
      if (!covers(this.pendingPos)) {
        this.scheduleShow(pos);
      }
    };

    leave = (event: PointerEvent) => {
      this.cancelShow();
      if (this.fine(event) && this.open && !this.insidePopover) {
        this.scheduleHide();
      }
    };

    scheduleShow(pos: number) {
      this.cancelShow();
      this.pendingPos = pos;
      this.showTimer = window.setTimeout(() => {
        this.showTimer = -1;
        this.pendingPos = null;
        this.view.dispatch({
          effects: setProblemPopover.of({ pos, line: false }),
        });
      }, PROBLEM_POPOVER_DELAY);
    }

    scheduleHide() {
      if (this.hideTimer >= 0 || this.menuOpen) {
        return;
      }
      this.hideTimer = window.setTimeout(() => {
        this.hideTimer = -1;
        if (!this.menuOpen && !this.insidePopover && this.open) {
          this.view.dispatch({ effects: setProblemPopover.of(null) });
        }
      }, PROBLEM_POPOVER_GRACE);
    }

    cancelShow() {
      clearTimeout(this.showTimer);
      this.showTimer = -1;
      this.pendingPos = null;
    }

    cancelHide() {
      clearTimeout(this.hideTimer);
      this.hideTimer = -1;
    }

    destroy() {
      this.cancelShow();
      this.cancelHide();
      this.view.dom.removeEventListener("pointermove", this.move);
      this.view.dom.removeEventListener("pointerleave", this.leave);
    }
  },
  {
    eventHandlers: {
      click(event, view) {
        if (!view.state.facet(coarsePointer)) {
          return false;
        }
        const line = problemLineAt(view, event.clientX, event.clientY);
        if (!line) {
          return false;
        }
        const open = view.state.field(problemPopoverField, false);
        const same =
          open?.line && view.state.doc.lineAt(open.pos).number === line.number;
        view.dispatch({
          effects: setProblemPopover.of(
            same ? null : { pos: line.from, line: true },
          ),
        });
        return true;
      },
    },
  },
);

const problemPopoverTheme = EditorView.baseTheme({
  "& .cm-tooltip-lint:empty": {
    display: "none",
  },
  "& .cm-tooltip-hover:not(:has(> :not(.cm-tooltip-lint:empty)))": {
    display: "none",
  },
  "& .cm-tooltip-lint:empty + .cm-tooltip-section": {
    borderTop: "none",
  },
  "& .cm-problem-fix": {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "6px",
  },
});

export const problemMarks = () => [
  problemLinesField,
  problemMarksTheme,
  linter(null, { tooltipFilter: () => [] }),
  problemPopoverField,
  problemPopoverPointer,
  problemPopoverTheme,
];
