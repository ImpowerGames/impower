import dynamic from "next/dynamic";
import React, { useMemo } from "react";
import { ConfigParameters } from "../../impower-config";
import { AggData } from "../../impower-data-state";
import {
  ContributionDocument,
  ProjectDocument,
} from "../../impower-data-store";
import { SvgData } from "../../impower-icon";
import { FadeAnimation } from "../../impower-route";
import PopulatedPitchList from "./PopulatedPitchList";

const EmptyPitchList = dynamic(() => import("./EmptyPitchList"), {
  ssr: false,
});

interface PitchListContentProps {
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  filterLabel?: string;
  searchLabel?: string;
  pitchDocs?: { [id: string]: ProjectDocument };
  chunkMap?: { [id: string]: number };
  lastLoadedChunk?: number;
  emptyImage?: React.ReactNode;
  emptyLabelStyle?: React.CSSProperties;
  searchLabelStyle?: React.CSSProperties;
  onChangeScore?: (e: React.MouseEvent, score: number, id: string) => void;
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
      filterLabel,
      searchLabel,
      pitchDocs,
      chunkMap,
      lastLoadedChunk,
      emptyImage,
      emptyLabelStyle,
      searchLabelStyle,
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

    if (!pitchDocs || Object.keys(pitchDocs).length === 0) {
      return (
        <FadeAnimation initial={0} animate={1} delay={0.1} style={fadeStyle}>
          <EmptyPitchList
            loading={pitchDocs === undefined}
            loadedImage={emptyImage}
            filterLabel={filterLabel}
            searchLabel={searchLabel}
            emptyLabelStyle={emptyLabelStyle}
            searchLabelStyle={searchLabelStyle}
          />
        </FadeAnimation>
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
