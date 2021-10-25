import React from "react";
import { ConfigParameters } from "../../impower-config";
import { AggData } from "../../impower-data-state";
import {
  ContributionDocument,
  ProjectDocument,
} from "../../impower-data-store";
import { SvgData } from "../../impower-icon";
import AddPitchToolbar from "./AddPitchToolbar";
import PitchListContent from "./PitchListContent";

interface PitchListProps {
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  filterLabel?: string;
  searchLabel?: string;
  pitchDocs?: { [id: string]: ProjectDocument };
  chunkMap?: { [id: string]: number };
  lastLoadedChunk?: number;
  emptyImage?: React.ReactNode;
  hideAddButton?: boolean;
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

const PitchList = React.memo((props: PitchListProps): JSX.Element => {
  const {
    config,
    icons,
    filterLabel,
    searchLabel,
    pitchDocs,
    chunkMap,
    lastLoadedChunk,
    emptyImage,
    hideAddButton,
    emptyLabelStyle,
    searchLabelStyle,
    onChangeScore,
    onDelete,
    onKudo,
    onCreateContribution,
    onUpdateContribution,
    onDeleteContribution,
  } = props;

  return (
    <>
      <PitchListContent
        config={config}
        icons={icons}
        filterLabel={filterLabel}
        searchLabel={searchLabel}
        emptyImage={emptyImage}
        pitchDocs={pitchDocs}
        chunkMap={chunkMap}
        lastLoadedChunk={lastLoadedChunk}
        emptyLabelStyle={emptyLabelStyle}
        searchLabelStyle={searchLabelStyle}
        onChangeScore={onChangeScore}
        onDelete={onDelete}
        onKudo={onKudo}
        onCreateContribution={onCreateContribution}
        onUpdateContribution={onUpdateContribution}
        onDeleteContribution={onDeleteContribution}
      />
      <AddPitchToolbar config={config} icons={icons} hidden={hideAddButton} />
    </>
  );
});

export default PitchList;
