import { getIndentUnit } from "@codemirror/language";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { IndentEntry, IndentationMap } from "./classes/map";
import {
  IndentationMarkerConfiguration as IndentationGuideConfiguration,
  indentationMarkerConfig as indentationGuideConfig,
} from "./facets/config";
import { getCurrentLine } from "./utils/getCurrentLine";
import { getVisibleLines } from "./utils/getVisibleLines";

// CSS classes:
// - .cm-indent-guides

// CSS variables:
// - --indent-marker-bg-part
// - --indent-marker-active-bg-part

/** Thickness of indent guides. Probably should be integer pixel values. */
const MARKER_THICKNESS = "1px";

const indentationGuideTheme = EditorView.baseTheme({
  "&light": {
    "--indent-marker-bg-color": "#0000001A",
    "--indent-marker-active-bg-color": "#0000004D",
  },

  "&dark": {
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
    zIndex: "-1",
    transform: "translateX(-3px)",
  },
});

function createGradient(
  markerCssProperty: string,
  indentWidth: number,
  startOffset: number,
  columns: number
) {
  const gradient = `repeating-linear-gradient(to right, var(${markerCssProperty}) 0 ${MARKER_THICKNESS}, transparent ${MARKER_THICKNESS} ${indentWidth}ch)`;
  // Subtract one pixel from the background width to get rid of artifacts of pixel rounding
  return `${gradient} ${startOffset * indentWidth}.5ch/calc(${
    indentWidth * columns
  }ch - 1px) no-repeat`;
}

function makeBackgroundCSS(
  entry: IndentEntry,
  indentWidth: number,
  hideFirstIndent: boolean
) {
  const { level, active } = entry;
  if (hideFirstIndent && level === 0) {
    return [];
  }
  const startAt = hideFirstIndent ? 1 : 0;
  const backgrounds = [];

  if (active !== undefined) {
    const guidesBeforeActive = active - startAt - 1;
    if (guidesBeforeActive > 0) {
      backgrounds.push(
        createGradient(
          "--indent-marker-bg-color",
          indentWidth,
          startAt,
          guidesBeforeActive
        )
      );
    }
    backgrounds.push(
      createGradient(
        "--indent-marker-active-bg-color",
        indentWidth,
        active - 1,
        1
      )
    );
    if (active !== level) {
      backgrounds.push(
        createGradient(
          "--indent-marker-bg-color",
          indentWidth,
          active,
          level - active
        )
      );
    }
  } else {
    backgrounds.push(
      createGradient(
        "--indent-marker-bg-color",
        indentWidth,
        startAt,
        level - startAt
      )
    );
  }

  return backgrounds.join(",");
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

    for (const line of lines) {
      const entry = map.get(line.number);
      if (!entry?.level || this.unitWidth * entry.level > line.text.length) {
        continue;
      }

      const backgrounds = makeBackgroundCSS(
        entry,
        this.unitWidth,
        hideFirstIndent
      );

      builder.add(
        line.from,
        line.from,
        Decoration.line({
          class: "cm-indent-guides",
          attributes: {
            style: `--indent-guides: ${backgrounds}`,
          },
        })
      );
    }

    this.decorations = builder.finish();
  }
}

export function indentationGuides(config: IndentationGuideConfiguration = {}) {
  return [
    indentationGuideConfig.of(config),
    indentationGuideTheme,
    ViewPlugin.fromClass(IndentGuideClass, {
      decorations: (v) => v.decorations,
    }),
  ];
}
