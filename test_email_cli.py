import sys
import os
import smtplib
import socket
import ssl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app.config import settings

def test_auth(user, raw_pwd, label):
    clean_pwd = raw_pwd.strip().strip('"\'').replace(" ", "").strip()
    masked = clean_pwd[:3] + "..." + clean_pwd[-3:] if len(clean_pwd) >= 6 else "SHORT"
    print(f"\n==================================================")
    print(f"Testing Account [{label}]: {user}")
    print(f"Password Length: {len(clean_pwd)} chars | Masked: {masked}")
    print(f"==================================================")
    
    infos = socket.getaddrinfo("smtp.gmail.com", 587, socket.AF_INET, socket.SOCK_STREAM)
    ipv4 = infos[0][4][0]

    s = smtplib.SMTP(ipv4, 587, timeout=15)
    s.ehlo("localhost")
    s._host = "smtp.gmail.com"
    context = ssl.create_default_context()
    s.starttls(context=context)
    s.ehlo("localhost")

    print(f"Sending AUTH LOGIN command for {user}...")
    try:
        code, msg = s.login(user, clean_pwd)
        print(f"🎉 LOGIN SUCCESSFUL for {user}! Code: {code}")
        s.quit()
        return True
    except smtplib.SMTPAuthenticationError as e:
        print(f"❌ AUTHENTICATION REJECTED by Google: {e.smtp_code} - {e.smtp_error}")
        s.close()
        return False
    except Exception as e:
        print(f"❌ CONNECTION CLOSED AT LOGIN: {type(e).__name__} - {e}")
        s.close()
        return False

def main():
    print("Testing both Primary and Secondary accounts for Gmail Login on EC2...")
    
    # 1. Primary
    test_auth(settings.PRIMARY_SMTP_USER, settings.PRIMARY_SMTP_PASSWORD, "PRIMARY")
    
    # 2. Secondary
    test_auth(settings.SECONDARY_SMTP_USER, settings.SECONDARY_SMTP_PASSWORD, "SECONDARY")

if __name__ == "__main__":
    main()
