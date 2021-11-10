import styled from "@emotion/styled";
import CircularProgress from "@material-ui/core/CircularProgress";
import React, { useMemo } from "react";
import { AggData } from "../../impower-data-state";
import {
  ContributionDocument,
  ProjectDocument,
} from "../../impower-data-store";
import PopulatedKudoList from "./PopulatedKudoList";

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

interface KudoListContentProps {
  targetId: string;
  targetDoc: ProjectDocument | ContributionDocument;
  kudos?: { [id: string]: AggData };
  chunkMap?: { [id: string]: number };
  lastLoadedChunk?: number;
}

const KudoListContent = React.memo(
  (props: KudoListContentProps): JSX.Element => {
    const { targetId, targetDoc, kudos, chunkMap, lastLoadedChunk } = props;

    const kudoEntries = useMemo(
      () => (kudos ? Object.entries(kudos) : undefined),
      [kudos]
    );

    const loadingPlaceholder = useMemo(
      () => (
        <StyledLoadingArea>
          <StyledCircularProgress color="secondary" />
        </StyledLoadingArea>
      ),
      []
    );

    if (!kudoEntries) {
      return loadingPlaceholder;
    }

    if (kudoEntries?.length === 0) {
      return null;
    }

    return (
      <>
        <PopulatedKudoList
          targetId={targetId}
          targetDoc={targetDoc}
          kudoEntries={kudoEntries}
          chunkMap={chunkMap}
          lastLoadedChunk={lastLoadedChunk}
        />
      </>
    );
  }
);

export default KudoListContent;
