import styled from "@emotion/styled";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import React, { useCallback } from "react";
import { MenuInfo } from "../../types/info/menus";

const StyledDividerArea = styled.div`
  padding: ${(props): string => props.theme.spacing(0.5)} 0;
`;

interface LinkMenuProps {
  open?: boolean;
  anchorEl: HTMLElement | null;
  links: MenuInfo[];
  onClose: (e: React.MouseEvent) => void;
  onClickMenuItem?: (e: React.MouseEvent, menuItem: MenuInfo) => void;
}

const LinkMenu = React.memo((props: LinkMenuProps) => {
  const { open, anchorEl, links, onClose, onClickMenuItem } = props;

  const handleClick = useCallback(
    async (e: React.MouseEvent, menuItem: MenuInfo) => {
      if (onClickMenuItem) {
        onClickMenuItem(e, menuItem);
      } else {
        if (onClose) {
          onClose(e);
        }
        const router = (await import("next/router")).default;
        router.replace(menuItem.link);
      }
    },
    [onClickMenuItem, onClose]
  );

  return (
    <Menu open={open} anchorEl={anchorEl} onClose={onClose}>
      {links.map((menuItem) =>
        menuItem.label.startsWith("---") ? (
          <StyledDividerArea key={menuItem.label}>
            <Divider />
          </StyledDividerArea>
        ) : (
          <MenuItem
            key={menuItem.label}
            onClick={(e): Promise<void> => handleClick(e, menuItem)}
          >
            {menuItem.label}
          </MenuItem>
        )
      )}
    </Menu>
  );
});

export default LinkMenu;
