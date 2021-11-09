import React from "react";
import ArrowDownLongRegularIcon from "../../../resources/icons/regular/arrow-down-long.svg";
import ArrowUpLongRegularIcon from "../../../resources/icons/regular/arrow-up-long.svg";

export const getStaticSortOptionIcons = (): {
  [sort in "new" | "old"]: React.ComponentType;
} => ({
  new: ArrowUpLongRegularIcon,
  old: ArrowDownLongRegularIcon,
});

export default getStaticSortOptionIcons;
