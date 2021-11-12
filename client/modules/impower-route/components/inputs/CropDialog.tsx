import styled from "@emotion/styled";
import { alpha } from "@material-ui/core";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import IconButton from "@material-ui/core/IconButton";
import Paper from "@material-ui/core/Paper";
import Slide from "@material-ui/core/Slide";
import Tab from "@material-ui/core/Tab";
import { TransitionProps } from "@material-ui/core/transitions";
import Typography from "@material-ui/core/Typography";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ArrowLeftRegularIcon from "../../../../resources/icons/regular/arrow-left.svg";
import {
  ConfirmDialogContext,
  confirmDialogNavOpen,
} from "../../../impower-confirm-dialog";
import { FontIcon } from "../../../impower-icon";
import { getPreviewAspectRatio } from "../../../impower-route-pitch/utils/getPreviewAspectRatio";
import Tabs from "../layouts/Tabs";

const discardInfo = {
  title: "Discard unsaved changes?",
  agreeLabel: "Discard",
  disagreeLabel: "Keep Editing",
};

const StyledCropDialog = styled(Dialog)`
  z-index: 2000;

  * {
    touch-action: none;
    overscroll-behavior: contain;
  }

  & .MuiDialog-container.MuiDialog-scrollPaper * {
    touch-action: pan-x pan-y;
    overscroll-behavior: contain;
    border-radius: 0;
  }

  & .MuiDialog-container.MuiDialog-scrollPaper {
    touch-action: pan-x pan-y;
    overscroll-behavior: contain;
    border-radius: 0;
    will-change: transform;
    transform: translateZ(0);
  }
`;

const StyledPaper = styled(Paper)`
  &.MuiDialog-paper {
    overflow-y: hidden;
    overflow-x: hidden;
    width: 100%;
    margin: auto;
    min-height: 100%;
  }

  * {
    user-select: none;
    user-drag: none;
    touch-callout: none;
  }
`;

const StyledContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow: hidden;
`;

const StyledOverflowArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  &::-webkit-scrollbar {
    display: none;
  }
  scrollbar-width: none;
`;

const StyledAspectRatioArea = styled.div`
  height: 0;
  width: 100%;
  padding-top: 50%;
  position: relative;
`;

const StyledAspectRatioContent = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`;

const StyledImage = styled.img``;

const StyledImageOverlay = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

const StyledImageArea = styled.div`
  position: relative;
  display: flex;
`;

const StyledForceOverflow = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  opacity: 0.5;
`;

const StyledHeaderArea = styled.div`
  pointer-events: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  min-height: ${(props): string => props.theme.spacing(7)};
  z-index: 1;
`;

const StyledHeaderContainer = styled.div`
  width: 100%;
  margin: auto;
  display: flex;
  align-items: center;
  position: relative;
  padding: ${(props): string => props.theme.spacing(0, 1)};
  background: linear-gradient(
    0deg,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0.5) 100%
  );
  color: white;
`;

const StyledFooterArea = styled.div`
  pointer-events: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1;
`;

const StyledFooterContainer = styled.div`
  width: 100%;
  margin: auto;
  display: flex;
  align-items: center;
  position: relative;
  padding: ${(props): string => props.theme.spacing(0, 1)};
  background: linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.5) 0%,
    rgba(0, 0, 0, 0) 100%
  );
  color: white;
`;

const StyledHeaderTextArea = styled.div`
  flex: 1;
  padding: ${(props): string => props.theme.spacing(0, 1)};
`;

const StyledHeaderTypography = styled(Typography)<{ component?: string }>``;

const StyledIconButton = styled(IconButton)`
  pointer-events: auto;
  padding: ${(props): string => props.theme.spacing(2)};
  color: white;
  @media (hover: hover) and (pointer: fine) {
    &.MuiIconButton-root:hover {
      background-color: ${(props): string => props.theme.colors.black10};
    }
  }
`;

const StyledSubmitButtonArea = styled.div`
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: flex-end;
  padding: ${(props): string => props.theme.spacing(1)};
`;

const StyledSubmitButton = styled(Button)`
  pointer-events: auto;
  border-radius: ${(props): string => props.theme.spacing(10)};
`;

const StyledBoundsOverlay = styled.div`
  pointer-events: none;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const StyledBoundsContainer = styled.div`
  width: 100%;
  margin: auto;
`;

const StyledBoundsRatioArea = styled.div<{ backgroundColor?: string }>`
  height: 0;
  width: 100%;
  padding-top: 50%;
  position: relative;

  &:before {
    content: "";
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    width: 100%;
    height: 100vh;
    background-color: ${(props): string => props.backgroundColor};
  }
  &:after {
    content: "";
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    width: 100%;
    height: 100vh;
    background-color: ${(props): string => props.backgroundColor};
  }
