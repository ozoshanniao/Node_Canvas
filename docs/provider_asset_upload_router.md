# Provider Asset Upload Router

Phase 6.0 added backend infrastructure for provider-specific asset preparation. Phase 6.1C uses the KIE route for selected KIE image-to-video first-frame assets. It does not change FAL or WaveSpeed model availability, VideoNode UI, or project save structure.

## Scope

- `KIE_API_KEY`, `FAL_API_KEY`, and `WAVESPEED_API_KEY` are supported by the existing provider settings and secret resolver path.
- `ProviderAssetUploadRouter` converts local files, data URIs, raw base64, and HTTPS URLs into provider-ready asset references.
- External uploads are behind injectable uploader functions and are covered by mock tests only.
- Phase 6.1C registers only the selected KIE video whitelist: Wan 2.7, Kling 3.0, Kling 2.6, Seedance 2.0, and Seedance 2.0 Fast T2V/I2V. KIE full model discovery remains disabled.
- Existing Yunwu, Google, Kling Official, Yunwu-Kling, and Seedance runtime paths are unchanged.

## Routing Policy

KIE:

- Existing public HTTPS URLs pass through by default.
- `preferred_upload="provider_cdn"` uploads existing public HTTP/HTTPS URLs through `/api/file-url-upload`.
- Data URIs, raw base64, and small image payloads upload through `/api/file-base64-upload`.
- Local files, bytes, large data URIs, video, and audio upload through `/api/file-stream-upload`.
- KIE file upload base URL is configurable with `KIE_FILE_UPLOAD_BASE_URL`; the default is `https://api.kie.ai`.
- KIE image-to-video models resolve `image:firstFrame` through `ProviderAssetUploadRouter(provider="kie")`.

FAL:

- Existing public HTTPS URLs pass through by default.
- Local files, raw base64, and data URIs upload through the FAL two-step CDN uploader.
- Re-uploading an existing remote URL with `preferred_upload="provider_cdn"` is intentionally not implemented in Phase 6.0.

WaveSpeed:

- Existing public HTTPS URLs pass through.
- Local files, raw base64, and data URIs upload to WaveSpeed media upload by default.
- Inputs larger than 300MB are not sent directly to WaveSpeed media upload; callers should provide a public URL or use the Public Asset Service fallback.
- `preferred_upload="r2"` uses the existing Public Asset Service fallback, normally R2/TOS depending on configured storage.
- `preferred_upload="base64"` can keep image data URIs inline when base64 image input is allowed.
- WaveSpeed does not use KIE or FAL uploaders.

Other providers:

- The router does not take over Seedance, Kling, Yunwu, Yunwu-Kling, or Google asset flows.
- Provider-specific payload builders and legacy public asset behavior remain owned by their existing runtime paths.

## Security And Compatibility

- Router and uploader imports must not read credentials, send network requests, upload public assets, or create long-lived files.
- API keys are resolved only when a provider media upload is requested.
- Logs and result objects must not include API keys, Authorization headers, raw base64 content, or local absolute paths.
- No router output is written to `project.json` or `schemaSnapshot`.

## KIE Upload APIs

KIE supports three provider media upload paths:

- Base64: `POST /api/file-base64-upload` with JSON `base64Data`, `uploadPath`, and `fileName`; response URL is `data.downloadUrl`.
- URL: `POST /api/file-url-upload` with JSON `fileUrl`, `uploadPath`, and `fileName`; response URL is `data.downloadUrl`.
- Stream: `POST /api/file-stream-upload` with multipart/form-data fields `file`, `uploadPath`, and `fileName`; response URL is `data.downloadUrl`.

KIE upload routing uses only those three official upload paths.

## Google Veo Exclusion

Google Veo 3 and Veo 3.1 must not be reintroduced through KIE, FAL, or WaveSpeed. The project already has Google Official and Yunwu Veo channels, and duplicate third-party entries would make provider selection and UI behavior ambiguous.

Even if later KIE, FAL, or WaveSpeed model lists contain entries such as `veo3/text-to-video`, `veo3/image-to-video`, `veo3-fast/text-to-video`, `veo3-fast/image-to-video`, `google/imagen4`, `gpt-image`, Gemini Omni Video, or `nano-banana-pro`, they are excluded from the Phase 6.1C video whitelist.

## Later Phases

- Phase 6.1: KIE Adapter with selected non-Google video models.
- Phase 6.2: FAL Adapter with selected models.
- Phase 6.3: WaveSpeed Adapter with selected models.
- Phase 7: Experimental remote discovery.
