import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import IconButton from "@material-ui/core/IconButton";
import OutlinedInput from "@material-ui/core/OutlinedInput";
import Typography from "@material-ui/core/Typography";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import EyeSlashSolidIcon from "../../../resources/icons/solid/eye-slash.svg";
import EyeSolidIcon from "../../../resources/icons/solid/eye.svg";
import RotateLeftSolidIcon from "../../../resources/icons/solid/rotate-left.svg";
import { ActionCodeQuery } from "../../impower-auth";
import { debounce } from "../../impower-core";
import { FontIcon } from "../../impower-icon";
import { DynamicLoadingButton, TextField } from "../../impower-route";
import { CaptchaActions } from "../../impower-route/components/elements/Captcha";
import { useRouter } from "../../impower-router";
import { ToastContext, toastTop } from "../../impower-toast";
import { UserContext, userSetTempEmail } from "../../impower-user";

const emailIncorrect = "We cannot find an account with that email address.";
const emailInvalid = "Please enter a valid email address.";
const passwordInvalid = "Please enter a valid password.";
const codeInvalid = "Please enter a valid code.";
const resetPasswordTitle = "Reset Your Password";
const resetPasswordButton = "Change Password";
const confirmationCodeSentAlert = "A confirmation code was sent to your email!";
const resetPasswordSuccess = "Your password was changed. Logging you in...";
const resendCodeQuestion = "Lost your code? Resend Code";

const Captcha = dynamic(
  () => import("../../impower-route/components/elements/Captcha"),
  { ssr: false }
);

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

