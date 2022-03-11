import styled from "@emotion/styled";
import {
  Tooltip as MUITooltip,
  TooltipProps as MUITooltipProps,
} from "@material-ui/core";
import React, { CSSProperties } from "react";

const StyledTooltipContent = styled.div`
  padding: ${(props): string => props.theme.spacing(0.5)}
    ${(props): string => props.theme.spacing(1)};
`;

const StyledTooltip = styled(
  React.forwardRef((props: MUITooltipProps, ref) => (
    <MUITooltip
      classes={{ popper: props.className, tooltip: "tooltip" }}
      {...props}
      ref={ref}
    />
  ))
)`
  & .tooltip {
    padding: 0;

    ${(props): string => props.theme.breakpoints.down("xl")} {
      max-width: 1280px;
    }

    ${(props): string => props.theme.breakpoints.down("xl")} {
      max-width: 960px;
    }

    ${(props): string => props.theme.breakpoints.down("lg")} {
      max-width: 600px;
    }

    ${(props): string => props.theme.breakpoints.down("md")} {
      max-width: 300px;
    }
  }
`;

interface TooltipProps extends MUITooltipProps {
  title: React.ReactNode;
  disableTouchListener?: boolean;
  children: React.ReactElement;
  open?: boolean;
  placement?:
    | "right"
    | "bottom-end"
    | "bottom-start"
    | "bottom"
    | "left-end"
    | "left-start"
    | "left"
    | "right-end"
    | "right-start"
    | "top-end"
    | "top-start"
    | "top";
  style?: CSSProperties;
  onOpen?: () => void;
  onClose?: () => void;
}

const Tooltip = (props: TooltipProps): JSX.Element => {
  const {
    title,
    children,
    disableTouchListener,
    open,
    placement,
    style,
    onOpen,
    onClose,
    ...other
  } = props;
  if (!title) {
    return children;
  }
  return (
    <StyledTooltip
      title={
        typeof title === "string" ? (
          <StyledTooltipContent style={style}>{title}</StyledTooltipContent>
        ) : (
          title || ""
        )
      }
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      disableTouchListener={disableTouchListener}
      placement={placement}
      {...other}
    >
      {children}
    </StyledTooltip>
  );
};

export default Tooltip;
