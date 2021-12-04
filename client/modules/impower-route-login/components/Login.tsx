import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import IconButton from "@material-ui/core/IconButton";
import OutlinedInput from "@material-ui/core/OutlinedInput";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import NextLink from "next/link";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import EyeSlashSolidIcon from "../../../resources/icons/solid/eye-slash.svg";
import EyeSolidIcon from "../../../resources/icons/solid/eye.svg";
import Logo from "../../../resources/logos/logo-flat-color.svg";
import { debounce } from "../../impower-core";
import { useDialogNavigation } from "../../impower-dialog";
import { FontIcon } from "../../impower-icon";
import {
  DynamicLoadingButton,
  LegalNotice,
  TextField,
} from "../../impower-route";
import { ToastContext, toastTop } from "../../impower-toast";
import { UserContext, userSetTempEmail } from "../../impower-user";
import ForgotPasswordForm from "./ForgotPasswordForm";

const emailIncorrect = "We cannot find an account with that email address.";
const loginPasswordIncorrect = "Incorrect password.";
const emailInvalid = "Please enter a valid email address.";
const passwordInvalid = "Please enter a valid password.";
const tooManyLoginAttempts =
  "Too many unsuccessful login attempts. Please try again later.";
const logIn = "Log In";
const loginTitle = "Welcome back!";
const forgotPasswordQuestion = "Forgot password?";
const signUpQuestion = "Don't have an account? Sign Up";

const StyledPaper = styled(Paper)`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${(props): string => props.theme.spacing(3, 4)};

  ${(props): string => props.theme.breakpoints.down("md")} {
    padding: ${(props): string => props.theme.spacing(2, 2)};
    box-shadow: none;
  }
`;

const StyledHeader = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledTitleTypography = styled(Typography)`
  text-align: center;
  padding: ${(props): string => props.theme.spacing(1)};
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  margin-bottom: ${(props): string => props.theme.spacing(1)};
`;

const StyledForm = styled.form`
  width: 100%;
  margin-top: ${(props): string => props.theme.spacing(1)};
`;

const StyledSubmitButton = styled(DynamicLoadingButton)`
  margin: ${(props): string => props.theme.spacing(1.5, 0, 2)};
  display: flex;
  justify-content: center;
`;

const StyledLink = styled(Button)`
  text-transform: none;
  white-space: nowrap;
  padding: 0;
`;

const StyledForgotPasswordLink = styled(StyledLink)`
  margin-right: ${(props): string => props.theme.spacing(2)};
`;

const StyledLogo = styled(Logo)`
  width: 56px;
  height: 56px;
`;

const StyledContainer = styled.div`
  padding: ${(props): string => props.theme.spacing(0, 3)};
  max-width: 100%;
  width: ${(props): string => props.theme.spacing(60)};
  margin: auto;
`;

const StyledIconButton = styled(IconButton)``;

const StyledGrid = styled.div`
  display: flex;
  flex-direction: column;
`;

const StyledList = styled.div`
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
`;

const StyledItem = styled.div`
  padding: ${(props): string => props.theme.spacing(1)};
`;

interface LoginFormProps {
  onForgotPassword?: () => void;
  onOpenSignUp?: (e: React.MouseEvent) => void;
  onProcessing?: (processing: boolean) => void;
}

