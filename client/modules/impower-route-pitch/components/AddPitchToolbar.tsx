import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, { useCallback, useMemo, useState } from "react";
import PencilSolidIcon from "../../../resources/icons/solid/pencil.svg";
import { FontIcon } from "../../impower-icon";
import CornerFab from "../../impower-route-engine/components/fabs/CornerFab";

const StyledAddPitchToolbarArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
  transition: opacity 0.15s ease;
`;

const StyledScrollSentinel = styled.div`
  pointer-events: none;
  position: absolute;
  top: 0px;
  left: 0;
  width: 1px;
  height: 1px;
`;

interface AddPitchToolbarProps {
  toolbarRef?: React.Ref<HTMLDivElement>;
  label?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const AddPitchToolbar = React.memo(
  (props: AddPitchToolbarProps): JSX.Element => {
    const { toolbarRef, label, onClick } = props;

    const [scrollSentinel, setScrollSentinel] = useState<HTMLElement>();

    const handleScrollSentinelRef = useCallback((instance: HTMLDivElement) => {
      if (instance) {
        setScrollSentinel(instance);
      }
    }, []);

    const theme = useTheme();

    const fabMaxWidth = theme.breakpoints.values.sm;

    const fabSpacing = theme.spacing(3);

    const fabStyle: React.CSSProperties = useMemo(
      () => ({
        position: "fixed",
        left: fabSpacing,
        right: fabSpacing,
        bottom: fabSpacing,
        maxWidth: fabMaxWidth,
        margin: "auto",
      }),
      [fabMaxWidth, fabSpacing]
    );

    const icon = useMemo(
      () => (
        <FontIcon aria-label={label} size={15}>
          <PencilSolidIcon />
        </FontIcon>
      ),
      [label]
    );
    return (
      <>
        <StyledScrollSentinel ref={handleScrollSentinelRef} />
        <StyledAddPitchToolbarArea id="add-pitch-toolbar" ref={toolbarRef}>
          <CornerFab
            icon={icon}
            label={label}
            color="primary"
            scrollSentinel={scrollSentinel}
            onClick={onClick}
            style={fabStyle}
          />
        </StyledAddPitchToolbarArea>
      </>
    );
  }
);

export default AddPitchToolbar;
