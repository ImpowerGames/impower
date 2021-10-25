import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Dialog, { DialogProps } from "@material-ui/core/Dialog";
import FilledInput from "@material-ui/core/FilledInput";
import FormHelperText, {
  FormHelperTextProps,
} from "@material-ui/core/FormHelperText";
import IconButton from "@material-ui/core/IconButton";
import Paper from "@material-ui/core/Paper";
import Slide from "@material-ui/core/Slide";
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
import { debounce } from "../../../impower-core";
import { FontIcon } from "../../../impower-icon";
import useIOS from "../../hooks/useIOS";
import useVisualViewport from "../../hooks/useVisualViewport";
import { setBodyBackgroundColor } from "../../utils/setBodyBackgroundColor";
import { setHTMLBackgroundColor } from "../../utils/setHTMLBackgroundColor";
import TextField, { TextFieldProps } from "./TextField";

const discardInfo = {
  title: "Discard unsaved changes?",
  agreeLabel: "Discard",
  disagreeLabel: "Keep Editing",
};

const StyledStringDialog = styled(Dialog)`
  will-change: transform;

  & .MuiDialog-container.MuiDialog-scrollPaper {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    will-change: transform;
  }

  & .MuiFormHelperText-root {
    display: flex;
    justify-content: flex-end;
    margin: 0;
    padding-top: 3px;
    padding-bottom: 3px;
    padding-left: 12px;
    padding-right: 12px;
  }

  * {
    touch-action: none;
    overscroll-behavior: contain;
  }

  * {
    scrollbar-width: none;
  }

  & *::-webkit-scrollbar {
    display: none;
  }
`;

const StyledInputArea = styled.div`
  position: relative;
`;

const StyledInputContent = styled.div`
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
    box-shadow: ${(props): string => props.theme.boxShadow.inset};
  }

  &
    .MuiInputBase-root.MuiInputBase-fullWidth.MuiInputBase-formControl.MuiInputBase-adornedEnd {
    padding-right: 6px;
  }

  & .MuiInputBase-multiline {
    position: static;
    min-height: 0;
    max-height: 100%;
    overflow: auto;
    touch-action: pan-y;
    overscroll-behavior: contain;
  }

  & .MuiInputBase-multiline * {
    touch-action: pan-y;
    overscroll-behavior: contain;
  }

  &.scrollable .MuiInputBase-multiline textarea {
    min-height: calc(100% - 37px);
  }
`;

const StyledPaper = styled(Paper)`
  &.MuiDialog-paper {
    overflow-y: hidden;
  }
`;

const StyledViewportArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledToolbar = styled.div`
  display: flex;
  min-width: 0;
  min-height: ${(props): string => props.theme.minHeight.navigationBar};
  align-items: center;
  display: flex;
  flex-wrap: nowrap;

  padding-left: ${(props): string => props.theme.spacing(1)};
  padding-right: ${(props): string => props.theme.spacing(1)};
  width: 100%;
  position: relative;
`;

const StyledLabelArea = styled.div`
  min-width: 0;
  flex: 1;
`;

const StyledLabelTypography = styled(Typography)`
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: none;
  padding-left: ${(props): string => props.theme.spacing(1)};
  font-size: ${(props): string => props.theme.fontSize.large};
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
`;

const StyledEndAdornmentArea = styled.div`
  margin: ${(props): string => props.theme.spacing(-1, 0)};
`;

const StyledIconButton = styled(IconButton)``;

const StyledSubmitButtonArea = styled.div`
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: flex-end;
  padding: ${(props): string => props.theme.spacing(1)};
`;

const StyledSubmitButton = styled(Button)`
  border-radius: ${(props): string => props.theme.spacing(10)};
  font-weight: bold;
`;

const StyledTextField = styled(TextField)`
  & .MuiInputBase-root {
    border-radius: 0;
    flex: 1;
    padding-top: 19px;
    padding-bottom: 19px;
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
`;

const StyledForm = styled.form`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
`;

