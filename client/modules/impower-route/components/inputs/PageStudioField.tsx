import React, { useCallback, useMemo } from "react";
import { isProjectDocument } from "../../../impower-data-store";
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
    onPropertyInputChange,
    onPropertyChange,
    onDebouncedPropertyChange,
  } = props;

  const doc = data[0];

  const studio = useMemo(
    () => (isProjectDocument(doc) ? doc?.studio || "" : ""),
    [doc]
  );

  const handleStudioChange = useCallback(
    (e: React.ChangeEvent, value: string) => {
      if (onPropertyInputChange) {
        onPropertyInputChange("studio", value);
      }
      if (onPropertyChange) {
        onPropertyChange("studio", value);
      }
    },
    [onPropertyChange, onPropertyInputChange]
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
