import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { FilledInput, IconButton } from "@material-ui/core";
import Button from "@material-ui/core/Button";
import Divider from "@material-ui/core/Divider";
import OutlinedInput from "@material-ui/core/OutlinedInput";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import EyeSlashSolidIcon from "../../resources/icons/solid/eye-slash.svg";
import EyeSolidIcon from "../../resources/icons/solid/eye.svg";
import {
  ConfirmDialogContext,
  confirmDialogNavOpen,
} from "../impower-confirm-dialog";
import { Inspector } from "../impower-core";
import {
  createUserDocument,
  UserDocument,
  UserDocumentInspector,
} from "../impower-data-store";
import { SettingsDocumentInspector } from "../impower-data-store/classes/inspectors/settingsDocumentInspector";
import createSettingsDocument from "../impower-data-store/utils/createSettingsDocument";
import { useDialogNavigation } from "../impower-dialog";
import { FontIcon } from "../impower-icon";
import { TextField } from "../impower-route";
import InspectorForm from "../impower-route/components/forms/InspectorForm";
import BooleanInput from "../impower-route/components/inputs/BooleanInput";
import FileInput from "../impower-route/components/inputs/FileInput";
import InputHelperText from "../impower-route/components/inputs/InputHelperText";
import StringDialog from "../impower-route/components/inputs/StringDialog";
import StringInput from "../impower-route/components/inputs/StringInput";
import { ToastContext, toastTop } from "../impower-toast";
import { userOnSetSetting, userOnUpdateSubmission } from "../impower-user";
import { UserContext } from "../impower-user/contexts/userContext";

const changePasswordSuccess = "Password changed!";
const changeEmailSuccess = "Email changed!";
const passwordInvalid = "Please enter a valid password.";
const passwordWrong = "The password you entered was incorrect.";
const forgotPasswordQuestion = "Forgot password?";
const passwordResetEmailSent =
  "You should receive an email that explains how to reset your password.";
const signupUsernameAlreadyExists = "Username is already taken.";

const forgotPasswordConfirmationInfo = {
  title: "Reset Your Password?",
  content: "We will email you instructions for how to reset your password.",
  agreeLabel: "Yes, Reset My Password",
  disagreeLabel: "Cancel",
};

const StyledContainer = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const StyledPaper = styled(Paper)`
  padding: ${(props): string => props.theme.spacing(2, 4, 0, 4)};
  width: 100%;
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;

  ${(props): string => props.theme.breakpoints.down("sm")} {
    padding: ${(props): string => props.theme.spacing(1, 2, 0, 2)};
    box-shadow: none;
  }
`;

const StyledHeaderTypography = styled(Typography)`
  margin: ${(props): string => props.theme.spacing(2, 0)};
`;

const StyledDivider = styled(Divider)`
  margin-top: ${(props): string => props.theme.spacing(2)};
`;

const StyledLabel = styled.div`
  display: flex;
  justify-content: flex-start;
  padding-right: ${(props): string => props.theme.spacing(3)};
`;

const StyledValueArea = styled.div`
  flex: 1;
  position: relative;
  height: 100%;
`;

const StyledValue = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  height: fit-content;
  margin: auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: none;
  text-align: right;
  color: rgba(0, 0, 0, 0.7);
  font-weight: 400;
`;

const StyledAccountButtonArea = styled.div`
  display: flex;
  flex-direction: column;
`;

const StyledAccountButton = styled(Button)`
  display: flex;
  justify-content: flex-start;
  height: 56px;
  margin: ${(props): string => props.theme.spacing(1, 0)};
  border-color: rgba(0, 0, 0, 0.27);
  color: rgba(0, 0, 0, 0.87);
  white-space: nowrap;
`;

const StyledDialogTextField = styled(TextField)`
  & .MuiInputBase-root {
    border-radius: 0;
  }
`;

const StyledForgotPasswordArea = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const StyledForgotPasswordLink = styled(Button)`
  text-transform: none;
  white-space: nowrap;
`;

const StyledKeyboardTrigger = styled.input`
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  opacity: 0;
  pointer-events: none;
