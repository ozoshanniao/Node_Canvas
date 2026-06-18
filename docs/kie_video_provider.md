# KIE Video Provider

Phase 6.1A registers KIE as a video provider for the first selected Wan models only:

- `wan/2-7-text-to-video`
- `wan/2-7-image-to-video`

No remote model discovery is enabled. KIE's full model list is not exposed.

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

Wan 2.7 text-to-video currently builds:

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

Wan 2.7 image-to-video currently builds:

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

`ratio` and `first_frame_url` are centralized in the payload builder because the KIE/Wan public examples and node-banana analysis may still differ from final official documentation.

## Asset Routing

For image-to-video, `image:firstFrame` is passed to `ProviderAssetUploadRouter(provider="kie")`. Existing public HTTPS URLs pass through. Local files, data URIs, and raw base64 go through the KIE provider media upload path, which is mocked in tests.

KIE provider media upload supports three official paths:

- Base64 upload: `POST /api/file-base64-upload` with JSON `base64Data`, `uploadPath`, and `fileName`.
- URL upload: `POST /api/file-url-upload` with JSON `fileUrl`, `uploadPath`, and `fileName`.
- Stream upload: `POST /api/file-stream-upload` with multipart/form-data fields `file`, `uploadPath`, and `fileName`.

All three return the uploaded asset URL in `data.downloadUrl`. The upload host is configurable through `KIE_FILE_UPLOAD_BASE_URL`; default is `https://api.kie.ai`, while tests also cover `https://kieai.redpandaai.co`.

Real smoke testing still requires confirming the final Wan payload fields `ratio` and `first_frame_url`.

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
- `nano-banana-pro`
- `nano-banana-2`

Existing Google Official, Yunwu, Kling, Yunwu-Kling, and Seedance runtimes are unchanged.
