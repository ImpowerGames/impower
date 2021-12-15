import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Autocomplete, {
  AutocompleteProps,
  AutocompleteRenderGetTagProps,
  AutocompleteRenderInputParams,
  AutocompleteRenderOptionState,
} from "@material-ui/core/Autocomplete";
import Popper, { PopperProps } from "@material-ui/core/Popper";
import {
  AutocompleteChangeDetails,
  AutocompleteChangeReason,
  AutocompleteGetTagProps,
  AutocompleteInputChangeReason,
  createFilterOptions,
  FilterOptionsState,
} from "@material-ui/core/useAutocomplete";
import useMediaQuery from "@material-ui/core/useMediaQuery";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DynamicIcon, FontIcon } from "../../../impower-icon";
import SelectOption from "./SelectOption";
import { StringDialogProps } from "./StringDialog";
import StringInput, { StringInputProps } from "./StringInput";
import TagChip from "./TagChip";
import VirtualizedAutocompleteGroup from "./VirtualizedAutocompleteGroup";

const AutocompleteDialog = dynamic(() => import("./AutocompleteDialog"), {
  ssr: false,
});

const TagDialog = dynamic(() => import("./TagDialog"), { ssr: false });

const StyledAutocompleteInput = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
`;

const StyledAutocomplete = styled(Autocomplete)`
  flex: 1;
`;

const StyledClearAndPopupButtonArea = styled.div`
  display: flex;
  position: relative;
  & .MuiAutocomplete-endAdornment {
    position: relative;
    display: flex;
  }
`;

const StyledEndAdornmentArea = styled.div`
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
`;

const StyledPopper = styled(Popper)`
  & .MuiPaper-root .MuiAutocomplete-listbox {
    padding-top: 0;
  }
