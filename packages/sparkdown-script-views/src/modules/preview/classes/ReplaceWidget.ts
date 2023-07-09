import { Rect, WidgetType } from "@codemirror/view";
import { ReplaceSpec } from "../types/ReplaceSpec";

const getSpecContentValues = (spec: ReplaceSpec) =>
  Object.entries(spec)
    .filter(
      ([k]) =>
        k !== "from" &&
        k !== "to" &&
        k !== "language" &&
        k !== "highlighter" &&
        k !== "widget"
    )
    .map(([, v]) => v);

export default abstract class ReplaceWidget<
  T extends ReplaceSpec = ReplaceSpec
> extends WidgetType {
  readonly spec: T;

  constructor(spec: T) {
    super();
    this.spec = spec;
  }

  override eq(other: ReplaceWidget<T>) {
    return (
      JSON.stringify(getSpecContentValues(this.spec)) ===
      JSON.stringify(getSpecContentValues(other.spec))
    );
  }

  override coordsAt(dom: HTMLElement, pos: number, _side: number): Rect | null {
    const lines = this.spec.lines;
    const docPos = this.spec.from + pos;
    const lineIndex = Math.max(0, lines.findIndex((l) => docPos < l.from) - 1);
    const maxLineIndex = lines.length - 1;
    const percentage =
      docPos <= this.spec.from
        ? 0
        : docPos >= this.spec.to
        ? 1
        : lineIndex / maxLineIndex;
    const rect = dom.getBoundingClientRect();
    return rect
      ? {
          ...rect,
          top: Math.max(rect.top, rect.bottom * percentage),
        }
      : null;
  }
}
