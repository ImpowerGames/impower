import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Slider from "@material-ui/core/Slider";
import Typography from "@material-ui/core/Typography";
import React, { useCallback } from "react";
import RandomizeButton from "./RandomizeButton";

const inspirationText = "Need some inspiration?";
const randomizeText = "Randomize!";

const StyledProjectTagsInspiration = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
`;

const StyledTypography = styled(Typography)`
  font-size: 0.9375rem;
  white-space: nowrap;
`;

const StyledInspirationTextArea = styled.div`
  position: absolute;
  top: -${(props): string => props.theme.spacing(4)};
  left: 0;
  right: 0;
`;

const StyledSliderArea = styled.div`
  position: absolute;
  bottom: ${(props): string => props.theme.spacing(-3.5)};
  left: 0;
  right: 0;
`;

const StyledSlider = styled(Slider)``;

interface ProjectTagsInspirationProps {
  min: number;
  max: number;
  amount: number;
  disabled?: boolean;
  onChangeAmount: (value: number) => void;
  onClick: () => void;
}

const ProjectTagsInspiration = React.memo(
  (props: ProjectTagsInspirationProps): JSX.Element => {
    const { min, max, amount, disabled, onChangeAmount, onClick } = props;
    const theme = useTheme();
    const handleChange = useCallback(
      (e, v): void => {
        onChangeAmount(v);
      },
      [onChangeAmount]
    );
    return (
      <StyledProjectTagsInspiration>
        <StyledInspirationTextArea>
          <StyledTypography>{inspirationText}</StyledTypography>
        </StyledInspirationTextArea>
        <RandomizeButton
          disabled={disabled}
          label={randomizeText}
          onClick={onClick}
        />
        <StyledSliderArea>
          <StyledSlider
            value={amount}
            valueLabelDisplay="auto"
            size="small"
            step={1}
            marks
            min={min}
            max={max}
            disabled={disabled}
            onChange={handleChange}
            style={{ padding: theme.spacing(1, 0) }}
          />
        </StyledSliderArea>
      </StyledProjectTagsInspiration>
    );
  }
);

export default ProjectTagsInspiration;
