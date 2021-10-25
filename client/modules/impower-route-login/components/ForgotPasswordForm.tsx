import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import OutlinedInput from "@material-ui/core/OutlinedInput";
import Typography from "@material-ui/core/Typography";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import CircleExclamationSolidIcon from "../../../resources/icons/solid/circle-exclamation.svg";
import { debounce } from "../../impower-core";
import { FontIcon } from "../../impower-icon";
import { DynamicLoadingButton, TextField } from "../../impower-route";
import { ToastContext, toastTop } from "../../impower-toast";
import { UserContext, userSetTempEmail } from "../../impower-user";

const emailIncorrect = "We cannot find an account with that email address.";
const emailInvalid = "Please enter a valid email address.";
const forgotPasswordTitle = "Forgot Your Password?";
const forgotPasswordButton = "Submit";
const confirmationCodeSentAlert = "A confirmation code was sent to your email!";

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

const StyledGrid = styled.div`
  display: flex;
  flex-direction: column;
`;

const StyledItem = styled.div`
  padding: ${(props): string => props.theme.spacing(1)};
`;

interface ForgotPasswordFormProps {
  onProcessing?: (processing: boolean) => void;
}

const ForgotPasswordForm = React.memo(
  (props: ForgotPasswordFormProps): JSX.Element => {
    const { onProcessing } = props;

    const [, toastDispatch] = useContext(ToastContext);
    const [userState, userDispatch] = useContext(UserContext);
    const { isSignedIn, isAnonymous, tempEmail } = userState;
    const theme = useTheme();

    const [progress, setProgress] = useState(false);
    const [emailValue, setEmailValue] = useState(tempEmail || "");
    const [emailError, setEmailError] = useState<string>();

    const isLoggingIn = useRef(false);
    const emailInput = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      if (tempEmail) {
        setEmailValue(tempEmail);
      }
    }, [tempEmail]);

    useEffect(() => {
      if (isSignedIn && !isAnonymous && !isLoggingIn.current) {
        // Redirect if already authenticated
        if (window.location.pathname.startsWith("/login")) {
          const redirect = async (): Promise<void> => {
            const router = (await import("next/router")).default;
            router.replace("/pitch");
          };
          redirect();
        }
      }
    }, [isSignedIn, isAnonymous]);

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

    const handleSubmit = useCallback(
      async (e: React.FormEvent | React.MouseEvent) => {
        isLoggingIn.current = true;
        if (onProcessing) {
          onProcessing(true);
        }
        e.preventDefault();
        const email = emailInput.current?.value?.trim();
        let emailError;
        if (!email) {
          emailError = emailInvalid;
        }
        setProgress(false);
        setEmailError(emailError);
        if (emailError) {
          return;
        }
        setProgress(true);
        try {
          const forgotPassword = (
            await import("../../impower-auth/utils/forgotPassword")
          ).default;
          await forgotPassword(email);
          setProgress(false);
          toastDispatch(toastTop(confirmationCodeSentAlert, "info"));
          const router = (await import("next/router")).default;
          router.replace("/confirm");
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
        isLoggingIn.current = false;
        if (onProcessing) {
          onProcessing(false);
        }
      },
      [onProcessing, toastDispatch]
    );

    return (
      <>
        <StyledTitleTypography variant="h5">
          {forgotPasswordTitle}
        </StyledTitleTypography>
        <StyledForm method="post" noValidate onSubmit={handleSubmit}>
          <StyledGrid>
            <StyledItem>
              <TextField
                inputRef={emailInput}
                value={emailValue}
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
                InputProps={{
                  endAdornment: emailError ? (
                    <FontIcon
                      aria-label="error"
                      size={theme.fontSize.smallIcon}
                      color={theme.palette.error.main}
                    >
                      <CircleExclamationSolidIcon />
                    </FontIcon>
                  ) : undefined,
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
            disabled={!emailValue}
            onClick={handleSubmit}
          >
            {forgotPasswordButton}
          </StyledSubmitButton>
        </StyledForm>
      </>
    );
  }
);

export default ForgotPasswordForm;
