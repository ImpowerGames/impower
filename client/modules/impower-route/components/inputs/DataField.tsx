/* eslint-disable @typescript-eslint/no-use-before-define */

import { useTheme } from "@emotion/react";
import {
  AutocompleteGetTagProps,
  FilterOptionsState,
  InputBaseComponentProps,
  InputBaseProps,
  InputLabelProps,
  InputProps,
  TextFieldProps,
} from "@material-ui/core";
import dynamic from "next/dynamic";
import React, { useCallback, useMemo } from "react";
import { getLabel } from "../../../impower-config";
import format from "../../../impower-config/utils/format";
import {
  getDataDisplayValue,
  getUnitSymbolFromType,
  getUnitTypeFromSymbol,
  getValue,
  Inspector,
  isCollection,
  isColor,
  isPropertyVisible,
  isStorageFile,
  isUnitNumberData,
  removeDuplicates,
} from "../../../impower-core";
import { useDialogNavigation } from "../../../impower-dialog";
import { AutocompleteInputProps } from "./AutocompleteInput";
import { BooleanInputProps } from "./BooleanInput";
import { ColorInputProps } from "./ColorInput";
import { FileInputProps } from "./FileInput";
import { NumberInputProps } from "./NumberInput";
import { ObjectFieldProps } from "./ObjectField";
import { RadioInputProps } from "./RadioInput";
import { StringDialogProps } from "./StringDialog";
import { StringInputProps } from "./StringInput";
import ValueFieldArea from "./ValueFieldArea";

const markdownHelpCaption = `First Level Header
==================

Second Level Header
-------------------
    
One asterisk for *italic* text.

Two asterisks for **bold** text.

Three asterisks for ***italic and bold*** text.

Two tildas for ~~strikethrough~~ text.

Dashes for lists:

- First item
- Second item
- Third item
  - Nested item

[A Link](https://impower.app)
    
![An Image](https://impower.app/logo.png)
  
Blank line followed by dashes for a line separator:

------------------------------

\`\`\` 
Backticks for code blocks 
\`\`\`

Dashes and pipes for tables:

First Header  | Second Header
------------- | -------------
Content Cell  | Content Cell
Content Cell  | Content Cell

> Angle brackets for block quotes`;

const FieldDrawerMenu = dynamic(() => import("./FieldDrawerMenu"), {
  ssr: false,
});

export interface InheritedProps {
  data: Record<string, unknown>[];
  variant?: "filled" | "outlined" | "standard";
  inset?: boolean;
  size?: "small" | "medium";
  backgroundColor?: string;
  showError?: boolean;
  required?: boolean;
  disabled?: boolean;
  expandedProperties?: string[];
  spacing?: number;
  DialogProps?: Partial<StringDialogProps>;
  InputComponent?: React.ComponentType<InputProps>;
  AutocompleteInputComponent?: React.ComponentType<AutocompleteInputProps>;
  ColorInputComponent?: React.ComponentType<ColorInputProps>;
  FileInputComponent?: React.ComponentType<FileInputProps>;
  NumberInputComponent?: React.ComponentType<NumberInputProps>;
  RadioInputComponent?: React.ComponentType<RadioInputProps>;
  StringInputComponent?: React.ComponentType<StringInputProps>;
  BooleanInputComponent?: React.ComponentType<BooleanInputProps>;
  ObjectFieldComponent?: React.ComponentType<ObjectFieldProps>;
  getDocIds?: (propertyPath: string, data: Record<string, unknown>) => string[];
  onPropertyChange?: (propertyPath: string, value: unknown) => void;
  onDebouncedPropertyChange?: (propertyPath: string, value: unknown) => void;
  onPropertyBlur?: (propertyPath: string, value: unknown) => void;
  onPropertyKeyDown?: (e: React.KeyboardEvent, propertyPath: string) => void;
  onExpandProperty?: (propertyPath: string, expanded: boolean) => void;
  onClickMenuItem?: (
    e: React.MouseEvent,
    type: string,
    propertyPath: string,
    data: Record<string, unknown>
  ) => void;
  onPropertyErrorFound?: (propertyPath: string, error: string) => void;
  onPropertyErrorFixed?: (propertyPath: string) => void;

