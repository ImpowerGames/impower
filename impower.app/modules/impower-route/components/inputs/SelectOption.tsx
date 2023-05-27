import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import React, { useCallback, useState } from "react";
import { DynamicIcon, FontIcon } from "../../../impower-icon";
import { VirtualizedItem } from "../../../impower-react-virtualization";

export const getOptionHeight = (props: {
  options: unknown[];
  getOptionIcon?: (option: unknown) => string;
  getOptionDescription?: (option: unknown) => string;
}): number => {
  const { options, getOptionDescription, getOptionIcon } = props;
  const hasDescription =
    options && getOptionDescription && getOptionDescription(options[0]);
  const hasIcon = options && getOptionIcon && getOptionIcon(options[0]);
  return hasIcon && hasDescription ? 60 : hasDescription ? 56 : 48;
};

const StyledOption = styled.div`
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  min-width: 0;
  width: 100%;
  min-height: 100%;
`;

const StyledOptionText = styled.div`
  white-space: pre;
  flex: 1;
  position: relative;
  min-height: 100%;
`;

const StyledOptionTextContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
`;

const StyledOptionIconArea = styled.div`
  display: flex;
  align-items: center;
  padding-right: ${(props): string => props.theme.spacing(2)};
`;

const StyledTypography = styled(Typography)<{ component?: string }>`
  white-space: pre;
  min-width: 0;
  text-overflow: ellipsis;
  overflow: hidden;
  max-width: 100%;
`;

const StyledLabelContent = styled.div`
  max-width: 100%;
  display: flex;
  min-width: 0;
`;

const StyledListItem = styled(ListItem)`
  &.MuiListItem-root {
    padding: 0;
  }
  &.MuiListItem-root.MuiAutocomplete-option {
    padding: 0;
  }
`;

const StyledListItemButton = styled(ListItemButton)`
  min-height: 48px;
  display: flex;
  color: black;
  padding: ${(props): string => props.theme.spacing(1, 2)};
  align-items: stretch;
`;

const StyledPlaceholderContent = styled.div`
  padding: ${(props): string => props.theme.spacing(1, 2)};
`;

export interface OptionProps extends React.HTMLAttributes<HTMLLIElement> {
  "option"?: unknown;
  "selected"?: boolean;
  "inputValue"?: string;
  "placeholderLabel"?: string;
  "style"?: React.CSSProperties;
  "getOptionLabel"?: (option: unknown) => string;
  "getOptionIcon"?: (option: unknown) => string;
  "getOptionIconStyle"?: (option: unknown) => {
    color?: string;
    fontSize?: string | number;
  };
  "getOptionDescription"?: (option: unknown) => string;
  "renderOptionIcon"?: (option: unknown, icon: string) => React.ReactNode;
  "getOptionHeight"?: () => number;
  "data-option-index"?: number;
}

const SelectOption = React.memo((props: OptionProps) => {
  const {
    option,
    selected,
    inputValue,
    placeholderLabel,
    style,
    getOptionLabel,
    getOptionDescription,
    getOptionIcon,
    getOptionIconStyle,
    getOptionHeight,
    renderOptionIcon,
    "data-option-index": index,
    ...listItemProps
  } = props;

  const [root, setRoot] = useState<HTMLElement>();
  const handleRef = useCallback((instance: HTMLElement) => {
    if (instance?.parentElement?.parentElement) {
      setRoot(instance?.parentElement?.parentElement);
    }
  }, []);

  const handleGetOptionLabel = useCallback(
    (option: unknown): string => {
      if (typeof option === "string" && option.includes("/")) {
        return option.split("/")[1];
      }
      if (getOptionLabel) {
        return getOptionLabel(option);
      }
      if (typeof option === "string") {
        return option;
      }
      return JSON.stringify(option);
    },
    [getOptionLabel]
  );

  const optionLabel = handleGetOptionLabel(option);
  const optionDescription = getOptionDescription
    ? getOptionDescription(option)
    : "";
  const optionIcon = getOptionIcon ? getOptionIcon(option) : "";
  const optionIconStyle = getOptionIconStyle ? getOptionIconStyle(option) : {};
  const minHeight = getOptionHeight ? getOptionHeight() : 48;

  const theme = useTheme();

  const parts = optionLabel?.toLowerCase().startsWith(inputValue?.toLowerCase())
    ? [
        { text: optionLabel.slice(0, inputValue.length), highlight: true },
        { text: optionLabel.slice(inputValue.length) },
      ]
    : [{ text: optionLabel }];

  const fontSize = optionDescription ? "0.938rem" : "1rem";

  if (option) {
    if (optionLabel) {
      return (
        <StyledListItem
          ref={handleRef}
          {...listItemProps}
          data-option-index={index}
        >
          <VirtualizedItem
            index={index}
            minHeight={minHeight}
            minValidHeight={minHeight}
            root={root}
          >
            <StyledListItemButton style={style}>
              <StyledOption
                style={{
                  fontSize,
                }}
              >
                {renderOptionIcon && renderOptionIcon(option, optionIcon) ? (
                  <StyledOptionIconArea>
                    {renderOptionIcon(option, optionIcon)}
                  </StyledOptionIconArea>
                ) : (
                  optionIcon && (
                    <StyledOptionIconArea>
                      <FontIcon
                        aria-label={optionIcon}
                        color={
                          optionIconStyle?.color || selected
                            ? theme.colors.black60
                            : theme.colors.black40
                        }
                        size={optionIconStyle?.fontSize}
                      >
                        <DynamicIcon icon={optionIcon} />
                      </FontIcon>
                    </StyledOptionIconArea>
                  )
                )}
                <StyledOptionText>
                  <StyledOptionTextContent>
                    <StyledLabelContent>
                      {parts.map((part, index) => (
                        <StyledTypography
                          key={index} // eslint-disable-line react/no-array-index-key
                          style={{
                            fontSize,
                            fontWeight:
                              selected ||
                              (part.highlight &&
                                optionLabel
                                  ?.toLowerCase()
                                  .startsWith(inputValue?.toLowerCase()))
                                ? 700
                                : optionDescription
                                ? 600
                                : 400,
                          }}
                        >
                          {part.text}
                        </StyledTypography>
                      ))}
                    </StyledLabelContent>
                    {optionDescription && (
                      <StyledLabelContent>
                        <StyledTypography variant="caption" component="p">
                          {optionDescription}
                        </StyledTypography>
                      </StyledLabelContent>
                    )}
                  </StyledOptionTextContent>
                </StyledOptionText>
              </StyledOption>
            </StyledListItemButton>
          </VirtualizedItem>
        </StyledListItem>
      );
    }
  }
  return (
    <StyledListItem
      ref={handleRef}
      {...listItemProps}
      data-option-index={index}
    >
      <VirtualizedItem
        index={index}
        minHeight={minHeight}
        minValidHeight={minHeight}
        root={root}
      >
        <StyledPlaceholderContent style={{ opacity: 0.5, ...style }}>
          <StyledOption>{placeholderLabel}</StyledOption>
        </StyledPlaceholderContent>
      </VirtualizedItem>
    </StyledListItem>
  );
});

export default SelectOption;
