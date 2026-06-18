# KIE Video Provider

Phase 6.1C registers KIE as a video provider for a selected mock-tested video whitelist:

- `wan/2-7-text-to-video`
- `wan/2-7-image-to-video`
- `kling-3.0/video/text-to-video`
- `kling-3.0/video/image-to-video`
- `kling-2.6/text-to-video`
- `kling-2.6/image-to-video`
- `bytedance/seedance-2/text-to-video`
- `bytedance/seedance-2/image-to-video`
- `bytedance/seedance-2-fast/text-to-video`
- `bytedance/seedance-2-fast/image-to-video`

No remote model discovery is enabled. KIE's full model list is not exposed.
Phase 6.1B real API smoke was skipped intentionally; Phase 6.1C remains mock-only and does not call real KIE APIs or upload real assets.

## API Surface

The adapter uses the standard KIE task endpoints:

- `POST https://api.kie.ai/api/v1/jobs/createTask`
- `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=<taskId>`

Authentication is resolved at request time through:

```python
resolve_provider_secret("kie", "apiKey", "KIE_API_KEY")
```

Adapter and client imports do not read `KIE_API_KEY`, create network clients with side effects, upload files, or make HTTP requests.

## Payload Contract

KIE text-to-video models currently build:

```json
{
  "model": "wan/2-7-text-to-video",
  "input": {
    "prompt": "prompt",
    "duration": 5,
    "resolution": "720p",
    "ratio": "16:9"
  }
}
```

KIE image-to-video models currently build:

```json
{
  "model": "wan/2-7-image-to-video",
  "input": {
    "prompt": "prompt",
    "first_frame_url": "https://...",
    "duration": 5,
    "resolution": "720p"
  }
}
```

`ratio` and `first_frame_url` are centralized in the payload builder because KIE examples and node-banana/Redpanda-style analysis may still differ from final official documentation. The Kling and Seedance KIE payload field names require real smoke validation before production confidence.

## Asset Routing

For image-to-video, `image:firstFrame` is passed to `ProviderAssetUploadRouter(provider="kie")`. Existing public HTTPS URLs pass through. Local files, data URIs, and raw base64 go through the KIE provider media upload path, which is mocked in tests.

KIE provider media upload supports three official paths:

- Base64 upload: `POST /api/file-base64-upload` with JSON `base64Data`, `uploadPath`, and `fileName`.
- URL upload: `POST /api/file-url-upload` with JSON `fileUrl`, `uploadPath`, and `fileName`.
- Stream upload: `POST /api/file-stream-upload` with multipart/form-data fields `file`, `uploadPath`, and `fileName`.

All three return the uploaded asset URL in `data.downloadUrl`. The upload host is configurable through `KIE_FILE_UPLOAD_BASE_URL`; default is `https://api.kie.ai`, while tests also cover `https://kieai.redpandaai.co`.

Real smoke testing still requires confirming the final payload fields `ratio` and `first_frame_url` for Wan, Kling, and Seedance through KIE.

## Result Parsing

KIE query status is normalized as:

- `waiting`, `queuing`, `generating`, `processing` -> `running`
- `success`, `completed` -> `succeeded`
- `fail`, `failed`, `error` -> `failed`

Successful output URL parsing checks:

- `data.resultJson.resultUrls[0]`
- `data.resultUrls[0]`
- `data.videoUrl`
- `data.video_url`
- `data.output`
- `data.imageUrl`
- `data.image_url`
- `data.url`

`data.resultJson` may be a JSON string. Parse failures fall back to the other fields.

## Explicit Exclusions

KIE is not used to reintroduce Google models or image providers. The following are intentionally excluded:

- `veo3/text-to-video`
- `veo3/image-to-video`
- `veo3-fast/text-to-video`
- `veo3-fast/image-to-video`
- `google/imagen4`
- `google/imagen4-fast`
- `google/imagen4-ultra`
- `gpt-image`
- `wan/2-7-image`
- `nano-banana-pro`
- `nano-banana-2`
- Gemini Omni Video

Existing Google Official, Yunwu, Kling, Yunwu-Kling, and Seedance runtimes are unchanged.

## Deferred Models

Gemini Omni Video is deferred to Phase 6.1D until the exact KIE model id, endpoint behavior, payload fields, and query result shape are known. KIE image models such as GPT Image, Imagen, Nano Banana, and Wan image generation are deferred to Phase 6.2 or later image-provider work and are not registered in the video capability list.

Phase 6.2 registers selected KIE image-provider models separately. `nano-banana-pro` and `nano-banana-2` are allowed only in the image provider registry with `(KIE)` display names; they are not video models. `GPT Image 2 (KIE)` remains deferred until its exact KIE model id is confirmed.
