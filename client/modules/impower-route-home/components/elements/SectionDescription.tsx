import styled from "@emotion/styled";
import { PropsWithChildren } from "react";

const StyledDescription = styled.div`
  padding: ${(props): string => props.theme.spacing(4)}
    ${(props): string => props.theme.spacing(8)};
  ${(props): string => props.theme.breakpoints.down("sm")} {
    padding: ${(props): string => props.theme.spacing(4)}
      ${(props): string => props.theme.spacing(4)};
  }
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
  margin: auto;
  white-space: pre-wrap;
`;

interface SectionDescriptionProps {
  fontSize?: string;
  alignItems?: string;
  maxWidth?: number | string;
  paddingTop?: number | string;
  paddingBottom?: number | string;
}

const SectionDescription = (
  props: PropsWithChildren<SectionDescriptionProps>
): JSX.Element => {
  const {
    fontSize,
    alignItems,
    maxWidth,
    paddingTop,
    paddingBottom,
    children,
  } = props;
  return (
    <StyledDescription
      style={{ fontSize, maxWidth, alignItems, paddingTop, paddingBottom }}
    >
      {children}
    </StyledDescription>
  );
};

export default SectionDescription;