  getFormattedSummary?: (
    summary: string,
    data: Record<string, unknown>
  ) => string;
  getInspector?: (data: Record<string, unknown>) => Inspector;
  setValueId?: (value: unknown, id: string) => unknown;
}

export interface RenderPropertyProps extends InheritedProps {
  propertyPath: string;
  indent?: number;
  indentAmount?: number;
  collapsible?: boolean;
  moreIcon?: string;
  moreTooltip?: string;
  moreIconSize?: string;
  label?: string;
  placeholder?: string;
  tooltip?: string;
  autoFocus?: boolean;
  markdown?: boolean;
  multiline?: boolean;
  type?: string;
  displayValueInverted?: boolean;
  minRows?: number;
  maxRows?: number;
  options?: unknown[];
  valueBounds?: {
    min?: number;
    max?: number;
    step?: number | null;
    marks?: { value: number; label: string }[];
    force?: boolean;
    disableArbitraryInput?: boolean;
  };
  textTransform?: "uppercase" | "lowercase";
  disableListReordering?: boolean;
  disableListChanges?: boolean;
  listCountLimit?: number;
  characterCountLimit?: number;
  showCharacterCounter?: boolean;
  debounceInterval?: number;
  DialogTextFieldProps?: Partial<TextFieldProps>;
  DialogInputProps?: Partial<InputBaseProps>;
  InputLabelProps?: InputLabelProps;
  InputProps?: InputProps;
  inputProps?: InputBaseComponentProps;
  defaultValue?: unknown;
  helperText?: React.ReactNode;
  moreInfoPopup?: {
    icon?: string;
    title?: string;
    description?: string;
    caption?: string;
    alignment?: "flex-start" | "center" | "flex-end";
  };
  loading?: boolean;
  error?: boolean;
  errorText?: string;
  endAdornmentPosition?: "replace" | "before" | "after";
  disallowExternalFiles?: boolean;
  blob?: globalThis.File;
  renderOptionIcon?: (option: unknown, icon: string) => React.ReactNode;
  renderChips?: (
    value: unknown[],
    getTagProps: AutocompleteGetTagProps
  ) => React.ReactNode;
  getInputError?: (
    propertyPath: string,
    data: Record<string, unknown>,
    value: unknown,
    docIds: string[]
  ) => Promise<string | null>;
  onMore?: (id: string, target: HTMLElement) => void;
  getDisplayValue?: (value: unknown) => string;
  getValueDescription?: (value: unknown) => string;
  getValueIcon?: (value: unknown) => string;
  getValueIconStyle?: (value: unknown) => {
    color?: string;
    fontSize?: string | number;
  };
  getValueGroup?: (value: unknown) => string;
  filterOptions?: (
    options: unknown[],
    state: FilterOptionsState<unknown>
  ) => unknown[];
}

interface DataFieldAreaProps extends RenderPropertyProps {
  renderProperty?: (props: RenderPropertyProps) => React.ReactNode;
  renderPropertyProps?: Record<string, unknown>;
}

