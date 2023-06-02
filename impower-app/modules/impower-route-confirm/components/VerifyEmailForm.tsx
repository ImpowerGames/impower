import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import OutlinedInput from "@mui/material/OutlinedInput";
import Typography from "@mui/material/Typography";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import EnvelopeSolidIcon from "../../../resources/icons/solid/envelope.svg";
import { ActionCodeMode, ActionCodeQuery } from "../../impower-auth";
import { debounce } from "../../impower-core";
import { FontIcon } from "../../impower-icon";
import { DynamicLoadingButton, TextField } from "../../impower-route";
import { useRouter } from "../../impower-router";
import { ToastContext, toastTop } from "../../impower-toast";
import { UserContext, userSetTempEmail } from "../../impower-user";

const verifyEmailTitle = "Verify Your Email";
const verifyEmailButton = "Verify";
const emailInvalid = "Please enter a valid email address.";
const codeInvalid = "Please enter a valid code.";
const confirmationCodeSentAlert = "A confirmation code was sent to your email!";
const confirmEmailVerificationSuccess = "Your email was successfully verified!";
const resendCodeQuestion = "Lost your code? Resend Code";

const StyledPaper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const StyledAvatar = styled.div`
  margin: ${(props): string => props.theme.spacing(1)};
  background-color: ${(props): string => props.theme.palette.secondary.main};
  color: white;
  border-radius: 50%;
  padding: ${(props): string => props.theme.spacing(1.5)};
`;

const StyledTitleTypography = styled(Typography)`
  padding: ${(props): string => props.theme.spacing(1)};
`;

const StyledForm = styled.form`
  width: 100%; // Fix IE 11 issue.
  margin-top: ${(props): string => props.theme.spacing(1)};
`;

const StyledSubmitButton = styled(DynamicLoadingButton)`
  margin: ${(props): string => props.theme.spacing(1.5, 0, 2)};
`;

const StyledGrid = styled.div`
  display: flex;
  flex-direction: column;
`;

const StyledItem = styled.div`
  padding: ${(props): string => props.theme.spacing(1)};
`;

const StyledLink = styled(Button)`
  text-transform: none;
  white-space: nowrap;
  padding: 0;
`;