const LoginForm = React.memo((props: LoginFormProps): JSX.Element | null => {
  const { onForgotPassword, onProcessing, onOpenSignUp } = props;

  const [, toastDispatch] = useContext(ToastContext);
  const [userState, userDispatch] = useContext(UserContext);
  const { tempEmail } = userState;
  const theme = useTheme();

  const [reveal, setReveal] = useState(false);
  const [progress, setProgress] = useState(false);
  const [emailValue, setEmailValue] = useState(tempEmail || "");
  const [passwordValue, setPasswordValue] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();

  const emailInput = useRef<HTMLInputElement | null>(null);
  const passwordInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (tempEmail) {
      setEmailValue(tempEmail || "");
    }
  }, [tempEmail]);

  const onEmailChanged = useCallback(async (): Promise<void> => {
    const email = emailInput.current?.value?.trim();
    if (email) {
      userDispatch(userSetTempEmail(email));
    }
  }, [userDispatch]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const saveEmail = useCallback(debounce(onEmailChanged, 200), []);

  const handleRevealPassword = useCallback((): void => {
    setReveal(!reveal);
  }, [reveal]);

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

  const [, closeAccountDialog] = useDialogNavigation("a");

  const handleVerifiedSubmit = useCallback(async () => {
    const email = emailInput.current?.value?.trim();
    const password = passwordInput.current?.value;
    let emailError;
    let passwordError;
    if (!email) {
      emailError = emailInvalid;
    }
    if (!password) {
      passwordError = passwordInvalid;
    }
    setProgress(false);
    setEmailError(emailError);
    setPasswordError(passwordError);
    if (emailError || passwordError) {
      if (onProcessing) {
        onProcessing(false);
      }
      return;
    }
    setProgress(true);
    try {
      const API = (await import("../../impower-api/classes/api")).default;
      await API.instance.login({ email, password });
      if (onOpenSignUp) {
        // Login was accessed from account dialog popup
        closeAccountDialog();
      } else {
        const router = (await import("next/router")).default;
        router.push("/pitch/game");
      }
    } catch (error) {
      const logError = (await import("../../impower-logger/utils/logError"))
        .default;
      setProgress(false);
      switch (error.code) {
        case "auth/invalid-email":
          setEmailError(emailInvalid);
          break;
        case "auth/invalid-password":
          setPasswordError(passwordInvalid);
          break;
        case "auth/user-not-found":
          setEmailError(emailIncorrect);
          break;
        case "auth/wrong-password":
          setPasswordError(loginPasswordIncorrect);
          break;
        case "auth/too-many-requests":
          setPasswordError(tooManyLoginAttempts);
          break;
        default:
          toastDispatch(toastTop(error.message, "error"));
          logError("Auth", error);
      }
    }
    if (onProcessing) {
      onProcessing(false);
    }
  }, [onProcessing, onOpenSignUp, closeAccountDialog, toastDispatch]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent | React.MouseEvent) => {
      e.preventDefault();
      if (onProcessing) {
        onProcessing(true);
      }
      handleVerifiedSubmit();
    },
    [handleVerifiedSubmit, onProcessing]
  );

  return (
    <>
      <StyledContainer>
        <StyledTitleTypography variant="h5">{loginTitle}</StyledTitleTypography>
        <StyledForm method="post" noValidate onSubmit={handleSubmit}>
          <StyledGrid>
            <StyledItem>
              <TextField
                inputRef={emailInput}
                value={emailValue}
                error={emailError !== undefined}
                helperText={emailError}
                label="Email Address"
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
                    <StyledIconButton onClick={handleRevealPassword}>
                      <FontIcon
                        aria-label="Reveal Password"
                        size={24}
                        color={theme.palette.grey[600]}
                      >
                        {reveal ? <EyeSolidIcon /> : <EyeSlashSolidIcon />}
                      </FontIcon>
                    </StyledIconButton>
                  ),
                }}
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
            disabled={!emailValue || !passwordValue}
            onClick={handleSubmit}
          >
            {logIn}
          </StyledSubmitButton>
          <StyledList>
            <StyledForgotPasswordLink
              color="secondary"
              onClick={onForgotPassword}
            >
              {forgotPasswordQuestion}
            </StyledForgotPasswordLink>
            {onOpenSignUp ? (
              <StyledLink color="secondary" onClick={onOpenSignUp}>
                {signUpQuestion}
              </StyledLink>
            ) : (
              <NextLink href={"/signup"} replace passHref>
                <StyledLink color="secondary">{signUpQuestion}</StyledLink>
              </NextLink>
            )}
          </StyledList>
        </StyledForm>
      </StyledContainer>
    </>
  );
});

interface LoginProps {
  onOpenSignUp?: (e: React.MouseEvent) => void;
  onProcessing?: (processing: boolean) => void;
}

const Login = React.memo((props: LoginProps): JSX.Element | null => {
  const { onOpenSignUp, onProcessing } = props;

  const [forgot, setForgot] = useState(false);

  const theme = useTheme();

  const handleForgot = useCallback(() => {
    setForgot(true);
  }, []);

  return (
    <StyledPaper>
      <StyledHeader>
        <StyledLogo />
      </StyledHeader>
      {forgot ? (
        <ForgotPasswordForm />
      ) : (
        <LoginForm
          onOpenSignUp={onOpenSignUp}
          onForgotPassword={handleForgot}
          onProcessing={onProcessing}
        />
      )}
      <StyledItem>
        <LegalNotice
          style={{
            marginTop: theme.spacing(6),
          }}
        />
      </StyledItem>
    </StyledPaper>
  );
});

export default Login;
