import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { Button, Link, Typography } from "@material-ui/core";
import { DialogProps } from "@material-ui/core/Dialog";
import React, { useMemo } from "react";
import CreativeCommonsZeroBrandsIcon from "../../../resources/icons/brands/creative-commons-zero.svg";
import CreativeCommonsBrandsIcon from "../../../resources/icons/brands/creative-commons.svg";
import { ConfigParameters } from "../../impower-config";
import { ProjectDocument } from "../../impower-data-store";
import { FontIcon, SvgData } from "../../impower-icon";
import { CreationStep } from "../../impower-route/components/forms/CreateDocumentForm";
import CreateGameForm from "../../impower-route/components/forms/CreateGameForm";
import EditDialog from "../../impower-route/components/popups/EditDialog";
import PitchCard from "./PitchCard";

const submitLabel = "Pitch Game";

const steps: CreationStep[] = [
  {
    title: "Pitch a game",
    description: "What kind of game is it?",
    propertyPaths: ["tags"],
  },
  {
    title: "What's it called?",
    propertyPaths: ["name"],
  },
  {
    title: "Describe it!",
    propertyPaths: ["summary"],
  },
  {
    title: "Last thing!",
    description: "What's the goal of your pitch?",
    propertyPaths: ["pitchGoal"],
  },
  {
    title: "Ready to pitch?",
    propertyPaths: [],
    preview: true,
  },
];

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
  id: string;
  doc: ProjectDocument;
}

const PitchPreview = React.memo((props: PitchPreviewProps) => {
  const { config, icons, id, doc } = props;
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
          id={id}
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
  id: string;
  doc?: ProjectDocument;
  onChange?: (doc: ProjectDocument) => void;
  onSubmit?: (
    e: React.FormEvent | React.MouseEvent,
    id: string,
    doc: ProjectDocument
  ) => Promise<void>;
  onSubmitted?: (id: string, doc: ProjectDocument, successful: boolean) => void;
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
    id,
    doc,
    onChange,
    onSubmit,
    onSubmitted,
    onClose,
    ...dialogProps
  } = props;

  const preview = useMemo(
    () => <PitchPreview config={config} icons={icons} id={id} doc={doc} />,
    [config, doc, icons, id]
  );

  return (
    <>
      {/* Load fonts so they don't flash later */}
      <StyledMonospaceFontLoader>.</StyledMonospaceFontLoader>
      <EditDialog open={open} onClose={onClose} {...dialogProps}>
        <CreateGameForm
          doc={doc}
          steps={steps}
          submitLabel={submitLabel}
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
