import styled from "@emotion/styled";
import { AlertColor, Paper, Typography } from "@material-ui/core";
import Button from "@material-ui/core/Button";
import { AnimatePresence, motion } from "framer-motion";
import React from "react";
import CircleCheckRegularIcon from "../../../../resources/icons/regular/circle-check.svg";
import CircleExclamationRegularIcon from "../../../../resources/icons/regular/circle-exclamation.svg";
import CircleInfoRegularIcon from "../../../../resources/icons/regular/circle-info.svg";
import CircleQuestionRegularIcon from "../../../../resources/icons/regular/circle-question.svg";
import { FontIcon } from "../../../impower-icon";

const StyledPaper = styled(Paper)`
  &.MuiPaper-root {
    border-radius: 0;
    display: flex;
    align-items: center;
    padding: ${(props): string => props.theme.spacing(1)}
      ${(props): string => props.theme.spacing(2)};
    background-color: ${(props): string => props.theme.colors.darkForeground};
    color: ${(props): string => props.theme.colors.white60};
  }
`;

const StyledButton = styled(Button)`
  white-space: nowrap;
  color: white;
`;

const StyledIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(2)};
`;

const StyledMessageArea = styled.div`
  display: flex;
  align-items: center;
  flex: 1;
`;

interface BannerProps {
  open: boolean;
  message?: string;
  buttonLabel?: React.ReactNode;
  severity?: AlertColor;
  onClick?: () => void;
  onClose: () => void;
}

const Banner = React.memo((props: BannerProps): JSX.Element => {
  const {
    open,
    severity,
    message,
    buttonLabel,
    onClick = (): void => null,
    onClose,
  } = props;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: "auto" }}
          exit={{ height: 0 }}
          transition={{ type: "tween", duration: 0.2 }}
          style={{ overflow: "hidden" }}
        >
          <StyledPaper elevation={0}>
            {message && (
              <StyledMessageArea className={StyledMessageArea.displayName}>
                {severity && (
                  <StyledIconArea className={StyledIconArea.displayName}>
                    <FontIcon aria-label="message type" size={24}>
                      {severity === "success" ? (
                        <CircleCheckRegularIcon />
                      ) : severity === "info" ? (
                        <CircleInfoRegularIcon />
                      ) : severity === "warning" ? (
                        <CircleQuestionRegularIcon />
                      ) : severity === "error" ? (
                        <CircleExclamationRegularIcon />
                      ) : (
                        <CircleInfoRegularIcon />
                      )}
                    </FontIcon>
                  </StyledIconArea>
                )}
                <Typography>{message}</Typography>
              </StyledMessageArea>
            )}
            {buttonLabel && (
              <StyledButton
                className={StyledButton.displayName}
                onClick={(): void => {
                  if (onClick) {
                    onClick();
                  }
                  if (onClose) {
                    onClose();
                  }
                }}
              >
                {buttonLabel}
              </StyledButton>
            )}
          </StyledPaper>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export default Banner;
