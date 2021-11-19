import styled from "@emotion/styled";
import React, {
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ContributionDocument,
  ContributionType,
  DocumentSnapshot,
  ProjectDocument,
  QuerySort,
} from "../../impower-data-store";
import DataStoreCache from "../../impower-data-store/classes/dataStoreCache";
import { NavigationContext } from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";
import { UserContext } from "../../impower-user";
import { ContributionTypeFilter } from "../types/contributionTypeFilter";
import ContributionListContent from "./ContributionListContent";
import ContributionListQueryHeader from "./ContributionListQueryHeader";
import PitchLoadingProgress from "./PitchLoadingProgress";

const LOAD_MORE_LIMIT = 10;

const StyledContributionList = styled.div`
  flex: 1;
  position: relative;
`;

const StyledContent = styled.div`
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

interface ContributionListProps {
  scrollParent?: HTMLElement;
  pitchId?: string;
  pitchDoc?: ProjectDocument;
  creator?: string;
  contributionDocs?: { [key: string]: ContributionDocument };
  sortOptions?: QuerySort[];
  emptyLabel?: string;
  emptySubtitle?: string;
  noMoreLabel?: string;
  loadingPlaceholder?: React.ReactNode;
  onEditContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string,
    doc: ContributionDocument
  ) => void;
  onDeleteContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string
  ) => void;
}

const ContributionList = React.memo(
  (props: PropsWithChildren<ContributionListProps>): JSX.Element => {
    const {
      scrollParent,
      pitchId,
      pitchDoc,
      creator,
      contributionDocs,
      sortOptions,
      emptyLabel,
      emptySubtitle,
      noMoreLabel,
      loadingPlaceholder,
      onEditContribution,
      onDeleteContribution,
      children,
    } = props;

    const [userState] = useContext(UserContext);
    const { settings, my_recent_contributions } = userState;
    const account = settings?.account;
    const nsfwVisible =
      account === undefined ? undefined : account?.nsfwVisible || false;

    const [typeFilter, setTypeFilter] = useState<ContributionTypeFilter>("All");
    const [sort, setSort] = useState<QuerySort>(sortOptions?.[0] || "rating");
    const [reloading, setReloading] = useState(false);

    const [navigationState, navigationDispatch] = useContext(NavigationContext);
    const transitioning = navigationState?.transitioning;

    const initialChunkMap = useMemo(() => {
      const chunkMap = {};
      Object.keys(contributionDocs || {}).forEach((id) => {
        chunkMap[id] = 0;
      });
      return chunkMap;
    }, [contributionDocs]);

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

    const contributionDocsRef = useRef<{
      [id: string]: ContributionDocument;
    }>(contributionDocs);
    const [contributionDocsState, setContributionDocsState] = useState<{
      [id: string]: ContributionDocument;
    }>(contributionDocsRef.current);

    const cursorRef = useRef<DocumentSnapshot<ContributionDocument>>();
    const cacheKeys = useRef<Set<string>>(new Set());

    const loadingMoreRef = useRef<boolean>();
    const [loadingMore, setLoadingMore] = useState<boolean>();
    const noMoreRef = useRef<boolean>();
    const [noMore, setNoMore] = useState<boolean>();
    const [allowReload, setAllowReload] = useState(
      !contributionDocsRef.current
    );

    const contentElRef = useRef<HTMLDivElement>();
    const listElRef = useRef<HTMLDivElement>();
    const loadingElRef = useRef<HTMLDivElement>();

    const recentContributionDocs = useMemo(() => {
      const result: { [id: string]: ContributionDocument } = {};
      Object.entries(my_recent_contributions).forEach(
        ([targetPitchId, contributions]) => {
          Object.entries(contributions).forEach(
            ([contributionId, contributionDoc]) => {
              if (
                (!pitchId || pitchId === targetPitchId) &&
                (!creator || contributionDoc._createdBy === creator)
              ) {
                result[`${targetPitchId}/${contributionId}`] = contributionDoc;
              }
            }
          );
        }
      );
      return result;
    }, [creator, my_recent_contributions, pitchId]);
    const recentContributionDocsRef = useRef(recentContributionDocs);

    const queryOptions: {
      filter: ContributionType;
      sort: QuerySort;
      nsfw?: boolean;
      creator?: string;
    } = useMemo(
      () => ({
        filter: typeFilter === "All" ? undefined : typeFilter,
        sort,
        nsfw: nsfwVisible,
        creator,
      }),
      [creator, nsfwVisible, sort, typeFilter]
    );

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
      setReloading(true);
    }, []);

    const handleHideLoadingPlaceholder = useCallback(async () => {
      if (loadingElRef.current) {
        loadingElRef.current.classList.remove("animate");
      }
      setReloading(false);
    }, []);

    const handleAllowReload = useCallback(async () => {
      await handleShowLoadingPlaceholder();
      lastLoadedChunkRef.current = 0;
      cursorRef.current = null;
      contributionDocsRef.current = {};
      chunkMapRef.current = {};
      DataStoreCache.instance.clear(...Array.from(cacheKeys.current));
      setAllowReload(true);
    }, [handleShowLoadingPlaceholder]);

    const handleFilter = useCallback(
      async (e: React.MouseEvent, sort: ContributionTypeFilter) => {
        await handleAllowReload();
        setTypeFilter(sort);
      },
      [handleAllowReload]
    );

    const handleSort = useCallback(
      async (e: React.MouseEvent, sort: QuerySort) => {
        await handleAllowReload();
        setSort(sort);
      },
      [handleAllowReload]
    );

    const handleLoad = useCallback(
      async (
        pitchId: string,
        options: {
          filter?: ContributionType;
          sort: QuerySort;
          nsfw?: boolean;
        },
        limit: number
      ): Promise<number> => {
        const contributionsQuery = (
          await import("../../impower-data-store/utils/contributionsQuery")
        ).default;
        const query = pitchId
          ? await contributionsQuery(options, "pitched_projects", pitchId)
          : await contributionsQuery(options, undefined);
        const cursor = cursorRef.current;
        const cursorQuery = cursor
          ? query.startAfter(cursor).limit(limit)
          : query.limit(limit);
        cacheKeys.current.add(cursorQuery.key);
        const snapshot = await cursorQuery.get<ContributionDocument>();
        const { docs } = snapshot;
        const cursorIndex = docs.length - 1;
        const lastSnapshot = docs[cursorIndex] || null;
        cursorRef.current = lastSnapshot;
        const currentDocs = contributionDocsRef.current || {};
        const matchingRecentDocs = recentContributionDocsRef.current || {};
        const newDocs = {
          ...matchingRecentDocs,
          ...currentDocs,
        };
        docs.forEach((d) => {
          const pitchId = d.ref.parent.parent.id;
          const contributionId = d.id;
          newDocs[`${pitchId}/${contributionId}`] = d.data();
        });
        Object.entries(matchingRecentDocs).forEach(([key, doc]) => {
          newDocs[key] = doc;
        });
        Object.entries(newDocs).forEach(([key, doc]) => {
          if (doc.delisted) {
            delete newDocs[key];
          }
          if (chunkMapRef.current[key] === undefined) {
            chunkMapRef.current[key] = lastLoadedChunkRef.current;
          }
        });
        contributionDocsRef.current = newDocs;
        return docs.length;
      },
      []
    );

    const handleLoadMoreItems = useCallback(
      async (
        pitchId: string,
        options: {
          filter?: ContributionType;
          sort: QuerySort;
          nsfw?: boolean;
        }
      ) => {
        const limit = LOAD_MORE_LIMIT;
        const loadedCount = await handleLoad(pitchId, options, limit);
        setContributionDocsState(contributionDocsRef.current);
        setChunkMap(chunkMapRef.current);
        noMoreRef.current =
          Object.keys(contributionDocsRef.current).length === 0
            ? undefined
            : loadedCount < limit;
        setNoMore(noMoreRef.current);
        await handleHideLoadingPlaceholder();
      },
      [handleHideLoadingPlaceholder, handleLoad]
    );

    const handleScrolledToEnd = useCallback(async (): Promise<void> => {
      if (
        contributionDocsRef.current &&
        !noMoreRef.current &&
        !loadingMoreRef.current
      ) {
        loadingMoreRef.current = true;
        setLoadingMore(loadingMoreRef.current);
        lastLoadedChunkRef.current += 1;
        setLastLoadedChunk(lastLoadedChunkRef.current);
        await handleLoadMoreItems(pitchId, queryOptions);
        loadingMoreRef.current = false;
        setLoadingMore(loadingMoreRef.current);
      }
    }, [handleLoadMoreItems, pitchId, queryOptions]);

    const handleRefresh = useCallback(async (): Promise<void> => {
      if (scrollParent) {
        scrollParent.scrollTo({ top: 0 });
      }
      cursorRef.current = undefined;
      contributionDocsRef.current = {};
      chunkMapRef.current = {};
      const DataStoreCache = (
        await import("../../impower-data-store/classes/dataStoreCache")
      ).default;
      DataStoreCache.instance.clear(...Array.from(cacheKeys.current));
      await handleLoadMoreItems(pitchId, queryOptions);
    }, [scrollParent, handleLoadMoreItems, pitchId, queryOptions]);

    useEffect(() => {
      const recentContributionDocs: { [id: string]: ContributionDocument } = {};
      Object.entries(my_recent_contributions).forEach(
        ([targetPitchId, contributions]) => {
          Object.entries(contributions).forEach(
            ([contributionId, contributionDoc]) => {
              if (
                (!pitchId || pitchId === targetPitchId) &&
                (!creator || contributionDoc._createdBy === creator)
              ) {
                recentContributionDocs[`${targetPitchId}/${contributionId}`] =
                  contributionDoc;
              }
            }
          );
        }
      );
      recentContributionDocsRef.current = recentContributionDocs;
      if (contributionDocsRef.current) {
        const matchingRecentContributionDocs = recentContributionDocs || {};
        const newContributionDocs = {
          ...matchingRecentContributionDocs,
          ...contributionDocsRef.current,
          ...matchingRecentContributionDocs,
        };
        Object.entries(newContributionDocs).forEach(([key, doc]) => {
          if (doc.delisted) {
            delete newContributionDocs[key];
          }
          if (chunkMapRef.current[key] === undefined) {
            chunkMapRef.current[key] = lastLoadedChunkRef.current;
          }
        });
        contributionDocsRef.current = newContributionDocs;
        setContributionDocsState(contributionDocsRef.current);
        setChunkMap(chunkMapRef.current);
      }
    }, [creator, my_recent_contributions, pitchId]);

    const handleReload = useCallback(async () => {
      if (contributionDocsRef.current) {
        await handleShowLoadingPlaceholder();
      }
      cursorRef.current = undefined;
      contributionDocsRef.current = {};
      chunkMapRef.current = {};
      loadingMoreRef.current = false;
      noMoreRef.current = false;
      handleLoadMoreItems(pitchId, queryOptions);
    }, [
      handleLoadMoreItems,
      handleShowLoadingPlaceholder,
      pitchId,
      queryOptions,
    ]);

    useEffect(() => {
      navigationDispatch(navigationSetTransitioning(false));
      if ([nsfwVisible].some((x) => x === undefined)) {
        return;
      }
      if (!allowReload) {
        return;
      }
      handleReload();
    }, [allowReload, handleReload, navigationDispatch, nsfwVisible]);

    const handleEditContribution = useCallback(
      async (
        e: React.MouseEvent,
        pitchId: string,
        contributionId: string
      ): Promise<void> => {
        const key = `${pitchId}/${contributionId}`;
        if (onEditContribution) {
          onEditContribution(
            e,
            pitchId,
            contributionId,
            recentContributionDocsRef.current[key] ||
              contributionDocsRef.current[key]
          );
        }
      },
      [onEditContribution]
    );

    const handleDeleteContribution = useCallback(
      async (
        e: React.MouseEvent,
        pitchId: string,
        contributionId: string
      ): Promise<void> => {
        const key = `${pitchId}/${contributionId}`;
        if (contributionDocsRef.current[key]) {
          const newDoc = {
            ...contributionDocsRef.current[key],
            contributed: false,
            delisted: true,
            content: "[deleted]",
            file: { storageKey: "", fileUrl: "" },
            _author: { u: "[deleted]", i: null, h: "#FFFFFF" },
          };
          setContributionDocsState({
            ...contributionDocsRef.current,
            [contributionId]: newDoc,
          });
        }
        if (onDeleteContribution) {
          onDeleteContribution(e, pitchId, contributionId);
        }
      },
      [onDeleteContribution]
    );

    const handleChangeScore = useCallback(
      (
        e: React.MouseEvent<Element, MouseEvent>,
        score: number,
        pitchId: string,
        contributionId: string
      ): void => {
        const key = `${pitchId}/${contributionId}`;
        const currentDoc = contributionDocsRef.current[key];
        const newDoc = { ...currentDoc, score };
        contributionDocsRef.current[key] = newDoc;
        DataStoreCache.instance.override(contributionId, { score });
        setContributionDocsState({ ...contributionDocsRef.current });
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
        const key = `${pitchId}/${contributionId}`;
        if (contributionId) {
          const kudos = kudoed
            ? (contributionDocsRef.current[key].kudos || 0) + 1
            : (contributionDocsRef.current[key].kudos || 0) - 1;
          const currentDoc = contributionDocsRef.current[key];
          const newDoc = { ...currentDoc, kudos };
          contributionDocsRef.current[key] = newDoc;
          DataStoreCache.instance.override(contributionId, { kudos });
          setContributionDocsState({ ...contributionDocsRef.current });
        }
      },
      []
    );

    const contributionEntries = useMemo(
      () =>
        contributionDocsState
          ? Object.entries(contributionDocsState)
          : undefined,
      [contributionDocsState]
    );

    const pitchDocs = useMemo(
      () => (pitchId && pitchDoc ? { [pitchId]: pitchDoc } : undefined),
      [pitchId, pitchDoc]
    );

    const loading = transitioning || !contributionDocsState || reloading;

    const contentStyle: React.CSSProperties = useMemo(
      () => ({
        overflow: loading ? "hidden" : undefined,
      }),
      [loading]
    );
    const listStyle: React.CSSProperties = useMemo(
      () => ({
        visibility: loading ? "hidden" : undefined,
        pointerEvents: loading ? "none" : undefined,
      }),
      [loading]
    );
    const loadingStyle: React.CSSProperties = useMemo(
      () => ({
        visibility: loading ? "visible" : "hidden",
      }),
      [loading]
    );

    return (
      <>
        <StyledContributionList ref={listElRef} style={listStyle}>
          <StyledContent ref={contentElRef} style={contentStyle}>
            <ContributionListQueryHeader
              filter={typeFilter}
              sort={sort}
              sortOptions={sortOptions}
              onFilter={handleFilter}
              onSort={handleSort}
            />
            <ContributionListContent
              scrollParent={scrollParent}
              pitchDocs={pitchDocs}
              contributionDocs={contributionDocsState}
              chunkMap={chunkMap}
              lastLoadedChunk={lastLoadedChunk}
              onChangeScore={handleChangeScore}
              onKudo={handleKudo}
              onEdit={handleEditContribution}
              onDelete={handleDeleteContribution}
            />
            {contributionDocsState && (
              <PitchLoadingProgress
                loadingMore={loadingMore}
                noMore={noMore || contributionEntries?.length === 0}
                noMoreLabel={
                  contributionEntries?.length === 0 ? emptyLabel : noMoreLabel
                }
                noMoreSubtitle={
                  contributionEntries?.length === 0 ? emptySubtitle : undefined
                }
                refreshLabel={
                  contributionEntries?.length === 0 ? undefined : `Refresh?`
                }
                onScrolledToEnd={handleScrolledToEnd}
                onRefresh={handleRefresh}
              />
            )}
            {children}
          </StyledContent>
        </StyledContributionList>
        <StyledOverlayArea>
          <StyledLoadingArea ref={loadingElRef} style={loadingStyle}>
            {loadingPlaceholder}
          </StyledLoadingArea>
        </StyledOverlayArea>
      </>
    );
  }
);

export default ContributionList;
