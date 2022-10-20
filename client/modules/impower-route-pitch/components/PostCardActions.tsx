import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import CardActions from "@mui/material/CardActions";
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
import HandshakeSimpleDuotoneIcon from "../../../resources/icons/duotone/handshake-simple.svg";
import CommentAltHeartRegularIcon from "../../../resources/icons/regular/comment-alt-heart.svg";
import HandshakeSimpleRegularIcon from "../../../resources/icons/regular/handshake-simple.svg";
import ShareNodesRegularIcon from "../../../resources/icons/regular/share-nodes.svg";
import SquarePlusRegularIcon from "../../../resources/icons/regular/square-plus.svg";
import ThumbsDownRegularIcon from "../../../resources/icons/regular/thumbs-down.svg";
import ThumbsUpRegularIcon from "../../../resources/icons/regular/thumbs-up.svg";
import CommentAltHeartSolidIcon from "../../../resources/icons/solid/comment-alt-heart.svg";
import HandshakeSimpleSolidIcon from "../../../resources/icons/solid/handshake-simple.svg";
import SquarePlusSolidIcon from "../../../resources/icons/solid/square-plus.svg";
import ThumbsDownSolidIcon from "../../../resources/icons/solid/thumbs-down.svg";
import ThumbsUpSolidIcon from "../../../resources/icons/solid/thumbs-up.svg";
import { abbreviateCount } from "../../impower-config";
import { useDialogNavigation } from "../../impower-dialog";
import { FontIcon } from "../../impower-icon";
import { UserContext } from "../../impower-user";

const StyledCardActions = styled(CardActions)`
  color: inherit;
  background-color: white;
  pointer-events: auto;
  align-items: stretch;
  justify-content: space-between;
  padding: ${(props): string => props.theme.spacing(2, 0, 2, 2)};
`;

const StyledActionButton = styled(Button)`
  color: inherit;
  text-transform: none;
  min-width: ${(props): string => props.theme.spacing(6)};
  max-height: ${(props): string => props.theme.spacing(4)};
  justify-content: flex-start;
  padding: ${(props): string => props.theme.spacing(1, 0.5)};
  flex: 1;
`;

const StyledIconButtonArea = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledIconButton = styled(IconButton)`
  padding: ${(props): string => props.theme.spacing(1, 1)};
  color: inherit;
  @media (hover: hover) and (pointer: fine) {
    &.MuiIconButton-root:hover {
      background-color: ${(props): string => props.theme.colors.black10};
    }
  }
`;

const StyledButtonTypography = styled(Typography)`
  white-space: pre;
  overflow-wrap: break-word;
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
`;

const StyledSecondaryButtonTypography = styled(StyledButtonTypography)`
  opacity: 0.7;
`;

const StyledCollapsibleButtonTypography = styled(Typography)`
  white-space: pre;
  overflow-wrap: break-word;
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  opacity: 0.7;
`;

const StyledTypography = styled(Typography)`
  white-space: pre;
  overflow-wrap: break-word;
`;

const StyledCounter = styled.div`
  pointer-events: none;
  min-height: 100%;
  position: relative;

  min-width: ${(props): string => props.theme.spacing(5)};
`;

const StyledCounterContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  text-transform: uppercase;
`;

const StyledButtonIconArea = styled.div`
  opacity: 0.5;
  margin-right: ${(props): string => props.theme.spacing(0.75)};
`;

const StyledScoreArea = styled.div`
  display: flex;
  margin-right: ${(props): string => props.theme.spacing(3)};
`;

const StyledScoreContent = styled.div`
  display: flex;
  will-change: transform;
`;

const StyledActionContent = styled.div`
  flex: 1;
  display: flex;
  justify-content: flex-end;
  min-width: ${(props): string => props.theme.spacing(21)};
  max-width: ${(props): string => props.theme.spacing(25)};
  position: relative;
`;

const StyledOpenedActionContent = styled.div`
  flex: 1;
  display: flex;
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  visibility: hidden;
`;

const StyledClosedActionContent = styled.div`
  flex: 1;
  display: flex;
