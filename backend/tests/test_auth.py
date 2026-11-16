"""The token check in app/core/auth.py, with tokens we sign ourselves.

No Supabase needed: we create our own key pair, sign tokens with exact timestamps, and make
the backend's key lookup return our public key.
"""

import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.core import auth

PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())     # ES256, the algorithm Supabase uses


@pytest.fixture(autouse=True)
def our_public_key(monkeypatch):
    monkeypatch.setattr(
        auth.jwks_client, "get_signing_key_from_jwt",
        lambda token: SimpleNamespace(key=PRIVATE_KEY.public_key()),
    )


def check(iat_offset: float, exp_offset: float) -> str:
    now = time.time()
    token = jwt.encode(
        {"sub": "user-1", "aud": "authenticated", "iat": int(now + iat_offset), "exp": int(now + exp_offset)},
        PRIVATE_KEY, algorithm="ES256",
    )
    return auth.get_current_user_id(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token))


def test_normal_token_is_accepted():
    assert check(iat_offset=-5, exp_offset=3600) == "user-1"


def test_token_issued_a_few_seconds_in_the_future_is_accepted():
    # Our clock a few seconds behind Supabase's: a brand-new token looks issued "in the future".
    # Without leeway this was a 401 for a user who had just logged in.
    assert check(iat_offset=3, exp_offset=3600) == "user-1"


def test_token_issued_far_in_the_future_is_rejected():
    with pytest.raises(HTTPException) as e:
        check(iat_offset=120, exp_offset=3600)
    assert e.value.status_code == 401


def test_expired_token_is_rejected():
    with pytest.raises(HTTPException) as e:
        check(iat_offset=-3600, exp_offset=-60)
    assert e.value.status_code == 401
