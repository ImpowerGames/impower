import FilledInput from "@material-ui/core/FilledInput";
import React, {
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
} from "react";
import {
  getValue,
  removeDuplicates,
  validatePropertyPath,
} from "../../../impower-core";
import {
  DynamicData,
  GameProjectData,
  InstanceData,
  isDynamicData,
  isInstanceData,
  isReference,
  Reference,
  VariableReference,
} from "../../../impower-game/data";
import { InstanceInspector } from "../../../impower-game/inspector";
import InspectorForm, {
  InspectorFormProps,
} from "../../../impower-route/components/forms/InspectorForm";
import AutocompleteInput from "../../../impower-route/components/inputs/AutocompleteInput";
import BooleanInput from "../../../impower-route/components/inputs/BooleanInput";
import ColorInput from "../../../impower-route/components/inputs/ColorInput";
import DataField, {
  RenderPropertyProps,
} from "../../../impower-route/components/inputs/DataField";
import FileInput from "../../../impower-route/components/inputs/FileInput";
import NumberInput from "../../../impower-route/components/inputs/NumberInput";
import ObjectField, {
  getInheritedProps,
} from "../../../impower-route/components/inputs/ObjectField";
import StringInput from "../../../impower-route/components/inputs/StringInput";
import ValueFieldArea from "../../../impower-route/components/inputs/ValueFieldArea";
import { GameInspectorContext } from "../../contexts/gameInspectorContext";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import ReferenceInput from "../inputs/ReferenceInput";

interface EngineRenderPropertyProps extends RenderPropertyProps {
  data: InstanceData[];
  constantValue: unknown;
}

const InstanceRenderProperty = (
  props: EngineRenderPropertyProps
): JSX.Element | null => {
  const {
    constantValue,
    variant,
    InputComponent,
    size,
    backgroundColor,
    data,
    propertyPath,
    indent,
    indentAmount,
    moreIcon,
    moreTooltip,
    moreIconSize,
    label,
    placeholder,
    tooltip,
    showError,
    disabled,
    required,
    autoFocus,
    options,
    characterCountLimit,
    spacing,
    InputProps,
    helperText,
    moreInfoPopup,
    loading,
    onPropertyInputChange,
    onPropertyChange,
    onDebouncedPropertyChange,
    onMore,
    getDocPaths,
    getInputError,
    getInspector,
  } = props;

  const paddingLeft = indent * indentAmount;
  const inspectedData = data[0];
  const propertyValues = data.map((d) => getValue(d, propertyPath));
  const propertyValue = propertyValues[0];

  const inspector = getInspector(inspectedData) as InstanceInspector;
  const permission = inspector.getPropertyPermission(
    propertyPath,
    inspectedData
  );

  const handleGetInputError = useCallback(
    async (value: unknown): Promise<string | null> =>
      getInputError
        ? getInputError(
            propertyPath,
            inspectedData,
            value,
            getDocPaths(propertyPath, inspectedData)
          )
        : null,
    [getDocPaths, getInputError, inspectedData, propertyPath]
  );

  const handleInputChange = useCallback(
    (value: unknown): void => onPropertyInputChange(propertyPath, value),
    [onPropertyInputChange, propertyPath]
  );

  const handleChange = useCallback(
    (value: unknown): void => onPropertyChange(propertyPath, value),
    [onPropertyChange, propertyPath]
  );

  const handleDebouncedChange = useCallback(
    (value: unknown): void => onDebouncedPropertyChange(propertyPath, value),
    [onDebouncedPropertyChange, propertyPath]
  );

  const renderPropertyProps = useMemo(
    () => ({
      constantValue: getValue(data[0], `${propertyPath}.constant`),
    }),
    [data, propertyPath]
  );

  if (isDynamicData(propertyValue)) {
    const objectProperty = propertyValue.dynamic ? "dynamic" : "constant";
    const inheritedProps = getInheritedProps(props);
    return (
      <ValueFieldArea
        propertyPath={propertyPath}
        moreIcon={moreIcon}
        moreTooltip={moreTooltip}
        moreIconSize={moreIconSize}
        spacing={0}
        style={{ paddingLeft }}
        onMore={onMore}
      >
        <DataField
          {...inheritedProps}
          label={label}
          getInspector={getInspector}
          propertyPath={`${propertyPath}.${objectProperty}`}
          data={data}
          moreIcon={null}
          renderProperty={InstanceRenderProperty}
          renderPropertyProps={renderPropertyProps}
        />
      </ValueFieldArea>
    );
  }

  if (isReference(propertyValue)) {
    const mixed =
      removeDuplicates(
        data.map((d) => JSON.stringify(getValue(d, propertyPath)))
      ).length > 1;
    return (
      <ValueFieldArea
        propertyPath={propertyPath}
        moreIcon={moreIcon}
        moreTooltip={moreTooltip}
        moreIconSize={moreIconSize}
        spacing={spacing}
        style={{ paddingLeft }}
        onMore={onMore}
      >
        <ReferenceInput
          variant={variant}
          InputComponent={InputComponent}
          size={size}
          backgroundColor={backgroundColor}
          label={label}
          placeholder={placeholder}
          tooltip={tooltip}
          showError={showError}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          value={propertyValue}
          mixed={mixed}
          constantValue={constantValue}
          possibleValues={options}
          permission={permission}
          characterCountLimit={characterCountLimit}
          InputProps={InputProps}
          helperText={helperText}
          moreInfoPopup={moreInfoPopup}
          loading={loading}
          endAdornmentPosition="replace"
          getInputError={handleGetInputError}
          onInputChange={handleInputChange}
          onChange={handleChange}
          onDebouncedChange={handleDebouncedChange}
        />
      </ValueFieldArea>
    );
  }

  return null;
};

