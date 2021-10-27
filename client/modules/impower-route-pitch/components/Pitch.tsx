import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
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
} from "../../impower-data-store";
import DataStoreCache from "../../impower-data-store/classes/dataStoreCache";
import { SvgData } from "../../impower-icon";
import { NavigationContext } from "../../impower-navigation";
import { BetaBanner } from "../../impower-route";
import { UserContext } from "../../impower-user";
import { DateRangeFilter } from "../types/dateRangeFilter";
import { GoalFilter } from "../types/goalFilter";
import { TrendingFilter } from "../types/trendingFilter";
import FilterHeader from "./FilterHeader";
import GoalFilterButton from "./GoalFilterButton";
import PitchList from "./PitchList";
import PitchLoadingProgress from "./PitchLoadingProgress";
import PitchTabsToolbar, { PitchToolbarTab } from "./PitchTabsToolbar";
import TrendingFilterButton from "./TrendingFilterButton";

const LOAD_MORE_LIMIT = 10;

const AnimatedHappyMascot = dynamic(
  () =>
    import("../../impower-route/components/illustrations/AnimatedHappyMascot"),
  {
    ssr: false,
  }
);

const PitchFollowTags = dynamic(() => import("./PitchFollowTags"), {
  ssr: false,
});

const RangeFilterButton = dynamic(() => import("./RangeFilterButton"), {
  ssr: false,
});

const TagIconLoader = dynamic(
  () => import("../../impower-route/components/elements/TagIconLoader"),
  { ssr: false }
);

const EmptyPitchList = dynamic(() => import("./EmptyPitchList"), {
  ssr: false,
});

const StyledPitch = styled.div`
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

const StyledButton = styled(Button)`
  pointer-events: auto;
  padding: ${(props): string => props.theme.spacing(0, 1)};
`;

const StyledCenterArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  margin-top: ${(props): string => props.theme.spacing(1)};
`;

const StyledSpacer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const getLoadingKey = (options: {
  activeTab: PitchToolbarTab;
  trendingFilter: TrendingFilter;
  goalFilter?: GoalFilter;
  rangeFilter?: DateRangeFilter;
  nsfwVisible?: boolean;
}): string =>
  Object.keys(options)
    .sort()
    .map((key) => options[key])
    .join(",");

interface PitchProps {
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  pitchDocs?: { [id: string]: ProjectDocument };
  style?: React.CSSProperties;
}

