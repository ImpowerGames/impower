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
import {
  ContributionDocument,
  ContributionType,
  DocumentSnapshot,
  ProjectDocument,
} from "../../impower-data-store";
import DataStoreCache from "../../impower-data-store/classes/dataStoreCache";
import { useDialogNavigation } from "../../impower-dialog";
import { UserContext } from "../../impower-user";
import { RatingFilter } from "../types/ratingFilter";
import AddContributionToolbar from "./AddContributionToolbar";
import ContributionListContent from "./ContributionListContent";
import PitchLoadingProgress from "./PitchLoadingProgress";

const LOAD_MORE_LIMIT = 10;

const CreateContributionDialog = dynamic(
  () => import("./CreateContributionDialog"),
  { ssr: false }
);

const StyledContributionList = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

interface ContributionListProps {
  scrollParent?: HTMLElement;
  pitchId: string;
  pitchDoc: ProjectDocument;
  contributionDocs?: { [id: string]: ContributionDocument };
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
}

const ContributionList = React.memo(
  (props: ContributionListProps): JSX.Element => {
    const pitchedCollection = "pitched_games";

    const {
      scrollParent,
      pitchId,
      pitchDoc,
      contributionDocs,
      toolbarRef,
      toolbarAreaStyle,
      toolbarStyle,
      onCreateContribution,
      onUpdateContribution,
      onDeleteContribution,
    } = props;

    const [userState] = useContext(UserContext);
    const { settings, my_recent_contributions } = userState;
    const account = settings?.account;
    const nsfwVisible = account === null ? null : account?.nsfwVisible;

    const loadingMoreRef = useRef<boolean>();
    const [loadingMore, setLoadingMore] = useState<boolean>();
    const noMoreRef = useRef<boolean>();
    const [noMore, setNoMore] = useState<boolean>();
    const [createContributionDialogOpen, setCreateContributionDialogOpen] =
      useState<boolean>();
    const [editing, setEditing] = useState(false);
    const [createDoc, setCreateDoc] = useState<ContributionDocument>();
    const [createFile, setCreateFile] = useState<globalThis.File>();
    const allowReload = useRef(false);

    const [ratingFilter, setRatingFilter] = useState<RatingFilter>("Best");

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
    }>(contributionDocs);

    const cursorsRef = useRef<DocumentSnapshot<ContributionDocument>>();
    const cacheKeys = useRef<Set<string>>(new Set());

    const recentContributionDocs = my_recent_contributions?.[pitchId];
    const recentContributionDocsRef = useRef(recentContributionDocs);

    const queryOptions: { sort: "rating" | "new"; nsfw?: boolean } = useMemo(
      () => ({
        sort: ratingFilter === "Best" ? "rating" : "new",
        nsfw: nsfwVisible,
      }),
      [nsfwVisible, ratingFilter]
    );

    const hasUnsavedChangesRef = useRef(false);

    const handleBrowserNavigation = useCallback(
      (
        currState: Record<string, string>,
        prevState?: Record<string, string>
      ) => {
        if (currState?.e !== prevState?.e) {
          setCreateContributionDialogOpen(currState?.e === "contribution");
        }
      },
      []
    );
    const [openEditDialog, closeEditDialog] = useDialogNavigation(
      "e",
      handleBrowserNavigation
    );

    const handleSort = useCallback(
      (e: React.MouseEvent, sort: RatingFilter) => {
        allowReload.current = true;
        setRatingFilter(sort);
      },
      []
    );

    const handleLoad = useCallback(
      async (
        id: string,
        options: {
          sort: "rating" | "new";
          nsfw?: boolean;
        },
        limit: number
      ): Promise<number> => {
        const contributionsQuery = (
          await import("../../impower-data-store/utils/contributionsQuery")
        ).default;
        const query = await contributionsQuery(options, pitchedCollection, id);
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
        id: string,
        options: {
          sort: "rating" | "new";
          nsfw?: boolean;
        }
      ) => {
        loadingMoreRef.current = true;
        setLoadingMore(loadingMoreRef.current);
        const limit = LOAD_MORE_LIMIT;
        const loadedCount = await handleLoad(id, options, limit);
        setContributionDocsState(contributionDocsRef.current);
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
      chunkMapRef.current = {};
      const DataStoreCache = (
        await import("../../impower-data-store/classes/dataStoreCache")
      ).default;
      DataStoreCache.instance.clear(...Array.from(cacheKeys.current));
      await handleLoadMoreItems(pitchId, queryOptions);
    }, [scrollParent, handleLoadMoreItems, pitchId, queryOptions]);

    useEffect(() => {
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
        setChunkMap(chunkMapRef.current);
      }
    }, [recentContributionDocs]);

    useEffect(() => {
      if (contributionDocsRef.current && !allowReload.current) {
        return;
      }
      cursorsRef.current = undefined;
      contributionDocsRef.current = {};
      chunkMapRef.current = {};
      loadingMoreRef.current = false;
      noMoreRef.current = false;
      setContributionDocsState(undefined);
      setChunkMap(undefined);
      setNoMore(noMoreRef.current);
      handleLoadMoreItems(pitchId, queryOptions);
    }, [handleLoadMoreItems, queryOptions, pitchId]);

    const handleEditContribution = useCallback(
      async (e: React.MouseEvent, id: string): Promise<void> => {
        setCreateDoc(contributionDocsRef.current?.[id]);
        setEditing(true);
        setCreateContributionDialogOpen(true);
        openEditDialog("contribution", "Edit Contribution");
      },
      [openEditDialog]
    );

    const handleDeleteContribution = useCallback(
      async (e: React.MouseEvent, id: string): Promise<void> => {
        if (contributionDocsRef.current[id]) {
          const newDoc = {
            ...contributionDocsRef.current[id],
            contributed: false,
            delisted: true,
            content: "[deleted]",
            file: { storageKey: "", fileUrl: "" },
            _author: { u: "[deleted]", i: null, h: "#FFFFFF" },
          };
          setContributionDocsState({
            ...contributionDocsRef.current,
            [id]: newDoc,
          });
        }
        if (onDeleteContribution) {
          onDeleteContribution(e, pitchId, id);
        }
      },
      [onDeleteContribution, pitchId]
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

    const handleOpenCreateDialogForm = useCallback(
      async (
        e: React.MouseEvent<Element, MouseEvent>,
        newDoc: ContributionDocument,
        file: globalThis.File
      ): Promise<void> => {
        setCreateDoc(newDoc);
        setCreateFile(file);
        setEditing(false);
        setCreateContributionDialogOpen(true);
        openEditDialog("contribution", "Create Contribution");
      },
      [openEditDialog]
    );

    const handleCloseCreateDialog = useCallback(async () => {
      if (hasUnsavedChangesRef.current) {
        return;
      }
      setCreateContributionDialogOpen(false);
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
      },
      [editing, onCreateContribution, onUpdateContribution, pitchId]
    );

    const handleUnsavedChange = useCallback(
      (hasUnsavedChanges: boolean): void => {
        hasUnsavedChangesRef.current = hasUnsavedChanges;
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

    const contributionTypes: ContributionType[] = useMemo(
      () =>
        pitchDoc?.summary === ""
          ? ["pitch", "story", "image", "audio"]
          : ["story", "image", "audio"],
      [pitchDoc?.summary]
    );

    return (
      <>
        <StyledContributionList>
          <ContributionListContent
            scrollParent={scrollParent}
            pitchId={pitchId}
            pitchDoc={pitchDoc}
            contributionDocs={contributionDocsState}
            chunkMap={chunkMap}
            lastLoadedChunk={lastLoadedChunk}
            sort={ratingFilter}
            onChangeScore={handleChangeScore}
            onKudo={handleKudo}
            onSort={handleSort}
            onEdit={handleEditContribution}
            onDelete={handleDeleteContribution}
          />
          {contributionDocsState && (
            <PitchLoadingProgress
              loadingMore={loadingMore}
              noMore={noMore || contributionEntries?.length === 0}
              noMoreLabel={
                contributionEntries?.length === 0
                  ? `Feeling Inspired?`
                  : `That's all for now!`
              }
              noMoreSubtitle={
                contributionEntries?.length === 0
                  ? `Contribute Something!`
                  : undefined
              }
              refreshLabel={
                contributionEntries?.length === 0 ? undefined : `Refresh?`
              }
              onScrolledToEnd={handleScrolledToEnd}
              onRefresh={handleRefresh}
            />
          )}
          <AddContributionToolbar
            types={contributionTypes}
            toolbarRef={toolbarRef}
            pitchId={pitchId}
            hidden={createContributionDialogOpen}
            onAdd={handleOpenCreateDialogForm}
            style={toolbarStyle}
            toolbarAreaStyle={toolbarAreaStyle}
          />
        </StyledContributionList>
        {createContributionDialogOpen !== undefined && (
          <CreateContributionDialog
            open={createContributionDialogOpen}
            pitchId={pitchId}
            pitchDoc={pitchDoc}
            doc={createDoc}
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
