import styled from "@emotion/styled";
import Typography from "@mui/material/Typography";
import React from "react";
import MascotSvg from "../../../../resources/mascot/professor-sad-00.svg";
import MascotIllustration from "./MascotIllustration";

const StyledLabelTypography = styled(Typography)`
  margin-left: ${(props): string => props.theme.spacing(3)};
  margin-right: ${(props): string => props.theme.spacing(3)};
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  z-index: 10;
`;

interface MascotIllustrationProps {
  size?: number;
  error?: string;
}

const AnimatedErrorMascotIllustration = React.memo(
  (props: MascotIllustrationProps): JSX.Element => {
    const { size = 300, error } = props;

    return (
      <MascotIllustration size={size} image={<MascotSvg />}>
        <StyledLabelTypography variant="h3" color="textSecondary">
          {error}
        </StyledLabelTypography>
      </MascotIllustration>
    );
  }
);

export default AnimatedErrorMascotIllustration;
