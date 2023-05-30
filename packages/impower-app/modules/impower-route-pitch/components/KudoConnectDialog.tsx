import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { DialogProps } from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import XmarkSolidIcon from "../../../resources/icons/solid/xmark.svg";
import { AggData } from "../../impower-data-state";
import {
  ContributionDocument,
  getDataStoreKey,
  ProjectDocument,
} from "../../impower-data-store";
import { FontIcon } from "../../impower-icon";
import { UserContext } from "../../impower-user";
import KudoListContent from "./KudoListContent";
import PitchDialog from "./PitchDialog";
import PitchLoadingProgress from "./PitchLoadingProgress";

const LOAD_MORE_LIMIT = 50;

const StyledDialogContent = styled.div`
  overflow-y: scroll;
`;

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

const StyledHeader = styled.div`
  min-height: ${(props): string => props.theme.spacing(7)};
  z-index: 1;
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  min-height: ${(props): string => props.theme.spacing(7)};
  display: flex;
  align-items: center;
  background-color: white;
  box-shadow: ${(props): string => props.theme.shadows[2]};
`;

const StyledHeaderTextArea = styled.div`
  flex: 1;
  padding: ${(props): string => props.theme.spacing(0, 1)};
`;

const StyledHeaderTypography = styled(Typography)<{ component?: string }>``;

const StyledIconButton = styled(IconButton)`
  padding: ${(props): string => props.theme.spacing(2)};
  @media (hover: hover) and (pointer: fine) {
    &.MuiIconButton-root:hover {
      background-color: ${(props): string => props.theme.colors.black10};
    }
  }
`;

interface KudoConnectDialogProps extends Omit<DialogProps, "maxWidth"> {
  scrollParent?: HTMLElement;
  pitchId: string;
  contributionId: string;
  targetDoc: ProjectDocument | ContributionDocument;
}

