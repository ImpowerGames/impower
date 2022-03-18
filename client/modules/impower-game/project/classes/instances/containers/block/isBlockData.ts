import { isBlockReference } from "../../../../../data/utils/isBlockReference";
import { BlockData } from "./blockData";

export const isBlockData = (obj: unknown): obj is BlockData => {
  if (!obj) {
    return false;
  }
  const blockData = obj as BlockData;
  return isBlockReference(blockData.reference);
};
