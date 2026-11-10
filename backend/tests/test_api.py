import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.auth import create_access_token

client = TestClient(app)

def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

def test_auth_login():
    res = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "AdminPassword2026!"
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["role"] == "admin"

def test_dashboard_endpoint():
    # Login first
    res_auth = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "AdminPassword2026!"
    })
    token = res_auth.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Combined Dashboard
    res = client.get("/api/analytics/dashboard", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "kpis" in data
    assert data["kpis"]["main_incomer_kwh"] > 0
    assert "timeline" in data
    assert len(data["timeline"]["labels"]) > 0

def test_machines_endpoint():
    res_auth = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "AdminPassword2026!"
    })
    token = res_auth.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    reps = client.get("/api/reports/list", headers=headers).json()
    rep_id = reps[0]["id"] if reps else 1

    res = client.get(f"/api/analytics/machines?report_id={rep_id}", headers=headers)
    assert res.status_code == 200
    machines = res.json()
    assert len(machines) == 59
    assert machines[0]["source_name"] is not None

def test_csv_export():
    res_auth = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "AdminPassword2026!"
    })
    token = res_auth.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    reps = client.get("/api/reports/list", headers=headers).json()
    rep_id = reps[0]["id"] if reps else 1

    res = client.get(f"/api/export/csv?report_id={rep_id}", headers=headers)
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "Source Name" in res.text

def test_expeller_detail_endpoint():
    res_auth = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "AdminPassword2026!"
    })
    token = res_auth.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    for exp_num in range(1, 6):
        res = client.get(f"/api/analytics/expeller-detail?expeller_num={exp_num}", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["expeller_num"] == exp_num
        assert "panel_name" in data
        assert "incomer_total_kwh" in data
        assert "motors" in data
        assert len(data["motors"]) == 5  # Exactly 5 motors (P1 to P5)
        
        motor_codes = [m["code"] for m in data["motors"]]
        assert motor_codes == ["P1", "P2", "P3", "P4", "P5"]
        
        for m in data["motors"]:
            assert "timeline" in m
            assert "labels" in m["timeline"]
            assert "values" in m["timeline"]
            assert "load_pcts" in m["timeline"]
            assert "statuses" in m["timeline"]
            assert "supervisory_alert" in m
            assert m["rated_15m_kwh"] > 0
            assert m["healthy_min_kwh"] == round(m["rated_15m_kwh"] * 0.5, 2)
            assert m["overload_threshold_kwh"] == round(m["rated_15m_kwh"] * 0.8, 2)

def test_telemetry_matrix_endpoint():
    res_auth = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "AdminPassword2026!"
    })
    token = res_auth.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Test Core Machines matrix (columns up to 46 / AT)
    res = client.get("/api/analytics/telemetry-matrix?max_col=46", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "columns" in data
    assert "rows" in data
    assert len(data["columns"]) > 0
    assert data["columns"][-1]["excel_letter"] == "AT" # Column 46 is AT
    assert len(data["rows"]) == 48 # 48 15-minute intervals
    assert data["rows"][0]["interval_index"] in (0, 1)
    assert "time_str" in data["rows"][0]
    assert "readings" in data["rows"][0]

def test_all_expellers_detail_endpoint():
    res_auth = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "AdminPassword2026!"
    })
    token = res_auth.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/analytics/all-expellers-detail", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 5 # 5 Expellers
    assert data[0]["panel_name"] == "EXPELLER 1 MCC PANEL"
    assert len(data[0]["motors"]) == 5 # 5 motors (P1 to P5)

def test_kohlu_detail_endpoint():
    res_auth = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "AdminPassword2026!"
    })
    token = res_auth.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Test Kohlu Panel 1
    res1 = client.get("/api/analytics/kohlu-detail?panel_num=1", headers=headers)
    assert res1.status_code == 200
    d1 = res1.json()
    assert d1["panel_num"] == 1
    assert "KOHLU PANEL 1" in d1["panel_name"]
    assert d1["incomer_name"] == "INC KOHLU 1 1 F1"
    assert len(d1["motors"]) == 6  # 6 Kohlus in Panel 1 (Cols 34 to 39 / AH to AM)
    assert [m["code"] for m in d1["motors"]] == ["K1", "K2", "K3", "K4", "K5", "K6"]

    # Test Kohlu Panel 2
    res2 = client.get("/api/analytics/kohlu-detail?panel_num=2", headers=headers)
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["panel_num"] == 2
    assert "KOHLU PANEL 2" in d2["panel_name"]
    assert d2["incomer_name"] == "INC KOHLU 2 1 F1"
    assert len(d2["motors"]) == 6  # 6 Kohlus in Panel 2 (Cols 41 to 46 / AO to AT)
    assert [m["code"] for m in d2["motors"]] == ["K7", "K8", "K9", "K10", "K11", "K12"]

