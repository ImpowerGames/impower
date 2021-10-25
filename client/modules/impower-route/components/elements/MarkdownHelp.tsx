import styled from "@emotion/styled";
import { Typography } from "@material-ui/core";
import React from "react";
import Markdown from "./Markdown";

const StyledMarkdownHelp = styled.div`
  display: flex;
  flex-direction: column;
  text-transform: none;
  border-radius: inherit;
  max-width: 800px;
  color: white;
  align-items: center;
`;

const StyledDescriptionTypography = styled(Typography)``;

const StyledComparisonArea = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  justify-content: center;
  line-height: 1.25;
  font-size: 14px;
  font-weight: normal;
  margin-top: ${(props): string => props.theme.spacing(2.5)};
`;

const StyledInputArea = styled.div`
  padding: 22px 8px;
  font-family: ${(props): string => props.theme.fontFamily.monospace};
  box-shadow: 0 0 0 1px ${(props): string => props.theme.colors.white10};
`;

const StyledOutputArea = styled.div`
  flex: 1;
  padding: ${(props): string => props.theme.spacing(1)};
  box-shadow: 0 0 0 1px ${(props): string => props.theme.colors.white10};
  min-width: 300px;
  ${(props): string => props.theme.breakpoints.down("md")} {
    min-width: 200px;
  }
`;

interface MarkdownHelpProps {
  title?: string;
  description?: string;
  caption?: string;
  alignment?: "flex-start" | "center" | "flex-end";
}

const MarkdownHelp = (props: MarkdownHelpProps): JSX.Element => {
  const { description, caption, alignment } = props;
  return (
    <StyledMarkdownHelp style={{ alignItems: alignment }}>
      <StyledDescriptionTypography variant="body1">
        {description}
      </StyledDescriptionTypography>
      <StyledComparisonArea>
        <StyledInputArea>
          {caption.split("\n").map((line, index) =>
            line.trim().length > 0 ? (
              <div
                key={index}
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                }}
              >
                {line}
              </div>
            ) : (
              <br key={index} />
            )
          )}
        </StyledInputArea>
        <StyledOutputArea>
          <Markdown darkmode>{caption}</Markdown>
        </StyledOutputArea>
      </StyledComparisonArea>
    </StyledMarkdownHelp>
  );
};

export default MarkdownHelp;
