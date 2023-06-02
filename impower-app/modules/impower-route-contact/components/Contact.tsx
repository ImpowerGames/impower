/* eslint-disable global-require */
import styled from "@emotion/styled";
import OutlinedInput from "@mui/material/OutlinedInput";
import Typography from "@mui/material/Typography";
import React, { useCallback, useContext, useState } from "react";
import { DynamicLoadingButton, TextField } from "../../impower-route";
import { ToastContext, toastTop } from "../../impower-toast";

const StyledContact = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background-color: white;
`;

const StyledContactContent = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: ${(props): string => props.theme.minHeight.navigationBar};
`;

const StyledPaper = styled.div`
  padding: ${(props): string => props.theme.spacing(4)} 0;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const StyledTitleTypography = styled(Typography)`
  text-align: center;
  text-decoration: none;
  font-weight: 700;
  font-family: ${(props): string => props.theme.fontFamily.title};

  min-height: 32px;
  text-decoration: none;

  z-index: 1;
`;

const StyledSubtitleTypography = styled(Typography)`
  text-align: center;
  padding: ${(props): string => props.theme.spacing(1)};
`;

const StyledForm = styled.form`
  width: 100%; // Fix IE 11 issue.
  margin-top: ${(props): string => props.theme.spacing(1)};
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const StyledSubmitButton = styled(DynamicLoadingButton)`
  margin: ${(props): string => props.theme.spacing(3, 0, 2)};
`;

const StyledContainer = styled.div`
  padding: ${(props): string => props.theme.spacing(0, 3)};
  max-width: 100%;
  width: ${(props): string => props.theme.spacing(60)};
  margin: auto;
`;

interface ContactProps {
  title: string;
  subtitle: string;
  submitButton: string;
  messageSuccess: string;
}

const Contact = (props: ContactProps): JSX.Element | null => {
  const { title, subtitle, submitButton, messageSuccess } = props;

  const [, toastDispatch] = useContext(ToastContext);
  const [progress, setProgress] = useState(false);
  const [fullNameValue, setFullNameValue] = useState("");
  const [emailValue, setEmailValue] = useState("");
  const [messageValue, setMessageValue] = useState("");

  const handleFullNameInputChange = useCallback((e): void => {
    setFullNameValue(e.target.value);
  }, []);
  const handleEmailInputChange = useCallback((e): void => {
    setEmailValue(e.target.value);
  }, []);
  const handleMessageInputChange = useCallback((e): void => {
    setMessageValue(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent | React.MouseEvent) => {
      e.preventDefault();
      setProgress(true);
      const getUuid = (await import("../../impower-core/utils/getUuid"))
        .default;
      const messageId = getUuid();
      const DataStateWrite = (
        await import("../../impower-data-state/classes/dataStateWrite")
      ).default;
      return new DataStateWrite("messages", messageId)
        .set({
          fullName: fullNameValue,
          email: emailValue,
          message: messageValue,
        })
        .then(() => {
          toastDispatch(toastTop(messageSuccess, "success"));
          setProgress(false);
          setFullNameValue("");
          setEmailValue("");
          setMessageValue("");
        })
        .catch((error) => {
          toastDispatch(toastTop(error.message, "error"));
          setProgress(false);
        });
    },
    [fullNameValue, emailValue, messageValue, toastDispatch, messageSuccess]
  );

  return (
    <StyledContact className={StyledContact.displayName}>
      <StyledContactContent className={StyledContactContent.displayName}>
        <StyledContainer>
          <StyledPaper className={StyledPaper.displayName}>
            <StyledTitleTypography
              className={StyledTitleTypography.displayName}
              variant="h3"
              color="primary"
            >
              {title}
            </StyledTitleTypography>
            <StyledSubtitleTypography
              className={StyledSubtitleTypography.displayName}
              variant="h5"
            >
              {subtitle}
            </StyledSubtitleTypography>
            <StyledContainer>
              <StyledForm
                className={StyledForm.displayName}
                method="post"
                noValidate
                onSubmit={handleSubmit}
              >
                <TextField
                  variant="outlined"
                  InputComponent={OutlinedInput}
                  value={fullNameValue}
                  margin="normal"
                  required
                  fullWidth
                  label="Full name"
                  id="name"
                  name="name"
                  autoComplete="name"
                  onChange={handleFullNameInputChange}
                />
                <TextField
                  variant="outlined"
                  InputComponent={OutlinedInput}
                  value={emailValue}
                  margin="normal"
                  required
                  fullWidth
                  label="Email"
                  id="email"
                  name="email"
                  autoComplete="email"
                  onChange={handleEmailInputChange}
                />
                <TextField
                  variant="outlined"
                  InputComponent={OutlinedInput}
                  value={messageValue}
                  margin="normal"
                  required
                  fullWidth
                  label="Message"
                  id="message"
                  name="message"
                  multiline
                  minRows={6}
                  onChange={handleMessageInputChange}
                />
                <StyledSubmitButton
                  loading={progress}
                  type="submit"
                  fullWidth
                  variant="contained"
                  color="primary"
                  size="large"
                  onClick={handleSubmit}
                >
                  {submitButton}
                </StyledSubmitButton>
              </StyledForm>
            </StyledContainer>
          </StyledPaper>
        </StyledContainer>
      </StyledContactContent>
    </StyledContact>
  );
};

export default Contact;
