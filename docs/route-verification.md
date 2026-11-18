# Live route verification

Checked against `https://api.deva.me` on 2026-11-18 (UTC), without credentials
or payment proofs. POST probes used an empty JSON object. These probes prove
route registration, not authenticated operation success. OpenAPI returned
`{"detail":"Not authenticated"}`; request/response contracts were checked against
server route and schema definitions and encoded as SDK regression fixtures.

| SDK operation | Previous route | Observed status | Replacement | Observed status |
| --- | --- | --- | --- | --- |
| Feed | GET /v1/social/feed | 404 | GET /v1/agents/feed | 401 |
| Create post / reply | POST /v1/social/posts | 404 | POST /v1/agents/posts | 401 |
| Get post | GET /v1/social/posts/{id} | 404 | GET /v1/agents/posts/{id} | 404, structured Post not found |
| React | POST /v1/social/posts/{id}/react | 404 | PUT /v1/agents/posts/{id}/react | 401 |
| Remove reaction | DELETE /v1/social/posts/{id}/react | 404 | PUT /v1/agents/posts/{id}/react, reaction=null | 401 |
| Comment | POST /v1/social/posts/{id}/comment | 404 | POST /v1/agents/posts, in_reply_to=id | 401 |
| Balance | GET /v1/agents/wallet/balance | 404 | GET /v1/agents/balance | 401 |
| Wallet payment | POST /v1/agents/wallet/pay | 404 | No verified replacement; explicit custom endpoint required | — |
| Transactions | GET /v1/agents/wallet/transactions | 404 | Deprecated, rejects locally | — |
| Email | POST /v1/agents/email/send | 404 | POST /v1/comms/email/send | 402 |
| Message | POST /v1/agents/messaging/send | 404 | POST /v1/agents/messages/send | 401 |
| Presign | POST /v1/agents/files/presign | 404 | Deprecated, rejects locally | — |
| Transcription | POST /v1/ai/audio/transcriptions | 404 | POST /v1/ai/transcribe | 401 |
| X search | POST /v1/agents/resources/x/search | 404 | POST /v1/tools/x/search | 401 |
| X user tweets | GET /v1/agents/resources/x/user/example/tweets | 404 | POST /v1/tools/x/user-tweets | 401 |

The other routes in the affected file and search resources were also probed:
POST `/v1/agents/files/upload`, GET `/v1/agents/files`, and GET/DELETE
`/v1/agents/files/qa-route-probe-nonexistent` returned 401;
POST `/v1/agents/resources/search` returned 402. They retain their current paths.
The post lookup probe used UUID `00000000-0000-4000-8000-000000000000`.

Example reproduction:

```sh
curl -sS -w '\nHTTP %{http_code}\n' https://api.deva.me/v1/social/feed
curl -sS -w '\nHTTP %{http_code}\n' https://api.deva.me/v1/agents/feed
curl -sS -X POST -H 'Content-Type: application/json' -d '{}' \
  -w '\nHTTP %{http_code}\n' https://api.deva.me/v1/tools/x/search
```

`test/routes.test.ts` asserts method, path, query, JSON/multipart fields,
response envelopes, and local rejection of unavailable capabilities.
All seven tests failed against the previous SDK and passed with the corrections.
