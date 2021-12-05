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
  confirmDialogNavOpen,
} from "../../impower-confirm-dialog";
import { Timestamp } from "../../impower-core";
import { AggData } from "../../impower-data-state";
import { getAge, ProjectDocument, ProjectType } from "../../impower-data-store";
import DataStoreCache from "../../impower-data-store/classes/dataStoreCache";
import { useDialogNavigation } from "../../impower-dialog";
import { SvgData } from "../../impower-icon";
import { NavigationContext } from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";
import { useRouter } from "../../impower-router";
import { UserContext } from "../../impower-user";
import { DateRangeFilter } from "../types/dateRangeFilter";
import getRangeFilterOptionLabels from "../utils/getRangeFilterOptionLabels";
import getStaticSortOptionIcons from "../utils/getStaticSortOptionIcons";
import getStaticSortOptionLabels from "../utils/getStaticSortOptionLabels";
import AddPitchToolbar from "./AddPitchToolbar";
import PitchListContent from "./PitchListContent";
import PitchLoadingProgress from "./PitchLoadingProgress";
import QueryButton from "./QueryButton";
import QueryHeader from "./QueryHeader";

const discardInfo = {
  title: "Discard unsaved changes?",
  agreeLabel: "Discard",
  disagreeLabel: "Keep Editing",
};

const LOAD_MORE_LIMIT = 10;

const SORT_OPTIONS: ["new", "old"] = ["new", "old"];

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

const StyledStaticPitchList = styled.div`
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

const StyledSpacer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
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
  visibility: hidden;
  pointer-events: none;
`;

interface StaticPitchListProps {
  config?: ConfigParameters;
  icons?: { [name: string]: SvgData };
  type?: ProjectType;
  pitchDataEntries?: [string, AggData][];
  compact?: boolean;
  loadingPlaceholder?: React.ReactNode;
  emptyPlaceholder?: React.ReactNode;
  offlinePlaceholder?: React.ReactNode;
  emptyLabel?: string;
  emptySubtitle?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  queryHeaderStyle?: React.CSSProperties;
  hideAddToolbar?: boolean;
  onRefresh?: () => void;
}

const StaticPitchList = React.memo(
  (props: StaticPitchListProps): JSX.Element => {
    const {
      config,
      icons,
      type,
      pitchDataEntries,
      compact,
      loadingPlaceholder,
      emptyPlaceholder,
      offlinePlaceholder,
      emptyLabel,
      emptySubtitle,
      style,
      contentStyle,
      queryHeaderStyle,
      hideAddToolbar,
      onRefresh,
    } = props;

    const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
    const [userState] = useContext(UserContext);
    const { uid, settings, my_recent_pitched_projects } = userState;
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
    const recentPitchDocsRef = useRef(recentPitchDocs);

    const contentElRef = useRef<HTMLDivElement>();
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
            new DataStoreRead("pitched_projects", id).get<ProjectDocument>()
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

    const handleDeletePitch = useCallback(
      async (e: React.MouseEvent, pitchId: string): Promise<void> => {
        setReloading(true);
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

    const handleStartCreation = useCallback(async () => {
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
    }, [type, uid]);

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
              handleStartCreation();
            }
          } else {
            handleEndCreation("browserBack");
          }
        }
      },
      [createDocExists, handleEndCreation, handleStartCreation]
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
          ...pitchDocsRef.current[id],
          repitchedAt: new Timestamp(),
        });
        setEditDialogOpen(true);
        openEditDialog("create");
      },
      [openEditDialog]
    );

    const handleOpenCreateDialog = useCallback((): void => {
      handleStartCreation();
      openEditDialog("create");
    }, [handleStartCreation, openEditDialog]);

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
          const link = window.location.pathname;
          handleEndCreation(reason, () => {
            const newState = { ...(window.history.state || {}) };
            delete newState.query;
            window.history.replaceState(newState, "", link);
            router.replace(link);
          });
        } else {
          handleEndCreation(reason, closeEditDialog);
        }
      },
      [closeEditDialog, handleEndCreation, router]
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
            handleStartCreation();
          }
        }
      }
    }, [createDocExists, handleStartCreation, router]);

    const handleGetActiveSortOptionIcon = useCallback((sort?: string) => {
      const icons = getStaticSortOptionIcons();
      const Icon = icons[sort];
      return <Icon />;
    }, []);

    const handleGetActiveFilterOptionIcon = useCallback(
      (rangeFilter?: string) => {
        return rangeFilter === "All" ? (
          <CalendarRegularIcon />
        ) : (
          <CalendarRangeSolidIcon />
        );
      },
      []
    );

    const loading = transitioning || !pitchDocsState || reloading;

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

    const addLabel = type === "music" ? `pitch ${type}` : `pitch a ${type}`;

    return (
      <>
        <StyledListArea style={style}>
          <StyledContent style={contentStyle}>
            <StyledStaticPitchList ref={listElRef} style={listStyle}>
              <StyledListContent ref={contentElRef} style={listContentStyle}>
                <QueryHeader id="pitch-filter-header" style={queryHeaderStyle}>
                  <QueryButton
                    target="pitch"
                    menuType="sort"
                    label={`Sort By`}
                    value={sort}
                    options={SORT_OPTIONS}
                    getOptionLabels={getStaticSortOptionLabels}
                    getOptionIcons={handleGetSortOptionIcons}
                    getActiveOptionIcon={handleGetActiveSortOptionIcon}
                    onOption={handleChangeSort}
                  />
                  <StyledSpacer />
                  <QueryButton
                    target="pitch"
                    menuType="filter"
                    label={`Kudoed`}
                    flexDirection="row-reverse"
                    value={rangeFilter}
                    getOptionLabels={getRangeFilterOptionLabels}
                    getOptionIcons={handleGetFilterOptionIcons}
                    getActiveOptionIcon={handleGetActiveFilterOptionIcon}
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
                  offlinePlaceholder={offlinePlaceholder}
                  onChangeScore={handleChangeScore}
                  onEdit={handleOpenEditDialog}
                  onDelete={handleDeletePitch}
                  onKudo={handleKudo}
                  onCreateContribution={handleCreateContribution}
                  onDeleteContribution={handleDeleteContribution}
                />
                {((emptyPlaceholder && pitchCount > 0) ||
                  (!emptyPlaceholder && pitchDocsState)) && (
                  <PitchLoadingProgress
                    loadingMore={
                      Boolean(pitchDocsState) && Boolean(loadingMore)
                    }
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
                      !emptyPlaceholder && pitchCount === 0
                        ? undefined
                        : `Refresh?`
                    }
                    onScrolledToEnd={handleScrolledToEnd}
                    onRefresh={handleRefresh}
                  />
                )}
                {loadIcons && <TagIconLoader />}
              </StyledListContent>
            </StyledStaticPitchList>
            <StyledOverlayArea>
              {reloading !== undefined && (
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
          <AddPitchToolbar label={addLabel} onClick={handleOpenCreateDialog} />
        )}
        {editDialogOpen !== undefined && (
          <CreatePitchDialog
            config={config}
            icons={icons}
            type={type}
            open={editDialogOpen}
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

export default StaticPitchList;
