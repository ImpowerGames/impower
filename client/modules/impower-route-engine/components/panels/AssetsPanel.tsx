import { useTheme } from "@emotion/react";
import React, { useCallback, useContext, useMemo, useState } from "react";
import useBodyBackgroundColor from "../../../impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../impower-route/hooks/useHTMLBackgroundColor";
import { layout } from "../../../impower-route/styles/layout";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { WindowTransitionContext } from "../../contexts/transitionContext";
import { PanelType } from "../../types/state/windowState";
import FilesConsole from "../consoles/FilesConsole";
import Panel from "../layouts/Panel";

const AssetsPanel = React.memo((): JSX.Element => {
  const [scrollParent, setScrollParent] = useState<HTMLDivElement>();

  const [state] = useContext(ProjectEngineContext);
  const { portrait } = useContext(WindowTransitionContext);
  const theme = useTheme();

  const projectState = state?.present?.project;

  const buttonSpacing = 3 * 8;
  const fixedStyle: React.CSSProperties = {
    position: portrait ? "fixed" : "absolute",
    left: buttonSpacing,
    right: buttonSpacing,
    bottom: portrait
      ? layout.size.minHeight.navigationBar + buttonSpacing
      : buttonSpacing,
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

  const fileDocs = useMemo(
    () =>
      projectState?.data?.files === undefined
        ? undefined
        : projectState?.data?.files?.data || {},
    [projectState?.data]
  );

  return (
    <Panel
      panelType={PanelType.Assets}
      onScrollRef={handleScrollRef}
      useWindowAsScrollContainer
    >
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
    </Panel>
  );
});

export default AssetsPanel;