`;

const StyledTabs = styled(Tabs)``;

const StyledTab = styled(Tab)`
  pointer-events: auto;
  flex: 1;
  max-width: none;

  display: flex;
  flex-direction: row;
  justify-content: center;
`;

interface BoundsOverlayProps {
  maxWidth?: number | string;
  backgroundColor?: string;
  previewAspectRatio?: number;
}

const BoundsOverlay = React.memo((props: BoundsOverlayProps) => {
  const { maxWidth, backgroundColor, previewAspectRatio } = props;
  const maxWidthStyle: React.CSSProperties = useMemo(
    () => ({ maxWidth }),
    [maxWidth]
  );
  const boundsRatioStyle: React.CSSProperties = useMemo(
    () => ({ paddingTop: `${100 / previewAspectRatio}%` }),
    [previewAspectRatio]
  );
  return (
    <StyledBoundsOverlay>
      <StyledBoundsContainer style={maxWidthStyle}>
        <StyledBoundsRatioArea
          style={boundsRatioStyle}
          backgroundColor={alpha(backgroundColor, 0.9)}
        />
      </StyledBoundsContainer>
    </StyledBoundsOverlay>
  );
});

interface CropHeaderProps {
  maxWidth?: number | string;
  hasUnsavedChanges?: boolean;
  positionHorizontally?: boolean;
  onSave?: (e: React.MouseEvent) => void;
  onClose?: (e: React.MouseEvent) => void;
}

const CropHeader = React.memo((props: CropHeaderProps) => {
  const { hasUnsavedChanges, maxWidth, positionHorizontally, onSave, onClose } =
    props;
  const maxWidthStyle: React.CSSProperties = useMemo(
    () => ({ maxWidth }),
    [maxWidth]
  );
  return (
    <StyledHeaderArea>
      <StyledHeaderContainer style={maxWidthStyle}>
        <StyledIconButton onClick={onClose}>
          <FontIcon aria-label={`Close`} size={24}>
            <ArrowLeftRegularIcon />
          </FontIcon>
        </StyledIconButton>
        <StyledHeaderTextArea>
          <StyledHeaderTypography variant="h6" component="h2">
            {positionHorizontally ? `Adjust Crop` : `Adjust Preview`}
          </StyledHeaderTypography>
        </StyledHeaderTextArea>
        <StyledSubmitButtonArea>
          <StyledSubmitButton
            disabled={!hasUnsavedChanges}
            color="inherit"
            disableElevation
            size="large"
            onClick={onSave}
          >
            {`Save`}
          </StyledSubmitButton>
        </StyledSubmitButtonArea>
      </StyledHeaderContainer>
    </StyledHeaderArea>
  );
});

interface CropFooterProps {
  maxWidth?: number | string;
  aspectRatio?: number;
  square?: boolean;
  onSquare?: (square: boolean) => void;
}

const CropFooter = React.memo((props: CropFooterProps) => {
  const { maxWidth, aspectRatio, square, onSquare } = props;
  const maxWidthStyle: React.CSSProperties = useMemo(
    () => ({ maxWidth }),
    [maxWidth]
  );
  const handleChangeTab = useCallback(
    (e: React.ChangeEvent, index: number) => {
      if (onSquare) {
        onSquare(!index);
      }
    },
    [onSquare]
  );
  const tabs = useMemo(
    () =>
      aspectRatio > 1 ? ["1:1", "2:1"] : aspectRatio < 1 ? ["1:1", "4:5"] : [],
    [aspectRatio]
  );
  if (tabs.length === 0) {
    return null;
  }
  return (
    <StyledFooterArea>
      <StyledFooterContainer style={maxWidthStyle}>
        <StyledTabs
          variant="fullWidth"
          value={square ? 0 : 1}
          onChange={handleChangeTab}
          indicatorColor="#fff"
        >
          {tabs.map((tab) => (
            <StyledTab key={tab} label={tab} />
          ))}
        </StyledTabs>
      </StyledFooterContainer>
    </StyledFooterArea>
  );
});

const requestScrollXMax = (
  onMeasure: (scrollMax: number) => void,
  instance: HTMLElement
): number => {
  const loop = (): void => {
    const scrollMax = instance.scrollWidth - instance.clientWidth;
    if (scrollMax) {
      onMeasure(scrollMax);
    } else {
      window.requestAnimationFrame(loop);
    }
  };
  return window.requestAnimationFrame(loop);
};

const requestScrollYMax = (
  onMeasure: (scrollMax: number) => void,
  instance: HTMLElement
): number => {
  const loop = (): void => {
    const scrollMax = instance.scrollHeight - instance.clientHeight;
    if (scrollMax) {
      onMeasure(scrollMax);
    } else {
      window.requestAnimationFrame(loop);
    }
  };
  return window.requestAnimationFrame(loop);
};

const Transition = React.forwardRef(
  (
    props: TransitionProps & { children?: React.ReactElement },
    ref: React.Ref<unknown>
  ) => <Slide direction="left" ref={ref} {...props} />
);

interface CropDialogProps {
  open: boolean;
  src: string;
  backgroundColor?: string;
  aspectRatio?: number;
  value?: number;
  square?: boolean;
  maxWidth?: number | string;
  onClose?: (e: React.MouseEvent) => void;
  onSquare?: (square: boolean) => void;
  onSave?: (value: number) => void;
  onCrop?: (value: number) => void;
}

const CropDialog = React.memo((props: CropDialogProps): JSX.Element => {
  const {
    open,
    src,
    aspectRatio,
    value,
    square,
    backgroundColor,
    maxWidth,
    onClose,
    onSquare,
    onSave,
    onCrop,
  } = props;

  const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);

  const [scrollEl, setScrollEl] = useState<HTMLDivElement>();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [mouseHover, setMouseHover] = useState(false);
  const [mouseDragging, setMouseDragging] = useState(false);

  const initialRef = useRef(value);
  const stateRef = useRef(value);
  const initialScroll = useRef(true);
  const mouseDraggingRef = useRef(false);
  const startScrollY = useRef<number>();
  const startClientY = useRef<number>();
  const startScrollX = useRef<number>();
  const startClientX = useRef<number>();

  const previewAspectRatio = getPreviewAspectRatio(aspectRatio, square);
  const positionHorizontally = aspectRatio > previewAspectRatio;

  const handleEnter = useCallback((): void => {
    initialScroll.current = true;
    initialRef.current = value;
    mouseDraggingRef.current = false;
    startScrollY.current = 0;
    startClientY.current = 0;
    startScrollX.current = 0;
    startClientX.current = 0;
    setHasUnsavedChanges(false);
  }, [value]);

  const handleRef = useCallback(
    (instance: HTMLDivElement) => {
      window.requestAnimationFrame(() => {
        if (instance) {
          if (positionHorizontally) {
            const onMeasure = (scrollMax: number): void => {
              instance.scrollLeft = initialRef.current * scrollMax;
              setScrollEl(instance);
            };
            requestScrollXMax(onMeasure, instance);
          } else {
            const onMeasure = (scrollMax: number): void => {
              instance.scrollTop = initialRef.current * scrollMax;
              setScrollEl(instance);
            };
            requestScrollYMax(onMeasure, instance);
          }
        }
      });
    },
    [positionHorizontally]
  );

  const handleScroll = useCallback((): void => {
    if (scrollEl) {
      if (positionHorizontally) {
        const scrollMax = scrollEl.scrollWidth - scrollEl.clientWidth;
        const offset = scrollEl.scrollLeft / scrollMax;
        stateRef.current = offset;
      } else {
        const scrollMax = scrollEl.scrollHeight - scrollEl.clientHeight;
        const offset = scrollEl.scrollTop / scrollMax;
        stateRef.current = offset;
      }
      if (!initialScroll.current) {
        setHasUnsavedChanges(true);
      }
      if (onCrop) {
        onCrop(stateRef.current);
      }
      initialScroll.current = false;
    }
  }, [onCrop, positionHorizontally, scrollEl]);

  const handleSquare = useCallback(
    (square: boolean) => {
      setHasUnsavedChanges(true);
      if (onSquare) {
        onSquare(square);
      }
    },
    [onSquare]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      const onDiscardChanges = (): void => {
        if (onClose) {
          onClose(e);
        }
      };
      if (hasUnsavedChanges) {
        confirmDialogDispatch(
          confirmDialogNavOpen(
            discardInfo.title,
            undefined,
            discardInfo.agreeLabel,
            onDiscardChanges,
            discardInfo.disagreeLabel,
            undefined
          )
        );
      } else {
        onDiscardChanges();
      }
    },
    [confirmDialogDispatch, hasUnsavedChanges, onClose]
  );

  const handleSave = useCallback(
    (e: React.MouseEvent): void => {
      if (onSave) {
        onSave(stateRef.current);
      }
      if (onClose) {
        onClose(e);
      }
    },
    [onClose, onSave]
  );

  const handleMouseEnter = useCallback((): void => {
    setMouseHover(true);
  }, []);

  const handleMouseLeave = useCallback((): void => {
    setMouseHover(false);
  }, []);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent): void => {
      if (scrollEl) {
        event.preventDefault();
        setMouseDragging(true);
        mouseDraggingRef.current = true;
        if (positionHorizontally) {
          startScrollX.current = scrollEl.scrollLeft;
          startClientX.current = event.clientX;
        } else {
          startScrollY.current = scrollEl.scrollTop;
          startClientY.current = event.clientY;
        }
      }
    },
    [positionHorizontally, scrollEl]
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent): void => {
      if (scrollEl && mouseDraggingRef.current) {
        if (positionHorizontally) {
          scrollEl.scrollLeft =
            startScrollX.current + startClientX.current - event.clientX;
        } else {
          scrollEl.scrollTop =
            startScrollY.current + startClientY.current - event.clientY;
        }
      }
    },
    [positionHorizontally, scrollEl]
  );

  const handleMouseUp = useCallback((_event: MouseEvent): void => {
    setMouseDragging(false);
    mouseDraggingRef.current = false;
    startScrollY.current = 0;
    startClientY.current = 0;
    startScrollX.current = 0;
    startClientX.current = 0;
  }, []);

  const CustomPaper = useCallback(
    (params): JSX.Element => (
      <StyledPaper
        {...params}
        style={{ ...params?.style, maxWidth, margin: "auto" }}
      />
    ),
    [maxWidth]
  );

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return (): void => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const TransitionProps = useMemo(
    () => ({ onEnter: handleEnter }),
    [handleEnter]
  );

  const contentStyle: React.CSSProperties = useMemo(
    () => ({ backgroundColor }),
    [backgroundColor]
  );

  const aspectRatioAreaStyle: React.CSSProperties = useMemo(
    () => ({ paddingTop: `${100 / previewAspectRatio}%` }),
    [previewAspectRatio]
  );

  const overflowAreaStyle: React.CSSProperties = useMemo(
    () => ({
      cursor: mouseDragging ? "grabbing" : mouseHover ? "grab" : undefined,
      height: "100%",
      overflowY: positionHorizontally ? "hidden" : "auto",
      overflowX: positionHorizontally ? "auto" : "hidden",
    }),
    [mouseDragging, mouseHover, positionHorizontally]
  );

  const forceOverflowStyle: React.CSSProperties = useMemo(
    () => ({
      height: "100%",
      width: "100%",
      marginTop: positionHorizontally
        ? undefined
        : `calc(${100 / aspectRatio}% - ${100 / previewAspectRatio}%)`,
    }),
    [aspectRatio, positionHorizontally, previewAspectRatio]
  );

  const imageAreaStyle: React.CSSProperties = useMemo(
    () => ({
      height: positionHorizontally ? "100%" : "fit-content",
      width: positionHorizontally ? "fit-content" : "100%",
    }),
    [positionHorizontally]
  );

  const imageStyle: React.CSSProperties = useMemo(
    () => ({
      height: positionHorizontally ? "100%" : undefined,
      width: positionHorizontally ? undefined : "100%",
    }),
    [positionHorizontally]
  );

  return (
    <StyledCropDialog
      open={open}
      TransitionComponent={Transition}
      PaperComponent={CustomPaper}
      TransitionProps={TransitionProps}
      onClose={handleClose}
    >
      <StyledContent style={contentStyle}>
        <StyledOverflowArea
          ref={handleRef}
          onScroll={handleScroll}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onMouseDown={handleMouseDown}
          style={overflowAreaStyle}
        >
          <StyledImageOverlay>
            <StyledAspectRatioArea style={aspectRatioAreaStyle}>
              <StyledAspectRatioContent>
                <StyledImageArea style={imageAreaStyle}>
                  <StyledImage src={src} style={imageStyle} />
                </StyledImageArea>
              </StyledAspectRatioContent>
            </StyledAspectRatioArea>
          </StyledImageOverlay>
          <StyledForceOverflow style={forceOverflowStyle} />
        </StyledOverflowArea>
      </StyledContent>
      <BoundsOverlay
        maxWidth={maxWidth}
        backgroundColor={backgroundColor}
        previewAspectRatio={previewAspectRatio}
      />
      <CropHeader
        maxWidth={maxWidth}
        hasUnsavedChanges={hasUnsavedChanges}
        positionHorizontally={positionHorizontally}
        onSave={handleSave}
        onClose={handleClose}
      />
      <CropFooter
        maxWidth={maxWidth}
        aspectRatio={aspectRatio}
        square={square}
        onSquare={handleSquare}
      />
    </StyledCropDialog>
  );
});

export default CropDialog;
