import styled from "@emotion/styled";
import CircularProgress from "@material-ui/core/CircularProgress";
import React, { useMemo } from "react";
import { ContributionDocument } from "../../impower-data-store";
import ContributionList from "./ContributionList";

const SORT_OPTIONS: ["new", "rating", "rank"] = ["new", "rating", "rank"];

const StyledLoadingArea = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledCircularProgress = styled(CircularProgress)`
  min-width: ${(props): string => props.theme.spacing(4)};
  min-height: ${(props): string => props.theme.spacing(4)};
`;

interface ProfileContributionListProps {
  creator?: string;
  contributionDocs?: { [key: string]: ContributionDocument };
}

const ProfileContributionList = React.memo(
  (props: ProfileContributionListProps): JSX.Element => {
    const { creator, contributionDocs } = props;

    const loadingPlaceholder = useMemo(
      () => (
        <StyledLoadingArea>
          <StyledCircularProgress color="secondary" />
        </StyledLoadingArea>
      ),
      []
    );

    const listStyle = useMemo(() => ({ backgroundColor: "white" }), []);
    const queryHeaderStyle = useMemo(() => ({ backgroundColor: "white" }), []);

    return (
      <>
        <ContributionList
          creator={creator}
          contributionDocs={contributionDocs}
          sortOptions={SORT_OPTIONS}
          emptyLabel={`No Contributions`}
          noMoreLabel={`That's all for now!`}
          loadingPlaceholder={loadingPlaceholder}
          style={listStyle}
          queryHeaderStyle={queryHeaderStyle}
          hideAddToolbar
        />
      </>
    );
  }
);

export default ProfileContributionList;
