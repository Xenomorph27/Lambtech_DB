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


def test_database_refusal_is_a_clear_503_with_cors(client, monkeypatch):
    """A refused database login must reach the browser as a readable error, not a header-less 500."""
    import psycopg2
    from sqlalchemy.exc import OperationalError

    import crud

    def refuse(*args, **kwargs):
        raise OperationalError("select 1", {}, psycopg2.OperationalError('FATAL:  password authentication failed for user "postgres"'))

    monkeypatch.setattr(crud, "list_rows", refuse)
    response = client.get("/contacts", headers={**bearer(), "Origin": "http://localhost:5173"})
    assert response.status_code == 503
    assert "database" in response.json()["detail"].lower()
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_staff_emails_accept_newlines_spaces_and_semicolons(monkeypatch):
    """Render's editor invites one address per line; any common separator must work."""
    from settings import settings

    monkeypatch.setattr(settings, "staff_emails", "A@x.com\nb@x.com; c@x.com  d@x.com,\r\ne@x.com")
    assert settings.staff_email_set == {"a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"}
