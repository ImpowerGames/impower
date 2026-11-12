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
  for (const { container, message } of qualifiedPoseStates(struct)) {
    if (!message) continue;
    const node = sources.get(container)?.values.get("state");
    if (node) issues.push({ from: node.from, to: node.to, severity: "error", message });
  }
  return { struct, sources, issues };
}

interface QualifiedPoseState {
  container: Record<string, unknown>;
  group: string;
  keyframe?: number;
  plain: string;
  message?: string;
}

function poseContainers(struct: Record<string, unknown>): { pose: Record<string, unknown>; keyframe?: number }[] {
  const keyframes = struct["keyframes"];
  const poses: { pose: Record<string, unknown>; keyframe?: number }[] = [];
  if (Array.isArray(keyframes)) {
    keyframes.forEach((pose, keyframe) => {
      if (isRecord(pose)) poses.push({ pose, keyframe });
    });
  }
  if (isRecord(struct["rest"])) poses.push({ pose: struct["rest"] });
  return poses;
}

function qualifiedPoseStates(struct: Record<string, unknown>): QualifiedPoseState[] {
  const found: QualifiedPoseState[] = [];
  for (const { pose, keyframe } of poseContainers(struct)) {
    for (const [group, container] of Object.entries(pose)) {
      if (group.startsWith("$") || !isRecord(container)) continue;
      const state = container["state"];
      if (typeof state !== "string") continue;
      const dot = state.indexOf(".");
      if (dot < 0) continue;
      const prefix = state.slice(0, dot);
      const plain = state.slice(dot + 1);
      if (prefix === group && !plain.includes(".")) {
        container["state"] = plain;
        found.push({ container, group, keyframe, plain });
        continue;
      }
      if (prefix === group) {
        found.push({
          container,
          group,
          keyframe,
          plain,
          message: `\`${state}\` is not a state: a state is one name, written alone or after its group once, such as \`state = closed\` or \`state = ${group}.closed\`.`,
        });
        continue;
      }
      found.push({
        container,
        group,
        keyframe,
        plain,
        message: `\`${state}\` names a state of the \`${prefix}\` group, but this container poses \`${group}\`. Write \`state = ${plain}\` or \`state = ${group}.${plain}\`, or move it into a \`${prefix}:\` container.`,
      });
    }
  }
  return found;
}

const clonePoses = (struct: Record<string, unknown>): Record<string, unknown> => {
  const copy = (pose: unknown) =>
    isRecord(pose)
      ? Object.fromEntries(Object.entries(pose).map(([key, value]) => [key, isRecord(value) ? { ...value } : value]))
      : pose;
  const keyframes = struct["keyframes"];
  return {
    ...struct,
    ...(Array.isArray(keyframes) ? { keyframes: keyframes.map(copy) } : {}),
    ...(isRecord(struct["rest"]) ? { rest: copy(struct["rest"]) } : {}),
  };
};

export function plainPoseStates(struct: Record<string, unknown>): Record<string, unknown> {
  const copy = clonePoses(struct);
  qualifiedPoseStates(copy);
  return copy;
}

export function poseStateProblems(struct: Record<string, unknown>): { group: string; keyframe?: number; message: string }[] {
  return qualifiedPoseStates(clonePoses(struct)).flatMap(({ group, keyframe, message }) => (message ? [{ group, keyframe, message }] : []));
}
