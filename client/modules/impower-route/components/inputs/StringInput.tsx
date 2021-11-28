import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { InputBaseProps, useMediaQuery } from "@material-ui/core";
import dynamic from "next/dynamic";
import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { debounce } from "../../../impower-core";
import { useDialogNavigation } from "../../../impower-dialog";
import HelpButton from "../elements/HelpButton";
import InputHelperText from "./InputHelperText";
import { StringDialogProps } from "./StringDialog";
import TextField, { TextFieldProps } from "./TextField";

const StringDialog = dynamic(() => import("./StringDialog"), { ssr: false });

const MarkdownHelp = dynamic(() => import("../elements/MarkdownHelp"), {
  ssr: false,
});

const InfoHelp = dynamic(() => import("../elements/InfoHelp"), { ssr: false });

const CircularProgress = dynamic(
  () => import("@material-ui/core/CircularProgress"),
  { ssr: false }
);

const StyledKeyboardTrigger = styled.input`
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  opacity: 0;
  pointer-events: none;
`;

const StyledStringInput = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;

  & .MuiFormLabel-root {
    white-space: nowrap;
  }

  &.inset .MuiFormHelperText-root.Mui-error {
    color: ${(props): string => props.theme.palette.error.light};
  }

  &.inset .MuiFormHelperText-root {
    color: inherit;
  }

  & .MuiFormHelperText-root {
    display: flex;
    justify-content: flex-end;
  }
`;

const StyledTextField = styled(TextField)<{ focusable?: string }>`
  ${(props): string =>
    props.focusable
      ? ""
      : `& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline {
  border-color: rgba(0, 0, 0, 0.23);
  border-width: 1px;
}`}

  &.inset .MuiFilledInput-root {
    border-radius: ${(props): string => props.theme.borderRadius.field};
    min-width: ${(props): string => props.theme.spacing(8)};
    box-shadow: ${(props): string => props.theme.boxShadow.inset};
    align-items: stretch;
  }

  &.inset .MuiFilledInput-adornedEnd {
    padding-right: 0;
  }

  &.inset .MuiFilledInput-underline:before {
    border-radius: inherit;
  }

  &.inset .MuiFilledInput-underline:after {
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: inherit;
    border-bottom: 3px solid
      ${(props): string => props.theme.palette.secondary.light};
  }

  &.inset .MuiFilledInput-root .MuiFormHelperText-root {
    margin-left: 0;
  }

  &
    .MuiInputBase-root.MuiInputBase-fullWidth.MuiInputBase-formControl.MuiInputBase-adornedEnd {
    padding-right: 6px;
    display: flex;
    align-items: center;
  }
`;

const StyledEndAdornmentArea = styled.div`
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
  border-radius: inherit;

  .inset & {
    background-color: white;
  }

  & .MuiAutocomplete-endAdornment {
    position: relative;
    display: flex;
  }
`;

const StyledOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
`;

const StyledCircularProgressArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 40px;
`;

const StyledDialogButton = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
`;

const renderHelperText = (props: {
  errorText: string;
  helperText: React.ReactNode;
  counterText: string;
}): React.ReactNode => {
  const { errorText, helperText, counterText } = props;
  if (!errorText && !helperText && !counterText) {
    return undefined;
  }
  return (
    <InputHelperText
      errorText={errorText}
      helperText={helperText}
      counterText={counterText}
    />
  );
};

interface StringEndAdornmentProps {
  dialog?: boolean;
  id: string;
  showFullscreen: boolean;
  markdown: boolean;
  loading: boolean;
  moreInfoPopup?: {
    icon?: string;
    title?: string;
    description?: string;
    caption?: string;
    alignment?: "flex-start" | "center" | "flex-end";
  };
  onClick: (e: React.MouseEvent) => void;
}

const StringEndAdornment = (
  props: PropsWithChildren<StringEndAdornmentProps>
): JSX.Element => {
  const { showFullscreen, loading, children, onClick } = props;
  return (
    <StyledEndAdornmentArea
      onClick={onClick}
      style={{ pointerEvents: showFullscreen ? "none" : undefined }}
    >
      {children}
      {loading && (
        <StyledCircularProgressArea>
          <CircularProgress size={24} color="primary" />
        </StyledCircularProgressArea>
      )}
    </StyledEndAdornmentArea>
  );
};

