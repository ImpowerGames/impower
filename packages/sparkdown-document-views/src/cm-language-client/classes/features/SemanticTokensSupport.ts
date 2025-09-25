import { Diagnostic } from "@codemirror/lint";
import {
  EditorState,
  Extension,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import {
  SemanticTokensLegend,
  ServerCapabilities,
} from "@impower/spark-editor-protocol/src/types";
import { FeatureSupport } from "../../types/FeatureSupport";

export interface SemanticTokens {
  /** (Optional) For delta updates; this extension ignores deltas and expects full sets */
  resultId?: string;
  /** 5-tuples: [deltaLine, deltaStart, length, tokenType, tokenModifiersBitset, ...] */
  data: number[];
}

export interface SemanticTokensContext {
  state: EditorState;
}

export type SemanticTokensSource = (
  context: SemanticTokensContext
) => SemanticTokens | null | Promise<SemanticTokens | null>;

export interface SemanticHighlightingOptions {
  legend: SemanticTokensLegend;
  sources: SemanticTokensSource[];
  /** Debounce fetch after edits (ms). Default: 100 */
  activateOnTypingDelay?: number;
  /**
   * Build a className for a token given its type and modifiers.
   * Default yields: "lsp-semantic-token lsp-type-<type> lsp-modifier-<mod> ..."
   */
  classNameForToken?: (type: string, modifiers: string[]) => string;
}

/** ---- Internal effect to replace decorations ---- */
const setSemanticDecorations = StateEffect.define<DecorationSet>();

/** ---- State field holding current decorations ---- */
const semanticField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setSemanticDecorations)) {
        return e.value;
      }
    }
    // Map through document changes
    if (tr.docChanged) {
      return value.map(tr.changes);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** ---- Utility: simple debounce ---- */
function debounce<F extends (...args: any[]) => void>(fn: F, ms: number): F {
  let t: any;
  return ((...args: any[]) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as F;
}

/** ---- Convert LSP semantic tokens to CM6 decorations ---- */
function tokensToDecorations(
  state: EditorState,
  legend: SemanticTokensLegend,
  sem: SemanticTokens,
  classNameForToken: (type: string, modifiers: string[]) => string
): DecorationSet {
  const builder: RangeBuilder = new RangeBuilder();
  const { data } = sem;
  const { tokenTypes, tokenModifiers } = legend;

  let line = 0;
  let char = 0;

  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i]!;
    const deltaStart = data[i + 1]!;
    const length = data[i + 2]!;
    const tokenTypeIndex = data[i + 3]!;
    const tokenModsBits = data[i + 4]! >>> 0;

    line += deltaLine;
    char = deltaLine === 0 ? char + deltaStart : deltaStart;

    const type = tokenTypes[tokenTypeIndex] ?? "unknown";
    const mods: string[] = [];
    for (let bit = 0; bit < 31 && bit < tokenModifiers.length; bit++) {
      if (tokenModsBits & (1 << bit)) {
        mods.push(tokenModifiers[bit]!);
      }
    }

    const from = posFromLineCol(state, line + 1, char); // LSP is 0-based; CM lines are 1-based
    const to = posFromLineCol(state, line + 1, char + length);
    if (from == null || to == null || to <= from) continue;

    const cls = classNameForToken(type, mods);
    builder.add(from, to, Decoration.mark({ class: cls }));
  }

  return builder.finish();
}

/** ---- Position helpers ---- */
function posFromLineCol(
  state: EditorState,
  lineNumber1Based: number,
  column: number
): number | null {
  if (lineNumber1Based < 1 || lineNumber1Based > state.doc.lines) return null;
  const line = state.doc.line(lineNumber1Based);
  // Columns are interpreted as UTF-16 code units in LSP; CM6 uses JS string indexing (UTF-16) too -> OK.
  const pos = line.from + Math.min(column, line.length);
  return pos;
}

/** Simple range builder that collects decorations efficiently */
class RangeBuilder {
  private ranges: { from: number; to: number; deco: any }[] = [];
  add(from: number, to: number, deco: any) {
    this.ranges.push({ from, to, deco });
  }
  finish(): DecorationSet {
    // Sort by from position to avoid overlapping order surprises
    this.ranges.sort((a, b) => a.from - b.from || a.to - b.to);
    const decos = this.ranges.map((r) => r.deco.range(r.from, r.to));
    return Decoration.set(decos, true);
  }
}

/** ---- Default class name builder ---- */
function defaultClassName(type: string, mods: string[]) {
  const safe = (s: string) => s.replace(/[^\w-]/g, "-");
  const parts = ["lsp-semantic-token", `lsp-type-${safe(type)}`];
  for (const m of mods) parts.push(`lsp-modifier-${safe(m)}`);
  return parts.join(" ");
}

/** ---- Public extension factory ---- */
export function semanticHighlighting(
  opts: SemanticHighlightingOptions
): Extension {
  const {
    legend,
    sources,
    activateOnTypingDelay = 100,
    classNameForToken = defaultClassName,
  } = opts;

  const plugin = ViewPlugin.define((view) => {
    let destroyed = false;

    const run = async () => {
      const tokens = await Promise.any(
        sources.map((source) => source({ state: view.state }))
      );
      if (destroyed || !tokens) {
        return;
      }
      const decos = tokensToDecorations(
        view.state,
        legend,
        tokens,
        classNameForToken
      );
      view.dispatch({ effects: setSemanticDecorations.of(decos) });
    };

    const runDebounced = debounce(run, activateOnTypingDelay);

    // Initial fetch
    run();

    return {
      update(u: ViewUpdate) {
        if (u.docChanged) {
          runDebounced();
        }
      },
      destroy() {
        destroyed = true;
      },
    };
  });

  return [semanticField, plugin];
}

export default class SemanticTokensSupport
  implements FeatureSupport<Diagnostic[]>
{
  sources: SemanticTokensSource[] = [];

  addSource(source: SemanticTokensSource): void {
    this.sources.push(source);
  }

  removeSource(source: SemanticTokensSource): void {
    const index = this.sources.indexOf(source);
    if (index >= 0) {
      this.sources.splice(index, 1);
    }
  }

  load(serverCapabilities: ServerCapabilities) {
    return [
      semanticHighlighting({
        legend: serverCapabilities.semanticTokensProvider?.legend || {
          tokenTypes: [],
          tokenModifiers: [],
        },
        sources: this.sources,
      }),
    ];
  }

  transaction(_state: EditorState) {
    return {};
  }
}
