import React, { useMemo } from "react";
import { AggData } from "../../impower-data-state";
import {
  ContributionDocument,
  ProjectDocument,
} from "../../impower-data-store";
import Fallback from "../../impower-route/components/layouts/Fallback";
import PopulatedKudoList from "./PopulatedKudoList";

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

    if (!kudoEntries) {
      return <Fallback disableShrink />;
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
