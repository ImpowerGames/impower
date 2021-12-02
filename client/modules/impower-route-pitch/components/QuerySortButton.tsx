import React, { useCallback } from "react";
import FireRegularIcon from "../../../resources/icons/regular/fire.svg";
import SeedlingRegularIcon from "../../../resources/icons/regular/seedling.svg";
import TrophyStarRegularIcon from "../../../resources/icons/regular/trophy-star.svg";
import { QuerySort } from "../../impower-data-store";
import getSortOptionLabels from "../utils/getSortOptionLabels";
import QueryButton from "./QueryButton";

interface QuerySortButtonProps {
  target?: "pitch" | "contribution";
  value?: QuerySort;
  options?: QuerySort[];
  onOption?: (e: React.MouseEvent, option: QuerySort) => void;
}

const QuerySortButton = React.memo(
  (props: QuerySortButtonProps): JSX.Element => {
    const { target, value, options, onOption } = props;
    const handleGetOptionIcons = useCallback(
      async (
        value: QuerySort
      ): Promise<{
        [option: string]: React.ComponentType;
      }> => {
        const getSortOptionIcons = (await import("../utils/getSortOptionIcons"))
          .default;
        return getSortOptionIcons(value);
      },
      []
    );
    const handleGetActiveOptionIcon = useCallback(
      (value?: string) =>
        value === "rank" ? (
          <FireRegularIcon />
        ) : value === "new" ? (
          <SeedlingRegularIcon />
        ) : (
          <TrophyStarRegularIcon />
        ),
      []
    );
    return (
      <QueryButton
        target={target}
        menuType="sort"
        label={`Sort By`}
        flexDirection="row-reverse"
        value={value}
        options={options}
        getOptionLabels={getSortOptionLabels}
        getOptionIcons={handleGetOptionIcons}
        getActiveOptionIcon={handleGetActiveOptionIcon}
        onOption={onOption}
      />
    );
  }
);

export default QuerySortButton;
