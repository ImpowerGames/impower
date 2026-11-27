import { ErrorType } from "../../../runtime/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import { directiveValueKind } from "../../utils/readDirective";
import type { LowerContext } from "../context";
import type { SourceSpan, StructSource } from "../lowerers/lowerStructBodyTyped";
import { makeSource } from "./validateDefineStructure";

export const STREAM_FIELDS: ReadonlySet<string> = new Set(["advance", "pause"]);

export const STREAM_ADVANCES: ReadonlySet<string> = new Set(["click", "auto"]);

export function validateStreamBody(
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
    if (!STREAM_FIELDS.has(key)) {
      report(
        `\`${key}\` is not a stream setting. A stream sets \`advance\` and \`pause\`.\n> e.g. \`stream phone { advance = auto; pause = 0.6s }\``,
        source?.keys.get(key),
      );
    } else if (key === "advance") {
      if (typeof value !== "string" || !STREAM_ADVANCES.has(value)) {
        report(
          "`advance` should be `click`, where each line waits for a click, or `auto`, where each line follows the one before it\n> e.g. `advance = auto`",
          source?.values.get(key),
        );
      }
    } else if (
      !(typeof value === "number" && Number.isFinite(value) && value >= 0) &&
      !(
        typeof value === "string" &&
        directiveValueKind(value) === "time" &&
        Number.parseFloat(value) >= 0
      )
    ) {
      report(
        "`pause` should be a time, how long after a line finishes typing the next one starts\n> e.g. `pause = 0.6s`, `pause = 600ms`",
        source?.values.get(key),
      );
    }
  }
  return diagnostics;
}
