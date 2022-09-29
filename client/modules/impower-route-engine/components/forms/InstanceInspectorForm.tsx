import FilledInput from "@material-ui/core/FilledInput";
import React, { PropsWithChildren, useCallback, useMemo } from "react";
import { InstanceData, Reference } from "../../../../../spark-engine";
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

    const handleSetValueId = useCallback(
      (value: { reference: Record<string, unknown> }, id: string) => {
        return { ...value, reference: { ...value.reference, refId: id } };
      },
      []
    );

    return (
      <InspectorForm
        {...props}
        data={data}
        getPropertyDocPaths={handleGetPropertyDocPaths}
        setValueId={handleSetValueId}
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