`;

const StyledIconButton = styled(IconButton)``;

const profilePropertyPaths = ["icon", "bio"];
const settingsPropertyPaths = ["nsfwVisible"];
const labels = {
  username: "Change Username",
  email: "Change Email",
  password: "Change Password",
};

const Profile = React.memo((): JSX.Element | null => {
  const [userState, userDispatch] = useContext(UserContext);
  const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
  const [, toastDispatch] = useContext(ToastContext);

  const uid = userState?.uid;
  const email = userState?.email;
  const userDoc = userState?.userDoc;
  const settingsDoc = userState?.settings?.account;

  const [newUserDoc, setNewUserDoc] = useState(userDoc);
  const [newSettingsDoc, setNewSettingsDoc] = useState(settingsDoc);
  const [dialogOpen, setDialogOpen] = useState<boolean>();
  const [dialogProperty, setDialogProperty] = useState<string>();
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [newEmail, setNewEmail] = useState<string>(email);
  const [dialogError, setDialogError] = useState<string>();
  const [currentPasswordError, setCurrentPasswordError] = useState<string>();
  const [savingBio, setSavingBio] = useState<boolean>();
  const [currentPasswordReveal, setCurrentPasswordReveal] = useState(false);
  const [newPasswordReveal, setNewPasswordReveal] = useState(false);

  const username = newUserDoc?.username;

  const keyboardTriggerRef = useRef<HTMLInputElement>();

  useEffect(() => {
    if (email) {
      setNewEmail(email);
    }
  }, [email]);

  useEffect(() => {
    if (userDoc) {
      setNewUserDoc(userDoc);
    }
  }, [userDoc]);

  useEffect(() => {
    if (settingsDoc) {
      setNewSettingsDoc(settingsDoc);
    }
  }, [settingsDoc]);

  const profileData = useMemo(
    () => [newUserDoc || createUserDocument()],
    [newUserDoc]
  );
  const settingsData = useMemo(
    () => [newSettingsDoc || createSettingsDocument()],
    [newSettingsDoc]
  );

  const values = useMemo(
    () => ({ username, email: newEmail, password: currentPassword }),
    [newEmail, currentPassword, username]
  );

  const getProfileInspector = useCallback(() => {
    const inspector = UserDocumentInspector.instance as Inspector;
    inspector.getPropertyHelperText = (
      propertyPath: string,
      _data: UserDocument
    ): string => {
      if (propertyPath === "bio") {
        if (savingBio === undefined) {
          return "";
        }
        if (savingBio) {
          return "Saving...";
        }
        return "Saved.";
      }
      return undefined;
    };
    return inspector;
  }, [savingBio]);
  const getSettingsInspector = useCallback(() => {
    return SettingsDocumentInspector.instance;
  }, []);

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.f !== prevState?.f) {
        setDialogProperty(currState?.f);
        setDialogOpen(Boolean(currState?.f));
      }
    },
    []
  );
  const [openFieldDialog, closeFieldDialog] = useDialogNavigation(
    "f",
    handleBrowserNavigation
  );

  const handleClickChangeUsername = useCallback(() => {
    if (keyboardTriggerRef.current) {
      keyboardTriggerRef.current.focus();
    }
    setDialogError(undefined);
    setCurrentPasswordError(undefined);
    setDialogProperty("username");
    openFieldDialog("username");
    setDialogOpen(true);
  }, [openFieldDialog]);
  const handleClickChangeEmail = useCallback(() => {
    if (keyboardTriggerRef.current) {
      keyboardTriggerRef.current.focus();
    }
    setDialogError(undefined);
    setCurrentPasswordError(undefined);
    setCurrentPassword("");
    setDialogProperty("email");
    openFieldDialog("email");
    setDialogOpen(true);
  }, [openFieldDialog]);
  const handleClickChangePassword = useCallback(async () => {
    if (keyboardTriggerRef.current) {
      keyboardTriggerRef.current.focus();
    }
    setDialogError(undefined);
    setCurrentPasswordError(undefined);
    setCurrentPassword("");
    setNewPassword("");
    setDialogProperty("password");
    openFieldDialog("password");
    setDialogOpen(true);
  }, [openFieldDialog]);
  const handleCloseDialog = useCallback(() => {
    closeFieldDialog();
    setDialogOpen(false);
  }, [closeFieldDialog]);
  const handleClickForgotPassword = useCallback(async () => {
    const onYes = async (): Promise<void> => {
      const forgotPassword = (
        await import("../impower-auth/utils/forgotPassword")
      ).default;
      try {
        await forgotPassword(email);
        toastDispatch(toastTop(passwordResetEmailSent, "info"));
      } catch (error) {
        const logError = (await import("../impower-logger/utils/logError"))
          .default;
        switch (error.code) {
          default:
            toastDispatch(toastTop(error.message, "error"));
            logError("Auth", error);
        }
      }
    };
    confirmDialogDispatch(
      confirmDialogNavOpen(
        forgotPasswordConfirmationInfo.title,
        forgotPasswordConfirmationInfo.content,
        forgotPasswordConfirmationInfo.agreeLabel,
        onYes,
        forgotPasswordConfirmationInfo.disagreeLabel
      )
    );
  }, [confirmDialogDispatch, email, toastDispatch]);
  const handleChangeCurrentPassword = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setCurrentPassword(newValue);
    },
    []
  );
  const handleChangeNewPassword = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setNewPassword(newValue);
    },
    []
  );
  const handleSubmit = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      if (dialogProperty === "username") {
        const updates = { [dialogProperty]: newValue };
        const updatedDoc = { ...newUserDoc, ...updates };
        const DataStoreRead = (
          await import("../impower-data-store/classes/dataStoreRead")
        ).default;
        const snapshot = await new DataStoreRead(
          "handles",
          newValue.toLowerCase()
        ).get();
        if (snapshot.exists()) {
          setDialogError(signupUsernameAlreadyExists);
          return false;
        }
        setNewUserDoc(updatedDoc);
        await new Promise<void>((resolve) =>
          userDispatch(
            userOnUpdateSubmission(resolve, updatedDoc, "users", uid)
          )
        );
      }
      if (dialogProperty === "email") {
        setNewEmail(newValue);
        const changeEmail = (await import("../impower-auth/utils/changeEmail"))
          .default;
        try {
          await changeEmail(currentPassword, newEmail);
          toastDispatch(toastTop(changeEmailSuccess, "success"));
        } catch (error) {
          const logError = (await import("../impower-logger/utils/logError"))
            .default;
          switch (error.code) {
            case "auth/invalid-password":
              setCurrentPasswordError(passwordInvalid);
              return false;
            case "auth/wrong-password":
            case "auth/internal-error":
              setCurrentPasswordError(passwordWrong);
              return false;
            default:
              toastDispatch(toastTop(error.message, "error"));
              logError("Auth", error);
              return false;
          }
        }
      }
      if (dialogProperty === "password") {
        const changePassword = (
          await import("../impower-auth/utils/changePassword")
        ).default;
        try {
          await changePassword(currentPassword, newPassword);
          toastDispatch(toastTop(changePasswordSuccess, "success"));
        } catch (error) {
          const logError = (await import("../impower-logger/utils/logError"))
            .default;
          switch (error.code) {
            case "auth/invalid-password":
              setDialogError(passwordInvalid);
              return false;
            case "auth/wrong-password":
            case "auth/internal-error":
              setDialogError(passwordWrong);
              return false;
            default:
              toastDispatch(toastTop(error.message, "error"));
              logError("Auth", error);
              return false;
          }
        }
      }
      return true;
    },
    [
      dialogProperty,
      newUserDoc,
      userDispatch,
      uid,
      currentPassword,
      newEmail,
      toastDispatch,
      newPassword,
    ]
  );
  const handleProfilePropertyBlur = useCallback(
    async (propertyPath: string, value: unknown) => {
      if (JSON.stringify(newUserDoc[propertyPath]) === JSON.stringify(value)) {
        return;
      }
      const updates = { [propertyPath]: value };
      const updatedDoc = { ...newUserDoc, ...updates };
      setNewUserDoc(updatedDoc);
      if (propertyPath === "bio") {
        setSavingBio(true);
      }
      await new Promise<void>((resolve) =>
        userDispatch(userOnUpdateSubmission(resolve, updatedDoc, "users", uid))
      );
      if (propertyPath === "bio") {
        setSavingBio(false);
      }
    },
    [newUserDoc, uid, userDispatch]
  );
  const handleSettingsPropertyChange = useCallback(
    async (propertyPath: string, value: unknown) => {
      if (JSON.stringify(newUserDoc[propertyPath]) === JSON.stringify(value)) {
        return;
      }
      const updates = { [propertyPath]: value };
      const updatedDoc = { ...newSettingsDoc, ...updates };
      setNewSettingsDoc(updatedDoc);
      await new Promise<void>((resolve) =>
        userDispatch(userOnSetSetting(resolve, updatedDoc, "account"))
      );
    },
    [newSettingsDoc, newUserDoc, userDispatch]
  );
  const handleRevealCurrentPassword = useCallback((): void => {
    setCurrentPasswordReveal(!currentPasswordReveal);
  }, [currentPasswordReveal]);
  const handleRevealNewPassword = useCallback((): void => {
    setNewPasswordReveal(!newPasswordReveal);
  }, [newPasswordReveal]);

  const requiresRecentAuth =
    dialogProperty === "password" || dialogProperty === "email";

  const theme = useTheme();

  const CurrentPasswordDialogTextFieldInputProps = useMemo(
    () => ({
      style: {
        backgroundColor: "transparent",
      },
      endAdornment: (
        <StyledIconButton onClick={handleRevealCurrentPassword}>
          <FontIcon
            aria-label="Reveal Password"
            size={20}
            color={theme.palette.grey[600]}
          >
            {currentPasswordReveal ? <EyeSolidIcon /> : <EyeSlashSolidIcon />}
          </FontIcon>
        </StyledIconButton>
      ),
    }),
    [handleRevealCurrentPassword, currentPasswordReveal, theme.palette.grey]
  );
  const NewPasswordDialogTextFieldInputProps = useMemo(
    () => ({
      style: {
        backgroundColor: "transparent",
      },
      endAdornment: (
        <StyledIconButton onClick={handleRevealNewPassword}>
          <FontIcon
            aria-label="Reveal Password"
            size={20}
            color={theme.palette.grey[600]}
          >
            {newPasswordReveal ? <EyeSolidIcon /> : <EyeSlashSolidIcon />}
          </FontIcon>
        </StyledIconButton>
      ),
    }),
    [handleRevealNewPassword, newPasswordReveal, theme.palette.grey]
  );

  const renderHelperText = (props: {
    errorText: string;
    helperText: React.ReactNode;
    counterText: string;
  }): React.ReactNode => {
    const { errorText, helperText, counterText } = props;
    if (!errorText && !helperText && !counterText) {
      return undefined;
    }
    return (
      <InputHelperText
        errorText={errorText}
        helperText={helperText}
        counterText={counterText}
      />
    );
  };
  return (
    <>
      <StyledKeyboardTrigger aria-hidden="true" ref={keyboardTriggerRef} />
      <StyledContainer>
        <StyledPaper>
          <StyledHeaderTypography variant="h6">{`Your Account`}</StyledHeaderTypography>
          <StyledAccountButtonArea>
            <StyledAccountButton
              color="inherit"
              variant="outlined"
              onClick={handleClickChangeUsername}
            >
              <StyledLabel>{labels.username}</StyledLabel>
              <StyledValueArea>
                <StyledValue>{username || "---"}</StyledValue>
              </StyledValueArea>
            </StyledAccountButton>
            <StyledAccountButton
              color="inherit"
              variant="outlined"
              onClick={handleClickChangeEmail}
            >
              <StyledLabel>{labels.email}</StyledLabel>
              <StyledValueArea>
                <StyledValue>{newEmail || "---"}</StyledValue>
              </StyledValueArea>
            </StyledAccountButton>
            <StyledAccountButton
              color="inherit"
              variant="outlined"
              onClick={handleClickChangePassword}
            >
              <StyledLabel>{labels.password}</StyledLabel>
              <StyledValueArea>
                <StyledValue>{`********`}</StyledValue>
              </StyledValueArea>
            </StyledAccountButton>
          </StyledAccountButtonArea>
          <StyledDivider />
          <StyledHeaderTypography variant="h6">{`Your Profile`}</StyledHeaderTypography>
          <InspectorForm
            key={`profile-${Boolean(newUserDoc).toString()}`}
            StringInputComponent={StringInput}
            FileInputComponent={FileInput}
            InputComponent={OutlinedInput}
            data={profileData}
            propertyPaths={profilePropertyPaths}
            getInspector={getProfileInspector}
            onPropertyBlur={handleProfilePropertyBlur}
          />
          <StyledDivider />
          <StyledHeaderTypography variant="h6">{`Your Settings`}</StyledHeaderTypography>
          <InspectorForm
            key={`settings-${Boolean(newSettingsDoc).toString()}`}
            StringInputComponent={StringInput}
            FileInputComponent={FileInput}
            BooleanInputComponent={BooleanInput}
            InputComponent={OutlinedInput}
            data={settingsData}
            propertyPaths={settingsPropertyPaths}
            getInspector={getSettingsInspector}
            onPropertyChange={handleSettingsPropertyChange}
          />
          <StyledDivider />
        </StyledPaper>
      </StyledContainer>
      {dialogOpen !== undefined && (
        <StringDialog
          open={dialogOpen}
          label={labels[dialogProperty]}
          defaultValue={values[dialogProperty]}
          value={values[dialogProperty]}
          error={Boolean(dialogError)}
          errorText={dialogError}
          onClose={handleCloseDialog}
          onChange={handleSubmit}
          disableEnforceKeyboardFocus={requiresRecentAuth}
          DialogTextFieldComponent={
            dialogProperty === "password" ? StyledDialogTextField : undefined
          }
          DialogTextFieldProps={
            dialogProperty === "password"
              ? {
                  label: `Current Password`,
                  type: currentPasswordReveal ? "text" : "password",
                }
              : undefined
          }
          InputProps={
            dialogProperty === "password"
              ? CurrentPasswordDialogTextFieldInputProps
              : undefined
          }
          disableSave={
            (dialogProperty === "password" && !newPassword) ||
            (dialogProperty === "email" && !currentPassword)
          }
          renderHelperText={renderHelperText}
        >
          {dialogProperty === "email" && (
            <>
              <StyledDialogTextField
                variant="filled"
                label={`Current Password`}
                type={currentPasswordReveal ? "text" : "password"}
                InputProps={CurrentPasswordDialogTextFieldInputProps}
                InputComponent={FilledInput}
                value={currentPassword}
                onChange={handleChangeCurrentPassword}
                error={Boolean(currentPasswordError)}
                helperText={currentPasswordError}
              />
              <StyledForgotPasswordArea>
                <StyledForgotPasswordLink
                  color="secondary"
                  onClick={handleClickForgotPassword}
                >
                  {forgotPasswordQuestion}
                </StyledForgotPasswordLink>
              </StyledForgotPasswordArea>
            </>
          )}
          {dialogProperty === "password" && (
            <>
              <StyledForgotPasswordArea>
                <StyledForgotPasswordLink
                  color="secondary"
                  onClick={handleClickForgotPassword}
                >
                  {forgotPasswordQuestion}
                </StyledForgotPasswordLink>
              </StyledForgotPasswordArea>
              <StyledDialogTextField
                variant="filled"
                label={`New Password`}
                type={newPasswordReveal ? "text" : "password"}
                autoComplete="new-password"
                InputProps={NewPasswordDialogTextFieldInputProps}
                InputComponent={FilledInput}
                value={newPassword}
                onChange={handleChangeNewPassword}
              />
            </>
          )}
        </StringDialog>
      )}
    </>
  );
});

export default Profile;