const KudoConnectDialog = React.memo((props: KudoConnectDialogProps) => {
  const {
    scrollParent,
    pitchId,
    contributionId,
    targetDoc,
    open,
    onClose,
    ...dialogProps
  } = props;

  const [userState] = useContext(UserContext);
  const { uid, my_kudos, claims } = userState;
  const username = claims?.username;
  const icon = claims?.icon;
  const hex = claims?.hex;

  const loadingMoreRef = useRef<boolean>();
  const [loadingMore, setLoadingMore] = useState<boolean>();
  const noMoreRef = useRef<boolean>();
  const [noMore, setNoMore] = useState<boolean>();

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

  const kudosRef = useRef<{ [id: string]: AggData }>();
  const [kudosState, setKudosState] = useState<{ [id: string]: AggData }>(
    kudosRef.current
  );
  const cursorRef = useRef<string>();

  const kudoKey =
    pitchId && contributionId
      ? getDataStoreKey(
          "pitched_projects",
          pitchId,
          "contributions",
          contributionId
        )
      : getDataStoreKey("pitched_projects", pitchId);
  const existingKudo = my_kudos?.[kudoKey];

  useEffect(() => {
    const newKudos = { ...kudosRef.current };
    if (existingKudo) {
      newKudos[uid] = {
        ...existingKudo,
        a: { u: username, i: icon, h: hex },
      };
    } else {
      delete newKudos[uid];
    }
    kudosRef.current = newKudos;
    setKudosState(kudosRef.current);
  }, [username, existingKudo, icon, uid, hex]);

  const timeLoaded = useMemo(() => new Date().getTime(), []);

  const handleLoad = useCallback(
    async (limit: number): Promise<number> => {
      const DataStateQuery = (
        await import("../../impower-data-state/classes/dataStateQuery")
      ).default;
      const query =
        pitchId && contributionId
          ? new DataStateQuery(
              "pitched_projects",
              pitchId,
              "contributions",
              contributionId,
              "agg",
              "kudos",
              "data"
            ).orderByChild("t")
          : new DataStateQuery(
              "pitched_projects",
              pitchId,
              "agg",
              "kudos",
              "data"
            ).orderByChild("t");
      const cursor = cursorRef.current;
      const cursorQuery = cursor
        ? query.endBefore(timeLoaded, cursor).limitToLast(limit)
        : query.endAt(timeLoaded).limitToLast(limit);
      const snapshot = await cursorQuery.get();
      const data: { [id: string]: AggData } = {};
      snapshot.forEach((s) => {
        data[s.key] = s.val();
      });
      cursorRef.current = Object.keys(data)?.[0];
      const currentKudos = kudosRef.current || {};
      const newKudos = { ...currentKudos };
      const newKeys = Object.keys(data);
      newKeys.reverse().forEach((id) => {
        if (!newKudos[id]) {
          newKudos[id] = data[id];
        }
        if (chunkMapRef.current[id] === undefined) {
          chunkMapRef.current[id] = lastLoadedChunkRef.current;
        }
      });
      kudosRef.current = newKudos;
      return newKeys.length;
    },
    [pitchId, contributionId, timeLoaded]
  );

  const handleLoadMoreItems = useCallback(async () => {
    loadingMoreRef.current = true;
    setLoadingMore(loadingMoreRef.current);
    const limit = LOAD_MORE_LIMIT;
    const loadedCount = await handleLoad(limit);
    noMoreRef.current = loadedCount < limit;
    setNoMore(noMoreRef.current);
    setKudosState(kudosRef.current);
    setChunkMap(chunkMapRef.current);
    loadingMoreRef.current = false;
    setLoadingMore(loadingMoreRef.current);
  }, [handleLoad]);

  const handleScrolledToEnd = useCallback(async (): Promise<void> => {
    if (kudosRef.current && !noMoreRef.current && !loadingMoreRef.current) {
      lastLoadedChunkRef.current += 1;
      setLastLoadedChunk(lastLoadedChunkRef.current);
      await handleLoadMoreItems();
    }
  }, [handleLoadMoreItems]);

  const handleReload = useCallback(async (): Promise<void> => {
    cursorRef.current = undefined;
    kudosRef.current = {};
    chunkMapRef.current = {};
    loadingMoreRef.current = undefined;
    noMoreRef.current = undefined;
    setKudosState(kudosRef.current);
    setChunkMap(chunkMapRef.current);
    setNoMore(noMoreRef.current);
    setLoadingMore(false);
    await handleLoadMoreItems();
  }, [handleLoadMoreItems]);

  const handleRefresh = useCallback(async (): Promise<void> => {
    if (scrollParent) {
      scrollParent.scrollTo({ top: 0 });
    }
    cursorRef.current = undefined;
    kudosRef.current = {};
    chunkMapRef.current = {};
    await handleLoadMoreItems();
  }, [handleLoadMoreItems, scrollParent]);

  useEffect(() => {
    handleReload();
  }, [handleReload]);

  const kudoEntries = useMemo(
    () => (kudosState ? Object.entries(kudosState) : undefined),
    [kudosState]
  );

  const theme = useTheme();

  const handleClose = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (onClose) {
        onClose(e, "backdropClick");
      }
    },
    [onClose]
  );
  return (
    <>
      <PitchDialog open={open} onClose={onClose} {...dialogProps}>
        <StyledDialogContent>
          <StyledHeader>
            <StyledIconButton onClick={handleClose}>
              <FontIcon
                aria-label={`Close`}
                color={theme.palette.secondary.main}
              >
                <XmarkSolidIcon />
              </FontIcon>
            </StyledIconButton>
            <StyledHeaderTextArea>
              <StyledHeaderTypography variant="h6" component="h2">
                {`Kudos`}
              </StyledHeaderTypography>
            </StyledHeaderTextArea>
          </StyledHeader>
          <StyledKudoList>
            <StyledListContent>
              <KudoListContent
                pitchId={pitchId}
                contributionId={contributionId}
                targetDoc={targetDoc}
                kudos={kudosState}
                chunkMap={chunkMap}
                lastLoadedChunk={lastLoadedChunk}
              />
              {kudosState && (
                <PitchLoadingProgress
                  loadingMore={loadingMore}
                  noMore={noMore || kudoEntries?.length === 0}
                  noMoreLabel={
                    kudoEntries?.length === 0 ? `No Kudos` : undefined
                  }
                  onScrolledToEnd={handleScrolledToEnd}
                  onRefresh={handleRefresh}
                />
              )}
            </StyledListContent>
          </StyledKudoList>
        </StyledDialogContent>
      </PitchDialog>
    </>
  );
});

export default KudoConnectDialog;
