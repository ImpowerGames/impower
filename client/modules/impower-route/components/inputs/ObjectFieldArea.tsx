import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { Typography } from "@material-ui/core";
import dynamic from "next/dynamic";
import React, { CSSProperties, PropsWithChildren } from "react";
import AngleUpRegularIcon from "../../../../resources/icons/regular/angle-up.svg";
import CircleExclamationSolidIcon from "../../../../resources/icons/solid/circle-exclamation.svg";
import { FontIcon } from "../../../impower-icon";
import RotateAnimation from "../animations/RotateAnimation";

const InputAccordion = dynamic(() => import("./InputAccordion"));

const InputAccordionSummary = dynamic(() => import("./InputAccordionSummary"));

const InputAccordionDetails = dynamic(() => import("./InputAccordionDetails"));

const MoreButton = dynamic(() => import("./MoreButton"));

const StyledObjectFieldArea = styled.div``;

const StyledAccordionArea = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: ${(props): React.ReactText =>
    props.theme.typography.body1.fontSize};
  font-family: ${(props): string => props.theme.typography.fontFamily};
  line-height: ${(props): React.ReactText =>
    props.theme.typography.body1.lineHeight};
  color: inherit;
`;

const StyledObjectChildrenArea = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledExpandIconArea = styled.div`
  display: flex;
  align-items: center;
  opacity: 0.7;
  margin-left: ${(props): string => props.theme.spacing(1)};
  margin-right: ${(props): string => props.theme.spacing(1)};
`;

const StyledTextArea = styled.div`
  flex: 1;
`;

const StyledLabelArea = styled.div`
  min-width: 0;
  text-overflow: ellipsis;
  overflow: hidden;
`;

const StyledSummaryArea = styled.div`
  opacity: 0.5;
  min-width: 0;
  text-overflow: ellipsis;
  overflow: hidden;
`;

const StyleSummaryTypography = styled(Typography)``;

interface ObjectFieldAreaProps {
  label: React.ReactNode;
  summary?: React.ReactNode;
  propertyPath: string;
  expanded: boolean;
  variant?: "filled" | "outlined" | "standard";
  inset?: boolean;
  moreIcon?: string;
  moreTooltip?: string;
  moreIconSize?: string;
  forceExpand?: boolean;
  spacing?: number;
  error?: string;
  style?: CSSProperties;
  onMore?: (id: string, target: HTMLElement) => void;
  onExpanded: (expanded: boolean) => void;
}

const ObjectFieldArea = (
  props: PropsWithChildren<ObjectFieldAreaProps>
): JSX.Element => {
  const {
    variant,
    inset,
    label,
    summary,
    propertyPath,
    moreIcon,
    moreTooltip,
    moreIconSize,
    expanded,
    forceExpand,
    spacing,
    error,
    style,
    onMore,
    onExpanded,
    children,
  } = props;
  const theme = useTheme();
  const properties = propertyPath.split(".");
  const property = properties[properties.length - 1];
  return (
    <StyledObjectFieldArea
      className={inset ? "inset" : variant}
      style={{
        ...style,
        paddingTop: spacing * 0.5,
        paddingBottom: spacing * 0.5,
      }}
    >
      <InputAccordion
        className={inset ? "inset" : variant}
        TransitionProps={{ unmountOnExit: true }}
        expanded={forceExpand || expanded}
        onChange={(_event, e): void => {
          onExpanded(e);
        }}
      >
        <InputAccordionSummary
          className={inset ? "inset" : variant}
          expandIcon={null}
          aria-controls={`${propertyPath}-content`}
          id={`${propertyPath}-header`}
          style={{
            pointerEvents: forceExpand ? "none" : "auto",
            minHeight: theme.spacing(6),
          }}
        >
          <StyledAccordionArea
            className={inset ? "inset" : variant}
            style={{ color: error ? theme.palette.error.light : undefined }}
          >
            <StyledTextArea>
              {label && <StyledLabelArea>{label}</StyledLabelArea>}
              {summary && (
                <StyledSummaryArea>
                  {typeof summary === "string" ? (
                    <StyleSummaryTypography variant="subtitle2">
                      {summary}
                    </StyleSummaryTypography>
                  ) : (
                    summary
                  )}
                </StyledSummaryArea>
              )}
            </StyledTextArea>
            {error && (
              <FontIcon
                aria-label="error"
                size={theme.fontSize.smallIcon}
                color={theme.palette.error.light}
              >
                <CircleExclamationSolidIcon />
              </FontIcon>
            )}
          </StyledAccordionArea>
          {forceExpand ? undefined : (
            <RotateAnimation
              animate={expanded ? 180 : 0}
              ease="ease-out"
              duration={0.15}
            >
              <StyledExpandIconArea>
                <FontIcon
                  aria-label={expanded ? "Collapse" : "Expand"}
                  size={theme.fontSize.smallIcon}
                >
                  <AngleUpRegularIcon />
                </FontIcon>
              </StyledExpandIconArea>
            </RotateAnimation>
          )}
          {moreIcon && (
            <MoreButton
              propertyPath={property}
              moreTooltip={moreTooltip}
              moreIconSize={moreIconSize}
              onMore={onMore}
            />
          )}
        </InputAccordionSummary>
        <InputAccordionDetails className={inset ? "inset" : variant}>
          <StyledObjectChildrenArea style={{ paddingLeft: theme.spacing(2) }}>
            {children}
          </StyledObjectChildrenArea>
        </InputAccordionDetails>
      </InputAccordion>
    </StyledObjectFieldArea>
  );
};

export default ObjectFieldArea;
