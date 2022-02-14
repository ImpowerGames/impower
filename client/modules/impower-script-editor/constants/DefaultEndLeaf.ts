import { BlockContext } from "../classes/BlockContext";
import { Line } from "../classes/Line";
import {
  isBulletList,
  isFencedCode,
  isHorizontalRule,
  isHTMLBlock,
  isOrderedList,
  isSceneHeading,
  isSectionHeading,
  isSynopses,
  isTitle,
  isTransition,
} from "../utils/markdown";

export const DefaultEndLeaf: readonly ((
  cx: BlockContext,
  line: Line
) => boolean)[] = [
  (_, line): boolean => isSectionHeading(line) >= 0,
  (_, line): boolean => isSceneHeading(line) >= 0,
  (_, line): boolean => isFencedCode(line) >= 0,
  (_, line): boolean => isSynopses(line) >= 0,
  (_, line): boolean => isTransition(line) >= 0,
  (_, line): boolean => isHorizontalRule(line) >= 0,
  (p, line): boolean => isTitle(line, p, true) >= 0,
  (p, line): boolean => isBulletList(line, p, true) >= 0,
  (p, line): boolean => isOrderedList(line, p, true) >= 0,
  (p, line): boolean => isHTMLBlock(line, p, true) >= 0,
];
