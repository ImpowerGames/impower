import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { IconButton, Typography } from "@material-ui/core";
import dynamic from "next/dynamic";
import React, { useCallback, useContext, useMemo, useState } from "react";
import BrowserRegularIcon from "../../../../resources/icons/regular/browser.svg";
import BugSlashRegularIcon from "../../../../resources/icons/regular/bug-slash.svg";
import BugRegularIcon from "../../../../resources/icons/regular/bug.svg";
import CirclePlayRegularIcon from "../../../../resources/icons/regular/circle-play.svg";
import CircleQuestionRegularIcon from "../../../../resources/icons/regular/circle-question.svg";
import CompressRegularIcon from "../../../../resources/icons/regular/compress.svg";
import DownloadRegularIcon from "../../../../resources/icons/regular/download.svg";
import EllipsisVerticalRegularIcon from "../../../../resources/icons/regular/ellipsis-vertical.svg";
import ExpandRegularIcon from "../../../../resources/icons/regular/expand.svg";
import GamepadRegularIcon from "../../../../resources/icons/regular/gamepad.svg";
import TrianglePersonDiggingRegularIcon from "../../../../resources/icons/regular/triangle-person-digging.svg";
import UploadRegularIcon from "../../../../resources/icons/regular/upload.svg";
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
  testDebug,
  testLayoutChange,
  testModeChange,
  testPause,
  testPlaybackChange,
} from "../../types/actions/testActions";
import { Mode } from "../../types/state/testState";
import { WindowType } from "../../types/state/windowState";

export enum GamePreviewMenuItemType {
  Page = "Page",
  Debug = "Debug",
  SaveGameState = "SaveGameState",
  LoadGameState = "LoadGameState",
}

const ContextMenu = dynamic(
  () => import("../../../impower-route/components/popups/ContextMenu"),
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
  paused: boolean;
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
      paused,
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
        <IconButton onClick={paused ? onPlay : onPause}>
          <FontIcon
            aria-label={paused ? "Play" : "Pause"}
            size={24}
            color={theme.colors.white40}
          >
            {paused ? <PlaySolidIcon /> : <PauseSolidIcon />}
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

  const { mode, paused, debug, layout, compiling } = state.test;

  const isCompiling = compiling[windowType];

  const theme = useTheme();

  const menuOptions: {
    key: string;
    label: string;
    icon: React.ReactNode;
  }[] = useMemo(
    () => [
      layout === "Game"
        ? {
            key: "preview_page",
            label: "Preview Page",
            icon: <BrowserRegularIcon />,
          }
        : {
            key: "preview_game",
            label: "Preview Game",
            icon: <GamepadRegularIcon />,
          },
      debug
        ? {
            key: "debug_disable",
            label: "Disable Debug",
            icon: <BugSlashRegularIcon />,
          }
        : {
            key: "debug_enable",
            label: "Enable Debug",
            icon: <BugRegularIcon />,
          },
      {
        key: "save",
        label: "Save Game",
        icon: <DownloadRegularIcon />,
      },
      { key: "load", label: "Load Game", icon: <UploadRegularIcon /> },
    ],
    [debug, layout]
  );

  const [optionsMenuAnchorEl, setOptionsMenuAnchorEl] =
    React.useState<HTMLElement | null>(null);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState<boolean>();
  const [menuOptionsState, setMenuOptionsState] = useState(menuOptions);

  const handlePlay = useCallback((): void => {
    dispatch(testPause(false));
  }, [dispatch]);
  const handlePause = useCallback((): void => {
    dispatch(testPause(true));
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
        dispatch(testPause(false));
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
  const handleView = useCallback(
    (layout: "Page" | "Game"): void => {
      dispatch(testLayoutChange(layout));
    },
    [dispatch]
  );

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.m !== prevState?.m) {
        setOptionsMenuOpen(currState.m === "options");
      }
    },
    []
  );
  const [openMenuDialog, closeMenuDialog] = useDialogNavigation(
    "m",
    handleBrowserNavigation
  );

  const handleCloseContextMenu = useCallback((): void => {
    setOptionsMenuOpen(false);
    closeMenuDialog();
  }, [closeMenuDialog]);

  const handleOpenContextMenu = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      e.preventDefault();
      setMenuOptionsState([...menuOptions]);
      setOptionsMenuAnchorEl(e.currentTarget as HTMLElement);
      setOptionsMenuOpen(true);
      openMenuDialog("options");
    },
    [menuOptions, openMenuDialog]
  );

  const handleClickMenu = useCallback(
    (e: React.MouseEvent<Element, MouseEvent>, type: string) => {
      if (type === "preview_page") {
        handleView("Page");
      }
      if (type === "preview_game") {
        handleView("Game");
      }
      if (type === "debug_enable") {
        handleDebug(true);
      }
      if (type === "debug_disable") {
        handleDebug(false);
      }
    },
    [handleDebug, handleView]
  );

  const isPlayable = isGameDocument(doc);
  const modeTooltip = mode === "Edit" ? "Test Game" : "Edit Game";

  const menuItemKeys = useMemo(
    () => (isPlayable ? Object.keys(menuOptions) : []),
    [isPlayable, menuOptions]
  );

  const title = layout === "Page" ? "Page Preview" : "Game Preview";

  return (
    <StyledToolbar
      style={{
        backgroundColor: mode === "Test" ? "black" : undefined,
      }}
    >
      <StyledLeftArea>
        {isPlayable && windowType !== "test" && (
          <IconButton
            onClick={(): void =>
              handleChangeTestMode(mode === "Edit" ? "Test" : "Edit")
            }
            disabled={isCompiling}
            style={{
              color: theme.colors.white40,
            }}
          >
            <StyledButtonContent>
              <FontIcon
                aria-label={modeTooltip}
                size={theme.fontSize.smallerIcon}
              >
                {mode === "Edit" ? (
                  isCompiling ? (
                    <CircleQuestionRegularIcon />
                  ) : (
                    <CirclePlayRegularIcon />
                  )
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
        {(!isPlayable || windowType === "test") && (
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
          paused={paused}
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
              onClick={handleOpenContextMenu}
              style={{ color: theme.colors.white40 }}
            >
              <FontIcon
                aria-label="More Options"
                size={theme.fontSize.smallIcon}
              >
                <EllipsisVerticalRegularIcon />
              </FontIcon>
            </IconButton>
            {optionsMenuOpen !== undefined && (
              <ContextMenu
                anchorReference="anchorEl"
                anchorEl={optionsMenuAnchorEl}
                open={optionsMenuOpen}
                options={menuOptionsState}
                onOption={handleClickMenu}
                onClose={handleCloseContextMenu}
              />
            )}
          </>
        )}
      </StyledRightArea>
    </StyledToolbar>
  );
});

export default TestToolbar;