def test_all_kohlus_detail_endpoint():
    res_auth = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "AdminPassword2026!"
    })
    token = res_auth.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/analytics/all-kohlus-detail", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 2  # 2 Kohlu Panels
    assert len(data[0]["motors"]) == 6
    assert len(data[1]["motors"]) == 6

def test_motors_by_rating_endpoint():
    res_auth = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "AdminPassword2026!"
    })
    token = res_auth.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 75 HP motors: 5 Expellers * 1 motor (P1) = 5
    res_75 = client.get("/api/analytics/motors-by-rating?hp=75", headers=headers)
    assert res_75.status_code == 200
    d_75 = res_75.json()
    assert d_75["total_matched"] == 5
    assert all(m["hp"] == 75 for m in d_75["motors"])

    # 60 HP motors: 5 Expellers * 2 motors (P2, P3) = 10
    res_60 = client.get("/api/analytics/motors-by-rating?hp=60", headers=headers)
    assert res_60.status_code == 200
    d_60 = res_60.json()
    assert d_60["total_matched"] == 10
    assert all(m["hp"] == 60 for m in d_60["motors"])

    # 50 HP motors: 5 Expellers * 2 motors (P4, P5) = 10
    res_50 = client.get("/api/analytics/motors-by-rating?hp=50", headers=headers)
    assert res_50.status_code == 200
    d_50 = res_50.json()
    assert d_50["total_matched"] == 10
    assert all(m["hp"] == 50 for m in d_50["motors"])

    # 30 HP motors: 2 Panels * 6 units = 12
    res_30 = client.get("/api/analytics/motors-by-rating?hp=30", headers=headers)
    assert res_30.status_code == 200
    d_30 = res_30.json()
    assert d_30["total_matched"] == 12
    assert all(m["hp"] == 30 for m in d_30["motors"])

def test_activity_logs_endpoints():
    # Login as admin
    res_auth = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "AdminPassword2026!"
    })
    token = res_auth.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Test Admin Activity Logs Listing
    res = client.get("/api/activity-logs?page=1&limit=10", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "total" in data
    assert "page" in data
    assert "limit" in data
    assert "total_pages" in data
    assert "items" in data
    assert isinstance(data["items"], list)
    assert len(data["items"]) > 0

    # Verify mandatory table columns
    item = data["items"][0]
    assert "user_name" in item
    assert "email" in item
    assert "activity_type" in item
    assert "activity_type_label" in item
    assert "description" in item
    assert "date_time" in item
    assert "status" in item

    # 2. Test Activity Summary Endpoint
    res_sum = client.get("/api/activity-logs/summary", headers=headers)
    assert res_sum.status_code == 200
    d_sum = res_sum.json()
    assert "total_activities" in d_sum
    assert "total_logins" in d_sum
    assert "total_uploads" in d_sum

    # 3. Test Security: Non-admin users forbidden
    auditor_token = create_access_token({"sub": "auditor", "role": "auditor"})
    res_forbidden = client.get("/api/activity-logs", headers={"Authorization": f"Bearer {auditor_token}"})
    assert res_forbidden.status_code == 403

def test_otp_registration_and_accounts_flow():
    import uuid
    # 1. Request OTP for a new user
    test_email = f"test.operator.{uuid.uuid4().hex[:6]}@mashaloil.com"
    req_res = client.post("/api/auth/register/request-otp", json={
        "name": "Test Operator",
        "email": test_email,
        "password": "SecurePassword2026!"
    })
    assert req_res.status_code == 200
    otp_data = req_res.json()
    assert "email" in otp_data
    assert "demo_otp" in otp_data
    demo_otp = otp_data["demo_otp"]
    assert len(demo_otp) == 6

    # 2. Verify OTP with incorrect code (should fail)
    bad_verify = client.post("/api/auth/register/verify-otp", json={
        "email": test_email,
        "otp_code": "000000"
    })
    assert bad_verify.status_code == 400

    # 3. Verify OTP with correct code (should succeed and activate account)
    verify_res = client.post("/api/auth/register/verify-otp", json={
        "email": test_email,
        "otp_code": demo_otp
    })
    assert verify_res.status_code == 200
    v_data = verify_res.json()
    assert "access_token" in v_data
    assert v_data["user"]["email"] == test_email
    new_user_id = v_data["user"]["id"]

    # 4. Duplicate registration attempt should be rejected
    dup_res = client.post("/api/auth/register/request-otp", json={
        "name": "Test Operator",
        "email": test_email,
        "password": "SecurePassword2026!"
    })
    assert dup_res.status_code == 400

    # 5. Accounts Tab: Admin can view all registered accounts
    admin_login = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "AdminPassword2026!"
    })
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    acc_res = client.get("/api/accounts", headers=admin_headers)
    assert acc_res.status_code == 200
    accounts_data = acc_res.json()
    assert "items" in accounts_data
    found = next((u for u in accounts_data["items"] if u["email"] == test_email), None)
    assert found is not None
    assert found["status"] == "ACTIVE"
    assert "registration_date" in found

    # 6. Admin can block the account
    toggle_res = client.post(f"/api/accounts/{new_user_id}/toggle-status", headers=admin_headers)
    assert toggle_res.status_code == 200
    assert "BLOCKED" in toggle_res.json()["message"]

    # 7. Blocked account cannot log in
    blocked_login = client.post("/api/auth/login", json={
        "username": test_email,
        "password": "SecurePassword2026!"
    })
    assert blocked_login.status_code == 403
    assert "blocked" in blocked_login.json()["detail"].lower()

    # 8. Admin unblocks the account
    unblock_res = client.post(f"/api/accounts/{new_user_id}/toggle-status", headers=admin_headers)
    assert unblock_res.status_code == 200
    assert "ACTIVE" in unblock_res.json()["message"]

    # 9. Account can now log in successfully
    success_login = client.post("/api/auth/login", json={
        "username": test_email,
        "password": "SecurePassword2026!"
    })
    assert success_login.status_code == 200

