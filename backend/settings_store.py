import json
import os
import tempfile
from pathlib import Path


class SettingsStoreError(RuntimeError):
    pass


def get_default_settings_path() -> Path:
    appdata = os.getenv("APPDATA")
    if os.name == "nt" and appdata:
        return Path(appdata) / "Node-AI-Canvas" / "settings.json"
    return Path.home() / ".node-ai-canvas" / "settings.json"


class SettingsStore:
    def __init__(self, path: str | Path | None = None):
        self.path = Path(path) if path else get_default_settings_path()

    def read(self) -> dict:
        if not self.path.exists():
            return {"providers": {}}
        try:
            with self.path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, json.JSONDecodeError) as exc:
            raise SettingsStoreError("Unable to read provider settings") from exc

        providers = data.get("providers") if isinstance(data, dict) else None
        return {"providers": providers if isinstance(providers, dict) else {}}

    def get_provider(self, provider_id: str) -> dict:
        provider = self.read()["providers"].get(provider_id)
        return provider if isinstance(provider, dict) else {}

    def set_provider(self, provider_id: str, values: dict) -> None:
        data = self.read()
        data["providers"][provider_id] = dict(values)
        self._atomic_write(data)

    def clear_provider(self, provider_id: str) -> None:
        data = self.read()
        data["providers"].pop(provider_id, None)
        self._atomic_write(data)

    def _atomic_write(self, data: dict) -> None:
        temp_path = None
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                "w",
                encoding="utf-8",
                dir=self.path.parent,
                prefix=f".{self.path.name}.",
                suffix=".tmp",
                delete=False,
            ) as handle:
                temp_path = Path(handle.name)
                json.dump(data, handle, ensure_ascii=False, indent=2)
                handle.flush()
                os.fsync(handle.fileno())
            try:
                os.chmod(temp_path, 0o600)
            except OSError:
                pass
            os.replace(temp_path, self.path)
            try:
                os.chmod(self.path, 0o600)
            except OSError:
                pass
        except OSError as exc:
            if temp_path and temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError:
                    pass
            raise SettingsStoreError("Unable to write provider settings") from exc
