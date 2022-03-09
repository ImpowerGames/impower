import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { IconButton, MenuItem, Typography } from "@material-ui/core";
import dynamic from "next/dynamic";
import React, { useCallback, useContext, useMemo } from "react";
import CompressRegularIcon from "../../../../resources/icons/regular/compress.svg";
import EllipsisVerticalRegularIcon from "../../../../resources/icons/regular/ellipsis-vertical.svg";
import ExpandRegularIcon from "../../../../resources/icons/regular/expand.svg";
import RocketLaunchRegularIcon from "../../../../resources/icons/regular/rocket-launch.svg";
import TrianglePersonDiggingRegularIcon from "../../../../resources/icons/regular/triangle-person-digging.svg";
import BackwardStepSolidIcon from "../../../../resources/icons/solid/backward-step.svg";
import BackwardSolidIcon from "../../../../resources/icons/solid/backward.svg";
import ForwardStepSolidIcon from "../../../../resources/icons/solid/forward-step.svg";
import ForwardSolidIcon from "../../../../resources/icons/solid/forward.svg";
import PauseSolidIcon from "../../../../resources/icons/solid/pause.svg";
import PlaySolidIcon from "../../../../resources/icons/solid/play.svg";
import { isGameDocument } from "../../../impower-data-store";
import { useDialogNavigation } from "../../../impower-dialog";
import { FontIcon } from "../../../impower-icon";
import { ScreenContext } from "../../../impower-route";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import {
  testControlChange,
  testDebug,
  testLayoutChange,
  testModeChange,
  testPlaybackChange,
} from "../../types/actions/testActions";
import {
  gamePreviewMenuItems,
  GamePreviewMenuItemType,
} from "../../types/info/menus";
import { Control, Mode } from "../../types/state/testState";
import { WindowType } from "../../types/state/windowState";

const DrawerMenu = dynamic(
  () => import("../../../impower-route/components/popups/DrawerMenu"),
  { ssr: false }
);

const StyledToolbar = styled.div`
  display: flex;
  min-height: 0;
  flex: 1;
  display: flex;
  align-items: center;
  border-bottom: 1px solid ${(props): string => props.theme.colors.black40};
  margin-bottom: -1px;
  padding: 0 ${(props): string => props.theme.spacing(1.5)};
`;

const StyledPlaybackControls = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
`;

const StyledLeftArea = styled.div`
  flex: 2;
  display: flex;
  justify-content: flex-start;
`;

const StyledRightArea = styled.div`
  flex: 2;
  display: flex;
  justify-content: flex-end;
`;

const StyledButtonContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: ${(props): string => props.theme.spacing(0.25)};
`;

const StyledButtonTypography = styled(Typography)`
  padding-top: ${(props): string => props.theme.spacing(0.5)};
  font-size: ${(props): string => props.theme.fontSize.small};
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  line-height: 1;
`;

const StyledTitleTypography = styled(Typography)`
  flex: 1;
  display: flex;
  justify-content: center;
  opacity: 0.8;
  white-space: nowrap;
`;

interface PlaybackControlsProps {
  control: Control;
  onSkipBackward: () => void;
  onRewindStart: () => void;
  onRewindStop: () => void;
  onPlay: () => void;
  onPause: () => void;
  onFastForwardStart: () => void;
  onFastForwardStop: () => void;
  onSkipForward: () => void;
}