const StyledContainer = styled.div`
  padding: ${(props): string => props.theme.spacing(0, 3)};
  max-width: 100%;
  width: ${(props): string => props.theme.spacing(50)};
  margin: auto;
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

const ResetPasswordForm = (): JSX.Element => {
  const [, toastDispatch] = useContext(ToastContext);
  const [userState, userDispatch] = useContext(UserContext);
  const { tempEmail } = userState;
  const router = useRouter();
  const theme = useTheme();

  const [reveal, setReveal] = useState(false);
  const [progress, setProgress] = useState(false);
  const [query, setQuery] = useState<ActionCodeQuery>();
  const [queryEmail, setQueryEmail] = useState<string>();
  const [emailValue, setEmailValue] = useState(tempEmail || "");
  const [codeValue, setCodeValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [codeError, setCodeError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();

  const emailInput = useRef<HTMLInputElement | null>(null);
  const codeInput = useRef<HTMLInputElement | null>(null);
  const passwordInput = useRef<HTMLInputElement | null>(null);
  const captchaActionsRef = useRef<CaptchaActions>();

  useEffect(() => {
    if (tempEmail) {
      setEmailValue(tempEmail);
    }
  }, [tempEmail]);

  const handleRevealPassword = useCallback((): void => {
    setReveal(!reveal);
  }, [reveal]);

  const handleResetPassword = useCallback(
    async (captcha: string) => {
      const email = emailInput.current?.value?.trim();
      const password = passwordInput.current?.value;
      const code = codeInput.current?.value;
      setProgress(true);
      setEmailError(undefined);
      setCodeError(undefined);
      setPasswordError(undefined);
      if (!email) {
        setEmailError(emailInvalid);
      }
      if (!code) {
        setCodeError(codeInvalid);
      }
      if (!password) {
        setPasswordError(passwordInvalid);
      }
      if (!email || !code || !password) {
        setProgress(false);
        return;
      }
      const API = (await import("../../impower-api/classes/api")).default;
      const resetPassword = (
        await import("../../impower-auth/utils/resetPassword")
      ).default;
      try {
        await resetPassword(code, password);
        toastDispatch(toastTop(resetPasswordSuccess, "success"));
        await API.instance.login({ email, password, captcha });
        setProgress(false);
        router.replace("/login");
      } catch (error) {
        const logError = (await import("../../impower-logger/utils/logError"))
          .default;
        setProgress(false);
        switch (error.code) {
          case "auth/invalid-email":
            setEmailError(emailInvalid);
            break;
          case "auth/user-not-found":
            setEmailError(emailIncorrect);
            break;
          case "auth/invalid-password":
            setPasswordError(passwordInvalid);
            break;
          default:
            toastDispatch(toastTop(error.message, "error"));
            logError("Auth", error);
        }
      }
    },
    [router, toastDispatch]
  );

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
    const forgotPassword = (
      await import("../../impower-auth/utils/forgotPassword")
    ).default;
    try {
      await forgotPassword(email);
      setProgress(false);
      toastDispatch(toastTop(confirmationCodeSentAlert, "info"));
    } catch (error) {
      const logError = (await import("../../impower-logger/utils/logError"))
        .default;
      setProgress(false);
      switch (error.code) {
        case "auth/invalid-email":
          setEmailError(emailInvalid);
          break;
        case "auth/user-not-found":
          setEmailError(emailIncorrect);
          break;
        default:
          toastDispatch(toastTop(error.message, "error"));
          logError("Auth", error);
      }
    }
  }, [toastDispatch]);

  useEffect(() => {
    const query = router.query as unknown as ActionCodeQuery;
    if (query) {
      setQuery(query);
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, router.query]);

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

  const handlePasswordInputChange = useCallback((e): void => {
    setPasswordValue(e.target.value);
  }, []);

  const handleCodeInputChange = useCallback((e): void => {
    setCodeValue(e.target.value);
  }, []);

  const handleVerifiedSubmit = useCallback(
    async (captcha: string) => {
      handleResetPassword(captcha);
    },
    [handleResetPassword]
  );

  const handleCaptchaChange = useCallback(
    async (captcha) => {
      if (!captcha) {
        // Captcha expired
        return;
      }
      handleVerifiedSubmit(captcha);
    },
    [handleVerifiedSubmit]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent | React.MouseEvent) => {
      e.preventDefault();
      if (captchaActionsRef.current) {
        captchaActionsRef.current.execute();
      }
    },
    []
  );

  return (
    <StyledPaper>
      <StyledAvatar>
        <FontIcon aria-label={resetPasswordTitle} size={24}>
          <RotateLeftSolidIcon />
        </FontIcon>
      </StyledAvatar>
      <StyledTitleTypography variant="h5">
        {resetPasswordTitle}
      </StyledTitleTypography>
      <StyledContainer>
        <StyledForm method="post" noValidate onSubmit={handleSubmit}>
          <StyledGrid
            style={{
              marginBottom: theme.spacing(1.5),
            }}
          >
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
            <StyledItem>
              <TextField
                inputRef={passwordInput}
                value={passwordValue}
                error={passwordError !== undefined}
                helperText={passwordError}
                label="Password"
                name="password"
                id="password"
                type={reveal ? "text" : "password"}
                variant="outlined"
                InputComponent={OutlinedInput}
                required
                fullWidth
                autoComplete="current-password"
                onChange={handlePasswordInputChange}
                InputProps={{
                  endAdornment: (
                    <IconButton onClick={handleRevealPassword}>
                      <FontIcon
                        aria-label="Reveal Password"
                        size={theme.fontSize.smallIcon}
                        color={theme.palette.grey[600]}
                      >
                        {reveal ? <EyeSolidIcon /> : <EyeSlashSolidIcon />}
                      </FontIcon>
                    </IconButton>
                  ),
                }}
              />
            </StyledItem>
          </StyledGrid>
          <Captcha
            actionsRef={captchaActionsRef}
            disableNotice
            onVerify={handleCaptchaChange}
          />
          <StyledSubmitButton
            loading={progress}
            type="submit"
            fullWidth
            variant="contained"
            color="primary"
            size="large"
            disabled={!emailValue || !codeValue || !passwordValue}
            onClick={handleSubmit}
          >
            {resetPasswordButton}
          </StyledSubmitButton>
          <StyledGrid style={{ alignItems: "flex-end" }}>
            <StyledItem>
              <StyledLink color="secondary" onClick={handleResendCode}>
                {resendCodeQuestion}
              </StyledLink>
            </StyledItem>
          </StyledGrid>
        </StyledForm>
      </StyledContainer>
    </StyledPaper>
  );
};

export default ResetPasswordForm;
