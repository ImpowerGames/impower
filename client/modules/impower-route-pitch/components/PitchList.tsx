import styled from "@emotion/styled";
import dynamic from "next/dynamic";
import React, {
  PropsWithChildren,
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
} from "../../impower-data-store";
import DataStoreCache from "../../impower-data-store/classes/dataStoreCache";
import { SvgData } from "../../impower-icon";
import { NavigationContext } from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";
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

const StyledPitchList = styled.div`
  width: 100%;
  margin: auto;
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledOverlayArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  pointer-events: none;
`;

const StyledLoadingArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
`;

const StyledEmptyArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
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
  loadingPlaceholder?: React.ReactNode;
  emptyPlaceholder?: React.ReactNode;
  offlinePlaceholder?: React.ReactNode;
  emptyLabel?: string;
  emptySubtitle?: string;
  allowReload?: boolean;
  reloading?: boolean;
  listElRef?: React.MutableRefObject<HTMLDivElement>;
  loadingElRef?: React.MutableRefObject<HTMLDivElement>;
  onReloading?: (reloading: boolean) => void;
  onFollowMore?: (open: boolean) => void;
  onRangeFilter?: (e: React.MouseEvent, rangeFilter: DateRangeFilter) => void;
}

const PitchList = React.memo(
  (props: PropsWithChildren<PitchListProps>): JSX.Element => {
    const pitchedCollection = "pitched_games";

    const defaultListElRef = useRef<HTMLDivElement>();
    const defaultLoadingElRef = useRef<HTMLDivElement>();

    const {
      config,
      icons,
      search,
      creator,
      pitchDocs,
      tab,
      compact,
      sortOptions,
      loadingPlaceholder,
      emptyPlaceholder,
      offlinePlaceholder,
      emptyLabel,
      emptySubtitle,
      allowReload,
      reloading,
      children,
      listElRef = defaultListElRef,
      loadingElRef = defaultLoadingElRef,
      onReloading,
      onFollowMore,
      onRangeFilter,
    } = props;

    const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
    const [userState] = useContext(UserContext);
    const { settings, my_recent_pitched_projects, my_follows } = userState;
    const account = settings?.account;
    const nsfwVisible =
      account === undefined ? undefined : account?.nsfwVisible || false;

    const followedTags = useMemo(
      () =>
        my_follows
          ? Object.entries(my_follows)
              .filter(([, v]) => v.g === "tags")
              .map(([target]) => target.split("%").slice(-1).join(""))
          : (my_follows as null | undefined),
      [my_follows]
    );
    const [tabState, setTabState] = useState(tab);

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
    const [allowReloadState, setAllowReloadState] = useState(
      allowReload !== undefined ? allowReload : !pitchDocsRef.current
    );
    const [initialLoadComplete, setInitialLoadComplete] = useState(
      !pitchDocsRef.current
    );

    const initialPitchIds = useMemo(() => {
      return Object.keys(pitchDocsRef.current || {});
    }, []);

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
    const [reloadingState, setReloadingState] = useState(reloading);

    const [navigationState, navigationDispatch] = useContext(NavigationContext);
    const transitioning = navigationState?.transitioning;

    const recentPitchDocs = my_recent_pitched_projects;
    const recentPitchDocsRef = useRef(recentPitchDocs);

    const handleShowLoadingPlaceholder = useCallback(async () => {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      listElRef.current.style.visibility = "hidden";
      listElRef.current.style.pointerEvents = "none";
      loadingElRef.current.classList.add("animate");
      loadingElRef.current.style.visibility = null;
      loadingElRef.current.style.pointerEvents = null;
      window.scrollTo({ top: 0 });
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      setReloadingState(true);
    }, [listElRef, loadingElRef]);

    const handleHideLoadingPlaceholder = useCallback(async () => {
      loadingElRef.current.classList.remove("animate");
      setReloadingState(false);
    }, [loadingElRef]);

    const handleAllowReload = useCallback(async () => {
      await handleShowLoadingPlaceholder();
      if (onReloading) {
        onReloading(true);
      }
      lastLoadedChunkRef.current = 0;
      cursorsByTagRef.current = {};
      pitchDocsByTagRef.current = {};
      pitchDocsRef.current = {};
      chunkMapRef.current = {};
      DataStoreCache.instance.clear(...Array.from(cacheKeys.current));
      setAllowReloadState(true);
    }, [handleShowLoadingPlaceholder, onReloading]);

    useEffect(() => {
      if (allowReload) {
        handleAllowReload();
      }
    }, [allowReload, handleAllowReload]);

    useEffect(() => {
      if (reloading !== undefined) {
        if (reloading) {
          handleShowLoadingPlaceholder();
        } else {
          handleHideLoadingPlaceholder();
        }
      }
    }, [handleHideLoadingPlaceholder, handleShowLoadingPlaceholder, reloading]);

    useEffect(() => {
      if (tab !== undefined) {
        setTabState(tab);
      }
    }, [tab]);

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
            const matchingRecentPitchDocs: { [id: string]: ProjectDocument } =
              {};
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

            const matchingRecentPitchDocs: { [id: string]: ProjectDocument } =
              {};
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
            const matchingRecentPitchDocs: { [id: string]: ProjectDocument } =
              {};
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
        setInitialLoadComplete(true);
        await handleHideLoadingPlaceholder();
        if (onReloading) {
          onReloading(false);
        }
      },
      [handleHideLoadingPlaceholder, handleLoadMore, onReloading]
    );

    const handleScrolledToEnd = useCallback(async (): Promise<void> => {
      if (
        pitchDocsRef.current &&
        !noMoreRef.current &&
        !loadingMoreRef.current
      ) {
        loadingMoreRef.current = true;
        setLoadingMore(loadingMoreRef.current);
        setLoadIcons(true);
        lastLoadedChunkRef.current += 1;
        setLastLoadedChunk(lastLoadedChunkRef.current);
        await handleLoadTab({
          tab: tabState,
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
      tabState,
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
        tab: tabState,
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
      tabState,
      sort,
      goalFilter,
      nsfwVisible,
      rangeFilter,
      followedTags,
      search,
      creator,
    ]);

    const handleReload = useCallback(async () => {
      if (pitchDocsRef.current) {
        await handleShowLoadingPlaceholder();
        if (onReloading) {
          onReloading(true);
        }
      }
      cursorsByTagRef.current = {};
      pitchDocsByTagRef.current = {};
      pitchDocsRef.current = {};
      chunkMapRef.current = {};
      noMoreRef.current = false;
      await handleLoadTab({
        nsfwVisible,
        followedTags,
        tab: tabState,
        sort,
        goalFilter,
        rangeFilter,
        search,
        creator,
      });
    }, [
      creator,
      followedTags,
      goalFilter,
      handleLoadTab,
      handleShowLoadingPlaceholder,
      nsfwVisible,
      onReloading,
      rangeFilter,
      search,
      sort,
      tabState,
    ]);

    useEffect(() => {
      navigationDispatch(navigationSetTransitioning(false));
      if ([nsfwVisible, followedTags].some((x) => x === undefined)) {
        return;
      }
      if (!allowReloadState) {
        return;
      }
      setLoadIcons(true);
      handleReload();
    }, [
      allowReloadState,
      followedTags,
      handleReload,
      navigationDispatch,
      nsfwVisible,
    ]);

    const handleChangeGoalFilter = useCallback(
      async (e: React.MouseEvent, value: PitchGoalFilter): Promise<void> => {
        await handleAllowReload();
        setGoalFilter(value);
      },
      [handleAllowReload]
    );

    const handleChangeSortFilter = useCallback(
      async (e: React.MouseEvent, value: QuerySort): Promise<void> => {
        await handleAllowReload();
        setSort(value);
      },
      [handleAllowReload]
    );

    const handleChangeRangeFilter = useCallback(
      async (e: React.MouseEvent, value: DateRangeFilter) => {
        await handleAllowReload();
        setRangeFilter(value);
        if (onRangeFilter) {
          onRangeFilter(e, value);
        }
      },
      [handleAllowReload, onRangeFilter]
    );

    const handleFollowMore = useCallback(() => {
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

    const pitchCount = useMemo(
      () =>
        pitchDocsState
          ? Object.keys(pitchDocsState)?.length
          : (pitchDocsState as null | undefined),
      [pitchDocsState]
    );

    const loading = transitioning || !pitchDocsState || reloadingState;

    const listStyle: React.CSSProperties = useMemo(
      () => ({
        visibility: loading ? "hidden" : undefined,
        pointerEvents: loading ? "none" : undefined,
      }),
      [loading]
    );
    const loadingStyle: React.CSSProperties = useMemo(
      () => ({
        visibility: loading ? undefined : "hidden",
        pointerEvents: loading ? undefined : "none",
      }),
      [loading]
    );

    return (
      <>
        <StyledPitchList ref={listElRef} style={listStyle}>
          <PitchListQueryHeader
            goalFilter={goalFilter}
            rangeFilter={rangeFilter}
            sort={sort}
            sortOptions={sortOptions}
            onGoalFilter={handleChangeGoalFilter}
            onRangeFilter={
              tabState === "Top" ? handleChangeRangeFilter : undefined
            }
            onSort={tabState === "Top" ? undefined : handleChangeSortFilter}
            onFollowMore={
              tabState === "Following" ? handleFollowMore : undefined
            }
          />
          <PitchListContent
            config={config}
            icons={icons}
            pitchDocs={pitchDocsState}
            chunkMap={chunkMap}
            lastLoadedChunk={lastLoadedChunk}
            compact={compact}
            offlinePlaceholder={offlinePlaceholder}
            dontFade={!initialLoadComplete}
            onChangeScore={handleChangeScore}
            onDelete={handleDeletePitch}
            onKudo={handleKudo}
            onCreateContribution={handleCreateContribution}
            onDeleteContribution={handleDeleteContribution}
          />
          {((emptyPlaceholder && pitchCount > 0) ||
            (!emptyPlaceholder && pitchDocsState)) && (
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
          {children}
          {loadIcons && <TagIconLoader />}
        </StyledPitchList>
        <StyledOverlayArea>
          {pitchCount === 0 && (
            <StyledEmptyArea>{emptyPlaceholder}</StyledEmptyArea>
          )}
          <StyledLoadingArea ref={loadingElRef} style={loadingStyle}>
            {loadingPlaceholder}
          </StyledLoadingArea>
        </StyledOverlayArea>
      </>
    );
  }
);

export default PitchList;
