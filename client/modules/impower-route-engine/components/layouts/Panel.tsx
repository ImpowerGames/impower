import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, {
  CSSProperties,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { WindowTransitionContext } from "../../contexts/transitionContext";
import { dataPanelSetScrollParent } from "../../types/actions/dataPanelActions";
import { PanelType } from "../../types/state/windowState";

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
  flex: 1;
  display: flex;
  flex-direction: column;
  z-index: 2;
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
  bottom: 0;
  pointer-events: none;
  display: flex;
  flex-direction: column;
`;

const StyledPanelContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledPanelArrangement = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

interface PanelProps {
  panelType: PanelType;
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
    panelType,
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

  const scrollRef = useRef<HTMLDivElement>();
  const ref = useRef<HTMLDivElement>();
  const overlayRef = useRef<HTMLDivElement>();
  const [, dispatch] = useContext(ProjectEngineContext);
  const { portrait } = useContext(WindowTransitionContext);
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

  const panelStyle: React.CSSProperties = portrait
    ? undefined
    : {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      };

  useEffect(() => {
    const scrollEl =
      portrait && useWindowAsScrollContainer
        ? document.documentElement
        : scrollRef.current;
    dispatch(dataPanelSetScrollParent(scrollEl));
    if (scrollEl) {
      if (onScrollRef) {
        onScrollRef(scrollEl);
      }
    }
  }, [dispatch, onScrollRef, portrait, useWindowAsScrollContainer]);

  const handleScrollRef = useCallback(
    (instance: HTMLDivElement): void => {
      if (instance) {
        scrollRef.current = instance;
        const scrollEl =
          portrait && useWindowAsScrollContainer
            ? document.documentElement
            : scrollRef.current;
        if (scrollEl) {
          if (onScrollRef) {
            onScrollRef(scrollEl);
          }
        }
      }
    },
    [onScrollRef, portrait, useWindowAsScrollContainer]
  );

  return (
    <StyledPanel
      ref={ref}
      id={panelType}
      onContextMenu={handleContextMenu}
      style={{
        backgroundColor: foregroundColor,
        color: "white",
        ...panelStyle,
        ...style,
        marginBottom: portrait ? undefined : theme.minHeight.navigationBar,
        paddingBottom: portrait ? theme.minHeight.navigationBar : undefined,
      }}
    >
      <StyledBackground
        ref={handleScrollRef}
        style={{
          backgroundColor: foregroundColor,
          ...backgroundStyle,
          overflowY: portrait ? undefined : "scroll",
        }}
      >
        {topChildren}
        <StyledForeground style={{ backgroundColor: foregroundColor }}>
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
