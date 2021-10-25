import styled from "@emotion/styled";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AggData } from "../../impower-data-state";
import {
  ContributionDocument,
  ProjectDocument,
} from "../../impower-data-store";
import { LazyHydrate } from "../../impower-hydration";
import { VirtualizedItem } from "../../impower-react-virtualization";
import { FadeAnimation } from "../../impower-route";
import KudoCard from "./KudoCard";

const StyledCardArea = styled(FadeAnimation)``;

const StyledKudoList = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
`;

interface VirtualizedKudoCardProps {
  targetId: string;
  targetDoc: ProjectDocument | ContributionDocument;
  id: string;
  data: AggData;
}
const VirtualizedKudoCard = React.memo((props: VirtualizedKudoCardProps) => {
  const { targetId, targetDoc, id, data } = props;

  return (
    <KudoCard targetId={targetId} targetDoc={targetDoc} id={id} data={data} />
  );
});

interface PopulatedKudoListProps {
  targetId: string;
  targetDoc: ProjectDocument | ContributionDocument;
  kudoEntries?: [string, AggData][];
  chunkMap?: { [id: string]: number };
  lastLoadedChunk?: number;
}

const PopulatedKudoList = React.memo(
  (props: PopulatedKudoListProps): JSX.Element => {
    const { targetId, targetDoc, kudoEntries, chunkMap, lastLoadedChunk } =
      props;

    const kudoChunks = useMemo(() => {
      const chunks: [string, AggData][][] = [];
      kudoEntries.forEach(([id, doc]) => {
        const chunkIndex = chunkMap?.[id] || 0;
        if (!chunks[chunkIndex]) {
          chunks[chunkIndex] = [];
        }
        chunks[chunkIndex].push([id, doc]);
      });
      return chunks;
    }, [chunkMap, kudoEntries]);

    const mountedChunksRef = useRef<number[]>([lastLoadedChunk]);
    const [mountedChunks, setMountedChunks] = useState<number[]>(
      mountedChunksRef.current
    );

    useEffect(() => {
      if (lastLoadedChunk) {
        if (!mountedChunksRef.current.includes(lastLoadedChunk)) {
          mountedChunksRef.current = [
            lastLoadedChunk,
            lastLoadedChunk - 1,
            lastLoadedChunk - 2,
          ];
          setMountedChunks(mountedChunksRef.current);
        }
      }
    }, [lastLoadedChunk]);

    const handleVisibilityChange = useCallback(
      (chunk: number, visible?: boolean) => {
        if (visible) {
          if (!mountedChunksRef.current.includes(chunk)) {
            mountedChunksRef.current = [chunk, chunk - 1, chunk + 1];
            setMountedChunks(mountedChunksRef.current);
          }
        }
      },
      []
    );

    return (
      <StyledKudoList>
        {kudoChunks.map((chunk, chunkIndex) => {
          return (
            <VirtualizedItem
              key={chunkIndex}
              index={chunkIndex}
              mounted={mountedChunks.includes(chunkIndex)}
              onVisibilityChange={handleVisibilityChange}
            >
              {chunk.map(([id, data], itemIndex) => {
                return (
                  <VirtualizedItem
                    key={id}
                    index={itemIndex}
                    visibleOffset={0}
                    mounted
                  >
                    <LazyHydrate whenVisible>
                      <StyledCardArea initial={0} animate={1} duration={0.15}>
                        <VirtualizedKudoCard
                          targetId={targetId}
                          targetDoc={targetDoc}
                          id={id}
                          data={data}
                        />
                      </StyledCardArea>
                    </LazyHydrate>
                  </VirtualizedItem>
                );
              })}
            </VirtualizedItem>
          );
        })}
      </StyledKudoList>
    );
  }
);

export default PopulatedKudoList;