const PlaybackControls = React.memo(
  (props: PlaybackControlsProps): JSX.Element => {
    const {
      control,
      onSkipBackward,
      onRewindStart,
      onRewindStop,
      onPlay,
      onPause,
      onFastForwardStart,
      onFastForwardStop,
      onSkipForward,
    } = props;

    const theme = useTheme();

    return (
      <StyledPlaybackControls>
        <IconButton onClick={onSkipBackward}>
          <FontIcon
            aria-label="Skip Backward"
            size={theme.fontSize.smallIcon}
            color={theme.colors.white40}
          >
            <BackwardStepSolidIcon />
          </FontIcon>
        </IconButton>
        <IconButton onPointerDown={onRewindStart} onPointerUp={onRewindStop}>
          <FontIcon
            aria-label="Rewind"
            size={theme.fontSize.smallIcon}
            color={theme.colors.white40}
          >
            <BackwardSolidIcon />
          </FontIcon>
        </IconButton>
        <IconButton onClick={control === "Pause" ? onPlay : onPause}>
          <FontIcon
            aria-label={control === "Pause" ? "Play" : "Pause"}
            size={24}
            color={theme.colors.white40}
          >
            {control === "Pause" ? <PlaySolidIcon /> : <PauseSolidIcon />}
          </FontIcon>
        </IconButton>
        <IconButton
          onPointerDown={onFastForwardStart}
          onPointerUp={onFastForwardStop}
        >
          <FontIcon
            aria-label="Fast Forward"
            size={theme.fontSize.smallIcon}
            color={theme.colors.white40}
          >
            <ForwardSolidIcon />
          </FontIcon>
        </IconButton>
        <IconButton onClick={onSkipForward}>
          <FontIcon
            aria-label="Skip Forward"
            size={theme.fontSize.smallIcon}
            color={theme.colors.white40}
          >
            <ForwardStepSolidIcon />
          </FontIcon>
        </IconButton>
      </StyledPlaybackControls>
    );
  }
);

interface TestToolbarProps {
  windowType: WindowType;
}

