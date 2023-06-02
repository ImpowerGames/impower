import styled from "@emotion/styled";
import CircularProgress from "@mui/material/CircularProgress";
import React, { useMemo } from "react";
import {
  ContributionDocument,
  ProjectDocument,
} from "../../impower-data-store";
import ContributionList from "./ContributionList";

const SORT_OPTIONS: ["rating", "rank", "new"] = ["rating", "rank", "new"];

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

interface PitchContributionListProps {
  scrollParent?: HTMLElement;
  pitchId?: string;
  pitchDoc?: ProjectDocument;
  contributionDocs?: { [key: string]: ContributionDocument };
  toolbarRef?: React.Ref<HTMLDivElement>;
  toolbarAreaStyle?: React.CSSProperties;
  toolbarStyle?: React.CSSProperties;
  onCreateContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string,
    doc: ContributionDocument
  ) => void;
  onUpdateContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string,
    doc: ContributionDocument
  ) => void;
  onDeleteContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string
  ) => void;
}

const PitchContributionList = React.memo(
  (props: PitchContributionListProps): JSX.Element => {
    const {
      scrollParent,
      pitchId,
      pitchDoc,
      contributionDocs,
      toolbarRef,
      toolbarAreaStyle,
      toolbarStyle,
      onCreateContribution,
      onUpdateContribution,
      onDeleteContribution,
    } = props;

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
          scrollParent={scrollParent}
          pitchId={pitchId}
          pitchDoc={pitchDoc}
          contributionDocs={contributionDocs}
          sortOptions={SORT_OPTIONS}
          emptyLabel={`Feeling Inspired?`}
          emptySubtitle={`Contribute Something!`}
          noMoreLabel={`That's all for now!`}
          loadingPlaceholder={loadingPlaceholder}
          style={listStyle}
          queryHeaderStyle={queryHeaderStyle}
          toolbarRef={toolbarRef}
          toolbarAreaStyle={toolbarAreaStyle}
          toolbarStyle={toolbarStyle}
          onCreateContribution={onCreateContribution}
          onUpdateContribution={onUpdateContribution}
          onDeleteContribution={onDeleteContribution}
        />
      </>
    );
  }
);

export default PitchContributionList;
