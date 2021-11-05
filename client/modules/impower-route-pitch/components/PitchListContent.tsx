import styled from "@emotion/styled";
import React, { useMemo } from "react";
import { ConfigParameters } from "../../impower-config";
import { AggData } from "../../impower-data-state";
import {
  ContributionDocument,
  ProjectDocument,
} from "../../impower-data-store";
import { SvgData } from "../../impower-icon";
import { FadeAnimation, Fallback } from "../../impower-route";
import PopulatedPitchList from "./PopulatedPitchList";

const StyledLoadingArea = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  min-height: 200px;
  position: relative;
  z-index: 1;
`;

interface PitchListContentProps {
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  pitchDocs?: { [id: string]: ProjectDocument };
  chunkMap?: { [id: string]: number };
  lastLoadedChunk?: number;
  emptyPlaceholder?: React.ReactNode;
  compact?: boolean;
  onChangeScore?: (
    e: React.MouseEvent,
    score: number,
    pitchId: string,
    contributionId?: string
  ) => void;
  onDelete?: (e: React.MouseEvent, id: string) => void;
  onKudo?: (
    e: React.MouseEvent | React.ChangeEvent,
    kudoed: boolean,
    pitchId: string,
    contributionId: string,
    data: AggData
  ) => void;
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

const PitchListContent = React.memo(
  (props: PitchListContentProps): JSX.Element => {
    const {
      config,
      icons,
      pitchDocs,
      chunkMap,
      lastLoadedChunk,
      emptyPlaceholder,
      compact,
      onChangeScore,
      onDelete,
      onKudo,
      onCreateContribution,
      onUpdateContribution,
      onDeleteContribution,
    } = props;

    const fadeStyle: React.CSSProperties = useMemo(
      () => ({ flex: 1000, display: "flex", flexDirection: "column" }),
      []
    );

    if (!pitchDocs) {
      return (
        <StyledLoadingArea>
          <Fallback disableShrink />
        </StyledLoadingArea>
      );
    }

    if (Object.keys(pitchDocs).length === 0) {
      return (
        <>
          {emptyPlaceholder && (
            <FadeAnimation initial={0} animate={1} style={fadeStyle}>
              {emptyPlaceholder}
            </FadeAnimation>
          )}
        </>
      );
    }

    return (
      <>
        <PopulatedPitchList
          config={config}
          icons={icons}
          pitchDocs={pitchDocs}
          chunkMap={chunkMap}
          lastLoadedChunk={lastLoadedChunk}
          compact={compact}
          onChangeScore={onChangeScore}
          onDelete={onDelete}
          onKudo={onKudo}
          onCreateContribution={onCreateContribution}
          onUpdateContribution={onUpdateContribution}
          onDeleteContribution={onDeleteContribution}
        />
      </>
    );
  }
);

export default PitchListContent;