`;

const CustomPopper = React.memo((props: PopperProps): JSX.Element => {
  return <StyledPopper {...props} placement="bottom" />;
});

export interface AutocompleteInputProps
  extends Omit<
      Partial<AutocompleteProps<unknown, boolean, boolean, boolean>>,
      | "options"
      | "renderInput"
      | "classes"
      | "color"
      | "onBlur"
      | "onSubmit"
      | "onClick"
      | "onKeyDown"
      | "onFocus"
      | "onPointerEnter"
      | "onInputChange"
    >,
    Omit<
      Partial<StringInputProps>,
      "onChange" | "ref" | "autoComplete" | "onInputChange"
    > {
  options?: unknown[];
  fixedOptions?: unknown[];
  actions?: (string | number)[];
  endAdornmentPosition?: "before" | "after" | "replace";
  listCountLimit?: number;
  responsive?: boolean;
  initialOpen?: boolean;
  searchableThreshold?: number;
  style?: React.CSSProperties;
  renderInput?: (params: AutocompleteRenderInputParams) => React.ReactNode;
  getOptionHeight?: () => number;
  getOptionIcon?: (option: unknown) => string;
  getOptionIconStyle?: (option: unknown) => {
    color?: string;
    fontSize?: string | number;
  };
  getOptionDescription?: (option: unknown) => string;
  getOptionGroup?: (option: unknown) => string;
  getValidValue?: (value: unknown) => unknown;
  getInputError?: (value: unknown) => Promise<string | null>;
  renderOptionIcon?: (option: unknown, icon: string) => React.ReactNode;
  renderChips?: (
    value: unknown[],
    getTagProps: AutocompleteGetTagProps
  ) => React.ReactNode;
  onDebouncedInputChange?: (value?: string) => void;
  onInputChange?: (
    e: React.ChangeEvent | React.SyntheticEvent,
    value?: string,
    reason?: AutocompleteInputChangeReason
  ) => void;
}

const AutocompleteInput = React.memo(
  (props: AutocompleteInputProps): JSX.Element | null => {
    const {
      InputComponent,
      PopperComponent,
      InputLabelProps,
      InputProps,
      actions,
      autoFocus,
      backgroundColor,
      characterCountLimit,
      clearOnBlur,
      debounceInterval,
      disableClearable,
      disabled,
      endAdornmentPosition = "after",
      fixedOptions,
      forcePopupIcon,
      freeSolo,
      handleHomeEndKeys,
      helperText,
      id,
      inputRef,
      inputValue,
      inset,
      label,
      listCountLimit,
      loading,
      mixed,
      moreInfoPopup,
      multiple,
      noOptionsText,
      options = [],
      placeholder,
      required,
      responsive = true,
      selectOnFocus,
      showError,
      size,
      style,
      value,
      variant,
      initialOpen,
      searchableThreshold = 5,
      open = false,
      minRows,
      maxRows,
      DialogProps,
      filterOptions,
      getInputError,
      getOptionDescription,
      getOptionGroup,
      getOptionHeight,
      getOptionIcon,
      getOptionIconStyle,
      getOptionLabel,
      getValidValue,
      groupBy,
      isOptionEqualToValue,
      onBlur,
      onChange,
      onDebouncedChange,
      onDebouncedInputChange,
      onErrorFixed,
      onErrorFound,
      onInputChange,
      renderChips,
      renderGroup,
      renderInput,
      renderOption,
      renderOptionIcon,
      renderTags,
    } = props;

    const placeholderLabel = "(None)";

    const stateRef = useRef(value);
    const highlightedOptionRef = useRef<unknown>();

    const [state, setState] = useState(value);
    const [inputValueState, setInputValueState] = useState(
      (inputValue !== undefined
        ? inputValue
        : multiple
        ? ""
        : getOptionLabel
        ? getOptionLabel(value)
        : value?.toString()) || ""
    );
    const [openState, setOpenState] = useState(open);
    const [inputError, setInputError] = useState<string | null>();

    const optionsAndActions = useMemo(
      () => [...options, ...(actions || [])],
      [options, actions]
    );

    const allowOpen =
      !disabled &&
      (!multiple ||
        !Array.isArray(state) ||
        listCountLimit === undefined ||
        listCountLimit === null ||
        state.length < listCountLimit);
    const showLimitHelperText = multiple && listCountLimit;

    const countText = showLimitHelperText
      ? `${Array.isArray(state) ? state.length : 0} / ${listCountLimit}`
      : undefined;

    const currentValue = mixed ? "" : state;
    const currentOpen = allowOpen ? openState : false;
    const currentFreeSolo = mixed ? true : freeSolo;

    const theme = useTheme();

    const belowSmBreakpoint = useMediaQuery(theme.breakpoints.down("md"));
    const showFullscreen = responsive && belowSmBreakpoint;

    const currentPlaceholder =
      multiple &&
      Array.isArray(state) &&
      state.length > 0 &&
      (listCountLimit === undefined ||
        listCountLimit === null ||
        state.length < listCountLimit)
        ? "Add more"
        : placeholder;

    const dialogLabel = label || placeholder;
    const dialogPlaceholder = label ? placeholder || "Search" : "Search";

    useEffect(() => {
      if (open !== undefined) {
        setOpenState(open);
      }
    }, [open]);

    useEffect(() => {
      stateRef.current = value;
      setState(value);
    }, [value]);

    useEffect(() => {
      if (inputValue !== undefined) {
        setInputValueState(inputValue);
      }
    }, [inputValue]);

    useEffect(() => {
      const displayErrors = async (): Promise<void> => {
        if (getInputError) {
          const inputError = await getInputError(state);
          if (inputError) {
            if (showError) {
              setInputError(inputError);
              if (onErrorFound) {
                onErrorFound(inputError);
              }
            }
          } else {
            setInputError(null);
            if (onErrorFixed) {
              onErrorFixed();
            }
          }
        }
      };
      displayErrors();
    }, [getInputError, onErrorFixed, onErrorFound, showError, state]);

    const noDefaultOptions = useMemo(
      () => freeSolo && (!options || options.length === 0),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      []
    );

    const searchable =
      noDefaultOptions || options?.length > searchableThreshold;

    const handleHighlightChange = useCallback(
      (e: React.SyntheticEvent, option: unknown) => {
        highlightedOptionRef.current = option;
      },
      []
    );

    const handleOpen = useCallback(
      async (e: React.ChangeEvent | React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Don't open autocomplete until user starts typing something
        // Unless user can't search
        if (!searchable || (e.type !== "mousedown" && e.type !== "focus")) {
          setOpenState(true);
        }
      },
      [searchable]
    );

    const handleClose = useCallback(async () => {
      setOpenState(false);
    }, []);

    const handleGroupBy = useCallback(
      (option: unknown): string => {
        if (groupBy) {
          return groupBy(option);
        }
        if (actions?.includes(option as string)) {
          return "---";
        }
        if (typeof option === "string" && option.includes("/")) {
          return option.split("/")[0];
        }
        if (getOptionGroup) {
          return getOptionGroup(option);
        }
        return "";
      },
      [actions, getOptionGroup, groupBy]
    );

    const handleIsOptionEqualToValue = useCallback(
      (option: unknown, other: unknown): boolean => {
        if (isOptionEqualToValue) {
          return isOptionEqualToValue(option, other);
        }
        return option === other;
      },
      [isOptionEqualToValue]
    );

    const handleGetOptionLabel = useCallback(
      (option: unknown): string => {
        if (typeof option === "string" && option.includes("/")) {
          return option.split("/")[1];
        }
        if (getOptionLabel) {
          return getOptionLabel(option);
        }
        if (typeof option === "string") {
          return option;
        }
        return JSON.stringify(option);
      },
      [getOptionLabel]
    );

    const handleGetOptionDescription = useCallback(
      (option: unknown): string => {
        if (getOptionDescription) {
          return getOptionDescription(option);
        }
        return "";
      },
      [getOptionDescription]
    );

    const handleGetOptionIcon = useCallback(
      (option: unknown): string => {
        if (getOptionIcon) {
          return getOptionIcon(option);
        }
        return "";
      },
      [getOptionIcon]
    );

    const handleGetOptionIconStyle = useCallback(
      (option: unknown): { color?: string; fontSize?: string | number } => {
        if (getOptionIconStyle) {
          return getOptionIconStyle(option);
        }
        return {};
      },
      [getOptionIconStyle]
    );

    const handleGetOptionHeight = useCallback(() => {
      if (getOptionHeight) {
        return getOptionHeight();
      }
      const hasDescription = options && handleGetOptionDescription(options[0]);
      const hasIcon = options && handleGetOptionIcon(options[0]);
      return hasIcon && hasDescription ? 60 : hasDescription ? 56 : 48;
    }, [
      handleGetOptionDescription,
      handleGetOptionIcon,
      getOptionHeight,
      options,
    ]);

    const handleRenderOption = useCallback(
      (
        props: React.HTMLAttributes<HTMLLIElement>,
        option: unknown,
        state: AutocompleteRenderOptionState
      ): React.ReactNode => {
        const { selected, inputValue } = state;
        if (renderOption) {
          return renderOption(props, option, state);
        }
        return (
          <SelectOption
            option={option}
            selected={selected}
            inputValue={inputValue}
            placeholderLabel={placeholderLabel}
            getOptionLabel={getOptionLabel}
            getOptionDescription={getOptionDescription}
            getOptionIcon={getOptionIcon}
            getOptionIconStyle={getOptionIconStyle}
            getOptionHeight={handleGetOptionHeight}
            renderOptionIcon={renderOptionIcon}
            {...props}
          />
        );
      },
      [
        getOptionDescription,
        getOptionIcon,
        getOptionIconStyle,
        getOptionLabel,
        handleGetOptionHeight,
        renderOption,
        renderOptionIcon,
      ]
    );

    const handleRenderGroup = useCallback(
      (params): React.ReactNode => {
        if (renderGroup) {
          renderGroup(params);
        }
        return (
          <VirtualizedAutocompleteGroup
            {...params}
            getOptionHeight={handleGetOptionHeight}
          />
        );
      },
      [handleGetOptionHeight, renderGroup]
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
        if (filterOptions) {
          return filterOptions(options, state);
        }
        return defaultFilterOptions(options, state);
      },
      [defaultFilterOptions, filterOptions]
    );

    const getMatchingOption = useCallback(
      (inputValue: unknown): unknown => {
        if (actions?.includes(inputValue as string)) {
          return inputValue;
        }
        const matchingOption = options.find(
          (option) =>
            option === inputValue || handleGetOptionLabel(option) === inputValue
        );
        return matchingOption;
      },
      [actions, options, handleGetOptionLabel]
    );

    const handleGetValidValue = useCallback(
      (newValue) => {
        if (actions?.includes(newValue)) {
          return newValue;
        }
        if (getValidValue) {
          return getValidValue(newValue);
        }
        return newValue;
      },
      [actions, getValidValue]
    );

    const handleInputChange = useCallback(
      (
        e: React.ChangeEvent,
        value?: string,
        reason?: AutocompleteInputChangeReason
      ) => {
        setInputValueState(value);
        if (!value) {
          // Don't show all options when no input value
          setOpenState(false);
        }
        if (onInputChange) {
          onInputChange(e, value, reason || "input");
        }
      },
      [onInputChange]
    );

    const handleChange = useCallback(
      async (
        e: React.ChangeEvent,
        newValue?: unknown,
        reason?: AutocompleteChangeReason,
        details?: AutocompleteChangeDetails
      ): Promise<boolean> => {
        const validReason =
          reason === "createOption" &&
          highlightedOptionRef.current !== null &&
          highlightedOptionRef.current !== undefined
            ? "selectOption"
            : reason;
        const validValue =
          reason === "createOption" &&
          highlightedOptionRef.current !== null &&
          highlightedOptionRef.current !== undefined
            ? multiple && Array.isArray(stateRef.current)
              ? [...stateRef.current, highlightedOptionRef.current]
              : highlightedOptionRef.current
            : newValue;
        if (validReason === "selectOption") {
          if (handleInputChange) {
            handleInputChange(e, handleGetOptionLabel(validValue));
          }
        }
        let safeValue = freeSolo
          ? handleGetValidValue(validValue)
          : getMatchingOption(validValue);
        if (Array.isArray(safeValue) && fixedOptions) {
          safeValue = [...fixedOptions, ...safeValue];
        }
        if (multiple) {
          setInputValueState("");
        }
        if (safeValue !== undefined) {
          stateRef.current = safeValue;
          setState(safeValue);
          if (onChange) {
            onChange(e, safeValue, validReason, details);
          }
          if (getInputError) {
            const inputError = await getInputError(safeValue);
            if (inputError) {
              if (showError) {
                setInputError(inputError);
                if (onErrorFound) {
                  onErrorFound(inputError);
                }
              }
            } else {
              setInputError(null);
              if (onErrorFixed) {
                onErrorFixed();
              }
            }
            if (onDebouncedChange) {
              onDebouncedChange(safeValue);
            }
          } else if (onDebouncedChange) {
            onDebouncedChange(safeValue);
          }
        }
        return true;
      },
      [
        handleInputChange,
        freeSolo,
        handleGetValidValue,
        getMatchingOption,
        fixedOptions,
        handleGetOptionLabel,
        multiple,
        onChange,
        getInputError,
        onDebouncedChange,
        showError,
        onErrorFound,
        onErrorFixed,
      ]
    );

    const handleBlur = useCallback(
      async (e: React.FocusEvent) => {
        const safeValue = handleGetValidValue(stateRef.current);
        if (freeSolo && !multiple && safeValue !== undefined) {
          stateRef.current = safeValue;
          if (onDebouncedChange) {
            onDebouncedChange(safeValue);
          }
          if (onBlur) {
            onBlur(e, safeValue);
          }
          setState(safeValue);
        }
        if (clearOnBlur) {
          setInputValueState("");
        }
      },
      [
        handleGetValidValue,
        freeSolo,
        multiple,
        clearOnBlur,
        onDebouncedChange,
        onBlur,
      ]
    );

    const handleCloseDialog = useCallback(() => {
      if (clearOnBlur) {
        setInputValueState("");
      }
    }, [clearOnBlur]);

    const handleRenderTags = useCallback(
      (tagValue: unknown[], getTagProps: AutocompleteRenderGetTagProps) => {
        if (renderTags) {
          return renderTags(tagValue, getTagProps);
        }
        const onDeleteTag = (e: React.ChangeEvent, index: number): void => {
          handleChange(
            e,
            tagValue.filter((v) => v !== tagValue[index]),
            "removeOption"
          );
        };
        const onGetTagProps: AutocompleteGetTagProps = ({ index }) => {
          const isFixed =
            fixedOptions && fixedOptions.indexOf(tagValue[index]) !== -1;
          return {
            ...getTagProps({ index }),
            onDelete: isFixed ? undefined : (e): void => onDeleteTag(e, index),
          };
        };
        if (renderChips) {
          return renderChips(tagValue, onGetTagProps);
        }
        return tagValue.map((option, index) => {
          const optionLabel = handleGetOptionLabel(option);
          const optionIcon = handleGetOptionIcon(option);
          const optionIconStyle = handleGetOptionIconStyle(option);
          const isFixed = fixedOptions && fixedOptions.indexOf(option) !== -1;
          return (
            <TagChip
              key={option as string}
              icon={
                optionIcon ? (
                  <FontIcon
                    aria-label={optionIcon}
                    color={optionIconStyle?.color}
                    size={18}
                  >
                    <DynamicIcon icon={optionIcon} />
                  </FontIcon>
                ) : undefined
              }
              {...getTagProps({ index })}
              label={optionLabel}
              disabled={isFixed}
              onDelete={
                isFixed ? undefined : (e): void => onDeleteTag(e, index)
              }
            />
          );
        });
      },
      [
        renderTags,
        renderChips,
        handleChange,
        fixedOptions,
        handleGetOptionLabel,
        handleGetOptionIcon,
        handleGetOptionIconStyle,
      ]
    );

    const AutocompleteDialogProps: StringDialogProps = useMemo(
      () => ({
        options: optionsAndActions,
        value: currentValue as string | number,
        forcePopupIcon,
        noOptionsText,
        multiple,
        freeSolo: currentFreeSolo,
        clearOnBlur,
        handleHomeEndKeys,
        listCountLimit,
        InputProps,
        inputValue: inputValueState,
        placeholder: dialogPlaceholder,
        label: dialogLabel,
        searchableThreshold,
        fixedOptions,
        onInputChange: handleInputChange,
        isOptionEqualToValue: handleIsOptionEqualToValue,
        getOptionLabel: handleGetOptionLabel,
        getOptionIcon,
        getOptionIconStyle,
        renderOption: handleRenderOption,
        renderGroup: handleRenderGroup,
        renderTags: handleRenderTags,
        groupBy: handleGroupBy,
        filterOptions: handleFilterOptions,
        onChange: handleChange,
        ...(DialogProps || {}),
      }),
      [
        optionsAndActions,
        currentValue,
        forcePopupIcon,
        noOptionsText,
        multiple,
        currentFreeSolo,
        clearOnBlur,
        handleHomeEndKeys,
        listCountLimit,
        InputProps,
        inputValueState,
        dialogPlaceholder,
        dialogLabel,
        searchableThreshold,
        fixedOptions,
        handleInputChange,
        handleIsOptionEqualToValue,
        handleGetOptionLabel,
        getOptionIcon,
        getOptionIconStyle,
        handleRenderOption,
        handleRenderGroup,
        handleRenderTags,
        handleGroupBy,
        handleFilterOptions,
        handleChange,
        DialogProps,
      ]
    );

    const shrink = mixed
      ? true
      : showFullscreen
      ? Array.isArray(state)
        ? state.length > 0
        : Boolean(getOptionLabel?.(state))
      : InputLabelProps?.shrink;

    const handleRenderInput = useCallback(
      (params: AutocompleteRenderInputParams): React.ReactNode => {
        const inputComponent = renderInput?.(params);
        if (inputComponent) {
          return inputComponent;
        }
        const endAdornmentAreaStyle = {
          marginRight: endAdornmentPosition === "before" ? 56 : undefined,
          marginTop: label && (variant === "filled" || inset) ? -19 : 0,
        };
        const AutocompleteInputProps = {
          ...params.InputProps,
          ...InputProps,
          endAdornment: (
            <StyledEndAdornmentArea style={endAdornmentAreaStyle}>
              {endAdornmentPosition === "before" && InputProps?.endAdornment}
              {endAdornmentPosition === "replace" &&
              InputProps?.endAdornment ? (
                InputProps?.endAdornment
              ) : (
                <StyledClearAndPopupButtonArea>
                  {params.InputProps.endAdornment}
                </StyledClearAndPopupButtonArea>
              )}
              {endAdornmentPosition === "after" && InputProps?.endAdornment}
            </StyledEndAdornmentArea>
          ),
          autoComplete: "off",
        };
        const AutocompleteInputLabelProps = {
          ...params.InputLabelProps,
          ...InputLabelProps,
          shrink,
        };
        return (
          <StringInput
            open={initialOpen}
            id={id}
            autoFocus={autoFocus}
            variant={variant}
            inset={inset}
            inputRef={inputRef}
            size={size}
            backgroundColor={backgroundColor}
            label={label}
            placeholder={currentPlaceholder}
            mixed={mixed}
            required={required}
            characterCountLimit={characterCountLimit}
            error={Boolean(inputError)}
            errorText={inputError}
            showError={showError}
            countText={countText}
            helperText={helperText}
            moreInfoPopup={moreInfoPopup}
            loading={loading}
            debounceInterval={debounceInterval}
            multiline={false}
            disableAutoKeyboard
            onDebouncedChange={onDebouncedInputChange}
            onCloseDialog={handleCloseDialog}
            minRows={minRows}
            maxRows={maxRows}
            {...params}
            DialogComponent={multiple ? TagDialog : AutocompleteDialog}
            DialogProps={AutocompleteDialogProps}
            InputProps={AutocompleteInputProps}
            InputLabelProps={AutocompleteInputLabelProps}
            InputComponent={InputComponent}
            inputProps={{ ...params.inputProps, autocomplete: "off" }}
          />
        );
      },
      [
        renderInput,
        endAdornmentPosition,
        label,
        variant,
        inset,
        InputProps,
        InputLabelProps,
        shrink,
        initialOpen,
        id,
        autoFocus,
        inputRef,
        size,
        backgroundColor,
        currentPlaceholder,
        mixed,
        required,
        characterCountLimit,
        inputError,
        showError,
        countText,
        helperText,
        moreInfoPopup,
        loading,
        debounceInterval,
        onDebouncedInputChange,
        handleCloseDialog,
        minRows,
        maxRows,
        multiple,
        AutocompleteDialogProps,
        InputComponent,
      ]
    );

    return (
      <StyledAutocompleteInput style={style}>
        <StyledAutocomplete
          {...props}
          className={inset ? "inset" : variant}
          options={optionsAndActions}
          value={currentValue}
          inputValue={inputValueState}
          freeSolo={currentFreeSolo}
          PopperComponent={
            PopperComponent !== undefined ? PopperComponent : CustomPopper
          }
          selectOnFocus={
            selectOnFocus !== undefined ? selectOnFocus : !showFullscreen
          }
          disableClearable={showFullscreen ? true : disableClearable}
          open={showFullscreen ? false : currentOpen}
          onOpen={showFullscreen ? undefined : handleOpen}
          onClose={showFullscreen ? undefined : handleClose}
          openOnFocus={!searchable}
          isOptionEqualToValue={handleIsOptionEqualToValue}
          getOptionLabel={handleGetOptionLabel}
          renderOption={handleRenderOption}
          renderGroup={handleRenderGroup}
          renderTags={handleRenderTags}
          renderInput={handleRenderInput}
          onInputChange={handleInputChange}
          groupBy={handleGroupBy}
          filterOptions={handleFilterOptions}
          onChange={handleChange}
          onBlur={handleBlur}
          onHighlightChange={handleHighlightChange}
        />
      </StyledAutocompleteInput>
    );
  }
);

export default AutocompleteInput;
