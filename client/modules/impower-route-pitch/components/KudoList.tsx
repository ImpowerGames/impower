import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DataPath } from "../../impower-api";
import { AuthorAttributes } from "../../impower-auth";
import { AggData, useCollectionDataLoad } from "../../impower-data-state";
import {
  ContributionDocument,
  DocumentSnapshot,
  getDataStoreKey,
  ProjectDocument,
} from "../../impower-data-store";
import { NoteDocument } from "../../impower-data-store/types/documents/noteDocument";
import { useDialogNavigation } from "../../impower-dialog";
import { FadeAnimation } from "../../impower-route";
import { UserContext } from "../../impower-user";
import AddKudoToolbar from "./AddKudoToolbar";
import NoteCardLayout from "./NoteCardLayout";
import NoteListContent from "./NoteListContent";
import PitchLoadingProgress from "./PitchLoadingProgress";

const KudoConnectDialog = dynamic(() => import("./KudoConnectDialog"), {
  ssr: false,
});

const LOAD_MORE_LIMIT = 50;
const AUTHOR_LOAD_LIMIT = 2;
const AUTHOR_DISPLAY_LIMIT = 1;

const StyledKudoList = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledListContent = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledCardArea = styled(FadeAnimation)``;

const StyledOthersButton = styled(Button)`
  text-transform: none;
  margin: ${(props): string => props.theme.spacing(0, -1)};
  padding: ${(props): string => props.theme.spacing(0, 1)};
  min-width: 0;
`;

const StyledSingleLineTypography = styled(Typography)`
  white-space: pre;
  overflow: hidden;
  flex-shrink: 0;
`;

interface KudoListProps {
  scrollParent?: HTMLElement;
  pitchId: string;
  contributionId: string;
  targetDoc: ProjectDocument | ContributionDocument;
  notes?: { [id: string]: NoteDocument };
  kudoCount?: number;
  toolbarRef?: React.Ref<HTMLDivElement>;
  toolbarAreaStyle?: React.CSSProperties;
  toolbarStyle?: React.CSSProperties;
  onKudo?: (
    e: React.MouseEvent | React.ChangeEvent,
    kudoed: boolean,
    pitchId: string,
    contributionId: string,
    data: AggData
  ) => void;
}

