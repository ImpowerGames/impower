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
  confirmDialogNavOpen,
} from "../../impower-confirm-dialog";
import { chunk, Timestamp } from "../../impower-core";
import {
  DateAge,
  DocumentSnapshot,
  escapeURI,
  ProjectDocument,
  ProjectType,
  QuerySort,
} from "../../impower-data-store";
import DataStoreCache from "../../impower-data-store/classes/dataStoreCache";
import { useDialogNavigation } from "../../impower-dialog";
import { SvgData } from "../../impower-icon";
import { NavigationContext } from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";
import { useRouter } from "../../impower-router";
import { UserContext } from "../../impower-user";
import { DateRangeFilter } from "../types/dateRangeFilter";
import { ProjectTypeFilter } from "../types/projectTypeFilter";
import AddPitchToolbar from "./AddPitchToolbar";
import PitchListContent from "./PitchListContent";
import PitchListQueryHeader from "./PitchListQueryHeader";
import PitchLoadingProgress from "./PitchLoadingProgress";
import { PitchToolbarTab } from "./PitchTabsToolbar";

const discardInfo = {
  title: "Discard unsaved changes?",
  agreeLabel: "Discard",
  disagreeLabel: "Keep Editing",
};

const LOAD_MORE_LIMIT = 10;

const getTime = (date: string | Timestamp): number => {
  if (!date) {
    return new Date().getTime();
  }
  if (typeof date === "string") {
    return new Date(date).getTime();
  }
  return date.toDate().getTime();
};

const getValue = (num: number): number => {
  if (num === undefined || num === null) {
    return Number.MAX_SAFE_INTEGER;
  }
  return num;
};

const getLoadingKey = (options: Record<string, unknown>): string =>
  Object.keys(options)
    .sort()
    .map((key) => options[key])
    .join(",");

const CreatePitchDialog = dynamic(() => import("./CreatePitchDialog"), {
  ssr: false,
});

const TagIconLoader = dynamic(
  () => import("../../impower-route/components/elements/TagIconLoader"),
  { ssr: false }
);

const StyledListArea = styled.div`
  flex: 1;
  min-width: 0;
  background-color: ${(props): string => props.theme.colors.lightForeground};
  align-items: center;
  display: flex;
  flex-direction: column;
  position: relative;
`;

const StyledContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
`;

const StyledPitchList = styled.div`
  flex: 1;
  position: relative;
`;

const StyledListContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  margin: auto;
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
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
  pointer-events: none;
`;

const StyledEmptyArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  pointer-events: none;
  visibility: hidden;
`;

const StyledForceOverflow = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  min-height: calc(100% + 2px);
  pointer-events: none;
`;

interface PitchListProps {
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  pitchDocs?: { [id: string]: ProjectDocument };
  search?: string;
  creator?: string;
  tab?: "trending" | "top" | "following";
  type?: ProjectTypeFilter;
  rangeFilter?: DateRangeFilter;
  compact?: boolean;
  sortOptions?: QuerySort[];
  loadingPlaceholder?: React.ReactNode;
  emptyPlaceholder?: React.ReactNode;
  offlinePlaceholder?: React.ReactNode;
  emptyLabel?: string;
  emptySubtitle?: string;
  allowReload?: boolean;
  reloading?: boolean;
  toolbarElRef?: React.MutableRefObject<HTMLDivElement>;
  contentElRef?: React.MutableRefObject<HTMLDivElement>;
  listElRef?: React.MutableRefObject<HTMLDivElement>;
  loadingElRef?: React.MutableRefObject<HTMLDivElement>;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  queryHeaderStyle?: React.CSSProperties;
  hideAddToolbar?: boolean;
  onReloading?: (reloading: boolean) => void;
  onFollowMore?: (open: boolean) => void;
  onRangeFilter?: (e: React.MouseEvent, rangeFilter: DateRangeFilter) => void;
  onTypeFilter?: (e: React.MouseEvent, typeFilter: ProjectType) => void;
}

