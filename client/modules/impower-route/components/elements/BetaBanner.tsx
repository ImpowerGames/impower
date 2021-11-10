import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import IconButton from "@material-ui/core/IconButton";
import Typography from "@material-ui/core/Typography";
import React, { useCallback, useState } from "react";
import XmarkRegularIcon from "../../../../resources/icons/regular/xmark.svg";
import { FontIcon } from "../../../impower-icon";

const StyledBetaWarningButton = styled(Button)<{ hoverable?: boolean }>`
  background-color: ${(props): string => props.theme.palette.secondary.main};
  color: white;
  padding-top: ${(props): string => props.theme.spacing(1.5)};
  padding-bottom: ${(props): string => props.theme.spacing(1.5)};
  padding-right: ${(props): string => props.theme.spacing(2)};
  width: calc(100% + ${(props): string => props.theme.spacing(1)});
  border-radius: 0;
  text-transform: none;

  &.MuiButton-root:hover {
    background-color: ${(props): string =>
      props.hoverable
        ? props.theme.palette.secondary.dark
        : props.theme.palette.secondary.main};
  }

  &.MuiButton-root.Mui-disabled {
    color: white;
  }

  display: flex;
  align-items: center;
  z-index: 1;
`;

const StyledTextArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-right: 44px;
`;

const StyledWarningTypography = styled(Typography)`
  text-align: center;
`;

const StyledBoldWarningTypography = styled(StyledWarningTypography)`
  font-weight: bold;
`;

const StyledIconButton = styled(IconButton)`
  color: white;
  opacity: 0.6;
  padding: ${(props): string => props.theme.spacing(1.5)};

  &.MuiIconButton-root:hover {
    background-color: ${(props): string => props.theme.palette.secondary.dark};
  }
`;

const DISMISSED_KEY = "@impower/DISMISSED_BETA_WARNING";

const BetaBanner = React.memo((): JSX.Element => {
  const [dismissed, setDismissed] = useState(
    typeof window !== "undefined" &&
      Boolean(window.sessionStorage.getItem(DISMISSED_KEY))
  );
  const [hoveringDismissButton, setHoveringDismissButton] = useState(false);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.sessionStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  }, []);

  const handlePointerEnterDismissButton = useCallback((): void => {
    setHoveringDismissButton(true);
  }, []);

  const handlePointerLeaveDismissButton = useCallback((): void => {
    setHoveringDismissButton(false);
  }, []);

  if (dismissed) {
    return null;
  }

  return (
    <StyledBetaWarningButton
      fullWidth
      hoverable={!hoveringDismissButton}
      href={`https://github.com/ImpowerGames/impower/issues`}
    >
      <StyledIconButton
        onClick={handleDismiss}
        onPointerEnter={handlePointerEnterDismissButton}
        onPointerLeave={handlePointerLeaveDismissButton}
      >
        <FontIcon aria-label="Dismiss" size={20}>
          <XmarkRegularIcon />
        </FontIcon>
      </StyledIconButton>
      <StyledTextArea>
        <StyledBoldWarningTypography>
          {`Impower is in open beta.`}
        </StyledBoldWarningTypography>
        <StyledWarningTypography variant="caption">
          {`If you encounter bugs, please report them here. Thanks!`}
        </StyledWarningTypography>
      </StyledTextArea>
    </StyledBetaWarningButton>
  );
});

export default BetaBanner;
