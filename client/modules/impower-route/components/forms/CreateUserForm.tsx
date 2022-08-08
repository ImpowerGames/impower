import React, { useCallback, useContext, useState } from "react";
import {
  SlugDocument,
  UserDocument,
  UserDocumentInspector,
} from "../../../impower-data-store";
import { useDialogNavigation } from "../../../impower-dialog";
import { useRouter } from "../../../impower-router";
import { ToastContext, toastTop } from "../../../impower-toast";
import { UserContext, userOnUpdateSubmission } from "../../../impower-user";
import {
  EngineConsoleType,
  userProfileConsoles,
} from "../../types/info/console";
import FileInput from "../inputs/FileInput";
import CreateDocumentForm, { CreationStep } from "./CreateDocumentForm";

const steps: CreationStep[] = [
  {
    title: "Edit Your User Profile",
    description: "Change your username.",
    propertyPaths: ["username"],
  },
  {
    title: "Describe yourself",
    description: "Tell us a little more about yourself.",
    propertyPaths: ["bio"],
  },
  {
    title: "Upload a profile image",
    description: "Upload a profile image that represents you.",
    propertyPaths: ["icon"],
  },
];

interface CreateUserProfileFormProps {
  docId: string;
  doc: UserDocument;
  onClose?: (
    e: React.MouseEvent,
    reason: "backdropClick" | "escapeKeyDown" | "closeButtonClick" | "submitted"
  ) => void;
  onChange?: (doc: UserDocument) => void;
  onRefresh?: () => Promise<void>;
  onSubmit?: (
    e: React.FormEvent | React.MouseEvent,
    doc: UserDocument
  ) => Promise<void>;
  onSubmitted?: (doc: UserDocument, successful: boolean) => void;
}

const CreateUserForm = React.memo(
  (props: CreateUserProfileFormProps): JSX.Element => {
    const { docId, doc, onClose, onChange, onSubmit, onSubmitted } = props;

    const router = useRouter();

    const userProfileConsole = userProfileConsoles.find(
      (c) => c.type === EngineConsoleType.UserProfile
    );
    const { skipLabel, backLabel, nextLabel, finishCreationLabel } =
      userProfileConsole;

    const [, toastDispatch] = useContext(ToastContext);
    const [userState, userDispatch] = useContext(UserContext);
    const [errorsState, setErrorsState] = useState<{
      [propertyPath: string]: string;
    }>({});
    const [showErrorsState, setShowErrorsState] = useState(false);
    const { isSignedIn, userDoc } = userState;
    const originalUsername = userDoc?.username;

    const handleGetInspector = useCallback(() => {
      return UserDocumentInspector.instance;
    }, []);
    const handleChange = useCallback(
      (doc: UserDocument) => {
        if (onChange) {
          onChange(doc);
        }
      },
      [onChange]
    );

    const handleStep = useCallback(
      async (
        e: React.MouseEvent,
        step: number,
        doc: UserDocument
      ): Promise<boolean> => {
        if (originalUsername !== doc.username) {
          const usernameKey = "username";
          if (!doc.username) {
            setErrorsState({
              ...errorsState,
              [usernameKey]: "You can't have an empty username",
            });
            setShowErrorsState(true);
            return false;
          }
          const DataStoreRead = (
            await import("../../../impower-data-store/classes/dataStoreRead")
          ).default;
          const snapshot = await new DataStoreRead(
            "handles",
            doc.username.toLowerCase()
          ).get<SlugDocument>();
          if (snapshot.exists()) {
            setErrorsState({
              ...errorsState,
              [usernameKey]: "This username already exists",
            });
            setShowErrorsState(true);
            return false;
          }
        }
        setErrorsState({});
        setShowErrorsState(false);
        return true;
      },
      [errorsState, originalUsername]
    );

    const handlePropertyErrorFound = useCallback(
      (propertyPath: string, error: string) => {
        if (propertyPath !== "username") {
          if (!errorsState[propertyPath]) {
            setErrorsState({ ...errorsState, [propertyPath]: error });
          }
        }
      },
      [errorsState]
    );

    const handlePropertyErrorFixed = useCallback(
      (propertyPath: string) => {
        if (propertyPath !== "username") {
          if (errorsState[propertyPath]) {
            const newErrors = { ...errorsState };
            delete newErrors[propertyPath];
            setErrorsState(newErrors);
          }
        }
      },
      [errorsState]
    );

    const [openAccountDialog] = useDialogNavigation("a");

    const handleSaveDoc = useCallback(
      async (
        e: React.MouseEvent,
        newDocId: string,
        newDoc: UserDocument
      ): Promise<boolean> => {
        if (!isSignedIn) {
          openAccountDialog("signup");
          return false;
        }
        if (onSubmit) {
          onSubmit(e, newDoc);
        }

        try {
          await new Promise<void>((resolve) => {
            userDispatch(
              userOnUpdateSubmission(resolve, newDoc, "users", newDocId)
            );
          });
          await router.push(`/u/${newDoc.username}`);
          if (onSubmitted) {
            await onSubmitted(newDoc, true);
          }
          return true;
        } catch (error) {
          toastDispatch(toastTop(error.message, "error"));
          if (onSubmitted) {
            await onSubmitted(newDoc, false);
          }
          return false;
        }
      },
      [
        isSignedIn,
        onSubmit,
        openAccountDialog,
        onSubmitted,
        router,
        userDispatch,
        toastDispatch,
      ]
    );
    return (
      <CreateDocumentForm
        steps={steps}
        docId={docId}
        doc={doc}
        skipLabel={skipLabel}
        backLabel={backLabel}
        nextLabel={nextLabel}
        doneLabel={finishCreationLabel}
        getInspector={handleGetInspector}
        onChange={handleChange}
        onSubmit={handleSaveDoc}
        onStep={handleStep}
        onClose={onClose}
        onPropertyErrorFound={handlePropertyErrorFound}
        onPropertyErrorFixed={handlePropertyErrorFixed}
        errors={errorsState}
        showErrors={showErrorsState}
        FileInputComponent={FileInput}
      />
    );
  }
);

export default CreateUserForm;
