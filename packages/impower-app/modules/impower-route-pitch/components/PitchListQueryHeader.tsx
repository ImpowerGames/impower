import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import dynamic from "next/dynamic";
import React from "react";
import { ProjectType, QuerySort } from "../../impower-data-store";
import { DateRangeFilter } from "../types/dateRangeFilter";
import { ProjectTypeFilter } from "../types/projectTypeFilter";
import QueryHeader from "./QueryHeader";
import QuerySortButton from "./QuerySortButton";
import QueryTypeFilterButton from "./QueryTypeFilterButton";

const RangeFilterButton = dynamic(() => import("./QueryRangeFilterButton"), {
  ssr: false,
});

const StyledSpacer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledButton = styled(Button)`
  pointer-events: auto;
  padding: ${(props): string => props.theme.spacing(0, 1)};
`;

const StyledCenterArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  margin-top: ${(props): string => props.theme.spacing(1)};
`;

interface PitchListQueryHeaderProps {
  typeFilter?: ProjectTypeFilter;
  rangeFilter?: DateRangeFilter;
  sort?: QuerySort;
  sortOptions?: QuerySort[];
  style?: React.CSSProperties;
  onTypeFilter?: (e: React.MouseEvent, filter: ProjectType) => void;
  onRangeFilter?: (e: React.MouseEvent, filter: DateRangeFilter) => void;
  onSort?: (e: React.MouseEvent, sort: QuerySort) => void;
  onFollowMore?: (e: React.MouseEvent) => void;
}

const PitchListQueryHeader = React.memo(
  (props: PitchListQueryHeaderProps): JSX.Element => {
    const {
      typeFilter,
      rangeFilter,
      sort,
      sortOptions,
      style,
      onTypeFilter,
      onRangeFilter,
      onSort,
      onFollowMore,
    } = props;

    return (
      <QueryHeader id="pitch-filter-header" style={style}>
        <QueryTypeFilterButton value={typeFilter} onOption={onTypeFilter} />
        <StyledSpacer />
        <StyledCenterArea>
          {onFollowMore && (
            <StyledButton
              color="primary"
              onClick={onFollowMore}
            >{`List All`}</StyledButton>
          )}
        </StyledCenterArea>
        {onRangeFilter && (
          <RangeFilterButton
            target="pitch"
            value={rangeFilter}
            onOption={onRangeFilter}
          />
        )}
        {onSort && (
          <QuerySortButton
            target="pitch"
            value={sort}
            options={sortOptions}
            onOption={onSort}
          />
        )}
      </QueryHeader>
    );
  }
);

export default PitchListQueryHeader;
