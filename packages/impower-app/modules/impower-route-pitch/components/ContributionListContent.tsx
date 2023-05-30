import React, { useMemo } from "react";
import { AggData } from "../../impower-data-state";
import {
  ContributionDocument,
  ProjectDocument,
} from "../../impower-data-store";
import PopulatedContributionList from "./PopulatedContributionList";

interface ContributionListContentProps {
  scrollParent?: HTMLElement;
  pitchDocs?: { [pitchId: string]: ProjectDocument };
  contributionDocs?: { [key: string]: ContributionDocument };
  chunkMap?: { [id: string]: number };
  lastLoadedChunk?: number;
  style?: React.CSSProperties;
  onChangeScore?: (
    e: React.MouseEvent,
    score: number,
    pitchId: string,
    contributionId?: string
  ) => void;
  onKudo?: (
    e: React.MouseEvent | React.ChangeEvent,
    kudoed: boolean,
    pitchId: string,
    contributionId: string,
    data: AggData
  ) => void;
  onEdit?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string
  ) => void;
  onDelete?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string
  ) => void;
}

const ContributionListContent = React.memo(
  (props: ContributionListContentProps): JSX.Element => {
    const {
      scrollParent,
      pitchDocs,
      contributionDocs,
      chunkMap,
      lastLoadedChunk,
      style,
      onChangeScore,
      onKudo,
      onEdit,
      onDelete,
    } = props;

    const contributionEntries = useMemo(
      () => (contributionDocs ? Object.entries(contributionDocs) : undefined),
      [contributionDocs]
    );

    if (!contributionEntries) {
      return null;
    }

    if (contributionEntries?.length === 0) {
      return null;
    }

    return (
      <>
        <PopulatedContributionList
          scrollParent={scrollParent}
          pitchDocs={pitchDocs}
          contributionDocs={contributionDocs}
          chunkMap={chunkMap}
          lastLoadedChunk={lastLoadedChunk}
          style={style}
          onChangeScore={onChangeScore}
          onKudo={onKudo}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </>
    );
  }
);

export default ContributionListContent;
