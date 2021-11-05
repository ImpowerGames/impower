import styled from "@emotion/styled";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConfigParameters } from "../../impower-config";
import {
  confirmDialogClose,
  ConfirmDialogContext,
} from "../../impower-confirm-dialog";
import { chunk } from "../../impower-core";
import {
  DateAge,
  DocumentSnapshot,
  PitchGoal,
  ProjectDocument,
  QuerySort,
  useDataStoreConnectionStatus,
} from "../../impower-data-store";
import DataStoreCache from "../../impower-data-store/classes/dataStoreCache";
import { SvgData } from "../../impower-icon";
import {
  NavigationContext,
  navigationSetSearchbar,
} from "../../impower-navigation";
import { UserContext } from "../../impower-user";
import { DateRangeFilter } from "../types/dateRangeFilter";
import { PitchGoalFilter } from "../types/pitchGoalFilter";
import PitchListContent from "./PitchListContent";
import PitchListQueryHeader from "./PitchListQueryHeader";
import PitchLoadingProgress from "./PitchLoadingProgress";
import { PitchToolbarTab } from "./PitchTabsToolbar";

const LOAD_MORE_LIMIT = 10;

const getLoadingKey = (options: Record<string, unknown>): string =>
  Object.keys(options)
    .sort()
    .map((key) => options[key])
    .join(",");

const TagIconLoader = dynamic(
  () => import("../../impower-route/components/elements/TagIconLoader"),
  { ssr: false }
);

