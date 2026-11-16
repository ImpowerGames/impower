import type { Tree } from "@lezer/common";
import { MORPH_PICK_NONE } from "../../morph/types";
import { readSourceDirectives } from "./readDirective";

export const directiveOwnLookPick = (
  tree: Tree,
  read: (from: number, to: number) => string,
  at: number,
): string | undefined =>
  readSourceDirectives(tree, read).some(
    (directive) => directive.kind === "image" && directive.contentFrom <= at && at < directive.contentTo,
  )
    ? MORPH_PICK_NONE
    : undefined;
