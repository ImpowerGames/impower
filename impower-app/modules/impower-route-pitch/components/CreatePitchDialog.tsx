import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import { DialogProps } from "@mui/material/Dialog";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import React, { useMemo } from "react";
import CreativeCommonsZeroBrandsIcon from "../../../resources/icons/brands/creative-commons-zero.svg";
import CreativeCommonsBrandsIcon from "../../../resources/icons/brands/creative-commons.svg";
import { ConfigParameters } from "../../impower-config";
import { ProjectDocument, ProjectType } from "../../impower-data-store";
import { FontIcon, SvgData } from "../../impower-icon";
import { CreationStep } from "../../impower-route/components/forms/CreateDocumentForm";
import CreateProjectForm from "../../impower-route/components/forms/CreateProjectForm";
import EditDialog from "../../impower-route/components/popups/EditDialog";
import PitchCard from "./PitchCard";

const StyledLinkButton = styled(Button)`
  text-transform: none;
  text-align: left;
`;

const StyledButtonIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1)};
`;

const StyledPreview = styled.div`
  flex: 1;
  position: relative;
  overflow: auto;
`;

const StyledPreviewContent = styled.div`
  ${(props): string => props.theme.breakpoints.down("md")} {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
  }
`;

const StyledDisclaimerArea = styled.div`
  padding-top: ${(props): string => props.theme.spacing(2)};
  display: flex;
`;

const StyledLink = styled(Link)``;

const StyledTypography = styled(Typography)``;

const StyledMonospaceFontLoader = styled.p`
  font-family: ${(props): string => props.theme.fontFamily.monospace};
  top: -1000vh;
  left: -1000vw;
  position: absolute;
  pointer-events: none;
`;

interface PitchPreviewProps {
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  doc: ProjectDocument;
}

const PitchPreview = React.memo((props: PitchPreviewProps) => {
  const { config, icons, doc } = props;
  const theme = useTheme();
  const creativeCommonsIconStyle = useMemo(
    () => ({ marginBottom: theme.spacing(0.5) }),
    [theme]
  );
  const previewStyle = useMemo(
    () => ({ borderRadius: theme.spacing(1), boxShadow: theme.shadows[1] }),
    [theme]
  );
  return (
    <StyledPreview>
      <StyledPreviewContent>
        <PitchCard
          config={config}
          icons={icons}
          doc={doc}
          preview
          style={previewStyle}
        />
        <StyledDisclaimerArea>
          <StyledLink
            href="https://creativecommons.org/publicdomain/zero/1.0/"
            target="_blank"
            rel="noreferrer"
            underline="none"
          >
            <StyledLinkButton>
              <StyledButtonIconArea>
                <FontIcon
                  aria-label={`Creative Commons`}
                  color={theme.palette.grey[500]}
                  style={creativeCommonsIconStyle}
                  size={24}
                >
                  <CreativeCommonsBrandsIcon />
                </FontIcon>
                <FontIcon
                  aria-label={`Public Domain`}
                  color={theme.palette.grey[500]}
                  size={24}
                >
                  <CreativeCommonsZeroBrandsIcon />
                </FontIcon>
              </StyledButtonIconArea>
              <StyledTypography variant="caption" color="textSecondary">
                {`All pitch posts are considered part of the public domain. That means that anyone can freely utilize, remix, and be inspired by this pitch!`}
              </StyledTypography>
            </StyledLinkButton>
          </StyledLink>
        </StyledDisclaimerArea>
      </StyledPreviewContent>
    </StyledPreview>
  );
});

interface CreatePitchDialogProps
  extends Omit<DialogProps, "maxWidth" | "onSubmit" | "onChange"> {
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  type?: ProjectType;
  docId?: string;
  doc?: ProjectDocument;
  editing?: boolean;
  onChange?: (doc: ProjectDocument) => void;
  onSubmit?: (
    e: React.FormEvent | React.MouseEvent,
    id: string,
    doc: ProjectDocument
  ) => Promise<void>;
  onSubmitted?: (
    e: React.FormEvent | React.MouseEvent,
    id: string,
    doc: ProjectDocument,
    successful: boolean
  ) => Promise<void>;
  onClose?: (
    e: React.MouseEvent,
    reason: "backdropClick" | "escapeKeyDown" | "closeButtonClick" | "submitted"
  ) => void;
}

const CreatePitchDialog = React.memo((props: CreatePitchDialogProps) => {
  const {
    config,
    icons,
    open,
    doc,
    type = doc?.projectType,
    docId,
    editing,
    onChange,
    onSubmit,
    onSubmitted,
    onClose,
    ...dialogProps
  } = props;

  const preview = useMemo(
    () => <PitchPreview config={config} icons={icons} doc={doc} />,
    [config, doc, icons]
  );

  const createLabel = `Pitch ${type}`;
  const editLabel = "Update Pitch";

  const steps: CreationStep[] = useMemo(
    () => [
      {
        title: type === "music" ? `Pitch a ${type} track` : `Pitch a ${type}`,
        description: `What kind of ${type} is it?`,
        propertyPaths: ["tags"],
      },
      ...(type === "game" || type === "story"
        ? [
            {
              title: "What's it called?",
              propertyPaths: ["name"],
            },
          ]
        : []),
      ...(type === "character"
        ? [
            {
              title: "Describe them!",
              propertyPaths: ["summary"],
            },
          ]
        : []),
      ...(type === "game" || type === "story" || type === "environment"
        ? [
            {
              title: "",
              propertyPaths: ["summary"],
            },
          ]
        : []),
      ...(type === "voice"
        ? [
            {
              title: "What should they say?",
              propertyPaths: ["summary"],
            },
          ]
        : []),
      {
        title: "Ready to pitch?",
        propertyPaths: [],
        preview: true,
      },
    ],
    [type]
  );

  return (
    <>
      {/* Load fonts so they don't flash later */}
      <StyledMonospaceFontLoader>.</StyledMonospaceFontLoader>
      <EditDialog open={open} onClose={onClose} {...dialogProps}>
        <CreateProjectForm
          docId={docId}
          doc={doc}
          steps={steps}
          submitLabel={editing ? editLabel : createLabel}
          preview={preview}
          onChange={onChange}
          onSubmit={onSubmit}
          onSubmitted={onSubmitted}
          onClose={onClose}
        />
      </EditDialog>
    </>
  );
});

export default CreatePitchDialog;
