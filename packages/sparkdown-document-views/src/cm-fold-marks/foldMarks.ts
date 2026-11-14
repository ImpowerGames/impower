import { iconMasks } from "@impower/impower-ui/icon-masks";
import { createGutterButton } from "../cm-gutter-button/gutterButton";

export const foldMarkerDOM = (open: boolean): HTMLElement =>
  createGutterButton({
    icon: iconMasks["chevron-down"],
    color: "var(--muted)",
    label: open ? "Fold" : "Unfold",
    className: open ? "cm-fold-marker" : "cm-fold-marker cm-fold-marker-closed",
  });
