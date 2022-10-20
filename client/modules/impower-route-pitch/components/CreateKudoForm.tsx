import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import FilledInput from "@mui/material/FilledInput";
import FormHelperText from "@mui/material/FormHelperText";
import IconButton from "@mui/material/IconButton";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import XmarkSolidIcon from "../../../resources/icons/solid/xmark.svg";
import {
  ConfirmDialogContext,
  confirmDialogNavOpen,
} from "../../impower-confirm-dialog";
import { useDialogNavigation } from "../../impower-dialog";
import { FontIcon } from "../../impower-icon";
import { DynamicLoadingButton, TextField } from "../../impower-route";
import useIOS from "../../impower-route/hooks/useIOS";
import useVisualViewport from "../../impower-route/hooks/useVisualViewport";
import { UserContext } from "../../impower-user";

const discardInfo = {
  title: "Discard unsaved changes?",
  agreeLabel: "Discard",
  disagreeLabel: "Keep Editing",
};

const StyledContainer = styled.div`
  width: 100%;
  margin: auto;
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledHeader = styled.div`
  min-height: ${(props): string => props.theme.spacing(7)};
  z-index: 1;
`;

const StyledHeaderContent = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  min-height: ${(props): string => props.theme.spacing(7)};
`;

const StyledHeaderContainer = styled.div`
  width: 100%;
  margin: auto;
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  display: flex;
  align-items: center;
  position: relative;
  padding: ${(props): string => props.theme.spacing(0, 1)};
  background-color: white;
  box-shadow: ${(props): string => props.theme.shadows[2]};
`;

const StyledHeaderTextArea = styled.div`
  flex: 1;
  padding: ${(props): string => props.theme.spacing(0, 2)};
`;

const StyledIconButton = styled(IconButton)`
  padding: ${(props): string => props.theme.spacing(2)};
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

const StyledSubmitButton = styled(DynamicLoadingButton)`
  border-radius: ${(props): string => props.theme.spacing(10)};
`;

const StyledTextInputArea = styled.div`
  position: relative;
  min-height: ${(props): string => props.theme.spacing(7)};
`;

const StyledTextInputContent = styled.div`
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow: hidden;

  & .MuiFormControl-root {
    position: inherit;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    overflow: hidden;
    display: block;
  }

  & .MuiInputBase-multiline {
    position: static;
    min-height: 100%;
    max-height: 100%;
    overflow: auto;
    display: block;
    touch-action: pan-y;
    overscroll-behavior: contain;
  }

  & .MuiInputBase-multiline * {
    touch-action: pan-y;
    overscroll-behavior: contain;
  }
`;

const StyledViewportArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledTextField = styled(TextField)`
  & .MuiInputBase-root {
    border-radius: 0;
    flex: 1;
    padding-top: 19px;
    padding-bottom: 19px;
    padding-left: 24px;
    padding-right: 24px;
  }

  & .MuiInputBase-root input {
    padding-top: 0;
    padding-bottom: 0;
    height: 100%;
  }

  & .MuiInputBase-root textarea {
    padding-top: 0;
    padding-bottom: 0;
    height: 100%;
  }

  & .MuiFormHelperText-root.Mui-error {
    color: ${(props): string => props.theme.palette.error.light};
  }
`;

const StyledFormArea = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
`;

const StyledRelativeArea = styled.div`
  position: relative;
`;

const StyledForceOverflowSpacer = styled.div`
  pointer-events: none;

  position: absolute;
  top: 0;
  left: 0;
  right: 0;
`;

const StyledFormHelperText = styled(FormHelperText)<{ component?: string }>`
  display: flex;
  justify-content: flex-end;
  margin: 0;
  padding: ${(props): string => props.theme.spacing(1, 1)};
  border-top: 1px solid ${(props): string =>
    props.theme.palette.secondary.main};
  
  &.error .LeftHelperTextTypography {
    animation: shake 0.4s 1 linear;
    backface-visibility: hidden;
    perspective: 1000px;
  }

  &.limit .RightHelperTextTypography {
    animation: shake 0.4s 1 linear;
    backface-visibility: hidden;
    perspective: 1000px;
  }

  @keyframes shake {
    0% {
      color: ${(props): string => props.theme.palette.error.main};
      transform: translate(8px);
    }
    20% {
      transform: translate(-8px);
    }
    40% {
      transform: translate(8px);
    }
    60% {
      transform: translate(-8px);
    }
    80% {
      transform: translate(8px);
    }
    90% {
      color: ${(props): string => props.theme.palette.error.main};
      transform: translate(-4px);
    }
    100% {
      color: inherit;
      transform: translate(0px);
    }
`;