const PitchList = React.memo(
  (props: PropsWithChildren<PitchListProps>): JSX.Element => {
    const defaultToolbarElRef = useRef<HTMLDivElement>();
    const defaultContentElRef = useRef<HTMLDivElement>();
    const defaultListElRef = useRef<HTMLDivElement>();
    const defaultLoadingElRef = useRef<HTMLDivElement>();

    const {
      config,
      icons,
      search,
      creator,
      pitchDocs,
      tab,
      type,
      rangeFilter,
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
      toolbarElRef = defaultToolbarElRef,
      contentElRef = defaultContentElRef,
      listElRef = defaultListElRef,
      loadingElRef = defaultLoadingElRef,
      style,
      contentStyle,
      queryHeaderStyle,
      hideAddToolbar,
      onReloading,
      onFollowMore,
      onRangeFilter,
      onTypeFilter,
    } = props;

    const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
    const [userState] = useContext(UserContext);
    const { uid, settings, my_recent_pitched_projects, my_follows } = userState;
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

    const loadedPitchDocsRef = useRef<{ [id: string]: ProjectDocument }>({
      ...pitchDocs,
    });
    const [loadedPitchDocs, setLoadedPitchDocs] = useState<{
      [id: string]: ProjectDocument;
    }>(loadedPitchDocsRef.current);

    const pitchDocsByTagRef = useRef<{
      [tag: string]: { [id: string]: ProjectDocument };
    }>({});
    const cursorsByTagRef = useRef<{
      [tag: string]: DocumentSnapshot<ProjectDocument>;
    }>({});
    const loadingKeyRef = useRef<string>();
    const cacheKeys = useRef<Set<string>>(new Set());
    const [allowReloadState, setAllowReloadState] = useState(
      allowReload !== undefined ? allowReload : !loadedPitchDocsRef.current
    );
    const [initialLoadComplete, setInitialLoadComplete] = useState(
      !loadedPitchDocsRef.current
    );

    const initialPitchIds = useMemo(() => {
      return Object.keys(loadedPitchDocsRef.current || {});
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
    const [loadIcons, setLoadIcons] = useState(initialPitchIds.length === 0);
    const noMoreRef = useRef<boolean>(initialPitchIds.length === 0);
    const [noMore, setNoMore] = useState<boolean>(noMoreRef.current);
    const [typeFilterState, setTypeFilterState] = useState<ProjectTypeFilter>(
      type || "all"
    );
    const [sort, setSort] = useState<QuerySort>(sortOptions?.[0] || "rank");
    const [rangeFilterState, setRangeFilterState] = useState<DateRangeFilter>(
      rangeFilter || "d"
    );
    const [reloadingState, setReloadingState] = useState(reloading);

    const canCloseRef = useRef(true);
    const [editing, setEditing] = useState(false);
    const [editDocId, setEditDocId] = useState<string>();
    const [editDoc, setEditDoc] = useState<ProjectDocument>();
    const [editDialogOpen, setEditDialogOpen] = useState<boolean>();

    const openedWithQueryRef = useRef(false);

    const router = useRouter();

    const [navigationState, navigationDispatch] = useContext(NavigationContext);
    const transitioning = navigationState?.transitioning;

    const recentPitchDocs = my_recent_pitched_projects;

    const validPitchDocsState = useMemo(() => {
      if (!loadedPitchDocs) {
        return loadedPitchDocs;
      }
      const docs: { [key: string]: ProjectDocument } = {
        ...recentPitchDocs,
        ...loadedPitchDocs,
        ...recentPitchDocs,
      };
      const result: { [id: string]: ProjectDocument } = {};
      Object.entries(docs)
        .sort(([, aDoc], [, bDoc]) => {
          return getTime(bDoc?._createdAt) - getTime(aDoc?._createdAt);
        })
        .sort(([, aDoc], [, bDoc]) => {
          return sort === "new"
            ? getTime(bDoc?._createdAt) - getTime(aDoc?._createdAt)
            : sort === "rank"
            ? getValue(bDoc?.rank) - getValue(aDoc?.rank)
            : sort === "rating"
            ? getValue(bDoc?.rating) - getValue(aDoc?.rating)
            : 0;
        })
        .forEach(([key, doc]) => {
          if (
            (!typeFilterState ||
              typeFilterState === "all" ||
              typeFilterState === doc?.projectType) &&
            (!creator || creator === doc?._createdBy) &&
            (nsfwVisible === undefined ||
              nsfwVisible ||
              !doc?.nsfw ||
              doc?._createdBy === uid ||
              recentPitchDocs[key])
          ) {
            result[key] = doc;
          }
        });
      return result;
    }, [
      loadedPitchDocs,
      recentPitchDocs,
      sort,
      typeFilterState,
      creator,
      nsfwVisible,
      uid,
    ]);

    const handleShowLoadingPlaceholder = useCallback(async () => {
      if (contentElRef.current) {
        contentElRef.current.style.overflow = "hidden";
      }
      if (listElRef.current) {
        listElRef.current.style.visibility = "hidden";
        listElRef.current.style.pointerEvents = "none";
      }
      if (loadingElRef.current) {
        loadingElRef.current.classList.add("animate");
        loadingElRef.current.style.visibility = "visible";
      }
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      setReloadingState(true);
    }, [contentElRef, listElRef, loadingElRef]);

    const handleHideLoadingPlaceholder = useCallback(async () => {
      if (loadingElRef.current) {
        loadingElRef.current.classList.remove("animate");
      }
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
      loadedPitchDocsRef.current = {};
      chunkMapRef.current = {};
      DataStoreCache.instance.clear(...Array.from(cacheKeys.current));
      setAllowReloadState(true);
    }, [handleShowLoadingPlaceholder, onReloading]);

    useEffect(() => {
      if (pitchDocs && loadedPitchDocsRef.current) {
        const newPitchDocs = {
          ...pitchDocs,
          ...loadedPitchDocsRef.current,
        };
        Object.entries(newPitchDocs).forEach(([id]) => {
          if (chunkMapRef.current[id] === undefined) {
            chunkMapRef.current[id] = lastLoadedChunkRef.current;
          }
        });
        loadedPitchDocsRef.current = newPitchDocs;
        setLoadedPitchDocs(loadedPitchDocsRef.current);
        setChunkMap(chunkMapRef.current);
      }
    }, [pitchDocs]);

    const handleLoadMore = useCallback(
      async (
        options: {
          sort: QuerySort;
          type?: ProjectType;
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
          ? await pitchSearchQuery(options, "pitched_projects")
          : await pitchFilterQuery(options, "pitched_projects");
        const cursor = cursorsByTagRef.current[chunkKey];
        const cursorQuery = cursor
          ? sortedPitchesQuery.startAfter(cursor).limit(limit)
          : sortedPitchesQuery.limit(limit);
        cacheKeys.current.add(cursorQuery.key);
        const snapshot = await cursorQuery.get<ProjectDocument>();

        if (loadingKeyRef.current !== currentLoadingKey) {
          return undefined;
        }

        const { docs } = snapshot;
        const cursorIndex = docs.length - 1;
        const newCursor = docs[cursorIndex] || null;
        const newDocs: { [id: string]: ProjectDocument } = {};
        docs.forEach((d) => {
          newDocs[d.id] = d.data();
        });

        if (loadingKeyRef.current !== currentLoadingKey) {
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
        typeFilter?: ProjectTypeFilter;
        rangeFilter?: DateRangeFilter;
        nsfwVisible?: boolean;
        followedTags?: string[];
        search?: string;
        creator?: string;
      }) => {
        const {
          tab,
          sort,
          typeFilter,
          rangeFilter,
          nsfwVisible,
          followedTags,
          search,
          creator,
        } = options;

        const currentLoadingKey = getLoadingKey(options);

        loadingKeyRef.current = currentLoadingKey;

        try {
          if (tab === "top") {
            const limit = LOAD_MORE_LIMIT;
            const options: {
              sort: "rank" | "rating" | "new";
              type: ProjectType;
              age: DateAge;
              nsfw: boolean;
              search?: string;
              creator?: string;
            } = {
              sort: "rating",
              type: typeFilter !== "all" ? typeFilter : undefined,
              age: rangeFilter !== "all" ? rangeFilter : undefined,
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
            const currentDocs = loadedPitchDocsRef.current || {};
            const oldCount = Object.keys(currentDocs).length;
            const newPitchDocs = {
              ...currentDocs,
              ...pitchDocsByTagRef.current[""],
            };
            Object.entries(newPitchDocs).forEach(([id]) => {
              if (chunkMapRef.current[id] === undefined) {
                chunkMapRef.current[id] = lastLoadedChunkRef.current;
              }
            });
            loadedPitchDocsRef.current = newPitchDocs;
            const newCount = Object.keys(loadedPitchDocsRef.current).length;
            noMoreRef.current = oldCount > 0 && newCount === oldCount;
            setLoadedPitchDocs(loadedPitchDocsRef.current);
            setChunkMap(chunkMapRef.current);
            setNoMore(noMoreRef.current);
          } else if (tab === "following") {
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
              type: ProjectType;
              nsfw: boolean;
              search?: string;
              creator?: string;
            } = {
              sort,
              type: typeFilter !== "all" ? typeFilter : undefined,
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
                if (!loadedPitchDocsRef.current?.[id]) {
                  newDocs[id] = pitch;
                }
              });
            });

            const currentDocs = loadedPitchDocsRef.current || {};
            const oldCount = Object.keys(currentDocs).length;
            const newPitchDocs = {
              ...currentDocs,
              ...newDocs,
            };
            Object.entries(newPitchDocs).forEach(([id]) => {
              if (chunkMapRef.current[id] === undefined) {
                chunkMapRef.current[id] = lastLoadedChunkRef.current;
              }
            });
            loadedPitchDocsRef.current = newPitchDocs;
            const newCount = Object.keys(loadedPitchDocsRef.current).length;
            noMoreRef.current = oldCount > 0 && newCount === oldCount;
            setLoadedPitchDocs(loadedPitchDocsRef.current);
            setChunkMap(chunkMapRef.current);
            setNoMore(noMoreRef.current);
          } else {
            const limit = LOAD_MORE_LIMIT;
            const options: {
              sort: "rank" | "rating" | "new";
              type: ProjectType;
              nsfw: boolean;
              search?: string;
              creator?: string;
            } = {
              sort,
              type: typeFilter !== "all" ? typeFilter : undefined,
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
            const currentDocs = loadedPitchDocsRef.current || {};
            const oldCount = Object.keys(currentDocs).length;
            const newPitchDocs = {
              ...currentDocs,
              ...pitchDocsByTagRef.current[""],
            };
            Object.entries(newPitchDocs).forEach(([id]) => {
              if (chunkMapRef.current[id] === undefined) {
                chunkMapRef.current[id] = lastLoadedChunkRef.current;
              }
            });
            loadedPitchDocsRef.current = newPitchDocs;
            const newCount = Object.keys(loadedPitchDocsRef.current).length;
            noMoreRef.current = oldCount > 0 && newCount === oldCount;
            setLoadedPitchDocs(loadedPitchDocsRef.current);
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
        loadedPitchDocsRef.current &&
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
          typeFilter: typeFilterState,
          nsfwVisible,
          rangeFilter: rangeFilterState,
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
      typeFilterState,
      nsfwVisible,
      rangeFilterState,
      followedTags,
      search,
      creator,
    ]);

    const handleRefresh = useCallback(async (): Promise<void> => {
      window.scrollTo({ top: 0 });
      cursorsByTagRef.current = {};
      pitchDocsByTagRef.current = {};
      loadedPitchDocsRef.current = {};
      chunkMapRef.current = {};
      DataStoreCache.instance.clear(...Array.from(cacheKeys.current));
      await handleLoadTab({
        tab: tabState,
        sort,
        typeFilter: typeFilterState,
        nsfwVisible,
        rangeFilter: rangeFilterState,
        followedTags,
        search,
        creator,
      });
    }, [
      handleLoadTab,
      tabState,
      sort,
      typeFilterState,
      nsfwVisible,
      rangeFilterState,
      followedTags,
      search,
      creator,
    ]);

    const handleReload = useCallback(async () => {
      if (loadedPitchDocsRef.current) {
        await handleShowLoadingPlaceholder();
        if (onReloading) {
          onReloading(true);
        }
      }
      cursorsByTagRef.current = {};
      pitchDocsByTagRef.current = {};
      loadedPitchDocsRef.current = {};
      chunkMapRef.current = {};
      noMoreRef.current = false;
      await handleLoadTab({
        nsfwVisible,
        followedTags,
        tab: tabState,
        sort,
        typeFilter: typeFilterState,
        rangeFilter: rangeFilterState,
        search,
        creator,
      });
    }, [
      creator,
      followedTags,
      typeFilterState,
      handleLoadTab,
      handleShowLoadingPlaceholder,
      nsfwVisible,
      onReloading,
      rangeFilterState,
      search,
      sort,
      tabState,
    ]);

    useEffect(() => {
      if (tab !== undefined) {
        setTabState(tab);
      }
    }, [tab]);

    useEffect(() => {
      if (type !== undefined) {
        setTypeFilterState(type);
      }
    }, [type]);

    useEffect(() => {
      if (rangeFilter !== undefined) {
        setRangeFilterState(rangeFilter);
      }
    }, [rangeFilter]);

    const needsInitialLoad = !pitchDocs;

    useEffect(() => {
      navigationDispatch(navigationSetTransitioning(false));
      if ([nsfwVisible, followedTags].some((x) => x === undefined)) {
        return;
      }
      if (!needsInitialLoad && !allowReloadState) {
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
      needsInitialLoad,
    ]);

    const handleChangeTypeFilter = useCallback(
      async (e: React.MouseEvent, value: ProjectType): Promise<void> => {
        await handleAllowReload();
        setTypeFilterState(value);
        if (onTypeFilter) {
          onTypeFilter(e, value);
        }
      },
      [handleAllowReload, onTypeFilter]
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
        setRangeFilterState(value);
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
        if (!contributionId && loadedPitchDocsRef.current[pitchId]) {
          const kudos = kudoed
            ? (loadedPitchDocsRef.current[pitchId]?.kudos || 0) + 1
            : (loadedPitchDocsRef.current[pitchId]?.kudos || 0) - 1;
          const currentDoc = loadedPitchDocsRef.current[pitchId];
          const newDoc = { ...currentDoc, kudos };
          loadedPitchDocsRef.current[pitchId] = newDoc;
          DataStoreCache.instance.override(pitchId, { kudos });
          setLoadedPitchDocs({ ...loadedPitchDocsRef.current });
        }
      },
      []
    );

    const handleChangeScore = useCallback(
      (e: React.MouseEvent, score: number, pitchId: string): void => {
        const currentDoc = loadedPitchDocsRef.current[pitchId];
        const newDoc = { ...currentDoc, score };
        loadedPitchDocsRef.current[pitchId] = newDoc;
        DataStoreCache.instance.override(pitchId, { score });
        setLoadedPitchDocs({ ...loadedPitchDocsRef.current });
      },
      []
    );

    const handleDeletePitch = useCallback(
      async (e: React.MouseEvent, pitchId: string): Promise<void> => {
        setReloadingState(true);
        confirmDialogDispatch(confirmDialogClose());
        // Wait a bit for dialog to close
        await new Promise((resolve) => setTimeout(resolve, 1));
        await router.replace(`/p/${pitchId}`);
      },
      [confirmDialogDispatch, router]
    );

    const handleCreateContribution = useCallback(
      async (
        e: React.MouseEvent<Element, MouseEvent>,
        pitchId: string
      ): Promise<void> => {
        const contributions =
          (loadedPitchDocsRef.current[pitchId].contributions || 0) + 1;
        const currentDoc = loadedPitchDocsRef.current[pitchId];
        const newDoc = { ...currentDoc, contributions };
        loadedPitchDocsRef.current[pitchId] = newDoc;
        DataStoreCache.instance.override(pitchId, { contributions });
        setLoadedPitchDocs({ ...loadedPitchDocsRef.current });
      },
      []
    );

    const handleDeleteContribution = useCallback(
      async (
        e: React.MouseEvent<Element, MouseEvent>,
        pitchId: string,
        contributionId: string
      ): Promise<void> => {
        const contributions =
          (loadedPitchDocsRef.current[pitchId].contributions || 0) - 1;
        const currentDoc = loadedPitchDocsRef.current[pitchId];
        const newDoc = { ...currentDoc, contributions };
        loadedPitchDocsRef.current[pitchId] = newDoc;
        DataStoreCache.instance.override(pitchId, { contributions });
        setLoadedPitchDocs({ ...loadedPitchDocsRef.current });
        confirmDialogDispatch(confirmDialogClose());
        // Wait a bit for dialog to close
        await new Promise((resolve) => setTimeout(resolve, 1));
        await router.replace(`/p/${pitchId}/c/${contributionId}`);
      },
      [confirmDialogDispatch, router]
    );

    const handleStartCreation = useCallback(
      async (type: ProjectType) => {
        canCloseRef.current = true;
        const Auth = (await import("../../impower-auth/classes/auth")).default;
        const createProjectDocument = (
          await import("../../impower-data-store/utils/createProjectDocument")
        ).default;
        const newGame = createProjectDocument({
          _createdBy: uid,
          _author: Auth.instance.author,
          name: "",
          slug: "",
          owners: [uid],
          pitched: true,
          pitchedAt: new Timestamp(),
          projectType: type,
        });
        setEditing(false);
        setEditDocId(undefined);
        setEditDoc(newGame);
        setEditDialogOpen(true);
      },
      [uid]
    );

    const createDocExists = Boolean(editDoc);

    const handleEndCreation = useCallback(
      (
        reason:
          | "backdropClick"
          | "escapeKeyDown"
          | "closeButtonClick"
          | "submitted"
          | "browserBack",
        onClose?: () => void
      ) => {
        if (!canCloseRef.current) {
          return;
        }
        if (reason === "submitted") {
          return;
        }
        const onDiscardChanges = (): void => {
          setEditDialogOpen(false);
          if (onClose) {
            onClose();
          }
        };
        const onKeepEditing = (): void => {
          if (reason === "browserBack") {
            window.setTimeout(() => {
              // eslint-disable-next-line @typescript-eslint/no-use-before-define
              openEditDialog("create");
            }, 200);
          }
        };
        const hasUnsavedChanges =
          editDoc &&
          (editDoc.name !== "" ||
            editDoc.summary !== "" ||
            JSON.stringify(editDoc.tags) !== JSON.stringify([]));
        if (hasUnsavedChanges) {
          confirmDialogDispatch(
            confirmDialogNavOpen(
              discardInfo.title,
              undefined,
              discardInfo.agreeLabel,
              onDiscardChanges,
              discardInfo.disagreeLabel,
              onKeepEditing
            )
          );
        } else {
          onDiscardChanges();
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [confirmDialogDispatch, editDoc]
    );

    const handleBrowserNavigation = useCallback(
      (
        currState: Record<string, string>,
        prevState?: Record<string, string>
      ) => {
        if (currState?.e !== prevState?.e) {
          if (currState?.e === "create") {
            if (!createDocExists) {
              handleStartCreation(
                typeFilterState !== "all" ? typeFilterState : "game"
              );
            }
          } else {
            handleEndCreation("browserBack");
          }
        }
      },
      [createDocExists, handleEndCreation, handleStartCreation, typeFilterState]
    );
    const [openEditDialog, closeEditDialog] = useDialogNavigation(
      "e",
      handleBrowserNavigation
    );

    const handleOpenEditDialog = useCallback(
      async (e: React.MouseEvent, id: string): Promise<void> => {
        canCloseRef.current = true;
        setEditing(true);
        setEditDocId(id);
        setEditDoc({
          ...loadedPitchDocsRef.current[id],
          repitchedAt: new Timestamp(),
        });
        setEditDialogOpen(true);
        openEditDialog("create");
      },
      [openEditDialog]
    );

    const handleOpenCreateDialog = useCallback(
      (e: React.MouseEvent, type: ProjectType): void => {
        handleStartCreation(type);
        openEditDialog("create");
      },
      [handleStartCreation, openEditDialog]
    );

    const handleCloseCreateDialog = useCallback(
      (
        e: React.MouseEvent,
        reason:
          | "backdropClick"
          | "escapeKeyDown"
          | "closeButtonClick"
          | "submitted"
      ): void => {
        if (openedWithQueryRef.current) {
          handleEndCreation(reason, () => {
            const newState = { ...(window.history.state || {}) };
            delete newState.query;
            const link = search
              ? `/pitch/${type}/${escapeURI(search)}`
              : `/pitch/${type}`;
            window.history.replaceState(newState, "", link);
            router.replace(link);
          });
        } else {
          handleEndCreation(reason, closeEditDialog);
        }
      },
      [closeEditDialog, handleEndCreation, router, search, type]
    );

    const handleSubmit = useCallback(async () => {
      canCloseRef.current = false;
    }, []);

    const handleSubmitted = useCallback(
      async (id: string, doc: ProjectDocument, successful: boolean) => {
        if (successful) {
          await router.replace(`/p/${id}`);
        }
        canCloseRef.current = true;
      },
      [router]
    );

    useEffect(() => {
      if (router.isReady) {
        if (window.location.search?.toLowerCase() === "?e=create") {
          openedWithQueryRef.current = true;
          if (!createDocExists) {
            handleStartCreation(
              typeFilterState !== "all" ? typeFilterState : "game"
            );
          }
        }
      }
    }, [createDocExists, handleStartCreation, router, typeFilterState]);

    const pitchCount = useMemo(
      () =>
        validPitchDocsState
          ? Object.keys(validPitchDocsState)?.length
          : (validPitchDocsState as null | undefined),
      [validPitchDocsState]
    );

    const loading =
      transitioning ||
      nsfwVisible === undefined ||
      !validPitchDocsState ||
      reloadingState;

    const listStyle: React.CSSProperties = useMemo(
      () => ({
        visibility: loading ? "hidden" : undefined,
        pointerEvents: loading ? "none" : undefined,
      }),
      [loading]
    );
    const listContentStyle: React.CSSProperties = useMemo(
      () => ({
        overflow: loading ? "hidden" : undefined,
      }),
      [loading]
    );
    const emptyStyle: React.CSSProperties = useMemo(
      () => ({
        visibility: pitchCount === 0 ? "visible" : "hidden",
      }),
      [pitchCount]
    );
    const loadingStyle: React.CSSProperties = useMemo(
      () => ({
        visibility: loading ? "visible" : "hidden",
      }),
      [loading]
    );

    const addLabel =
      typeFilterState === "all"
        ? `create a pitch`
        : typeFilterState === "music"
        ? `pitch ${typeFilterState}`
        : `pitch a ${typeFilterState}`;

    return (
      <>
        <StyledListArea style={style}>
          <StyledContent style={contentStyle}>
            <StyledPitchList ref={listElRef} style={listStyle}>
              <StyledListContent ref={contentElRef} style={listContentStyle}>
                <PitchListQueryHeader
                  typeFilter={typeFilterState}
                  rangeFilter={rangeFilterState}
                  sort={sort}
                  sortOptions={sortOptions}
                  onTypeFilter={handleChangeTypeFilter}
                  onRangeFilter={
                    tabState === "top" ? handleChangeRangeFilter : undefined
                  }
                  onSort={
                    tabState === "top" ? undefined : handleChangeSortFilter
                  }
                  onFollowMore={
                    tabState === "following" ? handleFollowMore : undefined
                  }
                  style={queryHeaderStyle}
                />
                <PitchListContent
                  config={config}
                  icons={icons}
                  pitchDocs={validPitchDocsState}
                  chunkMap={chunkMap}
                  lastLoadedChunk={lastLoadedChunk}
                  compact={compact}
                  offlinePlaceholder={offlinePlaceholder}
                  dontFade={!initialLoadComplete}
                  onChangeScore={handleChangeScore}
                  onEdit={handleOpenEditDialog}
                  onDelete={handleDeletePitch}
                  onKudo={handleKudo}
                  onCreateContribution={handleCreateContribution}
                  onDeleteContribution={handleDeleteContribution}
                />
                {((emptyPlaceholder && pitchCount > 0) ||
                  (!emptyPlaceholder && validPitchDocsState)) && (
                  <PitchLoadingProgress
                    loadingMore={
                      Boolean(validPitchDocsState) && Boolean(loadingMore)
                    }
                    noMore={
                      emptyPlaceholder
                        ? validPitchDocsState && pitchCount > 0 && noMore
                        : validPitchDocsState && (noMore || pitchCount === 0)
                    }
                    noMoreLabel={
                      validPitchDocsState &&
                      !emptyPlaceholder &&
                      pitchCount === 0
                        ? emptyLabel
                        : `That's all for now!`
                    }
                    noMoreSubtitle={
                      validPitchDocsState &&
                      !emptyPlaceholder &&
                      pitchCount === 0
                        ? emptySubtitle
                        : undefined
                    }
                    refreshLabel={
                      !emptyPlaceholder && pitchCount === 0
                        ? undefined
                        : `Refresh?`
                    }
                    onScrolledToEnd={handleScrolledToEnd}
                    onRefresh={handleRefresh}
                  />
                )}
                {children}
                {loadIcons && <TagIconLoader />}
              </StyledListContent>
            </StyledPitchList>
            <StyledOverlayArea>
              <StyledForceOverflow />
              {reloadingState !== undefined && (
                <StyledEmptyArea style={emptyStyle}>
                  {emptyPlaceholder}
                </StyledEmptyArea>
              )}
              <StyledLoadingArea ref={loadingElRef} style={loadingStyle}>
                {loadingPlaceholder}
              </StyledLoadingArea>
            </StyledOverlayArea>
          </StyledContent>
        </StyledListArea>
        {!hideAddToolbar && (
          <AddPitchToolbar
            type={typeFilterState !== "all" ? typeFilterState : undefined}
            label={addLabel}
            toolbarRef={toolbarElRef}
            onAdd={handleOpenCreateDialog}
          />
        )}
        {editDialogOpen !== undefined && (
          <CreatePitchDialog
            config={config}
            icons={icons}
            open={editDialogOpen}
            type={typeFilterState !== "all" ? typeFilterState : undefined}
            docId={editDocId}
            doc={editDoc}
            onClose={handleCloseCreateDialog}
            onChange={setEditDoc}
            onSubmit={handleSubmit}
            onSubmitted={handleSubmitted}
            editing={editing}
          />
        )}
      </>
    );
  }
);

export default PitchList;
