import styled from "@emotion/styled";
import CircularProgress from "@mui/material/CircularProgress";
import React, { useMemo } from "react";
import {
  ContributionDocument,
  ProjectDocument,
} from "../../impower-data-store";
import { NoteDocument } from "../../impower-data-store/types/documents/noteDocument";
import PopulatedNoteList from "./PopulatedNoteList";

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

interface NoteListContentProps {
  pitchId: string;
  contributionId: string;
  targetDoc: ProjectDocument | ContributionDocument;
  notes?: { [id: string]: NoteDocument };
  chunkMap?: { [id: string]: number };
  lastLoadedChunk?: number;
}

const NoteListContent = React.memo(
  (props: NoteListContentProps): JSX.Element => {
    const {
      pitchId,
      contributionId,
      targetDoc,
      notes,
      chunkMap,
      lastLoadedChunk,
    } = props;

    const noteEntries = useMemo(
      () => (notes ? Object.entries(notes) : undefined),
      [notes]
    );

    const loadingPlaceholder = useMemo(
      () => (
        <StyledLoadingArea>
          <StyledCircularProgress color="secondary" />
        </StyledLoadingArea>
      ),
      []
    );

    if (!noteEntries) {
      return loadingPlaceholder;
    }

    if (noteEntries?.length === 0) {
      return null;
    }

    return (
      <>
        <PopulatedNoteList
          pitchId={pitchId}
          contributionId={contributionId}
          targetDoc={targetDoc}
          noteEntries={noteEntries}
          chunkMap={chunkMap}
          lastLoadedChunk={lastLoadedChunk}
        />
      </>
    );
  }
);

export default NoteListContent;
