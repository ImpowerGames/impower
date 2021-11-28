import React, { PropsWithChildren } from "react";
import DataField from "../inputs/DataField";
import ObjectFieldArea from "../inputs/ObjectFieldArea";
import { InspectorFormProps } from "./InspectorForm";

export interface InspectorGroupFormProps extends InspectorFormProps {
  label: string;
}

const InspectorGroupForm = React.memo(
  (props: PropsWithChildren<InspectorGroupFormProps>): JSX.Element => {
    const {
      label,
      propertyPaths,
      errors,
      data,
      variant,
      inset,
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
      spacing = 16,
      disabled,
      expandedProperties,
      debounceInterval,
      submitting,
      showErrors,
      setValueId,
      getInspector,
      getPropertyDocIds,
      getFormattedSummary,
      onClickMenuItem,
      onExpandProperty,
      renderProperty,
      onPropertyInputChange,
      onPropertyChange,
      onDebouncedPropertyChange,
      onPropertyErrorFound,
      onPropertyErrorFixed,
      renderPropertyProps,
      ...other
    } = props;

    const erroredProperty = propertyPaths.find((p) => errors[p]);

    return (
      <ObjectFieldArea
        key={label}
        variant={variant}
        inset={inset}
        label={label.substring(0, label.length - 1)}
        propertyPath={label}
        expanded={expandedProperties.includes(label)}
        onExpanded={(e): void => onExpandProperty(label, e)}
        spacing={8}
        error={erroredProperty ? errors[erroredProperty] : undefined}
      >
        {propertyPaths.map((propertyPath) => {
          return (
            <DataField
              key={propertyPath}
              propertyPath={propertyPath}
              data={data}
              variant={variant}
              inset={inset}
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
              expandedProperties={expandedProperties}
              disabled={disabled || submitting}
              showError={showErrors}
              debounceInterval={debounceInterval}
              getInspector={getInspector}
              getFormattedSummary={getFormattedSummary}
              getDocIds={getPropertyDocIds}
              onPropertyInputChange={onPropertyInputChange}
              onPropertyChange={onPropertyChange}
              onDebouncedPropertyChange={onDebouncedPropertyChange}
              onPropertyErrorFound={onPropertyErrorFound}
              onPropertyErrorFixed={onPropertyErrorFixed}
              onExpandProperty={onExpandProperty}
              onClickMenuItem={onClickMenuItem}
              setValueId={setValueId}
              renderProperty={renderProperty}
              renderPropertyProps={renderPropertyProps}
              {...other}
            />
          );
        })}
      </ObjectFieldArea>
    );
  }
);

export default InspectorGroupForm;