const LeftHelperTextTypography = styled.p`
  margin: 0;
  text-align: left;
  flex: 1;
  padding-right: ${(props): string => props.theme.spacing(2)};
`;

const RightHelperTextTypography = styled.p`
  margin: 0;
  text-align: right;
`;

const requestTimeout = (call: () => unknown, delay: number): number => {
  const start = new Date().getTime();
  const loop = (): void => {
    const current = new Date().getTime();
    if (current - start >= delay) {
      call();
    } else {
      window.requestAnimationFrame(loop);
    }
  };
  return window.requestAnimationFrame(loop);
};

interface CreateKudoFormProps {
  defaultValue?: string;
  value?: string;
  placeholder?: string;
  saveLabel?: React.ReactNode;
  maxWidth?: number | string;
  onClose?: (e: React.MouseEvent | React.FocusEvent) => void;
  onChange?: (e: React.ChangeEvent) => void;
}

const CreateKudoForm = React.memo((props: CreateKudoFormProps): JSX.Element => {
  const {
    defaultValue,
    value,
    placeholder,
    saveLabel,
    maxWidth,
    onClose,
    onChange,
  } = props;

  const theme = useTheme();

  const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
  const [userState] = useContext(UserContext);
  const { uid } = userState;

  const authenticated = uid !== undefined ? Boolean(uid) : undefined;

  const [contentState, setContentState] = useState(value || defaultValue || "");
  const [viewportArea, setViewportArea] = useState<HTMLDivElement>();
  const [submitting, setSubmitting] = useState(false);
  const [limitAnimation, setLimitAnimation] = useState(false);

  const stateRef = useRef("");
  const closingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>();

  const variant = "filled";
  const InputComponent = FilledInput;
  const size = "medium";

  const visualViewportSupported = useVisualViewport(viewportArea);
  const ios = useIOS();

  const hasUnsavedChanges = contentState && contentState !== defaultValue;

  const fullHeight = !ios || visualViewportSupported;

  const inputTopPadding = 19;
  const headerHeight = 56;
  const footerHeight = 64;

  const keyboardSpacerStyle = useMemo(
    () => ({
      height: ios && !visualViewportSupported ? "50vh" : 0,
    }),
    [ios, visualViewportSupported]
  );

  const characterCountLimit = 300;

  const counterText = `${String(contentState).length} / ${characterCountLimit}`;

  useEffect(() => {
    setContentState(value || "");
  }, [value]);

  // If changes are not saved show an "Unsaved Changes" warning popup when navigating away from website
  useEffect(() => {
    const onBeforeUnload = (event): void => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = true;
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return (): void => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  const handleOutsideClick = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    window.requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    });
  }, []);

  const [openAccountDialog] = useDialogNavigation("a");

  const handleSubmit = useCallback(
    async (e: React.MouseEvent | React.FocusEvent): Promise<void> => {
      if (!authenticated) {
        openAccountDialog("signup");
        return;
      }
      setSubmitting(true);
      closingRef.current = true;
      if (inputRef.current) {
        inputRef.current.blur();
      }
      if (onChange) {
        const changeEvent = e as unknown as React.ChangeEvent<HTMLInputElement>;
        changeEvent.target.value = contentState?.toString() || "";
        onChange(changeEvent);
      }
      if (onClose) {
        onClose(e);
      }
      setSubmitting(false);
    },
    [authenticated, contentState, onChange, onClose, openAccountDialog]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent): void => {
      closingRef.current = true;
      e.preventDefault();
      e.stopPropagation();
      const onDiscardChanges = (): void => {
        if (inputRef.current) {
          inputRef.current.blur();
        }
        if (ios) {
          if (onClose) {
            onClose(e);
          }
        } else {
          // Wait for keyboard to collapse
          requestTimeout(() => {
            if (onClose) {
              onClose(e);
            }
          }, 300);
        }
      };
      const onContinueEditing = (): void => {
        closingRef.current = false;
      };
      if (hasUnsavedChanges) {
        confirmDialogDispatch(
          confirmDialogNavOpen(
            discardInfo.title,
            undefined,
            discardInfo.agreeLabel,
            onDiscardChanges,
            discardInfo.disagreeLabel,
            onContinueEditing,
            { disableAutoFocus: !ios, disableEnforceFocus: !ios }
          )
        );
      } else {
        onDiscardChanges();
      }
    },
    [confirmDialogDispatch, hasUnsavedChanges, ios, onClose]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent): void => {
      if (!closingRef.current) {
        if (!e.relatedTarget) {
          handleSubmit(e);
        }
      }
    },
    [handleSubmit]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      stateRef.current = newValue;
      setContentState(newValue);
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (
        e.key !== "Backspace" &&
        stateRef.current.length >= characterCountLimit
      ) {
        setLimitAnimation(true);
        setTimeout(() => {
          setLimitAnimation(false);
        }, 1000);
      } else {
        setLimitAnimation(false);
      }
    },
    [characterCountLimit]
  );

  const handleViewportAreaRef = useCallback(
    (instance: HTMLDivElement): void => {
      if (instance) {
        setViewportArea(instance);
      }
    },
    []
  );

  const handleInputRef = useCallback((instance: HTMLInputElement): void => {
    inputRef.current = instance;
    window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      });
    }, 500);
  }, []);

  const renderHelperText = useCallback(
    (props: {
      errorText?: string;
      helperText?: React.ReactNode;
      counterText: string;
    }): React.ReactNode => {
      const { errorText, helperText, counterText } = props;
      const leftHelperText = errorText || helperText;
      const rightHelperText = counterText;
      return leftHelperText || rightHelperText ? (
        <>
          {leftHelperText && (
            <LeftHelperTextTypography
              className={LeftHelperTextTypography.displayName}
            >
              {leftHelperText}
            </LeftHelperTextTypography>
          )}
          {rightHelperText && (
            <RightHelperTextTypography
              className={RightHelperTextTypography.displayName}
            >
              {rightHelperText}
            </RightHelperTextTypography>
          )}
        </>
      ) : undefined;
    },
    []
  );

  const dialogHelperText = useMemo(
    () =>
      renderHelperText
        ? renderHelperText({
            counterText,
          })
        : undefined,
    [counterText, renderHelperText]
  );

  const forceOverflowStyle = useMemo(
    () => ({
      minHeight: `calc(100vh - ${inputTopPadding}px - ${headerHeight}px - ${footerHeight}px + 1px)`,
    }),
    []
  );

  const InputProps = useMemo(
    () => ({
      style: {
        backgroundColor: "white",
      },
      startAdornment: (
        <>
          <StyledRelativeArea>
            {/* On IOS, forcing overflow blocks scrolling from propagating behind the opened dialog */}
            {ios && <StyledForceOverflowSpacer style={forceOverflowStyle} />}
          </StyledRelativeArea>
        </>
      ),
    }),
    [forceOverflowStyle, ios]
  );

  const inputProps = useMemo(
    () => ({ maxLength: characterCountLimit }),
    [characterCountLimit]
  );

  const maxWidthStyle: React.CSSProperties = useMemo(
    () => ({ maxWidth }),
    [maxWidth]
  );
  const textTnputAreaStyle: React.CSSProperties = useMemo(
    () => ({
      flex: fullHeight ? 1 : 0,
      maxHeight: ios && !visualViewportSupported ? "50vh" : undefined,
    }),
    [fullHeight, ios, visualViewportSupported]
  );
  const textInputContentStyle: React.CSSProperties = useMemo(
    () => ({ position: fullHeight ? "absolute" : undefined }),
    [fullHeight]
  );

  return (
    <StyledViewportArea ref={handleViewportAreaRef}>
      <StyledContainer style={maxWidthStyle}>
        <StyledHeader>
          <StyledHeaderContent>
            <StyledHeaderContainer style={maxWidthStyle}>
              <StyledIconButton onClick={handleClose}>
                <FontIcon
                  aria-label={`Close`}
                  color={theme.palette.secondary.main}
                  size={24}
                >
                  <XmarkSolidIcon />
                </FontIcon>
              </StyledIconButton>
              <StyledHeaderTextArea />
              <StyledSubmitButtonArea>
                <StyledSubmitButton
                  loading={submitting}
                  color="primary"
                  variant="contained"
                  disableElevation
                  onClick={handleSubmit}
                >
                  {saveLabel}
                </StyledSubmitButton>
              </StyledSubmitButtonArea>
            </StyledHeaderContainer>
          </StyledHeaderContent>
        </StyledHeader>
        <StyledFormArea>
          <StyledTextInputArea
            onClick={handleOutsideClick}
            style={textTnputAreaStyle}
          >
            <StyledTextInputContent style={textInputContentStyle}>
              <StyledTextField
                inputRef={handleInputRef}
                className={variant}
                variant={variant}
                InputComponent={InputComponent}
                value={contentState}
                size={size}
                color="secondary"
                placeholder={placeholder}
                multiline
                fullWidth
                InputProps={InputProps}
                inputProps={inputProps}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
              />
            </StyledTextInputContent>
          </StyledTextInputArea>
          <StyledFormHelperText
            component="div"
            className={limitAnimation ? "limit" : undefined}
          >
            {dialogHelperText}
          </StyledFormHelperText>
          <div style={keyboardSpacerStyle} />
        </StyledFormArea>
      </StyledContainer>
    </StyledViewportArea>
  );
});

export default CreateKudoForm;
