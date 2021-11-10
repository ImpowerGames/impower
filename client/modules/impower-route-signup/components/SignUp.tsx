import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Autocomplete, {
  AutocompleteProps,
  createFilterOptions,
} from "@material-ui/core/Autocomplete";
import Button from "@material-ui/core/Button";
import FormControl from "@material-ui/core/FormControl";
import FormHelperText from "@material-ui/core/FormHelperText";
import FormLabel from "@material-ui/core/FormLabel";
import IconButton from "@material-ui/core/IconButton";
import OutlinedInput from "@material-ui/core/OutlinedInput";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import { FilterOptionsState } from "@material-ui/core/useAutocomplete";
import NextLink from "next/link";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import EyeSlashSolidIcon from "../../../resources/icons/solid/eye-slash.svg";
import EyeSolidIcon from "../../../resources/icons/solid/eye.svg";
import Logo from "../../../resources/logos/logo-flat-color.svg";
import { AuthErrorCode } from "../../impower-auth";
import { debounce } from "../../impower-core";
import { useDialogNavigation } from "../../impower-dialog";
import { FontIcon } from "../../impower-icon";
import {
  DynamicLoadingButton,
  LegalNotice,
  TextField,
} from "../../impower-route";
import Captcha, {
  CaptchaActions,
} from "../../impower-route/components/elements/Captcha";
import { ToastContext, toastTop } from "../../impower-toast";
import {
  UserContext,
  userSetTempEmail,
  userSetTempUsername,
} from "../../impower-user";

const usernameMaxLength = 15;
const usernameRegex = "^[a-zA-Z0-9_]+$";
const dobMinAge = 13;
const signupUsernameAlreadyExists = "Username is already taken.";
const usernameInvalidCharacters =
  "Username must only contain alphanumeric characters or underscores.";
const usernameInvalidLength =
  "Username must be less than {count} characters long";
const usernameInvalid = "Please enter a valid username.";
const signupEmailAlreadyExists =
  "This email address is already in use by another account.";
const emailInvalid = "Please enter a valid email address.";
const passwordInvalid = "Please enter a valid password.";
const passwordTooShort = "Password must be a string with at least 6 characters";
const dobInvalid = "Please enter a valid date of birth.";
const dobUnderage = "You must be at least {age} years old to register.";
const signupPasswordWeak = "Password must be at least 6 characters long.";
const signUp = "Sign Up";
const signUpTitle = "Create an account";
const logInQuestion = "Already have an account? Log in";

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
`;

const StyledLogo = styled(Logo)`
  width: 56px;
  height: 56px;
`;

const StyledContainer = styled.div`
  max-width: 100%;
  width: ${(props): string => props.theme.spacing(60)};
  margin: auto;
  padding: ${(props): string => props.theme.spacing(0, 3)};
  ${(props): string => props.theme.breakpoints.down("md")} {
    padding: 0;
  }
`;

const StyledLink = styled(Button)`
  text-transform: none;
  white-space: nowrap;
  padding: 0;
`;

const StyledIconButton = styled(IconButton)``;

const StyledGrid = styled.div`
  display: flex;
  flex-direction: column;
`;

const StyledItem = styled.div`
  padding: ${(props): string => props.theme.spacing(1)};
`;

const StyledGroup = styled.div`
  display: flex;
  margin: ${(props): string => props.theme.spacing(0.5, -0.5, -0.5, -0.5)};
`;

const StyledFormControl = styled(FormControl)`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledFormLabel = styled(FormLabel)``;

const StyledFieldArea = styled.div``;

const StyledAutocomplete = styled(Autocomplete)``;

interface DateAutocompleteProps
  extends Partial<AutocompleteProps<number, boolean, boolean, boolean>> {
  label?: string;
  error?: boolean;
}

const DateAutocomplete = React.memo((props: DateAutocompleteProps) => {
  const { label, error, disabled, value, options, getOptionLabel, onChange } =
    props;
  const handleRenderInput = useCallback(
    (params): React.ReactNode => (
      <TextField
        {...params}
        variant="outlined"
        InputComponent={OutlinedInput}
        label={label}
        error={error}
      />
    ),
    [error, label]
  );

  const defaultFilterOptions = useMemo(
    () =>
      createFilterOptions({
        matchFrom: "start",
      }),
    []
  );

  const handleFilterOptions = useCallback(
    (options: unknown[], state: FilterOptionsState<unknown>): unknown[] => {
      const { inputValue } = state;
      const validatedState = {
        ...state,
        inputValue:
          !Number.isNaN(Number(inputValue)) &&
          inputValue.length === 1 &&
          !inputValue.startsWith("0")
            ? `0${inputValue}`
            : inputValue,
      };
      return defaultFilterOptions(options, validatedState);
    },
    [defaultFilterOptions]
  );

  return (
    <StyledAutocomplete
      disabled={disabled}
      value={value}
      options={options}
      autoHighlight
      autoSelect
      blurOnSelect
      forcePopupIcon={false}
      disablePortal
      disableClearable
      getOptionLabel={getOptionLabel}
      onChange={onChange}
      renderInput={handleRenderInput}
      filterOptions={handleFilterOptions}
    />
  );
});

