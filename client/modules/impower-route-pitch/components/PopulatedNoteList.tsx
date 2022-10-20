import styled from "@emotion/styled";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ContributionDocument,
  ProjectDocument,
} from "../../impower-data-store";
import { NoteDocument } from "../../impower-data-store/types/documents/noteDocument";
import { VirtualizedItem } from "../../impower-react-virtualization";
import { FadeAnimation } from "../../impower-route";
import NoteCard from "./NoteCard";

const StyledCardArea = styled(FadeAnimation)``;

const StyledNoteList = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
`;

interface VirtualizedNoteCardProps {
  pitchId: string;
  contributionId: string;
  targetDoc: ProjectDocument | ContributionDocument;
  id: string;
  doc: NoteDocument;
}
const VirtualizedNoteCard = React.memo((props: VirtualizedNoteCardProps) => {
  const { pitchId, contributionId, targetDoc, id, doc } = props;

  return (
    <NoteCard
      pitchId={pitchId}
      contributionId={contributionId}
      targetDoc={targetDoc}
      id={id}
      doc={doc}
    />
  );
});

interface PopulatedNoteListProps {
  pitchId: string;
  contributionId: string;
  targetDoc: ProjectDocument | ContributionDocument;
  noteEntries?: [string, NoteDocument][];
  chunkMap?: { [id: string]: number };
  lastLoadedChunk?: number;
}

const PopulatedNoteList = React.memo(
  (props: PopulatedNoteListProps): JSX.Element => {
    const {
      pitchId,
      contributionId,
      targetDoc,
      noteEntries,
      chunkMap,
      lastLoadedChunk,
    } = props;

    const noteChunks = useMemo(() => {
      const chunks: [string, NoteDocument][][] = [];
      noteEntries.forEach(([id, doc]) => {
        const chunkIndex = chunkMap?.[id] || 0;
        if (!chunks[chunkIndex]) {
          chunks[chunkIndex] = [];
        }
        chunks[chunkIndex].push([id, doc]);
      });
      return chunks;
    }, [chunkMap, noteEntries]);

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
      <StyledNoteList>
        {noteChunks.map((chunk, chunkIndex) => {
          return (
            <VirtualizedItem
              key={chunkIndex}
              index={chunkIndex}
              mounted={mountedChunks.includes(chunkIndex)}
              onVisibilityChange={handleVisibilityChange}
            >
              {chunk.map(([id, doc], itemIndex) => {
                return (
                  <VirtualizedItem
                    key={id}
                    index={itemIndex}
                    visibleOffset={0}
                    mounted
                  >
                    <LazyHydrate whenVisible>
                      <StyledCardArea initial={0} animate={1} duration={0.15}>
                        <VirtualizedNoteCard
                          pitchId={pitchId}
                          contributionId={contributionId}
                          targetDoc={targetDoc}
                          id={id}
                          doc={doc}
                        />
                      </StyledCardArea>
                    </LazyHydrate>
                  </VirtualizedItem>
                );
              })}
            </VirtualizedItem>
          );
        })}
      </StyledNoteList>
    );
  }
);

export default PopulatedNoteList;