const TestToolbar = React.memo((props: TestToolbarProps): JSX.Element => {
  const { windowType } = props;

  const { fullscreen, setFullscreen } = useContext(ScreenContext);
  const [state, dispatch] = useContext(ProjectEngineContext);

  const doc = state.project?.data?.doc;

  const [menuOpen, setMenuOpen] = React.useState<boolean>();
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);

  const { mode, control, debug, layout } = state.test;

  const theme = useTheme();

  const handlePlay = useCallback((): void => {
    dispatch(testControlChange("Play"));
  }, [dispatch]);
  const handlePause = useCallback((): void => {
    dispatch(testControlChange("Pause"));
  }, [dispatch]);
  const handleSkipBackward = useCallback((): void => {
    dispatch(testPlaybackChange("SkipBackward"));
  }, [dispatch]);
  const handleSkipForward = useCallback((): void => {
    dispatch(testPlaybackChange("SkipForward"));
  }, [dispatch]);
  const handleRewindStart = useCallback((): void => {
    dispatch(testPlaybackChange("Backward"));
  }, [dispatch]);
  const handleRewindStop = useCallback((): void => {
    dispatch(testPlaybackChange("Default"));
  }, [dispatch]);
  const handleFastForwardStart = useCallback((): void => {
    dispatch(testPlaybackChange("Forward"));
  }, [dispatch]);
  const handleFastForwardStop = useCallback((): void => {
    dispatch(testPlaybackChange("Default"));
  }, [dispatch]);
  const handleChangeTestMode = useCallback(
    (m: Mode): void => {
      if (mode === "Test") {
        dispatch(testControlChange("Play"));
      }
      dispatch(testModeChange(m));
    },
    [dispatch, mode]
  );
  const handleFullscreen = useCallback(
    (value: boolean): void => {
      setFullscreen(value);
    },
    [setFullscreen]
  );
  const handleDebug = useCallback(
    (value: boolean): void => {
      dispatch(testDebug(value));
    },
    [dispatch]
  );
  const handleViewGame = useCallback((): void => {
    dispatch(testLayoutChange("Game"));
  }, [dispatch]);
  const handleViewPage = useCallback((): void => {
    dispatch(testLayoutChange("Page"));
  }, [dispatch]);

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.m !== prevState?.m) {
        setMenuOpen(currState.m === "test-options");
      }
    },
    []
  );
  const [openMenuDialog, closeMenuDialog] = useDialogNavigation(
    "m",
    handleBrowserNavigation
  );

  const handleOpenMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setMenuAnchor(event.currentTarget);
      setMenuOpen(true);
      openMenuDialog("test-options");
    },
    [openMenuDialog]
  );

  const handleCloseMenu = useCallback(() => {
    setMenuAnchor(null);
    setMenuOpen(false);
    closeMenuDialog();
  }, [closeMenuDialog]);

  const handleClickMenu = useCallback(
    (type: GamePreviewMenuItemType) => {
      if (type === GamePreviewMenuItemType.ViewGame) {
        handleViewGame();
      }
      if (type === GamePreviewMenuItemType.ViewPage) {
        handleViewPage();
      }
      if (type === GamePreviewMenuItemType.ShowDebugOverlay) {
        handleDebug(true);
      }
      if (type === GamePreviewMenuItemType.HideDebugOverlay) {
        handleDebug(false);
      }
    },
    [handleDebug, handleViewGame, handleViewPage]
  );

  const isPlayable = isGameDocument(doc);
  const modeTooltip = mode === "Edit" ? "Test Game" : "Edit Game";

  const menuItemKeys: GamePreviewMenuItemType[] = useMemo(
    () =>
      isPlayable
        ? (Object.keys(gamePreviewMenuItems).filter((menuItemType) => {
            if (
              (menuItemType === GamePreviewMenuItemType.ShowDebugOverlay &&
                debug) ||
              (menuItemType === GamePreviewMenuItemType.HideDebugOverlay &&
                !debug)
            ) {
              return false;
            }
            if (
              (menuItemType === GamePreviewMenuItemType.ViewGame &&
                layout === "Game") ||
              (menuItemType === GamePreviewMenuItemType.ViewPage &&
                layout === "Page")
            ) {
              return false;
            }
            return true;
          }) as GamePreviewMenuItemType[])
        : [],
    [debug, isPlayable, layout]
  );

  const title = layout === "Page" ? "Page Preview" : "Game Preview";

  return (
    <StyledToolbar
      style={{
        backgroundColor: mode === "Test" ? "black" : undefined,
      }}
    >
      <StyledLeftArea>
        {isPlayable && windowType !== "Test" && (
          <IconButton
            onClick={(): void =>
              handleChangeTestMode(mode === "Edit" ? "Test" : "Edit")
            }
            style={{ color: theme.colors.white40 }}
          >
            <StyledButtonContent>
              <FontIcon
                aria-label={modeTooltip}
                size={theme.fontSize.smallerIcon}
              >
                {mode === "Edit" ? (
                  <RocketLaunchRegularIcon />
                ) : (
                  <TrianglePersonDiggingRegularIcon />
                )}
              </FontIcon>
              <StyledButtonTypography>
                {mode === "Edit" ? "PLAY" : "EDIT"}
              </StyledButtonTypography>
            </StyledButtonContent>
          </IconButton>
        )}
        {(!isPlayable || windowType === "Test") && (
          <IconButton
            onClick={(): void => handleFullscreen(!fullscreen)}
            style={{ color: theme.colors.white40 }}
          >
            <FontIcon
              aria-label={fullscreen ? "Windowed Mode" : "Fullscreen Mode"}
              size={24}
            >
              {fullscreen ? <CompressRegularIcon /> : <ExpandRegularIcon />}
            </FontIcon>
          </IconButton>
        )}
      </StyledLeftArea>
      {mode === "Edit" && (
        <StyledTitleTypography>{title}</StyledTitleTypography>
      )}
      {mode === "Test" && (
        <PlaybackControls
          control={control}
          onSkipBackward={handleSkipBackward}
          onRewindStart={handleRewindStart}
          onRewindStop={handleRewindStop}
          onPlay={handlePlay}
          onPause={handlePause}
          onFastForwardStart={handleFastForwardStart}
          onFastForwardStop={handleFastForwardStop}
          onSkipForward={handleSkipForward}
        />
      )}
      <StyledRightArea>
        {menuItemKeys?.length > 0 && (
          <>
            <IconButton
              onClick={handleOpenMenu}
              style={{ color: theme.colors.white40 }}
            >
              <FontIcon
                aria-label="More Options"
                size={theme.fontSize.smallIcon}
              >
                <EllipsisVerticalRegularIcon />
              </FontIcon>
            </IconButton>
            {menuOpen !== undefined && (
              <DrawerMenu
                anchorEl={menuAnchor}
                open={menuOpen}
                onClose={handleCloseMenu}
              >
                {menuItemKeys.map((menuItemType) => (
                  <MenuItem
                    key={menuItemType}
                    onClick={(): void => {
                      handleCloseMenu();
                      window.setTimeout(
                        () => handleClickMenu(menuItemType),
                        100
                      );
                    }}
                  >
                    {gamePreviewMenuItems[menuItemType]}
                  </MenuItem>
                ))}
              </DrawerMenu>
            )}
          </>
        )}
      </StyledRightArea>
    </StyledToolbar>
  );
});

export default TestToolbar;
