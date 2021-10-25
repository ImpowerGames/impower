import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import {
  Divider,
  MenuItem,
  PopoverOrigin,
  PopoverPosition,
  PopoverReference,
} from "@material-ui/core";
import React, { useEffect, useState } from "react";
import { FontIcon } from "../../../impower-icon";
import DrawerMenu from "./DrawerMenu";

const StyledFontIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1.5)};
  display: flex;
  align-items: center;
`;

const StyledDividerArea = styled.div`
  padding: ${(props): string => props.theme.spacing(0.5)} 0;
`;

const StyledMenuItem = styled(MenuItem)`
  min-width: 150px;
`;

interface ContextMenuProps {
  anchorReference?: PopoverReference;
  anchorEl?: Element | ((element: Element) => Element);
  anchorPosition?: PopoverPosition;
  anchorOrigin?: PopoverOrigin;
  open?: boolean;
  onClose?: (event: React.MouseEvent | React.KeyboardEvent) => void;
  onOption?: (event: React.MouseEvent, option: string) => void;
  options: {
    key?: string;
    label: string;
    icon?: React.ReactNode;
    disabled?: boolean;
    iconStyle?: string;
    persistOnClick?: boolean;
  }[];
}

const ContextMenu = React.memo((props: ContextMenuProps): JSX.Element => {
  const {
    anchorReference,
    anchorEl,
    anchorPosition,
    anchorOrigin,
    open,
    options,
    onClose,
    onOption,
  } = props;

  const theme = useTheme();

  const [openState, setOpenState] = useState(false);

  useEffect(() => {
    setOpenState(open);
  }, [open]);

  return (
    <DrawerMenu
      anchorReference={anchorReference}
      anchorEl={anchorEl}
      anchorPosition={anchorPosition}
      anchorOrigin={anchorOrigin}
      open={openState}
      onClose={onClose}
    >
      {options.map((option) =>
        (option.key || option.label || "").startsWith("---") ? (
          <StyledDividerArea key={option.key || option.label}>
            <Divider />
          </StyledDividerArea>
        ) : (
          <StyledMenuItem
            key={option.key || option.label || ""}
            disabled={option.disabled}
            onClick={async (e): Promise<void> => {
              e.stopPropagation();
              if (!option.persistOnClick) {
                if (onClose) {
                  onClose(e);
                }
              }
              await new Promise((resolve) => {
                window.setTimeout(resolve, 1);
              });
              if (onOption) {
                onOption(e, option.key || option.label);
              }
            }}
          >
            <StyledFontIconArea>
              <FontIcon
                aria-label={option.label}
                size={theme.fontSize.optionIcon}
                color={theme.colors.black50}
              >
                {option.icon}
              </FontIcon>
            </StyledFontIconArea>
            {option.label}
          </StyledMenuItem>
        )
      )}
    </DrawerMenu>
  );
});

export default ContextMenu;
