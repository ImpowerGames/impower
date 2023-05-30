import styled from "@emotion/styled";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import React, { PropsWithChildren, useCallback, useState } from "react";
import Tabs from "../layouts/Tabs";
import Markdown from "./Markdown";

const StyledMarkdownHelp = styled.div`
  display: flex;
  flex-direction: column;
  text-transform: none;
  border-radius: inherit;
  max-width: 100%;
  width: 480px;
  color: white;
  align-items: center;
  margin: auto;
`;

const StyledTitleTypography = styled(Typography)`
  text-align: center;
`;

const StyledDescriptionTypography = styled(Typography)`
  margin-bottom: ${(props): string => props.theme.spacing(2)};
  text-align: center;
`;

const StyledComparisonArea = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  line-height: 1.25;
  font-size: 14px;
  font-weight: normal;
  margin-top: ${(props): string => props.theme.spacing(2)};
  width: 100%;
`;

const StyledInputArea = styled.div`
  padding: 22px 8px;
  font-family: ${(props): string => props.theme.fontFamily.monospace};
`;

const StyledOutputArea = styled.div`
  flex: 1;
  padding: ${(props): string => props.theme.spacing(1)};
  min-width: 300px;
  ${(props): string => props.theme.breakpoints.down("md")} {
    min-width: 200px;
  }
`;

const StyledTabs = styled(Tabs)``;

const StyledTab = styled(Tab)``;

interface MarkdownHelpProps {
  title?: string;
  description?: string;
  caption?: string;
  alignment?: "flex-start" | "center" | "flex-end";
}

const MarkdownHelp = (
  props: PropsWithChildren<MarkdownHelpProps>
): JSX.Element => {
  const { title, description, caption, alignment, children } = props;
  const [tabIndex, setTabIndex] = useState(0);
  const handleChange = useCallback((e: React.ChangeEvent, value: number) => {
    setTabIndex(value);
  }, []);
  return (
    <StyledMarkdownHelp style={{ alignItems: alignment }}>
      {title && (
        <StyledTitleTypography variant="h6">{title}</StyledTitleTypography>
      )}
      {children}
      {description && (
        <StyledDescriptionTypography variant="body1">
          {description}
        </StyledDescriptionTypography>
      )}
      <StyledTabs
        value={tabIndex}
        onChange={handleChange}
        variant="fullWidth"
        indicatorColor="white"
      >
        <StyledTab value={0} label={`WRITE`} />
        <StyledTab value={1} label={`PREVIEW`} />
      </StyledTabs>
      <StyledComparisonArea>
        {tabIndex === 0 ? (
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
        ) : (
          <StyledOutputArea>
            <Markdown darkmode>{caption}</Markdown>
          </StyledOutputArea>
        )}
      </StyledComparisonArea>
    </StyledMarkdownHelp>
  );
};

export default MarkdownHelp;
