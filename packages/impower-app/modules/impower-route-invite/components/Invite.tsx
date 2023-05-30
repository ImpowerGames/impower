import styled from "@emotion/styled";
import OutlinedInput from "@mui/material/OutlinedInput";
import Typography from "@mui/material/Typography";
import React, { useCallback, useContext, useState } from "react";
import IllustrationImage from "../../../resources/illustrations/fogg-waiting-2.svg";
import { DynamicLoadingButton, TextField } from "../../impower-route";
import Illustration from "../../impower-route-home/components/elements/Illustration";
import { ToastContext, toastTop } from "../../impower-toast";

const title = "Impower is coming soon...";
const submitButton = "Request an invite";
const inviteSuccess = "Request sent!";

const StyledInvite = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background-color: white;
`;

const StyledInviteContent = styled.div`
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
`;

const StyledTitleTypography = styled(Typography)`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  text-align: center;
  text-decoration: none;
  font-weight: 700;
  font-family: ${(props): string => props.theme.fontFamily.title};

  min-height: 32px;
  text-decoration: none;

  font-size: ${(props): string => props.theme.fontSize.title};
  z-index: 1;
`;

const StyledForm = styled.form`
  width: 100%; // Fix IE 11 issue.
  margin-top: ${(props): string => props.theme.spacing(1)};
`;

const StyledSubmitButton = styled(DynamicLoadingButton)`
  margin: ${(props): string => props.theme.spacing(3, 0, 2)};
`;

const StyledIllustrationArea = styled.div`
  text-align: center;
  position: relative;
  width: 100%;
  margin-bottom: -${(props): string => props.theme.spacing(8)};
`;

const StyledContainer = styled.div`
  padding: ${(props): string => props.theme.spacing(0, 3)};
  max-width: 100%;
  width: ${(props): string => props.theme.spacing(60)};
  margin: auto;
  z-index: 1;
`;

const Invite = (): JSX.Element | null => {
  const [, toastDispatch] = useContext(ToastContext);
  const [progress, setProgress] = useState(false);
  const [emailValue, setEmailValue] = useState("");

  const handleEmailInputChange = useCallback((e): void => {
    setEmailValue(e.target.value);
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
          fullName: emailValue,
          email: emailValue,
          message: "[REQUESTING INVITE]",
        })
        .then(() => {
          toastDispatch(toastTop(inviteSuccess, "success"));
          setProgress(false);
          setEmailValue("");
        })
        .catch((error) => {
          toastDispatch(toastTop(error.message, "error"));
          setProgress(false);
        });
    },
    [emailValue, toastDispatch]
  );

  return (
    <StyledInvite className={StyledInvite.displayName}>
      <StyledInviteContent className={StyledInviteContent.displayName}>
        <StyledContainer>
          <StyledPaper className={StyledPaper.displayName}>
            <StyledIllustrationArea>
              <StyledTitleTypography
                className={StyledTitleTypography.displayName}
                variant="h1"
                color="primary"
              >
                {title}
              </StyledTitleTypography>
              <Illustration
                style={{
                  minHeight: 400,
                  maxWidth: 900,
                }}
              >
                <IllustrationImage />
              </Illustration>
            </StyledIllustrationArea>
            <StyledContainer>
              <StyledForm
                className={StyledForm.displayName}
                method="post"
                noValidate
                onSubmit={handleSubmit}
              >
                <TextField
                  value={emailValue}
                  variant="outlined"
                  InputComponent={OutlinedInput}
                  margin="normal"
                  required
                  fullWidth
                  label="Email"
                  id="email"
                  name="email"
                  autoComplete="email"
                  onChange={handleEmailInputChange}
                />
                <StyledSubmitButton
                  className={StyledSubmitButton.displayName}
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
      </StyledInviteContent>
    </StyledInvite>
  );
};

export default Invite;
