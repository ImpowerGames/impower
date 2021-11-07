import styled from "@emotion/styled";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AggData } from "../../impower-data-state";
import {
  ContributionDocument,
  getDataStoreKey,
  ProjectDocument,
} from "../../impower-data-store";
import { UserContext } from "../../impower-user";
import AddKudoToolbar from "./AddKudoToolbar";
import KudoListContent from "./KudoListContent";
import PitchLoadingProgress from "./PitchLoadingProgress";

const LOAD_MORE_LIMIT = 50;

const StyledKudoList = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledListContent = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

interface KudoListProps {
  scrollParent?: HTMLElement;
  pitchId: string;
  contributionId: string;
  targetDoc: ProjectDocument | ContributionDocument;
  kudos?: { [id: string]: AggData };
  toolbarRef?: React.Ref<HTMLDivElement>;
  toolbarAreaStyle?: React.CSSProperties;
  toolbarStyle?: React.CSSProperties;
  onKudo?: (
    e: React.MouseEvent | React.ChangeEvent,
    kudoed: boolean,
    pitchId: string,
    contributionId: string,
    data: AggData
  ) => void;
}

const KudoList = React.memo((props: KudoListProps): JSX.Element => {
  const pitchedCollection = "pitched_games";

  const {
    scrollParent,
    pitchId,
    contributionId,
    targetDoc,
    kudos,
    toolbarRef,
    toolbarAreaStyle,
    toolbarStyle,
    onKudo,
  } = props;

  const [userState] = useContext(UserContext);
  const { uid, my_kudos, claims } = userState;
  const username = claims?.username;
  const icon = claims?.icon;
  const hex = claims?.hex;

  const loadingMoreRef = useRef<boolean>();
  const [loadingMore, setLoadingMore] = useState<boolean>();
  const noMoreRef = useRef<boolean>();
  const [noMore, setNoMore] = useState<boolean>();

  const initialChunkMap = useMemo(() => {
    const chunkMap = {};
    Object.keys(kudos || {}).forEach((id) => {
      chunkMap[id] = 0;
    });
    return chunkMap;
  }, [kudos]);

  const chunkMapRef = useRef<{
    [id: string]: number;
  }>(initialChunkMap);
  const [chunkMap, setChunkMap] = useState<{
    [id: string]: number;
  }>(chunkMapRef.current);

  const lastLoadedChunkRef = useRef(0);
  const [lastLoadedChunk, setLastLoadedChunk] = useState(
    lastLoadedChunkRef.current
  );

  const kudosRef = useRef<{ [id: string]: AggData }>(kudos);
  const [kudosState, setKudosState] =
    useState<{ [id: string]: AggData }>(kudos);
  const cursorRef = useRef<string>();

  const kudoKey =
    pitchId && contributionId
      ? getDataStoreKey(
          pitchedCollection,
          pitchId,
          "contributions",
          contributionId
        )
      : getDataStoreKey(pitchedCollection, pitchId);
  const existingKudo = my_kudos?.[kudoKey];

  useEffect(() => {
    kudosRef.current = kudos;
    setKudosState(kudosRef.current);
  }, [kudos]);

  useEffect(() => {
    const newKudos = { ...kudosRef.current };
    if (existingKudo) {
      newKudos[uid] = {
        ...existingKudo,
        a: { u: username, i: icon, h: hex },
      };
    } else {
      delete newKudos[uid];
    }
    kudosRef.current = newKudos;
    setKudosState(kudosRef.current);
  }, [username, existingKudo, icon, uid, hex]);

  const timeLoaded = useMemo(() => new Date().getTime(), []);

  const handleLoad = useCallback(
    async (limit: number): Promise<number> => {
      const DataStateQuery = (
        await import("../../impower-data-state/classes/dataStateQuery")
      ).default;
      const query =
        pitchId && contributionId
          ? new DataStateQuery(
              pitchedCollection,
              pitchId,
              "contributions",
              contributionId,
              "agg",
              "kudos",
              "data"
            ).orderByChild("t")
          : new DataStateQuery(
              pitchedCollection,
              pitchId,
              "agg",
              "kudos",
              "data"
            ).orderByChild("t");
      const cursor = cursorRef.current;
      const cursorQuery = cursor
        ? query.endBefore(timeLoaded, cursor).limitToLast(limit)
        : query.endAt(timeLoaded).limitToLast(limit);
      const snapshot = await cursorQuery.get();
      const data: { [id: string]: AggData } = {};
      snapshot.forEach((s) => {
        data[s.key] = s.val();
      });
      cursorRef.current = Object.keys(data)?.[0];
      const currentKudos = kudosRef.current || {};
      const newKudos = { ...currentKudos };
      const newKeys = Object.keys(data);
      newKeys.reverse().forEach((id) => {
        if (!newKudos[id]) {
          newKudos[id] = data[id];
        }
        if (chunkMapRef.current[id] === undefined) {
          chunkMapRef.current[id] = lastLoadedChunkRef.current;
        }
      });
      kudosRef.current = newKudos;
      return newKeys.length;
    },
    [pitchId, contributionId, timeLoaded]
  );

  const handleLoadMoreItems = useCallback(async () => {
    loadingMoreRef.current = true;
    setLoadingMore(loadingMoreRef.current);
    const limit = LOAD_MORE_LIMIT;
    const loadedCount = await handleLoad(limit);
    noMoreRef.current = loadedCount < limit;
    setNoMore(noMoreRef.current);
    setKudosState(kudosRef.current);
    setChunkMap(chunkMapRef.current);
    loadingMoreRef.current = false;
    setLoadingMore(loadingMoreRef.current);
  }, [handleLoad]);

  const handleScrolledToEnd = useCallback(async (): Promise<void> => {
    if (kudosRef.current && !noMoreRef.current && !loadingMoreRef.current) {
      lastLoadedChunkRef.current += 1;
      setLastLoadedChunk(lastLoadedChunkRef.current);
      await handleLoadMoreItems();
    }
  }, [handleLoadMoreItems]);

  const handleReload = useCallback(async (): Promise<void> => {
    cursorRef.current = undefined;
    kudosRef.current = {};
    chunkMapRef.current = {};
    loadingMoreRef.current = undefined;
    noMoreRef.current = undefined;
    setKudosState(kudosRef.current);
    setChunkMap(chunkMapRef.current);
    setNoMore(noMoreRef.current);
    setLoadingMore(false);
    await handleLoadMoreItems();
  }, [handleLoadMoreItems]);

  const handleRefresh = useCallback(async (): Promise<void> => {
    if (scrollParent) {
      scrollParent.scrollTo({ top: 0 });
    }
    cursorRef.current = undefined;
    kudosRef.current = {};
    chunkMapRef.current = {};
    await handleLoadMoreItems();
  }, [handleLoadMoreItems, scrollParent]);

  useEffect(() => {
    handleReload();
  }, [handleReload]);

  const kudoEntries = useMemo(
    () => (kudosState ? Object.entries(kudosState) : undefined),
    [kudosState]
  );

  return (
    <>
      <StyledKudoList>
        <StyledListContent>
          <KudoListContent
            targetId={contributionId || pitchId}
            targetDoc={targetDoc}
            kudos={kudosState}
            chunkMap={chunkMap}
            lastLoadedChunk={lastLoadedChunk}
          />
          {kudosState && (
            <PitchLoadingProgress
              loadingMore={loadingMore}
              noMore={noMore || kudoEntries?.length === 0}
              noMoreLabel={kudoEntries?.length === 0 ? `No Kudos` : undefined}
              onScrolledToEnd={handleScrolledToEnd}
              onRefresh={handleRefresh}
            />
          )}
        </StyledListContent>
        <AddKudoToolbar
          toolbarRef={toolbarRef}
          pitchId={pitchId}
          contributionId={contributionId}
          onKudo={onKudo}
          style={toolbarStyle}
          toolbarAreaStyle={toolbarAreaStyle}
        />
      </StyledKudoList>
    </>
  );
});

export default KudoList;
