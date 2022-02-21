import styled from "@emotion/styled";
import { AnimatePresence } from "framer-motion";
import React, { useRef } from "react";
import OverlayTransition from "../../../impower-route/components/animations/OverlayTransition";
import { panels } from "../../types/info/panels";
import { DataWindowType } from "../../types/state/dataPanelState";
import { PanelType, WindowType } from "../../types/state/windowState";
import Panelbar, { PanelbarPosition } from "../bars/Panelbar";
import AssetsPanel from "../panels/AssetsPanel";
import ContainerPanel from "../panels/ContainerPanel";
import DetailPanel from "../panels/DetailPanel";
import ItemPanel from "../panels/ItemPanel";
import SetupPanel from "../panels/SetupPanel";
import TestPanel from "../panels/TestPanel";

const StyledPane = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: ${(props): string => props.theme.borderRadius.topTab};
  background-color: ${(props): string => props.theme.colors.darkForeground};
  pointer-events: auto;
  max-width: 100%;
  height: 100%;
`;

const StyledPanelContent = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledPanelArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

interface PanelContentProps {
  type: PanelType;
  windowType: WindowType;
}

const PanelContent = React.memo(
  (props: PanelContentProps): JSX.Element | null => {
    const { type, windowType } = props;

    if (!type) {
      return null;
    }

    switch (type) {
      case PanelType.Setup:
        return <SetupPanel key={PanelType.Setup} />;
      case PanelType.Container:
        if (
          windowType === WindowType.Entities ||
          windowType === WindowType.Logic
        ) {
          return (
            <ContainerPanel
              key={PanelType.Container}
              windowType={windowType as unknown as DataWindowType}
            />
          );
        }
        return null;
      case PanelType.Item:
        if (
          windowType === WindowType.Entities ||
          windowType === WindowType.Logic
        ) {
          return (
            <ItemPanel
              key={PanelType.Item}
              windowType={windowType as unknown as DataWindowType}
            />
          );
        }
        return null;
      case PanelType.Detail:
        if (
          windowType === WindowType.Setup ||
          windowType === WindowType.Entities ||
          windowType === WindowType.Logic
        ) {
          return (
            <DetailPanel
              key={PanelType.Detail}
              windowType={windowType as unknown as DataWindowType}
            />
          );
        }
        return null;
      case PanelType.Test:
        return <TestPanel key={PanelType.Test} />;
      case PanelType.Assets:
        return <AssetsPanel key={PanelType.Assets} />;
      default:
        return null;
    }
  }
);

interface PanelAreaProps {
  type: PanelType;
  windowType: WindowType;
  preservePane: boolean;
  style?: React.CSSProperties;
}

const PanelArea = React.memo((props: PanelAreaProps): JSX.Element | null => {
  const { type, windowType, preservePane, style } = props;
  const previousZIndexRef = useRef(0);
  const zIndex =
    type === PanelType.Container
      ? 0
      : type === PanelType.Item
      ? 1
      : type === PanelType.Detail
      ? 2
      : 0;
  const previousZIndex = previousZIndexRef.current;
  previousZIndexRef.current = zIndex;
  const overlayDirection = zIndex - previousZIndex;
  const custom = { position: "static", overlayDirection, yDirection: 1 };

  return (
    <StyledPanelArea key={preservePane ? undefined : windowType} style={style}>
      <AnimatePresence initial={false} custom={custom} exitBeforeEnter>
        <OverlayTransition key={type} style={{ zIndex }} custom={custom}>
          <PanelContent type={type} windowType={windowType} />
        </OverlayTransition>
      </AnimatePresence>
    </StyledPanelArea>
  );
});

const panelDisplayOrder = panels.map((panel) => panel.type);

interface PaneContentProps {
  windowType: WindowType;
  panelFocusOrder: PanelType[];
  panelbarPosition: PanelbarPosition;
  panelbar?: React.ReactNode;
  preservePane: boolean;
}

const PaneContent = React.memo(
  (props: PaneContentProps): JSX.Element | null => {
    const {
      windowType,
      panelFocusOrder,
      panelbarPosition,
      panelbar,
      preservePane,
    } = props;

    const visiblePanelOrder = panelDisplayOrder.filter((panel) =>
      panelFocusOrder.includes(panel)
    );
    const openPanel = panelFocusOrder[0];

    if (!visiblePanelOrder) {
      return null;
    }

    switch (panelbarPosition) {
      case PanelbarPosition.Top:
        return (
          <>
            <Panelbar openPanel={openPanel} panelbarPosition={panelbarPosition}>
              {panelbar}
            </Panelbar>
            <StyledPanelContent>
              <PanelArea
                windowType={windowType}
                type={openPanel}
                preservePane={preservePane}
              />
            </StyledPanelContent>
          </>
        );
      default:
        return (
          <>
            <StyledPanelContent>
              <PanelArea
                windowType={windowType}
                type={openPanel}
                preservePane={preservePane}
              />
            </StyledPanelContent>
          </>
        );
    }
  }
);

interface PaneProps {
  windowType: WindowType;
  panelFocusOrder: PanelType[];
  panelbarPosition: PanelbarPosition;
  panelbar?: React.ReactNode;
  preservePane?: boolean;
  innerRef?: React.RefObject<HTMLDivElement>;
}

const Pane = React.memo((props: PaneProps): JSX.Element | null => {
  const {
    windowType,
    panelFocusOrder,
    panelbarPosition,
    panelbar,
    preservePane = false,
    innerRef,
  } = props;

  if (panelFocusOrder.length === 0) {
    return null;
  }

  return (
    <StyledPane ref={innerRef}>
      <PaneContent
        windowType={windowType}
        panelFocusOrder={panelFocusOrder}
        panelbarPosition={panelbarPosition}
        panelbar={panelbar}
        preservePane={preservePane}
      />
    </StyledPane>
  );
});

export default Pane;
