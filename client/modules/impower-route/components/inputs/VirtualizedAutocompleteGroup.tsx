import styled from "@emotion/styled";
import {
  AutocompleteRenderGroupParams,
  Divider,
  Typography,
} from "@material-ui/core";
import React from "react";

const StyledGroup = styled.li``;

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

interface VirtualizedAutocompleteGroupParams
  extends Omit<AutocompleteRenderGroupParams, "key"> {
  key: number;
  group: string;
  getOptionHeight?: () => number;
}

export const VirtualizedAutocompleteGroup = React.memo(
  (props: VirtualizedAutocompleteGroupParams): JSX.Element => {
    const { group, children, getOptionHeight } = props;
    const items = React.Children.toArray(children);
    const isDividerGroup = group?.startsWith("---");
    const minHeight = getOptionHeight ? getOptionHeight() : 48;
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
        {items}
      </StyledGroup>
    );
  }
);

export default VirtualizedAutocompleteGroup;