const VerifyEmailForm = (): JSX.Element => {
  const [, toastDispatch] = useContext(ToastContext);
  const [userState, userDispatch] = useContext(UserContext);
  const { tempEmail } = userState;

  const [progress, setProgress] = useState(false);
  const [queryEmail, setQueryEmail] = useState<string>();
  const [emailValue, setEmailValue] = useState(tempEmail || "");
  const [codeValue, setCodeValue] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [codeError, setCodeError] = useState<string>();

  const emailInput = useRef<HTMLInputElement | null>(null);
  const codeInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (tempEmail) {
      setEmailValue(tempEmail);
    }
  }, [tempEmail]);

  const handleVerifyEmail = useCallback(
    async (code: string) => {
      setProgress(true);
      setCodeError(undefined);
      if (!code) {
        setCodeError(codeInvalid);
      }
      if (!code) {
        setProgress(false);
        return;
      }
      try {
        const confirmEmailVerification = (
          await import("../../impower-auth/utils/confirmEmailVerification")
        ).default;
        await confirmEmailVerification(code);
        setProgress(false);
        toastDispatch(toastTop(confirmEmailVerificationSuccess, "success"));
        const router = (await import("next/router")).default;
        router.push("/dashboard");
      } catch (error) {
        const logError = (await import("../../impower-logger/utils/logError"))
          .default;
        setProgress(false);
        switch (error.code) {
          case "auth/invalid-verification-code":
            setEmailError(codeInvalid);
            break;
          default:
            toastDispatch(toastTop(error.message, "error"));
            logError("Auth", error);
        }
      }
    },
    [toastDispatch]
  );

  const router = useRouter();
  const query = router.query as unknown as ActionCodeQuery;

  useEffect(() => {
    if (query) {
      if (query.oobCode) {
        setCodeValue(query.oobCode);
      }
      if (query.continueUrl) {
        const emailKey = "email=";
        const email = query.continueUrl.substring(
          query.continueUrl.indexOf(emailKey) + emailKey.length
        );
        setQueryEmail(email);
        setEmailValue(email);
      }
      if (query.mode === ActionCodeMode.verifyEmail && query.oobCode) {
        handleVerifyEmail(query.oobCode);
      }
    }
  }, [handleVerifyEmail, query]);

  const handleResendCode = useCallback(async () => {
    setProgress(true);
    const email = emailInput.current?.value?.trim();
    if (!email) {
      setEmailError(emailInvalid);
    }
    if (!email) {
      setProgress(false);
      return;
    }
    setEmailError(undefined);
    try {
      const requestEmailVerification = (
        await import("../../impower-auth/utils/requestEmailVerification")
      ).default;
      await requestEmailVerification();
      setProgress(false);
      toastDispatch(toastTop(confirmationCodeSentAlert, "info"));
    } catch (error) {
      const logError = (await import("../../impower-logger/utils/logError"))
        .default;
      setProgress(false);
      switch (error.code) {
        default:
          toastDispatch(toastTop(error.message, "error"));
          logError("Auth", error);
      }
    }
  }, [toastDispatch]);

  const onEmailChanged = useCallback(async (): Promise<void> => {
    const email = emailInput.current?.value?.trim();
    if (email) {
      // Save attributes
      userDispatch(userSetTempEmail(email));
    }
  }, [userDispatch]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const saveEmail = useCallback(debounce(onEmailChanged, 200), []);

  const handleEmailInputChange = useCallback(
    (e): void => {
      setEmailValue(e.target.value);
      saveEmail();
    },
    [saveEmail]
  );

  const handleCodeInputChange = useCallback((e): void => {
    setCodeValue(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent | React.MouseEvent) => {
      e.preventDefault();
      handleVerifyEmail(codeValue);
    },
    [codeValue, handleVerifyEmail]
  );

  return (
    <StyledPaper>
      <StyledAvatar>
        <FontIcon aria-label={verifyEmailTitle} size={24}>
          <EnvelopeSolidIcon />
        </FontIcon>
      </StyledAvatar>
      <StyledTitleTypography variant="h5">
        {verifyEmailTitle}
      </StyledTitleTypography>
      <StyledForm method="post" noValidate onSubmit={handleSubmit}>
        <StyledGrid>
          <StyledItem>
            <TextField
              inputRef={emailInput}
              value={emailValue}
              disabled={queryEmail !== undefined}
              error={emailError !== undefined}
              helperText={emailError}
              label="Email"
              id="email"
              name="email"
              autoComplete="email"
              variant="outlined"
              InputComponent={OutlinedInput}
              required
              fullWidth
              onChange={handleEmailInputChange}
            />
          </StyledItem>
          <StyledItem>
            <TextField
              inputRef={codeInput}
              value={codeValue}
              disabled={query?.oobCode !== undefined}
              error={codeError !== undefined}
              helperText={codeError}
              label="Confirmation Code"
              id="one-time-code"
              name="one-time-code"
              autoComplete="one-time-code"
              variant="outlined"
              InputComponent={OutlinedInput}
              required
              fullWidth
              onChange={handleCodeInputChange}
            />
          </StyledItem>
        </StyledGrid>
        <StyledSubmitButton
          loading={progress}
          type="submit"
          fullWidth
          variant="contained"
          color="primary"
          size="large"
          disabled={!codeValue}
          onClick={handleSubmit}
        >
          {verifyEmailButton}
        </StyledSubmitButton>
        <StyledGrid style={{ alignItems: "flex-end" }}>
          <StyledItem>
            <StyledLink color="secondary" onClick={handleResendCode}>
              {resendCodeQuestion}
            </StyledLink>
          </StyledItem>
        </StyledGrid>
      </StyledForm>
    </StyledPaper>
  );
};

export default VerifyEmailForm;
