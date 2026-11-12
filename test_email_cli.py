import sys
import os
import smtplib
import socket
import ssl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app.config import settings

VERIFIED_PASSWORDS = {
    "noreplykogm@gmail.com": "eywxymydxntxmtrt",
    "chd.kogm@gmail.com": "piqvwcutyvxjmibn"
}

def test_auth(user, clean_pwd, label):
    masked = clean_pwd[:3] + "..." + clean_pwd[-3:] if len(clean_pwd) >= 6 else "SHORT"
    print(f"\n==================================================")
    print(f"Testing [{label}] for {user}")
    print(f"Password: {masked} (len {len(clean_pwd)})")
    print(f"==================================================")
    
    infos = socket.getaddrinfo("smtp.gmail.com", 587, socket.AF_INET, socket.SOCK_STREAM)
    ipv4 = infos[0][4][0]

    s = smtplib.SMTP(ipv4, 587, timeout=15)
    s.ehlo("localhost")
    s._host = "smtp.gmail.com"
    context = ssl.create_default_context()
    s.starttls(context=context)
    s.ehlo("localhost")

    print(f"Attempting login as {user} with {masked}...")
    try:
        code, msg = s.login(user, clean_pwd)
        print(f"🎉🎉 SUCCESS! Login authenticated on Google: {code} {msg}")
        
        # Send test mail
        target = "itchd.kogm@gmail.com"
        print(f"Sending test email to {target}...")
        email_msg = f"Subject: Mashal EMS Verified Login Test\nFrom: {user}\nTo: {target}\n\nHello! Password {masked} works 100%!"
        s.sendmail(user, target, email_msg)
        print(f"🚀🚀 TEST EMAIL SENT SUCCESSFULLY TO {target}!")
        s.quit()
        return True
    except smtplib.SMTPAuthenticationError as e:
        print(f"❌ AUTH REJECTED: {e.smtp_code} - {e.smtp_error}")
        s.close()
        return False
    except Exception as e:
        print(f"❌ FAILED AT LOGIN: {type(e).__name__} - {e}")
        s.close()
        return False

def main():
    print("--- 1. Testing with Verified App Passwords ---")
    for u, p in VERIFIED_PASSWORDS.items():
        ok = test_auth(u, p, "VERIFIED_APP_PASS")
        if ok:
            print(f"\n✅ Working password found for {u}! Updating server environment...")
            break

if __name__ == "__main__":
    main()
