import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import dynamic from "next/dynamic";
import { ActionCodeMode } from "../../impower-auth";
import { LegalNotice } from "../../impower-route";
import { useRouter } from "../../impower-router";

const verifyEmailTitle = "Verify Your Email";
const resetPasswordTitle = "Reset Your Password";

const ResetPasswordForm = dynamic(() => import("./ResetPasswordForm"), {
  ssr: false,
});

const VerifyEmailForm = dynamic(() => import("./VerifyEmailForm"), {
  ssr: false,
});

const StyledPaper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const StyledSubmitButton = styled(Button)`
  margin: ${(props): string => props.theme.spacing(1.5, 0, 2)};
`;

const StyledItem = styled.div`
  padding: ${(props): string => props.theme.spacing(1)};
`;

const Confirm = (): JSX.Element => {
  const router = useRouter();
  const theme = useTheme();

  const { query } = router;

  if (query?.mode === ActionCodeMode.resetPassword) {
    return <ResetPasswordForm />;
  }

  if (query?.mode === ActionCodeMode.verifyEmail) {
    return <VerifyEmailForm />;
  }

  return (
    <StyledPaper>
      <StyledSubmitButton
        type="submit"
        fullWidth
        variant="contained"
        color="primary"
        size="large"
        onClick={(): void => {
          router.replace({
            query: { mode: ActionCodeMode.resetPassword as string },
          });
        }}
      >
        {resetPasswordTitle}
      </StyledSubmitButton>
      <StyledSubmitButton
        type="submit"
        fullWidth
        variant="contained"
        color="primary"
        size="large"
        onClick={(): void => {
          router.replace({
            query: { mode: ActionCodeMode.verifyEmail as string },
          });
        }}
      >
        {verifyEmailTitle}
      </StyledSubmitButton>
      <StyledItem>
        <LegalNotice
          style={{
            marginTop: theme.spacing(6),
          }}
        />
      </StyledItem>
    </StyledPaper>
  );
};

export default Confirm;
