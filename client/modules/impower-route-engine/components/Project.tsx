import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { useMediaQuery } from "@material-ui/core";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MemberAccess } from "../../impower-data-state";
import { isGameDocument, isResourceDocument } from "../../impower-data-store";
import { NavigationContext } from "../../impower-navigation";
import {
  layout,
  Navbar,
  PageNavigationBar,
  ScreenContext,
  TopLevelTransition,
  TransitionState,
  useTransitionAnimation,
} from "../../impower-route";
import { ProjectEngineContext } from "../contexts/projectEngineContext";
import { WindowTransitionContext } from "../contexts/transitionContext";
import { dataPanelSetPaneSize } from "../types/actions/dataPanelActions";
import { projectValidate } from "../types/actions/projectActions";
import {
  testControlChange,
  testLayoutChange,
  testModeChange,
  testPlayerVisibility,
} from "../types/actions/testActions";
import { windowSwitch } from "../types/actions/windowActions";
import { gameWindows, resourceWindows } from "../types/info/windows";
import { Control, Layout, Mode } from "../types/state/testState";
import { PanelType, WindowType } from "../types/state/windowState";
import { PanelbarPosition } from "./bars/Panelbar";
import Pane from "./layouts/Pane";
import SplitPane from "./layouts/SplitPane";
import TestToolbar from "./toolbars/TestToolbar";

/**
 * Gets all panel types that should be visible in the current layout according to pane count, window type, and data selection counts.
 * NOTE: This method will not return panels that have empty content (if inspected data selection count === 0).
 * @returns [[...LeftPanels], [...RightPanels]]
 */
const getVisiblePanels = (
  portrait: boolean,
  windowType: WindowType
): PanelType[][] => {
  if (portrait) {
    switch (windowType) {
      case WindowType.Setup:
        return [[], [PanelType.Setup, PanelType.Detail]];
      case WindowType.Assets:
        return [[], [PanelType.Assets]];
      case WindowType.Entities:
        return [[], [PanelType.Container, PanelType.Item, PanelType.Detail]];
      case WindowType.Logic:
        return [[], [PanelType.Container, PanelType.Item, PanelType.Detail]];
      case WindowType.Test:
        return [[], [PanelType.Test]];
      default:
        return [[], []];
    }
  }
  switch (windowType) {
    case WindowType.Setup:
      return [[PanelType.Setup, PanelType.Detail], [PanelType.Test]];
    case WindowType.Assets:
      return [[PanelType.Assets], [PanelType.Test]];
    case WindowType.Entities:
      return [
        [PanelType.Container, PanelType.Item, PanelType.Detail],
        [PanelType.Test],
      ];
    case WindowType.Logic:
      return [
        [PanelType.Container, PanelType.Item, PanelType.Detail],
        [PanelType.Test],
      ];
    case WindowType.Test:
      return [[], [PanelType.Test]];
    default:
      return [[], []];
  }
};

const getPanelbar = (
  windowType: WindowType,
  visiblePanels: PanelType[]
): JSX.Element | null => {
  if (visiblePanels && visiblePanels[0] === PanelType.Test) {
    return <TestToolbar windowType={windowType} />;
  }
  return null;
};

const getPanelbarPosition = (visiblePanels: PanelType[]): PanelbarPosition => {
  if (visiblePanels?.[0] === PanelType.Test) {
    return PanelbarPosition.Top;
  }
  return PanelbarPosition.None;
};

const StyledProject = styled.div`
  touch-action: pan-x pan-y;
  background-color: ${(props): string => props.theme.colors.darkForeground};
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;

  * {
    user-select: none;
    touch-callout: none;
  }
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
    box-sizing: border-box;
    background-clip: padding-box;
    background-color: ${(props): string => props.theme.colors.white00};
    transition: all 0.2s ease;
    border-radius: 8px;
    position: relative;
  }

  .Resizer.vertical:after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 8px;
    right: 7px;
    background-color: ${(props): string => props.theme.colors.white05};
  }

  .Resizer.horizontal:after {
    content: "";
    position: absolute;
    top: 8px;
    bottom: 7px;
    left: 0;
    right: 0;
    background-color: ${(props): string => props.theme.colors.white05};
  }

  @media (hover: hover) and (pointer: fine) {
    .Resizer:hover {
      transition: all 0.2s ease;
    }
  }

  .Resizer.horizontal {
    height: 16px;
    margin: -8px 0;
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
    width: 16px;
    margin: 0 -8px;
    cursor: col-resize;
  }

  .Resizer.vertical:hover {
    background-color: ${(props): string => props.theme.colors.white05};
  }
  .Resizer.disabled {
    cursor: auto;
    visibility: hidden;
  }

  @media (hover: hover) and (pointer: fine) {
    .Resizer.disabled:hover {
      border-color: transparent;
    }
  }
`;

interface ProjectContentProps {
  windowType: WindowType;
}

