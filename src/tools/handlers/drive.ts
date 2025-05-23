import { google } from "googleapis";
import { ToolContext } from "./index";

export async function handleDriveTool(
  toolName: string,
  params: any,
  context: ToolContext,
): Promise<any> {
  const auth = await context.tokenManager.getAuthClient(context.userId);
  const drive = google.drive({ version: "v3", auth });

  switch (toolName) {
    case "drive_list_files":
      return listFiles(drive, params);

    case "drive_get_file":
      return getFile(drive, params);

    case "drive_download_file":
      return downloadFile(drive, params);

    case "drive_upload_file":
      return uploadFile(drive, params);

    case "drive_update_file":
      return updateFile(drive, params);

    case "drive_delete_file":
      return deleteFile(drive, params);

    case "drive_create_folder":
      return createFolder(drive, params);

    case "drive_share_file":
      return shareFile(drive, params);

    default:
      throw new Error(`Unknown Drive tool: ${toolName}`);
  }
}

async function listFiles(drive: any, params: any) {
  const response = await drive.files.list({
    q: params.q,
    pageSize: params.pageSize || 10,
    orderBy: params.orderBy,
    fields: params.fields || "files(id, name, mimeType, modifiedTime, size)",
  });

  return { files: response.data.files || [] };
}

async function getFile(drive: any, params: any) {
  const response = await drive.files.get({
    fileId: params.fileId,
    fields: params.fields || "*",
  });

  return response.data;
}

async function downloadFile(drive: any, params: any) {
  // For Google Workspace files, export to requested format
  if (params.mimeType) {
    const response = await drive.files.export(
      {
        fileId: params.fileId,
        mimeType: params.mimeType,
      },
      {
        responseType: "arraybuffer",
      },
    );

    return {
      content: Buffer.from(response.data).toString("base64"),
      mimeType: params.mimeType,
    };
  }

  // For regular files, download content
  const response = await drive.files.get(
    {
      fileId: params.fileId,
      alt: "media",
    },
    {
      responseType: "arraybuffer",
    },
  );

  return {
    content: Buffer.from(response.data).toString("base64"),
  };
}

async function uploadFile(drive: any, params: any) {
  const fileMetadata: any = {
    name: params.name,
  };

  if (params.parents) fileMetadata.parents = params.parents;
  if (params.description) fileMetadata.description = params.description;

  const media = {
    mimeType: params.mimeType || "application/octet-stream",
    body: Buffer.from(params.content, "base64"),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: "id, name, mimeType, webViewLink",
  });

  return response.data;
}

async function updateFile(drive: any, params: any) {
  const fileMetadata: any = {};

  if (params.name !== undefined) fileMetadata.name = params.name;
  if (params.addParents || params.removeParents) {
    const update: any = {};
    if (params.addParents) update.addParents = params.addParents.join(",");
    if (params.removeParents)
      update.removeParents = params.removeParents.join(",");
    Object.assign(fileMetadata, update);
  }

  let media;
  if (params.content) {
    media = {
      mimeType: params.mimeType || "application/octet-stream",
      body: Buffer.from(params.content, "base64"),
    };
  }

  const response = await drive.files.update({
    fileId: params.fileId,
    requestBody: fileMetadata,
    media: media,
    fields: "id, name, mimeType, modifiedTime",
  });

  return response.data;
}

async function deleteFile(drive: any, params: any) {
  if (params.permanent) {
    await drive.files.delete({
      fileId: params.fileId,
    });
  } else {
    await drive.files.update({
      fileId: params.fileId,
      requestBody: {
        trashed: true,
      },
    });
  }

  return { success: true };
}

async function createFolder(drive: any, params: any) {
  const fileMetadata: any = {
    name: params.name,
    mimeType: "application/vnd.google-apps.folder",
  };

  if (params.parents) fileMetadata.parents = params.parents;
  if (params.description) fileMetadata.description = params.description;

  const response = await drive.files.create({
    requestBody: fileMetadata,
    fields: "id, name, mimeType",
  });

  return response.data;
}

async function shareFile(drive: any, params: any) {
  const permission: any = {
    type: params.type,
    role: params.role,
  };

  if (params.emailAddress) permission.emailAddress = params.emailAddress;
  if (params.domain) permission.domain = params.domain;

  const response = await drive.permissions.create({
    fileId: params.fileId,
    requestBody: permission,
    sendNotificationEmail: params.sendNotificationEmail !== false,
  });

  return response.data;
}
