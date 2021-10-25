import React, { useCallback, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../impower-config";
import {
  ResourceDocument,
  ResourceDocumentInspector,
} from "../../../impower-data-store";
import { useDialogNavigation } from "../../../impower-dialog";
import { ToastContext, toastTop } from "../../../impower-toast";
import { UserContext, userOnCreateSubmission } from "../../../impower-user";
import { EngineConsoleType, studioConsoles } from "../../types/info/console";
import { RenderPropertyProps } from "../inputs/DataField";
import PageTagField, { PageTagFieldProps } from "../inputs/PageTagField";
import { CreationStep } from "./CreateDocumentForm";
import CreatePageForm from "./CreatePageForm";

const steps: CreationStep[] = [
  {
    title: "Create a resource",
    description: "What kind of resource would you like to make?",
    propertyPaths: ["tags"],
  },
  {
    title: "What's it called?",
    propertyPaths: ["name"],
  },
  {
    title: "Last thing! Describe it!",
    propertyPaths: ["summary"],
  },
];

interface ResourceFieldProps extends RenderPropertyProps, PageTagFieldProps {}

export const ResourceField = React.memo(
  (props: ResourceFieldProps): JSX.Element | null => {
    const { propertyPath } = props;
    if (propertyPath === "tags") {
      return <PageTagField {...props} />;
    }
    return null;
  }
);

interface CreateResourceFormProps {
  docId?: string;
  doc: ResourceDocument;
  finishedSummary?: React.ReactNode;
  onClose?: (
    e: React.MouseEvent,
    reason: "backdropClick" | "escapeKeyDown" | "closeButtonClick" | "submitted"
  ) => void;
  onChange?: (doc: ResourceDocument) => void;
  onSubmit?: (
    e: React.FormEvent | React.MouseEvent,
    id: string,
    doc: ResourceDocument
  ) => void;
  onSubmitted?: (
    id: string,
    doc: ResourceDocument,
    successful: boolean
  ) => void;
}

const CreateResourceForm = React.memo(
  (props: CreateResourceFormProps): JSX.Element => {
    const {
      docId,
      doc,
      finishedSummary,
      onClose,
      onChange,
      onSubmit,
      onSubmitted,
    } = props;

    const [configState] = useContext(ConfigContext);

    const engineConsole = studioConsoles.find(
      (c) => c.type === EngineConsoleType.Resources
    );
    const { skipLabel, backLabel, nextLabel, finishCreationLabel } =
      engineConsole;

    const [docIdState, setDocIdState] = useState(docId);

    const [, toastDispatch] = useContext(ToastContext);
    const [userState, userDispatch] = useContext(UserContext);
    const { isSignedIn } = userState;

    useEffect(() => {
      setDocIdState(docId);
    }, [docId]);

    const handleGetInspector = useCallback(() => {
      return ResourceDocumentInspector.instance;
    }, []);

    const handleChange = useCallback(
      (newDoc: ResourceDocument) => {
        if (onChange) {
          onChange(newDoc);
        }
      },
      [onChange]
    );

    const [openAccountDialog] = useDialogNavigation("a");

    const handleSaveDoc = useCallback(
      async (
        e: React.MouseEvent,
        newDocId: string,
        newDoc: ResourceDocument
      ): Promise<boolean> => {
        try {
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
          const slug = await getUniqueSlug(newDocId, "slugs", newDoc.name);
          const mainTag = newDoc?.tags?.[0] || "";
          const tagColorNames = configState?.tagColorNames;
          const colors = configState?.colors;
          const tagColorName = tagColorNames[mainTag] || "";
          const claimedDoc = {
            ...newDoc,
            name: newDoc.name.trim(),
            slug,
            hex: colors[tagColorName] || getRandomColor(),
            owners: [Auth.instance.uid],
          };
          await new Promise<void>((resolve) =>
            userDispatch(
              userOnCreateSubmission(resolve, claimedDoc, "resources", newDocId)
            )
          );
          if (onSubmitted) {
            await onSubmitted(newDocId, claimedDoc, true);
          }
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
        onSubmitted,
        openAccountDialog,
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
        renderProperty={ResourceField}
        getInspector={handleGetInspector}
        onChange={handleChange}
        onSubmit={handleSaveDoc}
        onClose={onClose}
      />
    );
  }
);

export default CreateResourceForm;
