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

  override eq(widget: WidgetType): boolean {
    const other = widget as ReplaceWidget;
    if ("toJSON" in other) {
      return this.toJSON() === other.toJSON();
    }
    return false;
  }

  toJSON() {
    const serializableSpec = {
      ...this.spec,
    };
    serializableSpec.language = this.spec.language?.name as any;
    serializableSpec.highlighter = Boolean(this.spec.highlighter) as any;
    serializableSpec.widget = this.spec.widget?.name as any;
    return JSON.stringify(serializableSpec);
  }
}
