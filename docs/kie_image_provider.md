# KIE Image Provider

Phase 6.2 adds a mock-only KIE image provider whitelist. It does not call the real KIE API, does not upload real assets, and does not consume KIE credits during tests.

## Registered Models

The KIE image provider exposes only:

- `nano-banana-pro` as `Nano Banana Pro (KIE)`
- `nano-banana-2` as `Nano Banana 2 (KIE)`

Both entries support `text-to-image` and `image-to-image` in the local capability registry. Display names include `(KIE)` so they remain distinct from native Google/Gemini image channels.

## Deferred Models

`GPT Image 2 (KIE)` is deferred because the exact KIE model id was not found in local docs or node-banana. The only nearby KIE entries found were `gpt-image/1.5-text-to-image` and `gpt-image/1.5-image-to-image`, which are not GPT Image 2.

The following are also not registered in Phase 6.2:

- `google/imagen4`
- `google/imagen4-fast`
- `google/imagen4-ultra`
- `grok-imagine/*`
- `wan/2-7-image`
- `flux-2/*`
- `seedream/*`
- KIE full remote image discovery

## API Shape

Nano Banana Pro and Nano Banana 2 use the standard KIE task API shape:

- `POST /api/v1/jobs/createTask`
- `GET /api/v1/jobs/recordInfo?taskId=<taskId>`

The KIE client is reused from the video provider foundation. It reads `KIE_API_KEY` only when a request is made, not during import.

## Payload

Current mock-tested payload shape:

```json
{
  "model": "nano-banana-pro",
  "input": {
    "prompt": "prompt",
    "aspect_ratio": "1:1",
    "resolution": "1K"
  }
}
```

Image-to-image adds:

```json
{
  "image_input": ["https://kie-cdn.example/input.png"]
}
```

`image_input` follows node-banana's KIE provider mapping for both `nano-banana-pro` and `nano-banana-2`.

## Asset Routing

Image-to-image inputs are resolved through `ProviderAssetUploadRouter(provider="kie")` before payload construction:

- Existing HTTP/HTTPS URLs pass through by default.
- Local files and bytes use KIE stream upload.
- Data URI and raw base64 use KIE base64 upload for small inputs.
- `preferred_upload="provider_cdn"` can transfer URL inputs to KIE CDN.

## Result Parsing

KIE image query parsing supports:

- `data.resultJson.resultUrls[0]`
- `data.resultUrls[0]`
- `data.imageUrl`
- `data.image_url`
- `data.output`
- `data.url`
- `data.images[0].url`

`data.resultJson` may be a stringified JSON object. If parsing fails, fallback fields are still checked.

## Persistence

The current image generation endpoint is synchronous, while KIE image tasks are asynchronous. Phase 6.2 adds create/query adapter coverage and a minimal provider wrapper, but real smoke testing still needs a confirmed polling and local persistence strategy before relying on KIE remote URLs in production workflows.
