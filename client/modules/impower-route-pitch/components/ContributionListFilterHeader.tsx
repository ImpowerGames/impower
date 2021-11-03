import styled from "@emotion/styled";
import React, { useMemo } from "react";
import { ContributionTypeFilter } from "../types/contributionTypeFilter";
import { RatingFilter } from "../types/ratingFilter";
import ContributionTypeFilterButton from "./ContributionTypeFilterButton";
import FilterHeader from "./FilterHeader";
import RatingFilterButton from "./RatingFilterButton";

const StyledSpacer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

interface ContributionListFilterHeaderProps {
  filter?: ContributionTypeFilter;
  sort?: RatingFilter;
  onFilter?: (e: React.MouseEvent, type: ContributionTypeFilter) => void;
  onSort?: (e: React.MouseEvent, sort: RatingFilter) => void;
}

const ContributionListFilterHeader = React.memo(
  (props: ContributionListFilterHeaderProps): JSX.Element => {
    const { filter, sort, onFilter, onSort } = props;
    const filterHeaderStyle: React.CSSProperties = useMemo(
      () => ({ margin: 0 }),
      []
    );

    return (
      <FilterHeader style={filterHeaderStyle} id="contribution-filter-header">
        <ContributionTypeFilterButton
          activeFilterValue={filter}
          onOption={onFilter}
        />
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
