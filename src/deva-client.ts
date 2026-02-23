import { AuthResource } from "./auth.js";
import { DevaHttpClient } from "./client.js";
import { ChatResource } from "./resources/chat.js";
import { DiscoverResource } from "./resources/discover.js";
import { EmailResource } from "./resources/email.js";
import { EmbeddingsResource } from "./resources/embeddings.js";
import { FilesResource } from "./resources/files.js";
import { KvResource } from "./resources/kv.js";
import { MessagingResource } from "./resources/messaging.js";
import { ProfileResource } from "./resources/profile.js";
import { SearchResource } from "./resources/search.js";
import { SocialResource } from "./resources/social.js";
import { TranscriptionResource } from "./resources/transcription.js";
import { VisionResource } from "./resources/vision.js";
import { WalletResource } from "./resources/wallet.js";
import type { DevaClientOptions } from "./types.js";

/** High-level SDK client exposing all Deva API resources. */
export class DevaClient {
  private readonly http: DevaHttpClient;

  public readonly auth: AuthResource;
  public readonly chat: ChatResource;
  public readonly social: SocialResource;
  public readonly search: SearchResource;
  public readonly files: FilesResource;
  public readonly kv: KvResource;
  public readonly email: EmailResource;
  public readonly messaging: MessagingResource;
  public readonly discover: DiscoverResource;
  public readonly profile: ProfileResource;
  public readonly wallet: WalletResource;
  public readonly embeddings: EmbeddingsResource;
  public readonly transcription: TranscriptionResource;
  public readonly vision: VisionResource;

  constructor(options: DevaClientOptions = {}) {
    this.http = new DevaHttpClient(options);

    this.auth = new AuthResource(this.http);
    this.chat = new ChatResource(this.http);
    this.social = new SocialResource(this.http);
    this.search = new SearchResource(this.http);
    this.files = new FilesResource(this.http);
    this.kv = new KvResource(this.http);
    this.email = new EmailResource(this.http);
    this.messaging = new MessagingResource(this.http);
    this.discover = new DiscoverResource(this.http);
    this.profile = new ProfileResource(this.http);
    this.wallet = new WalletResource(this.http);
    this.embeddings = new EmbeddingsResource(this.http);
    this.transcription = new TranscriptionResource(this.http);
    this.vision = new VisionResource(this.http);
  }

  /** Sets or clears the API key on this client. */
  setApiKey(apiKey: string | undefined): void {
    this.auth.setApiKey(apiKey);
  }

  /** Reads the currently configured API key, if present. */
  getApiKey(): string | undefined {
    return this.auth.getApiKey();
  }
}
