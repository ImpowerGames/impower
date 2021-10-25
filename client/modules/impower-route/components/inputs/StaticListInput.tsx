import styled from "@emotion/styled";
import React from "react";
import format from "../../../impower-config/utils/format";
import { getValue, isNameable, List } from "../../../impower-core";
import DataField, { RenderPropertyProps } from "./DataField";
import { getChildrenProps } from "./ObjectField";

const StyledIndentedArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

interface StaticListInputProps extends RenderPropertyProps {
  propertyValue: List;
  inspectedData: Record<string, unknown>;
  style?: React.CSSProperties;
}

const StaticListInput = (props: StaticListInputProps): JSX.Element => {
  const {
    propertyValue,
    inspectedData,
    propertyPath,
    style,
    getFormattedSummary = format,
    getInspector,
  } = props;
  const count = propertyValue.order.length;
  const childrenProps = getChildrenProps(props);
  return (
    <StyledIndentedArea style={style}>
      {Object.keys(propertyValue.data).map((id, index) => {
        const itemValue = getValue(inspectedData, `${propertyPath}.data.${id}`);
        const inspector = getInspector(inspectedData);
        const arrayValuePropertyLabel = isNameable(itemValue)
          ? itemValue.name
          : inspector.getPropertyLabel(
              `${propertyPath}.data.${id}`,
              inspectedData
            );
        const arrayValueLabel = getFormattedSummary(
          arrayValuePropertyLabel,
          inspectedData
        );
        const itemLabel = isNameable(itemValue)
          ? itemValue.name
          : arrayValueLabel;
        const v = propertyValue.data[id];
        return (
          <DataField
            key={id}
            {...childrenProps}
            label={itemLabel}
            autoFocus={index === count - 1 && v === propertyValue.default}
            propertyPath={`${propertyPath}.data.${id}`}
            collapsible={isNameable(itemValue)}
          />
        );
      })}
    </StyledIndentedArea>
  );
};

export default StaticListInput;
