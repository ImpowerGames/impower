/* eslint-disable @typescript-eslint/no-use-before-define */

import styled from "@emotion/styled";
import { Typography } from "@material-ui/core";
import React, { useCallback } from "react";
import {
  getValue,
  isActivable,
  isList,
  isOptional,
  orderBy,
  removeDuplicates,
} from "../../../impower-core";
import BooleanInput from "./BooleanInput";
import DataField, { InheritedProps, RenderPropertyProps } from "./DataField";
import InputAccordion from "./InputAccordion";
import InputAccordionDetails from "./InputAccordionDetails";
import InputAccordionSummary from "./InputAccordionSummary";
import ListInput from "./ListInput";
import ObjectFieldArea from "./ObjectFieldArea";
import StaticListInput from "./StaticListInput";
import ValueFieldArea from "./ValueFieldArea";

const StyledIndentedArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

export const getInheritedProps = (
  props: RenderPropertyProps
): InheritedProps => {
  const {
    data,
    variant,
    size,
    spacing,
    backgroundColor,
    required,
    disabled,
    expandedProperties,
    showError,
    InputComponent,
    AutocompleteInputComponent,
    ColorInputComponent,
    FileInputComponent,
    NumberInputComponent,
    RadioInputComponent,
    StringInputComponent,
    BooleanInputComponent,
    ObjectFieldComponent,
    getInspector,
    getFormattedSummary,
    getDocIds,
    onPropertyChange,
    onDebouncedPropertyChange,
    onPropertyBlur,
    onPropertyKeyDown,
    onPropertyErrorFound,
    onPropertyErrorFixed,
    onExpandProperty,
    onClickMenuItem,
    setValueId,
  } = props;
  return {
    data,
    variant,
    size,
    spacing,
    backgroundColor,
    required,
    disabled,
    expandedProperties,
    showError,
    InputComponent,
    AutocompleteInputComponent,
    ColorInputComponent,
    FileInputComponent,
    NumberInputComponent,
    RadioInputComponent,
    StringInputComponent,
    BooleanInputComponent,
    ObjectFieldComponent,
    getInspector,
    getFormattedSummary,
    getDocIds,
    onPropertyChange,
    onDebouncedPropertyChange,
    onPropertyBlur,
    onPropertyKeyDown,
    onPropertyErrorFound,
    onPropertyErrorFixed,
    onExpandProperty,
    onClickMenuItem,
    setValueId,
  };
};

export interface ObjectFieldProps extends RenderPropertyProps {
  renderProperty?: (props: RenderPropertyProps) => React.ReactNode;
  renderPropertyProps?: Record<string, unknown>;
}

export const getChildrenProps = (
  props: ObjectFieldProps
): Omit<ObjectFieldProps, "propertyPath"> => {
  const { renderProperty, renderPropertyProps } = props;
  const inheritedProps = getInheritedProps(props);
  return {
    ...inheritedProps,
    renderProperty,
    renderPropertyProps,
  };
};

