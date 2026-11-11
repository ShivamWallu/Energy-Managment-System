"""Send brand email previews to EMAIL_PREVIEW_TO using the configured SMTP settings."""

import os
import secrets

from backend.app.email_service import send_otp_email, send_welcome_registration_email

recipient = os.getenv("EMAIL_PREVIEW_TO", "").strip()
if not recipient:
    raise SystemExit("Set EMAIL_PREVIEW_TO to the mailbox that should receive previews.")

preview_name = "Mashal EMS Preview"
preview_username = "ems-preview"
preview_otp = f"{secrets.randbelow(900000) + 100000}"

otp_result = send_otp_email(recipient, preview_name, preview_otp)
welcome_result = send_welcome_registration_email(
    recipient, preview_name, preview_username, "auditor"
)

print(f"OTP preview delivery: {otp_result.get('channel')}")
print(f"Welcome preview delivery: {welcome_result.get('channel')}")
