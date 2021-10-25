import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { Dialog, DialogProps, Slide, useMediaQuery } from "@material-ui/core";
import { TransitionProps } from "@material-ui/core/transitions";
import React, {
  PropsWithChildren,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { setBodyBackgroundColor } from "../../utils/setBodyBackgroundColor";
import { setHTMLBackgroundColor } from "../../utils/setHTMLBackgroundColor";
import Portal from "../layouts/Portal";

const StyledFullscreenBottomBackground = styled.div`
  background-color: white;
  height: 30vh;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2;
  will-change: transform;
  transform: translateZ(0);
`;

const StyledEditDialog = styled(Dialog)<{ fullScreen?: boolean }>`
  * {
    touch-action: none;
    overscroll-behavior: contain;
  }

  & .MuiDialog-container.MuiDialog-scrollPaper * {
    touch-action: pan-y;
    overscroll-behavior: contain;
  }

  & .MuiDialog-container.MuiDialog-scrollPaper {
    will-change: transform;
    transform: translateZ(0);
    touch-action: pan-y;
    overscroll-behavior: contain;
    align-items: center;
    justify-content: center;
    ${(props): string => props.theme.breakpoints.down("md")} {
      align-items: stretch;
      justify-content: stretch;
    }
  }

  & .MuiPaper-root.MuiDialog-paper {
    overflow-x: hidden;
    max-width: ${(props): string => (props.fullScreen ? "100%" : "448px")};
    min-width: ${(props): string => (props.fullScreen ? "100%" : "448px")};
    ${(props): string => props.theme.breakpoints.down("md")} {
      margin: ${(props): string => props.theme.spacing(0, 0)};
      border-radius: 0;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      max-height: 100%;
    }
  }
`;

const Transition = React.forwardRef(
  (
    props: TransitionProps & { children?: React.ReactElement },
    ref: React.Ref<unknown>
  ) => <Slide direction="up" ref={ref} {...props} />
);

interface EditDialogProps extends DialogProps {
  open: boolean;
  fullScreen?: boolean;
  onClose?: (
    e: React.MouseEvent,
    reason: "backdropClick" | "escapeKeyDown"
  ) => void;
  style?: React.CSSProperties;
}

const EditDialog = React.memo(
  (props: PropsWithChildren<EditDialogProps>): JSX.Element => {
    const { ref, open, fullScreen, onClose, children, style, TransitionProps } =
      props;
    const onEntered = TransitionProps?.onEntered;
    const onExit = TransitionProps?.onExit;

    const [backgroundVisible, setBackgroundVisible] = useState(false);

    const bodyColor = useRef<string>();

    const theme = useTheme();

    const belowSmBreakpoint = useMediaQuery(theme.breakpoints.down("md"));

    const handleEntered = useCallback(
      (node: HTMLElement, isAppearing: boolean): void => {
        bodyColor.current = document.body.style.backgroundColor;
        if (belowSmBreakpoint) {
          setBodyBackgroundColor(document, "white");
          setHTMLBackgroundColor(document, "white");
          setBackgroundVisible(true);
        }
        if (onEntered) {
          onEntered(node, isAppearing);
        }
      },
      [onEntered, belowSmBreakpoint]
    );

    const handleExit = useCallback(
      (node: HTMLElement): void => {
        setBodyBackgroundColor(document, bodyColor.current);
        setHTMLBackgroundColor(document, bodyColor.current);
        setBackgroundVisible(false);
        if (onExit) {
          onExit(node);
        }
      },
      [onExit]
    );

    const PaperProps = useMemo(
      () => ({
        elevation: fullScreen || belowSmBreakpoint ? 0 : undefined,
      }),
      [belowSmBreakpoint, fullScreen]
    );

    return (
      <>
        <Portal>
          {belowSmBreakpoint && backgroundVisible && (
            <StyledFullscreenBottomBackground />
          )}
        </Portal>
        <StyledEditDialog
          {...props}
          ref={ref}
          open={open}
          onClose={onClose}
          TransitionProps={{
            ...TransitionProps,
            onEntered: handleEntered,
            onExit: handleExit,
          }}
          PaperProps={PaperProps}
          TransitionComponent={Transition}
          fullScreen={fullScreen || belowSmBreakpoint}
          style={style}
        >
          {children}
        </StyledEditDialog>
      </>
    );
  }
);

export default EditDialog;
