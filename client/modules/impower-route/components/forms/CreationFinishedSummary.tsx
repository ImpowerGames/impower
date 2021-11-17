import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Divider from "@material-ui/core/Divider";
import Typography from "@material-ui/core/Typography";
import NextLink from "next/link";
import React, { PropsWithChildren } from "react";
import { StorageFile } from "../../../impower-core";
import { PageDocument } from "../../../impower-data-store";
import FontIcon from "../../../impower-icon/components/FontIcon";
import IconUploadForm from "./IconUploadForm";

const StyledHeaderTitleArea = styled.div``;

const StyledTitleTypography = styled(Typography)`
  text-align: center;
  padding: ${(props): string => props.theme.spacing(1, 0)};
  font-weight: ${(props): number => props.theme.fontWeight.bold};
`;

const StyledDescriptionTypography = styled(Typography)`
  text-align: center;
  padding: ${(props): string => props.theme.spacing(1, 0)};
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  font-size: 1.125rem;
`;

const StyledSpacer = styled.div`
  min-height: ${(props): string => props.theme.spacing(1)};
`;

const StyledDivider = styled(Divider)`
  margin: ${(props): string => props.theme.spacing(0.5, 0)};
  width: 100%;
`;

const StyledNameTypography = styled(Typography)`
  opacity: 0.7;
  text-align: center;
  padding-bottom: ${(props): string => props.theme.spacing(1)};
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
`;

const StyledButton = styled(Button)`
  margin: ${(props): string => props.theme.spacing(1, 0)};
`;

const StyledButtonIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1.5)};
`;

export interface CreationFinishedSummaryProps {
  collection: "users" | "studios" | "projects";
  docId: string;
  doc: PageDocument;
  successfulTitle: string;
  successfulDescription: string;
  finishedButtons: {
    [type: string]: {
      label: string;
      icon: string;
      link: string;
      variant?: "text" | "outlined" | "contained";
    };
  };
  onUploadIcon: (file: StorageFile) => void;
}

const CreationFinishedSummary = React.memo(
  (
    props: PropsWithChildren<CreationFinishedSummaryProps>
  ): JSX.Element | null => {
    const {
      collection,
      docId,
      doc,
      successfulTitle,
      successfulDescription,
      finishedButtons,
      onUploadIcon,
    } = props;

    if (!doc) {
      return null;
    }

    return (
      <>
        <StyledHeaderTitleArea>
          <StyledTitleTypography variant="h5">
            {successfulTitle}
          </StyledTitleTypography>
          {doc?.name && (
            <StyledNameTypography variant="body1">
              {doc?.name}
            </StyledNameTypography>
          )}
          <IconUploadForm
            collection={collection}
            docId={docId}
            doc={doc}
            onUploadIcon={onUploadIcon}
          />
          {successfulTitle && successfulDescription && <StyledDivider />}
          {successfulDescription && (
            <StyledDescriptionTypography variant="body1">
              {successfulDescription}
            </StyledDescriptionTypography>
          )}
          <StyledSpacer />
        </StyledHeaderTitleArea>
        {Object.entries(finishedButtons).map(([key, value]) => {
          const Icon = value.icon;
          return (
            <NextLink
              key={key}
              href={value.link.replace("{id}", docId)}
              passHref
            >
              <StyledButton
                variant={value.variant}
                color="primary"
                size="large"
                fullWidth
              >
                <StyledButtonIconArea>
                  <FontIcon aria-label={value.label} size={20}>
                    <Icon />
                  </FontIcon>
                </StyledButtonIconArea>
                {value.label}
              </StyledButton>
            </NextLink>
          );
        })}
      </>
    );
  }
);

export default CreationFinishedSummary;
