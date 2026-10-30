import { type SyntaxNode } from "@lezer/common";
import type { InkDiagnostic } from "../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../lower/context";
import {
  parseStructBodyTyped,
  type StructSource,
} from "../lower/lowerers/lowerStructBodyTyped";
import { MORPH_LITERAL_KEYS, MORPH_LITERAL_LIST_KEYS } from "./morphSchema";

export interface MorphIssue {
  from: number;
  to: number;
  message: string;
  severity: "error" | "warning";
}

export interface MorphBody {
  struct: Record<string, unknown>;
  sources: WeakMap<object, StructSource>;
  issues: MorphIssue[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

export function readMorphBody(
  contentNode: SyntaxNode | null,
  ctx: LowerContext,
  sink?: InkDiagnostic[],
): MorphBody {
  const sources = new WeakMap<object, StructSource>();
  const issues: MorphIssue[] = [];
  const struct = parseStructBodyTyped(contentNode, ctx, sink, {
    literalKeys: MORPH_LITERAL_KEYS,
    literalListKeys: MORPH_LITERAL_LIST_KEYS,
    sources,
  });
  const keyframes = struct["keyframes"];
  if (Array.isArray(keyframes)) {
    for (const keyframe of keyframes) {
      if (!isRecord(keyframe)) continue;
      for (const [group, container] of Object.entries(keyframe)) {
        if (!isRecord(container)) continue;
        const state = container["state"];
        if (typeof state !== "string") continue;
        const dot = state.indexOf(".");
        if (dot < 0) continue;
        const prefix = state.slice(0, dot);
        if (prefix === group) {
          container["state"] = state.slice(dot + 1);
          continue;
        }
        const node = sources.get(container)?.values.get("state");
        if (node) {
          issues.push({
            from: node.from,
            to: node.to,
            severity: "error",
            message: `\`${state}\` names a state of the \`${prefix}\` group, but this container poses \`${group}\`. Write \`state = ${state.slice(dot + 1)}\` or \`state = ${group}.${state.slice(dot + 1)}\`, or move it into a \`${prefix}:\` container.`,
          });
        }
      }
    }
  }
  return { struct, sources, issues };
}