const ProjectContent = (props: ProjectContentProps): JSX.Element => {
  const { windowType } = props;

  const { fullscreen } = useContext(ScreenContext);
  const { portrait } = useContext(WindowTransitionContext);
  const [state, dispatch] = useContext(ProjectEngineContext);

  const savedPaneSize = state?.present?.dataPanel?.paneSize;
  const openDataPanel =
    state?.present?.dataPanel?.panels?.[windowType]?.openPanel;

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

  const leftPane1PanelbarPosition = getPanelbarPosition(
    sortedPanelFocusOrder[0]
  );
  const rightPane2PanelbarPosition = getPanelbarPosition(
    sortedPanelFocusOrder[1]
  );

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
          dispatch(dataPanelSetPaneSize(paneSize));
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
        panelbarPosition={rightPane2PanelbarPosition}
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
          panelbarPosition={leftPane1PanelbarPosition}
        />
        <Pane
          innerRef={rightPane}
          windowType={windowType}
          panelFocusOrder={sortedPanelFocusOrder[1]}
          panelbar={getPanelbar(windowType, sortedPanelFocusOrder[1])}
          panelbarPosition={rightPane2PanelbarPosition}
          preservePane
        />
      </StyledSplitPane>
    </StyledProjectContent>
  );
};

const Project = React.memo((): JSX.Element => {
  const [state, dispatch] = useContext(ProjectEngineContext);
  const { fullscreen } = useContext(ScreenContext);
  const [navigationState] = useContext(NavigationContext);
  const windowType = state.present.window.type;
  const doc = state.present.project?.data?.doc;

  const { access } = state.present.project;

  const [windowTransitionState, setWindowTransitionState] =
    useState<TransitionState>(TransitionState.initial);
  const [portrait, setPortrait] = useState<boolean>();

  const theme = useTheme();

  const belowBreakpoint = useMediaQuery(theme.breakpoints.down("md"));

  const isPlayable = isGameDocument(doc);

  useEffect(() => {
    setPortrait(belowBreakpoint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [belowBreakpoint]);

  const handleChange = useCallback(
    (_event: React.ChangeEvent<unknown>, key: string) => {
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
    if (!isPlayable || (!portrait && windowType === WindowType.Setup)) {
      dispatch(testLayoutChange(Layout.Page));
    } else {
      dispatch(testLayoutChange(Layout.Game));
    }
  }, [dispatch, isPlayable, portrait, windowType]);
  const handleComplete = useCallback(() => {
    setWindowTransitionState(TransitionState.idle);
    if (isPlayable && !portrait && windowType === WindowType.Test) {
      dispatch(projectValidate());
      dispatch(testControlChange(Control.Play));
      dispatch(testModeChange(Mode.Test));
    }
    if (!isPlayable || (portrait && windowType !== WindowType.Test)) {
      dispatch(testModeChange(Mode.Edit));
    }
    dispatch(testPlayerVisibility(true));
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

  const footerButtons = isResourceDocument(state?.present?.project?.data?.doc)
    ? access === MemberAccess.Viewer
      ? resourceWindows.filter((w) => w.type === WindowType.Test)
      : resourceWindows
    : isGameDocument(state?.present?.project?.data?.doc)
    ? access === MemberAccess.Viewer
      ? gameWindows.filter((w) => w.type === WindowType.Test)
      : gameWindows
    : [];

  useEffect(() => {
    if (access === MemberAccess.Viewer) {
      dispatch(windowSwitch(WindowType.Test));
    }
  }, [access, dispatch]);

  const handleContextMenu = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const windowTransitionContext = useMemo(
    () => ({ state: windowTransitionState, portrait }),
    [windowTransitionState, portrait]
  );

  useEffect(() => {
    document.body.style.overflowAnchor = "none";
    return (): void => {
      document.body.style.overflowAnchor = "auto";
    };
  }, []);

  return (
    <WindowTransitionContext.Provider value={windowTransitionContext}>
      <StyledProject onContextMenu={handleContextMenu}>
        {!fullscreen && !portrait && (
          <PageNavigationBar
            title={navigationState.title}
            secondaryTitle={navigationState.secondaryTitle}
            subtitle={navigationState.subtitle}
            titleLinks={navigationState.links}
            elevation={navigationState.elevation}
            backgroundColor={navigationState.backgroundColor}
          />
        )}
        <StyledProjectTopArea>
          <StyledProjectContentArea>
            <TopLevelTransition
              animate={animate}
              custom={{ position: "relative", exitPosition: "relative" }}
            >
              <ProjectContent {...delayedProps} />
            </TopLevelTransition>
          </StyledProjectContentArea>
        </StyledProjectTopArea>
        {!fullscreen && footerButtons?.length > 1 && (
          <Navbar
            buttons={footerButtons}
            value={windowType}
            onChange={handleChange}
          />
        )}
      </StyledProject>
    </WindowTransitionContext.Provider>
  );
});

export default Project;
