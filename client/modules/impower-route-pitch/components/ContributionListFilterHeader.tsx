import styled from "@emotion/styled";
import React, { useMemo } from "react";
import { RatingFilter } from "../types/ratingFilter";
import FilterHeader from "./FilterHeader";
import RatingFilterButton from "./RatingFilterButton";

const StyledSpacer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

interface ContributionListFilterHeaderProps {
  sort?: RatingFilter;
  onSort?: (e: React.MouseEvent, sort: RatingFilter) => void;
}

const ContributionListFilterHeader = React.memo(
  (props: ContributionListFilterHeaderProps): JSX.Element => {
    const { sort, onSort } = props;
    const filterHeaderStyle: React.CSSProperties = useMemo(
      () => ({ margin: 0 }),
      []
    );

    return (
      <FilterHeader style={filterHeaderStyle} id="contribution-filter-header">
        <StyledSpacer />
        <RatingFilterButton
          target="contribution"
          activeFilterValue={sort}
          onOption={onSort}
        />
      </FilterHeader>
    );
  }
);

export default ContributionListFilterHeader;