const StyledFormHelperText = styled(FormHelperText)<{ component?: string }>`
  display: flex;
  justify-content: flex-end;
  margin: 0;
  padding-top: 3px;
  padding-bottom: 3px;
  padding-left: 12px;
  padding-right: 12px;

  &.Mui-error {
    color: ${(props): string => props.theme.palette.error.main};
  }
  
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

const Transition = React.forwardRef(
  (
    props: TransitionProps & { children?: React.ReactElement },
    ref: React.Ref<unknown>
  ) => <Slide direction="left" ref={ref} {...props} />
);

export interface StringDialogProps
  extends Omit<
      DialogProps,
      | "open"
      | "autoSave"
      | "onChange"
      | "maxWidth"
      | "classes"
      | "color"
      | "onFocus"
      | "defaultValue"
    >,
    Omit<TextFieldProps, "autoSave" | "InputComponent"> {
  id?: string;
  open?: boolean;
  defaultValue?: unknown;
  value?: unknown;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  FormHelperTextProps?: Partial<FormHelperTextProps<"p">>;
  debounceInterval?: number;
  style?: React.CSSProperties;
  DialogTextFieldProps?: Partial<TextFieldProps>;
  DialogTextFieldComponent?: React.ComponentType<TextFieldProps>;
  renderHelperText?: (props: {
    errorText?: string;
    helperText?: React.ReactNode;
    counterText?: string;
  }) => React.ReactNode;
  errorText?: string;
  helperText?: React.ReactNode;
  countText?: string;
  characterCountLimit?: number;
  showCharacterCounter?: boolean;
  autoSave?: boolean;
  autoSaveEvent?: React.ChangeEvent;
  saveLabel?: React.ReactNode;
  getTransformedValue?: (newValue: React.ReactText) => string;
  getInputError?: (value: unknown) => Promise<string | null>;
  onClick?: (e: React.MouseEvent) => void;
  onChange?: (e: React.ChangeEvent) => void;
  onClose?: (
    e:
      | React.MouseEvent
      | React.ChangeEvent
      | React.KeyboardEvent
      | React.FormEvent
  ) => void;
  onBlur?: (e: React.FocusEvent) => void;
}

const StringDialog = React.memo((props: StringDialogProps): JSX.Element => {
  const {
    id,
    open,
    label,
    defaultValue,
    value,
    placeholder,
    required,
    multiline,
    autoSave,
    autoSaveEvent,
    inputProps,
    InputLabelProps,
    InputProps,
    FormHelperTextProps,
    debounceInterval,
    style,
    DialogTextFieldComponent = StyledTextField,
    DialogTextFieldProps,
    errorText,
    helperText,
    countText,
    characterCountLimit,
    showCharacterCounter,
    saveLabel,
    renderHelperText,
    getTransformedValue,
    getInputError,
    onClick,
    onChange,
    onClose,
    onBlur,
    TransitionProps = {},
  } = props;
  const { onEnter, onEntering, onEntered, onExit, onExiting, onExited } =
    TransitionProps;

  const [state, setState] = useState(value);
  const [inputError, setInputError] = useState<string>(errorText);
  const [limitAnimation, setLimitAnimation] = useState(false);
  const [viewportArea, setViewportArea] = useState<HTMLDivElement>();

  const stateRef = useRef(value);
  const closingRef = useRef(false);
  const getInputErrorRef = useRef(getInputError);
  const inputRef = useRef<HTMLInputElement>();
  const bodyColor = useRef<string>();

  const variant = "filled";
  const InputComponent = FilledInput;
  const size = "medium";

  const visualViewportSupported = useVisualViewport(viewportArea);
  const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
  const theme = useTheme();
  const ios = useIOS();
  const [initialValue, setInitialValue] = useState(defaultValue);

  const hasUnsavedChanges = state !== initialValue;

  const keyboardSpacerStyle = useMemo(
    () => ({
      height: multiline && ios && !visualViewportSupported ? "50vh" : 0,
    }),
    [ios, multiline, visualViewportSupported]
  );

  const hasError = Boolean(errorText) || Boolean(inputError);

  useEffect(() => {
    stateRef.current = value;
    setState(value);
  }, [value]);

  useEffect(() => {
    getInputErrorRef.current = getInputError;
  }, [getInputError]);

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

  const handleEndAdornmentClick = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleOutsideClick = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (!closingRef.current) {
      window.requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      });
    }
  }, []);

  const handleSubmit = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent | React.FormEvent): void => {
      const changeEvent = e as unknown as React.ChangeEvent<HTMLInputElement>;
      changeEvent.target.value = state?.toString() || "";
      const saveEvent = autoSave ? changeEvent || autoSaveEvent : changeEvent;
      closingRef.current = true;
      if (inputRef.current) {
        inputRef.current.blur();
      }
      // Wait for keyboard to collapse
      requestTimeout(() => {
        if (onChange && saveEvent && hasUnsavedChanges) {
          onChange(saveEvent);
        }
        requestTimeout(() => {
          if (onClose) {
            onClose(e);
          }
        }, 200);
      }, 200);
    },
    [autoSave, autoSaveEvent, hasUnsavedChanges, onChange, onClose, state]
  );

  const handleBack = useCallback(
    (e: React.MouseEvent | React.ChangeEvent): void => {
      closingRef.current = true;
      e.preventDefault();
      e.stopPropagation();
      if (autoSave) {
        handleSubmit(e);
        return;
      }
      const onDiscardChanges = (): void => {
        if (inputRef.current) {
          inputRef.current.blur();
        }
        const changeEvent = e as unknown as React.ChangeEvent<HTMLInputElement>;
        changeEvent.target.value = state?.toString() || "";
        if (ios) {
          if (onClose) {
            onClose(changeEvent);
          }
        } else {
          // Wait for keyboard to collapse
          requestTimeout(() => {
            if (onClose) {
              onClose(changeEvent);
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
    [
      autoSave,
      confirmDialogDispatch,
      handleSubmit,
      hasUnsavedChanges,
      ios,
      onClose,
      state,
    ]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (
        e.key !== "Backspace" &&
        typeof stateRef.current === "string" &&
        stateRef.current.length >= characterCountLimit
      ) {
        setLimitAnimation(true);
        setTimeout(() => {
          setLimitAnimation(false);
        }, 1000);
      } else {
        setLimitAnimation(false);
      }
      if (!multiline) {
        if (e.key === "Enter") {
          handleSubmit(e);
        }
      }
    },
    [characterCountLimit, handleSubmit, multiline]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent): void => {
      if (!closingRef.current) {
        if (!e.relatedTarget) {
          handleSubmit(e);
        }
      }
      if (onBlur) {
        onBlur(e);
      }
    },
    [handleSubmit, onBlur]
  );

  const handleValidateChange = useCallback(async (): Promise<void> => {
    const newValue = stateRef.current;
    if (getInputErrorRef.current) {
      const inputError = await getInputErrorRef.current(newValue);
      setInputError(inputError);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const onDelayedChange = useCallback(
    debounce(handleValidateChange, debounceInterval),
    [handleValidateChange]
  );

  const handleDelayedChange = useCallback((): void => {
    onDelayedChange();
  }, [onDelayedChange]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      const transformedValue = getTransformedValue
        ? getTransformedValue(newValue)
        : newValue;
      stateRef.current = transformedValue;
      setState(transformedValue);
      handleDelayedChange();
    },
    [getTransformedValue, handleDelayedChange]
  );

  const CustomInputProps = useMemo(
    () => ({
      ...InputProps,
      endAdornment: InputProps?.endAdornment ? (
        <StyledEndAdornmentArea onClick={handleEndAdornmentClick}>
          {InputProps?.endAdornment}
        </StyledEndAdornmentArea>
      ) : undefined,
      style: {
        ...InputProps.style,
        backgroundColor: "transparent",
      },
    }),
    [InputProps, handleEndAdornmentClick]
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
        window.scrollTo({ top: 0 });
      });
    }, 500);
  }, []);

  const handleEnter = useCallback(
    (node: HTMLElement, isAppearing: boolean): void => {
      closingRef.current = false;
      setInitialValue(defaultValue);
      setState(value);
      setInputError(errorText);
      if (onEnter) {
        onEnter(node, isAppearing);
      }
    },
    [defaultValue, errorText, onEnter, value]
  );

  const handleEntering = useCallback(
    (node: HTMLElement, isAppearing: boolean): void => {
      if (onEntering) {
        onEntering(node, isAppearing);
      }
    },
    [onEntering]
  );

  const handleEntered = useCallback(
    (node: HTMLElement, isAppearing: boolean): void => {
      bodyColor.current = document.body.style.backgroundColor;
      setBodyBackgroundColor(document, "white");
      setHTMLBackgroundColor(document, "white");
      if (onEntered) {
        onEntered(node, isAppearing);
      }
    },
    [onEntered]
  );

  const handleExit = useCallback(
    (node: HTMLElement): void => {
      closingRef.current = true;
      setBodyBackgroundColor(document, bodyColor.current);
      setHTMLBackgroundColor(document, bodyColor.current);
      if (onExit) {
        onExit(node);
      }
    },
    [onExit]
  );

  const handleExiting = useCallback(
    (node: HTMLElement): void => {
      if (onExiting) {
        onExiting(node);
      }
    },
    [onExiting]
  );

  const handleExited = useCallback(
    (node: HTMLElement): void => {
      if (onExited) {
        onExited(node);
      }
    },
    [onExited]
  );

  const CustomDialogPaper = useCallback(
    (params): JSX.Element => <StyledPaper {...params} elevation={0} />,
    []
  );

  const counterText =
    countText ||
    (showCharacterCounter
      ? `${String(state).length}/${characterCountLimit}`
      : undefined);

  const dialogHelperText = useMemo(
    () =>
      renderHelperText
        ? renderHelperText({
            errorText: errorText || inputError,
            helperText,
            counterText,
          })
        : undefined,
    [counterText, errorText, helperText, inputError, renderHelperText]
  );

  const fullHeight = multiline && (!ios || visualViewportSupported);

  // If no label, use placeholder as label and don't display placeholder again in placeholder area
  const validLabel = label || placeholder;
  const validPlaceholder = label ? placeholder : undefined;

  return (
    <StyledStringDialog
      open={open}
      style={style}
      fullScreen
      disableAutoFocus
      disableRestoreFocus
      PaperComponent={CustomDialogPaper}
      TransitionComponent={Transition}
      onClick={handleOutsideClick}
      TransitionProps={{
        onEnter: handleEnter,
        onEntering: handleEntering,
        onEntered: handleEntered,
        onExit: handleExit,
        onExiting: handleExiting,
        onExited: handleExited,
      }}
    >
      <StyledViewportArea ref={handleViewportAreaRef}>
        <StyledToolbar>
          <StyledIconButton onClick={handleBack}>
            <FontIcon
              aria-label={`Back`}
              color={theme.palette.secondary.main}
              size={24}
            >
              <ArrowLeftRegularIcon />
            </FontIcon>
          </StyledIconButton>
          <StyledLabelArea>
            {validLabel && (
              <StyledLabelTypography>
                {validLabel}
                {`${required ? " *" : ""}`}
              </StyledLabelTypography>
            )}
          </StyledLabelArea>
          <StyledSubmitButtonArea
            style={{
              pointerEvents: autoSave ? "none" : undefined,
              opacity: autoSave ? 0 : undefined,
              position: autoSave ? "absolute" : undefined,
            }}
          >
            <StyledSubmitButton
              disabled={!hasUnsavedChanges || hasError}
              variant="contained"
              color="secondary"
              onClick={handleSubmit}
            >
              {saveLabel || `Save`}
            </StyledSubmitButton>
          </StyledSubmitButtonArea>
        </StyledToolbar>
        <StyledForm method="post" noValidate onSubmit={handleSubmit}>
          <StyledInputArea
            style={{
              flex: fullHeight ? 1 : 0,
              maxHeight: ios && !visualViewportSupported ? "50vh" : undefined,
            }}
          >
            <StyledInputContent
              className={ios ? "scrollable" : undefined}
              style={{ position: fullHeight ? "absolute" : undefined }}
            >
              <DialogTextFieldComponent
                id={id}
                inputRef={handleInputRef}
                className={variant}
                variant={variant}
                InputComponent={InputComponent}
                value={state}
                size={size}
                placeholder={validPlaceholder}
                multiline={multiline}
                error={hasError}
                inputProps={inputProps}
                InputLabelProps={InputLabelProps}
                InputProps={CustomInputProps}
                FormHelperTextProps={FormHelperTextProps}
                fullWidth
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                onClick={onClick}
                {...DialogTextFieldProps}
                helperText={undefined}
                minRows={undefined}
                maxRows={undefined}
              />
            </StyledInputContent>
          </StyledInputArea>
          {dialogHelperText && (
            <StyledFormHelperText
              component="div"
              className={
                inputError ? "error" : limitAnimation ? "limit" : undefined
              }
            >
              {dialogHelperText}
            </StyledFormHelperText>
          )}
          <div style={keyboardSpacerStyle} />
        </StyledForm>
      </StyledViewportArea>
    </StyledStringDialog>
  );
});

export default StringDialog;
