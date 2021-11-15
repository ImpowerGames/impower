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
import CalendarRegularIcon from "../../../resources/icons/regular/calendar.svg";
import CalendarRangeSolidIcon from "../../../resources/icons/solid/calendar-range.svg";
import { ConfigParameters } from "../../impower-config";
import {
  confirmDialogClose,
  ConfirmDialogContext,
} from "../../impower-confirm-dialog";
import { AggData } from "../../impower-data-state";
import { getAge, ProjectDocument } from "../../impower-data-store";
import DataStoreCache from "../../impower-data-store/classes/dataStoreCache";
import { SvgData } from "../../impower-icon";
import { NavigationContext } from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";
import { UserContext } from "../../impower-user";
import { DateRangeFilter } from "../types/dateRangeFilter";
import getRangeFilterOptionLabels from "../utils/getRangeFilterOptionLabels";
import getStaticSortOptionIcons from "../utils/getStaticSortOptionIcons";
import getStaticSortOptionLabels from "../utils/getStaticSortOptionLabels";
import PitchListContent from "./PitchListContent";
import PitchLoadingProgress from "./PitchLoadingProgress";
import QueryButton from "./QueryButton";
import QueryHeader from "./QueryHeader";

const LOAD_MORE_LIMIT = 10;

const SORT_OPTIONS: ["new", "old"] = ["new", "old"];

const TagIconLoader = dynamic(
  () => import("../../impower-route/components/elements/TagIconLoader"),
  { ssr: false }
);

const StyledStaticPitchList = styled.div`
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

const StyledLoadingArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
`;

interface StaticPitchListProps {
  config?: ConfigParameters;
  icons?: { [name: string]: SvgData };
  pitchDataEntries?: [string, AggData][];
  compact?: boolean;
  loadingPlaceholder?: React.ReactNode;
  emptyPlaceholder?: React.ReactNode;
  offlinePlaceholder?: React.ReactNode;
  emptyLabel?: string;
  emptySubtitle?: string;
  onRefresh?: () => void;
}

