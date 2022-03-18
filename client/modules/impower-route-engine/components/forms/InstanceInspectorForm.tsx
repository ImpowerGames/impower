import FilledInput from "@material-ui/core/FilledInput";
import React, {
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { getValue, validatePropertyPath } from "../../../impower-core";
import {
  InstanceData,
  isInstanceData,
  Reference,
} from "../../../impower-game/data";
import InspectorForm, {
  InspectorFormProps,
} from "../../../impower-route/components/forms/InspectorForm";
import AutocompleteInput from "../../../impower-route/components/inputs/AutocompleteInput";
import BooleanInput from "../../../impower-route/components/inputs/BooleanInput";
import ColorInput from "../../../impower-route/components/inputs/ColorInput";
import FileInput from "../../../impower-route/components/inputs/FileInput";
import NumberInput from "../../../impower-route/components/inputs/NumberInput";
import ObjectField from "../../../impower-route/components/inputs/ObjectField";
import StringInput from "../../../impower-route/components/inputs/StringInput";
import { GameInspectorContext } from "../../contexts/gameInspectorContext";

interface InstanceInspectorFormProps
  extends Omit<
    InspectorFormProps,
    "onPropertyInputChange" | "onPropertyChange" | "onDebouncedPropertyChange"
  > {
  data: InstanceData[];
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
      onPropertyInputChange,
      onPropertyChange,
      onDebouncedPropertyChange,
      children,
    } = props;

    const { gameInspector } = useContext(GameInspectorContext);

    const handleGetFormattedSummary = useCallback(
      (summary: string, data: InstanceData) => {
        return gameInspector.getFormattedSummary(summary, data);
      },
      [gameInspector]
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
      () => data.map((d) => d.reference.parentContainerId),
      [data]
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
        const inspector = handleGetInspector(data);

        const defaultData = validatePropertyPath(
          propertyPath,
          inspector.createData({ reference: data.reference })
        );
        const propertyDefaultValue = getValue(defaultData, propertyPath);

        switch (type) {
          case "Reset": {
            handleDebouncedPropertyChange(propertyPath, propertyDefaultValue);
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
