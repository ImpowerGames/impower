import {
  autocompletion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";
import { EditorState, TransactionSpec } from "@codemirror/state";
import { Direction, EditorView, Rect } from "@codemirror/view";
import { FeatureSupport } from "../../types/FeatureSupport";

const completionTheme = EditorView.baseTheme({
  "& .cm-tooltip": {
    fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`,
    fontSize: "0.96em",
    border: `solid 1px #FFFFFF21`,
    borderRadius: "4px",
  },
  "& .cm-tooltip p": {
    margin: "4px 8px",
  },
  "& .cm-tooltip pre": {
    margin: "4px 8px",
  },
  "& .cm-tooltip.cm-tooltip-autocomplete": {
    minWidth: "min(90vw, 400px)",
  },
  "& .cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    padding: "3px 10px 3px 2px",
  },
  "& .cm-tooltip.cm-completionInfo pre": {
    margin: "0",
  },
  "& .cm-tooltip.cm-completionInfo.cm-completionInfo-right": {
    marginTop: "-1px",
  },
  "& .cm-tooltip.cm-completionInfo.cm-completionInfo-left": {
    marginTop: "-1px",
  },
  "& .cm-tooltip.cm-completionInfo.cm-completionInfo-right-above": {
    marginBottom: "-2px",
    left: "-1px",
    width: "calc(100% + 2px)",
  },
  "& .cm-tooltip.cm-completionInfo.cm-completionInfo-left-above": {
    marginBottom: "-2px",
    top: "-1px",
    left: "-1px",
    width: "calc(100% + 2px)",
  },
  "& .cm-tooltip.cm-completionInfo.cm-completionInfo-right-below": {
    marginTop: "-2px",
    left: "-1px",
    width: "calc(100% + 2px)",
  },
  "& .cm-tooltip.cm-completionInfo.cm-completionInfo-left-below": {
    marginTop: "-2px",
    top: "-1px",
    left: "-1px",
    width: "calc(100% + 2px)",
  },
});

export const enum Info {
  Margin = 30,
  Width = 400,
}

const positionInfo = (
  view: EditorView,
  list: Rect,
  _option: Rect,
  info: Rect,
  space: Rect
) => {
  let offset = 0;
  let maxWidth = 0;
  const rtl = view.textDirection == Direction.RTL;
  let left = rtl;
  let narrow = false;
  let side = "top";
  let vertical = "";
  let spaceLeft = list.left - space.left;
  const spaceRight = space.right - list.right;
  const infoWidth = info.right - info.left;
  const infoHeight = info.bottom - info.top;
  if (left && spaceLeft < Math.min(infoWidth, spaceRight)) left = false;
  else if (!left && spaceRight < Math.min(infoWidth, spaceLeft)) left = true;
  if (infoWidth <= (left ? spaceLeft : spaceRight)) {
    // Wide screen
    offset =
      Math.max(space.top, Math.min(list.top, space.bottom - infoHeight)) -
      list.top;
    maxWidth = Math.min(Info.Width, left ? spaceLeft : spaceRight);
  } else {
    // Narrow screen
    narrow = true;
    maxWidth = Math.min(
      Info.Width,
      (rtl ? list.right : space.right - list.left) - Info.Margin
    );
    let spaceBelow = space.bottom - list.bottom;
    if (spaceBelow >= infoHeight || spaceBelow > list.top) {
      // Show info below the completion
      vertical = "below";
      offset = list.bottom - list.top;
    } else {
      // Show info above the completion
      vertical = "above";
      side = "bottom";
      offset = list.bottom - list.top;
    }
  }
  return {
    style: `${side}: ${offset}px; max-width: ${maxWidth}px`,
    class:
      "cm-completionInfo-" +
      (narrow
        ? rtl
          ? `left-${vertical}`
          : `right-${vertical}`
        : left
        ? "left"
        : "right"),
  };
};

const debounceSource = (source: CompletionSource, wait: number) => {
  return (context: CompletionContext) => {
    return new Promise<CompletionResult | null>((resolve) => {
      const timeoutId = window.setTimeout(async () => {
        try {
          const result = await source(context);
          console.log("aborted", context.aborted);
          resolve(result);
        } catch (error) {
          resolve(null);
        }
      }, wait);
      const cancel = () => {
        clearTimeout(timeoutId);
        resolve(null);
      };
      // onDocChange, abort and throw away previous completions
      // (This way, the language server always uses the latest tree to calculate completions)
      context.addEventListener("abort", cancel, { onDocChange: true });
    });
  };
};

export default class CompletionSupport implements FeatureSupport {
  sources: CompletionSource[] = [];

  addSource(source: CompletionSource): void {
    this.sources.push(debounceSource(source, 100));
  }

  removeSource(source: CompletionSource): void {
    const index = this.sources.indexOf(source);
    if (index >= 0) {
      this.sources.splice(index, 1);
    }
  }

  load() {
    return [
      completionTheme,
      autocompletion({
        override: this.sources,
        aboveCursor: true,
        positionInfo,
        filterStrict: true,
        // Instead of relying on activateOnTypingDelay,
        // we use `debounceSource` to debounce completions ourselves.
        // This way we can ensure that the most recent edit takes precedence when calculating document completions.
        activateOnTypingDelay: 0,
        updateSyncTime: 0,
      }),
    ];
  }

  transaction(_state: EditorState): TransactionSpec {
    return {};
  }
}
