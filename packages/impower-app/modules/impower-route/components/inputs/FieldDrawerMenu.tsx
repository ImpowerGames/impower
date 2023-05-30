import MenuItem from "@mui/material/MenuItem";
import React from "react";
import DrawerMenu, { DrawerMenuProps } from "../popups/DrawerMenu";

export interface FieldDrawerMenuProps extends DrawerMenuProps {
  propertyPath: string;
  inspectedData: Record<string, unknown>;
  items: { [type: string]: string };
  onClickMenuItem?: (
    e: React.MouseEvent,
    type: string,
    propertyPath: string,
    data: Record<string, unknown>
  ) => void;
}

export const FieldDrawerMenu = (
  props: FieldDrawerMenuProps
): JSX.Element | null => {
  const {
    propertyPath,
    inspectedData,
    items,
    onClickMenuItem,
    ...drawerMenuProps
  } = props;
  const { onClose } = drawerMenuProps;
  return (
    <DrawerMenu {...drawerMenuProps}>
      {Object.entries(items || {}).map(([menuItemType, label]) => (
        <MenuItem
          key={menuItemType}
          onClick={(e): void => {
            e.stopPropagation();
            onClickMenuItem(e, menuItemType, propertyPath, inspectedData);
            onClose(e);
          }}
        >
          {label}
        </MenuItem>
      ))}
    </DrawerMenu>
  );
};

export default FieldDrawerMenu;
