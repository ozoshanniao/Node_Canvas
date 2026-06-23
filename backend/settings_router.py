import os
from dataclasses import dataclass

from fastapi import APIRouter, HTTPException

from provider_base_url import ProviderBaseUrlError, normalize_provider_base_url
from settings_resolver import resolve_provider_setting
from settings_store import SettingsStore, SettingsStoreError


router = APIRouter(prefix="/api/settings", tags=["settings"])
SETTINGS_STORE = SettingsStore()


@dataclass(frozen=True)
class EnvRequirement:
    label: str
    alternatives: tuple[str, ...]


@dataclass(frozen=True)
class SecretRequirement:
    field: str
    env: EnvRequirement


@dataclass(frozen=True)
class SettingRequirement:
    field: str
    env: EnvRequirement | None = None
    default: str | None = None
    required: bool = False


@dataclass(frozen=True)
class ProviderDefinition:
    id: str
    name: str
    secrets: tuple[SecretRequirement, ...]
    dependencies: tuple[EnvRequirement, ...] = ()
    settings: tuple[SettingRequirement, ...] = ()


def _env(name: str) -> EnvRequirement:
    return EnvRequirement(label=name, alternatives=(name,))


def _secret(field: str, env_name: str) -> SecretRequirement:
    return SecretRequirement(field=field, env=_env(env_name))


def _setting(
    field: str,
    env_name: str | None = None,
    default: str | None = None,
    required: bool = False,
) -> SettingRequirement:
    return SettingRequirement(field=field, env=_env(env_name) if env_name else None, default=default, required=required)


