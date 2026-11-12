import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app.config import settings
from backend.app.email_service import send_otp_email, send_welcome_registration_email

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "itchd.kogm@gmail.com"
    print("=" * 65)
    print("  MASHAL EMS INTELLIGENCE — LIVE IPv4 SNI SMTP DISPATCH TEST")
    print("=" * 65)
    print(f"Target Recipient: {target}")
    print(f"SMTP Host:        {settings.SMTP_HOST}")
    print(f"Primary Sender:   {settings.PRIMARY_SMTP_USER}")
    print("-" * 65)

    print(f"\n[1/1] Dispatching Official OTP Verification Email to {target}...")
    try:
        res = send_otp_email(target, "Plant Auditor", "458920", "REGISTRATION")
        print(f"\n[Result] Response: {res}")
        if res.get("channel") in ["PRIMARY_SMTP", "SECONDARY_SMTP_FAILOVER"]:
            print("\n" + "=" * 65)
            print(f"  🎉 SUCCESS! OTP EMAIL DELIVERED TO {target}!")
            print(f"  Sender Account: {res.get('sender')}")
            print(f"  Delivery Route: {res.get('channel')}")
            print("  Check your Gmail inbox now (or Spam folder)!")
            print("=" * 65)
        else:
            print(f"\n[NOTICE] Fell back to: {res.get('channel')}")
    except Exception as e:
        print(f"\n[ERROR] Failed to send: {e}")

if __name__ == "__main__":
    main()
