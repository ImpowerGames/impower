import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import useMediaQuery from "@mui/material/useMediaQuery";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MemberAccess } from "../../impower-data-state";
import { isGameDocument } from "../../impower-data-store";
import { NavigationContext } from "../../impower-navigation";
import {
  BottomNavigationBar,
  layout,
  PageNavigationBar,
  Portal,
  ScreenContext,
  TopLevelTransition,
  TransitionState,
  useTransitionAnimation,
} from "../../impower-route";
import NavigationBarSpacer from "../../impower-route/components/elements/NavigationBarSpacer";
import useIOS from "../../impower-route/hooks/useIOS";
import useVisualViewport from "../../impower-route/hooks/useVisualViewport";
import { ProjectEngineContext } from "../contexts/projectEngineContext";
import { WindowTransitionContext } from "../contexts/transitionContext";
import { panelSetPaneSize } from "../types/actions/panelActions";
import {
  testLayoutChange,
  testModeChange,
  testPause,
  testPlayerVisibility,
} from "../types/actions/testActions";
import { windowSwitch } from "../types/actions/windowActions";
import { windows } from "../types/info/windows";
import { PanelType } from "../types/state/panelState";
import { WindowType } from "../types/state/windowState";
import SnippetToolbar from "./bars/SnippetToolbar";
import Pane from "./layouts/Pane";
import SplitPane from "./layouts/SplitPane";
import TestToolbar from "./toolbars/TestToolbar";

/**
 * Gets all panel types that should be visible in the current layout according to pane count, window type, and data selection counts.
 * @returns [[...LeftPanels], [...RightPanels]]
 */
const getVisiblePanels = (
  portrait: boolean,
  windowType: WindowType
): PanelType[][] => {
  if (portrait) {
    switch (windowType) {
      case "setup":
        return [[], ["setup", "detail"]];
      case "assets":
        return [[], ["assets"]];
      case "logic":
        return [[], ["logic"]];
      case "test":
        return [[], ["test"]];
      default:
        return [[], []];
    }
  }
  switch (windowType) {
    case "setup":
      return [["setup", "detail"], ["test"]];
    case "assets":
      return [["assets"], ["test"]];
    case "logic":
      return [["logic"], ["test"]];
    case "test":
      return [[], ["test"]];
    default:
      return [[], []];
  }
};

const getPanelbar = (
  windowType: WindowType,
  visiblePanels: PanelType[]
): JSX.Element | null => {
  if (visiblePanels && visiblePanels[0] === "test") {
    return <TestToolbar windowType={windowType} />;
  }
  return null;
};

const StyledProject = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  opacity: 0;
  transition: opacity 0.2s ease;
`;

const StyledProjectTopArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledProjectContentArea = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const StyledProjectContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  flex: 1;
  display: flex;
`;

const StyledSplitPane = styled(SplitPane)`
  .Resizer {
    z-index: 100;
    background-color: ${(props): string => props.theme.colors.white00};
    transition: all 0.2s ease;
    position: relative;
  }

  @media (hover: hover) and (pointer: fine) {
    .Resizer:hover {
      transition: all 0.2s ease;
    }
  }

  .Resizer.horizontal {
    height: 8px;
    cursor: row-resize;
    width: 100%;
  }

  @media (hover: hover) and (pointer: fine) {
    .Resizer.horizontal:hover {
      background-color: ${(props): string => props.theme.colors.white05};
    }
  }

  .Resizer.vertical {
    z-index: 100;
    width: 8px;
    left: 8px;
    margin-left: -8px;
  }
`;

const StyledFixedViewport = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  pointer-events: none;
  z-index: 1;
  transform: translateZ(0);
  will-change: transform;
  height: 100vh;

  & {
    touch-action: none;
    overscroll-behavior: contain;
  }
  & * {
    touch-action: none;
    overscroll-behavior: contain;
  }
`;

const StyledViewportSpacer = styled.div`
  flex: 1;
  pointer-events: none;
`;

const StyledToolbarArea = styled.div`
  pointer-events: none;
  position: relative;
  min-height: ${(props): string => props.theme.minHeight.navigationBar};
  max-height: ${(props): string => props.theme.minHeight.navigationBar};
`;

const StyledToolbarContent = styled.div`
  pointer-events: none;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
