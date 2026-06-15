import os
from dataclasses import dataclass

from fastapi import APIRouter, HTTPException

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
class ProviderDefinition:
    id: str
    name: str
    secrets: tuple[SecretRequirement, ...]
    dependencies: tuple[EnvRequirement, ...] = ()


def _env(name: str) -> EnvRequirement:
    return EnvRequirement(label=name, alternatives=(name,))


def _secret(field: str, env_name: str) -> SecretRequirement:
    return SecretRequirement(field=field, env=_env(env_name))


PROVIDER_DEFINITIONS = (
    ProviderDefinition("deepseek", "DeepSeek", (_secret("apiKey", "DEEPSEEK_API_KEY"),)),
    ProviderDefinition(
        "google",
        "Google / Gemini / Veo",
        (_secret("apiKey", "GOOGLE_CLOUD_API_KEY"),),
        (
            EnvRequirement(
                label="GOOGLE_CLOUD_PROJECT or GOOGLE_PROJECT_ID or GOOGLE_PROJECT",
                alternatives=("GOOGLE_CLOUD_PROJECT", "GOOGLE_PROJECT_ID", "GOOGLE_PROJECT"),
            ),
        ),
    ),
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

        allowed_fields = {secret.field for secret in definition.secrets}
        if set(payload) != allowed_fields:
            raise HTTPException(status_code=422, detail="All required provider key fields must be provided")
        values = {
            field: payload[field].strip()
            for field in allowed_fields
            if isinstance(payload.get(field), str) and payload[field].strip()
        }
        if set(values) != allowed_fields:
            raise HTTPException(status_code=422, detail="Provider key fields cannot be empty")

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
