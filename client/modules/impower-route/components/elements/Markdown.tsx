import styled from "@emotion/styled";
import Typography from "@material-ui/core/Typography";
import ReactMarkdown, { MarkdownToJSX } from "markdown-to-jsx";
import React from "react";
import LazyHydrate from "../../../impower-hydration/LazyHydrate";

const UnstyledMarkdown = styled.div``;

const StyledMarkdown = styled.div<{ darkmode?: string }>`
  overflow-wrap: break-word;
  overflow: hidden;

  font-size: 1rem;

  * {
    min-width: 0;
  }

  h1 {
    font-size: 1.5em;
  }

  h2 {
    font-size: 1.17em;
  }

  h3 {
    font-size: 1em;
  }

  h4 {
    font-size: 0.83em;
  }

  h5 {
    font-size: 0.67em;
  }

  h6 {
    font-size: 0.4em;
  }

  p {
    margin: 16px 0;
  }

  span {
    margin: 16px 0;
    display: inline-block;
  }

  pre {
    font-family: ${(props): string => props.theme.fontFamily.monospace};
    background-color: ${(props): string =>
      props.darkmode ? props.theme.colors.white05 : props.theme.colors.black05};
    border-radius: 4px;
    box-shadow: 0 0 0 1px
      ${(props): string =>
        props.darkmode
          ? props.theme.colors.white10
          : props.theme.colors.black10};
    padding: 8px 16px;
    overflow: auto;
  }

  blockquote {
    border-left: 6px solid
      ${(props): string =>
        props.darkmode
          ? props.theme.colors.white10
          : props.theme.colors.black10};
    padding-left: 12px;
    margin-left: 22px;
  }

  a {
    color: ${(props): string => props.theme.palette.secondary.main};
  }

  hr {
    margin: 0;
    border: none;
    flex-shrink: 0;
    padding: 8px 0;
    height: 17px;
    background-clip: content-box;
    background-color: ${(props): string =>
      props.darkmode ? props.theme.colors.white10 : props.theme.colors.black10};
  }

  ul li input {
    margin-right: 8px;
  }

  table {
    border: 1px solid
      ${(props): string =>
        props.darkmode
          ? props.theme.colors.white10
          : props.theme.colors.black10};
    border-collapse: separate;
    border-left: 0;
    border-radius: 4px;
    border-spacing: 0px;
  }

  thead {
    display: table-header-group;
    vertical-align: middle;
    border-color: inherit;
    border-collapse: separate;
  }

  tr {
    display: table-row;
    vertical-align: inherit;
    border-color: inherit;
  }

  th,
  td {
    padding: 8px 16px;
    text-align: left;
    vertical-align: top;
    border-left: 1px solid
      ${(props): string =>
        props.darkmode
          ? props.theme.colors.white10
          : props.theme.colors.black10};
  }

  td {
    border-top: 1px solid
      ${(props): string =>
        props.darkmode
          ? props.theme.colors.white10
          : props.theme.colors.black10};
  }

  thead:first-of-type tr:first-of-type th:first-of-type,
  tbody:first-of-type tr:first-of-type td:first-of-type {
    border-radius: 4px 0 0 0;
  }

  thead:last-of-type tr:last-of-type th:first-of-type,
  tbody:last-of-type tr:last-of-type td:first-of-type {
    border-radius: 0 0 0 4px;
  }
`;

const StyledTypography = styled(Typography)`
  margin: ${(props): string => props.theme.spacing(2, 0)};
  overflow-wrap: break-word;
  word-wrap: break-word;
`;

const CustomP = React.memo((props: { children: React.ReactNode }) => {
  const { children } = props;
  return <StyledTypography variant="body1">{children}</StyledTypography>;
});

interface MarkdownProps {
  darkmode?: boolean;
  defaultStyle?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactText;
  overrides?: MarkdownToJSX.Overrides;
}

const Markdown = (props: MarkdownProps): JSX.Element => {
  const { darkmode, defaultStyle, style, overrides = {}, children } = props;
  if (defaultStyle) {
    return (
      <LazyHydrate ssrOnly>
        <UnstyledMarkdown>
          <ReactMarkdown
            options={{
              overrides: {
                a: {
                  component: "a",
                  props: {
                    rel: "noopener noreferrer",
                    target: "_blank",
                  },
                },
                ...overrides,
              },
            }}
          >
            {typeof children === "number" ? children.toString() : children}
          </ReactMarkdown>
        </UnstyledMarkdown>
      </LazyHydrate>
    );
  }
  return (
    <LazyHydrate ssrOnly>
      <StyledMarkdown darkmode={darkmode ? "true" : undefined} style={style}>
        <ReactMarkdown
          options={{
            overrides: {
              a: {
                component: "a",
                props: {
                  rel: "noopener noreferrer",
                  target: "_blank",
                },
              },
              span: {
                component: CustomP,
              },
              ...overrides,
            },
          }}
        >
          {typeof children === "number" ? children.toString() : children}
        </ReactMarkdown>
      </StyledMarkdown>
    </LazyHydrate>
  );
};

export default Markdown;
