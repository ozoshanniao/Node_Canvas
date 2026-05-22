import time


def encode_kling_jwt(access_key: str, secret_key: str) -> str:
    if not access_key or not secret_key:
        raise ValueError("KLING_ACCESS_KEY and KLING_SECRET_KEY are required")

    try:
        import jwt
    except ImportError as exc:
        raise ValueError("PyJWT is required for Kling authentication. Install PyJWT.") from exc

    now = int(time.time())
    return jwt.encode(
        {
            "iss": access_key,
            "exp": now + 1800,
            "nbf": now - 5,
        },
        secret_key,
        algorithm="HS256",
        headers={
            "alg": "HS256",
            "typ": "JWT",
        },
    )
