import { DataStateQueryPath } from "../types/dataStatePath";
import { useObservedCollectionDataLoad } from "./useObservedCollectionDataLoad";

export const useObservedCollectionData = <T>(
  options: {
    orderByChild?: string;
    limitToFirst?: number;
    limitToLast?: number;
  },
  ...path: DataStateQueryPath
): { [id: string]: T } => {
  return useObservedCollectionDataLoad(undefined, options, ...path);
};
