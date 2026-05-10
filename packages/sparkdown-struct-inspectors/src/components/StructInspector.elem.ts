import { PreactComponent } from "../preact/PreactComponent";
import StructInspector, { type StructInspectorProps } from "./StructInspector";

export class StructInspectorElement extends PreactComponent<StructInspectorProps>(
  StructInspector,
  "struct-inspector",
  ["value", "onInput", "onChange"],
  { shadow: false },
) {}

declare global {
  interface HTMLElementTagNameMap {
    "struct-inspector": StructInspectorElement;
  }
}
