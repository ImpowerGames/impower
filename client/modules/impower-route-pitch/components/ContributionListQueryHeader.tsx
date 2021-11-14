import styled from "@emotion/styled";
import React, { useMemo } from "react";
import { QuerySort } from "../../impower-data-store";
import { ContributionTypeFilter } from "../types/contributionTypeFilter";
import ContributionTypeFilterButton from "./ContributionTypeFilterButton";
import QueryHeader from "./QueryHeader";
import QuerySortButton from "./QuerySortButton";

const StyledSpacer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

interface ContributionListQueryHeaderProps {
  filter?: ContributionTypeFilter;
  sort?: QuerySort;
  sortOptions?: QuerySort[];
  style?: React.CSSProperties;
  onFilter?: (e: React.MouseEvent, type: ContributionTypeFilter) => void;
  onSort?: (e: React.MouseEvent, sort: QuerySort) => void;
}

const ContributionListQueryHeader = React.memo(
  (props: ContributionListQueryHeaderProps): JSX.Element => {
    const { filter, sort, sortOptions, style, onFilter, onSort } = props;
    const filterHeaderStyle: React.CSSProperties = useMemo(
      () => ({ margin: 0 }),
      []
    );

    return (
      <QueryHeader
        style={filterHeaderStyle}
        id="contribution-filter-header"
        style={style}
      >
        <ContributionTypeFilterButton value={filter} onOption={onFilter} />
        <StyledSpacer />
        <QuerySortButton
          target="contribution"
          value={sort}
          options={sortOptions}
          onOption={onSort}
        />
      </QueryHeader>
    );
  }
);

export default ContributionListQueryHeader;