const KudoList = React.memo((props: KudoListProps): JSX.Element => {
  const pitchedCollection = "pitched_games";

  const {
    scrollParent,
    pitchId,
    contributionId,
    targetDoc,
    notes,
    kudoCount,
    toolbarRef,
    toolbarAreaStyle,
    toolbarStyle,
    onKudo,
  } = props;

  const [userState] = useContext(UserContext);
  const { uid, userDoc, my_kudos, settings } = userState;
  const account = settings?.account;
  const nsfwVisible =
    account === undefined ? undefined : account?.nsfwVisible || false;

  const loadingMoreRef = useRef<boolean>();
  const [loadingMore, setLoadingMore] = useState<boolean>();
  const noMoreRef = useRef<boolean>();
  const [noMore, setNoMore] = useState<boolean>();
  const [kudoConnectDialogOpen, setKudoConnectDialogOpen] = useState<boolean>();

  const initialChunkMap = useMemo(() => {
    const chunkMap = {};
    Object.keys(notes || {}).forEach((id) => {
      chunkMap[id] = 0;
    });
    return chunkMap;
  }, [notes]);

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

  const notesRef = useRef<{ [id: string]: NoteDocument }>(notes);
  const [notesState, setNotesState] = useState<{ [id: string]: NoteDocument }>(
    notesRef.current
  );
  const authorsRef = useRef<{ [id: string]: AuthorAttributes }>();
  const [authors, setAuthors] = useState<{ [id: string]: AuthorAttributes }>(
    authorsRef.current
  );
  const cursorRef = useRef<DocumentSnapshot<NoteDocument>>();

  const targetPath: DataPath =
    pitchId && contributionId
      ? [pitchedCollection, pitchId, "contributions", contributionId]
      : [pitchedCollection, pitchId];
  const kudoKey =
    pitchId && contributionId
      ? getDataStoreKey(...targetPath)
      : getDataStoreKey(...targetPath);
  const existingKudo = my_kudos?.[kudoKey];
  const existingKudoRef = useRef<AggData>(
    existingKudo
      ? {
          ...existingKudo,
          a: {
            u: userDoc?.username,
            i: userDoc?.icon?.fileUrl,
            h: userDoc?.hex,
          },
        }
      : existingKudo
  );
  const recentNote: NoteDocument = useMemo(
    () =>
      existingKudo === undefined || uid === undefined
        ? undefined
        : existingKudo?.c && uid
        ? {
            _documentType: "NoteDocument",
            _createdBy: uid,
            _createdAt: new Date(existingKudo?.t).toJSON(),
            _author: {
              u: userDoc?.username,
              i: userDoc?.icon?.fileUrl,
              h: userDoc?.hex,
            },
            content: existingKudo?.c,
          }
        : null,
    [existingKudo, uid, userDoc?.hex, userDoc?.icon?.fileUrl, userDoc?.username]
  );
  const recentNotesRef = useRef<{ [id: string]: NoteDocument }>(
    recentNote === undefined
      ? undefined
      : recentNote
      ? {
          [uid]: recentNote,
        }
      : {}
  );

  const handleAuthorsLoad = useCallback(
    async (data: { [id: string]: AggData }): Promise<void> => {
      const result = {};
      Object.entries(data)
        .reverse()
        .forEach(([id, aggData]) => {
          result[id] = aggData?.a;
        });
      if (existingKudoRef.current) {
        result[uid] = existingKudoRef.current?.a;
      } else {
        delete result[uid];
      }
      authorsRef.current = result;
      setAuthors(authorsRef.current);
    },
    [uid]
  );

  useCollectionDataLoad(
    handleAuthorsLoad,
    {
      orderByChild: "t",
      limitToLast: AUTHOR_LOAD_LIMIT,
    },
    ...targetPath,
    "agg",
    "kudos",
    "data"
  );

  useEffect(() => {
    const newRecentNotes = {};
    const newNotes = { [uid]: undefined, ...(notesRef.current || {}) };
    const newAuthors = { [uid]: undefined, ...(authorsRef.current || {}) };
    if (recentNote) {
      newRecentNotes[uid] = recentNote;
      newNotes[uid] = recentNote;
    } else {
      delete newRecentNotes[uid];
      delete newNotes[uid];
    }
    const author = {
      u: userDoc?.username,
      i: userDoc?.icon?.fileUrl,
      h: userDoc?.hex,
    };
    if (existingKudo) {
      newAuthors[uid] = author;
    } else {
      delete newAuthors[uid];
    }
    notesRef.current = newNotes;
    authorsRef.current = newAuthors;
    recentNotesRef.current = newRecentNotes;
    existingKudoRef.current = {
      ...existingKudo,
      a: author,
    };
    setNotesState(notesRef.current);
    setAuthors(authorsRef.current);
  }, [
    existingKudo,
    recentNote,
    uid,
    userDoc?.hex,
    userDoc?.icon?.fileUrl,
    userDoc?.username,
  ]);

  const handleLoad = useCallback(
    async (
      options: { nsfw?: boolean; creator?: string },
      limit: number
    ): Promise<number> => {
      const notesQuery = (
        await import("../../impower-data-store/utils/notesQuery")
      ).default;
      const query =
        pitchId && contributionId
          ? await notesQuery(
              options,
              pitchedCollection,
              pitchId,
              "contributions",
              contributionId
            )
          : await notesQuery(options, pitchedCollection, pitchId);
      const cursor = cursorRef.current;
      const cursorQuery = cursor
        ? query.startAfter(cursor).limit(limit)
        : query.limit(limit);
      const snapshot = await cursorQuery.get<NoteDocument>();
      const { docs } = snapshot;
      const cursorIndex = docs.length - 1;
      const lastSnapshot = docs[cursorIndex] || null;
      cursorRef.current = lastSnapshot;
      const currentDocs = notesRef.current || {};
      const matchingRecentDocs = recentNotesRef.current || {};
      const newDocs = {
        ...matchingRecentDocs,
        ...currentDocs,
      };
      docs.forEach((d) => {
        newDocs[d.id] = d.data();
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
      notesRef.current = newDocs;
      return docs.length;
    },
    [pitchId, contributionId]
  );

  const handleLoadMoreItems = useCallback(
    async (options: { nsfw?: boolean; creator?: string }) => {
      loadingMoreRef.current = true;
      setLoadingMore(loadingMoreRef.current);
      const limit = LOAD_MORE_LIMIT;
      const loadedCount = await handleLoad(options, LOAD_MORE_LIMIT);
      noMoreRef.current = loadedCount < limit;
      setNoMore(noMoreRef.current);
      setNotesState(notesRef.current);
      setChunkMap(chunkMapRef.current);
      loadingMoreRef.current = false;
      setLoadingMore(loadingMoreRef.current);
    },
    [handleLoad]
  );

  const handleScrolledToEnd = useCallback(async (): Promise<void> => {
    if (notesRef.current && !noMoreRef.current && !loadingMoreRef.current) {
      lastLoadedChunkRef.current += 1;
      setLastLoadedChunk(lastLoadedChunkRef.current);
      await handleLoadMoreItems({ nsfw: nsfwVisible });
    }
  }, [handleLoadMoreItems, nsfwVisible]);

  const handleReload = useCallback(async (): Promise<void> => {
    cursorRef.current = undefined;
    notesRef.current = {};
    chunkMapRef.current = {};
    loadingMoreRef.current = undefined;
    noMoreRef.current = undefined;
    setNotesState(notesRef.current);
    setChunkMap(chunkMapRef.current);
    setNoMore(noMoreRef.current);
    setLoadingMore(false);
    await handleLoadMoreItems({ nsfw: nsfwVisible });
  }, [handleLoadMoreItems, nsfwVisible]);

  const handleRefresh = useCallback(async (): Promise<void> => {
    if (scrollParent) {
      scrollParent.scrollTo({ top: 0 });
    }
    cursorRef.current = undefined;
    notesRef.current = {};
    chunkMapRef.current = {};
    await handleLoadMoreItems({ nsfw: nsfwVisible });
  }, [handleLoadMoreItems, nsfwVisible, scrollParent]);

  useEffect(() => {
    if ([nsfwVisible].some((x) => x === undefined)) {
      return;
    }
    handleReload();
  }, [handleReload, nsfwVisible]);

  const notesEntries = useMemo(
    () => (notesState ? Object.entries(notesState) : undefined),
    [notesState]
  );
  const othersCount = kudoCount - AUTHOR_DISPLAY_LIMIT;

  const handleKudo = useCallback(
    (
      e: React.MouseEvent<Element, MouseEvent> | React.ChangeEvent<Element>,
      kudoed: boolean,
      pitchId: string,
      contributionId: string,
      data: AggData
    ) => {
      const newRecentNotes = {};
      const newNotes = { [uid]: undefined, ...(notesRef.current || {}) };
      const newAuthors = { [uid]: undefined, ...(authorsRef.current || {}) };
      if (kudoed && data?.c) {
        const newNote: NoteDocument = {
          _documentType: "NoteDocument",
          _createdBy: uid,
          _createdAt: new Date().toJSON(),
          _author: {
            u: userDoc?.username,
            i: userDoc?.icon?.fileUrl,
            h: userDoc?.hex,
          },
          content: data?.c,
        };
        newRecentNotes[uid] = newNote;
        newNotes[uid] = newNote;
      } else {
        delete newRecentNotes[uid];
        delete newNotes[uid];
      }
      if (kudoed) {
        newAuthors[uid] = {
          u: userDoc?.username,
          i: userDoc?.icon?.fileUrl,
          h: userDoc?.hex,
        };
      } else {
        delete newAuthors[uid];
      }
      notesRef.current = newNotes;
      authorsRef.current = newAuthors;
      recentNotesRef.current = newRecentNotes;
      setNotesState(notesRef.current);
      setAuthors(authorsRef.current);
      if (onKudo) {
        onKudo(e, kudoed, pitchId, contributionId, data);
      }
    },
    [onKudo, uid, userDoc?.hex, userDoc?.icon?.fileUrl, userDoc?.username]
  );

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.l !== prevState?.l) {
        setKudoConnectDialogOpen(currState?.l === "contribution");
      }
    },
    []
  );
  const [openListDialog, closeListDialog] = useDialogNavigation(
    "l",
    handleBrowserNavigation
  );

  const handleOpenKudoConnectDialog = useCallback(() => {
    setKudoConnectDialogOpen(true);
    openListDialog("kudos", "Kudos");
  }, [openListDialog]);

  const handleCloseKudoConnectDialog = useCallback(() => {
    setKudoConnectDialogOpen(false);
    closeListDialog();
  }, [closeListDialog]);

  return (
    <>
      <StyledKudoList>
        <StyledListContent>
          {kudoCount > 0 && authors && Object.keys(authors).length > 0 && (
            <StyledCardArea initial={0} animate={1} duration={0.15}>
              <NoteCardLayout
                pitchId={pitchId}
                contributionId={contributionId}
                targetCreatedBy={targetDoc?._createdBy}
                authors={authors}
                authorDisplayLimit={AUTHOR_DISPLAY_LIMIT}
                details={
                  <>
                    {kudoCount === 1 ? (
                      <StyledSingleLineTypography variant="body2">{` loves this!`}</StyledSingleLineTypography>
                    ) : othersCount === 1 ? (
                      <>
                        <StyledSingleLineTypography variant="body2">{` and `}</StyledSingleLineTypography>
                        <StyledOthersButton
                          color="inherit"
                          onClick={handleOpenKudoConnectDialog}
                        >{`${othersCount} other`}</StyledOthersButton>
                        <StyledSingleLineTypography variant="body2">{` love this!`}</StyledSingleLineTypography>
                      </>
                    ) : othersCount > 1 ? (
                      <>
                        <StyledSingleLineTypography variant="body2">{` and `}</StyledSingleLineTypography>
                        <StyledOthersButton
                          color="inherit"
                          onClick={handleOpenKudoConnectDialog}
                        >{`${othersCount} others`}</StyledOthersButton>
                        <StyledSingleLineTypography variant="body2">{` love this!`}</StyledSingleLineTypography>
                      </>
                    ) : (
                      <StyledSingleLineTypography variant="body2">
                        {` love this!`}
                      </StyledSingleLineTypography>
                    )}
                  </>
                }
              />
            </StyledCardArea>
          )}
          <NoteListContent
            pitchId={pitchId}
            contributionId={contributionId}
            targetDoc={targetDoc}
            notes={notesState}
            chunkMap={chunkMap}
            lastLoadedChunk={lastLoadedChunk}
          />
          {notesState && (
            <PitchLoadingProgress
              loadingMore={loadingMore}
              noMore={noMore || notesEntries?.length === 0}
              noMoreLabel={!kudoCount ? `No Kudos` : undefined}
              onScrolledToEnd={handleScrolledToEnd}
              onRefresh={handleRefresh}
            />
          )}
        </StyledListContent>
        <AddKudoToolbar
          toolbarRef={toolbarRef}
          pitchId={pitchId}
          contributionId={contributionId}
          onKudo={handleKudo}
          style={toolbarStyle}
          toolbarAreaStyle={toolbarAreaStyle}
        />
      </StyledKudoList>
      {kudoConnectDialogOpen !== undefined && (
        <KudoConnectDialog
          open={kudoConnectDialogOpen}
          pitchId={pitchId}
          contributionId={contributionId}
          targetDoc={targetDoc}
          onClose={handleCloseKudoConnectDialog}
        />
      )}
    </>
  );
});

export default KudoList;
