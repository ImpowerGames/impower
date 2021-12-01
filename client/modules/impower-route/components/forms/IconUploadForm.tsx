import styled from "@emotion/styled";
import Typography from "@material-ui/core/Typography";
import React, {
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { ConfigContext } from "../../../impower-config";
import ConfigCache from "../../../impower-config/classes/configCache";
import { StorageFile } from "../../../impower-core";
import { PageDocument } from "../../../impower-data-store";
import { DynamicIcon } from "../../../impower-icon";
import { StorageError } from "../../../impower-storage";
import { ToastContext, toastTop } from "../../../impower-toast";
import { UserContext, userOnUpdateSubmission } from "../../../impower-user";
import EditableAvatar from "../elements/EditableAvatar";

const uploadInstructions =
  "Click icon to customize \n(You can always change it later)";

const StyledIconArea = styled.div`
  display: flex;
  align-items: center;
  flex-direction: column;
  margin-bottom: ${(props): string => props.theme.spacing(1)};
  white-space: pre;
  text-align: center;
`;

const StyledIconContent = styled.div`
  width: ${(props): string => props.theme.spacing(10)};
  position: relative;
`;

const StyledIcon = styled.div`
  position: relative;
  border-radius: 50%;
  width: 100%;
  padding-top: 100%;
`;

const StyledIconBackground = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: inherit;
`;

const StyledUploadInstructionsArea = styled.div`
  position: relative;
  padding: ${(props): string => props.theme.spacing(1, 0)};
`;

const StyledUploadInstructionsTypography = styled(Typography)`
  text-align: center;
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
`;

export interface IconUploadFormProps {
  collection: "users" | "studios" | "projects";
  docId: string;
  doc: PageDocument;
  onUploadIcon: (file: StorageFile) => void;
}

const IconUploadForm = React.memo(
  (props: PropsWithChildren<IconUploadFormProps>): JSX.Element | null => {
    const { collection, docId, doc, onUploadIcon } = props;

    const [configState] = useContext(ConfigContext);
    const [, userDispatch] = useContext(UserContext);
    const [, toastDispatch] = useContext(ToastContext);

    const latestDoc = useRef(doc);

    const iconImage = doc?.icon?.fileUrl;

    const mainColor = doc?.hex;

    useEffect(() => {
      latestDoc.current = { ...doc };
    }, [doc]);

    const handleIconUpload = useCallback(
      async (icon: StorageFile) => {
        try {
          if (doc?.icon?.storageKey) {
            const Storage = (
              await import("../../../impower-storage/classes/storage")
            ).default;
            await Storage.instance.delete(doc?.icon?.storageKey);
          }
          await new Promise<void>((resolve) =>
            userDispatch(
              userOnUpdateSubmission(
                resolve,
                {
                  ...doc,
                  icon,
                },
                collection,
                docId
              )
            )
          );
          if (onUploadIcon) {
            onUploadIcon(icon);
          }
          return true;
        } catch (error) {
          toastDispatch(toastTop(error.message, "error"));
          return false;
        }
      },
      [collection, doc, docId, onUploadIcon, toastDispatch, userDispatch]
    );

    const handleStorageError = useCallback(
      (error: StorageError): void => {
        toastDispatch(toastTop(error.message, "error"));
      },
      [toastDispatch]
    );

    const mainTag = doc?.tags?.[0] || "";
    const tagIconNames =
      configState?.tagIconNames || ConfigCache.instance.params?.tagIconNames;
    const tagDisambiguations =
      configState?.tagDisambiguations ||
      ConfigCache.instance.params?.tagDisambiguations;
    const validMainTag = tagDisambiguations[mainTag]?.[0] || mainTag;
    const tagIconName = tagIconNames?.[validMainTag] || "hashtag";

    if (!doc) {
      return null;
    }

    return (
      <StyledIconArea>
        <StyledIconContent>
          <StyledIcon>
            <StyledIconBackground
              style={{
                backgroundColor: mainColor,
              }}
            >
              <EditableAvatar
                color={mainColor}
                iconSrc={iconImage}
                name={doc?.name}
                defaultIcon={
                  mainTag ? <DynamicIcon icon={tagIconName} /> : undefined
                }
                edit
                preview
                onUpload={handleIconUpload}
                onError={handleStorageError}
              />
            </StyledIconBackground>
          </StyledIcon>
        </StyledIconContent>
        {uploadInstructions && (
          <StyledUploadInstructionsArea>
            <StyledUploadInstructionsTypography variant="caption">
              {uploadInstructions}
            </StyledUploadInstructionsTypography>
          </StyledUploadInstructionsArea>
        )}
      </StyledIconArea>
    );
  }
);

export default IconUploadForm;