export interface StringInputProps extends TextFieldProps {
  inset?: boolean;
  backgroundColor?: string;
  tooltip?: string;
  errorText?: string;
  showError?: boolean;
  markdown?: boolean;
  mixed?: boolean;
  moreInfoPopup?: {
    icon?: string;
    title?: string;
    description?: string;
    caption?: string;
    alignment?: "flex-start" | "center" | "flex-end";
  };
  loading?: boolean;
  disabledOpacity?: number;
  characterCountLimit?: number;
  showCharacterCounter?: boolean;
  countText?: string;
  textTransform?: "uppercase" | "lowercase";
  debounceInterval?: number;
  overlay?: React.ReactNode;
  disableResponsive?: boolean;
  disableAutoKeyboard?: boolean;
  open?: boolean;
  style?: React.CSSProperties;
  DialogProps?: Partial<StringDialogProps>;
  DialogInputProps?: Partial<InputBaseProps>;
  DialogTextFieldProps?: Partial<TextFieldProps>;
  DialogComponent?: React.ComponentType<StringDialogProps>;
  DialogTextFieldComponent?: React.ComponentType<TextFieldProps>;
  onOpenDialog?: () => void;
  onCloseDialog?: () => void;
  getInputError?: (value: unknown) => Promise<string | null>;
  onInputChange?: (e: React.ChangeEvent, value?: unknown) => void;
  onChange?: (e: React.ChangeEvent, value?: unknown) => void;
  onDebouncedChange?: (value: unknown) => void;
  onBlur?: (e: React.FocusEvent, value?: unknown) => void;
  onSubmit?: (e: React.FormEvent, value?: unknown) => void;
  onClick?: (e: React.MouseEvent, value?: unknown) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onPointerEnter?: (e: React.PointerEvent) => void;
  onErrorFound?: (error: string) => void;
  onErrorFixed?: () => void;
}

