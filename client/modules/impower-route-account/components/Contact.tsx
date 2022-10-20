import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { ButtonProps } from "@mui/material/Button";
import OutlinedInput from "@mui/material/OutlinedInput";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { SettingsDocumentInspector } from "../../impower-data-store/classes/inspectors/settingsDocumentInspector";
import createSettingsDocument from "../../impower-data-store/utils/createSettingsDocument";
import { useDialogNavigation } from "../../impower-dialog";
import InspectorForm from "../../impower-route/components/forms/InspectorForm";
import AutocompleteInput from "../../impower-route/components/inputs/AutocompleteInput";
import BooleanInput from "../../impower-route/components/inputs/BooleanInput";
import FileInput from "../../impower-route/components/inputs/FileInput";
import StringInput from "../../impower-route/components/inputs/StringInput";
import { UserContext, userOnSetSetting } from "../../impower-user";
import { userOnDoConnect } from "../../impower-user/types/actions/userOnDoConnectAction";

const title = "How should connections contact you?";

const settingsPropertyPaths = ["contactMethod", "contact"];

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

const StyledTitleTypography = styled(Typography)`
  text-align: center;
  padding: ${(props): string => props.theme.spacing(1)};
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  margin-bottom: ${(props): string => props.theme.spacing(1)};
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

const StyledGrid = styled.div`
  display: flex;
  flex-direction: column;
`;

interface ContactProps {
  id: string;
  onProcessing?: (processing: boolean) => void;
}

const Contact = React.memo((props: ContactProps): JSX.Element => {
  const { id, onProcessing } = props;

  const [userState, userDispatch] = useContext(UserContext);
  const { settings, email } = userState;
  const settingsDoc = settings?.account;

  const [newSettingsDoc, setNewSettingsDoc] = useState(settingsDoc);

  const theme = useTheme();

  useEffect(() => {
    if (settingsDoc) {
      setNewSettingsDoc(settingsDoc);
    }
  }, [settingsDoc]);

  const [, closeAccountDialog] = useDialogNavigation("a");

  const settingsData = useMemo(() => {
    const data = newSettingsDoc || createSettingsDocument();
    return [data];
  }, [newSettingsDoc]);

  const getSettingsInspector = useCallback(() => {
    return SettingsDocumentInspector.instance;
  }, []);

  const handleSettingsPropertySave = useCallback(
    async (propertyPath: string, value: unknown) => {
      if (
        JSON.stringify(newSettingsDoc?.[propertyPath]) === JSON.stringify(value)
      ) {
        return;
      }
      const updates = { [propertyPath]: value };
      const updatedDoc = { ...newSettingsDoc, ...updates };
      if (propertyPath === "contactMethod") {
        updatedDoc.contact = value === "account" ? email : "";
      }
      setNewSettingsDoc(updatedDoc);
    },
    [email, newSettingsDoc]
  );
  const handleSettingsPropertyChange = useCallback(
    async (propertyPath: string, value: unknown) => {
      if (propertyPath === "contact") {
        return;
      }
      handleSettingsPropertySave(propertyPath, value);
    },
    [handleSettingsPropertySave]
  );
  const handleSettingsPropertyBlur = useCallback(
    async (propertyPath: string, value: unknown) => {
      if (propertyPath !== "contact") {
        return;
      }
      handleSettingsPropertySave(propertyPath, value);
    },
    [handleSettingsPropertySave]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent | React.MouseEvent) => {
      e.preventDefault();
      if (onProcessing) {
        onProcessing(true);
      }
      await new Promise<void>((resolve) => {
        userDispatch(userOnSetSetting(resolve, newSettingsDoc, "account"));
      });
      if (id) {
        await new Promise<void>((resolve) => {
          userDispatch(userOnDoConnect(resolve, "users", id));
        });
      }
      closeAccountDialog();
      if (onProcessing) {
        onProcessing(false);
      }
    },
    [closeAccountDialog, id, newSettingsDoc, onProcessing, userDispatch]
  );

  const DialogProps = useMemo(() => ({ style: { zIndex: 3000 } }), []);

  const submitButtonProps: ButtonProps = useMemo(
    () => ({
      fullWidth: true,
      variant: "contained",
      color: "primary",
      size: "large",
    }),
    []
  );

  return (
    <StyledPaper>
      <StyledContainer>
        <StyledTitleTypography variant="h5">{title}</StyledTitleTypography>
        <StyledGrid style={{ marginBottom: theme.spacing(1.5) }}>
          <InspectorForm
            key={`settings-${Boolean(newSettingsDoc).toString()}-${
              newSettingsDoc?.contactMethod
            }-${newSettingsDoc?.contact}`}
            StringInputComponent={StringInput}
            FileInputComponent={FileInput}
            BooleanInputComponent={BooleanInput}
            InputComponent={OutlinedInput}
            AutocompleteInputComponent={AutocompleteInput}
            data={settingsData}
            propertyPaths={settingsPropertyPaths}
            getInspector={getSettingsInspector}
            onPropertyChange={handleSettingsPropertyChange}
            onPropertyBlur={handleSettingsPropertyBlur}
            DialogProps={DialogProps}
            submitButtonLabel={`Save`}
            submitButtonProps={submitButtonProps}
            onSubmit={handleSubmit}
          />
        </StyledGrid>
      </StyledContainer>
    </StyledPaper>
  );
});

export default Contact;
