import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { FadeAnimation } from "../../../impower-route";
import useBodyBackgroundColor from "../../../impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../impower-route/hooks/useHTMLBackgroundColor";
import useHTMLOverscrollBehavior from "../../../impower-route/hooks/useHTMLOverscrollBehavior";
import { layout } from "../../../impower-route/styles/layout";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { WindowTransitionContext } from "../../contexts/transitionContext";
import FilesConsole from "../consoles/FilesConsole";
import Panel from "../layouts/Panel";

const StyledFadeAnimation = styled(FadeAnimation)`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const AssetsPanel = React.memo((): JSX.Element => {
  const { portrait, transitionState } = useContext(WindowTransitionContext);
  const [state] = useContext(ProjectEngineContext);

  const projectState = state?.project;

  const [scrollParent, setScrollParent] = useState<HTMLDivElement>();

  const theme = useTheme();

  const buttonSpacing = 3 * 8;
  const fixedStyle: React.CSSProperties = {
    position: portrait ? "fixed" : "absolute",
    left: buttonSpacing,
    right: buttonSpacing,
    bottom: layout.size.minHeight.navigationBar + buttonSpacing,
  };
  const stickyStyle: React.CSSProperties = {
    position: portrait ? "fixed" : "absolute",
    zIndex: 2,
    boxShadow: theme.shadows[3],
    right: portrait ? undefined : 8,
  };
  const headerStyle: React.CSSProperties = {
    paddingLeft: theme.spacing(2),
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(1),
  };
  const leftStyle = {
    minWidth: theme.spacing(1),
  };
  const searchButtonStyle = {
    opacity: 1,
    color: theme.palette.secondary.main,
  };
  const moreButtonStyle = {
    opacity: 1,
    color: theme.palette.secondary.main,
  };
  const dividerStyle = { backgroundColor: "transparent", border: "none" };
  const paperStyle = {
    backgroundColor: theme.colors.darkForeground,
    color: "white",
    boxShadow: "none",
  };
  const style = {
    paddingLeft: theme.spacing(1),
    backgroundColor: theme.colors.darkForeground,
  };
  const selectedColor = theme.palette.secondary.dark;

  const handleScrollRef = useCallback((scrollParent: HTMLDivElement): void => {
    setScrollParent(scrollParent);
  }, []);

  useBodyBackgroundColor(theme.colors.darkForeground);
  useHTMLBackgroundColor(theme.colors.darkForeground);
  useHTMLOverscrollBehavior("contain");

  const fileDocs = useMemo(
    () =>
      projectState?.data?.files === undefined
        ? undefined
        : projectState?.data?.files?.data || {},
    [projectState?.data]
  );

  const initialRef = useRef(true);
  const initial = initialRef.current;
  initialRef.current = false;

  return (
    <Panel onScrollRef={handleScrollRef} useWindowAsScrollContainer={portrait}>
      {(transitionState === "idle" ||
        (transitionState === "exit" && !initial)) && (
        <StyledFadeAnimation initial={0} animate={1}>
          <FilesConsole
            scrollParent={scrollParent}
            projectDoc={projectState?.data?.doc}
            projectId={projectState?.id}
            fileDocs={fileDocs}
            selectedColor={selectedColor}
            fixedStyle={fixedStyle}
            stickyStyle={stickyStyle}
            headerStyle={headerStyle}
            leftStyle={leftStyle}
            searchButtonStyle={searchButtonStyle}
            moreButtonStyle={moreButtonStyle}
            dividerStyle={dividerStyle}
            paperStyle={paperStyle}
            style={style}
            sticky="always"
          />
        </StyledFadeAnimation>
      )}
    </Panel>
  );
});

export default AssetsPanel;
