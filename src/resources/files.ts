import { DevaHttpClient } from "../client.js";
import { DevaError } from "../errors.js";
import type { PaginatedRequest, PaginatedResponse } from "../types.js";

export interface UploadFileRequest {
  file: Blob | ArrayBuffer | Uint8Array;
  path?: string;
  filename?: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface UploadedFile {
  path?: string;
  url?: string;
  size?: number;
  content_type?: string;
  [key: string]: unknown;
}

export interface ListFilesRequest extends PaginatedRequest {
  prefix?: string;
}

export type ListFilesResponse = PaginatedResponse<UploadedFile>;

export interface DeleteFileResponse {
  success?: boolean;
  [key: string]: unknown;
}

export interface PresignFileRequest {
  path: string;
  operation?: "upload" | "download";
  expires_in?: number;
  content_type?: string;
}

export interface PresignFileResponse {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  expires_at?: string;
  [key: string]: unknown;
}

export interface DownloadFileResponse {
  bytes: ArrayBuffer;
  contentType: string | null;
  etag: string | null;
}

function toBlob(file: Blob | ArrayBuffer | Uint8Array, contentType?: string): Blob {
  if (typeof Blob !== "undefined" && file instanceof Blob) return file;
  if (file instanceof ArrayBuffer) return new Blob([file], { type: contentType });
  const view = file as Uint8Array;
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return new Blob([copy], { type: contentType });
}

/** File upload/download/list/delete and presigned URL workflows. */
export class FilesResource {
  constructor(private readonly client: DevaHttpClient) {}

  /**
   * Uploads a file with multipart form data via `POST /v1/agents/files/upload`.
   */
  async upload(payload: UploadFileRequest): Promise<UploadedFile> {
    const form = new FormData();
    form.set("file", toBlob(payload.file, payload.contentType), payload.filename ?? "upload.bin");
    if (payload.path) form.set("path", payload.path);
    if (payload.contentType) form.set("content_type", payload.contentType);
    if (payload.metadata) form.set("metadata", JSON.stringify(payload.metadata));

    const response = await this.client.rawFetch("/v1/agents/files/upload", {
      method: "POST",
      body: form
    });

    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as UploadedFile) : {};

    if (!response.ok) {
      throw new DevaError({ status: response.status, message: `HTTP ${response.status}`, details: parsed });
    }

    return parsed;
  }

  /** Downloads a file via `GET /v1/agents/files/{path}`. */
  async download(path: string): Promise<DownloadFileResponse> {
    const response = await this.client.rawFetch(`/v1/agents/files/${encodeURIComponent(path)}`, {
      method: "GET"
    });

    if (!response.ok) {
      const body = await response.text();
      throw new DevaError({ status: response.status, message: body || `HTTP ${response.status}` });
    }

    return {
      bytes: await response.arrayBuffer(),
      contentType: response.headers.get("content-type"),
      etag: response.headers.get("etag")
    };
  }

  /** Lists files via `GET /v1/agents/files`. */
  list(input: ListFilesRequest = {}): Promise<ListFilesResponse> {
    return this.client.request<ListFilesResponse>({
      method: "GET",
      path: "/v1/agents/files",
      query: {
        prefix: input.prefix,
        limit: input.limit,
        cursor: input.cursor
      }
    });
  }

  /** Deletes a file via `DELETE /v1/agents/files/{path}`. */
  delete(path: string): Promise<DeleteFileResponse> {
    return this.client.request<DeleteFileResponse>({
      method: "DELETE",
      path: `/v1/agents/files/${encodeURIComponent(path)}`
    });
  }

  /**
   * Creates a presigned upload/download URL. Expected endpoint: `POST /v1/agents/files/presign`.
   */
  presign(payload: PresignFileRequest): Promise<PresignFileResponse> {
    return this.client.request<PresignFileResponse>({
      method: "POST",
      path: "/v1/agents/files/presign",
      body: payload
    });
  }
}
