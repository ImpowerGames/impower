import { CollectionPath } from "../../impower-api";
import { DataDocument } from "../../impower-core";
import { useDefaultCollectionLoad } from "./useDefaultCollectionLoad";

export const useDefaultCollection = <T extends DataDocument>(
  defaultDocs: { [id: string]: T } = {},
  ...path: CollectionPath
): { [id: string]: T } => {
  return useDefaultCollectionLoad(undefined, defaultDocs, ...path);
};
