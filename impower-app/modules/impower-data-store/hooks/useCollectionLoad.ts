import { CollectionPath } from "../../impower-api";
import { DataDocument } from "../../impower-core";
import { useDefaultCollectionLoad } from "./useDefaultCollectionLoad";

export const useCollectionLoad = <T extends DataDocument>(
  onLoad: (docs: { [id: string]: T }) => void,
  ...path: CollectionPath
): { [id: string]: T } => {
  return useDefaultCollectionLoad(onLoad, {}, ...path);
};
