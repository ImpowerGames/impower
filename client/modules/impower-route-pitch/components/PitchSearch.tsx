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
import {
  DateAge,
  DocumentSnapshot,
  getSearchedTerms,
  PitchGoal,
  ProjectDocument,
  useDataStoreConnectionStatus,
} from "../../impower-data-store";
import DataStoreCache from "../../impower-data-store/classes/dataStoreCache";
import { SvgData } from "../../impower-icon";
import {
  NavigationContext,
  navigationSetSearchbar,
} from "../../impower-navigation";
import { BetaBanner } from "../../impower-route";
import { useRouter } from "../../impower-router";
import { UserContext, userDoFollow, userUndoFollow } from "../../impower-user";
import { DateRangeFilter } from "../types/dateRangeFilter";
import { GoalFilter } from "../types/goalFilter";
import { TrendingFilter } from "../types/trendingFilter";
import FilterHeader from "./FilterHeader";
import GoalFilterButton from "./GoalFilterButton";
import PitchList from "./PitchList";
import PitchLoadingProgress from "./PitchLoadingProgress";
import PitchSearchToolbar from "./PitchSearchToolbar";
import TrendingFilterButton from "./TrendingFilterButton";

const LOAD_MORE_LIMIT = 10;

const EmptyPitchList = dynamic(() => import("./EmptyPitchList"), {
  ssr: false,
});

const AnimatedWarningMascotIllustration = dynamic(
  () =>
    import(
      "../../impower-route/components/illustrations/AnimatedWarningMascotIllustration"
    ),
  { ssr: false }
);

const AnimatedDefaultMascot = dynamic(
  () =>
    import(
      "../../impower-route/components/illustrations/AnimatedDefaultMascot"
    ),
  { ssr: false }
);

const TagIconLoader = dynamic(
  () => import("../../impower-route/components/elements/TagIconLoader"),
  { ssr: false }
);

const StyledPitchSearch = styled.div`
  height: 100vh;
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 0;
  backface-visibility: hidden;
`;

const StyledApp = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
  padding-top: calc(
    ${(props): string => props.theme.minHeight.navigationBar} +
      ${(props): string => props.theme.minHeight.navigationTabs}
  );
`;

const StyledListArea = styled.div`
  flex: 1;
  min-width: 0;
  background-color: ${(props): string => props.theme.colors.lightForeground};
  align-items: center;
  display: flex;
  flex-direction: column;
`;

const StyledContainer = styled.div`
  width: 100%;
  margin: auto;
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledSpacer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const getLoadingKey = (options: {
  search: string;
  trendingFilter: TrendingFilter;
  goalFilter?: GoalFilter;
  nsfwVisible?: boolean;
}): string =>
  Object.keys(options)
    .sort()
    .map((key) => options[key])
    .join(",");

interface PitchSearchPageProps {
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  pitchDocs?: { [id: string]: ProjectDocument };
  search: string;
  style?: React.CSSProperties;
}

