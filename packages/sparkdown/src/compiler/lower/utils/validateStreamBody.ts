import { ErrorType } from "../../../runtime/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import { directiveValueKind } from "../../utils/readDirective";
import type { LowerContext } from "../context";
import type { SourceSpan, StructSource } from "../lowerers/lowerStructBodyTyped";
import { makeSource } from "./validateDefineStructure";

export const STREAM_FIELDS: ReadonlySet<string> = new Set(["advance", "pause", "clear", "carry"]);

export const STREAM_ADVANCES: ReadonlySet<string> = new Set(["click", "auto"]);

export const STREAM_CLEARS: ReadonlySet<string> = new Set(["never", "run"]);

const isTime = (value: unknown): boolean =>
  (typeof value === "number" && Number.isFinite(value) && value >= 0) ||
  (typeof value === "string" &&
    directiveValueKind(value) === "time" &&
    Number.parseFloat(value) >= 0);

const isCount = (value: unknown): boolean =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

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
        `\`${key}\` is not a stream setting. A stream sets \`advance\`, \`pause\`, \`clear\` and \`carry\`.\n> e.g. \`stream phone { advance = auto; pause = 0.6s }\``,
        source?.keys.get(key),
      );
    } else if (key === "advance") {
      if (typeof value !== "string" || !STREAM_ADVANCES.has(value)) {
        report(
          "`advance` should be `click`, where each line waits for a click, or `auto`, where each line follows the one before it\n> e.g. `advance = auto`",
          source?.values.get(key),
        );
      }
    } else if (key === "clear") {
      if (typeof value !== "string" || !STREAM_CLEARS.has(value)) {
        report(
          "`clear` should be `never`, where entries stay until `[[clear NAME]]`, or `run`, where the entries of earlier runs leave when a new run starts\n> e.g. `clear = run`",
          source?.values.get(key),
        );
      }
    } else if (key === "carry") {
      if (!isCount(value)) {
        report(
          "`carry` should be a count, how many of the newest entries stay through a clear\n> e.g. `carry = 1`",
          source?.values.get(key),
        );
      }
    } else if (!isTime(value)) {
      report(
        "`pause` should be a time, how long after a line finishes typing the next one starts\n> e.g. `pause = 0.6s`, `pause = 600ms`",
        source?.values.get(key),
      );
    }
  }
  return diagnostics;
}
