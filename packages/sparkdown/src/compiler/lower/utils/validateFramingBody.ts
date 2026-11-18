import { ErrorType } from "../../../runtime/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import type { SourceSpan, StructSource } from "../lowerers/lowerStructBodyTyped";
import { makeSource } from "./validateDefineStructure";

export const FRAMING_FIELDS: readonly string[] = ["x", "y", "zoom"];

const PERCENTAGE = /^-?(?:\d+(?:[.]\d*)?|[.]\d+)%$/;

export function validateFramingBody(
  body: Record<string, unknown>,
  source: StructSource | undefined,
  fallback: SourceSpan,
  ctx: LowerContext,
): InkDiagnostic[] {
  const diagnostics: InkDiagnostic[] = [];
  const report = (message: string, span: SourceSpan | undefined) => {
    const at = span ?? fallback;
    diagnostics.push({ message, severity: ErrorType.Error, source: makeSource(at.from, at.to, ctx) });
  };
  for (const [key, value] of Object.entries(body)) {
    if (!FRAMING_FIELDS.includes(key)) {
      report(
        `\`${key}\` is not a framing field. A framing sets \`x\`, \`y\` and \`zoom\`.\n> e.g. \`framing sofa { x = 60%; y = 100%; zoom = 1.2 }\``,
        source?.keys.get(key),
      );
    } else if (key === "zoom") {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        report(
          "`zoom` should be a number above zero, where `1` is the picture's size on its layer\n> e.g. `zoom = 1.2`",
          source?.values.get(key),
        );
      }
    } else if (typeof value !== "string" || !PERCENTAGE.test(value)) {
      report(
        `\`${key}\` should be a percentage, where \`0%\` sets the picture's ${key === "x" ? "left" : "top"} edge on the layer's and \`100%\` its ${key === "x" ? "right" : "bottom"} edge\n> e.g. \`${key} = 60%\``,
        source?.values.get(key),
      );
    }
  }
  return diagnostics;
}
