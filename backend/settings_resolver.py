import os

from settings_store import SettingsStore


def resolve_provider_secret(
    provider_id: str,
    field_name: str,
    env_var_name: str,
    store: SettingsStore | None = None,
) -> str | None:
    env_value = (os.getenv(env_var_name) or "").strip()
    if env_value:
        return env_value

    settings_value = (store or SettingsStore()).get_provider(provider_id).get(field_name)
    if isinstance(settings_value, str) and settings_value.strip():
        return settings_value.strip()
    return None

def resolve_provider_setting(
    provider_id: str,
    field_name: str,
    env_var_name: str | None = None,
    default: str | None = None,
    store: SettingsStore | None = None,
) -> str | None:
    if env_var_name:
        env_value = (os.getenv(env_var_name) or "").strip()
        if env_value:
            return env_value

    settings_value = (store or SettingsStore()).get_provider(provider_id).get(field_name)
    if isinstance(settings_value, str) and settings_value.strip():
        return settings_value.strip()
    return default
