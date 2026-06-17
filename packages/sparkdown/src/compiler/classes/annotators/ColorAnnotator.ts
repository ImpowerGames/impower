import { Range } from "@codemirror/state";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export interface ColorInfo {
  possibleColorReference?: boolean;
}

// Marks ranges the document-color provider (`getDocumentColors`) should try to
// render a swatch for. Two live sources:
//   - `Color` nodes (literal `#rgb`/`#rrggbb` etc. emitted inside strings).
//   - `StylingStringIdentifier` / `ParameterStringIdentifier` — bare identifier
//     values (`red`, `color.accent`) that may name a defined `color`; the
//     provider resolves them against `program.context.color`.
// The provider consumes only each mark's RANGE (it reads + resolves the text
// itself), so no declaration/property-path context is tracked here.
//
// NOTE: the previous define-context tracking (defineType/name/property-path
// from `DefineTypeName`/`ViewStructScalarItem`/… nodes) was dead after the Luau
// port renamed those grammar nodes to `LuauDefine*`/`LuauStruct*`; it populated
// a `declaration` payload no consumer ever read. Removed with the dead nodes.
export class ColorAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<ColorInfo>
> {
  override enter(
    annotations: Range<SparkdownAnnotation<ColorInfo>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<ColorInfo>>[] {
    if (nodeRef.name === "Color") {
      annotations.push(
        SparkdownAnnotation.mark({}).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    if (
      nodeRef.name === "StylingStringIdentifier" ||
      nodeRef.name === "ParameterStringIdentifier"
    ) {
      annotations.push(
        SparkdownAnnotation.mark({ possibleColorReference: true }).range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    return annotations;
  }
}
