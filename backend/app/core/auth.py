import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer
from app.core.config import settings

bearer = HTTPBearer()
jwks_client = PyJWKClient(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json")

# Tolerance for clocks that differ slightly between our server and Supabase. Without it, a
# brand-new token can look issued "in the future" and be rejected (seen under WSL: ~1 s behind).
# Cost: an expired token is also accepted for up to this many extra seconds (out of 3600).
CLOCK_LEEWAY_SECONDS = 10

def get_current_user_id(creds=Depends(bearer)) -> str:
    token = creds.credentials
    try:
        key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token, key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            leeway=CLOCK_LEEWAY_SECONDS,
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload["sub"]