const StyledContainer = styled.div`
  width: 100%;
  margin: auto;
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

interface PitchListProps {
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  pitchDocs?: { [id: string]: ProjectDocument };
  search?: string;
  creator?: string;
  tab?: "Trending" | "Top" | "Following";
  compact?: boolean;
  sortOptions?: QuerySort[];
  searchingPlaceholder?: React.ReactNode;
  emptyPlaceholder?: React.ReactNode;
  offlinePlaceholder?: React.ReactNode;
  emptyLabel?: string;
  emptySubtitle?: string;
  onFollowMore?: (open: boolean) => void;
}

const PitchList = React.memo((props: PitchListProps): JSX.Element => {
  const pitchedCollection = "pitched_games";

  const {
    config,
    icons,
    search,
    creator,
    pitchDocs,
    tab,
    compact,
    sortOptions,
    searchingPlaceholder,
    emptyPlaceholder,
    offlinePlaceholder,
    emptyLabel,
    emptySubtitle,
    onFollowMore,
  } = props;

  const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
  const [userState] = useContext(UserContext);
  const { settings, my_recent_pitched_projects, my_follows } = userState;
  const account = settings?.account;
  const nsfwVisible = account === null ? null : account?.nsfwVisible;

  const followedTags = useMemo(
    () =>
      my_follows
        ? Object.entries(my_follows)
            .filter(([, v]) => v.g === "tags")
            .map(([target]) => target.split("%").slice(-1).join(""))
        : (my_follows as null | undefined),
    [my_follows]
  );

  const initialPitchIds = useMemo(() => {
    return Object.keys(pitchDocs || {});
  }, [pitchDocs]);

  const initialChunkMap = useMemo(() => {
    const chunkMap = {};
    initialPitchIds.forEach((id) => {
      chunkMap[id] = 0;
    });
    return chunkMap;
  }, [initialPitchIds]);

  const chunkMapRef = useRef<{
    [id: string]: number;
  }>(initialChunkMap);
  const [chunkMap, setChunkMap] = useState<{
    [id: string]: number;
  }>(chunkMapRef.current);

  const loadingMoreRef = useRef<boolean>();
  const [loadingMore, setLoadingMore] = useState<boolean>();
  const [loadIcons, setLoadIcons] = useState(false);
  const noMoreRef = useRef<boolean>(initialPitchIds.length === 0);
  const [noMore, setNoMore] = useState<boolean>(noMoreRef.current);
  const [goalFilter, setGoalFilter] = useState<PitchGoalFilter>("All");
  const [sort, setSort] = useState<QuerySort>(sortOptions?.[0] || "rank");
  const [rangeFilter, setRangeFilter] = useState<DateRangeFilter>("d");

  const lastLoadedChunkRef = useRef(0);
  const [lastLoadedChunk, setLastLoadedChunk] = useState(
    lastLoadedChunkRef.current
  );

  const pitchDocsRef = useRef<{ [id: string]: ProjectDocument }>(pitchDocs);
  const [pitchDocsState, setPitchDocsState] = useState<{
    [id: string]: ProjectDocument;
  }>(pitchDocsRef.current);

  const pitchDocsByTagRef = useRef<{
    [tag: string]: { [id: string]: ProjectDocument };
  }>({});
  const cursorsByTagRef = useRef<{
    [tag: string]: DocumentSnapshot<ProjectDocument>;
  }>({});
  const loadingKey = useRef<string>();
  const cacheKeys = useRef<Set<string>>(new Set());
  const [allowReload, setAllowReload] = useState(false);

  const [navigationState, navigationDispatch] = useContext(NavigationContext);
  const searching = navigationState?.search?.searching;

  const recentPitchDocs = my_recent_pitched_projects;
  const recentPitchDocsRef = useRef(recentPitchDocs);

  useEffect(() => {
    recentPitchDocsRef.current = recentPitchDocs || {};
    if (pitchDocsRef.current) {
      const newPitchDocs = {
        ...recentPitchDocsRef.current,
        ...pitchDocsRef.current,
      };
      Object.entries(newPitchDocs).forEach(([id, doc]) => {
        if (doc.delisted) {
          delete newPitchDocs[id];
        }
        if (creator && creator !== doc._createdBy) {
          delete newPitchDocs[id];
        }
        if (chunkMapRef.current[id] === undefined) {
          chunkMapRef.current[id] = lastLoadedChunkRef.current;
        }
      });
      pitchDocsRef.current = newPitchDocs;
      setPitchDocsState(pitchDocsRef.current);
      setChunkMap(chunkMapRef.current);
    }
  }, [creator, recentPitchDocs]);

  const handleLoadMore = useCallback(
    async (
      options: {
        sort: QuerySort;
        goal?: PitchGoal;
        age?: DateAge;
        nsfw?: boolean;
        tags?: string[];
        search?: string;
        creator?: string;
      },
      currentLoadingKey: string,
      limit: number
    ): Promise<number> => {
      const { search, tags } = options;

      const chunkKey = tags?.join("#") || "";

      const pitchSearchQuery = (
        await import("../../impower-data-store/utils/pitchSearchQuery")
      ).default;
      const pitchFilterQuery = (
        await import("../../impower-data-store/utils/pitchFilterQuery")
      ).default;

      const sortedPitchesQuery = search
        ? await pitchSearchQuery(options, pitchedCollection)
        : await pitchFilterQuery(options, pitchedCollection);
      const cursor = cursorsByTagRef.current[chunkKey];
      const cursorQuery = cursor
        ? sortedPitchesQuery.startAfter(cursor).limit(limit)
        : sortedPitchesQuery.limit(limit);
      cacheKeys.current.add(cursorQuery.key);
      const snapshot = await cursorQuery.get<ProjectDocument>();

      if (loadingKey.current !== currentLoadingKey) {
        return undefined;
      }

      const { docs } = snapshot;
      const cursorIndex = docs.length - 1;
      const newCursor = docs[cursorIndex] || null;
      const newDocs: { [id: string]: ProjectDocument } = {};
      docs.forEach((d) => {
        newDocs[d.id] = d.data();
      });

      if (loadingKey.current !== currentLoadingKey) {
        return undefined;
      }

      cursorsByTagRef.current[chunkKey] = newCursor;

      const currentDocs = pitchDocsByTagRef.current[chunkKey] || {};
      pitchDocsByTagRef.current[chunkKey] = {
        ...currentDocs,
        ...newDocs,
      };

      return docs.length;
    },
    []
  );

  const handleLoadTab = useCallback(
    async (options: {
      tab: PitchToolbarTab;
      sort: QuerySort;
      goalFilter?: PitchGoalFilter;
      rangeFilter?: DateRangeFilter;
      nsfwVisible?: boolean;
      followedTags?: string[];
      search?: string;
      creator?: string;
    }) => {
      const {
        tab,
        sort,
        goalFilter,
        rangeFilter,
        nsfwVisible,
        followedTags,
        search,
        creator,
      } = options;

      const currentLoadingKey = getLoadingKey(options);

      loadingKey.current = currentLoadingKey;

      try {
        if (tab === "Top") {
          const limit = LOAD_MORE_LIMIT;
          const options: {
            sort: "rank" | "rating" | "new";
            goal: PitchGoal;
            age: DateAge;
            nsfw: boolean;
            search?: string;
            creator?: string;
          } = {
            sort: "rating",
            goal: goalFilter !== "All" ? goalFilter : undefined,
            age: rangeFilter !== "All" ? rangeFilter : undefined,
            nsfw: nsfwVisible,
            search,
            creator,
          };
          const loadedCount = await handleLoadMore(
            options,
            currentLoadingKey,
            limit
          );
          if (loadedCount === undefined) {
            return;
          }
          const matchingRecentPitchDocs: { [id: string]: ProjectDocument } = {};
          const { goal } = options;
          Object.entries(recentPitchDocsRef.current || {}).forEach(
            ([id, doc]) => {
              if (
                (!goal || goal === doc?.pitchGoal) &&
                (!creator || creator === doc?._createdBy)
              ) {
                matchingRecentPitchDocs[id] = doc;
              }
            }
          );
          const newPitchDocs = {
            ...matchingRecentPitchDocs,
            ...pitchDocsByTagRef.current[""],
            ...matchingRecentPitchDocs,
          };
          Object.entries(newPitchDocs).forEach(([id, doc]) => {
            if (doc.delisted) {
              delete newPitchDocs[id];
            }
            if (chunkMapRef.current[id] === undefined) {
              chunkMapRef.current[id] = lastLoadedChunkRef.current;
            }
          });
          pitchDocsRef.current = newPitchDocs;
          noMoreRef.current = loadedCount < limit;
          setPitchDocsState(pitchDocsRef.current);
          setChunkMap(chunkMapRef.current);
          setNoMore(noMoreRef.current);
        } else if (tab === "Following") {
          if (!followedTags || followedTags?.length === 0) {
            return;
          }
          const limit = Math.max(
            3,
            Math.round(LOAD_MORE_LIMIT / followedTags.length)
          );
          const shuffle = (await import("../../impower-core/utils/shuffle"))
            .default;
          const shuffledTags = shuffle(followedTags);
          // Shuffle the tags and load more pitches by searching for 10 tags at a time.
          const chunks = chunk(shuffledTags, 10);
          const options: {
            sort: "rank" | "rating" | "new";
            goal: PitchGoal;
            nsfw: boolean;
            search?: string;
            creator?: string;
          } = {
            sort,
            goal: goalFilter !== "All" ? goalFilter : undefined,
            nsfw: nsfwVisible,
            search,
            creator,
          };
          await Promise.all(
            chunks.map((chunk) =>
              handleLoadMore(
                { ...options, tags: chunk },
                currentLoadingKey,
                limit
              )
            )
          );
          const newDocs: { [id: string]: ProjectDocument } = {};
          Object.entries(pitchDocsByTagRef.current).forEach(([, list]) => {
            Object.entries(list).forEach(([id, pitch]) => {
              if (!pitchDocsRef.current?.[id]) {
                newDocs[id] = pitch;
              }
            });
          });

          const currentDocs = pitchDocsRef.current || {};

          const oldCount = Object.keys(currentDocs).length;

          const matchingRecentPitchDocs: { [id: string]: ProjectDocument } = {};
          const { goal } = options;
          Object.entries(recentPitchDocsRef.current || {}).forEach(
            ([id, doc]) => {
              if (
                (!goal || goal === doc?.pitchGoal) &&
                followedTags.some((t) => doc?.tags?.includes(t)) &&
                (!creator || creator === doc?._createdBy)
              ) {
                matchingRecentPitchDocs[id] = doc;
              }
            }
          );
          const newPitchDocs = {
            ...matchingRecentPitchDocs,
            ...currentDocs,
            ...newDocs,
            ...matchingRecentPitchDocs,
          };
          Object.entries(newPitchDocs).forEach(([id, doc]) => {
            if (doc.delisted) {
              delete newPitchDocs[id];
            }
            if (chunkMapRef.current[id] === undefined) {
              chunkMapRef.current[id] = lastLoadedChunkRef.current;
            }
          });
          pitchDocsRef.current = newPitchDocs;

          const newCount = Object.keys(pitchDocsRef.current).length;
          noMoreRef.current = oldCount > 0 && newCount === oldCount;

          setPitchDocsState(pitchDocsRef.current);
          setChunkMap(chunkMapRef.current);
          setNoMore(noMoreRef.current);
        } else {
          const limit = LOAD_MORE_LIMIT;
          const options: {
            sort: "rank" | "rating" | "new";
            goal: PitchGoal;
            nsfw: boolean;
            search?: string;
            creator?: string;
          } = {
            sort,
            goal: goalFilter !== "All" ? goalFilter : undefined,
            nsfw: nsfwVisible,
            search,
            creator,
          };
          const loadedCount = await handleLoadMore(
            options,
            currentLoadingKey,
            limit
          );
          if (loadedCount === undefined) {
            return;
          }
          const matchingRecentPitchDocs: { [id: string]: ProjectDocument } = {};
          const { goal } = options;
          Object.entries(recentPitchDocsRef.current || {}).forEach(
            ([id, doc]) => {
              if (
                (!goal || goal === doc?.pitchGoal) &&
                (!creator || creator === doc?._createdBy)
              ) {
                matchingRecentPitchDocs[id] = doc;
              }
            }
          );
          const newPitchDocs = {
            ...matchingRecentPitchDocs,
            ...pitchDocsByTagRef.current[""],
            ...matchingRecentPitchDocs,
          };
          Object.entries(newPitchDocs).forEach(([id, doc]) => {
            if (doc.delisted) {
              delete newPitchDocs[id];
            }
            if (chunkMapRef.current[id] === undefined) {
              chunkMapRef.current[id] = lastLoadedChunkRef.current;
            }
          });
          pitchDocsRef.current = newPitchDocs;
          noMoreRef.current = loadedCount < limit;
          setPitchDocsState(pitchDocsRef.current);
          setChunkMap(chunkMapRef.current);
          setNoMore(noMoreRef.current);
        }
      } catch (e) {
        const logInfo = (await import("../../impower-logger/utils/logError"))
          .default;
        logInfo("Route", e.message);
      }
    },
    [handleLoadMore]
  );

  const handleScrolledToEnd = useCallback(async (): Promise<void> => {
    if (pitchDocsRef.current && !noMoreRef.current && !loadingMoreRef.current) {
      loadingMoreRef.current = true;
      setLoadingMore(loadingMoreRef.current);
      setLoadIcons(true);
      lastLoadedChunkRef.current += 1;
      setLastLoadedChunk(lastLoadedChunkRef.current);
      await handleLoadTab({
        tab,
        sort,
        goalFilter,
        nsfwVisible,
        rangeFilter,
        followedTags,
        search,
        creator,
      });
      loadingMoreRef.current = false;
      setLoadingMore(loadingMoreRef.current);
    }
  }, [
    handleLoadTab,
    tab,
    sort,
    goalFilter,
    nsfwVisible,
    rangeFilter,
    followedTags,
    search,
    creator,
  ]);

  const handleRefresh = useCallback(async (): Promise<void> => {
    window.scrollTo({ top: 0 });
    cursorsByTagRef.current = {};
    pitchDocsByTagRef.current = {};
    pitchDocsRef.current = {};
    chunkMapRef.current = {};
    DataStoreCache.instance.clear(...Array.from(cacheKeys.current));
    await handleLoadTab({
      tab,
      sort,
      goalFilter,
      nsfwVisible,
      rangeFilter,
      followedTags,
      search,
      creator,
    });
  }, [
    handleLoadTab,
    tab,
    sort,
    goalFilter,
    nsfwVisible,
    rangeFilter,
    followedTags,
    search,
    creator,
  ]);

  useEffect(() => {
    if ([nsfwVisible, followedTags].some((x) => x === undefined)) {
      return;
    }
    if (pitchDocsRef.current && !allowReload) {
      navigationDispatch(navigationSetSearchbar({ searching: false }));
      return;
    }
    cursorsByTagRef.current = {};
    pitchDocsByTagRef.current = {};
    pitchDocsRef.current = {};
    chunkMapRef.current = {};
    noMoreRef.current = false;
    setLoadIcons(true);
    setPitchDocsState(undefined);
    setChunkMap(undefined);
    setNoMore(noMoreRef.current);
    handleLoadTab({
      nsfwVisible,
      followedTags,
      tab,
      sort,
      goalFilter,
      rangeFilter,
      search,
      creator,
    });
  }, [
    tab,
    allowReload,
    followedTags,
    goalFilter,
    handleLoadTab,
    nsfwVisible,
    rangeFilter,
    sort,
    navigationDispatch,
    search,
    creator,
  ]);

  const handleAllowReload = useCallback(() => {
    lastLoadedChunkRef.current = -1;
    cursorsByTagRef.current = {};
    pitchDocsByTagRef.current = {};
    pitchDocsRef.current = {};
    chunkMapRef.current = {};
    DataStoreCache.instance.clear(...Array.from(cacheKeys.current));
    setAllowReload(true);
  }, []);

  const handleChangeGoalFilter = useCallback(
    async (e: React.MouseEvent, value: PitchGoalFilter): Promise<void> => {
      handleAllowReload();
      setGoalFilter(value);
    },
    [handleAllowReload]
  );

  const handleChangeSortFilter = useCallback(
    async (e: React.MouseEvent, value: QuerySort): Promise<void> => {
      handleAllowReload();
      setSort(value);
    },
    [handleAllowReload]
  );

  const handleChangeRangeFilter = useCallback(
    (e: React.MouseEvent, value: DateRangeFilter): void => {
      handleAllowReload();
      setRangeFilter(value);
    },
    [handleAllowReload]
  );

  const handleFollowMore = useCallback((): void => {
    if (onFollowMore) {
      onFollowMore(true);
    }
  }, [onFollowMore]);

  const handleKudo = useCallback(
    (
      e: React.MouseEvent<Element, MouseEvent>,
      kudoed: boolean,
      pitchId: string,
      contributionId: string
    ): void => {
      if (!contributionId && pitchDocsRef.current[pitchId]) {
        const kudos = kudoed
          ? (pitchDocsRef.current[pitchId].kudos || 0) + 1
          : (pitchDocsRef.current[pitchId].kudos || 0) - 1;
        const currentDoc = pitchDocsRef.current[pitchId];
        const newDoc = { ...currentDoc, kudos };
        pitchDocsRef.current[pitchId] = newDoc;
        DataStoreCache.instance.override(pitchId, { kudos });
        setPitchDocsState({ ...pitchDocsRef.current });
      }
    },
    []
  );

  const handleChangeScore = useCallback(
    (e: React.MouseEvent, score: number, pitchId: string): void => {
      const currentDoc = pitchDocsRef.current[pitchId];
      const newDoc = { ...currentDoc, score };
      pitchDocsRef.current[pitchId] = newDoc;
      DataStoreCache.instance.override(pitchId, { score });
      setPitchDocsState({ ...pitchDocsRef.current });
    },
    []
  );

  const handleDeletePitch = useCallback(async (): Promise<void> => {
    confirmDialogDispatch(confirmDialogClose());
  }, [confirmDialogDispatch]);

  const handleCreateContribution = useCallback(
    async (
      e: React.MouseEvent<Element, MouseEvent>,
      pitchId: string
    ): Promise<void> => {
      const contributions =
        (pitchDocsRef.current[pitchId].contributions || 0) + 1;
      const currentDoc = pitchDocsRef.current[pitchId];
      const newDoc = { ...currentDoc, contributions };
      pitchDocsRef.current[pitchId] = newDoc;
      DataStoreCache.instance.override(pitchId, { contributions });
      setPitchDocsState({ ...pitchDocsRef.current });
    },
    []
  );

  const handleDeleteContribution = useCallback(
    async (
      e: React.MouseEvent<Element, MouseEvent>,
      pitchId: string
    ): Promise<void> => {
      const contributions =
        (pitchDocsRef.current[pitchId].contributions || 0) - 1;
      const currentDoc = pitchDocsRef.current[pitchId];
      const newDoc = { ...currentDoc, contributions };
      pitchDocsRef.current[pitchId] = newDoc;
      DataStoreCache.instance.override(pitchId, { contributions });
      setPitchDocsState({ ...pitchDocsRef.current });
      confirmDialogDispatch(confirmDialogClose());
    },
    [confirmDialogDispatch]
  );

  const isOnline = useDataStoreConnectionStatus();

  const pitchCount = useMemo(
    () => Object.keys(pitchDocsState || {})?.length,
    [pitchDocsState]
  );

  if (pitchDocsState === undefined && isOnline === false) {
    return <>{offlinePlaceholder}</>;
  }

  return (
    <StyledContainer>
      {searching ? (
        searchingPlaceholder
      ) : (
        <>
          <PitchListQueryHeader
            goalFilter={goalFilter}
            rangeFilter={rangeFilter}
            sort={sort}
            sortOptions={sortOptions}
            onGoalFilter={handleChangeGoalFilter}
            onRangeFilter={tab === "Top" ? handleChangeRangeFilter : undefined}
            onSort={tab === "Top" ? undefined : handleChangeSortFilter}
            onFollowMore={tab === "Following" ? handleFollowMore : undefined}
          />
          <PitchListContent
            config={config}
            icons={icons}
            pitchDocs={pitchDocsState}
            chunkMap={chunkMap}
            lastLoadedChunk={lastLoadedChunk}
            compact={compact}
            emptyPlaceholder={emptyPlaceholder}
            onChangeScore={handleChangeScore}
            onDelete={handleDeletePitch}
            onKudo={handleKudo}
            onCreateContribution={handleCreateContribution}
            onDeleteContribution={handleDeleteContribution}
          />
          {(emptyPlaceholder || pitchDocsState) && (
            <PitchLoadingProgress
              loadingMore={Boolean(pitchDocsState) && Boolean(loadingMore)}
              noMore={
                emptyPlaceholder
                  ? pitchDocsState && pitchCount > 0 && noMore
                  : pitchDocsState && (noMore || pitchCount === 0)
              }
              noMoreLabel={
                pitchDocsState && !emptyPlaceholder && pitchCount === 0
                  ? emptyLabel
                  : `That's all for now!`
              }
              noMoreSubtitle={
                pitchDocsState && !emptyPlaceholder && pitchCount === 0
                  ? emptySubtitle
                  : undefined
              }
              refreshLabel={
                !emptyPlaceholder && pitchCount === 0 ? undefined : `Refresh?`
              }
              onScrolledToEnd={handleScrolledToEnd}
              onRefresh={handleRefresh}
            />
          )}
        </>
      )}
      {loadIcons && <TagIconLoader />}
    </StyledContainer>
  );
});

export default PitchList;
