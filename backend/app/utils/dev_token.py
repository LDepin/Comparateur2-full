import sys, time
from jose import jwt
from app.core.config import settings

def main(email: str):
    now = int(time.time())
    payload = {"sub": email, "email": email, "iat": now, "exp": now + 3600*24}
    token = jwt.encode(payload, settings.AUTH_JWT_SECRET, algorithm=settings.AUTH_JWT_ALG)
    print(token)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python -m app.utils.dev_token you@example.com", file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1])