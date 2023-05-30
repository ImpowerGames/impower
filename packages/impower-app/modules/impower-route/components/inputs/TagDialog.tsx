import styled from "@emotion/styled";
import Autocomplete, {
  AutocompleteChangeDetails,
  AutocompleteChangeReason,
  AutocompleteInputChangeReason,
  AutocompleteRenderGroupParams,
  AutocompleteRenderOptionState,
  createFilterOptions,
} from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import Divider from "@mui/material/Divider";
import FilledInput from "@mui/material/FilledInput";
import FormHelperText from "@mui/material/FormHelperText";
import Paper from "@mui/material/Paper";
import { PopperProps } from "@mui/material/Popper";
import Slide from "@mui/material/Slide";
import Tab from "@mui/material/Tab";
import { TransitionProps } from "@mui/material/transitions";
import Typography from "@mui/material/Typography";
import { FilterOptionsState } from "@mui/material/useAutocomplete";
import match from "autosuggest-highlight/match";
import parse from "autosuggest-highlight/parse";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { DynamicIcon, FontIcon } from "../../../impower-icon";
import useIOS from "../../hooks/useIOS";
import useVisualViewport from "../../hooks/useVisualViewport";
import { setBodyBackgroundColor } from "../../utils/setBodyBackgroundColor";
import { setHTMLBackgroundColor } from "../../utils/setHTMLBackgroundColor";
import Tabs from "../layouts/Tabs";
import { AutocompleteDialogProps } from "./AutocompleteDialog";
import TextField from "./TextField";

const StyledTagDialog = styled(Dialog)`
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
    touch-action: pan-x;
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
  min-height: ${(props): string => props.theme.spacing(7)};
  align-items: center;
  display: flex;
  flex-wrap: nowrap;

  padding-left: ${(props): string => props.theme.spacing(1)};
  padding-right: ${(props): string => props.theme.spacing(1)};
  width: 100%;
  position: relative;

  z-index: 1;
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

const StyledInputContent = styled.div<{ listHeight?: number }>`
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
    margin-bottom: ${(props): number => props.listHeight}px;
    box-shadow: ${(props): string => props.theme.boxShadow.inset};
  }

  & .MuiInputBase-multiline {
    position: static;
    min-height: 0;
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

const StyledAutocomplete = styled(Autocomplete)`
  position: inherit;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow: hidden;
  display: block;

  &
    .MuiAutocomplete-inputRoot[class*="MuiFilledInput-root"]
    .MuiAutocomplete-input {
    padding-left: 0;
    padding-right: 0;
  }
`;

const StyledTextField = styled(TextField)`
  & .MuiInputBase-root {
    border-radius: 0;
    flex: 1;
    padding-top: 12px;
    padding-bottom: 12px;
    padding-left: 12px;
    padding-right: 12px;
    height: 100%;
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

  & .MuiAutocomplete-inputRoot .MuiAutocomplete-input {
    width: 100%;
    min-width: 100%;
  }

  & .MuiFormHelperText-root.Mui-error {
    color: ${(props): string => props.theme.palette.error.light};
  }
`;

const StyledDialogList = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  min-height: 48px;
  flex: 1;

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
    padding-bottom: 0;
  }

  & .MuiAutocomplete-option[data-focus="true"] {
    background-color: rgba(0, 0, 0, 0);
  }

  & .MuiAutocomplete-option[aria-selected="true"] {
    background-color: rgba(0, 0, 0, 0.08);
  }

  & .MuiAutocomplete-option {
    padding: 0;
    min-height: 40px;
  }
`;

const StyledListbox = styled.ul`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
`;

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
  }
`;

const StyledTagChip = styled(Chip)`
  padding: ${(props): string => props.theme.spacing(0, 0.5)};
  font-size: 0.875rem;
  min-height: 40px;
  border-radius: 100px;

  & .MuiChip-label {
    text-overflow: clip;
  }
`;

const StyledChipIconArea = styled.div`
  padding-left: ${(props): string => props.theme.spacing(1)};
  padding-right: ${(props): string => props.theme.spacing(0.5)};
`;

const StyledLabelContent = styled.div`
  display: flex;
`;

const StyledTypography = styled(Typography)<{ component?: string }>`
  white-space: pre-wrap;
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

const StyledTabs = styled(Tabs)`
  pointer-events: auto;
  max-width: 100%;
  position: relative;
  touch-action: pan-x;

  & * {
    touch-action: pan-x;
  }
`;

const StyledTab = styled(Tab)`
  margin: 4px;
  opacity: 1;
  min-width: 0;
  min-height: 0;
  border-radius: 100px;
  padding: 0;
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

const Transition = React.forwardRef(
  (
    props: TransitionProps & { children: React.ReactElement },
    ref: React.Ref<unknown>
  ) => <Slide direction="left" ref={ref} {...props} />
);

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface TagDialogProps extends AutocompleteDialogProps {}