const StringInput = React.memo(
  (props: StringInputProps): JSX.Element | null => {
    const {
      id = "",
      variant,
      inset,
      InputComponent,
      size,
      backgroundColor,
      color,
      label,
      placeholder,
      type,
      error,
      errorText,
      showError,
      disabled,
      autoFocus,
      required,
      markdown,
      moreInfoPopup,
      defaultValue,
      multiline,
      minRows,
      maxRows,
      value = "",
      mixed,
      inputRef,
      InputLabelProps,
      InputProps,
      FormHelperTextProps,
      inputProps,
      disabledOpacity = 0.8,
      characterCountLimit,
      showCharacterCounter,
      helperText,
      countText,
      textTransform,
      debounceInterval,
      overlay,
      loading,
      disableResponsive,
      disableAutoKeyboard,
      style,
      DialogProps,
      DialogInputProps,
      DialogTextFieldProps,
      open,
      DialogComponent = StringDialog,
      DialogTextFieldComponent,
      onOpenDialog,
      onCloseDialog,
      getInputError,
      onInputChange,
      onChange,
      onDebouncedChange,
      onBlur,
      onSubmit,
      onKeyDown,
      onClick,
      onFocus,
      onErrorFound,
      onErrorFixed,
    } = props;

    const queryKey = `input-${id}`;
    const [dialogOpenState, setDialogOpenState] = useState<boolean>(open);
    const keyboardTriggerRef = useRef<HTMLInputElement>();

    const handleGetTransformedValue = useCallback(
      (newValue: React.ReactText): string => {
        if (typeof newValue === "string") {
          return textTransform === "uppercase"
            ? newValue.toUpperCase()
            : textTransform === "lowercase"
            ? newValue.toLowerCase()
            : newValue;
        }
        return String(newValue);
      },
      [textTransform]
    );

    const stateRef = useRef<string>(
      handleGetTransformedValue(
        String(defaultValue !== undefined ? defaultValue : value)
      )
    );
    const [state, setState] = useState(stateRef.current);
    const getInputErrorRef = useRef(getInputError);
    const onErrorFoundRef = useRef(onErrorFound);
    const onErrorFixedRef = useRef(onErrorFixed);
    const onDebouncedChangeRef = useRef(onDebouncedChange);
    const [inputError, setInputError] = useState<string>(errorText);

    const theme = useTheme();

    const mixedLabel = "(mixed)";

    useEffect(() => {
      onErrorFoundRef.current = onErrorFound;
    }, [onErrorFound]);

    useEffect(() => {
      onErrorFixedRef.current = onErrorFixed;
    }, [onErrorFixed]);

    useEffect(() => {
      getInputErrorRef.current = getInputError;
    }, [getInputError]);

    useEffect(() => {
      onDebouncedChangeRef.current = onDebouncedChange;
    }, [onDebouncedChange]);

    useEffect(() => {
      setInputError(errorText);
    }, [errorText]);

    useEffect(() => {
      if (defaultValue !== undefined) {
        setState(handleGetTransformedValue(String(defaultValue)));
        if (onErrorFixedRef.current) {
          onErrorFixedRef.current();
        }
        setInputError(null);
      }
    }, [defaultValue, handleGetTransformedValue]);

    const handleValidateChange = useCallback(async (): Promise<void> => {
      if (!getInputErrorRef.current) {
        if (onDebouncedChangeRef.current) {
          onDebouncedChangeRef.current(stateRef.current);
        }
        return;
      }
      const inputError = await getInputErrorRef.current(stateRef.current);
      setInputError(inputError);
      if (inputError) {
        if (onErrorFoundRef.current) {
          onErrorFoundRef.current(inputError);
        }
      } else if (onErrorFixedRef.current) {
        onErrorFixedRef.current();
      }
      if (!inputError) {
        if (onDebouncedChangeRef.current) {
          onDebouncedChangeRef.current(stateRef.current);
        }
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

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
        const newValue = e.target.value;
        const transformedValue = handleGetTransformedValue(newValue);
        stateRef.current = transformedValue;
        setState(transformedValue);
        if (onInputChange) {
          onInputChange(e, transformedValue);
        }
        if (onChange) {
          onChange(e, transformedValue);
        }
        handleDelayedChange();
      },
      [handleGetTransformedValue, onInputChange, onChange, handleDelayedChange]
    );

    const handleDialogInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        const transformedValue = handleGetTransformedValue(newValue);
        if (onInputChange) {
          onInputChange(e, transformedValue);
        }
      },
      [handleGetTransformedValue, onInputChange]
    );

    const handleDialogChange = useCallback(
      async (e: React.ChangeEvent<HTMLInputElement>): Promise<boolean> => {
        const newValue = e.target.value;
        const transformedValue = handleGetTransformedValue(newValue);
        if (onSubmit) {
          onSubmit(e, transformedValue);
        }
        handleChange(e);
        return true;
      },
      [handleChange, handleGetTransformedValue, onSubmit]
    );

    const handleBlur = useCallback(
      (e?: React.FocusEvent<HTMLInputElement>): void => {
        const newValue =
          e?.target?.value !== undefined
            ? e?.target?.value
            : (stateRef.current as string);
        const transformedValue = handleGetTransformedValue(newValue);
        if (onBlur) {
          onBlur(e, transformedValue);
        }
      },
      [handleGetTransformedValue, onBlur]
    );

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        const newValue = stateRef.current.toString();
        if (onClick) {
          onClick(e, newValue);
        }
      },
      [onClick]
    );

    useEffect(() => {
      if (showError) {
        const displayErrors = async (): Promise<void> => {
          const newValue = stateRef.current.toString();
          const transformedValue = handleGetTransformedValue(newValue);
          if (getInputError) {
            const inputError = await getInputError(transformedValue);
            setInputError(inputError);
            if (inputError) {
              if (onErrorFound) {
                onErrorFound(inputError);
              }
            } else if (onErrorFixed) {
              onErrorFixed();
            }
          }
        };
        displayErrors();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showError]);

    const belowSmBreakpoint = useMediaQuery(theme.breakpoints.down("md"));
    const showFullscreen = !disableResponsive && belowSmBreakpoint;

    const handleBrowserNavigation = useCallback(
      (
        currState: Record<string, string>,
        prevState?: Record<string, string>
      ) => {
        if (currState?.f !== prevState?.f) {
          setDialogOpenState(currState?.f === queryKey);
        }
      },
      [queryKey]
    );
    const [openFieldDialog, closeFieldDialog] = useDialogNavigation(
      "f",
      handleBrowserNavigation
    );

    const handleOpenDialog = useCallback(
      (e?: React.MouseEvent): void => {
        if (e) {
          e.stopPropagation();
          e.preventDefault();
        }
        if (keyboardTriggerRef.current) {
          keyboardTriggerRef.current.focus();
        }
        setDialogOpenState(true);
        if (onOpenDialog) {
          onOpenDialog();
        }
        openFieldDialog(queryKey);
      },
      [queryKey, onOpenDialog, openFieldDialog]
    );

    const handleCloseDialog = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        handleBlur(e);
        setDialogOpenState(false);
        if (onCloseDialog) {
          onCloseDialog();
        }
        closeFieldDialog();
      },
      [closeFieldDialog, handleBlur, onCloseDialog]
    );

    useEffect(() => {
      if (open) {
        handleOpenDialog();
      }
    }, [handleOpenDialog, open]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent): void => {
        if (!multiline) {
          if (e.key === "Enter") {
            (e.target as HTMLElement).blur();
            if (onSubmit) {
              const changeEvent =
                e as unknown as React.ChangeEvent<HTMLInputElement>;
              changeEvent.target.value = stateRef.current?.toString() || "";
              const transformedValue = handleGetTransformedValue(
                String(stateRef.current)
              );
              onSubmit(changeEvent, transformedValue);
            }
          }
        }
        if (onKeyDown) {
          onKeyDown(e);
        }
      },
      [handleGetTransformedValue, multiline, onKeyDown, onSubmit]
    );

    const handleFocus = useCallback(
      (e: React.FocusEvent): void => {
        if (onFocus) {
          onFocus(e);
        }
      },
      [onFocus]
    );

    const handleBlockClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
    }, []);

    const inputErrorText = errorText || inputError;
    const counterText =
      countText ||
      (showCharacterCounter
        ? `${String(state).length} / ${characterCountLimit}`
        : undefined);

    const StringHelperText = useCallback(
      (props: PropsWithChildren<{ dialog?: boolean }>): JSX.Element => {
        const { dialog, children } = props;
        if (moreInfoPopup) {
          return (
            <HelpButton
              id={`${id}-${dialog}`}
              fontSize={theme.typography.caption.fontSize}
              label={children}
              style={{ pointerEvents: "auto" }}
            >
              {markdown ? (
                <MarkdownHelp
                  title={moreInfoPopup.title}
                  description={moreInfoPopup.description}
                  caption={moreInfoPopup.caption}
                  alignment={moreInfoPopup.alignment}
                />
              ) : (
                <InfoHelp
                  title={moreInfoPopup.title}
                  description={moreInfoPopup.description}
                  caption={moreInfoPopup.caption}
                  alignment={moreInfoPopup.alignment}
                />
              )}
            </HelpButton>
          );
        }
        return <>{children}</>;
      },
      [id, markdown, moreInfoPopup, theme.typography.caption.fontSize]
    );

    const stringDialogInputProps = useMemo(
      () => ({
        ...inputProps,
        // Turn off default browser auto-complete
        "autoComplete": "new-password",
        "aria-label": label as string,
        "maxLength": characterCountLimit,
        "style": {
          textTransform,
        },
      }),
      [characterCountLimit, inputProps, label, textTransform]
    );

    const stringInputProps = useMemo(
      () => ({
        ...stringDialogInputProps,
        style: {
          ...stringDialogInputProps?.style,
          overflow: showFullscreen ? "hidden" : undefined,
        },
      }),
      [stringDialogInputProps, showFullscreen]
    );

    const SharedInputProps = useMemo(
      () => ({
        ...InputProps,
        endAdornment: (
          <StringEndAdornment
            dialog
            id={id}
            showFullscreen={showFullscreen}
            markdown={markdown}
            loading={loading}
            moreInfoPopup={moreInfoPopup}
            onClick={handleBlockClick}
          >
            {InputProps?.endAdornment}
          </StringEndAdornment>
        ),
        style: {
          fontFamily: markdown ? theme.fontFamily.monospace : undefined,
          paddingTop:
            !label && (variant === "filled" || inset) ? 10 : undefined,
          paddingBottom:
            !label && (variant === "filled" || inset) ? 10 : undefined,
          ...InputProps?.style,
        },
      }),
      [
        InputProps,
        handleBlockClick,
        id,
        inset,
        label,
        loading,
        markdown,
        moreInfoPopup,
        showFullscreen,
        theme.fontFamily.monospace,
        variant,
      ]
    );

    const StringDialogInputProps = useMemo(
      () => ({
        ...SharedInputProps,
        ...DialogInputProps,
      }),
      [DialogInputProps, SharedInputProps]
    );

    const StringInputProps = useMemo(
      () => ({
        ...SharedInputProps,
        style: {
          backgroundColor,
          ...(SharedInputProps.style || {}),
        },
        startAdornment: (
          <>
            {showFullscreen && (
              <StyledDialogButton onClick={handleOpenDialog} />
            )}
            {InputProps?.startAdornment}
          </>
        ),
        endAdornment: (
          <>
            <StringEndAdornment
              id={id}
              showFullscreen={showFullscreen}
              markdown={markdown}
              loading={loading}
              moreInfoPopup={moreInfoPopup}
              onClick={handleBlockClick}
            >
              {InputProps?.endAdornment}
            </StringEndAdornment>
          </>
        ),
        ...((variant === "filled" || inset) && showFullscreen
          ? {
              disableUnderline: showFullscreen,
            }
          : {}),
        readOnly:
          (showFullscreen && disableAutoKeyboard) || SharedInputProps?.readOnly,
      }),
      [
        InputProps?.endAdornment,
        InputProps?.startAdornment,
        SharedInputProps,
        backgroundColor,
        disableAutoKeyboard,
        handleBlockClick,
        handleOpenDialog,
        id,
        inset,
        loading,
        markdown,
        moreInfoPopup,
        showFullscreen,
        variant,
      ]
    );

    const StringInputLabelProps = useMemo(
      () => ({
        ...(showFullscreen
          ? { shrink: Boolean(state) || Boolean(InputProps?.startAdornment) }
          : {}),
        ...(showFullscreen ? { style: { color: "rgba(0, 0, 0, 0.54)" } } : {}),
        ...(InputLabelProps || {}),
      }),
      [InputLabelProps, InputProps?.startAdornment, showFullscreen, state]
    );

    const StringFormHelperTextProps = useMemo(
      () => ({ component: "div", ...FormHelperTextProps }),
      [FormHelperTextProps]
    );

    const stringHelperText = useMemo(() => {
      if (!helperText) {
        return undefined;
      }
      return <StringHelperText>{helperText}</StringHelperText>;
    }, [StringHelperText, helperText]);

    const stringDialogHelperText = useMemo(() => {
      if (!helperText) {
        return undefined;
      }
      return <StringHelperText dialog>{helperText}</StringHelperText>;
    }, [StringHelperText, helperText]);

    const currentPlaceholder = mixed ? mixedLabel : placeholder;
    const hasError = Boolean(error) || Boolean(inputError);

    return (
      <StyledStringInput
        className={inset ? "inset" : variant}
        style={{
          minHeight: theme.spacing(6),
          ...style,
        }}
      >
        <StyledKeyboardTrigger aria-hidden="true" ref={keyboardTriggerRef} />
        <StyledTextField
          className={inset ? "inset" : variant}
          inputRef={inputRef}
          id={id}
          variant={inset ? "filled" : variant}
          InputComponent={InputComponent}
          color={color}
          size={size}
          type={type}
          label={label}
          placeholder={currentPlaceholder}
          disabled={disabled}
          autoFocus={autoFocus}
          required={required}
          multiline={multiline}
          minRows={minRows}
          maxRows={maxRows}
          error={hasError}
          helperText={renderHelperText({
            errorText: inputErrorText || inputError,
            helperText: stringHelperText,
            counterText,
          })}
          defaultValue={defaultValue}
          value={state}
          inputProps={stringInputProps}
          InputLabelProps={StringInputLabelProps}
          InputProps={StringInputProps}
          FormHelperTextProps={StringFormHelperTextProps}
          fullWidth
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={showFullscreen ? undefined : handleBlur}
          onClick={handleClick}
          focusable={showFullscreen ? undefined : "true"}
          style={{
            opacity: disabled ? disabledOpacity : undefined,
          }}
        />
        {dialogOpenState !== undefined && showFullscreen && (
          <DialogComponent
            id={`${id}-${true}`}
            open={dialogOpenState}
            label={label}
            defaultValue={defaultValue || String(state)}
            value={String(state)}
            errorText={errorText}
            helperText={stringDialogHelperText}
            countText={countText}
            showCharacterCounter={showCharacterCounter}
            characterCountLimit={characterCountLimit}
            renderHelperText={renderHelperText}
            placeholder={currentPlaceholder}
            required={required}
            multiline={multiline}
            inputProps={stringDialogInputProps}
            InputLabelProps={StringInputLabelProps}
            InputProps={StringDialogInputProps}
            FormHelperTextProps={StringFormHelperTextProps}
            debounceInterval={debounceInterval}
            getTransformedValue={handleGetTransformedValue}
            getInputError={getInputError}
            onClose={handleCloseDialog}
            onInputChange={handleDialogInputChange}
            onChange={handleDialogChange}
            DialogTextFieldProps={DialogTextFieldProps}
            DialogTextFieldComponent={DialogTextFieldComponent}
            {...DialogProps}
          />
        )}
        {overlay && <StyledOverlay>{overlay}</StyledOverlay>}
      </StyledStringInput>
    );
  }
);

export default StringInput;
