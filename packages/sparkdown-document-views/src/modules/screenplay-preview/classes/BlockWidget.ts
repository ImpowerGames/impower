import { WidgetType } from "@codemirror/view";
import { DecorationSpec } from "../types/DecorationSpec";

export default abstract class BlockWidget<
  T extends DecorationSpec = DecorationSpec
> extends WidgetType {
  readonly spec: T;

  constructor(spec: T) {
    super();
    this.spec = spec;
  }

  override eq(widget: WidgetType): boolean {
    const other = widget as BlockWidget;
    return this.toJSON() === other.toJSON?.();
  }

  toJSON() {
    const serializableSpec = {
      ...this.spec,
    };
    delete (serializableSpec as any).from;
    delete serializableSpec.to;
    delete serializableSpec.language;
    delete serializableSpec.highlighter;
    return JSON.stringify(serializableSpec);
  }
}
