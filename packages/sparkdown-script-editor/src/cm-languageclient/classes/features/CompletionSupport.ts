import { CompletionSource, autocompletion } from "@codemirror/autocomplete";
import { EditorState, TransactionSpec } from "@codemirror/state";
import { Direction, EditorView, Rect } from "@codemirror/view";
import FeatureSupport from "../FeatureSupport";

const completionTheme = EditorView.baseTheme({
  "& .cm-tooltip": {
    fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`,
    fontSize: "0.96em",
    border: `solid 1px #FFFFFF21`,
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
  "& .cm-tooltip.cm-completionInfo p": {
    marginTop: "0",
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

export default class CompletionSupport extends FeatureSupport {
  constructor(completionSource: readonly CompletionSource[]) {
    super([
      completionTheme,
      autocompletion({
        override: completionSource,
        positionInfo,
      }),
    ]);
  }
  override transaction(_state: EditorState): TransactionSpec {
    return {};
  }
}
