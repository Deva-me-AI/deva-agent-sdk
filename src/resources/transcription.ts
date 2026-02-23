import { DevaHttpClient } from "../client.js";
import { DevaError } from "../errors.js";

export interface TranscriptionRequest {
  file: Blob | ArrayBuffer | Uint8Array;
  filename?: string;
  language?: string;
  model?: string;
  prompt?: string;
}

export interface TranscriptionResponse {
  text?: string;
  language?: string;
  duration?: number;
  [key: string]: unknown;
}

function toBlob(file: Blob | ArrayBuffer | Uint8Array): Blob {
  if (typeof Blob !== "undefined" && file instanceof Blob) return file;
  if (file instanceof ArrayBuffer) return new Blob([file]);
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  return new Blob([bytes]);
}

/** Audio transcription API using multipart upload. */
export class TranscriptionResource {
  constructor(private readonly client: DevaHttpClient) {}

  /**
   * Transcribes audio via `POST /v1/ai/audio/transcriptions`.
   */
  async create(payload: TranscriptionRequest): Promise<TranscriptionResponse> {
    const form = new FormData();
    form.set("file", toBlob(payload.file), payload.filename ?? "audio.wav");

    if (payload.language) form.set("language", payload.language);
    if (payload.model) form.set("model", payload.model);
    if (payload.prompt) form.set("prompt", payload.prompt);

    const response = await this.client.rawFetch("/v1/ai/audio/transcriptions", {
      method: "POST",
      body: form
    });

    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as TranscriptionResponse) : {};

    if (!response.ok) {
      throw new DevaError({ status: response.status, message: parsed.text ?? `HTTP ${response.status}`, details: parsed });
    }

    return parsed;
  }
}
