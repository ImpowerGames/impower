import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { Typography } from "@material-ui/core";
import React, { PropsWithChildren } from "react";
import Markdown from "./Markdown";

const StyledInfoHelp = styled.div`
  display: flex;
  flex-direction: column;
  text-transform: none;
  border-radius: inherit;
`;

const StyledInfoTitleTypography = styled(Typography)`
  text-transform: uppercase;
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  padding-bottom: ${(props): string => props.theme.spacing(1.5)};
`;

const StyledInfoDescriptionArea = styled.div`
  font-weight: ${(props): number => props.theme.fontWeight.normal};
`;

const StyledInfoCaptionArea = styled.div`
  padding-top: ${(props): string => props.theme.spacing(1)};
  opacity: 0.6;
`;

interface InfoHelpProps {
  title?: string;
  description?: string;
  caption?: string;
  alignment?: "flex-start" | "center" | "flex-end";
}

const InfoHelp = (props: PropsWithChildren<InfoHelpProps>): JSX.Element => {
  const { title, description, caption, alignment, children } = props;
  const theme = useTheme();
  return (
    <StyledInfoHelp style={{ alignItems: alignment }}>
      {title && (
        <StyledInfoTitleTypography variant="body1">
          {title}
        </StyledInfoTitleTypography>
      )}
      {description && (
        <StyledInfoDescriptionArea>
          <Markdown darkmode>{description}</Markdown>
        </StyledInfoDescriptionArea>
      )}
      {caption && (
        <StyledInfoCaptionArea
          style={{ ...(theme.typography.body2 as React.CSSProperties) }}
        >
          <Markdown darkmode>{caption}</Markdown>
        </StyledInfoCaptionArea>
      )}
      {children}
    </StyledInfoHelp>
  );
};

export default InfoHelp;