const getAge = (dob: Date): number => {
  const monthDiff = Date.now() - dob.getTime();
  const ageDate = new Date(monthDiff);
  const year = ageDate.getUTCFullYear();
  return Math.abs(year - 1970);
};

interface SignUpProps {
  onOpenLogin?: (e: React.MouseEvent) => void;
  onProcessing?: (processing: boolean) => void;
}

const SignUp = React.memo((props: SignUpProps): JSX.Element => {
  const { onOpenLogin, onProcessing } = props;

  const [, toastDispatch] = useContext(ToastContext);
  const [userState, userDispatch] = useContext(UserContext);
  const { isSignedIn, isAnonymous, tempUsername, tempEmail } = userState;
  const theme = useTheme();

  const [reveal, setReveal] = useState(false);
  const [progress, setProgress] = useState(false);
  const [emailValue, setEmailValue] = useState(tempEmail || "");
  const [passwordValue, setPasswordValue] = useState("");
  const [usernameValue, setUsernameValue] = useState(tempUsername || "");
  const [dobYear, setDobYear] = useState<number>(null);
  const [dobMonth, setDobMonth] = useState<number>(null);
  const [dobDate, setDobDate] = useState<number>(null);
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [usernameError, setUsernameError] = useState<string>();
  const [dobError, setDobError] = useState<string>();

  const isSigningUpRef = useRef(false);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLDivElement>(null);
  const monthRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLDivElement>(null);
  const captchaActionsRef = useRef<CaptchaActions>();

  useEffect(() => {
    if (tempUsername) {
      setUsernameValue(tempUsername || "");
    }
    if (tempEmail) {
      setEmailValue(tempEmail || "");
    }
  }, [tempUsername, tempEmail]);

  useEffect(() => {
    if (isSignedIn && !isAnonymous && !isSigningUpRef.current) {
      if (window.location.pathname.startsWith("/signup")) {
        const redirect = async (): Promise<void> => {
          // Redirect if already authenticated
          const router = (await import("next/router")).default;
          router.replace("/pitch");
        };
        redirect();
      }
    }
  }, [isSignedIn, isAnonymous]);

  const onEmailChanged = useCallback(async (): Promise<void> => {
    const email = emailInputRef.current?.value?.trim();
    if (email) {
      // Save attributes
      userDispatch(userSetTempEmail(email));
    }
  }, [userDispatch]);

  const onUsernameChanged = useCallback(async (): Promise<void> => {
    const username = usernameInputRef.current?.value;
    if (username) {
      // Save attributes
      userDispatch(userSetTempUsername(username));
    }
  }, [userDispatch]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const saveEmail = useCallback(debounce(onEmailChanged, 200), [
    onEmailChanged,
  ]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const saveUsername = useCallback(debounce(onUsernameChanged, 200), [
    onUsernameChanged,
  ]);

  const handleRevealPassword = useCallback((): void => {
    setReveal(!reveal);
  }, [reveal]);

  const handleEmailInputChange = useCallback(
    (e): void => {
      setProgress(false);
      setEmailError(undefined);
      setEmailValue(e.target.value);
      saveEmail();
    },
    [saveEmail]
  );

  const handleUsernameInputChange = useCallback(
    (e): void => {
      setProgress(false);
      setUsernameError(undefined);
      setUsernameValue(e.target.value);
      saveUsername();
    },
    [saveUsername]
  );

  const handlePasswordInputChange = useCallback((e): void => {
    setProgress(false);
    setPasswordError(undefined);
    setPasswordValue(e.target.value);
  }, []);

  const handleGetMonthLabel = useCallback((value: number) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(value - 1);
    const label = date.toLocaleString("default", {
      month: "long",
    });
    return label;
  }, []);

  const handleGetNumberLabel = useCallback((value: number) => {
    return value.toString().padStart(2, "0");
  }, []);

  const handleDobMonthChange = useCallback(
    (event: React.SyntheticEvent, value: number) => {
      setProgress(false);
      setDobError(undefined);
      setDobMonth(value);
      const sibling = monthRef.current?.nextElementSibling?.querySelector(
        "input"
      ) as HTMLInputElement;
      if (sibling) {
        sibling.focus();
      }
    },
    []
  );

  const handleDobDateChange = useCallback(
    (event: React.SyntheticEvent, value: number) => {
      setProgress(false);
      setDobError(undefined);
      setDobDate(value);
      const sibling = dateRef.current?.nextElementSibling?.querySelector(
        "input"
      ) as HTMLInputElement;
      if (sibling) {
        sibling.focus();
      }
    },
    []
  );

  const handleDobYearChange = useCallback(
    (event: React.SyntheticEvent, value: number) => {
      setProgress(false);
      setDobError(undefined);
      setDobYear(value);
      const sibling = yearRef.current?.nextElementSibling?.querySelector(
        "input"
      ) as HTMLInputElement;
      if (sibling) {
        sibling.focus();
      }
    },
    []
  );

  const hasErrors = useCallback(async (): Promise<boolean> => {
    const format = (await import("../../impower-config/utils/format")).default;
    const username = usernameInputRef.current?.value?.trim();
    const email = emailInputRef.current?.value?.trim()?.toLowerCase();
    const password = passwordInputRef.current?.value;
    const dob = dobYear;
    let usernameError;
    let emailError;
    let passwordError;
    let dobError;
    if (!username) {
      usernameError = usernameInvalid;
    } else if (username.length > usernameMaxLength) {
      usernameError = format(usernameInvalidLength, {
        count: (usernameMaxLength + 1).toString(),
      });
    } else {
      const regex = new RegExp(usernameRegex);
      const usernameHasOnlyValidCharacters = regex.test(username);
      if (!usernameHasOnlyValidCharacters) {
        usernameError = usernameInvalidCharacters;
      }
    }
    if (!email) {
      emailError = emailInvalid;
    }
    if (!password) {
      passwordError = passwordInvalid;
    }
    if (password.length < 6) {
      passwordError = passwordTooShort;
    }
    if (!dob) {
      dobError = dobInvalid;
    } else if (getAge(new Date(dobYear, dobMonth, dobDate)) < dobMinAge) {
      dobError = format(dobUnderage, {
        age: dobMinAge,
      });
    }
    setUsernameError(usernameError);
    setEmailError(emailError);
    setPasswordError(passwordError);
    setDobError(dobError);
    if (usernameError || emailError || passwordError || dobError) {
      setProgress(false);
      return true;
    }
    return false;
  }, [dobDate, dobMonth, dobYear]);

  const [, closeAccountDialog] = useDialogNavigation("a");

  const handleVerifiedSubmit = useCallback(
    async (captcha?: string) => {
      const error = await hasErrors();
      if (error) {
        if (onProcessing) {
          onProcessing(false);
        }
        return;
      }
      const username = usernameInputRef.current?.value?.trim();
      const email = emailInputRef.current?.value?.trim()?.toLowerCase();
      const password = passwordInputRef.current?.value;
      setProgress(true);
      try {
        const DataStoreRead = (
          await import("../../impower-data-store/classes/dataStoreRead")
        ).default;
        const snapshot = await new DataStoreRead(
          "handles",
          username.toLowerCase()
        ).get();
        if (snapshot.exists()) {
          setProgress(false);
          setUsernameError(signupUsernameAlreadyExists);
        } else {
          const dob = new Date(dobYear, dobMonth, dobDate).toJSON();
          const API = (await import("../../impower-api/classes/api")).default;
          await API.instance.signup({
            email,
            password,
            username,
            dob,
            captcha,
          });
          if (onOpenLogin) {
            // Signup was accessed from account dialog popup
            closeAccountDialog();
          } else {
            const router = (await import("next/router")).default;
            router.push("/pitch");
          }
        }
      } catch (error) {
        const logError = (await import("../../impower-logger/utils/logError"))
          .default;
        setProgress(false);
        switch (error.code as AuthErrorCode) {
          case "auth/invalid-display-name":
            setUsernameError(usernameInvalid);
            break;
          case "auth/invalid-email":
            setEmailError(emailInvalid);
            break;
          case "auth/invalid-password":
            setPasswordError(passwordInvalid);
            break;
          case "auth/email-already-exists":
            setEmailError(signupEmailAlreadyExists);
            break;
          case "auth/weak-password":
            setPasswordError(signupPasswordWeak);
            break;
          default:
            toastDispatch(toastTop(error.message, "error"));
            logError("Auth", error);
        }
      }
      isSigningUpRef.current = false;
      if (captchaActionsRef.current) {
        captchaActionsRef.current.resetCaptcha();
      }
      if (onProcessing) {
        onProcessing(false);
      }
    },
    [
      hasErrors,
      onProcessing,
      dobYear,
      dobMonth,
      dobDate,
      onOpenLogin,
      closeAccountDialog,
      toastDispatch,
    ]
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
      isSigningUpRef.current = true;
      setProgress(true);
      if (onProcessing) {
        onProcessing(true);
      }
      if (captchaActionsRef.current) {
        captchaActionsRef.current.execute();
      }
    },
    [onProcessing]
  );

  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (v, k) => k + 1),
    []
  );
  const dateOptions = useMemo(
    () => Array.from({ length: 31 }, (v, k) => k + 1),
    []
  );
  const yearOptions = useMemo(
    () => Array.from({ length: 100 }, (v, k) => new Date().getFullYear() - k),
    []
  );

  return (
    <StyledPaper>
      <StyledHeader>
        <StyledLogo src="/images/logos/logo-flat-color.svg" />
      </StyledHeader>
      <StyledContainer>
        <StyledTitleTypography variant="h5">
          {signUpTitle}
        </StyledTitleTypography>
        <StyledForm method="post" noValidate onSubmit={handleSubmit}>
          <StyledGrid style={{ marginBottom: theme.spacing(1.5) }}>
            <StyledItem style={{ padding: 8 }}>
              <TextField
                inputRef={emailInputRef}
                disabled={progress}
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
            <StyledItem style={{ padding: 8 }}>
              <TextField
                inputRef={passwordInputRef}
                disabled={progress}
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
            <StyledItem style={{ padding: 8 }}>
              <TextField
                inputRef={usernameInputRef}
                disabled={progress}
                value={usernameValue}
                error={usernameError !== undefined}
                helperText={usernameError}
                label="Username"
                id="username"
                name="username"
                autoComplete="username"
                variant="outlined"
                InputComponent={OutlinedInput}
                required
                fullWidth
                onChange={handleUsernameInputChange}
                inputProps={{ maxLength: usernameMaxLength }}
              />
            </StyledItem>
            <StyledItem style={{ padding: 8 }}>
              <StyledFormControl
                disabled={progress}
                error={dobError !== undefined}
              >
                <StyledFormLabel>{`Date Of Birth`}</StyledFormLabel>
                <StyledGroup>
                  <StyledFieldArea
                    ref={monthRef}
                    style={{ flex: 1.85, padding: theme.spacing(0.5) }}
                  >
                    <DateAutocomplete
                      label={`Month`}
                      error={dobError !== undefined}
                      disabled={progress}
                      value={dobMonth}
                      options={monthOptions}
                      getOptionLabel={handleGetMonthLabel}
                      onChange={handleDobMonthChange}
                    />
                  </StyledFieldArea>
                  <StyledFieldArea
                    ref={dateRef}
                    style={{ flex: 1, padding: theme.spacing(0.5) }}
                  >
                    <DateAutocomplete
                      label={`Day`}
                      error={dobError !== undefined}
                      disabled={progress}
                      value={dobDate}
                      options={dateOptions}
                      getOptionLabel={handleGetNumberLabel}
                      onChange={handleDobDateChange}
                    />
                  </StyledFieldArea>
                  <StyledFieldArea
                    ref={yearRef}
                    style={{ flex: 1.25, padding: theme.spacing(0.5) }}
                  >
                    <DateAutocomplete
                      label={`Year`}
                      error={dobError !== undefined}
                      disabled={progress}
                      value={dobYear}
                      options={yearOptions}
                      getOptionLabel={handleGetNumberLabel}
                      onChange={handleDobYearChange}
                    />
                  </StyledFieldArea>
                </StyledGroup>
                {dobError && <FormHelperText>{dobError}</FormHelperText>}
              </StyledFormControl>
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
            disabled={!emailValue || !usernameValue || !passwordValue}
            onClick={handleSubmit}
          >
            {signUp}
          </StyledSubmitButton>
          <StyledGrid style={{ alignItems: "flex-end" }}>
            <StyledItem style={{ padding: 8 }}>
              {onOpenLogin ? (
                <StyledLink color="secondary" onClick={onOpenLogin}>
                  {logInQuestion}
                </StyledLink>
              ) : (
                <NextLink href={"/login"} replace passHref>
                  <StyledLink color="secondary">{logInQuestion}</StyledLink>
                </NextLink>
              )}
            </StyledItem>
          </StyledGrid>
        </StyledForm>
      </StyledContainer>
      <StyledItem style={{ padding: 8 }}>
        <LegalNotice
          register
          captcha
          style={{
            marginTop: theme.spacing(4),
          }}
        />
      </StyledItem>
    </StyledPaper>
  );
});

export default SignUp;
