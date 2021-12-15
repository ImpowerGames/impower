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
import {
  confirmDialogClose,
  ConfirmDialogContext,
} from "../../impower-confirm-dialog";
import { Timestamp } from "../../impower-core";
import {
  ContributionDocument,
  ContributionType,
  DocumentSnapshot,
  ProjectDocument,
  QuerySort,
} from "../../impower-data-store";
import DataStoreCache from "../../impower-data-store/classes/dataStoreCache";
import { useDialogNavigation } from "../../impower-dialog";
import { NavigationContext } from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";
import { useRouter } from "../../impower-router";
import { UserContext } from "../../impower-user";
import { ContributionTypeFilter } from "../types/contributionTypeFilter";
import AddContributionToolbar from "./AddContributionToolbar";
import ContributionListContent from "./ContributionListContent";
import ContributionListQueryHeader from "./ContributionListQueryHeader";
import PitchLoadingProgress from "./PitchLoadingProgress";

const contributionTypes: ContributionType[] = [
  "pitch",
  "story",
  "image",
  "audio",
];

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

const CreateContributionDialog = dynamic(
  () => import("./CreateContributionDialog"),
  { ssr: false }
);

const LOAD_MORE_LIMIT = 10;

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

const StyledContributionList = styled.div`
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

interface ContributionListProps {
  scrollParent?: HTMLElement;
  pitchId?: string;
  pitchDoc?: ProjectDocument;
  creator?: string;
  contributionDocs?: { [key: string]: ContributionDocument };
  toolbarRef?: React.Ref<HTMLDivElement>;
  toolbarAreaStyle?: React.CSSProperties;
  toolbarStyle?: React.CSSProperties;
  sortOptions?: QuerySort[];
  emptyLabel?: string;
  emptySubtitle?: string;
  noMoreLabel?: string;
  loadingPlaceholder?: React.ReactNode;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  queryHeaderStyle?: React.CSSProperties;
  hideAddToolbar?: boolean;
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
}

const ContributionList = React.memo(
  (props: PropsWithChildren<ContributionListProps>): JSX.Element => {
    const {
      scrollParent,
      pitchId,
      pitchDoc,
      creator,
      contributionDocs,
      toolbarRef,
      toolbarAreaStyle,
      toolbarStyle,
      sortOptions,
      emptyLabel,
      emptySubtitle,
      noMoreLabel,
      loadingPlaceholder,
      hideAddToolbar,
      style,
      contentStyle,
      queryHeaderStyle,
      onCreateContribution,
      onUpdateContribution,
      onDeleteContribution,
      children,
    } = props;

    const [userState] = useContext(UserContext);
    const { uid, settings, my_recent_contributions } = userState;
    const account = settings?.account;
    const nsfwVisible =
      account === undefined ? undefined : account?.nsfwVisible || false;

    const [typeFilter, setTypeFilter] = useState<ContributionTypeFilter>("all");
    const [sort, setSort] = useState<QuerySort>(sortOptions?.[0] || "rating");
    const [reloading, setReloading] = useState(false);

    const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
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
    const [chunkMapState, setChunkMapState] = useState<{
      [id: string]: number;
    }>(chunkMapRef.current);

    const lastLoadedChunkRef = useRef(0);
    const [lastLoadedChunkState, setLastLoadedChunkState] = useState(
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

    const [editDialogOpen, setEditDialogOpen] = useState<boolean>();
    const [editing, setEditing] = useState(false);
    const [editPitchId, setEditPitchId] = useState<string>(pitchId);
    const [editPitchDoc, setEditPitchDoc] = useState<ProjectDocument>(pitchDoc);
    const [editDoc, setEditDoc] = useState<ContributionDocument>();
    const [createFile, setCreateFile] = useState<globalThis.File>();

    const hasUnsavedChangesRef = useRef(false);

    const userContributionDocsRef = useRef<{
      [id: string]: ContributionDocument;
    }>({});
    const [userContributionDocsState, setUserContributionDocsState] = useState<{
      [id: string]: ContributionDocument;
    }>();

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

    const validContributionDocsState = useMemo(() => {
      const docs: { [key: string]: ContributionDocument } = {
        ...contributionDocsState,
        ...userContributionDocsState,
        ...recentContributionDocs,
      };
      const result: { [id: string]: ContributionDocument } = {};
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
            (!typeFilter ||
              typeFilter === "all" ||
              typeFilter === doc?.contributionType) &&
            (!creator || creator === doc?._createdBy)
          ) {
            result[key] = doc;
          }
        });
      return result;
    }, [
      contributionDocsState,
      creator,
      recentContributionDocs,
      sort,
      typeFilter,
      userContributionDocsState,
    ]);

    useEffect(() => {
      if (recentContributionDocs) {
        Object.entries(recentContributionDocs).forEach(([id, doc]) => {
          userContributionDocsRef.current[id] = doc;
        });
        setUserContributionDocsState({ ...userContributionDocsRef.current });
      }
    }, [recentContributionDocs]);

    const handleLoadUserContributions = useCallback(
      (docs: { [id: string]: ContributionDocument }) => {
        userContributionDocsRef.current = {
          ...(recentContributionDocs || {}),
          ...docs,
          ...(recentContributionDocs || {}),
        };
        setUserContributionDocsState({ ...userContributionDocsRef.current });
      },
      [recentContributionDocs]
    );

    useEffect(() => {
      if (uid === undefined) {
        return;
      }
      if (!uid || !pitchId) {
        handleLoadUserContributions({});
        return;
      }
      const getData = async (): Promise<void> => {
        const DataStoreQuery = (
          await import("../../impower-data-store/classes/dataStoreQuery")
        ).default;
        try {
          const snapshot = await new DataStoreQuery(
            "pitched_projects",
            pitchId,
            "contributions"
          )
            .where("_createdBy", "==", uid)
            .orderBy("_createdAt", "desc")
            .limit(100)
            .get();
          const newDocs = {};
          snapshot.docs.forEach((d) => {
            const pitchId = d.ref.parent.parent.id;
            const contributionId = d.id;
            newDocs[`${pitchId}/${contributionId}`] = d.data();
          });
          handleLoadUserContributions(newDocs);
        } catch (e) {
          const logError = (await import("../../impower-logger/utils/logError"))
            .default;
          logError("DataStore", e);
        }
      };

      getData();
    }, [uid, handleLoadUserContributions, pitchId]);

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

    const handleEditContribution = useCallback(
      async (
        e: React.MouseEvent,
        pitchId: string,
        contributionId: string
      ): Promise<void> => {
        const key = `${pitchId}/${contributionId}`;
        const doc = validContributionDocsState[key];
        let parentPitchDoc = pitchDoc;
        if (!parentPitchDoc) {
          const DataStoreRead = (
            await import("../../impower-data-store/classes/dataStoreRead")
          ).default;
          const pitchSnapshot = await new DataStoreRead(
            "pitched_projects",
            pitchId
          ).get<ProjectDocument>();
          parentPitchDoc = pitchSnapshot.data();
        }
        setEditPitchId(pitchId);
        setEditPitchDoc(parentPitchDoc);
        setEditDoc(doc);
        setEditing(true);
        setEditDialogOpen(true);
        openEditDialog("contribution", "Edit Contribution");
      },
      [openEditDialog, pitchDoc, validContributionDocsState]
    );

    const handleOpenCreateDialogForm = useCallback(
      async (
        e: React.MouseEvent<Element, MouseEvent>,
        newDoc: ContributionDocument,
        file: globalThis.File
      ): Promise<void> => {
        const contributionId = `${uid}-${newDoc.contributionType}`;
        const existingContributionKey = `${pitchId}/${contributionId}`;
        const existingDoc =
          validContributionDocsState?.[existingContributionKey];
        setEditPitchId(pitchId);
        setEditPitchDoc(pitchDoc);
        setEditDoc({ ...newDoc, deleted: existingDoc?.deleted || false });
        setCreateFile(file);
        setEditing(false);
        setEditDialogOpen(true);
        openEditDialog("contribution", "Create Contribution");
      },
      [validContributionDocsState, openEditDialog, pitchDoc, pitchId, uid]
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
            onUpdateContribution(e, pitchId, contributionId, doc);
          }
        } else if (onCreateContribution) {
          onCreateContribution(e, pitchId, contributionId, doc);
        }
        contributionDocsRef.current[`${pitchId}/${contributionId}`] = doc;
        setContributionDocsState({ ...contributionDocsRef.current });
      },
      [editing, onCreateContribution, onUpdateContribution, pitchId]
    );

    const handleUnsavedChange = useCallback(
      (hasUnsavedChanges: boolean): void => {
        hasUnsavedChangesRef.current = hasUnsavedChanges;
      },
      []
    );

    const queryOptions: {
      filter: ContributionType;
      sort: QuerySort;
      nsfw?: boolean;
      creator?: string;
    } = useMemo(
      () => ({
        filter: typeFilter === "all" ? undefined : typeFilter,
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
          creator?: string;
        },
        limit: number
      ): Promise<number> => {
        const contributionsQuery = (
          await import("../../impower-data-store/utils/contributionsQuery")
        ).default;
        const query = pitchId
          ? await contributionsQuery(options, "pitched_projects", pitchId)
          : uid === creator
          ? await contributionsQuery({ ...options, nsfw: undefined }, undefined)
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
        const { filter } = options;
        const matchingRecentDocs: { [id: string]: ContributionDocument } = {};
        Object.entries(recentContributionDocsRef.current || {}).forEach(
          ([id, doc]) => {
            if (
              (!filter || filter === doc?.contributionType) &&
              (!creator || creator === doc?._createdBy)
            ) {
              matchingRecentDocs[id] = doc;
            }
          }
        );
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
      [creator, uid]
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
        setChunkMapState(chunkMapRef.current);
        noMoreRef.current = loadedCount < limit;
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
        setLastLoadedChunkState(lastLoadedChunkRef.current);
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
        await new Promise((resolve) => setTimeout(resolve, 1));
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

    const pitchDocs = useMemo(
      () => (pitchId && pitchDoc ? { [pitchId]: pitchDoc } : undefined),
      [pitchId, pitchDoc]
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
            <StyledContributionList ref={listElRef} style={listStyle}>
              <StyledListContent ref={contentElRef} style={listContentStyle}>
                <ContributionListQueryHeader
                  filter={typeFilter}
                  sort={sort}
                  sortOptions={sortOptions}
                  onFilter={handleFilter}
                  onSort={handleSort}
                  style={queryHeaderStyle}
                />
                <ContributionListContent
                  scrollParent={scrollParent}
                  pitchDocs={pitchDocs}
                  contributionDocs={validContributionDocsState}
                  chunkMap={chunkMapState}
                  lastLoadedChunk={lastLoadedChunkState}
                  onChangeScore={handleChangeScore}
                  onKudo={handleKudo}
                  onEdit={handleEditContribution}
                  onDelete={handleDeleteContribution}
                />
                {validContributionDocsState && (
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
                {!hideAddToolbar && pitchId && (
                  <AddContributionToolbar
                    types={contributionTypes}
                    toolbarRef={toolbarRef}
                    pitchId={pitchId}
                    userContributionDocs={userContributionDocsState}
                    hidden={editDialogOpen}
                    onAdd={handleOpenCreateDialogForm}
                    style={toolbarStyle}
                    toolbarAreaStyle={toolbarAreaStyle}
                  />
                )}
                {children}
              </StyledListContent>
            </StyledContributionList>
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
            file={createFile}
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

export default ContributionList;