def test_confirm_password_and_forgot_password_flow():
    import uuid
    test_email = f"reset.user.{uuid.uuid4().hex[:6]}@mashaloil.com"

    # 1. Registration with mismatched confirm password must fail
    mismatch_res = client.post("/api/auth/register/request-otp", json={
        "name": "Reset Test User",
        "email": test_email,
        "password": "InitialPassword2026!",
        "confirm_password": "WrongPassword2026!"
    })
    assert mismatch_res.status_code == 400
    assert "Passwords do not match" in mismatch_res.json()["detail"]

    # 2. Registration with matching confirm password succeeds
    reg_res = client.post("/api/auth/register/request-otp", json={
        "name": "Reset Test User",
        "email": test_email,
        "password": "InitialPassword2026!",
        "confirm_password": "InitialPassword2026!"
    })
    assert reg_res.status_code == 200
    reg_otp = reg_res.json()["demo_otp"]

    # Verify registration OTP
    v_res = client.post("/api/auth/register/verify-otp", json={
        "email": test_email,
        "otp_code": reg_otp
    })
    assert v_res.status_code == 200

    # 3. Request password reset for non-existent email must fail (404)
    fake_res = client.post("/api/auth/forgot-password/request-otp", json={
        "email": "nonexistent.user.999@mashaloil.com"
    })
    assert fake_res.status_code == 404

    # 4. Request password reset for registered email succeeds
    forgot_res = client.post("/api/auth/forgot-password/request-otp", json={
        "email": test_email
    })
    assert forgot_res.status_code == 200
    reset_data = forgot_res.json()
    assert "demo_otp" in reset_data
    reset_otp = reset_data["demo_otp"]

    # 5. Password reset with mismatched confirmation fails
    mismatch_reset = client.post("/api/auth/forgot-password/reset", json={
        "email": test_email,
        "otp_code": reset_otp,
        "new_password": "NewSecretPassword2026!",
        "confirm_password": "DifferentSecretPassword!"
    })
    assert mismatch_reset.status_code == 400
    assert "Passwords do not match" in mismatch_reset.json()["detail"]

    # 6. Password reset with invalid OTP fails
    bad_otp_reset = client.post("/api/auth/forgot-password/reset", json={
        "email": test_email,
        "otp_code": "000000",
        "new_password": "NewSecretPassword2026!",
        "confirm_password": "NewSecretPassword2026!"
    })
    assert bad_otp_reset.status_code == 400

    # 7. Password reset with valid OTP and matching password succeeds
    good_reset = client.post("/api/auth/forgot-password/reset", json={
        "email": test_email,
        "otp_code": reset_otp,
        "new_password": "NewSecretPassword2026!",
        "confirm_password": "NewSecretPassword2026!"
    })
    assert good_reset.status_code == 200
    assert "successfully" in good_reset.json()["message"].lower()

    # 8. User can log in with new password
    login_new = client.post("/api/auth/login", json={
        "username": test_email,
        "password": "NewSecretPassword2026!"
    })
    assert login_new.status_code == 200
    assert "access_token" in login_new.json()

    # 9. Old password no longer works
    login_old = client.post("/api/auth/login", json={
        "username": test_email,
        "password": "InitialPassword2026!"
    })
    assert login_old.status_code == 401
    assert "incorrect password" in login_old.json()["detail"].lower()


def test_unregistered_user_login_returns_404():
    """Unregistered email attempt should return 404 with friendly message and X-User-Exists false."""
    res = client.post("/api/auth/login", json={
        "username": "unregistered.guest.2026@mashaloil.com",
        "password": "AnyRandomPassword123!"
    })
    assert res.status_code == 404
    assert "no account found" in res.json()["detail"].lower()
    assert res.headers.get("x-user-exists") == "false"




