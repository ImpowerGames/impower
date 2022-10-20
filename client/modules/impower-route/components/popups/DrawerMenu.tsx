import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Dialog from "@mui/material/Dialog";
import Drawer from "@mui/material/Drawer";
import Popover, {
  PopoverOrigin,
  PopoverPosition,
  PopoverReference,
} from "@mui/material/Popover";
import useMediaQuery from "@mui/material/useMediaQuery";
import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
} from "react";

const StyledContent = styled.div`
  padding: ${(props): string => props.theme.spacing(1, 0)};
`;

const StyledDrawer = styled(Drawer)`
  & .MuiPaper-root {
    border-radius: ${(props): string => props.theme.spacing(1, 1, 0, 0)};
  }
  z-index: 2100;
`;

const StyledPopover = styled(Popover)``;

const StyledDrawerDialog = styled(Dialog)`
  & .MuiDialog-container.MuiDialog-scrollPaper {
    will-change: transform;
    transform: translateZ(0);
  }
`;

export interface DrawerMenuProps {
  anchorReference?: PopoverReference;
  anchorEl?: Element | ((element: Element) => Element);
  anchorPosition?: PopoverPosition;
  anchorOrigin?: PopoverOrigin;
  open?: boolean;
  onClose?: (event: React.MouseEvent | React.KeyboardEvent) => void;
}

const DrawerMenu = React.memo(
  (props: PropsWithChildren<DrawerMenuProps>): JSX.Element => {
    const {
      children,
      anchorReference,
      anchorEl,
      anchorPosition,
      anchorOrigin,
      open,
      onClose,
    } = props;

    const [state, setState] = React.useState(open);
    const theme = useTheme();
    const belowXsBreakpoint = useMediaQuery(theme.breakpoints.down("sm"));

    const defaultAnchorOrigin: PopoverOrigin = useMemo(
      () => ({
        vertical: "top",
        horizontal: "center",
      }),
      []
    );

    const toggleDrawer = useCallback(
      (open: boolean) =>
        (event: React.MouseEvent | React.KeyboardEvent): void => {
          if (
            event &&
            event.type === "keydown" &&
            ((event as React.KeyboardEvent).key === "Tab" ||
              (event as React.KeyboardEvent).key === "Shift")
          ) {
            return;
          }

          setState(open);
        },
      []
    );

    const handleClose = useCallback(
      (e: React.MouseEvent | React.KeyboardEvent) => {
        toggleDrawer(false);
        if (onClose) {
          onClose(e);
        }
      },
      [onClose, toggleDrawer]
    );

    useEffect(() => {
      setState(open);
    }, [open]);

    if (belowXsBreakpoint) {
      return (
        <StyledDrawer
          anchor="bottom"
          open={state || false}
          onClose={handleClose}
        >
          <StyledContent
            onMouseDown={(e): void => {
              e.stopPropagation();
            }}
            onPointerDown={(e): void => {
              e.stopPropagation();
            }}
            onTouchStart={(e): void => {
              e.stopPropagation();
            }}
            onClick={(e): void => {
              e.stopPropagation();
            }}
          >
            {children}
          </StyledContent>
        </StyledDrawer>
      );
    }

    if (anchorEl) {
      return (
        <StyledPopover
          open={state || false}
          anchorReference={anchorReference}
          anchorEl={anchorEl}
          anchorPosition={anchorPosition}
          onClose={handleClose}
          anchorOrigin={anchorOrigin || defaultAnchorOrigin}
          transformOrigin={
            anchorReference === "anchorPosition"
              ? {
                  vertical: "top",
                  horizontal: "left",
                }
              : {
                  vertical: "top",
                  horizontal: "center",
                }
          }
          disableScrollLock
        >
          <StyledContent
            onMouseDown={(e): void => {
              e.stopPropagation();
            }}
            onPointerDown={(e): void => {
              e.stopPropagation();
            }}
            onTouchStart={(e): void => {
              e.stopPropagation();
            }}
            onClick={(e): void => {
              e.stopPropagation();
            }}
          >
            {children}
          </StyledContent>
        </StyledPopover>
      );
    }
    return (
      <StyledDrawerDialog open={state || false} onClose={handleClose}>
        <StyledContent
          onMouseDown={(e): void => {
            e.stopPropagation();
          }}
          onPointerDown={(e): void => {
            e.stopPropagation();
          }}
          onTouchStart={(e): void => {
            e.stopPropagation();
          }}
          onClick={(e): void => {
            e.stopPropagation();
          }}
        >
          {children}
        </StyledContent>
      </StyledDrawerDialog>
    );
  }
);

export default DrawerMenu;
