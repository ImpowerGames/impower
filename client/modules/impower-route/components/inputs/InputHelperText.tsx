import styled from "@emotion/styled";

const LeftHelperTextTypography = styled.p`
  margin: 0;
  text-align: left;
  flex: 1;
  padding-right: ${(props): string => props.theme.spacing(2)};
`;

const RightHelperTextTypography = styled.p`
  margin: 0;
  text-align: right;
`;

interface InputHelperTextProps {
  errorText: string;
  helperText: React.ReactNode;
  counterText: string;
}

const InputHelperText = (props: InputHelperTextProps): JSX.Element => {
  const { errorText, helperText, counterText } = props;
  const leftHelperText = errorText || helperText;
  const rightHelperText = counterText;
  if (!leftHelperText && !rightHelperText) {
    return null;
  }
  return (
    <>
      {leftHelperText && (
        <LeftHelperTextTypography
          className={LeftHelperTextTypography.displayName}
        >
          {leftHelperText}
        </LeftHelperTextTypography>
      )}
      {rightHelperText && (
        <RightHelperTextTypography
          className={RightHelperTextTypography.displayName}
        >
          {rightHelperText}
        </RightHelperTextTypography>
      )}
    </>
  );
};

export default InputHelperText;
