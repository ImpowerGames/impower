import { useTheme } from "@emotion/react";
import React, {
  CSSProperties,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import AngleDownRegularIcon from "../../../../resources/icons/regular/angle-down.svg";
import AngleLeftRegularIcon from "../../../../resources/icons/regular/angle-left.svg";
import AngleRightRegularIcon from "../../../../resources/icons/regular/angle-right.svg";
import SitemapRegularIcon from "../../../../resources/icons/regular/sitemap.svg";
import TypewriterRegularIcon from "../../../../resources/icons/regular/typewriter.svg";
import useBodyBackgroundColor from "../../../impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../impower-route/hooks/useHTMLBackgroundColor";
import { SearchAction } from "../../../impower-script-editor";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { WindowTransitionContext } from "../../contexts/transitionContext";
import {
  panelSearch,
  panelSetScripting,
} from "../../types/actions/panelActions";
import { WindowType } from "../../types/state/windowState";
import PanelHeader from "../headers/PanelHeader";
import PanelHeaderIconButton from "../iconButtons/PanelHeaderIconButton";
import UndoRedoControl from "../iconButtons/UndoRedoControl";
import ContainerScriptEditor from "../inputs/ContainerScriptEditor";
import Panel from "../layouts/Panel";

interface ToggleFoldingPanelHeaderIconProps {
  toggleFolding: boolean;
  onClick: (toggleFolding: boolean) => void;
}

const ToggleFoldingPanelHeaderIconButton = React.memo(
  (props: ToggleFoldingPanelHeaderIconProps): JSX.Element => {
    const { toggleFolding, onClick } = props;
    const theme = useTheme();
    return (
      <PanelHeaderIconButton
        aria-label={toggleFolding ? "Unfold All" : "Fold All"}
        icon={
          toggleFolding ? <AngleRightRegularIcon /> : <AngleDownRegularIcon />
        }
        size={theme.fontSize.smallIcon}
        style={{
          backgroundColor: theme.colors.darkForeground,
        }}
        onClick={(): void => onClick(!toggleFolding)}
      />
    );
  }
);

interface ScriptingPanelHeaderIconProps {
  scripting: boolean;
  onClick: (scripting: boolean) => void;
}

const ScriptingPanelHeaderIconButton = React.memo(
  (props: ScriptingPanelHeaderIconProps): JSX.Element => {
    const { scripting, onClick } = props;
    const theme = useTheme();
    return (
      <PanelHeaderIconButton
        aria-label={scripting ? "Scripting" : "Visual"}
        icon={scripting ? <TypewriterRegularIcon /> : <SitemapRegularIcon />}
        size={theme.fontSize.smallIcon}
        style={{
          backgroundColor: theme.colors.darkForeground,
          marginRight: theme.spacing(2),
        }}
        onClick={(): void => onClick(!scripting)}
      />
    );
  }
);

interface ContainerPanelHeaderProps {
  windowType: WindowType;
  title: string;
  toggleFolding: boolean;
  style?: CSSProperties;
  onToggleFolding?: (toggleFolding: boolean) => void;
}

const ContainerPanelHeader = React.memo(
  (props: ContainerPanelHeaderProps): JSX.Element => {
    const { windowType, title, toggleFolding, style, onToggleFolding } = props;

    const [state, dispatch] = useContext(ProjectEngineContext);
    const scripting = state?.panel?.panels?.[windowType]?.scripting;
    const searchQuery = state?.panel?.panels?.[windowType]?.searchQuery;

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

    const handleClickHeaderScriptingIcon = useCallback(
      (scripting: boolean) => {
        dispatch(panelSetScripting(windowType, scripting));
      },
      [dispatch, windowType]
    );

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
        backLabel={`Back`}
        moreLabel={`More Options`}
        searchLabel={`Find`}
        replaceLabel={`Replace`}
        onSearch={handleSearch}
        onMore={handleMore}
        leftChildren={
          scripting ? (
            <ToggleFoldingPanelHeaderIconButton
              toggleFolding={toggleFolding}
              onClick={onToggleFolding}
            />
          ) : undefined
        }
        rightChildren={
          <>
            <UndoRedoControl type={windowType} />
            <ScriptingPanelHeaderIconButton
              scripting={scripting}
              onClick={handleClickHeaderScriptingIcon}
            />
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
  onSectionChange: (name: string) => void;
}

const ContainerPanelContent = React.memo(
  (props: ContainerPanelContentProps): JSX.Element => {
    const { windowType, scripting, toggleFolding, onSectionChange } = props;

    if (scripting) {
      return (
        <ContainerScriptEditor
          windowType={windowType}
          toggleFolding={toggleFolding}
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

  const [state] = useContext(ProjectEngineContext);
  const { portrait } = useContext(WindowTransitionContext);

  const [toggleFolding, setToggleFolding] = useState<boolean>(false);
  const [headerName, setHeaderName] = useState("");

  const scripting = state?.panel?.panels?.[windowType]?.scripting;
  const theme = useTheme();

  useBodyBackgroundColor(theme.colors.darkForeground);
  useHTMLBackgroundColor(theme.colors.darkForeground);

  const handleSectionChange = useCallback((name: string) => {
    setHeaderName(name);
  }, []);

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
      overflowX: scripting ? undefined : "scroll",
      overflowY: scripting ? undefined : "scroll",
      ...(!scripting && portrait ? fixedStyle : {}),
    }),
    [fixedStyle, portrait, scripting]
  );

  const overlayStyle: CSSProperties = useMemo(
    () => (portrait ? { ...fixedStyle, zIndex: 2 } : undefined),
    [portrait, fixedStyle]
  );

  const title = headerName || "Script";

  return (
    <Panel
      useWindowAsScrollContainer={scripting}
      backgroundStyle={backgroundStyle}
      overlayStyle={overlayStyle}
      topChildren={
        scripting ? (
          <ContainerPanelHeader
            windowType={windowType}
            title={title}
            toggleFolding={toggleFolding}
            onToggleFolding={setToggleFolding}
          />
        ) : undefined
      }
      overlay={
        <ContainerPanelHeader
          windowType={windowType}
          title={title}
          toggleFolding={toggleFolding}
          onToggleFolding={setToggleFolding}
        />
      }
    >
      <ContainerPanelContent
        windowType={windowType}
        scripting={scripting}
        toggleFolding={toggleFolding}
        onSectionChange={handleSectionChange}
      />
    </Panel>
  );
});

export default ContainerPanel;
