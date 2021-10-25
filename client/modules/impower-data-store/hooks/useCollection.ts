import { CollectionPath } from "../../impower-api";
import { DataDocument } from "../../impower-core";
import { useCollectionLoad } from "./useCollectionLoad";

export const useCollection = <T extends DataDocument>(
  ...path: CollectionPath
): { [id: string]: T } => {
  return useCollectionLoad(undefined, ...path);
};
