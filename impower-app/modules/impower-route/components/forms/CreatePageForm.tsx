import React, { PropsWithChildren } from "react";
import { PageDocument } from "../../../impower-data-store";
import CreateDocumentForm, {
  CreateDocumentFormProps,
} from "./CreateDocumentForm";

const CreatePageForm = React.memo(
  (
    props: PropsWithChildren<CreateDocumentFormProps<PageDocument>>
  ): JSX.Element | null => {
    return <CreateDocumentForm {...props} />;
  }
);

export default CreatePageForm;