const TagDialog = React.memo((props: TagDialogProps): JSX.Element => {
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
    inputValue,
    InputProps,
    searchableThreshold = 5,
    countText,
    helperText,
    style,
    renderTags,
    renderHelperText,
    filterOptions,
    getOptionLabel,
    isOptionEqualToValue,
    onChange,
    getOptionIcon,
    getOptionIconStyle,
    onInputChange,
    onClose,
    onClick,
  } = props;

  const [viewportArea, setViewportArea] = useState<HTMLDivElement>();
  const [limitAnimation, setLimitAnimation] = useState(false);
  const inputValueRef = useRef<string>(inputValue);
  const [inputValueState, setInputValueState] = useState(inputValueRef.current);

  const closingRef = useRef(false);
  const autocompleteRef = useRef<HTMLDivElement>();
  const inputRef = useRef<HTMLInputElement>();
  const bodyColor = useRef<string>();

  const variant = "filled";
  const InputComponent = FilledInput;
  const size = "medium";

  const visualViewportSupported = useVisualViewport(viewportArea);
  const ios = useIOS();

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

  const searchable = noDefaultOptions || options?.length > searchableThreshold;

  // If no label, use placeholder as label and don't display placeholder again in placeholder area
  const validLabel = label || placeholder;
  const validPlaceholder = label ? placeholder : undefined;

  const headerHeight = 56;
  const listHeight = 48;
  const dividerHeight = 1;
  const helperTextHeight = helperText || counterText ? 25 : 0;
  const topPaddingHeight = 12;

  const handleBack = useCallback(
    (e: React.MouseEvent | React.ChangeEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      closingRef.current = true;
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
    },
    [ios, onClose]
  );

  const handleChange = useCallback(
    (
      e: React.ChangeEvent,
      value: unknown,
      reason: AutocompleteChangeReason,
      details?: AutocompleteChangeDetails
    ) => {
      if (multiple && Array.isArray(value) && value.length > listCountLimit) {
        setLimitAnimation(true);
        setTimeout(() => {
          setLimitAnimation(false);
        }, 1000);
        return;
      }
      setLimitAnimation(false);
      if (reason === "clear") {
        if (onInputChange) {
          onInputChange(e, "", "clear");
        }
      } else if (onChange) {
        onChange(e, value, reason, details);
      }
      if (
        !multiple &&
        (reason === "createOption" ||
          (noDefaultOptions && reason !== "clear") ||
          reason === "selectOption")
      ) {
        handleBack(e);
      } else {
        window.requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            if (!ios) {
              inputRef.current.scrollIntoView();
            }
          }
        });
      }
    },
    [
      multiple,
      listCountLimit,
      onChange,
      noDefaultOptions,
      onInputChange,
      handleBack,
      ios,
    ]
  );

  const handleOutsideClick = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    window.requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    });
  }, []);

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
    window.requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    });
  }, []);

  const handleInputChange = useCallback(
    (
      e: React.SyntheticEvent,
      value: string,
      reason: AutocompleteInputChangeReason
    ): void => {
      inputValueRef.current = value;
      setInputValueState(inputValueRef.current);
      if (onInputChange) {
        onInputChange(e, value, reason);
      }
    },
    [onInputChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (freeSolo && Array.isArray(value)) {
        if (e.key === "Enter") {
          const changeEvent =
            e as unknown as React.ChangeEvent<HTMLInputElement>;
          changeEvent.target.value = inputValueRef.current || "";
          const newValue = [...value, inputValueRef.current];
          handleChange(changeEvent, newValue, "createOption", {
            option: inputValueRef.current,
          });
        }
      }
    },
    [freeSolo, handleChange, value]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent): void => {
      if (!closingRef.current) {
        if (!e.relatedTarget) {
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
    [ios, onClose]
  );

  const handleEnter = useCallback((): void => {
    closingRef.current = false;
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
    (params): JSX.Element => (
      <StyledPaper
        {...params}
        elevation={0}
        style={{ backgroundColor: "transparent" }}
      />
    ),
    []
  );

  const CustomPopper = useCallback((props: PopperProps): JSX.Element => {
    const { children, ...provided } = props;
    return (
      <StyledDialogList
        {...provided}
        style={{ ...provided?.style, width: undefined, minHeight: listHeight }}
      >
        {children as React.ReactNode}
      </StyledDialogList>
    );
  }, []);

  const handleRenderInput = useCallback(
    (params): JSX.Element => {
      return (
        <StyledTextField
          id={id}
          inputRef={handleInputRef}
          className={variant}
          variant={variant}
          InputComponent={InputComponent}
          size={size}
          placeholder={validPlaceholder}
          multiline
          inputProps={inputProps}
          InputLabelProps={InputLabelProps}
          FormHelperTextProps={FormHelperTextProps}
          fullWidth
          onBlur={handleBlur}
          onClick={onClick}
          onKeyDown={handleKeyDown}
          {...params}
          {...DialogInputProps}
          InputProps={{
            ...InputProps,
            ...DialogInputProps?.InputProps,
            ...params?.InputProps,
            startAdornment: (
              <>
                {/* On IOS, forcing overflow blocks scrolling from propagating behind the opened dialog */}
                {ios && (
                  <StyledRelativeArea>
                    <StyledForceOverflowSpacer
                      style={{
                        minHeight: `calc(100vh - ${headerHeight}px - ${topPaddingHeight}px - ${listHeight}px - ${dividerHeight}px - ${helperTextHeight}px + 1px)`,
                      }}
                    />
                  </StyledRelativeArea>
                )}
                {params?.InputProps?.startAdornment}
              </>
            ),
            style: {
              ...InputProps?.style,
              ...DialogInputProps?.InputProps?.style,
              ...params?.InputProps?.style,
              backgroundColor: "transparent",
            },
          }}
          helperText={undefined}
          minRows={undefined}
          maxRows={undefined}
        />
      );
    },
    [
      id,
      handleInputRef,
      InputComponent,
      validPlaceholder,
      inputProps,
      InputLabelProps,
      FormHelperTextProps,
      handleBlur,
      onClick,
      handleKeyDown,
      DialogInputProps,
      InputProps,
      ios,
      helperTextHeight,
    ]
  );

  const defaultFilterOptions = useMemo(
    () =>
      createFilterOptions({
        matchFrom: "start",
      }),
    []
  );

  const handleFilterOptions = useCallback(
    (options: unknown[], state: FilterOptionsState<unknown>): unknown[] => {
      const { inputValue } = state;
      if (!inputValue) {
        return [];
      }
      const newOptions = filterOptions
        ? filterOptions(options, state)
        : defaultFilterOptions(options, state);
      const unselectedOptions = newOptions.filter((option) =>
        Array.isArray(value) ? !value.includes(option) : value !== option
      );
      return unselectedOptions.slice(0, 5);
    },
    [defaultFilterOptions, filterOptions, value]
  );

  const handleRenderOption = useCallback(
    (
      props: React.HTMLAttributes<HTMLLIElement>,
      option: string,
      state: AutocompleteRenderOptionState
    ): React.ReactNode => {
      const { inputValue, selected } = state;
      const optionLabel = getOptionLabel(option);
      const optionIcon = getOptionIcon ? getOptionIcon(option) : undefined;
      const optionIconStyle = getOptionIconStyle
        ? getOptionIconStyle(option)
        : {};
      const matches = match(optionLabel, inputValue);
      const parts = parse(optionLabel, matches);
      return (
        <li
          {...props}
          style={{ ...(props?.style || {}), padding: 0, minHeight: 40 }}
        >
          <StyledTagChip
            icon={
              <StyledChipIconArea>
                {optionIcon ? (
                  <FontIcon
                    aria-label={optionIcon}
                    color={optionIconStyle?.color}
                    size={18}
                  >
                    <DynamicIcon icon={optionIcon} />
                  </FontIcon>
                ) : undefined}
              </StyledChipIconArea>
            }
            label={
              <StyledLabelContent>
                {parts.map((part, index) => (
                  <StyledTypography
                    key={index} // eslint-disable-line react/no-array-index-key
                    style={{
                      fontSize: "1rem",
                      fontWeight:
                        selected ||
                        (part.highlight &&
                          optionLabel
                            ?.toLowerCase()
                            .startsWith(inputValue?.toLowerCase()))
                          ? 700
                          : 400,
                    }}
                  >
                    {part.text}
                  </StyledTypography>
                ))}
              </StyledLabelContent>
            }
            color={selected ? "secondary" : "default"}
          />
        </li>
      );
    },
    [getOptionIcon, getOptionIconStyle, getOptionLabel]
  );

  const handleGroupBy = useCallback(() => "", []);

  const handleRenderGroup = useCallback(
    (params: AutocompleteRenderGroupParams): React.ReactNode => {
      const { children } = params;
      const items = React.Children.toArray(children);
      return (
        <StyledTabs variant="scrollable" value={0} indicatorColor="transparent">
          {items.map((item, index) => (
            <StyledTab
              key={(item as { props: { id: string } })?.props?.id}
              value={index}
              label={item}
            />
          ))}
        </StyledTabs>
      );
    },
    []
  );

  return (
    <StyledTagDialog
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
    >
      <StyledViewportArea ref={handleViewportAreaRef}>
        <StyledToolbar>
          <StyledLabelArea>
            {validLabel && (
              <StyledLabelTypography variant="h6">
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
              listHeight={listHeight}
              style={{ position: "absolute" }}
            >
              <StyledAutocomplete
                ref={autocompleteRef}
                className={variant}
                options={options}
                placeholder={placeholder}
                defaultValue={defaultValue}
                value={value}
                multiple={multiple}
                forcePopupIcon={false}
                disableClearable
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
                groupBy={handleGroupBy}
                filterOptions={handleFilterOptions}
                isOptionEqualToValue={isOptionEqualToValue}
                getOptionLabel={getOptionLabel}
                renderOption={handleRenderOption}
                renderGroup={handleRenderGroup}
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
              <StyledFormHelperText
                component="div"
                className={limitAnimation ? "limit" : undefined}
              >
                {dialogHelperText}
              </StyledFormHelperText>
            </>
          )}
          <div style={keyboardSpacerStyle} />
        </StyledForm>
      </StyledViewportArea>
    </StyledTagDialog>
  );
});

export default TagDialog;
