import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { alpha } from "@material-ui/core";
import Dialog, { DialogProps } from "@material-ui/core/Dialog";
import IconButton from "@material-ui/core/IconButton";
import Slide from "@material-ui/core/Slide";
import { TransitionProps } from "@material-ui/core/transitions";
import useMediaQuery from "@material-ui/core/useMediaQuery";
import React, {
  CSSProperties,
  PropsWithChildren,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import XmarkSolidIcon from "../../../../resources/icons/solid/xmark.svg";
import { FontIcon } from "../../../impower-icon";
import { setBodyBackgroundColor } from "../../utils/setBodyBackgroundColor";
import { setHTMLBackgroundColor } from "../../utils/setHTMLBackgroundColor";
import Portal from "../layouts/Portal";

const StyledFullscreenBottomBackground = styled.div`
  background-color: ${(props): string => props.theme.palette.primary.main};
  height: 30vh;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 3;
  will-change: transform;
  transform: translateZ(0);
`;

const StyledHelpDialog = styled(Dialog)`
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
      align-items: flex-end;
      justify-content: stretch;
    }
  }

  & .MuiPaper-root {
    will-change: transform;
    transform: translateZ(0);
    background-color: ${(props): string => props.theme.palette.primary.main};
    color: white;
    overflow-x: hidden;
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

const StyledResponsiveArea = styled.div`
  padding: ${(props): string => props.theme.spacing(3)};
`;

const StyledHeader = styled.div`
  pointer-events: none;
  z-index: 2;

  position: sticky;
  top: 0;
  left: 0;
  right: 0;

  margin-bottom: -56px;

  display: flex;
  justify-content: flex-end;
  border-radius: 50%;

  ${(props): string => props.theme.breakpoints.down("md")} {
    top: 0;
    height: auto;

    display: block;
    justify-content: stretch;
    border-radius: ${(props): string => props.theme.spacing(1)};
  }
`;

const StyledContent = styled.div`
  padding: ${(props): string => props.theme.spacing(2)};
`;

const StyledIconButton = styled(IconButton)`
  pointer-events: auto;
`;

const StyledIconButtonBackground = styled.div`
  border-radius: inherit;
  position: absolute;
  top: ${(props): string => props.theme.spacing(2)};
  bottom: ${(props): string => props.theme.spacing(2)};
  left: ${(props): string => props.theme.spacing(2)};
  right: ${(props): string => props.theme.spacing(2)};
  background-color: ${(props): string =>
    alpha(props.theme.palette.primary.main, 0.9)};
`;

const SlideTransition = React.forwardRef(function Transition(
  props: TransitionProps & { children?: React.ReactElement },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

interface HelpDialogProps extends DialogProps {
  open: boolean;
  scrollRef?: React.Ref<HTMLElement>;
  style?: CSSProperties;
  onClose?: (e: React.MouseEvent) => void;
}

const HelpDialog = (props: PropsWithChildren<HelpDialogProps>): JSX.Element => {
  const { open, scrollRef, onClose, TransitionProps, style, children } = props;
  const onEntered = TransitionProps?.onEntered;
  const onExit = TransitionProps?.onExit;

  const [backgroundVisible, setBackgroundVisible] = useState(false);

  const bodyColor = useRef<string>();

  const theme = useTheme();

  const belowSmBreakpoint = useMediaQuery(theme.breakpoints.down("md"));

  const handleResponsiveAreaRef = useCallback(
    (instance: HTMLElement) => {
      if (instance?.parentElement) {
        if (scrollRef) {
          if (typeof scrollRef === "function") {
            scrollRef(instance.parentElement);
          } else {
            (scrollRef as { current: HTMLElement }).current =
              instance.parentElement;
          }
        }
      }
    },
    [scrollRef]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      e.preventDefault();
      if (onClose) {
        onClose(e);
      }
    },
    [onClose]
  );
  const handleEntered = useCallback(
    (node: HTMLElement, isAppearing: boolean): void => {
      bodyColor.current = document.body.style.backgroundColor;
      if (belowSmBreakpoint) {
        setBodyBackgroundColor(document, theme.palette.primary.main);
        setHTMLBackgroundColor(document, theme.palette.primary.main);
        setBackgroundVisible(true);
      }
      if (onEntered) {
        onEntered(node, isAppearing);
      }
    },
    [onEntered, belowSmBreakpoint, theme.palette.primary.main]
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

  const HelpTransitionProps = useMemo(
    () => ({
      ...TransitionProps,
      onEntered: handleEntered,
      onExit: handleExit,
    }),
    [TransitionProps, handleEntered, handleExit]
  );

  return (
    <>
      <Portal>
        {belowSmBreakpoint && backgroundVisible && (
          <StyledFullscreenBottomBackground />
        )}
      </Portal>
      <StyledHelpDialog
        open={open}
        onClose={handleClose}
        fullScreen={belowSmBreakpoint}
        TransitionProps={HelpTransitionProps}
        maxWidth="lg"
        TransitionComponent={SlideTransition}
        style={style}
        {...props}
      >
        <StyledHeader>
          <StyledIconButton
            onClick={handleClose}
            style={{
              padding: theme.spacing(2),
            }}
          >
            <StyledIconButtonBackground />
            <FontIcon
              aria-label="Back"
              color={theme.palette.secondary.light}
              size={24}
            >
              <XmarkSolidIcon />
            </FontIcon>
          </StyledIconButton>
        </StyledHeader>
        <StyledResponsiveArea ref={handleResponsiveAreaRef}>
          <StyledContent>{children}</StyledContent>
        </StyledResponsiveArea>
      </StyledHelpDialog>
    </>
  );
};

export default HelpDialog;
