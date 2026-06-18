# KIE Image Provider

Phase 6.2 adds a mock-only KIE image provider whitelist. It does not call the real KIE API, does not upload real assets, and does not consume KIE credits during tests.

## Registered Models

The KIE image provider exposes only:

- `nano-banana-pro` as `Nano Banana Pro (KIE)`
- `nano-banana-2` as `Nano Banana 2 (KIE)`
- `gpt-image-2-text-to-image` as `GPT Image 2 (KIE)`
- `gpt-image-2-image-to-image` as `GPT Image 2 I2I (KIE)`

Nano Banana entries support `text-to-image` and `image-to-image`. GPT Image 2 is registered as two separate KIE model ids so the payload builder can keep the KIE task type explicit. Display names include `(KIE)` so they remain distinct from native Google/Gemini image channels.

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

The registered KIE image models use the standard KIE task API shape:

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

GPT Image 2 text-to-image uses:

```json
{
  "model": "gpt-image-2-text-to-image",
  "input": {
    "prompt": "prompt",
    "aspect_ratio": "auto",
    "resolution": "1K"
  }
}
```

GPT Image 2 image-to-image uses `input_urls`:

```json
{
  "model": "gpt-image-2-image-to-image",
  "input": {
    "prompt": "prompt",
    "input_urls": ["https://kie-cdn.example/input.png"],
    "aspect_ratio": "auto",
    "resolution": "1K"
  }
}
```

Nano Banana image-to-image uses `image_input`:

```json
{
  "image_input": ["https://kie-cdn.example/input.png"]
}
```

Do not mix the fields: GPT Image 2 I2I uses `input_urls`; Nano Banana Pro and Nano Banana 2 use `image_input`.

Nano Banana prompt limits are validated locally before create:

- `nano-banana-pro`: at most 10000 characters, `image_input`, max 8 images.
- `nano-banana-2`: at most 20000 characters, `image_input`, max 14 images.

GPT Image 2 constraints are validated before create:

- prompt is required and must be at most 20000 characters.
- `input_urls` is required for I2I and supports at most 16 images.
- `aspect_ratio=auto` or an omitted aspect ratio only supports `resolution=1K`.
- `aspect_ratio=1:1` does not support `resolution=4K`.
- `aspect_ratio=16:9` with `resolution=4K` is allowed.

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
