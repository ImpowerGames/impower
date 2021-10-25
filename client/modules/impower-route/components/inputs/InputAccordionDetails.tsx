import styled from "@emotion/styled";
import { AccordionDetails } from "@material-ui/core";

const InputAccordionDetails = styled(AccordionDetails)`
  &.MuiAccordionDetails-root {
    padding-left: 0;
    padding-right: 0;
    padding-top: ${(props): string => props.theme.spacing(0.5)};
    padding-bottom: 0;
    flex-direction: column;
  }
`;

export default InputAccordionDetails;