const Pitch = React.memo((props: PitchProps): JSX.Element => {
  const pitchedCollection = "pitched_games";

  const { config, icons, pitchDocs, style } = props;

  const [navigationState] = useContext(NavigationContext);
  const searching = navigationState?.search?.searching;
  const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
  const [userState] = useContext(UserContext);
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

  const [loadingMore, setLoadingMore] = useState<boolean>();
  const [loadIcons, setLoadIcons] = useState(false);
  const loadingMoreRef = useRef<boolean>();
  const noMoreRef = useRef<boolean>(initialPitchIds.length === 0);
  const [noMore, setNoMore] = useState<boolean>(noMoreRef.current);
  const [shouldDisplayFollowingPitches, setShouldDisplayFollowingPitches] =
    useState<boolean>();
  const [activeTab, setActiveTab] = useState<PitchToolbarTab>("Trending");
  const [goalFilter, setGoalFilter] = useState<GoalFilter>("All");
  const [trendingFilter, setTrendingFilter] = useState<TrendingFilter>("Hot");
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

  const recentPitchDocs = my_recent_pitched_projects;
  const recentPitchDocsRef = useRef(recentPitchDocs);

  useEffect(() => {
    recentPitchDocsRef.current = recentPitchDocs || {};
    if (pitchDocsRef.current) {
      const newPitchDocs = {
        ...recentPitchDocsRef.current,
        ...pitchDocsRef.current,
        ...recentPitchDocsRef.current,
      };
      Object.entries(newPitchDocs || {}).forEach(([id, doc]) => {
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

  const handleLoadMore = useCallback(
    async (
      options: {
        sort: "rank" | "rating" | "new";
        goal?: PitchGoal;
        age?: DateAge;
        nsfw?: boolean;
        tags?: string[];
      },
      currentLoadingKey: string,
      limit: number
    ): Promise<number> => {
      const { tags } = options;

      const chunkKey = tags?.join("#") || "";

      const pitchFilterQuery = (
        await import("../../impower-data-store/utils/pitchFilterQuery")
      ).default;

      const sortedPitchesQuery = await pitchFilterQuery(
        options,
        pitchedCollection
      );
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
      activeTab: PitchToolbarTab;
      trendingFilter: TrendingFilter;
      goalFilter?: GoalFilter;
      rangeFilter?: DateRangeFilter;
      nsfwVisible?: boolean;
      followedTags?: string[];
    }) => {
      const {
        activeTab,
        trendingFilter,
        goalFilter,
        rangeFilter,
        nsfwVisible,
        followedTags,
      } = options;

      const currentLoadingKey = getLoadingKey(options);

      loadingKey.current = currentLoadingKey;

      try {
        if (activeTab === "Trending") {
          const limit = LOAD_MORE_LIMIT;
          const options: {
            sort: "rank" | "rating" | "new";
            goal: PitchGoal;
            nsfw: boolean;
          } = {
            sort: trendingFilter === "New" ? "new" : "rank",
            goal: goalFilter !== "All" ? goalFilter : undefined,
            nsfw: nsfwVisible,
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
              if (!goal || goal === doc?.pitchGoal) {
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
        } else if (activeTab === "Top") {
          const limit = LOAD_MORE_LIMIT;
          const options: {
            sort: "rank" | "rating" | "new";
            goal: PitchGoal;
            age: DateAge;
            nsfw: boolean;
          } = {
            sort: "rating",
            goal: goalFilter !== "All" ? goalFilter : undefined,
            age: rangeFilter !== "All" ? rangeFilter : undefined,
            nsfw: nsfwVisible,
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
              if (!goal || goal === doc?.pitchGoal) {
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
        } else if (activeTab === "Following") {
          if (followedTags?.length > 0) {
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
            } = {
              sort: trendingFilter === "New" ? "new" : "rank",
              goal: goalFilter !== "All" ? goalFilter : undefined,
              nsfw: nsfwVisible,
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
                  followedTags.some((t) => doc?.tags?.includes(t))
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
            pitchDocsRef.current = {};
            chunkMapRef.current = {};
            noMoreRef.current = true;
            setPitchDocsState(pitchDocsRef.current);
            setChunkMap(chunkMapRef.current);
            setNoMore(noMoreRef.current);
          }
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
        activeTab,
        trendingFilter,
        goalFilter,
        nsfwVisible,
        rangeFilter,
        followedTags,
      });
      loadingMoreRef.current = false;
      setLoadingMore(loadingMoreRef.current);
    }
  }, [
    activeTab,
    followedTags,
    goalFilter,
    handleLoadTab,
    nsfwVisible,
    rangeFilter,
    trendingFilter,
  ]);

  const handleRefresh = useCallback(async (): Promise<void> => {
    window.scrollTo({ top: 0 });
    cursorsByTagRef.current = {};
    pitchDocsByTagRef.current = {};
    pitchDocsRef.current = {};
    chunkMapRef.current = {};
    DataStoreCache.instance.clear(...Array.from(cacheKeys.current));
    await handleLoadTab({
      activeTab,
      trendingFilter,
      goalFilter,
      nsfwVisible,
      rangeFilter,
      followedTags,
    });
  }, [
    activeTab,
    followedTags,
    goalFilter,
    handleLoadTab,
    nsfwVisible,
    rangeFilter,
    trendingFilter,
  ]);

  useEffect(() => {
    if (
      [
        activeTab,
        trendingFilter,
        goalFilter,
        nsfwVisible,
        rangeFilter,
        followedTags,
      ].some((x) => x === undefined)
    ) {
      return;
    }
    if (pitchDocsRef.current && !allowReload) {
      return;
    }
    if (followedTags === null) {
      setShouldDisplayFollowingPitches(false);
    }
    if (followedTags?.length > 0) {
      setShouldDisplayFollowingPitches(true);
    }
    cursorsByTagRef.current = {};
    pitchDocsByTagRef.current = {};
    pitchDocsRef.current = {};
    chunkMapRef.current = {};
    noMoreRef.current = false;
    setPitchDocsState(undefined);
    setChunkMap(undefined);
    setNoMore(noMoreRef.current);
    handleLoadTab({
      activeTab,
      trendingFilter,
      goalFilter,
      nsfwVisible,
      rangeFilter,
      followedTags,
    });
  }, [
    activeTab,
    allowReload,
    followedTags,
    goalFilter,
    handleLoadTab,
    nsfwVisible,
    rangeFilter,
    trendingFilter,
  ]);

  const handleChangeTab = useCallback(
    (tab: PitchToolbarTab): void => {
      lastLoadedChunkRef.current = -1;
      cursorsByTagRef.current = {};
      pitchDocsByTagRef.current = {};
      pitchDocsRef.current = {};
      chunkMapRef.current = {};
      DataStoreCache.instance.clear(...Array.from(cacheKeys.current));
      setLoadIcons(true);
      setAllowReload(true);
      setActiveTab(tab);
      if (followedTags === null) {
        setShouldDisplayFollowingPitches(false);
      }
      if (followedTags?.length > 0) {
        setShouldDisplayFollowingPitches(true);
      }
    },
    [followedTags]
  );

  const handleReloadFollowing = useCallback(async (): Promise<void> => {
    DataStoreCache.instance.clear(...Array.from(cacheKeys.current));
    setShouldDisplayFollowingPitches(true);
  }, []);

  const handleFollowMore = useCallback((): void => {
    setShouldDisplayFollowingPitches(false);
  }, []);

  const handleChangeGoalFilter = useCallback(
    async (e: React.MouseEvent, value: GoalFilter): Promise<void> => {
      setAllowReload(true);
      setGoalFilter(value);
    },
    []
  );

  const handleChangeTrendingFilter = useCallback(
    async (e: React.MouseEvent, value: TrendingFilter): Promise<void> => {
      setAllowReload(true);
      setTrendingFilter(value);
    },
    []
  );

  const handleChangeRangeFilter = useCallback(
    (e: React.MouseEvent, value: DateRangeFilter): void => {
      setAllowReload(true);
      setRangeFilter(value);
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

  const handleKudo = useCallback(
    (
      e: React.MouseEvent,
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

  const handleCreateContribution = useCallback(
    async (e: React.MouseEvent, pitchId: string): Promise<void> => {
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
    async (e: React.MouseEvent, pitchId: string): Promise<void> => {
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

  const handleDeletePitch = useCallback(async (): Promise<void> => {
    confirmDialogDispatch(confirmDialogClose());
  }, [confirmDialogDispatch]);

  const emptyImage = useMemo(() => <AnimatedHappyMascot />, []);

  return (
    <StyledPitch style={style}>
      <StyledApp>
        <PitchTabsToolbar value={activeTab} onChange={handleChangeTab} />
        <BetaBanner />
        <StyledListArea>
          <StyledContainer>
            {searching ? (
              <EmptyPitchList loading loadingMessage={`Searching...`} />
            ) : (
              <>
                {activeTab === "Following" && !shouldDisplayFollowingPitches ? (
                  <PitchFollowTags onReload={handleReloadFollowing} />
                ) : (
                  <>
                    <FilterHeader id="pitch-filter-header">
                      <GoalFilterButton
                        target="pitch"
                        activeFilterValue={goalFilter}
                        onOption={handleChangeGoalFilter}
                      />
                      <StyledSpacer />
                      <StyledCenterArea>
                        {activeTab === "Following" && (
                          <StyledButton
                            color="primary"
                            onClick={handleFollowMore}
                          >{`More`}</StyledButton>
                        )}
                      </StyledCenterArea>
                      {activeTab === "Top" ? (
                        <RangeFilterButton
                          target="pitch"
                          activeFilterValue={rangeFilter}
                          onOption={handleChangeRangeFilter}
                        />
                      ) : (
                        <TrendingFilterButton
                          target="pitch"
                          activeFilterValue={trendingFilter}
                          onOption={handleChangeTrendingFilter}
                        />
                      )}
                    </FilterHeader>
                    <PitchList
                      config={config}
                      icons={icons}
                      pitchDocs={pitchDocsState}
                      chunkMap={chunkMap}
                      lastLoadedChunk={lastLoadedChunk}
                      emptyImage={emptyImage}
                      filterLabel={filterLabel}
                      searchLabel={`now.`}
                      hideAddButton={
                        activeTab === "Following" &&
                        (!followedTags || followedTags.length === 0)
                      }
                      onKudo={handleKudo}
                      onChangeScore={handleChangeScore}
                      onDelete={handleDeletePitch}
                      onCreateContribution={handleCreateContribution}
                      onDeleteContribution={handleDeleteContribution}
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
                    {loadIcons && <TagIconLoader />}
                  </>
                )}
              </>
            )}
          </StyledContainer>
        </StyledListArea>
      </StyledApp>
    </StyledPitch>
  );
});

export default Pitch;
