export namespace RemoteStorage {
  export interface About {
    /** Whether the user has installed the requesting app. */
    appInstalled?: boolean;
    /** Whether the user can create shared drives. */
    canCreateDrives?: boolean;
    /** Deprecated: Use `canCreateDrives` instead. */
    canCreateTeamDrives?: boolean;
    /** A list of themes that are supported for shared drives. */
    driveThemes?: Array<{
      /** A link to this theme's background image. */
      backgroundImageLink?: string;
      /** The color of this theme as an RGB hex string. */
      colorRgb?: string;
      /** The ID of the theme. */
      id?: string;
    }>;
    /** A map of source MIME type to possible targets for all supported exports. */
    exportFormats?: { [P in string]: string[] };
    /** The currently supported folder colors as RGB hex strings. */
    folderColorPalette?: string[];
    /** A map of source MIME type to possible targets for all supported imports. */
    importFormats?: { [P in string]: string[] };
    /** Identifies what kind of resource this is. Value: the fixed string `"drive#about"`. */
    kind?: string;
    /** A map of maximum import sizes by MIME type, in bytes. */
    maxImportSizes?: { [P in string]: string };
    /** The maximum upload size in bytes. */
    maxUploadSize?: string;
    /** The user's storage quota limits and usage. All fields are measured in bytes. */
    storageQuota?: {
      /** The usage limit, if applicable. This will not be present if the user has unlimited storage. */
      limit?: string;
      /** The total usage across all services. */
      usage?: string;
      /** The usage by all files in Google Drive. */
      usageInDrive?: string;
      /** The usage by trashed files in Google Drive. */
      usageInDriveTrash?: string;
    };
    /** Deprecated: Use `driveThemes` instead. */
    teamDriveThemes?: Array<{
      /** Deprecated: Use `driveThemes/backgroundImageLink` instead. */
      backgroundImageLink?: string;
      /** Deprecated: Use `driveThemes/colorRgb` instead. */
      colorRgb?: string;
      /** Deprecated: Use `driveThemes/id` instead. */
      id?: string;
    }>;
    /** The authenticated user. */
    user?: User;
  }
  export interface Change {
    /** The type of the change. Possible values are `file` and `drive`. */
    changeType?: string;
    /** The updated state of the shared drive. Present if the changeType is drive, the user is still a member of the shared drive, and the shared drive has not been deleted. */
    drive?: Drive;
    /** The ID of the shared drive associated with this change. */
    driveId?: string;
    /** The updated state of the file. Present if the type is file and the file has not been removed from this list of changes. */
    file?: File;
    /** The ID of the file which has changed. */
    fileId?: string;
    /** Identifies what kind of resource this is. Value: the fixed string `"drive#change"`. */
    kind?: string;
    /** Whether the file or shared drive has been removed from this list of changes, for example by deletion or loss of access. */
    removed?: boolean;
    /** Deprecated: Use `drive` instead. */
    teamDrive?: TeamDrive;
    /** Deprecated: Use `driveId` instead. */
    teamDriveId?: string;
    /** The time of this change (RFC 3339 date-time). */
    time?: string;
    /** Deprecated: Use `changeType` instead. */
    type?: string;
  }
  export interface ChangeList {
    /** The list of changes. If nextPageToken is populated, then this list may be incomplete and an additional page of results should be fetched. */
    changes?: Change[];
    /** Identifies what kind of resource this is. Value: the fixed string `"drive#changeList"`. */
    kind?: string;
    /** The starting page token for future changes. This will be present only if the end of the current changes list has been reached. The page token doesn't expire. */
    newStartPageToken?: string;
    /** The page token for the next page of changes. This will be absent if the end of the changes list has been reached. The page token doesn't expire. */
    nextPageToken?: string;
  }
  export interface Channel {
    /** The address where notifications are delivered for this channel. */
    address?: string;
    /** Date and time of notification channel expiration, expressed as a Unix timestamp, in milliseconds. Optional. */
    expiration?: string;
    /** A UUID or similar unique string that identifies this channel. */
    id?: string;
    /** Identifies this as a notification channel used to watch for changes to a resource, which is `api#channel`. */
    kind?: string;
    /** Additional parameters controlling delivery channel behavior. Optional. */
    params?: { [P in string]: string };
    /** A Boolean value to indicate whether payload is wanted. Optional. */
    payload?: boolean;
    /** An opaque ID that identifies the resource being watched on this channel. Stable across different API versions. */
    resourceId?: string;
    /** A version-specific identifier for the watched resource. */
    resourceUri?: string;
    /** An arbitrary string delivered to the target address with each notification delivered over this channel. Optional. */
    token?: string;
    /** The type of delivery mechanism used for this channel. */
    type?: string;
  }
  export interface Comment {
    /**
     * A region of the document represented as a JSON string. For details on defining anchor properties, refer to [Manage comments and
     * replies](https://developers.google.com/drive/api/v3/manage-comments).
     */
    anchor?: string;
    /** Output only. The author of the comment. The author's email address and permission ID will not be populated. */
    author?: User;
    /** The plain text content of the comment. This field is used for setting the content, while `htmlContent` should be displayed. */
    content?: string;
    /** The time at which the comment was created (RFC 3339 date-time). */
    createdTime?: string;
    /** Output only. Whether the comment has been deleted. A deleted comment has no content. */
    deleted?: boolean;
    /** Output only. The content of the comment with HTML formatting. */
    htmlContent?: string;
    /** Output only. The ID of the comment. */
    id?: string;
    /** Output only. Identifies what kind of resource this is. Value: the fixed string `"drive#comment"`. */
    kind?: string;
    /** The last time the comment or any of its replies was modified (RFC 3339 date-time). */
    modifiedTime?: string;
    /** The file content to which the comment refers, typically within the anchor region. For a text file, for example, this would be the text at the location of the comment. */
    quotedFileContent?: {
      /** The MIME type of the quoted content. */
      mimeType?: string;
      /** The quoted content itself. This is interpreted as plain text if set through the API. */
      value?: string;
    };
    /** Output only. The full list of replies to the comment in chronological order. */
    replies?: Reply[];
    /** Output only. Whether the comment has been resolved by one of its replies. */
    resolved?: boolean;
  }
  export interface CommentList {
    /** The list of comments. If nextPageToken is populated, then this list may be incomplete and an additional page of results should be fetched. */
    comments?: Comment[];
    /** Identifies what kind of resource this is. Value: the fixed string `"drive#commentList"`. */
    kind?: string;
    /**
     * The page token for the next page of comments. This will be absent if the end of the comments list has been reached. If the token is rejected for any reason, it should be discarded,
     * and pagination should be restarted from the first page of results. The page token is typically valid for several hours. However, if new items are added or removed, your expected
     * results might differ.
     */
    nextPageToken?: string;
  }
  export interface ContentRestriction {
    /**
     * Whether the content restriction can only be modified or removed by a user who owns the file. For files in shared drives, any user with `organizer` capabilities can modify or remove
     * this content restriction.
     */
    ownerRestricted?: boolean;
    /**
     * Whether the content of the file is read-only. If a file is read-only, a new revision of the file may not be added, comments may not be added or modified, and the title of the file
     * may not be modified.
     */
    readOnly?: boolean;
    /** Reason for why the content of the file is restricted. This is only mutable on requests that also set `readOnly=true`. */
    reason?: string;
    /** Output only. The user who set the content restriction. Only populated if `readOnly` is true. */
    restrictingUser?: User;
    /** The time at which the content restriction was set (formatted RFC 3339 timestamp). Only populated if readOnly is true. */
    restrictionTime?: string;
    /** Output only. The type of the content restriction. Currently the only possible value is `globalContentRestriction`. */
    type?: string;
  }
  export interface Drive {
    /**
     * An image file and cropping parameters from which a background image for this shared drive is set. This is a write only field; it can only be set on `drive.drives.update` requests
     * that don't set `themeId`. When specified, all fields of the `backgroundImageFile` must be set.
     */
    backgroundImageFile?: {
      /** The ID of an image file in Google Drive to use for the background image. */
      id?: string;
      /**
       * The width of the cropped image in the closed range of 0 to 1. This value represents the width of the cropped image divided by the width of the entire image. The height is
       * computed by applying a width to height aspect ratio of 80 to 9. The resulting image must be at least 1280 pixels wide and 144 pixels high.
       */
      width?: number;
      /**
       * The X coordinate of the upper left corner of the cropping area in the background image. This is a value in the closed range of 0 to 1. This value represents the horizontal
       * distance from the left side of the entire image to the left side of the cropping area divided by the width of the entire image.
       */
      xCoordinate?: number;
      /**
       * The Y coordinate of the upper left corner of the cropping area in the background image. This is a value in the closed range of 0 to 1. This value represents the vertical
       * distance from the top side of the entire image to the top side of the cropping area divided by the height of the entire image.
       */
      yCoordinate?: number;
    };
    /** Output only. A short-lived link to this shared drive's background image. */
    backgroundImageLink?: string;
    /** Output only. Capabilities the current user has on this shared drive. */
    capabilities?: {
      /** Output only. Whether the current user can add children to folders in this shared drive. */
      canAddChildren?: boolean;
      /** Output only. Whether the current user can change the `copyRequiresWriterPermission` restriction of this shared drive. */
      canChangeCopyRequiresWriterPermissionRestriction?: boolean;
      /** Output only. Whether the current user can change the `domainUsersOnly` restriction of this shared drive. */
      canChangeDomainUsersOnlyRestriction?: boolean;
      /** Output only. Whether the current user can change the background of this shared drive. */
      canChangeDriveBackground?: boolean;
      /** Output only. Whether the current user can change the `driveMembersOnly` restriction of this shared drive. */
      canChangeDriveMembersOnlyRestriction?: boolean;
      /** Output only. Whether the current user can change the `sharingFoldersRequiresOrganizerPermission` restriction of this shared drive. */
      canChangeSharingFoldersRequiresOrganizerPermissionRestriction?: boolean;
      /** Output only. Whether the current user can comment on files in this shared drive. */
      canComment?: boolean;
      /** Output only. Whether the current user can copy files in this shared drive. */
      canCopy?: boolean;
      /** Output only. Whether the current user can delete children from folders in this shared drive. */
      canDeleteChildren?: boolean;
      /**
       * Output only. Whether the current user can delete this shared drive. Attempting to delete the shared drive may still fail if there are untrashed items inside the shared
       * drive.
       */
      canDeleteDrive?: boolean;
      /** Output only. Whether the current user can download files in this shared drive. */
      canDownload?: boolean;
      /** Output only. Whether the current user can edit files in this shared drive */
      canEdit?: boolean;
      /** Output only. Whether the current user can list the children of folders in this shared drive. */
      canListChildren?: boolean;
      /** Output only. Whether the current user can add members to this shared drive or remove them or change their role. */
      canManageMembers?: boolean;
      /** Output only. Whether the current user can read the revisions resource of files in this shared drive. */
      canReadRevisions?: boolean;
      /** Output only. Whether the current user can rename files or folders in this shared drive. */
      canRename?: boolean;
      /** Output only. Whether the current user can rename this shared drive. */
      canRenameDrive?: boolean;
      /** Output only. Whether the current user can reset the shared drive restrictions to defaults. */
      canResetDriveRestrictions?: boolean;
      /** Output only. Whether the current user can share files or folders in this shared drive. */
      canShare?: boolean;
      /** Output only. Whether the current user can trash children from folders in this shared drive. */
      canTrashChildren?: boolean;
    };
    /** The color of this shared drive as an RGB hex string. It can only be set on a `drive.drives.update` request that does not set `themeId`. */
    colorRgb?: string;
    /** The time at which the shared drive was created (RFC 3339 date-time). */
    createdTime?: string;
    /** Whether the shared drive is hidden from default view. */
    hidden?: boolean;
    /** Output only. The ID of this shared drive which is also the ID of the top level folder of this shared drive. */
    id?: string;
    /** Output only. Identifies what kind of resource this is. Value: the fixed string `"drive#drive"`. */
    kind?: string;
    /** The name of this shared drive. */
    name?: string;
    /** Output only. The organizational unit of this shared drive. This field is only populated on `drives.list` responses when the `useDomainAdminAccess` parameter is set to `true`. */
    orgUnitId?: string;
    /** A set of restrictions that apply to this shared drive or items inside this shared drive. */
    restrictions?: {
      /** Whether administrative privileges on this shared drive are required to modify restrictions. */
      adminManagedRestrictions?: boolean;
      /**
       * Whether the options to copy, print, or download files inside this shared drive, should be disabled for readers and commenters. When this restriction is set to `true`, it
       * will override the similarly named field to `true` for any file inside this shared drive.
       */
      copyRequiresWriterPermission?: boolean;
      /**
       * Whether access to this shared drive and items inside this shared drive is restricted to users of the domain to which this shared drive belongs. This restriction may be
       * overridden by other sharing policies controlled outside of this shared drive.
       */
      domainUsersOnly?: boolean;
      /** Whether access to items inside this shared drive is restricted to its members. */
      driveMembersOnly?: boolean;
      /** If true, only users with the organizer role can share folders. If false, users with either the organizer role or the file organizer role can share folders. */
      sharingFoldersRequiresOrganizerPermission?: boolean;
    };
    /**
     * The ID of the theme from which the background image and color will be set. The set of possible `driveThemes` can be retrieved from a `drive.about.get` response. When not specified
     * on a `drive.drives.create` request, a random theme is chosen from which the background image and color are set. This is a write-only field; it can only be set on requests that don't
     * set `colorRgb` or `backgroundImageFile`.
     */
    themeId?: string;
  }
  export interface DriveList {
    /** The list of shared drives. If nextPageToken is populated, then this list may be incomplete and an additional page of results should be fetched. */
    drives?: Drive[];
    /** Identifies what kind of resource this is. Value: the fixed string `"drive#driveList"`. */
    kind?: string;
    /**
     * The page token for the next page of shared drives. This will be absent if the end of the list has been reached. If the token is rejected for any reason, it should be discarded, and
     * pagination should be restarted from the first page of results. The page token is typically valid for several hours. However, if new items are added or removed, your expected results
     * might differ.
     */
    nextPageToken?: string;
  }
  export interface File {
    /**
     * A collection of arbitrary key-value pairs which are private to the requesting app.
     * Entries with null values are cleared in update and copy requests. These properties can only be retrieved using an authenticated request. An authenticated request uses an access
     * token obtained with a OAuth 2 client ID. You cannot use an API key to retrieve private properties.
     */
    appProperties?: { [P in string]: string };
    /** Output only. Capabilities the current user has on this file. Each capability corresponds to a fine-grained action that a user may take. */
    capabilities?: {
      /** Output only. Whether the current user is the pending owner of the file. Not populated for shared drive files. */
      canAcceptOwnership?: boolean;
      /** Output only. Whether the current user can add children to this folder. This is always false when the item is not a folder. */
      canAddChildren?: boolean;
      /**
       * Output only. Whether the current user can add a folder from another drive (different shared drive or My Drive) to this folder. This is false when the item is not a folder.
       * Only populated for items in shared drives.
       */
      canAddFolderFromAnotherDrive?: boolean;
      /** Output only. Whether the current user can add a parent for the item without removing an existing parent in the same request. Not populated for shared drive files. */
      canAddMyDriveParent?: boolean;
      /** Output only. Whether the current user can change the `copyRequiresWriterPermission` restriction of this file. */
      canChangeCopyRequiresWriterPermission?: boolean;
      /** Output only. Whether the current user can change the securityUpdateEnabled field on link share metadata. */
      canChangeSecurityUpdateEnabled?: boolean;
      /** Deprecated: Output only. */
      canChangeViewersCanCopyContent?: boolean;
      /** Output only. Whether the current user can comment on this file. */
      canComment?: boolean;
      /**
       * Output only. Whether the current user can copy this file. For an item in a shared drive, whether the current user can copy non-folder descendants of this item, or this item
       * itself if it is not a folder.
       */
      canCopy?: boolean;
      /** Output only. Whether the current user can delete this file. */
      canDelete?: boolean;
      /** Output only. Whether the current user can delete children of this folder. This is false when the item is not a folder. Only populated for items in shared drives. */
      canDeleteChildren?: boolean;
      /** Output only. Whether the current user can download this file. */
      canDownload?: boolean;
      /**
       * Output only. Whether the current user can edit this file. Other factors may limit the type of changes a user can make to a file. For example, see
       * `canChangeCopyRequiresWriterPermission` or `canModifyContent`.
       */
      canEdit?: boolean;
      /** Output only. Whether the current user can list the children of this folder. This is always false when the item is not a folder. */
      canListChildren?: boolean;
      /** Output only. Whether the current user can modify the content of this file. */
      canModifyContent?: boolean;
      /** Deprecated: Output only. Use one of `canModifyEditorContentRestriction`, `canModifyOwnerContentRestriction` or `canRemoveContentRestriction`. */
      canModifyContentRestriction?: boolean;
      /** Output only. Whether the current user can add or modify content restrictions on the file which are editor restricted. */
      canModifyEditorContentRestriction?: boolean;
      /** Output only. Whether the current user can modify the labels on the file. */
      canModifyLabels?: boolean;
      /** Output only. Whether the current user can add or modify content restrictions which are owner restricted. */
      canModifyOwnerContentRestriction?: boolean;
      /**
       * Output only. Whether the current user can move children of this folder outside of the shared drive. This is false when the item is not a folder. Only populated for items in
       * shared drives.
       */
      canMoveChildrenOutOfDrive?: boolean;
      /** Deprecated: Output only. Use `canMoveChildrenOutOfDrive` instead. */
      canMoveChildrenOutOfTeamDrive?: boolean;
      /**
       * Output only. Whether the current user can move children of this folder within this drive. This is false when the item is not a folder. Note that a request to move the child
       * may still fail depending on the current user's access to the child and to the destination folder.
       */
      canMoveChildrenWithinDrive?: boolean;
      /** Deprecated: Output only. Use `canMoveChildrenWithinDrive` instead. */
      canMoveChildrenWithinTeamDrive?: boolean;
      /** Deprecated: Output only. Use `canMoveItemOutOfDrive` instead. */
      canMoveItemIntoTeamDrive?: boolean;
      /**
       * Output only. Whether the current user can move this item outside of this drive by changing its parent. Note that a request to change the parent of the item may still fail
       * depending on the new parent that is being added.
       */
      canMoveItemOutOfDrive?: boolean;
      /** Deprecated: Output only. Use `canMoveItemOutOfDrive` instead. */
      canMoveItemOutOfTeamDrive?: boolean;
      /**
       * Output only. Whether the current user can move this item within this drive. Note that a request to change the parent of the item may still fail depending on the new parent
       * that is being added and the parent that is being removed.
       */
      canMoveItemWithinDrive?: boolean;
      /** Deprecated: Output only. Use `canMoveItemWithinDrive` instead. */
      canMoveItemWithinTeamDrive?: boolean;
      /** Deprecated: Output only. Use `canMoveItemWithinDrive` or `canMoveItemOutOfDrive` instead. */
      canMoveTeamDriveItem?: boolean;
      /** Output only. Whether the current user can read the shared drive to which this file belongs. Only populated for items in shared drives. */
      canReadDrive?: boolean;
      /** Output only. Whether the current user can read the labels on the file. */
      canReadLabels?: boolean;
      /**
       * Output only. Whether the current user can read the revisions resource of this file. For a shared drive item, whether revisions of non-folder descendants of this item, or
       * this item itself if it is not a folder, can be read.
       */
      canReadRevisions?: boolean;
      /** Deprecated: Output only. Use `canReadDrive` instead. */
      canReadTeamDrive?: boolean;
      /**
       * Output only. Whether the current user can remove children from this folder. This is always false when the item is not a folder. For a folder in a shared drive, use
       * `canDeleteChildren` or `canTrashChildren` instead.
       */
      canRemoveChildren?: boolean;
      /** Output only. Whether there is a content restriction on the file that can be removed by the current user. */
      canRemoveContentRestriction?: boolean;
      /** Output only. Whether the current user can remove a parent from the item without adding another parent in the same request. Not populated for shared drive files. */
      canRemoveMyDriveParent?: boolean;
      /** Output only. Whether the current user can rename this file. */
      canRename?: boolean;
      /** Output only. Whether the current user can modify the sharing settings for this file. */
      canShare?: boolean;
      /** Output only. Whether the current user can move this file to trash. */
      canTrash?: boolean;
      /** Output only. Whether the current user can trash children of this folder. This is false when the item is not a folder. Only populated for items in shared drives. */
      canTrashChildren?: boolean;
      /** Output only. Whether the current user can restore this file from trash. */
      canUntrash?: boolean;
    };
    /** Additional information about the content of the file. These fields are never populated in responses. */
    contentHints?: {
      /** Text to be indexed for the file to improve fullText queries. This is limited to 128KB in length and may contain HTML elements. */
      indexableText?: string;
      /** A thumbnail for the file. This will only be used if Google Drive cannot generate a standard thumbnail. */
      thumbnail?: {
        /** The thumbnail data encoded with URL-safe Base64 (RFC 4648 section 5). */
        image?: string;
        /** The MIME type of the thumbnail. */
        mimeType?: string;
      };
    };
    /** Restrictions for accessing the content of the file. Only populated if such a restriction exists. */
    contentRestrictions?: ContentRestriction[];
    /** Whether the options to copy, print, or download this file, should be disabled for readers and commenters. */
    copyRequiresWriterPermission?: boolean;
    /** The time at which the file was created (RFC 3339 date-time). */
    createdTime?: string;
    /** A short description of the file. */
    description?: string;
    /** Output only. ID of the shared drive the file resides in. Only populated for items in shared drives. */
    driveId?: string;
    /** Output only. Whether the file has been explicitly trashed, as opposed to recursively trashed from a parent folder. */
    explicitlyTrashed?: boolean;
    /** Output only. Links for exporting Docs Editors files to specific formats. */
    exportLinks?: { [P in string]: string };
    /** Output only. The final component of `fullFileExtension`. This is only available for files with binary content in Google Drive. */
    fileExtension?: string;
    /**
     * The color for a folder or a shortcut to a folder as an RGB hex string. The supported colors are published in the `folderColorPalette` field of the About resource. If an unsupported
     * color is specified, the closest color in the palette is used instead.
     */
    folderColorRgb?: string;
    /**
     * Output only. The full file extension extracted from the `name` field. May contain multiple concatenated extensions, such as "tar.gz". This is only available for files with binary
     * content in Google Drive. This is automatically updated when the `name` field changes, however it is not cleared if the new name does not contain a valid extension.
     */
    fullFileExtension?: string;
    /** Output only. Whether there are permissions directly on this file. This field is only populated for items in shared drives. */
    hasAugmentedPermissions?: boolean;
    /**
     * Output only. Whether this file has a thumbnail. This does not indicate whether the requesting app has access to the thumbnail. To check access, look for the presence of the
     * thumbnailLink field.
     */
    hasThumbnail?: boolean;
    /** Output only. The ID of the file's head revision. This is currently only available for files with binary content in Google Drive. */
    headRevisionId?: string;
    /** Output only. A static, unauthenticated link to the file's icon. */
    iconLink?: string;
    /** The ID of the file. */
    id?: string;
    /** Output only. Additional metadata about image media, if available. */
    imageMediaMetadata?: {
      /** Output only. The aperture used to create the photo (f-number). */
      aperture?: number;
      /** Output only. The make of the camera used to create the photo. */
      cameraMake?: string;
      /** Output only. The model of the camera used to create the photo. */
      cameraModel?: string;
      /** Output only. The color space of the photo. */
      colorSpace?: string;
      /** Output only. The exposure bias of the photo (APEX value). */
      exposureBias?: number;
      /** Output only. The exposure mode used to create the photo. */
      exposureMode?: string;
      /** Output only. The length of the exposure, in seconds. */
      exposureTime?: number;
      /** Output only. Whether a flash was used to create the photo. */
      flashUsed?: boolean;
      /** Output only. The focal length used to create the photo, in millimeters. */
      focalLength?: number;
      /** Output only. The height of the image in pixels. */
      height?: number;
      /** Output only. The ISO speed used to create the photo. */
      isoSpeed?: number;
      /** Output only. The lens used to create the photo. */
      lens?: string;
      /** Output only. Geographic location information stored in the image. */
      location?: {
        /** Output only. The altitude stored in the image. */
        altitude?: number;
        /** Output only. The latitude stored in the image. */
        latitude?: number;
        /** Output only. The longitude stored in the image. */
        longitude?: number;
      };
      /** Output only. The smallest f-number of the lens at the focal length used to create the photo (APEX value). */
      maxApertureValue?: number;
      /** Output only. The metering mode used to create the photo. */
      meteringMode?: string;
      /** Output only. The number of clockwise 90 degree rotations applied from the image's original orientation. */
      rotation?: number;
      /** Output only. The type of sensor used to create the photo. */
      sensor?: string;
      /** Output only. The distance to the subject of the photo, in meters. */
      subjectDistance?: number;
      /** Output only. The date and time the photo was taken (EXIF DateTime). */
      time?: string;
      /** Output only. The white balance mode used to create the photo. */
      whiteBalance?: string;
      /** Output only. The width of the image in pixels. */
      width?: number;
    };
    /** Output only. Whether the file was created or opened by the requesting app. */
    isAppAuthorized?: boolean;
    /** Output only. Identifies what kind of resource this is. Value: the fixed string `"drive#file"`. */
    kind?: string;
    /** Output only. An overview of the labels on the file. */
    labelInfo?: {
      /** Output only. The set of labels on the file as requested by the label IDs in the `includeLabels` parameter. By default, no labels are returned. */
      labels?: Label[];
    };
    /** Output only. The last user to modify the file. */
    lastModifyingUser?: User;
    /** Contains details about the link URLs that clients are using to refer to this item. */
    linkShareMetadata?: {
      /** Output only. Whether the file is eligible for security update. */
      securityUpdateEligible?: boolean;
      /** Output only. Whether the security update is enabled for this file. */
      securityUpdateEnabled?: boolean;
    };
    /** Output only. The MD5 checksum for the content of the file. This is only applicable to files with binary content in Google Drive. */
    md5Checksum?: string;
    /**
     * The MIME type of the file. Google Drive attempts to automatically detect an appropriate value from uploaded content, if no value is provided. The value cannot be changed unless a
     * new revision is uploaded. If a file is created with a Google Doc MIME type, the uploaded content is imported, if possible. The supported import formats are published in the About
     * resource.
     */
    mimeType?: string;
    /** Output only. Whether the file has been modified by this user. */
    modifiedByMe?: boolean;
    /** The last time the file was modified by the user (RFC 3339 date-time). */
    modifiedByMeTime?: string;
    /** he last time the file was modified by anyone (RFC 3339 date-time). Note that setting modifiedTime will also update modifiedByMeTime for the user. */
    modifiedTime?: string;
    /**
     * The name of the file. This is not necessarily unique within a folder. Note that for immutable items such as the top level folders of shared drives, My Drive root folder, and
     * Application Data folder the name is constant.
     */
    // @ts-ignore
    name?: string;
    /** The original filename of the uploaded content if available, or else the original value of the `name` field. This is only available for files with binary content in Google Drive. */
    originalFilename?: string;
    /** Output only. Whether the user owns the file. Not populated for items in shared drives. */
    ownedByMe?: boolean;
    /** Output only. The owner of this file. Only certain legacy files may have more than one owner. This field isn't populated for items in shared drives. */
    owners?: User[];
    /**
     * The IDs of the parent folders which contain the file. If not specified as part of a create request, the file is placed directly in the user's My Drive folder. If not specified as
     * part of a copy request, the file inherits any discoverable parents of the source file. Update requests must use the `addParents` and `removeParents` parameters to modify the parents
     * list.
     */
    parents?: string[];
    /** Output only. List of permission IDs for users with access to this file. */
    permissionIds?: string[];
    /** Output only. The full list of permissions for the file. This is only available if the requesting user can share the file. Not populated for items in shared drives. */
    permissions?: Permission[];
    /**
     * A collection of arbitrary key-value pairs which are visible to all apps.
     * Entries with null values are cleared in update and copy requests.
     */
    properties?: { [P in string]: string };
    /** Output only. The number of storage quota bytes used by the file. This includes the head revision as well as previous revisions with `keepForever` enabled. */
    quotaBytesUsed?: string;
    /** Output only. A key needed to access the item via a shared link. */
    resourceKey?: string;
    /**
     * Output only. The SHA1 checksum associated with this file, if available. This field is only populated for files with content stored in Google Drive; it is not populated for Docs
     * Editors or shortcut files.
     */
    sha1Checksum?: string;
    /**
     * Output only. The SHA256 checksum associated with this file, if available. This field is only populated for files with content stored in Google Drive; it is not populated for Docs
     * Editors or shortcut files.
     */
    sha256Checksum?: string;
    /** Output only. Whether the file has been shared. Not populated for items in shared drives. */
    shared?: boolean;
    /** The time at which the file was shared with the user, if applicable (RFC 3339 date-time). */
    sharedWithMeTime?: string;
    /** Output only. The user who shared the file with the requesting user, if applicable. */
    sharingUser?: User;
    /** Shortcut file details. Only populated for shortcut files, which have the mimeType field set to `application/vnd.google-apps.shortcut`. */
    shortcutDetails?: {
      /** The ID of the file that this shortcut points to. */
      targetId?: string;
      /** Output only. The MIME type of the file that this shortcut points to. The value of this field is a snapshot of the target's MIME type, captured when the shortcut is created. */
      targetMimeType?: string;
      /** Output only. The ResourceKey for the target file. */
      targetResourceKey?: string;
    };
    /** Output only. Size in bytes of blobs and first party editor files. Won't be populated for files that have no size, like shortcuts and folders. */
    size?: string;
    /** Output only. The list of spaces which contain the file. The currently supported values are 'drive', 'appDataFolder' and 'photos'. */
    spaces?: string[];
    /** Whether the user has starred the file. */
    starred?: boolean;
    /** Deprecated: Output only. Use `driveId` instead. */
    teamDriveId?: string;
    /**
     * Output only. A short-lived link to the file's thumbnail, if available. Typically lasts on the order of hours. Only populated when the requesting app can access the file's content.
     * If the file isn't shared publicly, the URL returned in `Files.thumbnailLink` must be fetched using a credentialed request.
     */
    thumbnailLink?: string;
    /** Output only. The thumbnail version for use in thumbnail cache invalidation. */
    thumbnailVersion?: string;
    /** Whether the file has been trashed, either explicitly or from a trashed parent folder. Only the owner may trash a file, and other users cannot see files in the owner's trash. */
    trashed?: boolean;
    /** The time that the item was trashed (RFC 3339 date-time). Only populated for items in shared drives. */
    trashedTime?: string;
    /** Output only. If the file has been explicitly trashed, the user who trashed it. Only populated for items in shared drives. */
    trashingUser?: User;
    /** Output only. A monotonically increasing version number for the file. This reflects every change made to the file on the server, even those not visible to the user. */
    version?: string;
    /** Output only. Additional metadata about video media. This may not be available immediately upon upload. */
    videoMediaMetadata?: {
      /** Output only. The duration of the video in milliseconds. */
      durationMillis?: string;
      /** Output only. The height of the video in pixels. */
      height?: number;
      /** Output only. The width of the video in pixels. */
      width?: number;
    };
    /** Output only. Whether the file has been viewed by this user. */
    viewedByMe?: boolean;
    /** The last time the file was viewed by the user (RFC 3339 date-time). */
    viewedByMeTime?: string;
    /** Deprecated: Use `copyRequiresWriterPermission` instead. */
    viewersCanCopyContent?: boolean;
    /** Output only. A link for downloading the content of the file in a browser. This is only available for files with binary content in Google Drive. */
    webContentLink?: string;
    /** Output only. A link for opening the file in a relevant Google editor or viewer in a browser. */
    webViewLink?: string;
    /** Whether users with only `writer` permission can modify the file's permissions. Not populated for items in shared drives. */
    writersCanShare?: boolean;
  }
  export interface FileList {
    /** The list of files. If nextPageToken is populated, then this list may be incomplete and an additional page of results should be fetched. */
    files?: File[];
    /**
     * Whether the search process was incomplete. If true, then some search results might be missing, since all documents were not searched. This can occur when searching multiple drives
     * with the 'allDrives' corpora, but all corpora couldn't be searched. When this happens, it's suggested that clients narrow their query by choosing a different corpus such as 'user'
     * or 'drive'.
     */
    incompleteSearch?: boolean;
    /** Identifies what kind of resource this is. Value: the fixed string `"drive#fileList"`. */
    kind?: string;
    /**
     * The page token for the next page of files. This will be absent if the end of the files list has been reached. If the token is rejected for any reason, it should be discarded, and
     * pagination should be restarted from the first page of results. The page token is typically valid for several hours. However, if new items are added or removed, your expected results
     * might differ.
     */
    nextPageToken?: string;
  }
  export interface GeneratedIds {
    /** The IDs generated for the requesting user in the specified space. */
    ids?: string[];
    /** Identifies what kind of resource this is. Value: the fixed string `"drive#generatedIds"`. */
    kind?: string;
    /** The type of file that can be created with these IDs. */
    space?: string;
  }
  export interface Label {
    /** A map of the fields on the label, keyed by the field's ID. */
    fields?: { [P in string]: LabelField };
    /** The ID of the label. */
    id?: string;
    /** This is always drive#label */
    kind?: string;
    /** The revision ID of the label. */
    revisionId?: string;
  }
  export interface LabelField {
    /** Only present if valueType is dateString. RFC 3339 formatted date: YYYY-MM-DD. */
    dateString?: string[];
    /** The identifier of this label field. */
    id?: string;
    /** Only present if `valueType` is `integer`. */
    integer?: string[];
    /** This is always drive#labelField. */
    kind?: string;
    /** Only present if `valueType` is `selection` */
    selection?: string[];
    /** Only present if `valueType` is `text`. */
    text?: string[];
    /** Only present if `valueType` is `user`. */
    user?: User[];
    /** The field type. While new values may be supported in the future, the following are currently allowed: * `dateString` * `integer` * `selection` * `text` * `user` */
    valueType?: string;
  }
  export interface LabelFieldModification {
    /** The ID of the field to be modified. */
    fieldId?: string;
    /** This is always drive#labelFieldModification. */
    kind?: string;
    /** Replaces the value of a dateString Field with these new values. The string must be in the RFC 3339 full-date format: YYYY-MM-DD. */
    setDateValues?: string[];
    /** Replaces the value of an `integer` field with these new values. */
    setIntegerValues?: string[];
    /** Replaces a `selection` field with these new values. */
    setSelectionValues?: string[];
    /** Sets the value of a `text` field. */
    setTextValues?: string[];
    /** Replaces a `user` field with these new values. The values must be valid email addresses. */
    setUserValues?: string[];
    /** Unsets the values for this field. */
    unsetValues?: boolean;
  }
  export interface LabelList {
    /** This is always drive#labelList */
    kind?: string;
    /** The list of labels. */
    labels?: Label[];
    /**
     * The page token for the next page of labels. This field will be absent if the end of the list has been reached. If the token is rejected for any reason, it should be discarded, and
     * pagination should be restarted from the first page of results. The page token is typically valid for several hours. However, if new items are added or removed, your expected results
     * might differ.
     */
    nextPageToken?: string;
  }
  export interface LabelModification {
    /** The list of modifications to this label's fields. */
    fieldModifications?: LabelFieldModification[];
    /** This is always drive#labelModification. */
    kind?: string;
    /** The ID of the label to modify. */
    labelId?: string;
    /** If true, the label will be removed from the file. */
    removeLabel?: boolean;
  }
  export interface ModifyLabelsRequest {
    /** This is always drive#modifyLabelsRequest. */
    kind?: string;
    /** The list of modifications to apply to the labels on the file. */
    labelModifications?: LabelModification[];
  }
  export interface ModifyLabelsResponse {
    /** This is always drive#modifyLabelsResponse */
    kind?: string;
    /** The list of labels which were added or updated by the request. */
    modifiedLabels?: Label[];
  }
  export interface Permission {
    /** Whether the permission allows the file to be discovered through search. This is only applicable for permissions of type `domain` or `anyone`. */
    allowFileDiscovery?: boolean;
    /** Output only. Whether the account associated with this permission has been deleted. This field only pertains to user and group permissions. */
    deleted?: boolean;
    /**
     * Output only. The "pretty" name of the value of the permission. The following is a list of examples for each type of permission: * `user` - User's full name, as defined for their
     * Google account, such as "Joe Smith." * `group` - Name of the Google Group, such as "The Company Administrators." * `domain` - String domain name, such as "thecompany.com." *
     * `anyone` - No `displayName` is present.
     */
    displayName?: string;
    /** The domain to which this permission refers. */
    domain?: string;
    /** The email address of the user or group to which this permission refers. */
    emailAddress?: string;
    /**
     * The time at which this permission will expire (RFC 3339 date-time). Expiration times have the following restrictions: - They can only be set on user and group permissions - The time
     * must be in the future - The time cannot be more than a year in the future
     */
    expirationTime?: string;
    /** Output only. The ID of this permission. This is a unique identifier for the grantee, and is published in User resources as `permissionId`. IDs should be treated as opaque values. */
    id?: string;
    /** Output only. Identifies what kind of resource this is. Value: the fixed string `"drive#permission"`. */
    kind?: string;
    /** Whether the account associated with this permission is a pending owner. Only populated for `user` type permissions for files that are not in a shared drive. */
    pendingOwner?: boolean;
    /**
     * Output only. Details of whether the permissions on this shared drive item are inherited or directly on this item. This is an output-only field which is present only for shared drive
     * items.
     */
    permissionDetails?: Array<{
      /** Output only. Whether this permission is inherited. This field is always populated. This is an output-only field. */
      inherited?: boolean;
      /** Output only. The ID of the item from which this permission is inherited. This is an output-only field. */
      inheritedFrom?: string;
      /** Output only. The permission type for this user. While new values may be added in future, the following are currently possible: * `file` * `member` */
      permissionType?: string;
      /**
       * Output only. The primary role for this user. While new values may be added in the future, the following are currently possible: * `organizer` * `fileOrganizer` * `writer` *
       * `commenter` * `reader`
       */
      role?: string;
    }>;
    /** Output only. A link to the user's profile photo, if available. */
    photoLink?: string;
    /**
     * The role granted by this permission. While new values may be supported in the future, the following are currently allowed: * `owner` * `organizer` * `fileOrganizer` * `writer` *
     * `commenter` * `reader`
     */
    role?: string;
    /** Output only. Deprecated: Output only. Use `permissionDetails` instead. */
    teamDrivePermissionDetails?: Array<{
      /** Deprecated: Output only. Use `permissionDetails/inherited` instead. */
      inherited?: boolean;
      /** Deprecated: Output only. Use `permissionDetails/inheritedFrom` instead. */
      inheritedFrom?: string;
      /** Deprecated: Output only. Use `permissionDetails/role` instead. */
      role?: string;
      /** Deprecated: Output only. Use `permissionDetails/permissionType` instead. */
      teamDrivePermissionType?: string;
    }>;
    /**
     * The type of the grantee. Valid values are: * `user` * `group` * `domain` * `anyone` When creating a permission, if `type` is `user` or `group`, you must provide an `emailAddress`
     * for the user or group. When `type` is `domain`, you must provide a `domain`. There isn't extra information required for an `anyone` type.
     */
    type?: string;
    /** Indicates the view for this permission. Only populated for permissions that belong to a view. 'published' is the only supported value. */
    view?: string;
  }
  export interface PermissionList {
    /** Identifies what kind of resource this is. Value: the fixed string `"drive#permissionList"`. */
    kind?: string;
    /**
     * The page token for the next page of permissions. This field will be absent if the end of the permissions list has been reached. If the token is rejected for any reason, it should be
     * discarded, and pagination should be restarted from the first page of results. The page token is typically valid for several hours. However, if new items are added or removed, your
     * expected results might differ.
     */
    nextPageToken?: string;
    /** The list of permissions. If nextPageToken is populated, then this list may be incomplete and an additional page of results should be fetched. */
    permissions?: Permission[];
  }
  export interface Reply {
    /** The action the reply performed to the parent comment. Valid values are: * `resolve` * `reopen` */
    action?: string;
    /** Output only. The author of the reply. The author's email address and permission ID will not be populated. */
    author?: User;
    /** The plain text content of the reply. This field is used for setting the content, while `htmlContent` should be displayed. This is required on creates if no `action` is specified. */
    content?: string;
    /** The time at which the reply was created (RFC 3339 date-time). */
    createdTime?: string;
    /** Output only. Whether the reply has been deleted. A deleted reply has no content. */
    deleted?: boolean;
    /** Output only. The content of the reply with HTML formatting. */
    htmlContent?: string;
    /** Output only. The ID of the reply. */
    id?: string;
    /** Output only. Identifies what kind of resource this is. Value: the fixed string `"drive#reply"`. */
    kind?: string;
    /** The last time the reply was modified (RFC 3339 date-time). */
    modifiedTime?: string;
  }
  export interface ReplyList {
    /** Identifies what kind of resource this is. Value: the fixed string `"drive#replyList"`. */
    kind?: string;
    /**
     * The page token for the next page of replies. This will be absent if the end of the replies list has been reached. If the token is rejected for any reason, it should be discarded,
     * and pagination should be restarted from the first page of results. The page token is typically valid for several hours. However, if new items are added or removed, your expected
     * results might differ.
     */
    nextPageToken?: string;
    /** The list of replies. If nextPageToken is populated, then this list may be incomplete and an additional page of results should be fetched. */
    replies?: Reply[];
  }
  export interface Revision {
    /** Output only. Links for exporting Docs Editors files to specific formats. */
    exportLinks?: { [P in string]: string };
    /** Output only. The ID of the revision. */
    id?: string;
    /**
     * Whether to keep this revision forever, even if it is no longer the head revision. If not set, the revision will be automatically purged 30 days after newer content is uploaded. This
     * can be set on a maximum of 200 revisions for a file. This field is only applicable to files with binary content in Drive.
     */
    keepForever?: boolean;
    /** Output only. Identifies what kind of resource this is. Value: the fixed string `"drive#revision"`. */
    kind?: string;
    /** Output only. The last user to modify this revision. */
    lastModifyingUser?: User;
    /** Output only. The MD5 checksum of the revision's content. This is only applicable to files with binary content in Drive. */
    md5Checksum?: string;
    /** Output only. The MIME type of the revision. */
    mimeType?: string;
    /** The last time the revision was modified (RFC 3339 date-time). */
    modifiedTime?: string;
    /** Output only. The original filename used to create this revision. This is only applicable to files with binary content in Drive. */
    originalFilename?: string;
    /** Whether subsequent revisions will be automatically republished. This is only applicable to Docs Editors files. */
    publishAuto?: boolean;
    /** Whether this revision is published. This is only applicable to Docs Editors files. */
    published?: boolean;
    /** Output only. A link to the published revision. This is only populated for Google Sites files. */
    publishedLink?: string;
    /** Whether this revision is published outside the domain. This is only applicable to Docs Editors files. */
    publishedOutsideDomain?: boolean;
    /** Output only. The size of the revision's content in bytes. This is only applicable to files with binary content in Drive. */
    size?: string;
  }
  export interface RevisionList {
    /** Identifies what kind of resource this is. Value: the fixed string `"drive#revisionList"`. */
    kind?: string;
    /**
     * The page token for the next page of revisions. This will be absent if the end of the revisions list has been reached. If the token is rejected for any reason, it should be
     * discarded, and pagination should be restarted from the first page of results. The page token is typically valid for several hours. However, if new items are added or removed, your
     * expected results might differ.
     */
    nextPageToken?: string;
    /** The list of revisions. If nextPageToken is populated, then this list may be incomplete and an additional page of results should be fetched. */
    revisions?: Revision[];
  }
  export interface StartPageToken {
    /** Identifies what kind of resource this is. Value: the fixed string `"drive#startPageToken"`. */
    kind?: string;
    /** The starting page token for listing future changes. The page token doesn't expire. */
    startPageToken?: string;
  }
  export interface TeamDrive {
    /**
     * An image file and cropping parameters from which a background image for this Team Drive is set. This is a write only field; it can only be set on `drive.teamdrives.update` requests
     * that don't set `themeId`. When specified, all fields of the `backgroundImageFile` must be set.
     */
    backgroundImageFile?: {
      /** The ID of an image file in Drive to use for the background image. */
      id?: string;
      /**
       * The width of the cropped image in the closed range of 0 to 1. This value represents the width of the cropped image divided by the width of the entire image. The height is
       * computed by applying a width to height aspect ratio of 80 to 9. The resulting image must be at least 1280 pixels wide and 144 pixels high.
       */
      width?: number;
      /**
       * The X coordinate of the upper left corner of the cropping area in the background image. This is a value in the closed range of 0 to 1. This value represents the horizontal
       * distance from the left side of the entire image to the left side of the cropping area divided by the width of the entire image.
       */
      xCoordinate?: number;
      /**
       * The Y coordinate of the upper left corner of the cropping area in the background image. This is a value in the closed range of 0 to 1. This value represents the vertical
       * distance from the top side of the entire image to the top side of the cropping area divided by the height of the entire image.
       */
      yCoordinate?: number;
    };
    /** A short-lived link to this Team Drive's background image. */
    backgroundImageLink?: string;
    /** Capabilities the current user has on this Team Drive. */
    capabilities?: {
      /** Whether the current user can add children to folders in this Team Drive. */
      canAddChildren?: boolean;
      /** Whether the current user can change the `copyRequiresWriterPermission` restriction of this Team Drive. */
      canChangeCopyRequiresWriterPermissionRestriction?: boolean;
      /** Whether the current user can change the `domainUsersOnly` restriction of this Team Drive. */
      canChangeDomainUsersOnlyRestriction?: boolean;
      /** Whether the current user can change the `sharingFoldersRequiresOrganizerPermission` restriction of this Team Drive. */
      canChangeSharingFoldersRequiresOrganizerPermissionRestriction?: boolean;
      /** Whether the current user can change the background of this Team Drive. */
      canChangeTeamDriveBackground?: boolean;
      /** Whether the current user can change the `teamMembersOnly` restriction of this Team Drive. */
      canChangeTeamMembersOnlyRestriction?: boolean;
      /** Whether the current user can comment on files in this Team Drive. */
      canComment?: boolean;
      /** Whether the current user can copy files in this Team Drive. */
      canCopy?: boolean;
      /** Whether the current user can delete children from folders in this Team Drive. */
      canDeleteChildren?: boolean;
      /** Whether the current user can delete this Team Drive. Attempting to delete the Team Drive may still fail if there are untrashed items inside the Team Drive. */
      canDeleteTeamDrive?: boolean;
      /** Whether the current user can download files in this Team Drive. */
      canDownload?: boolean;
      /** Whether the current user can edit files in this Team Drive */
      canEdit?: boolean;
      /** Whether the current user can list the children of folders in this Team Drive. */
      canListChildren?: boolean;
      /** Whether the current user can add members to this Team Drive or remove them or change their role. */
      canManageMembers?: boolean;
      /** Whether the current user can read the revisions resource of files in this Team Drive. */
      canReadRevisions?: boolean;
      /** Deprecated: Use `canDeleteChildren` or `canTrashChildren` instead. */
      canRemoveChildren?: boolean;
      /** Whether the current user can rename files or folders in this Team Drive. */
      canRename?: boolean;
      /** Whether the current user can rename this Team Drive. */
      canRenameTeamDrive?: boolean;
      /** Whether the current user can reset the Team Drive restrictions to defaults. */
      canResetTeamDriveRestrictions?: boolean;
      /** Whether the current user can share files or folders in this Team Drive. */
      canShare?: boolean;
      /** Whether the current user can trash children from folders in this Team Drive. */
      canTrashChildren?: boolean;
    };
    /** The color of this Team Drive as an RGB hex string. It can only be set on a `drive.teamdrives.update` request that does not set `themeId`. */
    colorRgb?: string;
    /** The time at which the Team Drive was created (RFC 3339 date-time). */
    createdTime?: string;
    /** The ID of this Team Drive which is also the ID of the top level folder of this Team Drive. */
    id?: string;
    /** Identifies what kind of resource this is. Value: the fixed string `"drive#teamDrive"`. */
    kind?: string;
    /** The name of this Team Drive. */
    name?: string;
    /** The organizational unit of this shared drive. This field is only populated on `drives.list` responses when the `useDomainAdminAccess` parameter is set to `true`. */
    orgUnitId?: string;
    /** A set of restrictions that apply to this Team Drive or items inside this Team Drive. */
    restrictions?: {
      /** Whether administrative privileges on this Team Drive are required to modify restrictions. */
      adminManagedRestrictions?: boolean;
      /**
       * Whether the options to copy, print, or download files inside this Team Drive, should be disabled for readers and commenters. When this restriction is set to `true`, it will
       * override the similarly named field to `true` for any file inside this Team Drive.
       */
      copyRequiresWriterPermission?: boolean;
      /**
       * Whether access to this Team Drive and items inside this Team Drive is restricted to users of the domain to which this Team Drive belongs. This restriction may be overridden
       * by other sharing policies controlled outside of this Team Drive.
       */
      domainUsersOnly?: boolean;
      /** If true, only users with the organizer role can share folders. If false, users with either the organizer role or the file organizer role can share folders. */
      sharingFoldersRequiresOrganizerPermission?: boolean;
      /** Whether access to items inside this Team Drive is restricted to members of this Team Drive. */
      teamMembersOnly?: boolean;
    };
    /**
     * The ID of the theme from which the background image and color will be set. The set of possible `teamDriveThemes` can be retrieved from a `drive.about.get` response. When not
     * specified on a `drive.teamdrives.create` request, a random theme is chosen from which the background image and color are set. This is a write-only field; it can only be set on
     * requests that don't set `colorRgb` or `backgroundImageFile`.
     */
    themeId?: string;
  }
  export interface TeamDriveList {
    /** Identifies what kind of resource this is. Value: the fixed string `"drive#teamDriveList"`. */
    kind?: string;
    /**
     * The page token for the next page of Team Drives. This will be absent if the end of the Team Drives list has been reached. If the token is rejected for any reason, it should be
     * discarded, and pagination should be restarted from the first page of results. The page token is typically valid for several hours. However, if new items are added or removed, your
     * expected results might differ.
     */
    nextPageToken?: string;
    /** The list of Team Drives. If nextPageToken is populated, then this list may be incomplete and an additional page of results should be fetched. */
    teamDrives?: TeamDrive[];
  }
  export interface User {
    /** Output only. A plain text displayable name for this user. */
    displayName?: string;
    /** Output only. The email address of the user. This may not be present in certain contexts if the user has not made their email address visible to the requester. */
    emailAddress?: string;
    /** Output only. Identifies what kind of resource this is. Value: the fixed string `"drive#user"`. */
    kind?: string;
    /** Output only. Whether this user is the requesting user. */
    me?: boolean;
    /** Output only. The user's ID as visible in Permission resources. */
    permissionId?: string;
    /** Output only. A link to the user's profile photo, if available. */
    photoLink?: string;
  }
}