const StaticPitchList = React.memo(
  (props: StaticPitchListProps): JSX.Element => {
    const pitchedCollection = "pitched_games";

    const {
      config,
      icons,
      pitchDataEntries,
      compact,
      loadingPlaceholder,
      emptyPlaceholder,
      offlinePlaceholder,
      emptyLabel,
      emptySubtitle,
      onRefresh,
    } = props;

    const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
    const [userState] = useContext(UserContext);
    const { settings, my_recent_pitched_projects } = userState;
    const account = settings?.account;
    const nsfwVisible =
      account === undefined ? undefined : account?.nsfwVisible || false;

    const chunkMapRef = useRef<{
      [id: string]: number;
    }>({});
    const [chunkMap, setChunkMap] = useState<{
      [id: string]: number;
    }>(chunkMapRef.current);

    const lastLoadedChunkRef = useRef(0);
    const [lastLoadedChunk, setLastLoadedChunk] = useState(
      lastLoadedChunkRef.current
    );

    const loadingMoreRef = useRef<boolean>();
    const [loadingMore, setLoadingMore] = useState<boolean>();
    const [loadIcons, setLoadIcons] = useState(false);
    const noMoreRef = useRef<boolean>(false);
    const [noMore, setNoMore] = useState<boolean>(noMoreRef.current);
    const [sort, setSort] = useState<"new" | "old">(SORT_OPTIONS?.[0] || "new");
    const [rangeFilter, setRangeFilter] = useState<DateRangeFilter>("All");
    const [reloading, setReloading] = useState(false);

    const pitchDocsRef = useRef<{ [id: string]: ProjectDocument }>();
    const [pitchDocsState, setPitchDocsState] = useState<{
      [id: string]: ProjectDocument;
    }>(pitchDocsRef.current);

    const cursorIndexRef = useRef<number>(0);

    const [navigationState, navigationDispatch] = useContext(NavigationContext);
    const transitioning = navigationState?.transitioning;

    const recentPitchDocs = my_recent_pitched_projects;
    const recentPitchDocsRef = useRef(recentPitchDocs);

    const listElRef = useRef<HTMLDivElement>();
    const loadingElRef = useRef<HTMLDivElement>();

    const orderedPitchDataEntries = useMemo(
      () =>
        sort === "new" ? [...pitchDataEntries].reverse() : pitchDataEntries,
      [pitchDataEntries, sort]
    );

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

    const handleShowLoadingPlaceholder = useCallback(async () => {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      listElRef.current.style.visibility = "hidden";
      listElRef.current.style.pointerEvents = "none";
      loadingElRef.current.style.visibility = null;
      loadingElRef.current.style.pointerEvents = null;
      window.scrollTo({ top: 0 });
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      setReloading(true);
    }, []);

    const handleHideLoadingPlaceholder = useCallback(async () => {
      setReloading(false);
    }, []);

    const handleLoadMore = useCallback(
      async (
        options: {
          nsfw?: boolean;
        },
        limit: number
      ): Promise<number> => {
        const { nsfw } = options;

        const start = cursorIndexRef.current;
        const end = Math.min(start + limit, orderedPitchDataEntries.length);

        if (start === end) {
          return 0;
        }

        const nowAge =
          rangeFilter === "All" ? -1 : getAge(new Date(), rangeFilter, true);

        const loadingKeys: string[] = [];
        for (let i = start; i < end; i += 1) {
          const [key, data] = orderedPitchDataEntries[i];
          const kudoedAge =
            rangeFilter === "All"
              ? -1
              : getAge(new Date(data.t), rangeFilter, true);
          if (nowAge === kudoedAge) {
            loadingKeys.push(key);
          }
        }

        const DataStoreRead = await (
          await import("../../impower-data-store/classes/dataStoreRead")
        ).default;
        const snapshots = await Promise.all(
          loadingKeys.map((id) =>
            new DataStoreRead(pitchedCollection, id).get<ProjectDocument>()
          )
        );
        cursorIndexRef.current = end;
        const matchingRecentPitchDocs: { [id: string]: ProjectDocument } =
          recentPitchDocsRef.current || {};
        const newDocs: { [id: string]: ProjectDocument } = {
          ...matchingRecentPitchDocs,
          ...pitchDocsRef.current,
          ...matchingRecentPitchDocs,
        };
        snapshots.forEach((d) => {
          const data = d.data();
          if (data) {
            if ((nsfw || !data.nsfw) && !data.delisted) {
              const key = d.id;
              newDocs[key] = data;
              if (chunkMapRef.current[key] === undefined) {
                chunkMapRef.current[key] = lastLoadedChunkRef.current;
              }
            }
          }
        });

        pitchDocsRef.current = newDocs;

        return snapshots.length;
      },
      [orderedPitchDataEntries, rangeFilter]
    );

    const handleLoadTab = useCallback(
      async (options: { nsfw?: boolean }) => {
        const { nsfw } = options;

        try {
          const limit = LOAD_MORE_LIMIT;
          const loadedCount = await handleLoadMore(
            {
              nsfw,
            },
            limit
          );
          if (loadedCount === undefined) {
            return;
          }
          noMoreRef.current = loadedCount < limit;
          setPitchDocsState(pitchDocsRef.current);
          setChunkMap(chunkMapRef.current);
          setNoMore(noMoreRef.current);
        } catch (e) {
          const logInfo = (await import("../../impower-logger/utils/logError"))
            .default;
          logInfo("Route", e.message);
        }
        await handleHideLoadingPlaceholder();
      },
      [handleHideLoadingPlaceholder, handleLoadMore]
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
        await handleLoadTab({ nsfw: nsfwVisible });
        loadingMoreRef.current = false;
        setLoadingMore(loadingMoreRef.current);
      }
    }, [handleLoadTab, nsfwVisible]);

    const handleRefresh = useCallback(async (): Promise<void> => {
      if (onRefresh) {
        onRefresh();
      }
      window.scrollTo({ top: 0 });
      cursorIndexRef.current = 0;
      pitchDocsRef.current = {};
      chunkMapRef.current = {};
      await handleLoadTab({ nsfw: nsfwVisible });
    }, [handleLoadTab, nsfwVisible, onRefresh]);

    const handleReload = useCallback(async () => {
      if (pitchDocsRef.current) {
        await handleShowLoadingPlaceholder();
      }
      cursorIndexRef.current = 0;
      pitchDocsRef.current = {};
      chunkMapRef.current = {};
      noMoreRef.current = false;
      setNoMore(noMoreRef.current);
      handleLoadTab({ nsfw: nsfwVisible });
    }, [handleLoadTab, handleShowLoadingPlaceholder, nsfwVisible]);

    useEffect(() => {
      navigationDispatch(navigationSetTransitioning(false));
      if ([nsfwVisible].some((x) => x === undefined)) {
        return;
      }
      handleReload();
      setLoadIcons(true);
    }, [handleReload, navigationDispatch, nsfwVisible]);

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
      () => Object.keys(pitchDocsState || {})?.length,
      [pitchDocsState]
    );

    const handleAllowReload = useCallback(() => {
      lastLoadedChunkRef.current = 0;
      cursorIndexRef.current = 0;
      pitchDocsRef.current = {};
      chunkMapRef.current = {};
    }, []);

    const handleChangeSort = useCallback(
      async (e: React.MouseEvent, value: "new" | "old"): Promise<void> => {
        handleAllowReload();
        setSort(value);
      },
      [handleAllowReload]
    );

    const handleChangeFilter = useCallback(
      (e: React.MouseEvent, value: DateRangeFilter): void => {
        handleAllowReload();
        setRangeFilter(value);
      },
      [handleAllowReload]
    );

    const handleGetSortOptionIcons = useCallback(async (): Promise<{
      [option: string]: React.ComponentType;
    }> => {
      const getStaticSortOptionIcons = (
        await import("../utils/getStaticSortOptionIcons")
      ).default;
      return getStaticSortOptionIcons();
    }, []);

    const handleGetFilterOptionIcons = useCallback(
      async (
        value: DateRangeFilter
      ): Promise<{
        [option: string]: React.ComponentType;
      }> => {
        const getRangeFilterOptionIcons = (
          await import("../utils/getRangeFilterOptionIcons")
        ).default;
        return getRangeFilterOptionIcons(value);
      },
      []
    );

    const sortIcon = useMemo(() => {
      const icons = getStaticSortOptionIcons();
      const Icon = icons[sort];
      return <Icon />;
    }, [sort]);

    const filterIcon = useMemo(() => {
      return rangeFilter === "All" ? (
        <CalendarRegularIcon />
      ) : (
        <CalendarRangeSolidIcon />
      );
    }, [rangeFilter]);

    const loading = transitioning || !pitchDocsState || reloading;

    const listStyle: React.CSSProperties = useMemo(
      () => ({
        visibility: loading ? "hidden" : undefined,
        opacity: loading ? 0 : undefined,
        pointerEvents: loading ? "none" : undefined,
      }),
      [loading]
    );
    const loadingStyle: React.CSSProperties = useMemo(
      () => ({
        visibility: loading ? undefined : "hidden",
        opacity: loading ? undefined : 0,
        pointerEvents: loading ? undefined : "none",
      }),
      [loading]
    );

    return (
      <>
        <StyledStaticPitchList ref={listElRef} style={listStyle}>
          <QueryHeader id="pitch-filter-header">
            <QueryButton
              target="pitch"
              menuType="sort"
              label={`Sort By`}
              icon={sortIcon}
              value={sort}
              options={SORT_OPTIONS}
              getOptionLabels={getStaticSortOptionLabels}
              getOptionIcons={handleGetSortOptionIcons}
              onOption={handleChangeSort}
            />
            <StyledSpacer />
            <QueryButton
              target="pitch"
              menuType="filter"
              label={`Kudoed`}
              flexDirection="row-reverse"
              icon={filterIcon}
              value={rangeFilter}
              getOptionLabels={getRangeFilterOptionLabels}
              getOptionIcons={handleGetFilterOptionIcons}
              onOption={handleChangeFilter}
            />
          </QueryHeader>
          <PitchListContent
            config={config}
            icons={icons}
            pitchDocs={pitchDocsState}
            chunkMap={chunkMap}
            lastLoadedChunk={lastLoadedChunk}
            compact={compact}
            loadingPlaceholder={loadingPlaceholder}
            emptyPlaceholder={emptyPlaceholder}
            offlinePlaceholder={offlinePlaceholder}
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
          {loadIcons && <TagIconLoader />}
        </StyledStaticPitchList>
        <StyledLoadingArea ref={loadingElRef} style={loadingStyle}>
          {loadingPlaceholder}
        </StyledLoadingArea>
      </>
    );
  }
);

export default StaticPitchList;
