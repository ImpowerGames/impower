import React, { useCallback, useContext, useMemo, useState } from "react";
import { difference, isColor, isNameable } from "../../../impower-core";
import {
  ContainerReference,
  ContainerType,
  DataLookup,
  FileData,
  GameProjectData,
  isContainerReference,
  isFileReference,
  isInstanceData,
  isItemReference,
  isReference,
  isVariableData,
  ItemReference,
  ItemType,
  Permission,
  Reference,
} from "../../../impower-game/data";
import {
  getAllData,
  getData,
  getDataGroup,
  ImpowerGameInspector,
} from "../../../impower-game/inspector";
import AutocompleteInput from "../../../impower-route/components/inputs/AutocompleteInput";
import ColorMiniPreview from "../../../impower-route/components/inputs/ColorMiniPreview";
import FileMiniPreview from "../../../impower-route/components/inputs/FileMiniPreview";
import { StringInputProps } from "../../../impower-route/components/inputs/StringInput";
import { GameInspectorContext } from "../../contexts/gameInspectorContext";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { getContainerType } from "../../types/selectors/windowSelectors";
import { DataWindowType } from "../../types/state/dataPanelState";

const getOptions = (
  inspector: ImpowerGameInspector,
  project: GameProjectData,
  lookup: DataLookup,
  isUsingConstantValue: boolean,
  constantValue: unknown,
  possibleValues: unknown[],
  permission: Permission
): (Reference | ContainerReference | ItemReference)[] => {
  let kvps = Object.entries(getAllData(permission, project, lookup));
  if (
    isUsingConstantValue &&
    (!isReference(constantValue) || constantValue.refTypeId !== "")
  ) {
    kvps = kvps.filter(([, data]) => {
      if (isVariableData(data)) {
        if (
          (isReference(constantValue) && !constantValue.refTypeId) ||
          (isReference(constantValue) &&
            isReference(data.value) &&
            constantValue.refType === data.value.refType) ||
          (!isReference(constantValue) &&
            typeof constantValue === typeof data.value)
        ) {
          const instanceInspector = inspector.getInspector(data.reference);
          const typePossibleValues =
            instanceInspector.getPropertyOptions("value");
          return (
            difference(typePossibleValues, possibleValues).length === 0 &&
            difference(possibleValues, typePossibleValues).length === 0
          );
        }
        return false;
      }
      return true;
    });
  }
  const options = kvps.map(([id, data]) =>
    isInstanceData(data)
      ? data.reference
      : { ...lookup, refId: id, refTypeId: "" }
  );
  options.unshift({
    ...lookup,
    refType: lookup.refType,
    refTypeId: lookup.refTypeId || "",
    refId: "",
  });
  return options;
};

interface OptionPreviewProps {
  constantValue: unknown;
  option: Reference;
  project: GameProjectData;
  interactable?: boolean;
  style?: React.CSSProperties;
}

const OptionPreview = React.memo((props: OptionPreviewProps) => {
  const { constantValue, option, project, interactable, style } = props;
  if (option) {
    if (isColor(constantValue)) {
      const data = getData(option, project);
      if (isVariableData(data) && isColor(data.value)) {
        return (
          <ColorMiniPreview
            value={data.value}
            interactable={interactable}
            style={style}
          />
        );
      }
    }
    if (isFileReference(option)) {
      if (option) {
        const data = getData(option, project) as FileData;
        return (
          <FileMiniPreview
            value={data}
            interactable={interactable}
            style={style}
          />
        );
      }
    }
  }
  return null;
});

export interface ReferenceInputProps extends StringInputProps {
  value?: Reference;
  constantValue?: unknown;
  possibleValues?: unknown[];
  permission?: Permission;
  endAdornmentPosition?: "before" | "after" | "replace";
  onChange?: (e: React.ChangeEvent, value?: Reference) => void;
  onDebouncedChange?: (value?: Reference) => void;
  onBlur?: (e: React.FocusEvent, value?: Reference) => void;
  getInputError?: (value: unknown) => Promise<string | null>;
}

