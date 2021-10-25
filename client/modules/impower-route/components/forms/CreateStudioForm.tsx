import React, { useCallback, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../impower-config";
import {
  StudioDocument,
  StudioDocumentInspector,
} from "../../../impower-data-store";
import { useDialogNavigation } from "../../../impower-dialog";
import { useRouter } from "../../../impower-router";
import { ToastContext, toastTop } from "../../../impower-toast";
import { UserContext, userOnCreateSubmission } from "../../../impower-user";
import { engineConsoles, EngineConsoleType } from "../../types/info/console";
import { RenderPropertyProps } from "../inputs/DataField";
import PageTagField, { PageTagFieldProps } from "../inputs/PageTagField";
import { CreationStep } from "./CreateDocumentForm";
import CreatePageForm from "./CreatePageForm";

const steps: CreationStep[] = [
  {
    title: "Create a studio",
    description: "What developers will be part of your studio?",
    propertyPaths: ["members", "neededRoles"],
  },
  {
    title: "About your studio",
    description: "What kind of projects will your studio specialize in?",
    propertyPaths: ["tags"],
  },
  {
    title: "Customize your studio",
    description: "Last thing! Give your studio a name!",
    propertyPaths: ["name", "slug"],
  },
];

interface StudioFieldProps extends RenderPropertyProps, PageTagFieldProps {}

export const StudioField = (props: StudioFieldProps): JSX.Element | null => {
  const { propertyPath } = props;
  if (propertyPath === "tags") {
    return <PageTagField {...props} />;
  }
  return null;
};

interface CreateStudioFormProps {
  docId?: string;
  doc: StudioDocument;
  finishedSummary?: React.ReactNode;
  onClose?: (
    e: React.MouseEvent,
    reason: "backdropClick" | "escapeKeyDown" | "closeButtonClick" | "submitted"
  ) => void;
  onChange?: (doc: StudioDocument) => void;
  onSubmit?: (
    e: React.FormEvent | React.MouseEvent,
    id: string,
    doc: StudioDocument
  ) => void;
  onSubmitted?: (id: string, doc: StudioDocument, successful: boolean) => void;
}

const CreateStudioForm = React.memo(
  (props: CreateStudioFormProps): JSX.Element => {
    const {
      docId,
      doc,
      finishedSummary,
      onClose,
      onChange,
      onSubmit,
      onSubmitted,
    } = props;

    const [docIdState, setDocIdState] = useState(docId);

    const router = useRouter();

    const engineConsole = engineConsoles.find(
      (c) => c.type === EngineConsoleType.Studios
    );
    const { skipLabel, backLabel, nextLabel, finishCreationLabel } =
      engineConsole;

    const [configState] = useContext(ConfigContext);
    const [, toastDispatch] = useContext(ToastContext);
    const [userState, userDispatch] = useContext(UserContext);
    const { isSignedIn } = userState;

    useEffect(() => {
      setDocIdState(docId);
    }, [docId]);

    const handleGetInspector = useCallback(() => {
      return StudioDocumentInspector.instance;
    }, []);
    const handleChange = useCallback(
      (doc: StudioDocument) => {
        if (onChange) {
          onChange(doc);
        }
      },
      [onChange]
    );

    const [openAccountDialog] = useDialogNavigation("a");

    const handleSaveDoc = useCallback(
      async (
        e: React.MouseEvent,
        newDocId: string,
        newDoc: StudioDocument
      ): Promise<boolean> => {
        if (!isSignedIn) {
          openAccountDialog("signup");
          return false;
        }
        setDocIdState(newDocId);
        if (onSubmit) {
          onSubmit(e, newDocId, newDoc);
        }
        const Auth = (await import("../../../impower-auth/classes/auth"))
          .default;
        const getUniqueSlug = (
          await import("../../../impower-data-store/utils/getUniqueSlug")
        ).default;
        const getRandomColor = (
          await import("../../../impower-core/utils/getRandomColor")
        ).default;
        const handle = await getUniqueSlug(newDocId, "handles", newDoc.name);
        const tagColorNames = configState?.tagColorNames;
        const colors = configState?.colors;
        const mainTag = newDoc?.tags?.[0] || "";
        const tagColorName = tagColorNames[mainTag] || "";
        const claimedDoc = {
          ...newDoc,
          name: newDoc.name.trim(),
          handle,
          hex: colors[tagColorName] || getRandomColor(),
          owners: [Auth.instance.uid],
        };
        try {
          await new Promise<void>((resolve) =>
            userDispatch(
              userOnCreateSubmission(resolve, claimedDoc, "studios", newDocId)
            )
          );
          if (onSubmitted) {
            await onSubmitted(newDocId, newDoc, true);
          }
          router.push(`/e/s/${newDocId}`);
          return true;
        } catch (error) {
          toastDispatch(toastTop(error.message, "error"));
          if (onSubmitted) {
            await onSubmitted(newDocId, newDoc, false);
          }
          return false;
        }
      },
      [
        isSignedIn,
        onSubmit,
        configState?.tagColorNames,
        configState?.colors,
        openAccountDialog,
        onSubmitted,
        router,
        userDispatch,
        toastDispatch,
      ]
    );

    return (
      <CreatePageForm
        steps={steps}
        docId={docIdState}
        doc={doc}
        skipLabel={skipLabel}
        backLabel={backLabel}
        nextLabel={nextLabel}
        doneLabel={finishCreationLabel}
        finishedSummary={finishedSummary}
        renderProperty={StudioField}
        getInspector={handleGetInspector}
        onChange={handleChange}
        onSubmit={handleSaveDoc}
        onClose={onClose}
      />
    );
  }
);

export default CreateStudioForm;