`;

interface ScoreAreaProps {
  score?: number;
  liked?: boolean;
  disliked?: boolean;
  voteDisabled?: boolean;
  onLike?: (e: React.MouseEvent) => void;
  onDislike?: (e: React.MouseEvent) => void;
  onBlockRipplePropogation?: (e: React.MouseEvent | React.TouchEvent) => void;
}

const ScoreArea = React.memo((props: ScoreAreaProps) => {
  const {
    score,
    liked,
    disliked,
    voteDisabled,
    onLike,
    onDislike,
    onBlockRipplePropogation,
  } = props;

  const theme = useTheme();

  const iconSize = 16;

  const voteIconStyle: React.CSSProperties = useMemo(
    () => ({ transition: "color 0.3s ease" }),
    []
  );

  const voteCounterStyle: React.CSSProperties = useMemo(
    () => ({
      fontWeight: theme.fontWeight.semiBold,
      transition: "color 0.3s ease",
      color: !voteDisabled
        ? score < 0
          ? theme.colors.dislike
          : theme.colors.like
        : theme.palette.grey[400],
    }),
    [
      score,
      theme.colors.dislike,
      theme.colors.like,
      theme.fontWeight.semiBold,
      theme.palette.grey,
      voteDisabled,
    ]
  );

  return (
    <StyledScoreArea>
      <StyledScoreContent>
        <StyledIconButtonArea>
          <StyledIconButton
            disabled={voteDisabled}
            onClick={onLike}
            onMouseDown={onBlockRipplePropogation}
            onTouchStart={onBlockRipplePropogation}
          >
            <FontIcon
              aria-label="Upvote"
              size={iconSize}
              color={voteDisabled ? theme.palette.grey[300] : theme.colors.like}
              style={voteIconStyle}
            >
              {liked ? <ThumbsUpSolidIcon /> : <ThumbsUpRegularIcon />}
            </FontIcon>
          </StyledIconButton>
        </StyledIconButtonArea>
        <StyledCounter>
          <StyledCounterContent>
            <StyledTypography variant="caption" style={voteCounterStyle}>
              {score !== undefined ? abbreviateCount(score) : `-`}
            </StyledTypography>
          </StyledCounterContent>
        </StyledCounter>
        <StyledIconButtonArea>
          <StyledIconButton
            disabled={voteDisabled}
            onClick={onDislike}
            onMouseDown={onBlockRipplePropogation}
            onTouchStart={onBlockRipplePropogation}
          >
            <FontIcon
              aria-label="Downvote"
              size={iconSize}
              color={
                voteDisabled ? theme.palette.grey[300] : theme.colors.dislike
              }
              style={voteIconStyle}
            >
              {disliked ? <ThumbsDownSolidIcon /> : <ThumbsDownRegularIcon />}
            </FontIcon>
          </StyledIconButton>
        </StyledIconButtonArea>
      </StyledScoreContent>
    </StyledScoreArea>
  );
});

interface ConnectButtonProps {
  connectedTo?: boolean;
  connectedFrom?: boolean;
  iconOnly?: boolean;
  onConnect?: (e: React.MouseEvent) => void;
  onBlockRipplePropogation?: (e: React.MouseEvent | React.TouchEvent) => void;
}

const ConnectButton = React.memo((props: ConnectButtonProps) => {
  const {
    connectedTo,
    connectedFrom,
    iconOnly,
    onConnect,
    onBlockRipplePropogation,
  } = props;

  const theme = useTheme();

  const connectButtonStyle: React.CSSProperties = useMemo(
    () => ({
      color: connectedTo ? theme.colors.connect : undefined,
      justifyContent: iconOnly ? undefined : "center",
      padding: iconOnly ? undefined : theme.spacing(1, 1),
      marginRight: iconOnly ? undefined : theme.spacing(2),
      opacity: onConnect ? 1 : 0,
      pointerEvents: onConnect ? undefined : "none",
      transition: "opacity 0.3 ease",
    }),
    [connectedTo, onConnect, iconOnly, theme]
  );

  const connectButtonIconAreaStyle: React.CSSProperties = useMemo(
    () => ({
      opacity: connectedTo ? 1 : undefined,
    }),
    [connectedTo]
  );

  return (
    <StyledActionButton
      onClick={onConnect}
      onMouseDown={onBlockRipplePropogation}
      onTouchStart={onBlockRipplePropogation}
      style={connectButtonStyle}
    >
      <StyledButtonIconArea style={connectButtonIconAreaStyle}>
        <FontIcon
          aria-label="Connected"
          color={connectedTo ? theme.colors.connect : undefined}
          size={20}
        >
          {connectedTo && connectedFrom ? (
            <HandshakeSimpleSolidIcon />
          ) : connectedTo ? (
            <HandshakeSimpleDuotoneIcon />
          ) : (
            <HandshakeSimpleRegularIcon />
          )}
        </FontIcon>
      </StyledButtonIconArea>
      {!iconOnly && (
        <StyledSecondaryButtonTypography variant="overline">
          {connectedTo && connectedFrom
            ? `Connected!`
            : connectedTo
            ? `Requested`
            : `Connect`}
        </StyledSecondaryButtonTypography>
      )}
    </StyledActionButton>
  );
});

interface ClosedActionsListProps {
  connectedTo?: boolean;
  connectedFrom?: boolean;
  kudoed?: boolean;
  contributed?: boolean;
  kudoCount?: number;
  contributionCount?: number;
  onConnect?: (e: React.MouseEvent) => void;
  onShare?: (e: React.MouseEvent) => void;
  onKudo?: (e: React.MouseEvent) => void;
  onContribute?: (e: React.MouseEvent) => void;
  onBlockRipplePropogation?: (e: React.MouseEvent | React.TouchEvent) => void;
}

const ClosedActionsList = React.memo((props: ClosedActionsListProps) => {
  const {
    connectedTo,
    connectedFrom,
    kudoed,
    contributed,
    kudoCount,
    contributionCount,
    onConnect,
    onShare,
    onKudo,
    onContribute,
    onBlockRipplePropogation,
  } = props;

  const theme = useTheme();

  const iconSize = 16;

  const kudoButtonIconAreaStyle: React.CSSProperties = useMemo(
    () => ({
      color: kudoed ? theme.colors.kudo : undefined,
      opacity: kudoed ? 1 : undefined,
    }),
    [kudoed, theme.colors.kudo]
  );

  const contributeButtonIconAreaStyle: React.CSSProperties = useMemo(
    () => ({
      color: contributed ? theme.colors.contribute : undefined,
      opacity: contributed ? 1 : undefined,
    }),
    [contributed, theme.colors.contribute]
  );

  return (
    <>
      {onShare ? (
        <StyledActionButton
          onClick={onShare}
          onMouseDown={onBlockRipplePropogation}
          onTouchStart={onBlockRipplePropogation}
        >
          <StyledButtonIconArea>
            <FontIcon aria-label="Share" size={iconSize}>
              <ShareNodesRegularIcon />
            </FontIcon>
          </StyledButtonIconArea>
        </StyledActionButton>
      ) : (
        <ConnectButton
          connectedTo={connectedTo}
          connectedFrom={connectedFrom}
          iconOnly
          onConnect={onConnect}
          onBlockRipplePropogation={onBlockRipplePropogation}
        />
      )}
      {onKudo && (
        <StyledActionButton
          onClick={onKudo}
          onMouseDown={onBlockRipplePropogation}
          onTouchStart={onBlockRipplePropogation}
        >
          <StyledButtonIconArea style={kudoButtonIconAreaStyle}>
            <FontIcon aria-label="Kudos" size={iconSize}>
              {kudoed ? (
                <CommentAltHeartSolidIcon />
              ) : (
                <CommentAltHeartRegularIcon />
              )}
            </FontIcon>
          </StyledButtonIconArea>
          {Boolean(kudoCount) && (
            <StyledCollapsibleButtonTypography variant="caption">
              {abbreviateCount(kudoCount)}
            </StyledCollapsibleButtonTypography>
          )}
        </StyledActionButton>
      )}
      {onContribute && (
        <StyledActionButton
          onClick={onContribute}
          onMouseDown={onBlockRipplePropogation}
          onTouchStart={onBlockRipplePropogation}
        >
          <StyledButtonIconArea style={contributeButtonIconAreaStyle}>
            <FontIcon aria-label="Contribute" size={iconSize}>
              {contributed ? (
                <SquarePlusSolidIcon />
              ) : (
                <SquarePlusRegularIcon />
              )}
            </FontIcon>
          </StyledButtonIconArea>
          {Boolean(contributionCount) && (
            <StyledCollapsibleButtonTypography variant="caption">
              {abbreviateCount(contributionCount)}
            </StyledCollapsibleButtonTypography>
          )}
        </StyledActionButton>
      )}
    </>
  );
});

interface OpenedActionsListProps {
  connectedTo?: boolean;
  connectedFrom?: boolean;
  onConnect?: (e: React.MouseEvent) => void;
  onBlockRipplePropogation?: (e: React.MouseEvent | React.TouchEvent) => void;
}

const OpenedActionsList = React.memo((props: OpenedActionsListProps) => {
  const { connectedTo, connectedFrom, onConnect, onBlockRipplePropogation } =
    props;

  return (
    <ConnectButton
      connectedTo={connectedTo}
      connectedFrom={connectedFrom}
      onConnect={onConnect}
      onBlockRipplePropogation={onBlockRipplePropogation}
    />
  );
});

interface PostCardActionsProps {
  openedActionsRef?: React.Ref<HTMLDivElement>;
  closedActionsRef?: React.Ref<HTMLDivElement>;
  createdBy?: string;
  kudoed?: boolean;
  contributed?: boolean;
  liked?: boolean;
  disliked?: boolean;
  connectedTo?: boolean;
  connectedFrom?: boolean;
  contributionCount?: number;
  kudoCount?: number;
  score?: number;
  allowKudo?: boolean;
  allowContribute?: boolean;
  style?: React.CSSProperties;
  openedActionsStyle?: React.CSSProperties;
  closedActionsStyle?: React.CSSProperties;
  onOpen?: (e: React.MouseEvent, action: "contribute" | "kudo") => void;
  onOpenShareMenu?: (e: React.MouseEvent) => void;
  onLike?: (e: React.MouseEvent, liked: boolean) => void;
  onDislike?: (e: React.MouseEvent, disliked: boolean) => void;
  onConnect?: (e: React.MouseEvent, connected: boolean) => void;
  onChangeScore?: (e: React.MouseEvent, score: number) => void;
}

const PostCardActions = React.memo(
  (props: PostCardActionsProps): JSX.Element => {
    const {
      openedActionsRef,
      closedActionsRef,
      createdBy,
      score,
      allowKudo,
      allowContribute,
      kudoed,
      contributed,
      liked,
      disliked,
      connectedTo,
      connectedFrom,
      contributionCount,
      kudoCount,
      style,
      openedActionsStyle,
      closedActionsStyle,
      onOpen,
      onOpenShareMenu,
      onLike,
      onDislike,
      onConnect,
      onChangeScore,
    } = props;

    const [openAccountDialog] = useDialogNavigation("a");

    const [userState] = useContext(UserContext);
    const { uid, settings } = userState;
    const account = settings?.account;
    const contact = account === undefined ? undefined : account?.contact || "";
    const authenticated = uid !== undefined ? Boolean(uid) : undefined;
    const scoreRef = useRef(score);
    const likedRef = useRef(liked);
    const dislikedRef = useRef(disliked);

    const [scoreState, setScoreState] = useState(score);
    const [likedState, setLikedState] = useState(liked);
    const [dislikedState, setDislikedState] = useState(disliked);
    const [connectedToState, setConnectedToState] = useState(connectedTo);

    useEffect(() => {
      setConnectedToState(connectedTo);
    }, [connectedTo]);

    if (likedRef.current === undefined && liked !== undefined) {
      likedRef.current = liked;
      setLikedState(likedRef.current);
    }
    if (dislikedRef.current === undefined && disliked !== undefined) {
      dislikedRef.current = disliked;
      setDislikedState(dislikedRef.current);
    }

    const handleBlockRipplePropogation = useCallback(
      (e: React.MouseEvent | React.TouchEvent): void => {
        e.stopPropagation();
      },
      []
    );

    const handleContribute = useCallback(
      (e: React.MouseEvent): void => {
        e.stopPropagation();
        if (onOpen) {
          onOpen(e, "contribute");
        }
      },
      [onOpen]
    );

    const handleKudo = useCallback(
      (e: React.MouseEvent): void => {
        e.stopPropagation();
        if (onOpen) {
          onOpen(e, "kudo");
        }
      },
      [onOpen]
    );

    const handleLike = useCallback(
      (e: React.MouseEvent): void => {
        e.stopPropagation();
        if (!authenticated) {
          openAccountDialog("signup");
          return;
        }
        likedRef.current = !likedRef.current;
        setLikedState(likedRef.current);
        if (onLike) {
          onLike(e, likedRef.current);
        }
        if (likedRef.current && dislikedRef.current) {
          scoreRef.current += 2;
          setScoreState(scoreRef.current);
        } else if (likedRef.current && !dislikedRef.current) {
          scoreRef.current += 1;
          setScoreState(scoreRef.current);
        } else {
          scoreRef.current -= 1;
          setScoreState(scoreRef.current);
        }
        if (onChangeScore) {
          onChangeScore(e, scoreRef.current);
        }
        if (dislikedRef.current) {
          dislikedRef.current = false;
          setDislikedState(dislikedRef.current);
          if (onDislike) {
            onDislike(e, dislikedRef.current);
          }
        }
      },
      [authenticated, onChangeScore, onDislike, onLike, openAccountDialog]
    );

    const handleDislike = useCallback(
      (e: React.MouseEvent): void => {
        e.stopPropagation();
        if (!authenticated) {
          openAccountDialog("signup");
          return;
        }
        if (onDislike) {
          dislikedRef.current = !dislikedRef.current;
          setDislikedState(dislikedRef.current);
          onDislike(e, dislikedRef.current);
        }
        if (dislikedRef.current && likedRef.current) {
          scoreRef.current -= 2;
          setScoreState(scoreRef.current);
        } else if (dislikedRef.current && !likedRef.current) {
          scoreRef.current -= 1;
          setScoreState(scoreRef.current);
        } else {
          scoreRef.current += 1;
          setScoreState(scoreRef.current);
        }
        if (onChangeScore) {
          onChangeScore(e, scoreRef.current);
        }
        if (likedRef.current) {
          likedRef.current = false;
          setLikedState(likedRef.current);
          if (onLike) {
            onLike(e, likedRef.current);
          }
        }
      },
      [authenticated, onChangeScore, onDislike, onLike, openAccountDialog]
    );

    const handleConnect = useCallback(
      (e: React.MouseEvent): void => {
        e.stopPropagation();
        if (!authenticated) {
          openAccountDialog("signup");
          return;
        }
        if (onConnect) {
          const newConnectedTo = !connectedToState;
          if (newConnectedTo) {
            if (!contact) {
              openAccountDialog(`contact_${createdBy}`);
              return;
            }
          }
          setConnectedToState(newConnectedTo);
          onConnect(e, newConnectedTo);
        }
      },
      [
        authenticated,
        connectedToState,
        contact,
        createdBy,
        onConnect,
        openAccountDialog,
      ]
    );

    const isCreator = createdBy === uid;

    const loadingUser = uid === undefined;
    const voteDisabled =
      loadingUser || liked === undefined || disliked === undefined;
    const hideConnect = voteDisabled || loadingUser || isCreator;

    const openedActionContentStyle: React.CSSProperties = useMemo(
      () => ({
        visibility:
          (!allowKudo && allowContribute) || (allowKudo && !allowContribute)
            ? "visible"
            : undefined,
        ...openedActionsStyle,
      }),
      [allowContribute, allowKudo, openedActionsStyle]
    );

    const closedActionContentStyle: React.CSSProperties = useMemo(
      () => ({
        visibility:
          (!allowKudo && allowContribute) || (allowKudo && !allowContribute)
            ? "hidden"
            : undefined,
        ...closedActionsStyle,
      }),
      [allowContribute, allowKudo, closedActionsStyle]
    );

    return (
      <StyledCardActions disableSpacing style={style}>
        <ScoreArea
          score={scoreState}
          liked={likedState}
          disliked={dislikedState}
          voteDisabled={voteDisabled}
          onLike={handleLike}
          onDislike={handleDislike}
          onBlockRipplePropogation={handleBlockRipplePropogation}
        />
        <StyledActionContent>
          <StyledOpenedActionContent
            ref={openedActionsRef}
            style={openedActionContentStyle}
          >
            <OpenedActionsList
              connectedTo={connectedToState}
              connectedFrom={connectedFrom}
              onConnect={hideConnect ? undefined : handleConnect}
              onBlockRipplePropogation={handleBlockRipplePropogation}
            />
          </StyledOpenedActionContent>
          <StyledClosedActionContent
            ref={closedActionsRef}
            style={closedActionContentStyle}
          >
            <ClosedActionsList
              kudoed={kudoed}
              contributed={contributed}
              kudoCount={kudoCount}
              contributionCount={contributionCount}
              connectedTo={connectedTo}
              connectedFrom={connectedFrom}
              onShare={onOpenShareMenu}
              onConnect={hideConnect ? undefined : handleConnect}
              onKudo={allowKudo ? handleKudo : undefined}
              onContribute={allowContribute ? handleContribute : undefined}
              onBlockRipplePropogation={handleBlockRipplePropogation}
            />
          </StyledClosedActionContent>
        </StyledActionContent>
      </StyledCardActions>
    );
  }
);
export default PostCardActions;
