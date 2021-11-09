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
import { ContributionDocument } from "../../impower-data-store";
import DataStoreCache from "../../impower-data-store/classes/dataStoreCache";
import { NavigationContext } from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";
import { UserContext } from "../../impower-user";
import ContributionListContent from "./ContributionListContent";
import PitchLoadingProgress from "./PitchLoadingProgress";

const LOAD_MORE_LIMIT = 10;

const StyledContributionList = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

interface StaticContributionListProps {
  scrollParent?: HTMLElement;
  contributionKeys?: string[];
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

const StaticContributionList = React.memo(
  (props: PropsWithChildren<StaticContributionListProps>): JSX.Element => {
    const pitchedCollection = "pitched_games";

    const {
      scrollParent,
      contributionKeys,
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

    const [navigationState, navigationDispatch] = useContext(NavigationContext);
    const transitioning = navigationState?.transitioning;

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

    const contributionDocsRef = useRef<{
      [id: string]: ContributionDocument;
    }>();
    const [contributionDocsState, setContributionDocsState] = useState<{
      [id: string]: ContributionDocument;
    }>(contributionDocsRef.current);

    const cursorIndexRef = useRef<number>(0);

    const loadingMoreRef = useRef<boolean>();
    const [loadingMore, setLoadingMore] = useState<boolean>();
    const noMoreRef = useRef<boolean>();
    const [noMore, setNoMore] = useState<boolean>();

    const recentContributionDocs = useMemo(() => {
      const result: { [id: string]: ContributionDocument } = {};
      Object.entries(my_recent_contributions).forEach(
        ([targetPitchId, contributions]) => {
          Object.entries(contributions).forEach(
            ([contributionId, contributionDoc]) => {
              result[`${targetPitchId}/${contributionId}`] = contributionDoc;
            }
          );
        }
      );
      return result;
    }, [my_recent_contributions]);
    const recentContributionDocsRef = useRef(recentContributionDocs);

    const queryOptions: {
      nsfw?: boolean;
    } = useMemo(
      () => ({
        nsfw: nsfwVisible,
      }),
      [nsfwVisible]
    );

    const handleLoad = useCallback(
      async (
        options: {
          nsfw?: boolean;
        },
        limit: number
      ): Promise<number> => {
        const { nsfw } = options;

        const DataStoreRead = await (
          await import("../../impower-data-store/classes/dataStoreRead")
        ).default;

        const start = cursorIndexRef.current;
        const end = Math.min(start + limit, contributionKeys.length);
        const loadingKeys: string[] = [];
        for (let i = start; i < end; i += 1) {
          loadingKeys.push(contributionKeys[i]);
        }
        const snapshots = await Promise.all(
          loadingKeys.map((key) => {
            const [pitchId, contributionId] = key.split("%");
            return new DataStoreRead(
              pitchedCollection,
              pitchId,
              "contributions",
              contributionId
            ).get<ContributionDocument>();
          })
        );
        cursorIndexRef.current = end;
        const currentDocs = contributionDocsRef.current || {};
        const matchingRecentContributionDocs =
          recentContributionDocsRef.current || {};
        const newDocs = {
          ...matchingRecentContributionDocs,
          ...currentDocs,
          ...matchingRecentContributionDocs,
        };
        snapshots.forEach((d) => {
          const data = d.data();
          if (data) {
            if ((nsfw || !data.nsfw) && !data.delisted) {
              const pitchId = d.ref.parent.parent.id;
              const contributionId = d.id;
              const key = `${pitchId}/${contributionId}`;
              newDocs[key] = d.data();
              if (chunkMapRef.current[key] === undefined) {
                chunkMapRef.current[key] = lastLoadedChunkRef.current;
              }
            }
          }
        });

        contributionDocsRef.current = newDocs;

        return snapshots.length;
      },
      [contributionKeys]
    );

    const handleLoadMoreItems = useCallback(
      async (options: { nsfw?: boolean }) => {
        const limit = LOAD_MORE_LIMIT;
        const loadedCount = await handleLoad(options, limit);
        setContributionDocsState(contributionDocsRef.current);
        setChunkMap(chunkMapRef.current);
        noMoreRef.current =
          Object.keys(contributionDocsRef.current).length === 0
            ? undefined
            : loadedCount < limit;
        setNoMore(noMoreRef.current);
      },
      [handleLoad]
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
        await handleLoadMoreItems(queryOptions);
        loadingMoreRef.current = false;
        setLoadingMore(loadingMoreRef.current);
      }
    }, [handleLoadMoreItems, queryOptions]);

    const handleRefresh = useCallback(async (): Promise<void> => {
      if (scrollParent) {
        scrollParent.scrollTo({ top: 0 });
      }
      cursorIndexRef.current = 0;
      contributionDocsRef.current = {};
      chunkMapRef.current = {};
      await handleLoadMoreItems(queryOptions);
    }, [scrollParent, handleLoadMoreItems, queryOptions]);

    useEffect(() => {
      const recentContributionDocs: { [id: string]: ContributionDocument } = {};
      Object.entries(my_recent_contributions).forEach(
        ([targetPitchId, contributions]) => {
          Object.entries(contributions).forEach(
            ([contributionId, contributionDoc]) => {
              recentContributionDocs[`${targetPitchId}/${contributionId}`] =
                contributionDoc;
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
    }, [my_recent_contributions]);

    useEffect(() => {
      navigationDispatch(navigationSetTransitioning(false));
      if ([nsfwVisible].some((x) => x === undefined)) {
        return;
      }
      cursorIndexRef.current = 0;
      contributionDocsRef.current = {};
      chunkMapRef.current = {};
      loadingMoreRef.current = false;
      noMoreRef.current = false;
      setContributionDocsState(undefined);
      setChunkMap(undefined);
      setNoMore(noMoreRef.current);
      handleLoadMoreItems(queryOptions);
    }, [handleLoadMoreItems, queryOptions, nsfwVisible, navigationDispatch]);

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

    return (
      <StyledContributionList>
        {transitioning ? (
          loadingPlaceholder
        ) : (
          <>
            <ContributionListContent
              scrollParent={scrollParent}
              contributionDocs={contributionDocsState}
              chunkMap={chunkMap}
              lastLoadedChunk={lastLoadedChunk}
              loadingPlaceholder={loadingPlaceholder}
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
          </>
        )}
      </StyledContributionList>
    );
  }
);

export default StaticContributionList;