const DataFieldArea = React.memo(
  (props: DataFieldAreaProps): JSX.Element | null => {
    const {
      variant,
      inset,
      size,
      backgroundColor,
      data,
      propertyPath,
      indent,
      indentAmount,
      moreIcon = "ellipsis-v",
      moreTooltip = "More Options",
      moreIconSize,
      label = getLabel?.(propertyPath),
      placeholder,
      tooltip,
      showError,
      error,
      errorText,
      required,
      disabled,
      autoFocus,
      markdown,
      multiline,
      type,
      displayValueInverted,
      minRows = 3,
      maxRows = 10,
      options,
      valueBounds,
      textTransform,
      listCountLimit = 100,
      characterCountLimit = 100,
      showCharacterCounter,
      helperText,
      moreInfoPopup,
      loading,
      debounceInterval = 200,
      spacing,
      DialogProps,
      DialogTextFieldProps,
      DialogInputProps,
      InputLabelProps,
      InputProps,
      inputProps,
      defaultValue,
      endAdornmentPosition,
      disallowExternalFiles,
      blob,
      InputComponent,
      AutocompleteInputComponent,
      ColorInputComponent,
      FileInputComponent,
      NumberInputComponent,
      RadioInputComponent,
      StringInputComponent,
      BooleanInputComponent,
      ObjectFieldComponent,
      renderOptionIcon,
      renderChips,
      onMore,
      onPropertyChange,
      onDebouncedPropertyChange,
      onPropertyBlur,
      onPropertyKeyDown,
      onPropertyErrorFound,
      onPropertyErrorFixed,
      getDocIds,
      getInputError,
      getDisplayValue,
      getValueDescription,
      getValueIcon,
      getValueIconStyle,
      getValueGroup,
      filterOptions,
      renderProperty,
      renderPropertyProps,
    } = props;

    const paddingLeft = indent * indentAmount;
    const inspectedData = data[0];
    const propertyValue = getValue(inspectedData, propertyPath);

    const mixed = useMemo(
      () =>
        removeDuplicates(
          data.map((d) => JSON.stringify(getValue(d, propertyPath)))
        ).length > 1,
      [data, propertyPath]
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent, value: unknown) => {
        if (onPropertyChange) {
          onPropertyChange(propertyPath, value);
        }
      },
      [onPropertyChange, propertyPath]
    );

    const handleDebouncedChange = useCallback(
      (value: unknown) => {
        if (onDebouncedPropertyChange) {
          onDebouncedPropertyChange(propertyPath, value);
        }
      },
      [onDebouncedPropertyChange, propertyPath]
    );

    const handleBlur = useCallback(
      (e: React.FocusEvent, value: unknown) => {
        if (onPropertyBlur) {
          onPropertyBlur(propertyPath, value);
        }
      },
      [onPropertyBlur, propertyPath]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (onPropertyKeyDown) {
          onPropertyKeyDown(e, propertyPath);
        }
      },
      [onPropertyKeyDown, propertyPath]
    );

    const handleValueChange = useCallback(
      (e: React.ChangeEvent, value: unknown) => {
        if (onPropertyChange) {
          onPropertyChange(`${propertyPath}.value`, value);
        }
      },
      [onPropertyChange, propertyPath]
    );

    const handleDebouncedValueChange = useCallback(
      (value: unknown) => {
        if (onDebouncedPropertyChange) {
          onDebouncedPropertyChange(`${propertyPath}.value`, value);
        }
      },
      [onDebouncedPropertyChange, propertyPath]
    );

    const handleGetInputError = useCallback(
      async (value: unknown): Promise<string | null> =>
        getInputError
          ? getInputError(
              propertyPath,
              inspectedData,
              value,
              getDocIds ? getDocIds(propertyPath, inspectedData) : []
            )
          : null,
      [getDocIds, getInputError, inspectedData, propertyPath]
    );

    const handleErrorFound = useCallback(
      (error: string): void => {
        if (onPropertyErrorFound) {
          onPropertyErrorFound(propertyPath, error);
        }
      },
      [onPropertyErrorFound, propertyPath]
    );

    const handleErrorFixed = useCallback((): void => {
      if (onPropertyErrorFixed) {
        onPropertyErrorFixed(propertyPath);
      }
    }, [onPropertyErrorFixed, propertyPath]);

    const fieldProps = {
      id: propertyPath,
      variant,
      inset,
      InputComponent,
      size,
      backgroundColor,
      label,
      placeholder,
      tooltip,
      showError,
      error,
      errorText,
      disabled,
      required,
      autoFocus,
      markdown,
      multiline,
      type,
      minRows,
      maxRows,
      mixed,
      characterCountLimit,
      showCharacterCounter,
      textTransform,
      DialogProps,
      DialogTextFieldProps,
      DialogInputProps,
      InputLabelProps,
      InputProps,
      inputProps,
      defaultValue,
      helperText,
      moreInfoPopup,
      loading,
      debounceInterval,
      value: propertyValue,
      getInputError: handleGetInputError,
      onErrorFound: handleErrorFound,
      onErrorFixed: handleErrorFixed,
      onChange: handleChange,
      onDebouncedChange: handleDebouncedChange,
      onBlur: handleBlur,
      onKeyDown: handleKeyDown,
    };

    const optionFieldProps = {
      ...fieldProps,
      options,
      endAdornmentPosition,
      listCountLimit,
      getOptionLabel: getDisplayValue,
      getOptionDescription: getValueDescription,
      getOptionIcon: getValueIcon,
      getOptionIconStyle: getValueIconStyle,
      getOptionGroup: getValueGroup,
      filterOptions,
    };

    const valueFieldAreaProps = {
      propertyPath,
      moreIcon,
      moreTooltip,
      moreIconSize,
      spacing,
      onMore,
      style: { paddingLeft },
    };

    const customField = renderProperty?.({ ...props, ...renderPropertyProps });

    if (customField) {
      return <>{customField}</>;
    }

    if (propertyValue === undefined || propertyValue === null) {
      return null;
    }

    if (Array.isArray(propertyValue)) {
      const handleListChange = (newValue: string | string[]): void => {
        if (Array.isArray(newValue)) {
          if (onPropertyChange) {
            onPropertyChange(propertyPath, newValue);
          }
          if (onDebouncedPropertyChange) {
            onDebouncedPropertyChange(propertyPath, newValue);
          }
        } else {
          if (onPropertyChange) {
            onPropertyChange(propertyPath, []);
          }
          if (onDebouncedPropertyChange) {
            onDebouncedPropertyChange(propertyPath, []);
          }
        }
      };
      return (
        <ValueFieldArea {...valueFieldAreaProps}>
          <AutocompleteInputComponent
            {...optionFieldProps}
            multiple={true}
            freeSolo={true}
            renderOptionIcon={renderOptionIcon}
            renderChips={renderChips}
            onDebouncedChange={handleListChange}
          />
        </ValueFieldArea>
      );
    }

    if (
      isColor(propertyValue) ||
      (typeof propertyValue === "string" && type === "color")
    ) {
      return (
        <ValueFieldArea {...valueFieldAreaProps}>
          <ColorInputComponent
            {...fieldProps}
            value={propertyValue}
            endAdornmentPosition={endAdornmentPosition}
          />
        </ValueFieldArea>
      );
    }

    if (isStorageFile(propertyValue)) {
      return (
        <ValueFieldArea {...valueFieldAreaProps}>
          <FileInputComponent
            {...fieldProps}
            id={propertyPath}
            value={propertyValue}
            endAdornmentPosition={endAdornmentPosition}
            disallowExternalFiles={disallowExternalFiles}
            blob={blob}
          />
        </ValueFieldArea>
      );
    }

    if (isUnitNumberData(propertyValue)) {
      return (
        <ValueFieldArea {...valueFieldAreaProps}>
          <NumberInputComponent
            {...fieldProps}
            value={propertyValue.value}
            valueBounds={valueBounds}
            endAdornmentPosition={endAdornmentPosition}
            getDisplayValue={getDisplayValue}
            unit={getUnitSymbolFromType(propertyValue.unit)}
            possibleUnits={[
              getUnitSymbolFromType("Pixels"),
              getUnitSymbolFromType("Percentage"),
            ]}
            onChange={handleValueChange}
            onDebouncedChange={handleDebouncedValueChange}
            onChangeUnit={(value): void => {
              if (onDebouncedPropertyChange) {
                onDebouncedPropertyChange(
                  `${propertyPath}.unit`,
                  getUnitTypeFromSymbol(value)
                );
              }
            }}
          />
        </ValueFieldArea>
      );
    }

    if (typeof propertyValue === "boolean") {
      return (
        <ValueFieldArea {...valueFieldAreaProps}>
          <BooleanInputComponent
            {...fieldProps}
            value={propertyValue}
            displayValueInverted={displayValueInverted}
          />
        </ValueFieldArea>
      );
    }

    if (options?.length > 0 && type === "radio") {
      return (
        <ValueFieldArea {...valueFieldAreaProps}>
          <RadioInputComponent {...optionFieldProps} type={type} />
        </ValueFieldArea>
      );
    }

    if (options?.length > 0) {
      return (
        <ValueFieldArea {...valueFieldAreaProps}>
          <AutocompleteInputComponent
            {...optionFieldProps}
            InputLabelProps={{ shrink: true }}
            disableClearable={true}
          />
        </ValueFieldArea>
      );
    }

    if (typeof propertyValue === "number") {
      return (
        <ValueFieldArea {...valueFieldAreaProps}>
          <NumberInputComponent
            {...fieldProps}
            value={propertyValue}
            valueBounds={valueBounds}
            endAdornmentPosition={endAdornmentPosition}
            getDisplayValue={getDisplayValue}
          />
        </ValueFieldArea>
      );
    }

    if (typeof propertyValue === "string") {
      return (
        <ValueFieldArea
          {...valueFieldAreaProps}
          style={{
            ...valueFieldAreaProps?.style,
            overflow: "hidden",
          }}
        >
          <StringInputComponent {...fieldProps} />
        </ValueFieldArea>
      );
    }

    return <ObjectFieldComponent {...props} />;
  }
);

