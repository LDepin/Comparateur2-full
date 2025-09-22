from fastapi import HTTPException, status, Request
from jose import jwt, JWTError
from ..core.config import settings

def decode_bearer_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.AUTH_JWT_SECRET, algorithms=[settings.AUTH_JWT_ALG])
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

async def get_current_user_email(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = auth.split(" ", 1)[1].strip()
    payload = decode_bearer_token(token)
    email = payload.get("email") or payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Token missing email")
    return email.lower()