`;

interface ProjectContentProps {
  windowType: WindowType;
}

const ProjectContent = (props: ProjectContentProps): JSX.Element => {
  const { windowType } = props;

  const { fullscreen } = useContext(ScreenContext);
  const { portrait } = useContext(WindowTransitionContext);
  const [state, dispatch] = useContext(ProjectEngineContext);

  const savedPaneSize = state?.panel?.paneSize;
  const openDataPanel = state?.panel?.panels?.[windowType]?.openPanel;

  const ref = useRef<HTMLDivElement>();
  const leftPane = useRef<HTMLDivElement>(null);
  const rightPane = useRef<HTMLDivElement>(null);
  const animatingTimeoutHandle = useRef(-1);

  const visiblePanels = getVisiblePanels(portrait, windowType);
  const sortedPanelFocusOrder: PanelType[][] = [];
  visiblePanels.forEach((area) => {
    const sortedPanels = area.filter((p) => p !== openDataPanel);
    if (area.includes(openDataPanel)) {
      sortedPanels.unshift(openDataPanel);
    }
    sortedPanelFocusOrder.push(sortedPanels);
  });

  const leftPaneOpen = sortedPanelFocusOrder[0].length > 0;
  const rightPaneOpen = sortedPanelFocusOrder[1].length > 0;

  const isLeftLayoutEmpty = !leftPaneOpen;
  const isRightLayoutEmpty = !rightPaneOpen;

  const allowVerticalResize = !fullscreen && !isLeftLayoutEmpty;

  const forcedVerticalSplitPercentage =
    fullscreen || isLeftLayoutEmpty ? 0 : isRightLayoutEmpty ? 100 : undefined;

  const handleVerticalChange = useCallback(
    (newSize: number): void => {
      const pane = leftPane.current?.parentElement;
      const splitPane = pane?.parentElement;
      const splitPaneParent = splitPane?.parentElement;
      const splitPaneParentParent = splitPaneParent?.parentElement;
      if (splitPaneParent && splitPaneParentParent) {
        const widthPercentage =
          (newSize / splitPaneParentParent.offsetWidth) * 100;
        if (animatingTimeoutHandle.current >= 0) {
          window.clearTimeout(animatingTimeoutHandle.current);
        }
        // If has not updated in the past 0.5 seconds, consider pane resize finished
        animatingTimeoutHandle.current = window.setTimeout(() => {
          const paneSize = `${widthPercentage}%`;
          pane.style.width = paneSize;
          dispatch(panelSetPaneSize(paneSize));
        }, 500);
      }
    },
    [dispatch]
  );

  if (portrait) {
    return (
      <Pane
        innerRef={rightPane}
        windowType={windowType}
        panelFocusOrder={sortedPanelFocusOrder[1]}
        panelbar={getPanelbar(windowType, sortedPanelFocusOrder[1])}
      />
    );
  }

  return (
    <StyledProjectContent ref={ref}>
      <StyledSplitPane
        split="vertical"
        minSize={layout.size.minWidth.panel}
        maxSize={-layout.size.minWidth.panel}
        defaultSize={
          forcedVerticalSplitPercentage !== undefined
            ? `${forcedVerticalSplitPercentage}%`
            : savedPaneSize
        }
        size={
          forcedVerticalSplitPercentage !== undefined
            ? `${forcedVerticalSplitPercentage}%`
            : undefined
        }
        allowResize={allowVerticalResize}
        onChange={handleVerticalChange}
      >
        <Pane
          innerRef={leftPane}
          windowType={windowType}
          panelFocusOrder={sortedPanelFocusOrder[0]}
          panelbar={getPanelbar(windowType, sortedPanelFocusOrder[0])}
        />
        <Pane
          innerRef={rightPane}
          windowType={windowType}
          panelFocusOrder={sortedPanelFocusOrder[1]}
          panelbar={getPanelbar(windowType, sortedPanelFocusOrder[1])}
          preservePane
        />
      </StyledSplitPane>
    </StyledProjectContent>
  );
};

const Project = React.memo((): JSX.Element => {
  const { fullscreen } = useContext(ScreenContext);
  const [navigationState] = useContext(NavigationContext);
  const [state, dispatch] = useContext(ProjectEngineContext);

  const windowType = state?.window?.type;
  const doc = state?.project?.data?.doc;
  const access = state?.project?.access;
  const searchTextQuery = state?.panel?.panels?.[windowType]?.searchTextQuery;
  const toolbar = state?.panel?.panels?.[windowType]?.toolbar;

  const [windowTransitionState, setWindowTransitionState] =
    useState<TransitionState>(TransitionState.initial);
  const [portrait, setPortrait] = useState<boolean>();
  const [viewportEl, setViewportEl] = useState<HTMLElement>();
  const ios = useIOS();

  useVisualViewport(portrait && ios ? viewportEl : null, 64);

  const theme = useTheme();

  const belowBreakpoint = useMediaQuery(theme.breakpoints.down("md"), {
    noSsr: true,
  });

  const isPlayable = isGameDocument(doc);

  useEffect(() => {
    setPortrait(belowBreakpoint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [belowBreakpoint]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<unknown>, key: string) => {
      e.stopPropagation();
      e.preventDefault();
      if (windowType !== key) {
        dispatch(windowSwitch(key as WindowType));
      }
    },
    [windowType, dispatch]
  );

  const handleExit = useCallback(() => {
    setWindowTransitionState(TransitionState.exit);
    dispatch(testPlayerVisibility(false));
  }, [dispatch]);
  const handleEnter = useCallback(() => {
    setWindowTransitionState(TransitionState.enter);
    if (!isPlayable || (!portrait && windowType === "setup")) {
      dispatch(testLayoutChange("Page"));
    } else {
      dispatch(testLayoutChange("Game"));
    }
  }, [dispatch, isPlayable, portrait, windowType]);
  const handleComplete = useCallback(() => {
    if (isPlayable && !portrait && windowType === "test") {
      dispatch(testPause(false));
      dispatch(testModeChange("Test"));
    }
    if (!isPlayable || (portrait && windowType !== "test")) {
      dispatch(testModeChange("Edit"));
    }
    dispatch(testPlayerVisibility(true));
    window.setTimeout(() => {
      setWindowTransitionState(TransitionState.idle);
    }, 150);
  }, [isPlayable, portrait, windowType, dispatch]);

  // Show a top level transition on window changes
  const { delayedProps, animate } = useTransitionAnimation<ProjectContentProps>(
    {
      windowType,
    },
    "windowType",
    300,
    300,
    false,
    handleExit,
    handleEnter,
    handleComplete
  );

  const footerButtons = isGameDocument(state?.project?.data?.doc)
    ? access === MemberAccess.Viewer
      ? windows.filter((w) => w.type === "test")
      : windows
    : [];

  useEffect(() => {
    if (access === MemberAccess.Viewer) {
      dispatch(windowSwitch("test"));
    }
  }, [access, dispatch]);

  const handleContextMenu = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const windowTransitionContext = useMemo(
    () => ({ transitionState: windowTransitionState, portrait }),
    [windowTransitionState, portrait]
  );

  useEffect(() => {
    document.body.style.overflowAnchor = "none";
    return (): void => {
      document.body.style.overflowAnchor = "auto";
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.overflowY = portrait ? "scroll" : "hidden";
  }, [portrait]);

  const handleViewportRef = useCallback((instance: HTMLElement) => {
    if (instance) {
      setViewportEl(instance);
    }
  }, []);

  const showMobileSnippetToolbar = portrait && toolbar === "snippet";

  return (
    <WindowTransitionContext.Provider value={windowTransitionContext}>
      <StyledProject
        onContextMenu={handleContextMenu}
        style={{ opacity: portrait === undefined ? 0 : 1 }}
      >
        {!fullscreen && !portrait && (
          <>
            <NavigationBarSpacer />
            <PageNavigationBar
              title=""
              secondaryTitle={navigationState.secondaryTitle}
              subtitle={navigationState.subtitle}
              titleLinks={navigationState.links}
              elevation={navigationState.elevation}
              backgroundColor={navigationState.backgroundColor}
            />
          </>
        )}
        <StyledProjectTopArea>
          <StyledProjectContentArea>
            <TopLevelTransition
              initial={false}
              animate={animate}
              custom={{ position: "relative", exitPosition: "relative" }}
            >
              <ProjectContent {...delayedProps} />
            </TopLevelTransition>
          </StyledProjectContentArea>
        </StyledProjectTopArea>
        {!fullscreen && (
          <Portal>
            <StyledFixedViewport className="mui-fixed">
              <StyledViewportSpacer ref={handleViewportRef} />
              {(!portrait || !searchTextQuery) && (
                <StyledToolbarArea>
                  <StyledToolbarContent>
                    {showMobileSnippetToolbar ? (
                      <SnippetToolbar />
                    ) : (
                      <>
                        {footerButtons?.length && (
                          <BottomNavigationBar
                            buttons={footerButtons}
                            value={windowType}
                            onChange={handleChange}
                          />
                        )}
                      </>
                    )}
                  </StyledToolbarContent>
                </StyledToolbarArea>
              )}
            </StyledFixedViewport>
          </Portal>
        )}
      </StyledProject>
    </WindowTransitionContext.Provider>
  );
});

export default Project;
