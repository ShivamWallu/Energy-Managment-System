import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app.config import settings
from backend.app.email_service import send_otp_email

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "itchd.kogm@gmail.com"
    
    print("=" * 65)
    print("  MASHAL EMS INTELLIGENCE — DUAL ACCOUNT FAILOVER TEST")
    print("=" * 65)
    print(f"Target Recipient: {target}")
    print(f"Primary Account:   {settings.PRIMARY_SMTP_USER}")
    print(f"Secondary Account: {settings.SECONDARY_SMTP_USER}")
    print("-" * 65)

    # -------------------------------------------------------------
    # TEST 1: Normal Primary Delivery
    # -------------------------------------------------------------
    print("\n[TEST 1] Sending email via PRIMARY account (noreplykogm@gmail.com)...")
    os.environ["FORCE_SMTP_FAILOVER"] = "false"
    try:
        res1 = send_otp_email(target, "Plant Auditor", "112233", "REGISTRATION")
        print(f"  -> Result: {res1.get('channel')} | Sender: {res1.get('sender')}")
        if res1.get("channel") == "PRIMARY_SMTP":
            print(f"  ✅ Primary delivery SUCCESSFUL!")
    except Exception as e:
        print(f"  ❌ Primary failed: {e}")

    # -------------------------------------------------------------
    # TEST 2: Simulated Primary Quota Exhaustion / Outage Failover
    # -------------------------------------------------------------
    print("\n[TEST 2] Simulating PRIMARY Quota Exhaustion (Testing Failover)...")
    print("  -> Temporarily disabling primary account to simulate daily limit reached...")
    os.environ["FORCE_SMTP_FAILOVER"] = "true"
    try:
        res2 = send_otp_email(target, "Plant Auditor", "445566", "REGISTRATION")
        print(f"  -> Result: {res2.get('channel')} | Sender: {res2.get('sender')}")
        if res2.get("channel") == "SECONDARY_SMTP_FAILOVER":
            print(f"\n=================================================================")
            print(f"  🎉 FAILOVER LOGIC 100% VERIFIED & WORKING!")
            print(f"  When primary failed/exhausted, system automatically switched to:")
            print(f"  Sender: {res2.get('sender')} ({settings.SECONDARY_SMTP_USER})")
            print(f"  Verification email with code '445566' dispatched to {target}!")
            print("=================================================================")
        else:
            print(f"  Notice: Channel was {res2.get('channel')}")
    except Exception as e:
        print(f"  ❌ Failover error: {e}")

    # Reset
    os.environ["FORCE_SMTP_FAILOVER"] = "false"

if __name__ == "__main__":
    main()
