import styled from "@emotion/styled";
import Autocomplete, {
  AutocompleteChangeDetails,
  AutocompleteChangeReason,
  AutocompleteInputChangeReason,
  AutocompleteRenderGroupParams,
  AutocompleteRenderOptionState,
} from "@material-ui/core/Autocomplete";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import Divider from "@material-ui/core/Divider";
import FilledInput from "@material-ui/core/FilledInput";
import FormHelperText from "@material-ui/core/FormHelperText";
import Paper from "@material-ui/core/Paper";
import { PopperProps } from "@material-ui/core/Popper";
import Slide from "@material-ui/core/Slide";
import { TransitionProps } from "@material-ui/core/transitions";
import Typography from "@material-ui/core/Typography";
import {
  AutocompleteGetTagProps,
  FilterOptionsState,
} from "@material-ui/core/useAutocomplete";
import React, { useCallback, useMemo, useRef, useState } from "react";
import useIOS from "../../hooks/useIOS";
import useVisualViewport from "../../hooks/useVisualViewport";
import { setBodyBackgroundColor } from "../../utils/setBodyBackgroundColor";
import { setHTMLBackgroundColor } from "../../utils/setHTMLBackgroundColor";
import { StringDialogProps } from "./StringDialog";
import TextField from "./TextField";

const StyledAutocompleteDialog = styled(Dialog)`
  will-change: transform;

  & .MuiDialog-container.MuiDialog-scrollPaper {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    will-change: transform;
  }

  * {
    touch-action: none;
    overscroll-behavior: contain;
  }
  & ul {
    touch-action: pan-y;
    overscroll-behavior: contain;
  }
  & ul * {
    touch-action: pan-y;
    overscroll-behavior: contain;
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
  padding: ${(props): string => props.theme.spacing(0, 1)};
`;

const StyledLabelTypography = styled(Typography)<{ component?: string }>``;

const StyledForm = styled.form`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
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
  display: flex;
  flex-direction: column;

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

  & .MuiInputBase-multiline {
    position: static;
    min-height: 0;
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

  &.scrollable .MuiInputBase-multiline textarea {
    min-height: calc(100% - 37px);
  }
`;

const StyledAutocomplete = styled(Autocomplete)`
  overflow: hidden;
  display: block;

  &
    .MuiAutocomplete-inputRoot[class*="MuiFilledInput-root"]
    .MuiAutocomplete-input {
    padding: 0;
    height: 100%;
  }

  &
    .MuiInputBase-root.MuiInputBase-fullWidth.MuiInputBase-formControl.MuiInputBase-adornedEnd
    * {
    touch-action: pan-y;
    overscroll-behavior: contain;
  }
`;

const StyledTextField = styled(TextField)`
  & .MuiInputBase-root {
    border-radius: 0;
    flex: 1;
    padding-top: 19px;
    padding-bottom: 19px;
    padding-left: 12px;
    padding-right: 12px;
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
    min-width: 100%;
  }

  & .MuiFormHelperText-root.Mui-error {
    color: ${(props): string => props.theme.palette.error.light};
  }
`;

const StyledFullscreenList = styled.div`
  position: relative;
  flex: 1;
  z-index: 3;

  & .MuiPaper-root.MuiAutocomplete-paper {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    border-radius: 0;
    margin-top: 0;
    margin-bottom: 0;
  }

  & .MuiPaper-root .MuiAutocomplete-listbox {
    min-height: 0;
    max-height: 100%;
    padding-top: 0;
  }

  & .MuiAutocomplete-option[data-focus="true"] {
    background-color: rgba(0, 0, 0, 0);
  }

  & .MuiAutocomplete-option[aria-selected="true"] {
    background-color: rgba(0, 0, 0, 0.08);
  }
`;

const StyledListbox = styled.ul``;