const PitchSearch = React.memo((props: PitchSearchPageProps): JSX.Element => {
  const pitchedCollection = "pitched_games";

  const { config, icons, search, pitchDocs, style } = props;

  const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
  const [userState, userDispatch] = useContext(UserContext);
  const { settings, my_follows, my_recent_pitched_projects } = userState;
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
  const [goalFilter, setGoalFilter] = useState<GoalFilter>("All");
  const [trendingFilter, setTrendingFilter] = useState<TrendingFilter>("Hot");

  const lastLoadedChunkRef = useRef(0);
  const [lastLoadedChunk, setLastLoadedChunk] = useState(
    lastLoadedChunkRef.current
  );

  const pitchDocsRef = useRef<{ [id: string]: ProjectDocument }>(pitchDocs);
  const [pitchDocsState, setPitchDocsState] = useState<{
    [id: string]: ProjectDocument;
  }>(pitchDocsRef.current);

  const cursorsRef = useRef<DocumentSnapshot<ProjectDocument>>();
  const loadingKey = useRef<string>();
  const cacheKeys = useRef<Set<string>>(new Set());
  const [allowReload, setAllowReload] = useState(false);

  const router = useRouter();
  const { search: querySearch } = router.query;

  const activeSearch = typeof querySearch === "string" ? querySearch : search;

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
        if (chunkMapRef.current[id] === undefined) {
          chunkMapRef.current[id] = lastLoadedChunkRef.current;
        }
      });
      pitchDocsRef.current = newPitchDocs;
      setPitchDocsState(pitchDocsRef.current);
      setChunkMap(chunkMapRef.current);
    }
  }, [recentPitchDocs]);

  const filterLabel =
    !goalFilter || goalFilter === "All"
      ? `pitches`
      : `${goalFilter.toLowerCase()} pitches`;
  const searchLabel = useMemo(
    () =>
      activeSearch
        ? getSearchedTerms(activeSearch)
            .map((t) => `#${t}`)
            .join(" ")
        : undefined,
    [activeSearch]
  );
  const emptyLabelStyle: React.CSSProperties = useMemo(
    () => ({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
    }),
    []
  );
  const searchLabelStyle: React.CSSProperties = useMemo(
    () => ({ fontWeight: 700 }),
    []
  );
  const searchedTerms = useMemo(
    () => getSearchedTerms(activeSearch),
    [activeSearch]
  );
  const isFollowingAllTags = useMemo(
    () =>
      searchedTerms !== undefined && followedTags !== undefined
        ? searchedTerms?.every((t) => followedTags?.includes(t))
        : undefined,
    [followedTags, searchedTerms]
  );

  const searchTargets: ["tags"] = useMemo(() => ["tags"], []);

  const handleLoadMore = useCallback(
    async (
      options: {
        sort: "rank" | "new";
        goal?: PitchGoal;
        age?: DateAge;
        nsfw?: boolean;
        tags?: string[];
        search: string;
        searchTargets?: ("tags" | "name" | "summary")[];
      },
      currentLoadingKey: string,
      limit: number
    ): Promise<number> => {
      const pitchSearchQuery = (
        await import("../../impower-data-store/utils/pitchSearchQuery")
      ).default;
      const sortedPitchesQuery = await pitchSearchQuery(
        options,
        pitchedCollection
      );
      const cursor = cursorsRef.current;
      const cursorQuery = cursor
        ? sortedPitchesQuery.startAfter(cursor).limit(limit)
        : sortedPitchesQuery.limit(limit);
      cacheKeys.current.add(cursorQuery.key);
      const snapshot = await cursorQuery.get<ProjectDocument>();

      if (loadingKey.current !== currentLoadingKey) {
        throw new Error("Pitch Loading Was Interrupted");
      }

      const { docs } = snapshot;
      const cursorIndex = docs.length - 1;
      const newCursor = docs[cursorIndex] || null;
      const newDocs: { [id: string]: ProjectDocument } = {};
      docs.forEach((d) => {
        newDocs[d.id] = d.data();
      });

      if (loadingKey.current !== currentLoadingKey) {
        throw new Error("Pitch Loading Was Interrupted");
      }

      cursorsRef.current = newCursor;

      const currentDocs = pitchDocsRef.current || {};
      const terms = getSearchedTerms(options?.search);
      const matchingRecentPitchDocs: { [id: string]: ProjectDocument } = {};
      const { goal } = options;
      Object.entries(recentPitchDocsRef.current || {}).forEach(([id, doc]) => {
        if (
          (!goal || goal === doc?.pitchGoal) &&
          terms.every((t) => doc?.tags?.includes(t))
        ) {
          matchingRecentPitchDocs[id] = doc;
        }
      });
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

      return docs.length;
    },
    []
  );

  const handleLoadSearch = useCallback(
    async (options: {
      trendingFilter: TrendingFilter;
      goalFilter?: GoalFilter;
      rangeFilter?: DateRangeFilter;
      nsfwVisible?: boolean;
      search: string;
      searchTargets?: ("tags" | "name" | "summary")[];
    }): Promise<number> => {
      const { trendingFilter, goalFilter, nsfwVisible, search, searchTargets } =
        options;

      const currentLoadingKey = getLoadingKey(options);

      loadingKey.current = currentLoadingKey;

      try {
        const limit = LOAD_MORE_LIMIT;
        const loadedCount = await handleLoadMore(
          {
            sort: trendingFilter === "New" ? "new" : "rank",
            goal: goalFilter !== "All" ? goalFilter : undefined,
            nsfw: nsfwVisible,
            search,
            searchTargets,
          },
          currentLoadingKey,
          limit
        );

        noMoreRef.current = loadedCount < limit;
        setNoMore(noMoreRef.current);
        setPitchDocsState(pitchDocsRef.current);
        setChunkMap(chunkMapRef.current);
        navigationDispatch(navigationSetSearchbar({ searching: false }));
        return loadedCount;
      } catch (e) {
        const logInfo = (await import("../../impower-logger/utils/logInfo"))
          .default;
        logInfo("Route", e.message);
      }
      navigationDispatch(navigationSetSearchbar({ searching: false }));
      return 0;
    },
    [handleLoadMore, navigationDispatch]
  );

  const handleScrolledToEnd = useCallback(async (): Promise<void> => {
    if (pitchDocsRef.current && !noMoreRef.current && !loadingMoreRef.current) {
      if (activeSearch) {
        loadingMoreRef.current = true;
        setLoadingMore(loadingMoreRef.current);
        setLoadIcons(true);
        lastLoadedChunkRef.current += 1;
        setLastLoadedChunk(lastLoadedChunkRef.current);
        await handleLoadSearch({
          trendingFilter,
          goalFilter,
          nsfwVisible,
          search: activeSearch,
          searchTargets,
        });
        loadingMoreRef.current = false;
        setLoadingMore(loadingMoreRef.current);
      }
    }
  }, [
    goalFilter,
    handleLoadSearch,
    nsfwVisible,
    activeSearch,
    searchTargets,
    trendingFilter,
  ]);

  const handleRefresh = useCallback(async (): Promise<void> => {
    if (activeSearch) {
      window.scrollTo({ top: 0 });
      cursorsRef.current = null;
      pitchDocsRef.current = {};
      chunkMapRef.current = {};
      lastLoadedChunkRef.current = 0;
      const DataStoreCache = (
        await import("../../impower-data-store/classes/dataStoreCache")
      ).default;
      DataStoreCache.instance.clear(...Array.from(cacheKeys.current));
      await handleLoadSearch({
        trendingFilter,
        goalFilter,
        nsfwVisible,
        search: activeSearch,
        searchTargets,
      });
    }
  }, [
    activeSearch,
    goalFilter,
    handleLoadSearch,
    nsfwVisible,
    searchTargets,
    trendingFilter,
  ]);

  const handleDeletePitch = useCallback(async (): Promise<void> => {
    confirmDialogDispatch(confirmDialogClose());
  }, [confirmDialogDispatch]);

  const handleChangeGoalFilter = useCallback(
    (e: React.MouseEvent, value: GoalFilter): void => {
      setAllowReload(true);
      setGoalFilter(value);
    },
    []
  );

  const handleChangeTrendingFilter = useCallback(
    (e: React.MouseEvent, value: TrendingFilter): void => {
      setAllowReload(true);
      setTrendingFilter(value);
    },
    []
  );

  useEffect(() => {
    if (pitchDocsRef.current && !allowReload) {
      navigationDispatch(navigationSetSearchbar({ searching: false }));
      return;
    }
    cursorsRef.current = null;
    pitchDocsRef.current = {};
    chunkMapRef.current = {};
    loadingMoreRef.current = false;
    noMoreRef.current = false;
    lastLoadedChunkRef.current = 0;
    setPitchDocsState(undefined);
    setNoMore(noMoreRef.current);
    handleLoadSearch({
      trendingFilter,
      goalFilter,
      nsfwVisible,
      search: activeSearch,
      searchTargets,
    });
  }, [
    allowReload,
    goalFilter,
    handleLoadSearch,
    nsfwVisible,
    activeSearch,
    searchTargets,
    trendingFilter,
    navigationDispatch,
  ]);

  const handleChangeFollowing = useCallback(
    async (e: React.MouseEvent, followed: boolean): Promise<void> => {
      let newFollowingTags = followedTags ? [...followedTags] : [];
      searchedTerms.forEach((tag) => {
        if (followed) {
          if (!newFollowingTags.includes(tag)) {
            newFollowingTags = [...newFollowingTags, tag];
            userDispatch(userDoFollow("tags", tag));
          }
        } else if (newFollowingTags.includes(tag)) {
          newFollowingTags = newFollowingTags.filter((t) => t !== tag);
          userDispatch(userUndoFollow("tags", tag));
        }
      });
    },
    [followedTags, searchedTerms, userDispatch]
  );

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
    (e: React.MouseEvent, score: number, id: string): void => {
      const currentDoc = pitchDocsRef.current[id];
      const newDoc = { ...currentDoc, score };
      pitchDocsRef.current[id] = newDoc;
      DataStoreCache.instance.override(id, { score });
      setPitchDocsState({ ...pitchDocsRef.current });
    },
    []
  );

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

  const emptyImage = useMemo(() => <AnimatedDefaultMascot />, []);

  if (pitchDocsState === undefined && isOnline === false) {
    return (
      <AnimatedWarningMascotIllustration
        message={`Looks like you're offline`}
      />
    );
  }

  return (
    <StyledPitchSearch style={style}>
      <StyledApp>
        <PitchSearchToolbar
          search={searching ? undefined : activeSearch}
          following={searching ? undefined : isFollowingAllTags}
          onFollow={searching ? undefined : handleChangeFollowing}
        />
        <BetaBanner />
        <StyledListArea>
          <StyledContainer>
            {searching ? (
              <EmptyPitchList loading loadingMessage={`Searching...`} />
            ) : (
              <>
                <FilterHeader id="pitch-filter-header">
                  <GoalFilterButton
                    target="pitch"
                    activeFilterValue={goalFilter}
                    onOption={handleChangeGoalFilter}
                  />
                  <StyledSpacer />
                  <TrendingFilterButton
                    target="pitch"
                    activeFilterValue={trendingFilter}
                    onOption={handleChangeTrendingFilter}
                  />
                </FilterHeader>
                <PitchList
                  config={config}
                  icons={icons}
                  pitchDocs={pitchDocsState}
                  chunkMap={chunkMap}
                  lastLoadedChunk={lastLoadedChunk}
                  emptyImage={emptyImage}
                  filterLabel={filterLabel}
                  searchLabel={searchLabel}
                  emptyLabelStyle={emptyLabelStyle}
                  searchLabelStyle={searchLabelStyle}
                  onKudo={handleKudo}
                  onChangeScore={handleChangeScore}
                  onCreateContribution={handleCreateContribution}
                  onDeleteContribution={handleDeleteContribution}
                  onDelete={handleDeletePitch}
                />
                <PitchLoadingProgress
                  loadingMore={pitchDocsState && loadingMore}
                  noMore={
                    pitchDocsState &&
                    Object.keys(pitchDocsState)?.length > 0 &&
                    noMore
                  }
                  noMoreLabel={`That's all for now!`}
                  refreshLabel={`Refresh?`}
                  onScrolledToEnd={handleScrolledToEnd}
                  onRefresh={handleRefresh}
                />
              </>
            )}
            {loadIcons && <TagIconLoader />}
          </StyledContainer>
        </StyledListArea>
      </StyledApp>
    </StyledPitchSearch>
  );
});

export default PitchSearch;