const ReferenceInput = React.memo(
  (props: ReferenceInputProps): JSX.Element | null => {
    const {
      variant,
      InputComponent,
      size,
      backgroundColor,
      label,
      placeholder,
      tooltip,
      showError,
      disabled,
      required,
      autoFocus,
      value,
      constantValue,
      possibleValues,
      permission,
      mixed,
      characterCountLimit,
      InputProps,
      helperText,
      moreInfoPopup,
      loading,
      endAdornmentPosition = "after",
      debounceInterval = 0,
      onChange,
      onDebouncedChange,
      onBlur,
      onKeyDown,
      getInputError,
    } = props;

    const [state, setState] = useState(value);

    const { gameInspector } = useContext(GameInspectorContext);
    const [gameEngineState] = useContext(ProjectEngineContext);
    const project = gameEngineState.present.project.data as GameProjectData;
    const windowType = gameEngineState.present.window
      .type as unknown as DataWindowType;
    const containerType = useMemo(
      () => getContainerType(windowType),
      [windowType]
    );
    const inspectedContainerReference = useMemo(
      () =>
        containerType
          ? gameEngineState.present.dataPanel.panels[windowType].Container
              .interactions.Selected[0]
          : undefined,
      [containerType, gameEngineState.present.dataPanel.panels, windowType]
    ) as Reference;

    const isUsingConstantValue =
      isReference(state) &&
      isReference(constantValue) &&
      state.refType !== ItemType.Variable;

    const lookup = useMemo(
      () =>
        inspectedContainerReference
          ? isUsingConstantValue
            ? ({
                parentContainerType:
                  inspectedContainerReference.parentContainerType as ContainerType,
                parentContainerId:
                  inspectedContainerReference.parentContainerId,
                refType: state.refType,
                refTypeId: state.refTypeId,
              } as DataLookup)
            : ({
                parentContainerType:
                  inspectedContainerReference.refType as ContainerType,
                parentContainerId: inspectedContainerReference.refId,
                refType: state.refType,
                refTypeId: state.refTypeId,
              } as DataLookup)
          : ({
              refType: state.refType,
              refTypeId: state.refTypeId,
            } as DataLookup),
      [inspectedContainerReference, isUsingConstantValue, state]
    );

    const options: (Reference | ContainerReference | ItemReference)[] = useMemo(
      () =>
        getOptions(
          gameInspector,
          project,
          lookup,
          isUsingConstantValue,
          constantValue,
          possibleValues,
          permission
        ),
      [
        project,
        lookup,
        isUsingConstantValue,
        constantValue,
        possibleValues,
        gameInspector,
        permission,
      ]
    );

    const getValidValue = useCallback(
      (newValue: unknown): unknown => {
        if (!isReference(newValue)) {
          return options[0];
        }
        return newValue;
      },
      [options]
    );

    const isOptionEqualToValue = (option: unknown, other: unknown): boolean => {
      if (isReference(option) && isReference(other)) {
        return option.refId === other.refId;
      }
      return false;
    };

    const getOptionLabel = (option: unknown): string => {
      if (option) {
        let data = null;
        if (
          isItemReference(option) &&
          option.parentContainerId &&
          option.refId
        ) {
          data = getData(option, project);
        } else if (
          isContainerReference(option) &&
          option.parentContainerId &&
          option.refId
        ) {
          data = getData(option, project);
        } else if (isReference(option) && option.refId) {
          data = getData(option, project);
        }
        if (data) {
          if (isNameable(data)) {
            return `${data.name}`;
          }
          if (data.reference) {
            return `${gameInspector
              .getInspector(data.reference)
              .getName(data)}`;
          }
          if (data.fileName) {
            return `${data.fileName}`;
          }
        }
      }
      return "";
    };

    const handleGetOptionGroup = (option: unknown): string => {
      if (lookup && option) {
        if (isReference(option) && option.refId) {
          return getDataGroup(project, option, lookup.parentContainerId);
        }
      }
      return "";
    };

    const handleChange = useCallback(
      (e: React.ChangeEvent, newValue: Reference): void => {
        setState(newValue);
        if (isReference(newValue)) {
          if (onChange) {
            onChange(e, newValue);
          }
        }
      },
      [onChange]
    );

    const handleDebouncedChange = useCallback(
      (newValue: unknown): void => {
        if (isReference(newValue)) {
          if (onDebouncedChange) {
            onDebouncedChange(newValue);
          }
        }
      },
      [onDebouncedChange]
    );

    const handleBlur = useCallback(
      (e: React.FocusEvent, newValue: unknown): void => {
        if (isReference(newValue)) {
          if (onDebouncedChange) {
            onDebouncedChange(newValue);
          }
          if (onBlur) {
            onBlur(e, newValue);
          }
        }
      },
      [onDebouncedChange, onBlur]
    );

    const renderOptionIcon = useCallback(
      (option: unknown): React.ReactNode => {
        if (isReference(option)) {
          return (
            <OptionPreview
              option={option}
              constantValue={constantValue}
              project={project}
            />
          );
        }
        return null;
      },
      [constantValue, project]
    );

    const ReferenceInputProps = useMemo(
      () => ({
        endAdornment:
          isReference(state) && state.refId ? (
            <>
              {endAdornmentPosition === "before" && InputProps?.endAdornment}
              {endAdornmentPosition === "replace" &&
              InputProps?.endAdornment ? (
                InputProps?.endAdornment
              ) : (
                <OptionPreview
                  option={state}
                  constantValue={constantValue}
                  project={project}
                  interactable
                />
              )}
              {endAdornmentPosition === "after" && InputProps?.endAdornment}
            </>
          ) : (
            InputProps?.endAdornment
          ),
      }),
      [
        InputProps?.endAdornment,
        constantValue,
        endAdornmentPosition,
        project,
        state,
      ]
    );

    return (
      <AutocompleteInput
        variant={variant}
        InputComponent={InputComponent}
        size={size}
        backgroundColor={backgroundColor}
        label={label}
        placeholder={placeholder}
        tooltip={tooltip}
        showError={showError}
        disabled={disabled}
        autoFocus={autoFocus}
        options={options}
        value={value}
        mixed={mixed}
        required={required}
        characterCountLimit={characterCountLimit}
        InputProps={ReferenceInputProps}
        helperText={helperText}
        moreInfoPopup={moreInfoPopup}
        loading={loading}
        debounceInterval={debounceInterval}
        endAdornmentPosition={endAdornmentPosition}
        getValidValue={getValidValue}
        isOptionEqualToValue={isOptionEqualToValue}
        getOptionLabel={getOptionLabel}
        getOptionGroup={handleGetOptionGroup}
        renderOptionIcon={renderOptionIcon}
        onChange={handleChange}
        onDebouncedChange={handleDebouncedChange}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
        getInputError={getInputError}
      />
    );
  }
);

export default ReferenceInput;
