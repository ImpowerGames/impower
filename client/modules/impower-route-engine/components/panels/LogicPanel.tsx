import { useTheme } from "@emotion/react";
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
import CircleQuestionRegularIcon from "../../../../resources/icons/regular/circle-question.svg";
import EllipsisVerticalRegularIcon from "../../../../resources/icons/regular/ellipsis-vertical.svg";
import FileCircleCheckRegularIcon from "../../../../resources/icons/regular/file-circle-check.svg";
import FileCircleQuestionRegularIcon from "../../../../resources/icons/regular/file-circle-question.svg";
import FileCircleXmarkRegularIcon from "../../../../resources/icons/regular/file-circle-xmark.svg";
import FileExportRegularIcon from "../../../../resources/icons/regular/file-export.svg";
import useBodyBackgroundColor from "../../../impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../impower-route/hooks/useHTMLBackgroundColor";
import useHTMLOverscrollBehavior from "../../../impower-route/hooks/useHTMLOverscrollBehavior";
import {
  SearchLineQuery,
  SearchTextQuery,
} from "../../../impower-script-editor";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { WindowTransitionContext } from "../../contexts/transitionContext";
import {
  panelChangeToolbar,
  panelSearchLine,
  panelSearchText,
} from "../../types/actions/panelActions";
import { WindowType } from "../../types/state/windowState";
import SnippetToolbar from "../bars/SnippetToolbar";
import PanelHeader from "../headers/PanelHeader";
import PanelHeaderIconButton from "../iconButtons/PanelHeaderIconButton";
import UndoRedoControl from "../iconButtons/UndoRedoControl";
import LogicScriptEditor from "../inputs/LogicScriptEditor";
import Panel from "../layouts/Panel";

interface TogglePanelHeaderIconProps {
  value: boolean;
  color?: string;
  onLabel: string;
  offLabel: string;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
  onClick: (toggleFolding: boolean) => void;
}

const TogglePanelHeaderIconButton = React.memo(
  (props: TogglePanelHeaderIconProps): JSX.Element => {
    const { value, color, onLabel, offLabel, onIcon, offIcon, onClick } = props;
    const theme = useTheme();
    return (
      <PanelHeaderIconButton
        aria-label={value ? onLabel : offLabel}
        icon={value ? onIcon : offIcon}
        size={theme.fontSize.smallIcon}
        color={color}
        style={{
          backgroundColor: "inherit",
        }}
        onClick={(): void => onClick(!value)}
      />
    );
  }
);

