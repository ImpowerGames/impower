import type { StreamNode } from "@impower/sparkdown/src/compiler/types/SparkleNode";
import type { Instructions } from "../../../core/types/Instructions";
import { SPEAKER_TARGETS } from "../../../core/classes/presenters/InteractiveFictionPresenter";

export const streamKey = (layout: string, index: number) => `${layout}/${index}`;

export function streamTemplate(node: StreamNode, instructions: Instructions): number {
  const lines = Object.keys(instructions.text ?? {}).filter(
    (target) => !target.startsWith("choice ") && !SPEAKER_TARGETS.includes(target),
  );
  return node.templates.findIndex((child) =>
    [child.tag, child.name, ...child.classes].some(
      (name) => name !== undefined && lines.includes(name),
    ),
  );
}
