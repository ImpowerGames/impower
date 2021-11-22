import React from "react";
import { ConfigParameters } from "../../impower-config";
import { AggData } from "../../impower-data-state";
import {
  ContributionDocument,
  ProjectDocument,
  useDataStoreConnectionStatus,
} from "../../impower-data-store";
import { SvgData } from "../../impower-icon";
import PopulatedPitchList from "./PopulatedPitchList";

interface PitchListContentProps {
  config?: ConfigParameters;
  icons?: { [name: string]: SvgData };
  pitchDocs?: { [id: string]: ProjectDocument };
  chunkMap?: { [id: string]: number };
  lastLoadedChunk?: number;
  offlinePlaceholder?: React.ReactNode;
  compact?: boolean;
  dontFade?: boolean;
  style?: React.CSSProperties;
  onChangeScore?: (
    e: React.MouseEvent,
    score: number,
    pitchId: string,
    contributionId?: string
  ) => void;
  onEdit?: (e: React.MouseEvent, id: string) => void;
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
      offlinePlaceholder,
      compact,
      dontFade,
      style,
      onChangeScore,
      onEdit,
      onDelete,
      onKudo,
      onCreateContribution,
      onUpdateContribution,
      onDeleteContribution,
    } = props;

    const isOnline = useDataStoreConnectionStatus();

    if (pitchDocs === undefined && isOnline === false) {
      return <>{offlinePlaceholder}</>;
    }

    if (!pitchDocs) {
      return null;
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
          dontFade={dontFade}
          style={style}
          onChangeScore={onChangeScore}
          onEdit={onEdit}
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