PROVIDER_DEFINITIONS = (
    ProviderDefinition("deepseek", "DeepSeek", (_secret("apiKey", "DEEPSEEK_API_KEY"),)),
    ProviderDefinition(
        "google",
        "Google Cloud / Vertex AI",
        (_secret("apiKey", "GOOGLE_CLOUD_API_KEY"),),
        (
            EnvRequirement(
                label="GOOGLE_CLOUD_PROJECT or GOOGLE_PROJECT_ID or GOOGLE_PROJECT",
                alternatives=("GOOGLE_CLOUD_PROJECT", "GOOGLE_PROJECT_ID", "GOOGLE_PROJECT"),
            ),
        ),
    ),
    ProviderDefinition(
        "openai",
        "OpenAI",
        (_secret("apiKey", "OPENAI_API_KEY"),),
        settings=(_setting("baseUrl", "OPENAI_BASE_URL", "https://api.openai.com/v1"),),
    ),
    ProviderDefinition("anthropic", "Claude", (_secret("apiKey", "ANTHROPIC_API_KEY"),)),
    ProviderDefinition("yunwu", "Yunwu", (_secret("apiKey", "YUNWU_API_KEY"),)),
    ProviderDefinition(
        "kling",
        "Kling",
        (
            _secret("accessKey", "KLING_ACCESS_KEY"),
            _secret("secretKey", "KLING_SECRET_KEY"),
        ),
    ),
    ProviderDefinition("seedance", "Seedance", (_secret("apiKey", "ARK_API_KEY"),)),
    ProviderDefinition("kie", "KIE", (_secret("apiKey", "KIE_API_KEY"),)),
    ProviderDefinition("fal", "FAL", (_secret("apiKey", "FAL_API_KEY"),)),
    ProviderDefinition("wavespeed", "WaveSpeed", (_secret("apiKey", "WAVESPEED_API_KEY"),)),
    ProviderDefinition(
        "cloudflare-r2",
        "Cloudflare R2",
        (
            _secret("accessKeyId", "CLOUDFLARE_R2_ACCESS_KEY_ID"),
            _secret("secretAccessKey", "CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
        ),
        (
            _env("CLOUDFLARE_R2_BUCKET_NAME"),
            _env("CLOUDFLARE_R2_PUBLIC_DOMAIN"),
            EnvRequirement(
                label="CLOUDFLARE_R2_ENDPOINT or CLOUDFLARE_R2_ACCOUNT_ID",
                alternatives=("CLOUDFLARE_R2_ENDPOINT", "CLOUDFLARE_R2_ACCOUNT_ID"),
            ),
        ),
    ),
)
PROVIDER_DEFINITION_MAP = {definition.id: definition for definition in PROVIDER_DEFINITIONS}


def _has_nonempty_env(requirement: EnvRequirement) -> bool:
    return any((os.getenv(name) or "").strip() for name in requirement.alternatives)


def _has_nonempty_setting(settings: dict, field: str) -> bool:
    value = settings.get(field)
    return isinstance(value, str) and bool(value.strip())


def _public_settings(definition: ProviderDefinition, store: SettingsStore) -> dict:
    public_values = {}
    for setting in definition.settings:
        value = resolve_provider_setting(
            definition.id,
            setting.field,
            setting.env.alternatives[0] if setting.env else None,
            setting.default,
            store,
        )
        if setting.field == "baseUrl" and value:
            try:
                value = normalize_provider_base_url(value, default=setting.default)
            except ProviderBaseUrlError:
                value = setting.default
        if value is not None:
            public_values[setting.field] = value
    return public_values


def _provider_status(definition: ProviderDefinition, store: SettingsStore) -> dict:
    settings = store.get_provider(definition.id)
    missing_secret_env = [
        secret.env.label for secret in definition.secrets if not _has_nonempty_env(secret.env)
    ]
    missing_dependency_env = [
        requirement.label for requirement in definition.dependencies if not _has_nonempty_env(requirement)
    ]
    missing_settings = [
        secret.field for secret in definition.secrets if not _has_nonempty_setting(settings, secret.field)
    ]

    env_secrets_available = not missing_secret_env
    resolved_secrets = all(
        _has_nonempty_env(secret.env) or _has_nonempty_setting(settings, secret.field)
        for secret in definition.secrets
    )
    source = "env" if env_secrets_available else "settings" if resolved_secrets else "none"

    return {
        "id": definition.id,
        "name": definition.name,
        "configured": source != "none" and not missing_dependency_env,
        "source": source,
        "supportsSettings": True,
        "requiredEnv": [
            *[secret.env.label for secret in definition.secrets],
            *[requirement.label for requirement in definition.dependencies],
        ],
        "missingEnv": [*missing_secret_env, *missing_dependency_env],
        "missingDependencyEnv": missing_dependency_env,
        "requiredSettings": [secret.field for secret in definition.secrets],
        "settingsFields": [setting.field for setting in definition.settings],
        "publicSettings": _public_settings(definition, store),
        "missingSettings": missing_settings,
    }


def get_provider_statuses(store: SettingsStore | None = None) -> list[dict]:
    active_store = store or SETTINGS_STORE
    return [_provider_status(definition, active_store) for definition in PROVIDER_DEFINITIONS]


def _get_definition(provider_id: str) -> ProviderDefinition:
    definition = PROVIDER_DEFINITION_MAP.get(provider_id)
    if not definition:
        raise HTTPException(status_code=404, detail="Unknown provider")
    return definition


def _safe_status_response(provider_id: str, store: SettingsStore) -> dict:
    return {
        "status": "success",
        "provider": _provider_status(_get_definition(provider_id), store),
    }


@router.get("/providers")
async def get_settings_providers():
    try:
        return {"status": "success", "providers": get_provider_statuses()}
    except SettingsStoreError as exc:
        raise HTTPException(status_code=500, detail="Unable to read provider settings") from exc


@router.post("/providers/{provider_id}")
async def save_settings_provider(provider_id: str, payload: dict):
    definition = _get_definition(provider_id)
    try:
        current_status = _provider_status(definition, SETTINGS_STORE)
        if current_status["source"] == "env":
            raise HTTPException(
                status_code=409,
                detail="Configured via .env. Settings override is disabled.",
            )

        secret_fields = {secret.field for secret in definition.secrets}
        setting_fields = {setting.field for setting in definition.settings}
        allowed_fields = secret_fields | setting_fields
        if not set(payload).issubset(allowed_fields):
            raise HTTPException(status_code=422, detail="Unsupported provider settings field")
        missing_secret_fields = [field for field in secret_fields if field not in payload]
        if missing_secret_fields:
            raise HTTPException(status_code=422, detail="All required provider key fields must be provided")

        values = {}
        for field in secret_fields:
            value = payload.get(field)
            if not isinstance(value, str) or not value.strip():
                raise HTTPException(status_code=422, detail="Provider key fields cannot be empty")
            values[field] = value.strip()

        setting_by_field = {setting.field: setting for setting in definition.settings}
        for field in setting_fields:
            if field not in payload:
                continue
            value = payload.get(field)
            if not isinstance(value, str) or not value.strip():
                if setting_by_field[field].required:
                    raise HTTPException(status_code=422, detail="Provider settings fields cannot be empty")
                continue
            value = value.strip()
            if field == "baseUrl":
                try:
                    value = normalize_provider_base_url(value, default=setting_by_field[field].default)
                except ProviderBaseUrlError as exc:
                    raise HTTPException(status_code=422, detail=str(exc)) from exc
            values[field] = value

        SETTINGS_STORE.set_provider(provider_id, values)
        return _safe_status_response(provider_id, SETTINGS_STORE)
    except HTTPException:
        raise
    except SettingsStoreError as exc:
        raise HTTPException(status_code=500, detail="Unable to update provider settings") from exc


@router.delete("/providers/{provider_id}")
async def clear_settings_provider(provider_id: str):
    _get_definition(provider_id)
    try:
        SETTINGS_STORE.clear_provider(provider_id)
        return _safe_status_response(provider_id, SETTINGS_STORE)
    except SettingsStoreError as exc:
        raise HTTPException(status_code=500, detail="Unable to update provider settings") from exc
