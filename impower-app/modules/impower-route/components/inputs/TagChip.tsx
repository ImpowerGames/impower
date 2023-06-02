import styled from "@emotion/styled";
import Chip, { ChipProps } from "@mui/material/Chip";
import React from "react";

const StyledChipIconArea = styled.div`
  padding-left: ${(props): string => props.theme.spacing(1)};
  padding-right: ${(props): string => props.theme.spacing(0.5)};
`;

const StyledChip = styled(Chip)`
  height: ${(props): string => props.theme.spacing(5)};
  border-radius: ${(props): string => props.theme.spacing(3)};
  padding: ${(props): string => props.theme.spacing(0, 0.5)};
  font-size: 0.9375rem;
  transition: none;

  &.MuiChip-clickable:active {
    box-shadow: none;
  }

  & .MuiChip-deleteIcon {
    height: 100%;
  }

  & .MuiChip-label {
    text-overflow: clip;
  }
`;

const TagChip = React.memo((props: ChipProps): JSX.Element => {
  const { icon } = props;
  return (
    <StyledChip
      {...props}
      icon={icon ? <StyledChipIconArea>{icon}</StyledChipIconArea> : undefined}
    />
  );
});

export default TagChip;
