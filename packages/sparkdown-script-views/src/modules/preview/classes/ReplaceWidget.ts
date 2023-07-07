import { WidgetType } from "@codemirror/view";
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

  override eq(other: ReplaceWidget<T>) {
    return (
      JSON.stringify(getSpecContentValues(this.spec)) ===
      JSON.stringify(getSpecContentValues(other.spec))
    );
  }

  constructor(spec: T) {
    super();
    this.spec = spec;
  }
}
