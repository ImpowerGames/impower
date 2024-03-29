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
import CalendarRegularIcon from "../../../resources/icons/regular/calendar.svg";
import CalendarRangeSolidIcon from "../../../resources/icons/solid/calendar-range.svg";
import {
  confirmDialogClose,
  ConfirmDialogContext,
} from "../../impower-confirm-dialog";
import { AggData } from "../../impower-data-state";
import {
  ContributionDocument,
  getAge,
  ProjectDocument,
} from "../../impower-data-store";
import DataStoreCache from "../../impower-data-store/classes/dataStoreCache";
import { useDialogNavigation } from "../../impower-dialog";
import { NavigationContext } from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";
import { useRouter } from "../../impower-router";
import { UserContext } from "../../impower-user";
import { DateRangeFilter } from "../types/dateRangeFilter";
import getRangeFilterOptionLabels from "../utils/getRangeFilterOptionLabels";
import getStaticSortOptionIcons from "../utils/getStaticSortOptionIcons";
import getStaticSortOptionLabels from "../utils/getStaticSortOptionLabels";
import ContributionListContent from "./ContributionListContent";
import PitchLoadingProgress from "./PitchLoadingProgress";
import QueryButton from "./QueryButton";
import QueryHeader from "./QueryHeader";

const LOAD_MORE_LIMIT = 10;

const SORT_OPTIONS: ["new", "old"] = ["new", "old"];

