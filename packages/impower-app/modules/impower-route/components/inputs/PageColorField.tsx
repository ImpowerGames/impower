import { useCallback } from "react";
import { debounce } from "../../../impower-core";
import DataField, { RenderPropertyProps } from "./DataField";
import RandomizeButton from "./RandomizeButton";

export const PageColorField = (
  props: RenderPropertyProps
): JSX.Element | null => {
  const {
    propertyPath,
    onPropertyInputChange,
    onPropertyChange,
    onDebouncedPropertyChange,
  } = props;

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

  const handleInputChange = useCallback(
    (propertyPath: string, value: unknown) => {
      if (onPropertyInputChange) {
        onPropertyInputChange(propertyPath, value);
      }
    },
    [onPropertyInputChange]
  );

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
              handleInputChange(propertyPath, randomColor);
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
