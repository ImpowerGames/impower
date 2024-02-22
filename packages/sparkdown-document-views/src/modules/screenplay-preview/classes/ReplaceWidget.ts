import { WidgetType } from "@codemirror/view";
import { ReplaceSpec } from "../types/ReplaceSpec";

export default abstract class ReplaceWidget<
  T extends ReplaceSpec = ReplaceSpec
> extends WidgetType {
  readonly spec: T;

  constructor(spec: T) {
    super();
    this.spec = spec;
  }
}
