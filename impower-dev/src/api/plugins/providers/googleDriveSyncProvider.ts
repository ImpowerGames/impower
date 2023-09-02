import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { Auth, google } from "googleapis";
import deleteSessionCookie from "../../utils/deleteSessionCookie";
import getSessionCookieData from "../../utils/getSessionCookieData";
import isXmlHttpRequest from "../../utils/isXmlHttpRequest";
import setSessionCookieData from "../../utils/setSessionCookieData";

const FILE_FIELDS =
  "id, name, mimeType, trashed, version, headRevisionId, originalFilename, md5Checksum, lastModifyingUser, modifiedByMe, modifiedByMeTime, modifiedTime, resourceKey, size, appProperties, capabilities/canModifyContent";

const ERROR = {
  FORBIDDEN_CROSS_DOMAIN_REQUEST: {
    status: 400,
    data: {
      error: "invalid_request",
      error_description: "Forbidden Cross-Domain Request",
    },
  },
  INVALID_FILE_UPLOAD_REQUEST: {
    status: 400,
    data: {
      error: "invalid_request",
      error_description: "Invalid file upload request",
    },
  },
  UNAUTHENTICATED: {
    status: 401,
    data: {
      error: "unauthenticated",
      error_description:
        "Request not authenticated due to missing, invalid, or expired OAuth token.",
    },
  },
  PERMISSION_DENIED: {
    status: 403,
    data: {
      error: "permission_denied",
      error_description: "Client does not have sufficient permission.",
    },
  },
} as const;

const hasSyncPermission = (scope: string = "") => {
  const grantedScopes = scope.split(" ");
  return grantedScopes.includes("https://www.googleapis.com/auth/drive.file");
};

/**
 * Only allow secure httpOnly sameSite requests
 */
const secure = async <T>(
  request: FastifyRequest,
  reply: FastifyReply,
  response: () => Promise<T>
) => {
  try {
    if (isXmlHttpRequest(request)) {
      const payload = await response();
      return reply.type("application/json").send(payload);
    } else {
      return reply
        .status(ERROR.FORBIDDEN_CROSS_DOMAIN_REQUEST.status)
        .send(ERROR.FORBIDDEN_CROSS_DOMAIN_REQUEST.data);
    }
  } catch (err: any) {
    request.log.error(err);
    if (err.status) {
      return reply.status(err.status).send(err.response.data);
    }
  }
};

/**
 * Only allow authenticated requests (with valid session cookie)
 */
const authenticated = async <T>(
  request: FastifyRequest,
  reply: FastifyReply,
  response: (auth: Auth.OAuth2Client) => Promise<T>
) => {
  return secure(request, reply, async () => {
    const sessionCookieData = getSessionCookieData(request);
    if (!sessionCookieData?.refresh_token) {
      return reply
        .status(ERROR.UNAUTHENTICATED.status)
        .send(ERROR.UNAUTHENTICATED.data);
    }
    const auth = new google.auth.OAuth2(
      process.env["BROWSER_GOOGLE_OAUTH_CLIENT_ID"],
      process.env["SERVER_GOOGLE_OAUTH_CLIENT_SECRET"]
    );
    auth.setCredentials({ refresh_token: sessionCookieData.refresh_token });
    const data = await response(auth);
    setSessionCookieData(request, {
      provider: "google",
      refresh_token: auth.credentials.refresh_token!,
    });
    return data;
  });
};

