import React, { useCallback, useMemo } from "react";
import {
  isGameDocument,
  isResourceDocument,
} from "../../../impower-data-store";
import AccessDocInput from "./AccessDocInput";
import { RenderPropertyProps } from "./DataField";

export const PageStudioField = (
  props: RenderPropertyProps
): JSX.Element | null => {
  const {
    data,
    variant,
    InputComponent,
    size,
    backgroundColor,
    disabled,
    label,
    placeholder,
    propertyPath,
    spacing,
    debounceInterval,
    onPropertyChange,
    onDebouncedPropertyChange,
  } = props;

  const doc = data[0];

  const studio = useMemo(
    () =>
      isGameDocument(doc) || isResourceDocument(doc) ? doc?.studio || "" : "",
    [doc]
  );

  const handleStudioChange = useCallback(
    (e: React.ChangeEvent, value: string) => {
      if (onPropertyChange) {
        onPropertyChange("studio", value);
      }
    },
    [onPropertyChange]
  );

  const handleDebouncedStudioChange = useCallback(
    (value: string) => {
      if (onDebouncedPropertyChange) {
        onDebouncedPropertyChange("studio", value);
      }
    },
    [onDebouncedPropertyChange]
  );

  return (
    <AccessDocInput
      key={propertyPath}
      variant={variant}
      InputComponent={InputComponent}
      size={size}
      spacing={spacing}
      backgroundColor={backgroundColor}
      disabled={disabled}
      label={label}
      placeholder={placeholder}
      allowStudioAccess
      value={studio}
      excludeDocsFromSearch={[studio]}
      debounceInterval={debounceInterval}
      onChange={handleStudioChange}
      onDebouncedChange={handleDebouncedStudioChange}
    />
  );
};

export default PageStudioField;
