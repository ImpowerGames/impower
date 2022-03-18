import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, {
  CSSProperties,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AngleDownRegularIcon from "../../../../resources/icons/regular/angle-down.svg";
import AngleLeftRegularIcon from "../../../../resources/icons/regular/angle-left.svg";
import AngleRightRegularIcon from "../../../../resources/icons/regular/angle-right.svg";
import CheckRegularIcon from "../../../../resources/icons/regular/check.svg";
import EllipsisVerticalRegularIcon from "../../../../resources/icons/regular/ellipsis-vertical.svg";
import TriangleExclamationRegularIcon from "../../../../resources/icons/regular/triangle-exclamation.svg";
import { SlideAnimation } from "../../../impower-route";
import useBodyBackgroundColor from "../../../impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../impower-route/hooks/useHTMLBackgroundColor";
import useHTMLOverscrollBehavior from "../../../impower-route/hooks/useHTMLOverscrollBehavior";
import { SearchAction } from "../../../impower-script-editor";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { WindowTransitionContext } from "../../contexts/transitionContext";
import { panelSearch } from "../../types/actions/panelActions";
import { WindowType } from "../../types/state/windowState";
import SnippetToolbar from "../bars/SnippetToolbar";
import PanelHeader from "../headers/PanelHeader";
import PanelHeaderIconButton from "../iconButtons/PanelHeaderIconButton";
import UndoRedoControl from "../iconButtons/UndoRedoControl";
import ContainerScriptEditor from "../inputs/ContainerScriptEditor";
import Panel from "../layouts/Panel";

const StyledToolbarArea = styled(SlideAnimation)`
  pointer-events: none;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: ${(props): string => props.theme.colors.darkForeground};
  min-height: ${(props): string => props.theme.minHeight.navigationBar};
  max-height: ${(props): string => props.theme.minHeight.navigationBar};
  box-shadow: ${(props): string => props.theme.shadows[2]};
`;

interface TogglePanelHeaderIconProps {
  value: boolean;
  onLabel: string;
  offLabel: string;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
  onClick: (toggleFolding: boolean) => void;
}

const TogglePanelHeaderIconButton = React.memo(
  (props: TogglePanelHeaderIconProps): JSX.Element => {
    const { value, onLabel, offLabel, onIcon, offIcon, onClick } = props;
    const theme = useTheme();
    return (
      <PanelHeaderIconButton
        aria-label={value ? onLabel : offLabel}
        icon={value ? onIcon : offIcon}
        size={theme.fontSize.smallIcon}
        style={{
          backgroundColor: theme.colors.darkForeground,
        }}
        onClick={(): void => onClick(!value)}
      />
    );
  }
);

interface ContainerPanelHeaderProps {
  windowType: WindowType;
  title: string;
  toggleFolding: boolean;
  toggleLinting: boolean;
  style?: CSSProperties;
  onToggleFolding?: (toggleFolding: boolean) => void;
  onToggleLinting?: (toggleLinting: boolean) => void;
}

const ContainerPanelHeader = React.memo(
  (props: ContainerPanelHeaderProps): JSX.Element => {
    const {
      windowType,
      title,
      toggleFolding,
      toggleLinting,
      style,
      onToggleFolding,
      onToggleLinting,
    } = props;

    const { portrait } = useContext(WindowTransitionContext);
    const [state, dispatch] = useContext(ProjectEngineContext);

    const scripting = state?.panel?.panels?.[windowType]?.scripting;
    const searchQuery = state?.panel?.panels?.[windowType]?.searchQuery;
    const focused = state?.panel?.panels?.[windowType]?.editorState?.focused;

    const theme = useTheme();

    const searching = Boolean(searchQuery);

    const listHeaderStyle: CSSProperties = useMemo(
      () => ({
        pointerEvents: "auto",
        backgroundColor: theme.colors.darkForeground,
        ...style,
      }),
      [style, theme.colors.darkForeground]
    );

    const chartHeaderStyle: CSSProperties = useMemo(
      () => ({
        pointerEvents: "none",
        zIndex: 2,
        backgroundColor: searching ? theme.colors.darkForeground : undefined,
        ...style,
      }),
      [searching, style, theme.colors.darkForeground]
    );

    const headerStyle = scripting ? listHeaderStyle : chartHeaderStyle;

    const headerStickyStyle = useMemo(
      () => ({
        boxShadow: scripting ? theme.shadows[3] : theme.shadows[0],
      }),
      [scripting, theme.shadows]
    );

    const handleSearch = useCallback(
      (
        e?: React.ChangeEvent<HTMLInputElement> | React.MouseEvent,
        searchQuery?: SearchAction
      ) => {
        dispatch(panelSearch(windowType, searchQuery));
      },
      [dispatch, windowType]
    );

    // TODO: Allow viewing script as Flowchart
    // const handleClickHeaderScriptingIcon = useCallback(
    //   (scripting: boolean) => {
    //     dispatch(panelSetScripting(windowType, scripting));
    //   },
    //   [dispatch, windowType]
    // );

    const handleMore = useCallback(() => {
      // TODO: Allow exporting script as pdf or file
    }, []);

    return (
      <PanelHeader
        type={searchQuery ? "search" : "default"}
        title={title}
        style={headerStyle}
        stickyStyle={headerStickyStyle}
        backIcon={<AngleLeftRegularIcon />}
        moreIcon={
          portrait && focused ? (
            <CheckRegularIcon />
          ) : (
            <EllipsisVerticalRegularIcon />
          )
        }
        moreButtonStyle={{
          color:
            portrait && focused
              ? theme.colors.selected
              : theme.palette.secondary.main,
        }}
        backLabel={`Back`}
        moreLabel={`More Options`}
        searchLabel={`Find`}
        replaceLabel={`Replace`}
        onSearch={handleSearch}
        onMore={handleMore}
        leftChildren={
          scripting ? (
            <TogglePanelHeaderIconButton
              value={toggleFolding}
              onLabel={`Unfold All`}
              offLabel={`Fold All`}
              onIcon={<AngleRightRegularIcon />}
              offIcon={<AngleDownRegularIcon />}
              onClick={onToggleFolding}
            />
          ) : undefined
        }
        rightChildren={
          <>
            <UndoRedoControl type={windowType} />
            <TogglePanelHeaderIconButton
              value={toggleLinting}
              onLabel={`Format and check for errors`}
              offLabel={`Hide error panel`}
              onIcon={<TriangleExclamationRegularIcon />}
              offIcon={<TriangleExclamationRegularIcon />}
              onClick={onToggleLinting}
            />
            {/* <ScriptingPanelHeaderIconButton
              scripting={scripting}
              onClick={handleClickHeaderScriptingIcon}
            /> */}
          </>
        }
      />
    );
  }
);

interface ContainerPanelContentProps {
  windowType: WindowType;
  scripting: boolean;
  toggleFolding: boolean;
  toggleLinting: boolean;
  onSectionChange: (name: string) => void;
}

const ContainerPanelContent = React.memo(
  (props: ContainerPanelContentProps): JSX.Element => {
    const {
      windowType,
      scripting,
      toggleFolding,
      toggleLinting,
      onSectionChange,
    } = props;

    if (scripting) {
      return (
        <ContainerScriptEditor
          windowType={windowType}
          toggleFolding={toggleFolding}
          toggleLinting={toggleLinting}
          onSectionChange={onSectionChange}
        />
      );
    }
    return null;
  }
);

interface ContainerPanelProps {
  windowType: WindowType;
}

const ContainerPanel = React.memo((props: ContainerPanelProps): JSX.Element => {
  const { windowType } = props;

  const { portrait } = useContext(WindowTransitionContext);
  const [state] = useContext(ProjectEngineContext);

  const mode = state?.test?.mode;
  const scripting = state?.panel?.panels?.[windowType]?.scripting;
  const focused = state?.panel?.panels?.[windowType]?.editorState?.focused;
  const theme = useTheme();

  const [toggleFolding, setToggleFolding] = useState<boolean>(false);
  const [toggleLinting, setToggleLinting] = useState(mode === "Test");
  const [headerName, setHeaderName] = useState("");

  useBodyBackgroundColor(theme.colors.darkForeground);
  useHTMLBackgroundColor(theme.colors.darkForeground);
  useHTMLOverscrollBehavior("contain");

  const handleSectionChange = useCallback((name: string) => {
    setHeaderName(name);
  }, []);

  const useWindowAsScrollContainer = portrait && scripting;
  const showChart = windowType === "Logic" && !scripting;
  const showSnippetToolbar = !portrait && focused && mode === "Edit";
  const title = headerName || "Script";

  useEffect((): void => {
    if (mode === "Test") {
      setToggleLinting(true);
    }
  }, [mode]);

  const fixedStyle: CSSProperties = useMemo(
    () => ({
      position: "fixed",
      left: 0,
      right: 0,
      top: 0,
      bottom: theme.minHeight.navigationBar,
    }),
    [theme.minHeight.navigationBar]
  );
  const backgroundStyle: CSSProperties = useMemo(
    () => ({
      overflowX: showChart ? "scroll" : undefined,
      overflowY: showChart ? "scroll" : undefined,
      ...(showChart && useWindowAsScrollContainer ? fixedStyle : {}),
    }),
    [fixedStyle, useWindowAsScrollContainer, showChart]
  );
  const overlayStyle: CSSProperties = useMemo(
    () =>
      portrait
        ? {
            ...fixedStyle,
            zIndex: 2,
          }
        : undefined,
    [portrait, fixedStyle]
  );

  return (
    <Panel
      useWindowAsScrollContainer={useWindowAsScrollContainer}
      backgroundStyle={backgroundStyle}
      overlayStyle={overlayStyle}
      topChildren={
        scripting ? (
          <ContainerPanelHeader
            windowType={windowType}
            title={title}
            toggleFolding={toggleFolding}
            toggleLinting={toggleLinting}
            onToggleFolding={setToggleFolding}
            onToggleLinting={setToggleLinting}
          />
        ) : undefined
      }
      overlay={
        !scripting ? (
          <ContainerPanelHeader
            windowType={windowType}
            title={title}
            toggleFolding={toggleFolding}
            toggleLinting={toggleLinting}
            onToggleFolding={setToggleFolding}
            onToggleLinting={setToggleLinting}
          />
        ) : showSnippetToolbar ? (
          <StyledToolbarArea
            animate={focused ? 0 : 64}
            duration={0.1}
            ease="ease-standard"
          >
            <SnippetToolbar />
          </StyledToolbarArea>
        ) : undefined
      }
    >
      <ContainerPanelContent
        windowType={windowType}
        scripting={scripting}
        toggleFolding={toggleFolding}
        toggleLinting={toggleLinting}
        onSectionChange={handleSectionChange}
      />
    </Panel>
  );
});

export default ContainerPanel;
