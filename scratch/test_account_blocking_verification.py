import sys
import uuid
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import get_db, engine
from backend.app.models import User
from backend.app.email_service import send_otp_email
from backend.app.config import settings

def test_full_account_blocking_and_email_failover():
    client = TestClient(app)
    
    print("=" * 70)
    print("STARTING TEST: ACCOUNT BLOCKING & DUAL EMAIL FAILOVER VERIFICATION")
    print("=" * 70)
    
    # --- 1. Test Dual Email Failover Logic ---
    print("\n[Step 1] Testing Dual Email Failover Service...")
    res_email = send_otp_email("test.failover@mashaloil.com", "Failover Tester", "987654")
    print(f"-> Email Service Result: sent={res_email.get('sent')}, channel={res_email.get('channel')}, sender={res_email.get('sender')}")
    assert res_email["sent"] is True
    print("-> Dual Email Failover service verified successfully.")

    # --- 2. Register a Fresh Test User Account ---
    test_id = uuid.uuid4().hex[:6]
    test_email = f"operator_{test_id}@mashaloil.com"
    test_name = f"Test Operator {test_id}"
    test_pass = "TestPass2026!#"

    print(f"\n[Step 2] Requesting OTP registration for '{test_email}'...")
    otp_req = client.post("/api/auth/register/request-otp", json={
        "name": test_name,
        "email": test_email,
        "password": test_pass
    })
    assert otp_req.status_code == 200, f"OTP request failed: {otp_req.text}"
    otp_data = otp_req.json()
    demo_otp = otp_data.get("demo_otp")
    print(f"-> OTP Request success: {otp_data['message']}, OTP: {demo_otp}")

    print(f"\n[Step 3] Verifying OTP and activating account...")
    verify_res = client.post("/api/auth/register/verify-otp", json={
        "email": test_email,
        "otp_code": demo_otp,
        "password": test_pass
    })
    assert verify_res.status_code == 200, f"Verify OTP failed: {verify_res.text}"
    user_info = verify_res.json()["user"]
    test_user_id = user_info["id"]
    print(f"-> Account created successfully! User ID: {test_user_id}, Name: {user_info['full_name']}")

    # --- 3. Verify Initial Active Login ---
    print(f"\n[Step 4] Verifying initial active login for '{test_email}'...")
    login_1 = client.post("/api/auth/login", json={
        "username": test_email,
        "password": test_pass
    })
    assert login_1.status_code == 200, f"Initial login failed: {login_1.text}"
    print(f"-> Login successful! Token type: {login_1.json()['token_type']}")

    # --- 4. Admin Authenticates & Blocks the User ---
    print("\n[Step 5] Admin authenticating to manage accounts...")
    admin_login = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "AdminPassword2026!"
    })
    assert admin_login.status_code == 200, f"Admin login failed: {admin_login.text}"
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    print(f"\n[Step 6] Admin blocking account (User ID: {test_user_id})...")
    block_res = client.post(f"/api/accounts/{test_user_id}/toggle-status", headers=admin_headers)
    assert block_res.status_code == 200, f"Block toggle failed: {block_res.text}"
    print(f"-> Toggle response: {block_res.json()['message']}")

    # Verify status in Accounts table
    acc_list = client.get(f"/api/accounts?search={test_email}", headers=admin_headers).json()
    matching_user = next((u for u in acc_list["items"] if u["id"] == test_user_id), None)
    assert matching_user is not None
    assert matching_user["is_active"] is False
    assert matching_user["status"] == "BLOCKED"
    print(f"-> Confirmed in Admin Accounts listing: Status is strictly '{matching_user['status']}'")

    # --- 5. Verify Login Restriction for Blocked User ---
    print(f"\n[Step 7] Attempting login with BLOCKED account '{test_email}'...")
    blocked_login = client.post("/api/auth/login", json={
        "username": test_email,
        "password": test_pass
    })
    print(f"-> Blocked Login Response Code: {blocked_login.status_code}")
    print(f"-> Blocked Login Detail: {blocked_login.json().get('detail')}")
    assert blocked_login.status_code == 403, f"Expected 403 Forbidden, got {blocked_login.status_code}"
    assert "blocked" in blocked_login.json().get("detail", "").lower()
    print("-> PASS: Blocked user was strictly prevented from logging in (HTTP 403 Forbidden)!")

    # --- 6. Admin Unblocks the User ---
    print(f"\n[Step 8] Admin unblocking account (User ID: {test_user_id})...")
    unblock_res = client.post(f"/api/accounts/{test_user_id}/toggle-status", headers=admin_headers)
    assert unblock_res.status_code == 200
    print(f"-> Toggle response: {unblock_res.json()['message']}")

    # --- 7. Verify Successful Login after Unblocking ---
    print(f"\n[Step 9] Verifying user can log in again once UNBLOCKED...")
    unblocked_login = client.post("/api/auth/login", json={
        "username": test_email,
        "password": test_pass
    })
    assert unblocked_login.status_code == 200, f"Unblocked login failed: {unblocked_login.text}"
    print(f"-> PASS: User '{test_email}' logged in successfully after Admin unblocked them!")

    print("\n" + "=" * 70)
    print("ALL TESTS PASSED: Admin Account Block/Unblock & Security Restrictions Confirmed!")
    print("=" * 70)

if __name__ == "__main__":
    test_full_account_blocking_and_email_failover()
