import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Dialog, { DialogProps } from "@material-ui/core/Dialog";
import Slide from "@material-ui/core/Slide";
import { TransitionProps } from "@material-ui/core/transitions";
import useMediaQuery from "@material-ui/core/useMediaQuery";
import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Portal, useBodyPadding } from "../../impower-route";
import { setBodyBackgroundColor } from "../../impower-route/utils/setBodyBackgroundColor";
import { setHTMLBackgroundColor } from "../../impower-route/utils/setHTMLBackgroundColor";

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
  pointer-events: none;
`;

const StyledPitchDialog = styled(Dialog)`
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
    flex: 1;
    flex-direction: column;
    touch-action: pan-y;
    overscroll-behavior: contain;
    align-items: center;
    justify-content: center;
  }

  & .MuiPaper-root.MuiDialog-paper {
    flex: 1;
    border-radius: 0;
    overflow-x: hidden;
    overflow-y: hidden;
    min-height: 100%;
    max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  }

  min-width: 100vw;
`;

const Transition = React.forwardRef(
  (
    props: TransitionProps & { children?: React.ReactElement },
    ref: React.Ref<unknown>
  ) => <Slide direction="up" ref={ref} {...props} />
);

interface PitchDialogProps extends DialogProps {
  style?: React.CSSProperties;
}

const PitchDialog = React.memo(
  (props: PropsWithChildren<PitchDialogProps>): JSX.Element => {
    const { open, TransitionProps, onClose, children, style } = props;
    const onEntered = TransitionProps?.onEntered;
    const onExit = TransitionProps?.onExit;

    const [openState, setOpenState] = useState(false);

    useEffect(() => {
      setOpenState(open);
    }, [open]);

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

    const DialogTransitionProps = useMemo(
      () => ({
        ...TransitionProps,
        onEntered: handleEntered,
        onExit: handleExit,
      }),
      [TransitionProps, handleEntered, handleExit]
    );

    const paddingRight = useBodyPadding();

    const currentStyle = useMemo(
      () => ({ paddingRight, ...style }),
      [paddingRight, style]
    );

    return (
      <>
        <Portal>
          {belowSmBreakpoint && backgroundVisible && (
            <StyledFullscreenBottomBackground />
          )}
        </Portal>
        <StyledPitchDialog
          fullScreen
          disableRestoreFocus
          open={openState}
          onClose={onClose}
          TransitionProps={DialogTransitionProps}
          TransitionComponent={Transition}
          style={currentStyle}
          disableEnforceFocus
          {...props}
        >
          {children}
        </StyledPitchDialog>
      </>
    );
  }
);

export default PitchDialog;
