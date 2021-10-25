import styled from "@emotion/styled";
import { Typography } from "@material-ui/core";
import React from "react";
import MascotRelaxed00 from "../../../../resources/mascot/professor-relaxed-00.svg";
import MascotIllustration from "./MascotIllustration";

const StyledLabelTypography = styled(Typography)`
  margin-left: ${(props): string => props.theme.spacing(3)};
  margin-right: ${(props): string => props.theme.spacing(3)};
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  z-index: 10;
`;

interface MascotIllustrationProps {
  size?: number;
  message?: string;
}

const AnimatedWarningMascotIllustration = React.memo(
  (props: MascotIllustrationProps): JSX.Element => {
    const { size = 300, message } = props;

    return (
      <MascotIllustration size={size} image={<MascotRelaxed00 />}>
        <StyledLabelTypography variant="h4" color="textSecondary">
          {message}
        </StyledLabelTypography>
      </MascotIllustration>
    );
  }
);

export default AnimatedWarningMascotIllustration;
