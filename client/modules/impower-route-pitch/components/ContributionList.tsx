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
import { UserContext } from "../../impower-user";
import { ContributionTypeFilter } from "../types/contributionTypeFilter";
import ContributionListContent from "./ContributionListContent";
import ContributionListQueryHeader from "./ContributionListQueryHeader";
import PitchLoadingProgress from "./PitchLoadingProgress";

const LOAD_MORE_LIMIT = 10;

const StyledContributionList = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

interface ContributionListProps {
  scrollParent?: HTMLElement;
  pitchId?: string;
  pitchDoc?: ProjectDocument;
  creator?: string;
  contributionDocs?: { [id: string]: ContributionDocument };
  sortOptions?: QuerySort[];
  emptyLabel?: string;
  emptySubtitle?: string;
  noMoreLabel?: string;
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
    const pitchedCollection = "pitched_games";

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
      onEditContribution,
      onDeleteContribution,
      children,
    } = props;

    const [userState] = useContext(UserContext);
    const { settings, my_recent_contributions } = userState;
    const account = settings?.account;
    const nsfwVisible = account === null ? null : account?.nsfwVisible;

    const loadingMoreRef = useRef<boolean>();
    const [loadingMore, setLoadingMore] = useState<boolean>();
    const noMoreRef = useRef<boolean>();
    const [noMore, setNoMore] = useState<boolean>();
    const allowReload = useRef(false);

    const [typeFilter, setTypeFilter] = useState<ContributionTypeFilter>("All");
    const [sort, setSort] = useState<QuerySort>(sortOptions?.[0] || "rating");

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

    const pitchIdsRef = useRef<{
      [id: string]: string;
    }>({});
    const [pitchIdsState, setPitchIdsState] = useState<{
      [id: string]: string;
    }>(pitchIdsRef.current);

    const cursorsRef = useRef<DocumentSnapshot<ContributionDocument>>();
    const cacheKeys = useRef<Set<string>>(new Set());

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
                result[contributionId] = contributionDoc;
                pitchIdsRef.current[contributionId] = targetPitchId;
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

    const handleFilter = useCallback(
      (e: React.MouseEvent, sort: ContributionTypeFilter) => {
        allowReload.current = true;
        setTypeFilter(sort);
      },
      []
    );

    const handleSort = useCallback((e: React.MouseEvent, sort: QuerySort) => {
      allowReload.current = true;
      setSort(sort);
    }, []);

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
          ? await contributionsQuery(options, pitchedCollection, pitchId)
          : await contributionsQuery(options, undefined);
        const cursor = cursorsRef.current;
        const cursorQuery = cursor
          ? query.startAfter(cursor).limit(limit)
          : query.limit(limit);
        cacheKeys.current.add(cursorQuery.key);
        const snapshot = await cursorQuery.get<ContributionDocument>();
        const { docs } = snapshot;
        const cursorIndex = docs.length - 1;
        const lastSnapshot = docs[cursorIndex] || null;
        cursorsRef.current = lastSnapshot;
        const currentDocs = contributionDocsRef.current || {};
        const matchingRecentContributionDocs =
          recentContributionDocsRef.current || {};
        const newContributionDocs = {
          ...matchingRecentContributionDocs,
          ...currentDocs,
          ...matchingRecentContributionDocs,
        };
        docs.forEach((d) => {
          pitchIdsRef.current[d.id] = d.ref.parent.parent.id;
          newContributionDocs[d.id] = d.data();
        });
        Object.entries(newContributionDocs).forEach(([id, doc]) => {
          if (doc.delisted) {
            delete newContributionDocs[id];
          }
          if (chunkMapRef.current[id] === undefined) {
            chunkMapRef.current[id] = lastLoadedChunkRef.current;
          }
        });
        contributionDocsRef.current = newContributionDocs;
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
        loadingMoreRef.current = true;
        setLoadingMore(loadingMoreRef.current);
        const limit = LOAD_MORE_LIMIT;
        const loadedCount = await handleLoad(pitchId, options, limit);
        setContributionDocsState(contributionDocsRef.current);
        setPitchIdsState(pitchIdsRef.current);
        setChunkMap(chunkMapRef.current);
        noMoreRef.current =
          Object.keys(contributionDocsRef.current).length === 0
            ? undefined
            : loadedCount < limit;
        setNoMore(noMoreRef.current);
        loadingMoreRef.current = false;
        setLoadingMore(loadingMoreRef.current);
      },
      [handleLoad]
    );

    const handleScrolledToEnd = useCallback(async (): Promise<void> => {
      if (
        contributionDocsRef.current &&
        !noMoreRef.current &&
        !loadingMoreRef.current
      ) {
        lastLoadedChunkRef.current += 1;
        setLastLoadedChunk(lastLoadedChunkRef.current);
        await handleLoadMoreItems(pitchId, queryOptions);
      }
    }, [handleLoadMoreItems, pitchId, queryOptions]);

    const handleRefresh = useCallback(async (): Promise<void> => {
      if (scrollParent) {
        scrollParent.scrollTo({ top: 0 });
      }
      cursorsRef.current = undefined;
      contributionDocsRef.current = {};
      pitchIdsRef.current = {};
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
                recentContributionDocs[contributionId] = contributionDoc;
                pitchIdsRef.current[contributionId] = targetPitchId;
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
        Object.entries(newContributionDocs).forEach(([id, doc]) => {
          if (doc.delisted) {
            delete newContributionDocs[id];
          }
          if (chunkMapRef.current[id] === undefined) {
            chunkMapRef.current[id] = lastLoadedChunkRef.current;
          }
        });
        contributionDocsRef.current = newContributionDocs;
        setContributionDocsState(contributionDocsRef.current);
        setPitchIdsState(pitchIdsRef.current);
        setChunkMap(chunkMapRef.current);
      }
    }, [creator, my_recent_contributions, pitchId]);

    useEffect(() => {
      if (contributionDocsRef.current && !allowReload.current) {
        return;
      }
      cursorsRef.current = undefined;
      contributionDocsRef.current = {};
      pitchIdsRef.current = {};
      chunkMapRef.current = {};
      loadingMoreRef.current = false;
      noMoreRef.current = false;
      setContributionDocsState(undefined);
      setChunkMap(undefined);
      setNoMore(noMoreRef.current);
      handleLoadMoreItems(pitchId, queryOptions);
    }, [handleLoadMoreItems, queryOptions, pitchId]);

    const handleEditContribution = useCallback(
      async (
        e: React.MouseEvent,
        pitchId: string,
        contributionId: string
      ): Promise<void> => {
        if (onEditContribution) {
          onEditContribution(
            e,
            pitchId,
            contributionId,
            contributionDocsRef.current[contributionId]
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
        if (contributionDocsRef.current[contributionId]) {
          const newDoc = {
            ...contributionDocsRef.current[contributionId],
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
        id: string
      ): void => {
        const currentDoc = contributionDocsRef.current[id];
        const newDoc = { ...currentDoc, score };
        contributionDocsRef.current[id] = newDoc;
        DataStoreCache.instance.override(id, { score });
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
        if (contributionId) {
          const kudos = kudoed
            ? (contributionDocsRef.current[contributionId].kudos || 0) + 1
            : (contributionDocsRef.current[contributionId].kudos || 0) - 1;
          const currentDoc = contributionDocsRef.current[contributionId];
          const newDoc = { ...currentDoc, kudos };
          contributionDocsRef.current[contributionId] = newDoc;
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

    return (
      <>
        <StyledContributionList>
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
            pitchIds={pitchIdsState}
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
        </StyledContributionList>
      </>
    );
  }
);

export default ContributionList;