interface InstanceInspectorFormProps
  extends Omit<
    InspectorFormProps,
    "onPropertyInputChange" | "onPropertyChange" | "onDebouncedPropertyChange"
  > {
  data: InstanceData[];
  inspectedContainerId?: string;
  onPropertyInputChange?: (
    references: Reference[],
    propertyPath: string,
    value: unknown
  ) => void;
  onPropertyChange?: (
    references: Reference[],
    propertyPath: string,
    value: unknown
  ) => void;
  onDebouncedPropertyChange?: (
    references: Reference[],
    propertyPath: string,
    value: unknown
  ) => void;
  onChange?: (data: InstanceData[]) => void;
  onDebouncedChange?: (data: InstanceData[]) => void;
  onSubmit?: (
    e: React.FormEvent | React.MouseEvent,
    data: InstanceData[]
  ) => Promise<void>;
}

const InstanceInspectorForm = React.memo(
  (
    props: PropsWithChildren<InstanceInspectorFormProps>
  ): JSX.Element | null => {
    const {
      data,
      inspectedContainerId,
      onPropertyInputChange,
      onPropertyChange,
      onDebouncedPropertyChange,
      children,
    } = props;

    const { gameInspector } = useContext(GameInspectorContext);
    const [state] = useContext(ProjectEngineContext);
    const project = state.project.data as GameProjectData;

    const handleGetFormattedSummary = useCallback(
      (summary: string, data: InstanceData) => {
        return gameInspector.getFormattedSummary(summary, data, project);
      },
      [gameInspector, project]
    );
    const handleGetInspector = useCallback(
      (data: InstanceData) => {
        if (isInstanceData(data)) {
          return gameInspector.getInspector(data.reference);
        }
        return undefined;
      },
      [gameInspector]
    );

    const serializedReferences = useMemo(
      () => JSON.stringify(data.map((d) => d.reference)),
      [data]
    );

    const handlePropertyInputChange = useCallback(
      (propertyPath: string, value: unknown) => {
        const references = JSON.parse(serializedReferences);
        onPropertyInputChange(references, propertyPath, value);
      },
      [onPropertyInputChange, serializedReferences]
    );

    const handlePropertyChange = useCallback(
      (propertyPath: string, value: unknown) => {
        const references = JSON.parse(serializedReferences);
        onPropertyChange(references, propertyPath, value);
      },
      [onPropertyChange, serializedReferences]
    );

    const handleDebouncedPropertyChange = useCallback(
      (propertyPath: string, value: unknown) => {
        const references = JSON.parse(serializedReferences);
        onDebouncedPropertyChange(references, propertyPath, value);
      },
      [onDebouncedPropertyChange, serializedReferences]
    );

    const handleGetPropertyDocPaths = useCallback(
      () =>
        [inspectedContainerId] ||
        data.map((d) => d.reference.parentContainerId),
      [inspectedContainerId, data]
    );

    const handleSetValueId = useCallback((value: unknown, id: string) => {
      if (isInstanceData(value)) {
        return { ...value, reference: { ...value.reference, refId: id } };
      }
      return undefined;
    }, []);

    const handleClickMenuItem = useCallback(
      (
        e: React.MouseEvent,
        type: string,
        propertyPath: string,
        data: InstanceData
      ) => {
        const inspectedParentContainerType = data.reference.parentContainerType;
        const inspectedContainerRefId = data.reference.parentContainerId;
        const inspector = handleGetInspector(data);

        const defaultData = validatePropertyPath(
          propertyPath,
          inspector.createData({ reference: data.reference })
        );
        const propertyDefaultValue = getValue(defaultData, propertyPath);
        const defaultConstantValue: DynamicData = {
          ...(propertyDefaultValue as DynamicData),
          dynamic: null,
        };
        const defaultDynamicVariableValue: DynamicData = {
          ...(propertyDefaultValue as DynamicData),
          dynamic: {
            parentContainerType: inspectedParentContainerType,
            parentContainerId: inspectedContainerRefId,
            refType: "Variable",
            refTypeId: inspector.getPropertyDynamicTypeId(propertyPath, data),
            refId: "",
          } as VariableReference,
        };

        switch (type) {
          case "Reset": {
            handleDebouncedPropertyChange(propertyPath, propertyDefaultValue);
            break;
          }
          case "UseVariableValue": {
            handleDebouncedPropertyChange(
              propertyPath,
              defaultDynamicVariableValue
            );
            break;
          }
          case "UseConstantValue": {
            handleDebouncedPropertyChange(propertyPath, defaultConstantValue);
            break;
          }
          default:
            break;
        }
      },
      [handleDebouncedPropertyChange, handleGetInspector]
    );

    return (
      <InspectorForm
        {...props}
        data={data}
        getInspector={handleGetInspector}
        getFormattedSummary={handleGetFormattedSummary}
        getPropertyDocPaths={handleGetPropertyDocPaths}
        setValueId={handleSetValueId}
        onClickMenuItem={handleClickMenuItem}
        onPropertyInputChange={handlePropertyInputChange}
        onPropertyChange={handlePropertyChange}
        onDebouncedPropertyChange={handleDebouncedPropertyChange}
        renderProperty={InstanceRenderProperty}
        InputComponent={FilledInput}
        ColorInputComponent={ColorInput}
        AutocompleteInputComponent={AutocompleteInput}
        StringInputComponent={StringInput}
        FileInputComponent={FileInput}
        NumberInputComponent={NumberInput}
        BooleanInputComponent={BooleanInput}
        ObjectFieldComponent={ObjectField}
        style={{ flex: 1 }}
      >
        {children}
      </InspectorForm>
    );
  }
);

export default InstanceInspectorForm;
