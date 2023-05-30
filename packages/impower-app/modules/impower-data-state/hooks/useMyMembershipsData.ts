import { useCallback, useMemo } from "react";
import { MemberData } from "../types/interfaces/memberData";
import reverseDataSortDirection from "../utils/reverseDataSortDirection";
import { useCollectionDataLoad } from "./useCollectionDataLoad";

export const useMyMembershipsData = (
  uid: string,
  onChange?: (data: { [id: string]: MemberData }) => void
): {
  [id: string]: MemberData;
} => {
  const handleChange = useCallback(
    (data: { [id: string]: MemberData }) => {
      if (onChange) {
        onChange(reverseDataSortDirection(data));
      }
    },
    [onChange]
  );
  const data = useCollectionDataLoad(
    handleChange,
    { orderByChild: "accessedAt" },
    "users",
    uid,
    "agg",
    "my_memberships",
    "data"
  );
  return useMemo(() => reverseDataSortDirection(data), [data]);
};
