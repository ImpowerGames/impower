import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import MenuItem from "@material-ui/core/MenuItem";
import Typography from "@material-ui/core/Typography";
import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { FontIcon } from "../../impower-icon";
import { DrawerMenu } from "../../impower-route";
import { DrawerMenuProps } from "../../impower-route/components/popups/DrawerMenu";

const StyledTypography = styled(Typography)`
  padding: ${(props): string => props.theme.spacing(1, 3, 2, 3)};
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
`;

const StyledFontIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1.5)};
  display: flex;
  align-items: center;
  min-width: ${(props): string => props.theme.spacing(4)};
  min-height: ${(props): string => props.theme.spacing(4)};
`;

interface QueryMenuItemProps extends DrawerMenuProps {
  option: string;
  label: string;
  icon?: React.ReactNode;
  value?: string;
  onOption?: (e: React.MouseEvent, option: string) => void;
}

const QueryMenuItem = React.memo((props: QueryMenuItemProps): JSX.Element => {
  const { option, label, icon, value, onOption } = props;

  const theme = useTheme();

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (onOption) {
        onOption(e, option);
      }
    },
    [onOption, option]
  );

  const menuItemStyle: React.CSSProperties = useMemo(
    () => ({
      backgroundColor: value === option ? "#edf3f8" : undefined,
      color: value === option ? theme.palette.primary.main : undefined,
    }),
    [value, option, theme.palette.primary.main]
  );

  const iconStyle: React.CSSProperties = useMemo(
    () => ({
      opacity: value === option ? undefined : 0.6,
    }),
    [value, option]
  );

  return (
    <MenuItem
      key={option}
      onClick={handleClick}
      selected={value === option}
      style={menuItemStyle}
    >
      <StyledFontIconArea>
        <FontIcon
          aria-label={label}
          size={theme.fontSize.regular}
          style={iconStyle}
        >
          {icon}
        </FontIcon>
      </StyledFontIconArea>
      {label}
    </MenuItem>
  );
});

interface QueryMenuProps extends DrawerMenuProps {
  label?: string;
  value?: string;
  options?: [
    string,
    {
      label: string;
      icon?: React.ReactNode;
    }
  ][];
  onOption?: (e: React.MouseEvent, option: string) => void;
}

const QueryMenu = React.memo(
  (props: PropsWithChildren<QueryMenuProps>): JSX.Element => {
    const { label, value, anchorEl, open, options, onClose, onOption } = props;

    const [openState, setOpenState] = useState(false);

    useEffect(() => {
      setOpenState(open);
    }, [open]);

    return (
      <DrawerMenu anchorEl={anchorEl} open={openState} onClose={onClose}>
        <StyledTypography>{label}</StyledTypography>
        {options.map(([option, { label, icon }]) => (
          <QueryMenuItem
            key={option}
            option={option}
            label={label}
            icon={icon}
            value={value}
            onOption={onOption}
          />
        ))}
      </DrawerMenu>
    );
  }
);

export default QueryMenu;
