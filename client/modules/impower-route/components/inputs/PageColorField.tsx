import React, { useCallback } from "react";
import { debounce } from "../../../impower-core";
import DataField, { RenderPropertyProps } from "./DataField";
import RandomizeButton from "./RandomizeButton";

export const PageColorField = (
  props: RenderPropertyProps
): JSX.Element | null => {
  const { propertyPath, onPropertyChange, onDebouncedPropertyChange } = props;

  const onDelayedChange = useCallback(
    (propertyPath: string, value: unknown) => {
      if (onDebouncedPropertyChange) {
        onDebouncedPropertyChange(propertyPath, value);
      }
    },
    [onDebouncedPropertyChange]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleDebouncedChange = useCallback(debounce(onDelayedChange, 500), [
    onDelayedChange,
  ]);

  const handleChange = useCallback(
    (propertyPath: string, value: unknown) => {
      if (onPropertyChange) {
        onPropertyChange(propertyPath, value);
      }
    },
    [onPropertyChange]
  );

  return (
    <DataField
      {...props}
      renderProperty={undefined}
      endAdornmentPosition="before"
      InputProps={{
        endAdornment: (
          <RandomizeButton
            onClick={async (): Promise<void> => {
              const getRandomColor = (
                await import("../../../impower-core/utils/getRandomColor")
              ).default;
              const randomColor = getRandomColor();
              handleChange(propertyPath, randomColor);
              handleDebouncedChange(propertyPath, randomColor);
            }}
          />
        ),
      }}
    />
  );
};

export default PageColorField;
