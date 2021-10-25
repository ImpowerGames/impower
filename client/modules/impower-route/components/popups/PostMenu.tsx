import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { Divider, MenuItem, Typography } from "@material-ui/core";
import React, { useEffect, useState } from "react";
import { FontIcon } from "../../../impower-icon";
import DrawerMenu, { DrawerMenuProps } from "./DrawerMenu";

const StyledTypography = styled(Typography)`
  padding: ${(props): string => props.theme.spacing(1, 3)};
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  text-align: center;
`;

const StyledFontIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1.5)};
  display: flex;
  align-items: center;
`;

const StyledDivider = styled(Divider)`
  margin: ${(props): string => props.theme.spacing(1, 0)};
`;

interface PostMenuProps extends DrawerMenuProps {
  menuLabel?: string;
  options: {
    [option: string]: {
      label?: string;
      icon?: React.ReactNode;
      iconStyle?: "regular" | "solid";
    };
  };
  onOption: (e: React.MouseEvent, option: string) => void;
}

const PostMenu = React.memo((props: PostMenuProps): JSX.Element => {
  const {
    menuLabel,
    anchorReference,
    anchorEl,
    anchorPosition,
    anchorOrigin,
    open,
    options,
    onClose,
    onOption,
  } = props;

  const [openState, setOpenState] = useState(false);

  useEffect(() => {
    setOpenState(open);
  }, [open]);

  const theme = useTheme();

  return (
    <DrawerMenu
      anchorReference={anchorReference}
      anchorEl={anchorEl}
      anchorPosition={anchorPosition}
      anchorOrigin={anchorOrigin}
      open={openState}
      onClose={onClose}
    >
      {menuLabel && <StyledTypography>{menuLabel}</StyledTypography>}
      {menuLabel && <StyledDivider />}
      {options &&
        Object.entries(options).map(([option, { label, icon }]) => (
          <MenuItem
            key={option}
            onClick={(e): void => {
              if (onOption) {
                onOption(e, option);
              }
            }}
          >
            <StyledFontIconArea
              style={{
                minWidth: theme.spacing(4),
                minHeight: theme.spacing(4),
              }}
            >
              <FontIcon
                aria-label={label}
                size={theme.fontSize.regular}
                color={theme.palette.text.secondary}
              >
                {icon}
              </FontIcon>
            </StyledFontIconArea>
            {label}
          </MenuItem>
        ))}
    </DrawerMenu>
  );
});

export default PostMenu;
