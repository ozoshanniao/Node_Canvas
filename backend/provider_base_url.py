import ipaddress
import os
from urllib.parse import urlparse


PRIVATE_BASE_URL_ENV = "NODE_CANVAS_ALLOW_PRIVATE_PROVIDER_BASE_URLS"


class ProviderBaseUrlError(ValueError):
    pass


def _private_base_urls_allowed() -> bool:
    return (os.getenv(PRIVATE_BASE_URL_ENV) or "").strip() == "1"


def normalize_provider_base_url(value: str, *, default: str | None = None) -> str:
    raw_value = (value or "").strip()
    if not raw_value:
        if default is None:
            raise ProviderBaseUrlError("Provider base URL is required")
        raw_value = default

    parsed = urlparse(raw_value)
    if parsed.scheme not in {"http", "https"}:
        raise ProviderBaseUrlError("Provider base URL must use http or https")
    if not parsed.netloc or not parsed.hostname:
        raise ProviderBaseUrlError("Provider base URL must include a host")
    if parsed.username or parsed.password:
        raise ProviderBaseUrlError("Provider base URL must not include username or password")
    if parsed.query or parsed.fragment:
        raise ProviderBaseUrlError("Provider base URL must not include query or fragment")

    host = parsed.hostname.lower()
    if not _private_base_urls_allowed():
        if host == "localhost":
            raise ProviderBaseUrlError("Provider base URL cannot use localhost unless explicitly allowed")
        try:
            ip = ipaddress.ip_address(host)
        except ValueError:
            ip = None
        if ip and (ip.is_loopback or ip.is_link_local or ip.is_private):
            raise ProviderBaseUrlError("Provider base URL cannot use local or private IPs unless explicitly allowed")

    return raw_value.rstrip("/")
