import styled from "@emotion/styled";
import AccordionSummary from "@mui/material/AccordionSummary";

const InputAccordionSummary = styled(AccordionSummary)`
  &.MuiAccordionSummary-root {
    min-height: ${(props): string => props.theme.spacing(5)};
    padding-left: 0;
    padding-right: 0;
  }
  &.MuiAccordionSummary-root.Mui-expanded {
    min-height: ${(props): string => props.theme.spacing(5)};
  }
  & .MuiAccordionSummary-content {
    margin: 0;
  }
  & .MuiAccordionSummary-content.Mui-expanded {
    margin: 0;
  }
`;

export default InputAccordionSummary;