interface DataFieldProps extends RenderPropertyProps {
  renderProperty?: (props: RenderPropertyProps) => React.ReactNode;
  renderPropertyProps?: Record<string, unknown>;
}

const DataField = React.memo((props: DataFieldProps): JSX.Element | null => {
  const theme = useTheme();
  const { propertyPath, data, getInspector, getDocIds } = props;
  const inspectedData = data[0];
  const inspector = getInspector?.(inspectedData);
  const propertyDocIds = getDocIds
    ? getDocIds(propertyPath, inspectedData)
    : [];
  const {
    label = inspector?.getPropertyLabel?.(propertyPath, inspectedData),
    placeholder = inspector?.getPropertyPlaceholder?.(
      propertyPath,
      inspectedData
    ),
    tooltip = inspector?.getPropertyTooltip?.(propertyPath, inspectedData),
    autoFocus = inspector?.isPropertyAutoFocused?.(propertyPath, inspectedData),
    collapsible = inspector?.isPropertyCollapsible?.(
      propertyPath,
      inspectedData
    ),
    required = inspector?.isPropertyRequired?.(propertyPath, inspectedData),
    disabled = inspector?.isPropertyDisabled?.(
      propertyPath,
      inspectedData,
      propertyDocIds
    ),
    markdown = inspector?.isPropertyMarkdown?.(propertyPath, inspectedData),
    multiline = inspector?.isPropertyMultiline?.(propertyPath, inspectedData),
    type = inspector?.getPropertyInputType?.(propertyPath, inspectedData),
    displayValueInverted = inspector?.isPropertyDisplayValueInverted?.(
      propertyPath,
      inspectedData
    ),
    minRows = inspector?.getPropertyMinRowCount?.(propertyPath, inspectedData),
    maxRows = inspector?.getPropertyMaxRowCount?.(propertyPath, inspectedData),
    disableListReordering = inspector?.isListReorderingDisabled?.(
      propertyPath,
      inspectedData
    ),
    disableListChanges = inspector?.isListChangesDisabled?.(
      propertyPath,
      inspectedData
    ),
    listCountLimit = inspector?.getPropertyListCountLimit?.(
      propertyPath,
      inspectedData
    ),
    characterCountLimit = inspector?.getPropertyCharacterCountLimit?.(
      propertyPath,
      inspectedData
    ),
    showCharacterCounter = inspector?.isPropertyCharacterCounterVisible?.(
      propertyPath,
      inspectedData
    ),
    helperText = inspector?.getPropertyHelperText?.(
      propertyPath,
      inspectedData
    ),
    textTransform = inspector?.getPropertyTextTransform?.(
      propertyPath,
      inspectedData
    ),
    disallowExternalFiles = !inspector?.isExternalFileAllowed?.(
      propertyPath,
      inspectedData
    ),
    debounceInterval = inspector?.getPropertyDebounceInterval?.(
      propertyPath,
      inspectedData
    ),
    variant,
    InputComponent,
    AutocompleteInputComponent,
    ColorInputComponent,
    FileInputComponent,
    NumberInputComponent,
    RadioInputComponent,
    StringInputComponent,
    BooleanInputComponent,
    ObjectFieldComponent,
    size,
    backgroundColor,
    showError,
    error,
    errorText,
    moreIcon,
    moreTooltip,
    moreIconSize,
    options,
    indent = 0,
    indentAmount = 32,
    expandedProperties,
    spacing,
    moreInfoPopup,
    loading,
    valueBounds,
    DialogProps,
    DialogTextFieldProps,
    DialogInputProps,
    InputLabelProps,
    InputProps,
    inputProps,
    defaultValue,
    endAdornmentPosition,
    blob,
    renderOptionIcon,
    renderChips,
    onMore,
    onClickMenuItem,
    onPropertyChange,
    onDebouncedPropertyChange,
    onPropertyBlur,
    onPropertyKeyDown,
    onExpandProperty,
    getInputError,
    getFormattedSummary = format,
    setValueId,
    onPropertyErrorFound,
    onPropertyErrorFixed,
    getDisplayValue,
    getValueDescription,
    getValueIcon,
    getValueIconStyle,
    getValueGroup,
    filterOptions,
    renderProperty,
    renderPropertyProps,
  } = props;

  const queryKey = `options-${propertyPath}`;

  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = React.useState<boolean>();

  const propertyIndent =
    indent + (inspector?.getPropertyIndent?.(propertyPath, inspectedData) || 0);
  const propertyMoreInfoPopup = useMemo((): {
    icon?: string;
    title?: string;
    description?: string;
    caption?: string;
    alignment?: "flex-start" | "center" | "flex-end";
  } => {
    if (moreInfoPopup !== undefined) {
      return moreInfoPopup;
    }
    const popup = inspector?.getPropertyMoreInfoPopup?.(
      propertyPath,
      inspectedData
    );
    if (popup !== undefined) {
      return popup;
    }
    if (markdown) {
      return {
        icon: "paragraph",
        title: "Formatting",
        description: `You can format your text using markdown:`,
        caption: markdownHelpCaption,
      };
    }
    return undefined;
  }, [inspectedData, inspector, markdown, moreInfoPopup, propertyPath]);
  const propertyValueBounds = useMemo(
    () =>
      valueBounds !== undefined
        ? valueBounds
        : inspector?.getPropertyBounds?.(propertyPath, inspectedData),
    [inspectedData, inspector, propertyPath, valueBounds]
  );
  const propertyOptions = useMemo(
    () =>
      options !== undefined
        ? options
        : inspector?.getPropertyOptions?.(propertyPath, inspectedData),
    [inspectedData, inspector, options, propertyPath]
  );
  const propertyGetInputError = useCallback(
    async (
      propertyPath: string,
      data: Record<string, unknown>,
      value: unknown,
      docIds: string[]
    ) => {
      if (getInputError !== undefined) {
        return getInputError(propertyPath, data, value, docIds);
      }
      const error = await inspector?.getPropertyError?.(
        propertyPath,
        data,
        value,
        docIds
      );
      if (error !== null) {
        return error;
      }
      if (required) {
        if (Array.isArray(value)) {
          if (value.length === 0) {
            return `Select at least one`;
          }
        }
        if (isCollection(value)) {
          if (Object.keys(value.data).length === 0) {
            return `Select at least one`;
          }
        }
        if (!value) {
          return `${label} is required`;
        }
      }
      return undefined;
    },
    [getInputError, inspector, label, required]
  );
  const propertyGetDisplayValue = useCallback(
    (value: unknown): string => {
      if (getDisplayValue) {
        return getDisplayValue(value);
      }
      const displayValue = inspector?.getPropertyDisplayValue?.(
        propertyPath,
        inspectedData,
        value
      );
      if (displayValue !== undefined) {
        return displayValue;
      }
      return getDataDisplayValue(value);
    },
    [getDisplayValue, inspectedData, inspector, propertyPath]
  );
  const propertyGetValueDescription = useCallback(
    (value: unknown): string => {
      if (getValueDescription) {
        return getValueDescription(value);
      }
      const description = inspector?.getPropertyValueDescription?.(
        propertyPath,
        inspectedData,
        value
      );
      if (description) {
        if (getFormattedSummary) {
          return getFormattedSummary(description, inspectedData);
        }
      }
      return description;
    },
    [
      getFormattedSummary,
      getValueDescription,
      inspectedData,
      inspector,
      propertyPath,
    ]
  );
  const propertyGetValueIcon = useCallback(
    (value: unknown): string => {
      if (getValueIcon) {
        return getValueIcon(value);
      }
      return inspector?.getPropertyValueIcon?.(
        propertyPath,
        inspectedData,
        value
      );
    },
    [getValueIcon, inspectedData, inspector, propertyPath]
  );
  const propertyGetValueIconStyle = useCallback(
    (value: unknown): { color?: string; fontSize?: string | number } => {
      if (getValueIconStyle) {
        return getValueIconStyle(value);
      }
      return inspector?.getPropertyValueIconStyle?.(
        propertyPath,
        inspectedData,
        value
      );
    },
    [getValueIconStyle, inspectedData, inspector, propertyPath]
  );
  const propertyGetValueGroup = useCallback(
    (value: unknown): string => {
      if (getValueGroup) {
        return getValueGroup(value);
      }
      return inspector?.getPropertyValueGroup?.(
        propertyPath,
        inspectedData,
        value
      );
    },
    [getValueGroup, inspectedData, inspector, propertyPath]
  );

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.m !== prevState?.m) {
        setMenuOpen(currState?.m === queryKey);
      }
    },
    [queryKey]
  );
  const [openMenuDialog, closeMenuDialog] = useDialogNavigation(
    "m",
    handleBrowserNavigation
  );

  const handleOpenMenu = useCallback(
    (id: string, target: HTMLElement) => {
      setMenuAnchor(target);
      setMenuOpen(true);
      openMenuDialog(queryKey);
    },
    [openMenuDialog, queryKey]
  );
  const handleCloseMenu = useCallback(() => {
    setMenuAnchor(null);
    setMenuOpen(false);
    closeMenuDialog();
  }, [closeMenuDialog]);

  const propertyMenuItems: { [type: string]: string } =
    inspector?.getPropertyMenuItems?.(propertyPath, inspectedData);
  const menuItemTypes = Object.keys(propertyMenuItems || []);

  const propertyMoreIcon =
    moreIcon !== undefined
      ? moreIcon
      : menuItemTypes.length > 0
      ? inspector?.getPropertyMoreIcon?.(propertyPath, inspectedData)
      : undefined;
  const propertyMoreTooltip =
    moreTooltip !== undefined
      ? moreTooltip
      : menuItemTypes.length > 0
      ? inspector?.getPropertyMoreTooltip?.(propertyPath, inspectedData)
      : undefined;
  const propertyMoreIconSize =
    moreIconSize !== undefined
      ? moreIconSize
      : menuItemTypes.length > 0
      ? theme.fontSize.moreIcon
      : undefined;

  const propertyVisible = inspector?.isPropertyVisible?.(
    propertyPath,
    inspectedData
  );

  const isFieldVisible =
    propertyVisible !== undefined
      ? propertyVisible
      : isPropertyVisible
      ? isPropertyVisible(propertyPath, inspectedData)
      : true;

  if (!isFieldVisible) {
    return null;
  }

  return (
    <>
      <DataFieldArea
        helperText={helperText}
        collapsible={collapsible}
        label={label}
        placeholder={placeholder}
        tooltip={tooltip}
        disabled={disabled}
        autoFocus={autoFocus}
        markdown={markdown}
        multiline={multiline}
        type={type}
        displayValueInverted={displayValueInverted}
        minRows={minRows}
        maxRows={maxRows}
        required={required}
        textTransform={textTransform}
        disableListReordering={disableListReordering}
        disableListChanges={disableListChanges}
        listCountLimit={listCountLimit}
        characterCountLimit={characterCountLimit}
        showCharacterCounter={showCharacterCounter}
        disallowExternalFiles={disallowExternalFiles}
        debounceInterval={debounceInterval}
        indent={propertyIndent}
        moreIcon={propertyMoreIcon}
        moreTooltip={propertyMoreTooltip}
        moreIconSize={propertyMoreIconSize}
        options={propertyOptions}
        valueBounds={propertyValueBounds}
        data={data}
        showError={showError}
        error={error}
        errorText={errorText}
        variant={variant}
        InputComponent={InputComponent}
        AutocompleteInputComponent={AutocompleteInputComponent}
        ColorInputComponent={ColorInputComponent}
        FileInputComponent={FileInputComponent}
        NumberInputComponent={NumberInputComponent}
        RadioInputComponent={RadioInputComponent}
        StringInputComponent={StringInputComponent}
        BooleanInputComponent={BooleanInputComponent}
        ObjectFieldComponent={ObjectFieldComponent}
        size={size}
        spacing={spacing}
        backgroundColor={backgroundColor}
        indentAmount={indentAmount}
        DialogProps={DialogProps}
        DialogTextFieldProps={DialogTextFieldProps}
        DialogInputProps={DialogInputProps}
        InputLabelProps={InputLabelProps}
        InputProps={InputProps}
        inputProps={inputProps}
        defaultValue={defaultValue}
        moreInfoPopup={propertyMoreInfoPopup}
        loading={loading}
        renderOptionIcon={renderOptionIcon}
        renderChips={renderChips}
        expandedProperties={expandedProperties}
        endAdornmentPosition={endAdornmentPosition}
        propertyPath={propertyPath}
        blob={blob}
        getDisplayValue={propertyGetDisplayValue}
        getValueDescription={propertyGetValueDescription}
        getValueIcon={propertyGetValueIcon}
        getValueIconStyle={propertyGetValueIconStyle}
        getValueGroup={propertyGetValueGroup}
        filterOptions={filterOptions}
        getInputError={propertyGetInputError}
        onMore={propertyMenuItems ? onMore || handleOpenMenu : undefined}
        onPropertyChange={onPropertyChange}
        onDebouncedPropertyChange={onDebouncedPropertyChange}
        onPropertyBlur={onPropertyBlur}
        onPropertyKeyDown={onPropertyKeyDown}
        onClickMenuItem={onClickMenuItem}
        onExpandProperty={onExpandProperty}
        getDocIds={getDocIds}
        getFormattedSummary={getFormattedSummary}
        getInspector={getInspector}
        onPropertyErrorFound={onPropertyErrorFound}
        onPropertyErrorFixed={onPropertyErrorFixed}
        setValueId={setValueId}
        renderProperty={renderProperty}
        renderPropertyProps={renderPropertyProps}
      />
      {menuOpen !== undefined && (
        <FieldDrawerMenu
          anchorEl={menuAnchor}
          open={menuOpen}
          onClose={handleCloseMenu}
          propertyPath={propertyPath}
          inspectedData={inspectedData}
          items={propertyMenuItems}
          onClickMenuItem={onClickMenuItem}
        />
      )}
    </>
  );
});

export default DataField;