const googleDriveSyncProvider: FastifyPluginCallback = async (
  app,
  opts,
  next
) => {
  app.post<{
    Body: {
      code: string;
    };
  }>("/api/auth/signin", async (request, reply) => {
    const { code } = request.body;
    return secure(request, reply, async () => {
      const auth = new google.auth.OAuth2(
        process.env["BROWSER_GOOGLE_OAUTH_CLIENT_ID"],
        process.env["SERVER_GOOGLE_OAUTH_CLIENT_SECRET"],
        "postmessage"
      );
      let { tokens } = await auth.getToken(code);
      auth.setCredentials(tokens);
      setSessionCookieData(request, {
        provider: "google",
        refresh_token: auth.credentials.refresh_token!,
      });
      const res = await auth.refreshAccessToken();
      const token = res.credentials.access_token;
      const expires = res.credentials.expiry_date;
      const scope = res.credentials.scope;
      const consented = hasSyncPermission(scope);
      return { token, expires, scope, consented };
    });
  });
  app.post("/api/auth/signout", async (request, reply) => {
    return secure(request, reply, async () => {
      deleteSessionCookie(request);
    });
  });
  app.get("/api/auth/account", async (request, reply) => {
    return authenticated(request, reply, async (auth) => {
      // Get user profile info
      const peopleService = google.people({ version: "v1", auth });
      const peopleResult = await peopleService.people.get({
        resourceName: "people/me",
        personFields: "names,photos,emailAddresses",
      });
      const displayName = peopleResult.data.names?.filter(
        (n) => n.metadata?.primary
      )?.[0]?.displayName;
      const photoURL = peopleResult.data.photos?.filter(
        (n) => n.metadata?.primary
      )?.[0]?.url;
      const email = peopleResult.data.emailAddresses?.filter(
        (n) => n.metadata?.primary
      )?.[0]?.value;
      // Get user id
      const res = await auth.refreshAccessToken();
      const token = res.credentials.access_token!;
      const expires = res.credentials.expiry_date;
      const scope = res.credentials.scope;
      const tokenInfo = await auth.getTokenInfo(token);
      const uid = tokenInfo.sub!;
      const consented = hasSyncPermission(scope);
      return {
        uid,
        displayName,
        photoURL,
        email,
        token,
        expires,
        scope,
        consented,
      };
    });
  });
  app.get("/api/auth/access", async (request, reply) => {
    return authenticated(request, reply, async (auth) => {
      const res = await auth.refreshAccessToken();
      const token = res.credentials.access_token;
      const expires = res.credentials.expiry_date;
      const scope = res.credentials.scope;
      const consented = hasSyncPermission(scope);
      return { token, expires, scope, consented };
    });
  });
  app.post<{
    Params: {
      folderId: string;
    };
  }>("/api/storage/file/:folderId", async (request, reply) => {
    const { folderId } = request.params;
    const data = await request.file();
    const name = data?.filename;
    const mimeType = data?.mimetype;
    const fileStream = data?.file;
    if (!name || !mimeType || !fileStream) {
      return reply
        .status(ERROR.INVALID_FILE_UPLOAD_REQUEST.status)
        .send(ERROR.INVALID_FILE_UPLOAD_REQUEST.data);
    }
    return authenticated(request, reply, async (auth) => {
      const drive = google.drive({ version: "v3", auth });
      const res = await drive.files.create({
        requestBody: {
          name,
          parents: [folderId],
        },
        media: {
          mimeType,
          body: fileStream,
        },
        fields: FILE_FIELDS,
      });
      return res.data;
    });
  });
  app.put<{
    Params: {
      fileId: string;
    };
  }>("/api/storage/file/:fileId", async (request, reply) => {
    const { fileId } = request.params;
    const data = await request.file();
    const name = data?.filename;
    const mimeType = data?.mimetype;
    const fileStream = data?.file;
    if (!name || !mimeType || !fileStream) {
      return reply
        .status(ERROR.INVALID_FILE_UPLOAD_REQUEST.status)
        .send(ERROR.INVALID_FILE_UPLOAD_REQUEST.data);
    }
    return authenticated(request, reply, async (auth) => {
      const drive = google.drive({ version: "v3", auth });
      const res = await drive.files.update({
        fileId,
        requestBody: {
          originalFilename: name,
        },
        media: {
          mimeType,
          body: fileStream,
        },
        fields: FILE_FIELDS,
      });
      return res.data;
    });
  });
  app.get<{
    Params: {
      fileId: string;
    };
  }>("/api/storage/file/:fileId", async (request, reply) => {
    const { fileId } = request.params;
    return authenticated(request, reply, async (auth) => {
      const drive = google.drive({ version: "v3", auth });
      const res = await drive.files.get({
        fileId,
        fields: FILE_FIELDS,
      });
      const { data } = await drive.files.get({
        fileId,
        alt: "media",
      });
      return { ...res.data, data };
    });
  });
  next();
};

export default googleDriveSyncProvider;
