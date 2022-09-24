import styled from "@emotion/styled";
import { Typography } from "@material-ui/core";
import { PropsWithChildren } from "react";

const StyledSectionTitle = styled(Typography)`
  padding: 0 ${(props): string => props.theme.spacing(8)};
  text-decoration: none;
  font-weight: 700;
  font-family: ${(props): string => props.theme.fontFamily.title};

  min-height: 32px;
  text-decoration: none;

  position: relative;
  z-index: 1;
`;

const SectionTitle = (props: PropsWithChildren<unknown>): JSX.Element => {
  const { children } = props;
  return (
    <StyledSectionTitle
      className={StyledSectionTitle.displayName}
      variant="h3"
      color="primary"
    >
      {children}
    </StyledSectionTitle>
  );
};

export default SectionTitle;
