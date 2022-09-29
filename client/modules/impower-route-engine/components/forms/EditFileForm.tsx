import styled from "@emotion/styled";
import FilledInput from "@material-ui/core/FilledInput";
import React, {
  PropsWithChildren,
  useCallback,
  useMemo,
  useState,
} from "react";
import { FileData } from "../../../../../spark-engine";
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
  docId?: string;
  doc?: FileData;
  style?: React.CSSProperties;
  onClose?: () => void;
  onChange?: (doc?: FileData) => void;
}

const EditFileForm = React.memo(
  (props: PropsWithChildren<EditFileFormProps>): JSX.Element | null => {
    const { docId, doc, style, children, onClose, onChange } = props;
    const [expandedProperties, setExpandedProperties] = useState<string[]>([]);

    const data = useMemo(() => [doc], [doc]);

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
        name={doc?.name}
        value={doc}
        configurable
        onClose={onClose}
        style={style}
      >
        <StyledEditFileForm>
          <InspectorForm
            data={data}
            variant="filled"
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
            getPropertyDocPaths={handleGetPropertyDocIds}
          >
            {children}
          </InspectorForm>
        </StyledEditFileForm>
      </FilePreviewOverlay>
    );
  }
);

export default EditFileForm;
