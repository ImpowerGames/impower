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
import { ProjectDocument } from "../../impower-data-store";
import DataStoreCache from "../../impower-data-store/classes/dataStoreCache";
import { SvgData } from "../../impower-icon";
import { NavigationContext } from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";
import { UserContext } from "../../impower-user";
import PitchListContent from "./PitchListContent";
import PitchLoadingProgress from "./PitchLoadingProgress";

const LOAD_MORE_LIMIT = 10;

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

interface StaticPitchListProps {
  config?: ConfigParameters;
  icons?: { [name: string]: SvgData };
  pitchKeys?: string[];
  compact?: boolean;
  loadingPlaceholder?: React.ReactNode;
  emptyPlaceholder?: React.ReactNode;
  offlinePlaceholder?: React.ReactNode;
  emptyLabel?: string;
  emptySubtitle?: string;
}

const StaticPitchList = React.memo(
  (props: StaticPitchListProps): JSX.Element => {
    const pitchedCollection = "pitched_games";

    const {
      config,
      icons,
      pitchKeys,
      compact,
      loadingPlaceholder,
      emptyPlaceholder,
      offlinePlaceholder,
      emptyLabel,
      emptySubtitle,
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

    const pitchDocsRef = useRef<{ [id: string]: ProjectDocument }>();
    const [pitchDocsState, setPitchDocsState] = useState<{
      [id: string]: ProjectDocument;
    }>(pitchDocsRef.current);

    const cursorIndexRef = useRef<number>(0);

    const [navigationState, navigationDispatch] = useContext(NavigationContext);
    const transitioning = navigationState?.transitioning;

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

    const handleLoadMore = useCallback(
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
        const end = Math.min(start + limit, pitchKeys.length);
        const loadingKeys: string[] = [];
        for (let i = start; i < end; i += 1) {
          loadingKeys.push(pitchKeys[i]);
        }
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
      [pitchKeys]
    );

    const handleLoadTab = useCallback(
      async (options: { nsfwVisible?: boolean }) => {
        const { nsfwVisible } = options;

        try {
          const limit = LOAD_MORE_LIMIT;
          const options: { nsfw: boolean } = { nsfw: nsfwVisible };
          const loadedCount = await handleLoadMore(options, limit);
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
      },
      [handleLoadMore]
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
        await handleLoadTab({ nsfwVisible });
        loadingMoreRef.current = false;
        setLoadingMore(loadingMoreRef.current);
      }
    }, [handleLoadTab, nsfwVisible]);

    const handleRefresh = useCallback(async (): Promise<void> => {
      window.scrollTo({ top: 0 });
      cursorIndexRef.current = 0;
      pitchDocsRef.current = {};
      chunkMapRef.current = {};
      await handleLoadTab({ nsfwVisible });
    }, [handleLoadTab, nsfwVisible]);

    useEffect(() => {
      navigationDispatch(navigationSetTransitioning(false));
      if ([nsfwVisible].some((x) => x === undefined)) {
        return;
      }
      cursorIndexRef.current = 0;
      pitchDocsRef.current = {};
      chunkMapRef.current = {};
      noMoreRef.current = false;
      setLoadIcons(true);
      setPitchDocsState(undefined);
      setChunkMap(undefined);
      setNoMore(noMoreRef.current);
      handleLoadTab({ nsfwVisible });
    }, [handleLoadTab, nsfwVisible, navigationDispatch]);

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

    return (
      <StyledContainer>
        {transitioning ? (
          loadingPlaceholder
        ) : (
          <>
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
          </>
        )}
        {loadIcons && <TagIconLoader />}
      </StyledContainer>
    );
  }
);

export default StaticPitchList;
