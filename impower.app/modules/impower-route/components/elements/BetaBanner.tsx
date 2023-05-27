import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import React, { useCallback, useState } from "react";
import XmarkRegularIcon from "../../../../resources/icons/regular/xmark.svg";
import { FontIcon } from "../../../impower-icon";
import { useBodyPaddingCallback } from "../../hooks/useBodyPaddingCallback";

const StyledBetaWarningButton = styled(Button)<{ hoverable?: boolean }>`
  background-color: ${(props): string => props.theme.palette.secondary.main};
  color: white;
  padding: ${(props): string => props.theme.spacing(1.5, 0)};
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
  const [el, setEl] = useState<HTMLElement>();

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

  const handleRef = useCallback((instance: HTMLElement): void => {
    if (instance) {
      setEl(instance);
    }
  }, []);

  const handleGetPaddedWidth = useCallback((bodyPadding: string) => {
    return `calc(100% + ${bodyPadding})`;
  }, []);

  const handleGetUnpaddedWidth = useCallback(() => {
    return `100%`;
  }, []);

  const handleGetPaddedPaddingRight = useCallback((bodyPadding: string) => {
    return `${bodyPadding}`;
  }, []);

  const handleGetUnpaddedPaddingRight = useCallback(() => {
    return `0`;
  }, []);

  useBodyPaddingCallback(
    "width",
    handleGetPaddedWidth,
    handleGetUnpaddedWidth,
    el
  );

  useBodyPaddingCallback(
    "paddingRight",
    handleGetPaddedPaddingRight,
    handleGetUnpaddedPaddingRight,
    el
  );

  const title = process.env.NEXT_PUBLIC_EMULATOR_HOST
    ? `This is a LOCAL only version of Impower.`
    : process.env.NEXT_PUBLIC_ENVIRONMENT === "development"
    ? `This is a DEV only version of Impower.`
    : process.env.NEXT_PUBLIC_ENVIRONMENT === "test"
    ? `This is a TEST only version of Impower.`
    : `Impower is in open beta.`;
  const caption = process.env.NEXT_PUBLIC_EMULATOR_HOST
    ? `Make sure that the server emulator is running.`
    : process.env.NEXT_PUBLIC_ENVIRONMENT === "development"
    ? `All data on this endpoint is wiped periodically. Click here to report bugs. Thanks!`
    : process.env.NEXT_PUBLIC_ENVIRONMENT === "test"
    ? `All data on this endpoint is wiped periodically. Click here to report bugs. Thanks!`
    : `If you encounter bugs, please report them here. Thanks!`;

  if (dismissed) {
    return null;
  }

  if (!title && !caption) {
    return null;
  }

  return (
    <StyledBetaWarningButton
      fullWidth
      ref={handleRef}
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
        {title && (
          <StyledBoldWarningTypography>{title}</StyledBoldWarningTypography>
        )}
        {caption && (
          <StyledWarningTypography variant="caption">
            {caption}
          </StyledWarningTypography>
        )}
      </StyledTextArea>
    </StyledBetaWarningButton>
  );
});

export default BetaBanner;
