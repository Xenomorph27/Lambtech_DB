"""Staff login on the API (spec §9, §10.2)."""

from conftest import OTHER_KEY, STAFF_EMAIL, bearer


def test_health_public(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_no_token_401(client):
    assert client.get("/me").status_code == 401


def test_expired_401(client):
    assert client.get("/me", headers=bearer(exp_in=-10)).status_code == 401


def test_wrong_key_401(client):
    assert client.get("/me", headers=bearer(key=OTHER_KEY)).status_code == 401


def test_wrong_audience_401(client):
    assert client.get("/me", headers=bearer(aud="anon")).status_code == 401


def test_not_staff_403(client):
    assert client.get("/me", headers=bearer(email="stranger@example.com")).status_code == 403


def test_staff_email_match_ignores_case(client):
    assert client.get("/me", headers=bearer(email=STAFF_EMAIL.upper())).status_code == 200


def test_staff_me_200(client):
    response = client.get("/me", headers=bearer())
    assert response.status_code == 200
    body = response.json()
    assert (body["email"], body["auth"]) == (STAFF_EMAIL, "supabase")
    assert body["user_id"] == "user-1"
