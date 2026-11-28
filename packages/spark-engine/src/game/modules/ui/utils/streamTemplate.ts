import type { ElementNode, StreamNode } from "@impower/sparkdown/src/compiler/types/SparkleNode";
import {
  elementNames,
  elementVariant,
  limitsVariant,
} from "@impower/sparkdown/src/compiler/utils/variantLayouts";
import type { Instructions } from "../../../core/types/Instructions";
import { SPEAKER_TARGETS } from "../../../core/classes/presenters/InteractiveFictionPresenter";

export const streamKey = (layout: string, index: number) => `${layout}/${index}`;

export function lineLabelled(
  template: ElementNode,
  labels: { variant?: string; speaker?: string },
): ElementNode {
  const { variant: _variant, speaker: _speaker, ...props } = template.props;
  for (const key of ["variant", "speaker"] as const) {
    const value = labels[key];
    if (value) {
      props[key] = { kind: "literal", value };
    }
  }
  return { ...template, props };
}

export function streamTemplate(node: StreamNode, instructions: Instructions): number {
  const lines = Object.keys(instructions.text ?? {}).filter(
    (target) => !target.startsWith("choice ") && !SPEAKER_TARGETS.includes(target),
  );
  const named = node.templates.flatMap((child, index) =>
    elementNames(child).some((name) => lines.includes(name)) ? [{ child, index }] : [],
  );
  const variant = instructions.variant;
  const limited = variant
    ? named.find(({ child }) => elementVariant(child) === variant)
    : undefined;
  return (limited ?? named.find(({ child }) => !limitsVariant(child)))?.index ?? -1;
}
