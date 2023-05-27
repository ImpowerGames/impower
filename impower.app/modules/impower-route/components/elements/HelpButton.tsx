import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import dynamic from "next/dynamic";
import React, {
  CSSProperties,
  PropsWithChildren,
  useCallback,
  useState,
} from "react";
import CircleInfoRegularIcon from "../../../../resources/icons/regular/circle-info.svg";
import { useDialogNavigation } from "../../../impower-dialog";
import { FontIcon } from "../../../impower-icon";

const StyledHelpButton = styled(Button)`
  text-transform: none;
  color: inherit;
  margin-left: ${(props): string => props.theme.spacing(-1.5)};
  padding: ${(props): string => props.theme.spacing(0, 0.5)};
  font-weight: 400;
  text-align: left;
  white-space: pre-wrap;
`;

const StyledIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1)};
`;

const HelpDialog = dynamic(() => import("./HelpDialog"), {
  ssr: false,
});

interface HelpButtonProps {
  id: string;
  icon?: React.ReactNode;
  label?: React.ReactNode;
  fontSize?: string | number;
  style?: CSSProperties;
}

const HelpButton = (props: PropsWithChildren<HelpButtonProps>): JSX.Element => {
  const {
    id,
    icon = <CircleInfoRegularIcon />,
    label,
    fontSize = 24,
    style,
    children,
  } = props;

  const [open, setOpen] = useState<boolean>();
  const theme = useTheme();

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.h !== prevState?.h) {
        setOpen(currState?.h === id);
      }
    },
    [id]
  );
  const [openHelpDialog, closeHelpDialog] = useDialogNavigation(
    "h",
    handleBrowserNavigation
  );

  const handleOpen = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      e.preventDefault();
      setOpen(true);
      openHelpDialog(id);
    },
    [openHelpDialog, id]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      closeHelpDialog();
    },
    [closeHelpDialog]
  );

  return (
    <>
      {label ? (
        <StyledHelpButton onClick={handleOpen} style={{ fontSize, ...style }}>
          {icon && (
            <StyledIconArea>
              <FontIcon aria-label="Help" color={theme.colors.subtitle}>
                {icon}
              </FontIcon>
            </StyledIconArea>
          )}
          {label}
        </StyledHelpButton>
      ) : (
        <IconButton onClick={handleOpen} style={{ fontSize, ...style }}>
          <FontIcon aria-label="Help" color={theme.colors.subtitle}>
            {icon}
          </FontIcon>
        </IconButton>
      )}
      {open !== undefined && (
        <HelpDialog open={open} onClose={handleClose}>
          {children}
        </HelpDialog>
      )}
    </>
  );
};

export default HelpButton;
