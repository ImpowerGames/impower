import styled from "@emotion/styled";
import FilledInput from "@material-ui/core/FilledInput";
import React, {
  PropsWithChildren,
  useCallback,
  useMemo,
  useState,
} from "react";
import { FileData } from "../../../impower-game/data";
import {
  AudioFileInspector,
  ImageFileInspector,
  TextFileInspector,
  VideoFileInspector,
} from "../../../impower-game/inspector";
import { isAudioFileData } from "../../../impower-game/project/classes/instances/files/audioFile/audioFileData";
import { isImageFileData } from "../../../impower-game/project/classes/instances/files/imageFile/imageFileData";
import { isTextFileData } from "../../../impower-game/project/classes/instances/files/textFile/textFileData";
import { isVideoFileData } from "../../../impower-game/project/classes/instances/files/videoFile/videoFileData";
import InspectorForm from "../../../impower-route/components/forms/InspectorForm";
import BooleanInput from "../../../impower-route/components/inputs/BooleanInput";
import ColorInput from "../../../impower-route/components/inputs/ColorInput";
import NumberInput from "../../../impower-route/components/inputs/NumberInput";
import ObjectField from "../../../impower-route/components/inputs/ObjectField";
import StringInput from "../../../impower-route/components/inputs/StringInput";
import FilePreviewOverlay from "./FilePreviewOverlay";

const StyledEditFileForm = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  padding-top: ${(props): string => props.theme.spacing(1)};
  padding-left: ${(props): string =>
    props.theme.spacing(props.theme.space.panelLeft)};
  min-width: ${(props): string => props.theme.minWidth.panel};
  overflow: scroll;
`;

interface EditFileFormProps {
  scrollParent?: HTMLElement;
  docId?: string;
  doc?: FileData;
  style?: React.CSSProperties;
  onClose?: () => void;
  onChange?: (doc?: FileData) => void;
}

const EditFileForm = React.memo(
  (props: PropsWithChildren<EditFileFormProps>): JSX.Element | null => {
    const { scrollParent, docId, doc, style, children, onClose, onChange } =
      props;
    const [expandedProperties, setExpandedProperties] = useState<string[]>([]);

    const data = useMemo(() => [doc], [doc]);

    const handleGetDocumentInspector = useCallback((data: FileData) => {
      if (isImageFileData(data)) {
        return ImageFileInspector.instance;
      }
      if (isAudioFileData(data)) {
        return AudioFileInspector.instance;
      }
      if (isVideoFileData(data)) {
        return VideoFileInspector.instance;
      }
      if (isTextFileData(data)) {
        return TextFileInspector.instance;
      }
      return undefined;
    }, []);
    const handleExpandProperty = useCallback(
      (propertyPath, expanded): void => {
        if (expanded && !expandedProperties.includes(propertyPath)) {
          setExpandedProperties([...expandedProperties, propertyPath]);
        } else if (!expanded && expandedProperties.includes(propertyPath)) {
          setExpandedProperties(
            expandedProperties.filter((p): boolean => p !== propertyPath)
          );
        }
      },
      [expandedProperties]
    );
    const handleGetPropertyDocIds = useCallback(
      (): string[] => [docId],
      [docId]
    );
    const handleDebouncedChange = useCallback(
      (data: FileData[]) => {
        if (onChange) {
          onChange(data[0]);
        }
      },
      [onChange]
    );

    if (!doc) {
      return null;
    }

    return (
      <FilePreviewOverlay
        scrollParent={scrollParent}
        name={doc?.name}
        value={doc}
        configurable
        onClose={onClose}
        style={style}
      >
        <StyledEditFileForm>
          <InspectorForm
            getInspector={handleGetDocumentInspector}
            data={data}
            variant="filled"
            inset
            InputComponent={FilledInput}
            StringInputComponent={StringInput}
            NumberInputComponent={NumberInput}
            ColorInputComponent={ColorInput}
            BooleanInputComponent={BooleanInput}
            ObjectFieldComponent={ObjectField}
            size="small"
            spacing={8}
            backgroundColor="white"
            expandedProperties={expandedProperties}
            onExpandProperty={handleExpandProperty}
            onDebouncedChange={handleDebouncedChange}
            getPropertyDocIds={handleGetPropertyDocIds}
          >
            {children}
          </InspectorForm>
        </StyledEditFileForm>
      </FilePreviewOverlay>
    );
  }
);

export default EditFileForm;
