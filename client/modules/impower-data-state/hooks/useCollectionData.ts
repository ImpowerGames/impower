import { DataStateQueryPath } from "../types/dataStatePath";
import { useCollectionDataLoad } from "./useCollectionDataLoad";

export const useCollectionData = <T>(
  options?: {
    source?: "cache" | "server";
    orderByChild?: string;
    limitToFirst?: number;
    limitToLast?: number;
  },
  ...path: DataStateQueryPath
): { [id: string]: T } => {
  return useCollectionDataLoad(undefined, options, ...path);
};
