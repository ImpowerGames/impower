import styled from "@emotion/styled";
import { Divider, Typography } from "@material-ui/core";
import React from "react";
import { VirtualizedItem } from "../../../impower-react-virtualization";

const StyledGroup = styled.div``;

const StyledGroupName = styled.div`
  padding: ${(props): string => props.theme.spacing(1, 2)};
  top: 0;
  z-index: 1;
  position: sticky;
  background-color: white;
  display: flex;
  align-items: center;
`;

const StyledTypography = styled(Typography)<{ component?: string }>`
  white-space: pre;
  min-width: 0;
  text-overflow: ellipsis;
  overflow: hidden;
  max-width: 100%;
`;

const StyledDivider = styled(Divider)``;

export const VirtualizedAutocompleteGroup = React.memo(
  (props: {
    group: string;
    children: React.ReactNode;
    getOptionHeight?: (group: string) => number;
  }): JSX.Element => {
    const { group, children, getOptionHeight } = props;
    const items = React.Children.toArray(children);
    const isDividerGroup = group?.startsWith("---");
    const minHeight = getOptionHeight ? getOptionHeight(group) : 48;
    return (
      <StyledGroup>
        {group && (
          <StyledGroupName
            style={{
              position: isDividerGroup ? "relative" : undefined,
              minHeight,
            }}
          >
            <StyledDivider
              absolute={!isDividerGroup}
              style={{ width: "100%" }}
            />
            {!isDividerGroup && (
              <StyledTypography
                style={{
                  fontWeight: 600,
                }}
              >
                {group}
              </StyledTypography>
            )}
          </StyledGroupName>
        )}
        {items.map((item, index) => {
          if (!item) {
            return null;
          }
          const itemWithKey = item as { key: string };
          const itemKey = itemWithKey.key;
          return (
            <VirtualizedItem key={itemKey} index={index} minHeight={minHeight}>
              {items[index]}
            </VirtualizedItem>
          );
        })}
      </StyledGroup>
    );
  }
);

export default VirtualizedAutocompleteGroup;