const CreateContributionDialog = dynamic(
  () => import("./CreateContributionDialog"),
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

const StyledStaticContributionList = styled.div`
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

interface StaticContributionListProps {
  scrollParent?: HTMLElement;
  contributionDataEntries?: [string, AggData][];
  emptyLabel?: string;
  emptySubtitle?: string;
  noMoreLabel?: string;
  loadingPlaceholder?: React.ReactNode;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  queryHeaderStyle?: React.CSSProperties;
  hideAddToolbar?: boolean;
  toolbarRef?: React.Ref<HTMLDivElement>;
  toolbarAreaStyle?: React.CSSProperties;
  toolbarStyle?: React.CSSProperties;
  onCreateContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string,
    doc: ContributionDocument
  ) => void;
  onUpdateContribution?: (
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
  onRefresh?: () => void;
}

const StaticContributionList = React.memo(
  (props: PropsWithChildren<StaticContributionListProps>): JSX.Element => {
    const {
      scrollParent,
      contributionDataEntries,
      emptyLabel,
      emptySubtitle,
      noMoreLabel,
      loadingPlaceholder,
      style,
      contentStyle,
      queryHeaderStyle,
      onCreateContribution,
      onUpdateContribution,
      onDeleteContribution,
      onRefresh,
      children,
    } = props;

    const [userState] = useContext(UserContext);
    const { settings, my_recent_contributions } = userState;
    const account = settings?.account;
    const nsfwVisible =
      account === undefined ? undefined : account?.nsfwVisible || false;

    const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
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
    const [sort, setSort] = useState<"new" | "old">(SORT_OPTIONS?.[0] || "new");
    const [rangeFilter, setRangeFilter] = useState<DateRangeFilter>("all");
    const [reloading, setReloading] = useState(false);

    const contentElRef = useRef<HTMLDivElement>();
    const listElRef = useRef<HTMLDivElement>();
    const loadingElRef = useRef<HTMLDivElement>();

    const [editDialogOpen, setEditDialogOpen] = useState<boolean>();
    const [editing, setEditing] = useState(false);
    const [editPitchId, setEditPitchId] = useState<string>();
    const [editPitchDoc, setEditPitchDoc] = useState<ProjectDocument>();
    const [editDoc, setEditDoc] = useState<ContributionDocument>();

    const hasUnsavedChangesRef = useRef(false);

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

    const handleBrowserNavigation = useCallback(
      (
        currState: Record<string, string>,
        prevState?: Record<string, string>
      ) => {
        if (currState?.e !== prevState?.e) {
          setEditDialogOpen(currState?.e === "contribution");
        }
      },
      []
    );
    const [openEditDialog, closeEditDialog] = useDialogNavigation(
      "e",
      handleBrowserNavigation
    );

    const handleCloseCreateDialog = useCallback(async () => {
      if (hasUnsavedChangesRef.current) {
        return;
      }
      setEditDialogOpen(false);
      closeEditDialog();
    }, [closeEditDialog]);

    const handleContribute = useCallback(
      (
        e: React.MouseEvent<Element, MouseEvent>,
        contributionId: string,
        doc: ContributionDocument
      ): void => {
        if (editing) {
          if (onUpdateContribution) {
            onUpdateContribution(e, editPitchId, contributionId, doc);
          }
        } else if (onCreateContribution) {
          onCreateContribution(e, editPitchId, contributionId, doc);
        }
      },
      [editPitchId, editing, onCreateContribution, onUpdateContribution]
    );

    const handleUnsavedChange = useCallback(
      (hasUnsavedChanges: boolean): void => {
        hasUnsavedChangesRef.current = hasUnsavedChanges;
      },
      []
    );

    const queryOptions: {
      nsfw?: boolean;
    } = useMemo(
      () => ({
        nsfw: nsfwVisible,
      }),
      [nsfwVisible]
    );

    const orderedContributionDataEntries = useMemo(
      () =>
        sort === "new"
          ? [...contributionDataEntries].reverse()
          : contributionDataEntries,
      [contributionDataEntries, sort]
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
      await new Promise((resolve) => {
        window.requestAnimationFrame(resolve);
      });
      setReloading(true);
    }, []);

    const handleHideLoadingPlaceholder = useCallback(async () => {
      if (loadingElRef.current) {
        loadingElRef.current.classList.remove("animate");
      }
      setReloading(false);
    }, []);

    const handleLoad = useCallback(
      async (
        options: {
          nsfw?: boolean;
        },
        limit: number
      ): Promise<number> => {
        const { nsfw } = options;

        const start = cursorIndexRef.current;
        const end = Math.min(
          start + limit,
          orderedContributionDataEntries.length
        );

        if (start === end) {
          return 0;
        }

        const nowAge =
          rangeFilter === "all" ? -1 : getAge(new Date(), rangeFilter, true);

        const loadingKeys: string[] = [];
        for (let i = start; i < end; i += 1) {
          const [key, data] = orderedContributionDataEntries[i];
          const kudoedAge =
            rangeFilter === "all"
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
          loadingKeys.map((key) => {
            const [pitchId, contributionId] = key.split("%");
            return new DataStoreRead(
              "pitched_projects",
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
      [orderedContributionDataEntries, rangeFilter]
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
        await handleLoadMoreItems(queryOptions);
        loadingMoreRef.current = false;
        setLoadingMore(loadingMoreRef.current);
      }
    }, [handleLoadMoreItems, queryOptions]);

    const handleRefresh = useCallback(async (): Promise<void> => {
      if (onRefresh) {
        onRefresh();
      }
      if (scrollParent) {
        scrollParent.scrollTo({ top: 0 });
      }
      cursorIndexRef.current = 0;
      contributionDocsRef.current = {};
      chunkMapRef.current = {};
      await handleLoadMoreItems(queryOptions);
    }, [onRefresh, scrollParent, handleLoadMoreItems, queryOptions]);

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
        Object.entries(newContributionDocs).forEach(([key]) => {
          if (chunkMapRef.current[key] === undefined) {
            chunkMapRef.current[key] = lastLoadedChunkRef.current;
          }
        });
        contributionDocsRef.current = newContributionDocs;
        setContributionDocsState(contributionDocsRef.current);
        setChunkMap(chunkMapRef.current);
      }
    }, [my_recent_contributions]);

    const handleReload = useCallback(async () => {
      if (contributionDocsRef.current) {
        await handleShowLoadingPlaceholder();
      }
      cursorIndexRef.current = 0;
      contributionDocsRef.current = {};
      chunkMapRef.current = {};
      loadingMoreRef.current = false;
      noMoreRef.current = false;
      handleLoadMoreItems(queryOptions);
    }, [handleLoadMoreItems, handleShowLoadingPlaceholder, queryOptions]);

    useEffect(() => {
      navigationDispatch(navigationSetTransitioning(false));
      if ([nsfwVisible].some((x) => x === undefined)) {
        return;
      }
      handleReload();
    }, [handleReload, navigationDispatch, nsfwVisible]);

    const handleEditContribution = useCallback(
      async (
        e: React.MouseEvent,
        pitchId: string,
        contributionId: string
      ): Promise<void> => {
        const key = `${pitchId}/${contributionId}`;
        const doc =
          recentContributionDocsRef.current[key] ||
          contributionDocsRef.current[key];
        const DataStoreRead = (
          await import("../../impower-data-store/classes/dataStoreRead")
        ).default;
        const pitchSnapshot = await new DataStoreRead(
          "pitched_projects",
          pitchId
        ).get<ProjectDocument>();
        const pitchDoc = pitchSnapshot.data();
        setEditPitchId(pitchId);
        setEditPitchDoc(pitchDoc);
        setEditDoc(doc);
        setEditing(true);
        setEditDialogOpen(true);
        openEditDialog("contribution", "Edit Contribution");
      },
      [openEditDialog]
    );

    const router = useRouter();

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
            deleted: true,
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
        confirmDialogDispatch(confirmDialogClose());
        // Wait a bit for dialog to close
        await new Promise((resolve) => {
          window.setTimeout(resolve, 1);
        });
        await router.replace(`/p/${pitchId}/c/${contributionId}`);
        if (onDeleteContribution) {
          onDeleteContribution(e, pitchId, contributionId);
        }
      },
      [confirmDialogDispatch, onDeleteContribution, router]
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

    const handleAllowReload = useCallback(() => {
      lastLoadedChunkRef.current = 0;
      cursorIndexRef.current = 0;
      contributionDocsRef.current = {};
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

    const handleGetActiveSortOptionIcon = useCallback((sort?: string) => {
      const icons = getStaticSortOptionIcons();
      const Icon = icons[sort];
      return <Icon />;
    }, []);

    const handleGetActiveFilterOptionIcon = useCallback(
      (rangeFilter?: string) => {
        return rangeFilter === "all" ? (
          <CalendarRegularIcon />
        ) : (
          <CalendarRangeSolidIcon />
        );
      },
      []
    );

    const loading = transitioning || !contributionDocsState || reloading;

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
    const loadingStyle: React.CSSProperties = useMemo(
      () => ({
        visibility: loading ? "visible" : "hidden",
      }),
      [loading]
    );

    return (
      <>
        <StyledListArea style={style}>
          <StyledContent style={contentStyle}>
            <StyledStaticContributionList ref={listElRef} style={listStyle}>
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
                <ContributionListContent
                  scrollParent={scrollParent}
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
                      contributionEntries?.length === 0
                        ? emptyLabel
                        : noMoreLabel
                    }
                    noMoreSubtitle={
                      contributionEntries?.length === 0
                        ? emptySubtitle
                        : undefined
                    }
                    refreshLabel={
                      contributionEntries?.length === 0 ? undefined : `Refresh?`
                    }
                    onScrolledToEnd={handleScrolledToEnd}
                    onRefresh={handleRefresh}
                  />
                )}
                {children}
              </StyledListContent>
            </StyledStaticContributionList>
            <StyledOverlayArea>
              <StyledLoadingArea ref={loadingElRef} style={loadingStyle}>
                {loadingPlaceholder}
              </StyledLoadingArea>
            </StyledOverlayArea>
          </StyledContent>
        </StyledListArea>
        {editDialogOpen !== undefined && (
          <CreateContributionDialog
            open={editDialogOpen}
            pitchId={editPitchId}
            pitchDoc={editPitchDoc}
            doc={editDoc}
            editing={editing}
            onClose={handleCloseCreateDialog}
            onSubmit={handleContribute}
            onUnsavedChange={handleUnsavedChange}
          />
        )}
      </>
    );
  }
);

export default StaticContributionList;
