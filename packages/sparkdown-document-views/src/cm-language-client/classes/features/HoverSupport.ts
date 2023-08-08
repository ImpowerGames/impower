import { EditorState, TransactionSpec } from "@codemirror/state";
import { EditorView, hoverTooltip } from "@codemirror/view";
import { FeatureSupport } from "../../types/FeatureSupport";

const hoverTheme = EditorView.baseTheme({
  "& .cm-tooltip": {
    fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`,
    fontSize: "0.96em",
    border: `solid 1px #FFFFFF21`,
  },
});

export interface HoverContext {
  view: EditorView;
  pos: number;
  side: -1 | 1;
}

export interface HoverResult {
  from: number;
  to: number;
  dom: HTMLElement;
  destroy?: () => void;
}

export type HoverSource = (
  context: HoverContext
) => HoverResult | null | Promise<HoverResult | null>;

export default class HoverSupport implements FeatureSupport {
  hoverSources: HoverSource[] = [];

  addHoverSource(source: HoverSource): void {
    this.hoverSources.push(source);
  }

  removeHoverSource(source: HoverSource): void {
    this.hoverSources.forEach((s, i) => {
      if (s === source) {
        this.hoverSources[i] = () => null;
      }
    });
  }

  protected getResult(context: HoverContext) {
    for (let i = 0; i < this.hoverSources.length; i += 1) {
      const hoverSource = this.hoverSources[i]!;
      const dom = hoverSource(context);
      if (dom) {
        return dom;
      }
    }
    return null;
  }

  load() {
    return [
      hoverTheme,
      hoverTooltip(async (view, pos, side) => {
        const result = await this.getResult({ view, pos, side });
        if (result) {
          return {
            pos: result.from,
            end: result.to,
            above: true,
            create() {
              return { dom: result.dom, destroy: result.destroy };
            },
          };
        }
        return null;
      }),
    ];
  }

  transaction(_state: EditorState): TransactionSpec {
    return {};
  }
}