const StyledFormHelperText = styled(FormHelperText)<{ component?: string }>`
  display: flex;
  justify-content: flex-end;
  margin: 0;
  padding-top: 3px;
  padding-bottom: 3px;
  padding-left: 12px;
  padding-right: 12px;
  
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

const StyledDivider = styled(Divider)``;

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

const CustomListbox = React.forwardRef(
  (
    props: React.HTMLAttributes<HTMLElement>,
    ref: React.Ref<HTMLUListElement>
  ) => {
    return (
      <StyledListbox ref={ref} {...props}>
        {props.children}
      </StyledListbox>
    );
  }
);

const Transition = React.forwardRef(
  (
    props: TransitionProps & { children?: React.ReactElement },
    ref: React.Ref<unknown>
  ) => <Slide direction="left" ref={ref} {...props} />
);

export interface AutocompleteDialogProps
  extends Omit<StringDialogProps, "value" | "defaultValue" | "onInputChange"> {
  freeSolo?: boolean;
  clearOnBlur?: boolean;
  handleHomeEndKeys?: boolean;
  multiple?: boolean;
  noOptionsText?: React.ReactNode;
  forcePopupIcon?: boolean;
  inputValue?: string;
  value?: unknown;
  defaultValue?: unknown;
  options: unknown[];
  listCountLimit?: number;
  searchableThreshold?: number;
  filterOptions?: (
    options: unknown[],
    state: FilterOptionsState<unknown>
  ) => unknown[];
  getOptionLabel?: (option: unknown) => string;
  getOptionIcon?: (option: unknown) => string;
  getOptionIconStyle?: (option: unknown) => {
    color?: string;
    fontSize?: string | number;
  };
  isOptionEqualToValue?: (option: unknown, other: unknown) => boolean;
  onChange?: (
    event: React.ChangeEvent,
    value?: unknown,
    reason?: AutocompleteChangeReason,
    details?: AutocompleteChangeDetails<unknown>
  ) => Promise<boolean>;
  groupBy?: (option: unknown) => string;
  renderOption?: (
    props: React.HTMLAttributes<HTMLLIElement>,
    option: unknown,
    state: AutocompleteRenderOptionState
  ) => React.ReactNode;
  renderGroup?: (params: AutocompleteRenderGroupParams) => React.ReactNode;
  renderTags?: (
    value: unknown[],
    getTagProps: AutocompleteGetTagProps
  ) => React.ReactNode;
  onInputChange?: (
    e: React.ChangeEvent | React.SyntheticEvent,
    value?: string,
    reason?: AutocompleteInputChangeReason
  ) => void;
}

const AutocompleteDialog = React.memo(
  (props: AutocompleteDialogProps): JSX.Element => {
    const {
      id,
      inputProps,
      InputLabelProps,
      FormHelperTextProps,
      DialogTextFieldProps: DialogInputProps,
      label,
      placeholder,
      open,
      multiple,
      freeSolo,
      clearOnBlur,
      handleHomeEndKeys,
      defaultValue,
      value,
      options,
      required,
      listCountLimit,
      noOptionsText,
      forcePopupIcon,
      inputValue,
      InputProps,
      searchableThreshold = 5,
      countText,
      helperText,
      style,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      autoSave,
      onFocus,
      renderHelperText,
      filterOptions,
      getOptionLabel,
      isOptionEqualToValue,
      onChange,
      groupBy,
      renderOption,
      renderGroup,
      renderTags,
      onInputChange,
      onClose,
      onClick,
      ...DialogProps
    } = props;

    const [focused, setFocused] = useState(false);
    const [viewportArea, setViewportArea] = useState<HTMLDivElement>();
    const [inputValueState, setInputValueState] = useState(inputValue);

    const closingRef = useRef(false);
    const autocompleteRef = useRef<HTMLDivElement>();
    const inputRef = useRef<HTMLInputElement>();
    const bodyColor = useRef<string>();

    const variant = "filled";
    const InputComponent = FilledInput;
    const size = "medium";

    const visualViewportSupported = useVisualViewport(viewportArea);
    const ios = useIOS();

    // If no label, use placeholder as label and don't display placeholder again in placeholder area
    const validLabel = label || placeholder;
    const validPlaceholder = label ? placeholder : undefined;

    const keyboardSpacerStyle = useMemo(
      () => ({
        height: ios && !visualViewportSupported ? "50vh" : 0,
      }),
      [ios, visualViewportSupported]
    );

    const noDefaultOptions = useMemo(
      () => freeSolo && (!options || options.length === 0),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      []
    );

    const handleFocus = useCallback(
      (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFocused(true);
        if (onFocus) {
          onFocus(e);
        }
      },
      [onFocus]
    );

    const handleBack = useCallback(
      (e: React.MouseEvent | React.ChangeEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        closingRef.current = true;
        if (inputRef.current) {
          inputRef.current.blur();
        }
        if (ios || !focused) {
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
      },
      [focused, ios, onClose]
    );

    const handleChange = useCallback(
      async (
        e: React.ChangeEvent,
        value: unknown,
        reason: AutocompleteChangeReason,
        details?: AutocompleteChangeDetails
      ) => {
        if (
          multiple &&
          Array.isArray(value) &&
          listCountLimit !== undefined &&
          listCountLimit !== null &&
          value.length >= listCountLimit
        ) {
          handleBack(e);
          return;
        }
        if (reason === "clear") {
          if (onInputChange) {
            onInputChange(e, "", "clear");
          }
        } else if (onChange) {
          const shouldClose = await onChange(e, value, reason, details);
          if (shouldClose === false) {
            return;
          }
        }
        if (
          reason === "createOption" ||
          (noDefaultOptions && reason !== "clear") ||
          reason === "selectOption"
        ) {
          handleBack(e);
        }
      },
      [
        multiple,
        listCountLimit,
        onChange,
        noDefaultOptions,
        handleBack,
        onInputChange,
      ]
    );

    const handleOutsideClick = useCallback(
      (e: React.MouseEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        if (focused && inputRef.current) {
          window.requestAnimationFrame(() => {
            if (inputRef.current) {
              inputRef.current.focus();
            }
          });
        }
      },
      [focused]
    );

    const handleViewportAreaRef = useCallback(
      (instance: HTMLDivElement): void => {
        if (instance) {
          setViewportArea(instance);
        }
      },
      []
    );

    const handleInputRef = useCallback(
      (instance: HTMLInputElement): void => {
        inputRef.current = instance;
        if (noDefaultOptions) {
          window.requestAnimationFrame(() => {
            if (inputRef.current) {
              inputRef.current.focus();
            }
          });
        }
      },
      [noDefaultOptions]
    );

    const handleInputChange = useCallback(
      (
        e: React.SyntheticEvent,
        value: string,
        reason: AutocompleteInputChangeReason
      ): void => {
        setInputValueState(value);
        if (onInputChange) {
          onInputChange(e, value, reason);
        }
      },
      [onInputChange]
    );

    const handleBlur = useCallback(
      (e: React.FocusEvent): void => {
        if (!closingRef.current) {
          if (focused && !e.relatedTarget) {
            closingRef.current = true;
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
          }
        }
      },
      [focused, ios, onClose]
    );

    const handleRenderInput = useCallback(
      (params): React.ReactNode => {
        return (
          <StyledTextField
            id={id}
            inputRef={handleInputRef}
            className={variant}
            variant={variant}
            InputComponent={InputComponent}
            size={size}
            placeholder={validPlaceholder}
            multiline={false}
            inputProps={inputProps}
            InputLabelProps={InputLabelProps}
            FormHelperTextProps={FormHelperTextProps}
            fullWidth
            onFocus={handleFocus}
            onBlur={handleBlur}
            onClick={onClick}
            {...params}
            {...DialogInputProps}
            InputProps={{
              ...InputProps,
              ...DialogInputProps?.InputProps,
              ...params?.InputProps,
              style: {
                ...InputProps?.style,
                ...DialogInputProps?.InputProps?.style,
                ...params?.InputProps?.style,
                backgroundColor: "transparent",
              },
            }}
            helperText={undefined}
          />
        );
      },
      [
        DialogInputProps,
        FormHelperTextProps,
        InputComponent,
        InputLabelProps,
        InputProps,
        handleBlur,
        handleFocus,
        handleInputRef,
        id,
        inputProps,
        onClick,
        validPlaceholder,
      ]
    );

    const handleEnter = useCallback((): void => {
      closingRef.current = false;
      setFocused(false);
    }, []);

    const handleEntered = useCallback((): void => {
      bodyColor.current = document.body.style.backgroundColor;
      setBodyBackgroundColor(document, "white");
      setHTMLBackgroundColor(document, "white");
    }, []);

    const handleExit = useCallback((): void => {
      closingRef.current = true;
      setBodyBackgroundColor(document, bodyColor.current);
      setHTMLBackgroundColor(document, bodyColor.current);
    }, []);

    const CustomDialogPaper = useCallback(
      (params): JSX.Element => <StyledPaper {...params} elevation={0} />,
      []
    );

    const CustomPaper = useCallback(
      (params): JSX.Element => <StyledPaper {...params} elevation={0} />,
      []
    );

    const CustomPopper = useCallback((props: PopperProps): JSX.Element => {
      return (
        <>
          <Divider style={{ marginTop: -1, zIndex: 1 }} />
          <StyledFullscreenList {...props} />
        </>
      );
    }, []);

    const counterText = countText;

    const dialogHelperText = useMemo(
      () =>
        renderHelperText
          ? renderHelperText({
              helperText,
              counterText,
            })
          : undefined,
      [counterText, helperText, renderHelperText]
    );

    const searchable =
      noDefaultOptions || options?.length > searchableThreshold;

    return (
      <StyledAutocompleteDialog
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
          onEntered: handleEntered,
          onExit: handleExit,
        }}
        {...DialogProps}
      >
        <StyledViewportArea ref={handleViewportAreaRef}>
          <StyledToolbar>
            <StyledLabelArea>
              {validLabel && (
                <StyledLabelTypography variant="h6" component="h2">
                  {validLabel}
                  {`${required ? " *" : ""}`}
                </StyledLabelTypography>
              )}
            </StyledLabelArea>
            <StyledSubmitButtonArea>
              <StyledSubmitButton
                variant="contained"
                color="secondary"
                disableElevation
                onClick={handleBack}
              >
                {`Done`}
              </StyledSubmitButton>
            </StyledSubmitButtonArea>
          </StyledToolbar>
          <StyledForm method="post" noValidate>
            <StyledInputArea
              style={{
                flex: 1,
                maxHeight: ios && !visualViewportSupported ? "50vh" : undefined,
              }}
            >
              <StyledInputContent
                className={ios ? "scrollable" : undefined}
                style={{ position: "absolute" }}
              >
                {!searchable && <StyledDivider />}
                <StyledAutocomplete
                  ref={autocompleteRef}
                  className={variant}
                  options={options}
                  placeholder={placeholder}
                  defaultValue={defaultValue}
                  value={value}
                  multiple={multiple}
                  forcePopupIcon={forcePopupIcon}
                  noOptionsText={noOptionsText}
                  inputValue={inputValueState}
                  freeSolo={freeSolo}
                  clearOnBlur={clearOnBlur}
                  handleHomeEndKeys={handleHomeEndKeys}
                  size={size}
                  PopperComponent={CustomPopper}
                  PaperComponent={CustomPaper}
                  ListboxComponent={CustomListbox}
                  fullWidth
                  open
                  selectOnFocus
                  groupBy={groupBy}
                  filterOptions={filterOptions}
                  isOptionEqualToValue={isOptionEqualToValue}
                  getOptionLabel={getOptionLabel}
                  renderOption={renderOption}
                  renderGroup={renderGroup}
                  renderTags={renderTags}
                  renderInput={handleRenderInput}
                  onChange={handleChange}
                  onInputChange={handleInputChange}
                  style={{
                    visibility: searchable ? undefined : "hidden",
                    pointerEvents: searchable ? undefined : "none",
                    maxHeight: searchable ? undefined : "0",
                  }}
                />
              </StyledInputContent>
            </StyledInputArea>
            {dialogHelperText && (
              <>
                <Divider />
                <StyledFormHelperText component="div">
                  {dialogHelperText}
                </StyledFormHelperText>
              </>
            )}
            <div style={keyboardSpacerStyle} />
          </StyledForm>
        </StyledViewportArea>
      </StyledAutocompleteDialog>
    );
  }
);

export default AutocompleteDialog;
