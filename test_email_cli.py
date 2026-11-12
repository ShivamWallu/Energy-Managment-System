import sys
import os
import smtplib
import socket

# Ensure virtual environment and project root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app.config import settings
from backend.app.email_service import send_otp_email, send_welcome_registration_email

def check_smtp_port(host: str, port: int, timeout: int = 5) -> bool:
    try:
        s = socket.create_connection((host, port), timeout=timeout)
        s.close()
        return True
    except Exception as e:
        return False

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "itchd.kogm@gmail.com"
    print("=" * 65)
    print("  MASHAL EMS INTELLIGENCE — LIVE SMTP DIAGNOSTIC SUITE")
    print("=" * 65)
    print(f"Target Recipient: {target}")
    print(f"SMTP Host:        {settings.SMTP_HOST}")
    print(f"Primary Account:  {settings.PRIMARY_SMTP_USER}")
    print(f"Secondary User:   {settings.SECONDARY_SMTP_USER}")
    print("-" * 65)

    print("\n[1/3] Testing Network Port Connectivity from this Server:")
    for port in [587, 465]:
        open_status = check_smtp_port(settings.SMTP_HOST, port)
        badge = "OPEN & REACHABLE" if open_status else "BLOCKED / TIMEOUT"
        print(f"  - Port {port}: {badge}")

    print("\n[2/3] Testing Direct Gmail SMTP Connection & Authentication:")
    pwd = settings.PRIMARY_SMTP_PASSWORD.strip().strip('"\'').replace(" ", "").strip()
    for port in [587, 465]:
        try:
            if port == 465:
                with smtplib.SMTP_SSL(settings.SMTP_HOST, 465, timeout=10) as s:
                    s.login(settings.PRIMARY_SMTP_USER, pwd)
                    print(f"  - Port 465 (SSL): AUTHENTICATION SUCCESSFUL! [noreplykogm@gmail.com]")
            else:
                with smtplib.SMTP(settings.SMTP_HOST, 587, timeout=10) as s:
                    s.ehlo()
                    s.starttls()
                    s.ehlo()
                    s.login(settings.PRIMARY_SMTP_USER, pwd)
                    print(f"  - Port 587 (STARTTLS): AUTHENTICATION SUCCESSFUL! [noreplykogm@gmail.com]")
        except Exception as e:
            print(f"  - Port {port}: FAILED ({type(e).__name__}: {e})")

    print("\n[3/3] Sending Official Test OTP Email through Application Stack:")
    try:
        res = send_otp_email(target, "Plant Auditor", "123456", "REGISTRATION")
        print(f"  - Result: {res}")
        if res.get("channel") in ["PRIMARY_SMTP", "SECONDARY_SMTP_FAILOVER"]:
            print(f"\n[SUCCESS] Email successfully dispatched via {res.get('channel')} to {target}!")
            print("Please check your Inbox (or Spam/Promotions folder).")
        else:
            print(f"\n[NOTICE] Email fell back to {res.get('channel')}.")
    except Exception as e:
        print(f"\n[ERROR] Exception during send_otp_email: {e}")

    print("=" * 65)

if __name__ == "__main__":
    main()

