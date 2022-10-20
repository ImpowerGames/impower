import styled from "@emotion/styled";
import Accordion from "@mui/material/Accordion";

const InputAccordion = styled(Accordion)`
  background-color: transparent;
  color: inherit;
  box-shadow: none;
  & .MuiCollapse-root {
    margin: 0 0 0 -${(props): string => props.theme.spacing(8)};
    padding: 0 0 0 ${(props): string => props.theme.spacing(8)};
  }
  & .MuiCollapse-root.MuiCollapse-entered {
    margin: 0 0 0 -${(props): string => props.theme.spacing(8)};
    padding: 0 0 0 ${(props): string => props.theme.spacing(8)};
  }
  &.MuiAccordion-root.Mui-expanded {
    margin: 0;
  }
  &.MuiAccordion-rounded:last-of-type {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
  &.MuiAccordion-rounded:first-of-type {
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }
`;

export default InputAccordion;