interface ContainerPanelHeaderProps {
  windowType: WindowType;
  title: string;
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
      toggleLinting,
      style,
      onToggleFolding,
      onToggleLinting,
    } = props;

    const { portrait } = useContext(WindowTransitionContext);
    const [state, dispatch] = useContext(ProjectEngineContext);

    const scripting = state?.panel?.panels?.[windowType]?.scripting;
    const searchTextQuery = state?.panel?.panels?.[windowType]?.searchTextQuery;
    const searchLineQuery = state?.panel?.panels?.[windowType]?.searchLineQuery;
    const focused = state?.panel?.panels?.[windowType]?.editorState?.focused;
    const folded = state?.panel?.panels?.[windowType]?.editorState?.folded;
    const mode = state?.test?.mode;
    const compiling = state?.test?.compiling?.[windowType];
    const diagnostics =
      state?.panel?.panels?.[windowType]?.editorState?.diagnostics;
    const toolbar = state?.panel?.panels?.[windowType]?.toolbar;

    const theme = useTheme();

    const searchingText = Boolean(searchTextQuery);

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
        backgroundColor: searchingText
          ? mode === "Edit"
            ? theme.colors.darkForeground
            : "black"
          : undefined,
        ...style,
      }),
      [mode, searchingText, style, theme.colors.darkForeground]
    );

    const headerStyle = scripting ? listHeaderStyle : chartHeaderStyle;

    const headerStickyStyle = useMemo(
      () => ({
        boxShadow: scripting ? theme.shadows[3] : theme.shadows[0],
      }),
      [scripting, theme.shadows]
    );

    const handleSearchText = useCallback(
      (
        e?: React.ChangeEvent<HTMLInputElement> | React.MouseEvent,
        query?: SearchTextQuery
      ) => {
        dispatch(panelSearchText(windowType, query));
        dispatch(panelSearchLine(windowType, null));
      },
      [dispatch, windowType]
    );

    const handleSearchLine = useCallback(
      (
        e?: React.ChangeEvent<HTMLInputElement> | React.MouseEvent,
        query?: SearchLineQuery
      ) => {
        dispatch(panelSearchLine(windowType, query));
        dispatch(panelSearchText(windowType, null));
      },
      [dispatch, windowType]
    );

    const handleClickMoreOption = useCallback(
      (e: React.MouseEvent<Element, MouseEvent>, option: string) => {
        if (option === "show_snippet") {
          dispatch(panelChangeToolbar(windowType, "snippet"));
        }
        if (option === "hide_snippet") {
          dispatch(panelChangeToolbar(windowType));
        }
      },
      [dispatch, windowType]
    );

    const headerType = searchTextQuery
      ? "search_text"
      : searchLineQuery
      ? "search_line"
      : "default";
    const searchLabel = searchTextQuery
      ? `Find`
      : searchLineQuery
      ? `Go To Line`
      : `Find`;

    const hasError = !diagnostics ? undefined : diagnostics.length > 0;
    const lintIcon = useMemo(
      () =>
        hasError === undefined || compiling ? (
          <FileCircleQuestionRegularIcon />
        ) : hasError ? (
          <FileCircleXmarkRegularIcon />
        ) : (
          <FileCircleCheckRegularIcon />
        ),
      [compiling, hasError]
    );
    const menuOptions: {
      key?: string;
      label: string;
    }[] = useMemo(
      () => [
        toolbar === "snippet"
          ? {
              key: "hide_snippet",
              label: "Hide Snippets",
              icon: <CircleQuestionRegularIcon />,
            }
          : {
              key: "show_snippet",
              label: "Show Snippets",
              icon: <CircleQuestionRegularIcon />,
            },
        { label: "---" },
        {
          key: "export_game",
          label: "Export Game",
          icon: <FileExportRegularIcon />,
        },
        {
          key: "export_screenplay",
          label: "Export Screenplay",
          icon: <FileExportRegularIcon />,
        },
      ],
      [toolbar]
    );

    return (
      <PanelHeader
        type={headerType}
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
        menuOptions={menuOptions}
        searchLabel={searchLabel}
        replaceLabel={`Replace`}
        onSearchText={handleSearchText}
        onSearchLine={handleSearchLine}
        onClickMoreOption={handleClickMoreOption}
        leftChildren={
          scripting ? (
            <TogglePanelHeaderIconButton
              value={folded?.length > 0}
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
              onIcon={lintIcon}
              offIcon={lintIcon}
              onClick={onToggleLinting}
            />
          </>
        }
      />
    );
  }
);

interface ContainerPanelContentProps {
  scripting: boolean;
  toggleFolding: boolean;
  toggleLinting: boolean;
  onSectionChange: (name: string) => void;
}

const ContainerPanelContent = React.memo(
  (props: ContainerPanelContentProps): JSX.Element => {
    const { scripting, toggleFolding, toggleLinting, onSectionChange } = props;

    if (scripting) {
      return (
        <LogicScriptEditor
          toggleFolding={toggleFolding}
          toggleLinting={toggleLinting}
          onSectionChange={onSectionChange}
        />
      );
    }
    return null;
  }
);

const LogicPanel = React.memo((): JSX.Element => {
  const { portrait } = useContext(WindowTransitionContext);
  const [state] = useContext(ProjectEngineContext);

  const windowType = "logic";

  const mode = state?.test?.mode;
  const scripting = state?.panel?.panels?.[windowType]?.scripting;
  const toolbar = state?.panel?.panels?.[windowType]?.toolbar;
  const theme = useTheme();

  const [toggleFolding, setToggleFolding] = useState<boolean>();
  const [toggleLinting, setToggleLinting] = useState(mode === "Test");
  const [headerName, setHeaderName] = useState("");

  useBodyBackgroundColor(theme.colors.darkForeground);
  useHTMLBackgroundColor(theme.colors.darkForeground);
  useHTMLOverscrollBehavior("contain");

  const handleSectionChange = useCallback((name: string) => {
    setHeaderName(name);
  }, []);

  const useWindowAsScrollContainer = portrait && scripting;
  const showChart = windowType === "logic" && !scripting;
  const showDesktopSnippetToolbar = !portrait && toolbar === "snippet";
  const defaultTitle = windowType === "logic" ? "Script" : "Declarations";
  const title = headerName || defaultTitle;

  useEffect((): void => {
    setToggleLinting(mode === "Test");
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
            toggleLinting={toggleLinting}
            onToggleFolding={setToggleFolding}
            onToggleLinting={setToggleLinting}
          />
        ) : showDesktopSnippetToolbar ? (
          <SnippetToolbar />
        ) : undefined
      }
    >
      <ContainerPanelContent
        scripting={scripting}
        toggleFolding={toggleFolding}
        toggleLinting={toggleLinting}
        onSectionChange={handleSectionChange}
      />
    </Panel>
  );
});

export default LogicPanel;
