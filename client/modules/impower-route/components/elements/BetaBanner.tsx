import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import React from "react";

const StyledBetaWarningButton = styled(Button)`
  background-color: ${(props): string => props.theme.palette.secondary.main};
  color: white;
  padding: ${(props): string => props.theme.spacing(1.5, 2)};
  border-radius: 0;
  text-transform: none;

  &.MuiButton-root:hover {
    background-color: ${(props): string => props.theme.palette.secondary.dark};
  }

  &.MuiButton-root.Mui-disabled {
    color: white;
  }

  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 1;
`;

const StyledWarningTypography = styled(Typography)`
  text-align: center;
`;

const StyledBoldWarningTypography = styled(StyledWarningTypography)`
  font-weight: bold;
`;

const BetaBanner = React.memo((): JSX.Element => {
  return (
    <StyledBetaWarningButton
      fullWidth
      href={`https://github.com/ImpowerGames/impower/issues`}
    >
      <StyledBoldWarningTypography>
        {`This site is in open beta.`}
      </StyledBoldWarningTypography>
      <StyledWarningTypography variant="caption">
        {`If you encounter bugs, please report them here. Thanks!`}
      </StyledWarningTypography>
    </StyledBetaWarningButton>
  );
});

export default BetaBanner;
