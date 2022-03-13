import { BlockContext } from "../classes/BlockContext";
import { Line } from "../classes/Line";
import {
  isBulletList,
  isFencedCode,
  isHTMLBlock,
  isOrderedList,
  isPageBreak,
  isScene,
  isSectionHeading,
  isSynopses,
  isTitle,
  isTransition,
} from "../utils/markdown";

export const DefaultEndLeaf: readonly ((
  cx: BlockContext,
  line: Line
) => boolean)[] = [
  (_, line): boolean => Boolean(isSectionHeading(line)),
  (_, line): boolean => Boolean(isScene(line)),
  (_, line): boolean => Boolean(isSynopses(line)),
  (_, line): boolean => Boolean(isTransition(line)),
  (_, line): boolean => Boolean(isPageBreak(line)),
  (p, line): boolean => isTitle(line, p, true) >= 0,
  (p, line): boolean => isBulletList(line, p, true) >= 0,
  (p, line): boolean => isOrderedList(line, p, true) >= 0,
  (p, line): boolean => isHTMLBlock(line, p, true) >= 0,
  (_, line): boolean => isFencedCode(line) >= 0,
];