const ObjectField = React.memo(
  (props: ObjectFieldProps): JSX.Element | null => {
    const {
      variant,
      inset,
      size,
      data,
      propertyPath,
      indent,
      indentAmount,
      collapsible,
      moreIcon,
      moreTooltip,
      moreIconSize,
      label,
      disableListChanges,
      listCountLimit,
      expandedProperties,
      spacing,
      onMore,
      onDebouncedPropertyChange,
      onExpandProperty,
      getValueDescription,
      getInspector,
      renderProperty,
      renderPropertyProps,
    } = props;

    const childrenProps = getChildrenProps(props);

    const paddingLeft = indent * indentAmount;
    const propertyValues = data.map((d) => getValue(d, propertyPath));
    const inspectedData = data[0];
    const propertyValue = getValue(inspectedData, propertyPath);

    const handleExpandProperty = useCallback(
      (expanded: boolean): void => {
        if (onExpandProperty) {
          onExpandProperty(propertyPath, expanded);
        }
      },
      [onExpandProperty, propertyPath]
    );

    const valueFieldAreaProps = {
      propertyPath,
      moreIcon,
      moreTooltip,
      moreIconSize,
      spacing,
      onMore,
      style: { paddingLeft },
    };

    const objectFieldAreaProps = {
      ...valueFieldAreaProps,
      variant,
      inset,
      label,
      summary: getValueDescription(propertyValue),
      expanded: expandedProperties.includes(propertyPath),
      onExpanded: handleExpandProperty,
    };

    const customField = renderProperty?.({ ...props, ...renderPropertyProps });

    if (customField) {
      return <>{customField}</>;
    }

    if (propertyValue === undefined || propertyValue === null) {
      return null;
    }

    if (isList(propertyValue)) {
      const count = propertyValue.order.length;
      if (disableListChanges) {
        return (
          <StaticListInput
            {...props}
            propertyValue={propertyValue}
            inspectedData={inspectedData}
            style={{ paddingLeft }}
          />
        );
      }
      if (!collapsible) {
        return (
          <StyledIndentedArea style={{ paddingLeft }}>
            <ListInput {...props} propertyValue={propertyValue} />
          </StyledIndentedArea>
        );
      }
      return (
        <ObjectFieldArea
          {...objectFieldAreaProps}
          label={
            <div style={{ display: "flex", whiteSpace: "pre" }}>
              <div>{label}</div>
              <div>: </div>
              <div>{count}</div>
              {listCountLimit && (
                <div style={{ opacity: 0.7 }}> /{listCountLimit}</div>
              )}
            </div>
          }
        >
          <ListInput {...props} propertyValue={propertyValue} />
        </ObjectFieldArea>
      );
    }

    const objectData: Record<string, unknown>[] = data.map((d) =>
      getValue(d, propertyPath)
    ) as Record<string, unknown>[];
    const inspector = getInspector(data[0]);
    const objectInspector = getInspector(objectData[0]);
    if (objectInspector && inspector !== objectInspector) {
      const objectInspectedData = {
        ...(objectInspector?.createData?.() || {}),
        ...objectData[0],
      };
      objectData[0] = objectInspectedData;
      const sortedProperties = objectInspectedData
        ? orderBy(
            Object.keys(objectInspectedData).map((property) => ({
              property,
              order: objectInspector.getPropertyOrder(
                property,
                objectInspectedData
              ),
            })),
            (x) => x.order
          )
        : [];
      const OuterComponent = collapsible ? ObjectFieldArea : StyledIndentedArea;
      return (
        <OuterComponent {...objectFieldAreaProps}>
          {sortedProperties.map(({ property }) => (
            <DataField
              key={property}
              {...childrenProps}
              propertyPath={property}
              data={objectData}
            />
          ))}
        </OuterComponent>
      );
    }

    if (isActivable(propertyValue)) {
      const activeProperty = "active";
      const activeConstantValue = getValue<boolean>(
        propertyValue,
        activeProperty
      ) as boolean;
      const inspector = getInspector(inspectedData);
      const activeLabel = inspector.getPropertyLabel(
        `${propertyPath}.${activeProperty}`,
        inspectedData
      );
      const OuterComponent = collapsible ? ObjectFieldArea : StyledIndentedArea;
      return (
        <OuterComponent {...objectFieldAreaProps}>
          <InputAccordion
            TransitionProps={{ unmountOnExit: true }}
            expanded={activeConstantValue}
            onChange={(event, v): void => {
              event.preventDefault();
              if (onDebouncedPropertyChange) {
                onDebouncedPropertyChange(
                  `${propertyPath}.${activeProperty}`,
                  v
                );
              }
            }}
          >
            <InputAccordionSummary
              aria-controls={`${propertyPath}-content`}
              id={`${propertyPath}-header`}
            >
              <ValueFieldArea
                {...valueFieldAreaProps}
                propertyPath={`${propertyPath}.${activeProperty}`}
              >
                <BooleanInput
                  variant={variant}
                  inset={inset}
                  size={size}
                  controlType="checkbox"
                  label={activeLabel}
                  value={activeConstantValue}
                  mixed={
                    removeDuplicates(
                      propertyValues.map((v) =>
                        JSON.stringify(getValue<boolean>(v, activeProperty))
                      )
                    ).length > 1
                  }
                />
              </ValueFieldArea>
            </InputAccordionSummary>
            <InputAccordionDetails>
              {Object.keys(propertyValue)
                .filter((id) => id !== activeProperty)
                .map((id) => (
                  <DataField
                    key={id}
                    {...childrenProps}
                    propertyPath={`${propertyPath}.${id}`}
                    collapsible={false}
                  />
                ))}
            </InputAccordionDetails>
          </InputAccordion>
        </OuterComponent>
      );
    }

    if (isOptional(propertyValue)) {
      const useDefaultProperty = "useDefault";
      const useDefaultConstantValue = getValue<boolean>(
        propertyValue,
        useDefaultProperty
      ) as boolean;
      const useDefaultLabel = inspector.getPropertyLabel(
        `${propertyPath}.${useDefaultProperty}`,
        inspectedData
      );
      const OuterComponent = collapsible ? ObjectFieldArea : StyledIndentedArea;
      return (
        <OuterComponent {...objectFieldAreaProps}>
          <InputAccordion
            TransitionProps={{ unmountOnExit: true }}
            expanded={!useDefaultConstantValue}
            onChange={(event, v): void => {
              event.preventDefault();
              if (onDebouncedPropertyChange) {
                onDebouncedPropertyChange(
                  `${propertyPath}.${useDefaultProperty}`,
                  !v
                );
              }
            }}
          >
            <InputAccordionSummary
              aria-controls={`${propertyPath}-content`}
              id={`${propertyPath}-header`}
            >
              <ValueFieldArea
                {...valueFieldAreaProps}
                propertyPath={`${propertyPath}.${useDefaultProperty}`}
              >
                <BooleanInput
                  variant={variant}
                  size={size}
                  controlType="checkbox"
                  label={useDefaultLabel}
                  value={useDefaultConstantValue}
                  mixed={
                    removeDuplicates(
                      propertyValues.map((v) =>
                        JSON.stringify(getValue(v, useDefaultProperty))
                      )
                    ).length > 1
                  }
                />
              </ValueFieldArea>
            </InputAccordionSummary>
            <InputAccordionDetails>
              {Object.keys(propertyValue)
                .filter((id) => id !== useDefaultProperty)
                .map((id) => (
                  <DataField
                    key={id}
                    {...childrenProps}
                    propertyPath={`${propertyPath}.${id}`}
                    collapsible={false}
                  />
                ))}
            </InputAccordionDetails>
          </InputAccordion>
        </OuterComponent>
      );
    }

    if (typeof propertyValue === "object" && propertyValue) {
      const OuterComponent = collapsible ? ObjectFieldArea : StyledIndentedArea;
      return (
        <OuterComponent {...objectFieldAreaProps}>
          {Object.keys(propertyValue).map((id) => {
            return (
              <DataField
                key={id}
                {...childrenProps}
                propertyPath={`${propertyPath}.${id}`}
              />
            );
          })}
        </OuterComponent>
      );
    }

    return (
      <ValueFieldArea {...valueFieldAreaProps}>
        <Typography color="error">
          {label} : {`${propertyValue}`}
        </Typography>
      </ValueFieldArea>
    );
  }
);

export default ObjectField;
