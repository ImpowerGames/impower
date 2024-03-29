import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, {
  CSSProperties,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import useIOS from "../../../impower-route/hooks/useIOS";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { WindowTransitionContext } from "../../contexts/transitionContext";

const StyledPanel = styled.div`
  min-width: ${(props): string => props.theme.minWidth.panel};
  border-top: none;
  border-bottom: none;
  flex: 1;
  display: flex;
  position: relative;
  z-index: 0;
`;

const StyledBackground = styled.div`
  overflow-x: hidden;
  flex: 1;
  display: flex;
  flex-direction: column;
  z-index: 2;
  overscroll-behavior: contain;
  & {
    touch-action: pan-y;
  }
  & * {
    touch-action: pan-y;
  }
`;

const StyledForeground = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
`;

const StyledOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: ${(props): string => props.theme.minHeight.navigationBar};
  pointer-events: none;
  display: flex;
  flex-direction: column;
  z-index: 2;
`;

const StyledPanelContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledPanelArrangement = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

interface PanelProps {
  overlay?: ReactNode;
  topChildren?: ReactNode;
  style?: CSSProperties;
  overlayStyle?: CSSProperties;
  backgroundStyle?: CSSProperties;
  useWindowAsScrollContainer?: boolean;
  onScrollRef?: (instance: HTMLElement) => void;
  onContextMenu?(event: React.MouseEvent): void;
}

const Panel = (props: React.PropsWithChildren<PanelProps>): JSX.Element => {
  const {
    overlay,
    topChildren,
    style,
    useWindowAsScrollContainer,
    backgroundStyle,
    overlayStyle,
    onScrollRef,
    onContextMenu,
    children,
  } = props;

  const ios = useIOS();

  const windowScrolling = useWindowAsScrollContainer && !ios;

  const scrollRef = useRef<HTMLDivElement>();
  const ref = useRef<HTMLDivElement>();
  const overlayRef = useRef<HTMLDivElement>();
  const [state, dispatch] = useContext(ProjectEngineContext);
  const { portrait } = useContext(WindowTransitionContext);
  const windowType = state?.window?.type;
  const toolbar = state?.panel?.panels?.[windowType]?.toolbar;

  const theme = useTheme();

  const handleContextMenu = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault();
      if (e.button === 2) {
        if (onContextMenu) {
          onContextMenu(e);
        }
      }
    },
    [onContextMenu]
  );

  const foregroundColor = theme.colors.darkForeground;

  const panelStyle: React.CSSProperties = windowScrolling
    ? undefined
    : {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      };

  useEffect(() => {
    const scrollEl = windowScrolling
      ? document.documentElement
      : scrollRef.current;
    if (scrollEl) {
      if (onScrollRef) {
        onScrollRef(scrollEl);
      }
    }
  }, [dispatch, onScrollRef, windowScrolling]);

  const handleScrollRef = useCallback(
    (instance: HTMLDivElement): void => {
      if (instance) {
        scrollRef.current = instance;
        const scrollEl = windowScrolling
          ? document.documentElement
          : scrollRef.current;
        if (scrollEl) {
          if (onScrollRef) {
            onScrollRef(scrollEl);
          }
        }
      }
    },
    [onScrollRef, windowScrolling]
  );

  const showDesktopSnippetToolbar = !portrait && toolbar === "snippet";

  const scrollMargins = useMemo(
    () => ({
      marginBottom: showDesktopSnippetToolbar
        ? `calc(${theme.minHeight.navigationBar} * 2)`
        : theme.minHeight.navigationBar,
    }),
    [showDesktopSnippetToolbar, theme.minHeight.navigationBar]
  );

  return (
    <StyledPanel
      ref={ref}
      onContextMenu={handleContextMenu}
      style={{
        backgroundColor: foregroundColor,
        color: "white",
        ...panelStyle,
        ...style,
      }}
    >
      <StyledBackground
        className="panel-scroll"
        ref={handleScrollRef}
        style={{
          backgroundColor: theme.colors.darkForeground,
          ...scrollMargins,
          ...backgroundStyle,
          overflowY: windowScrolling ? undefined : "scroll",
        }}
      >
        {topChildren}
        <StyledForeground>
          <StyledPanelContent>
            <StyledPanelArrangement>{children}</StyledPanelArrangement>
          </StyledPanelContent>
        </StyledForeground>
      </StyledBackground>
      <StyledOverlay ref={overlayRef} style={overlayStyle}>
        {overlay}
      </StyledOverlay>
    </StyledPanel>
  );
};

export default Panel;
