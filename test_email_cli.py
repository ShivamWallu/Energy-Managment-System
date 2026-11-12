import sys
import os
import smtplib
import socket
import ssl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app.config import settings

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "itchd.kogm@gmail.com"
    pwd1 = settings.PRIMARY_SMTP_PASSWORD.strip().strip('"\'').replace(" ", "").strip()
    user = settings.PRIMARY_SMTP_USER
    host = settings.SMTP_HOST

    print("=" * 65)
    print("  EXACT LINE-BY-LINE SMTP TRACE")
    print("=" * 65)
    
    # 1. Resolve IPv4
    infos = socket.getaddrinfo(host, 587, socket.AF_INET, socket.SOCK_STREAM)
    ipv4 = infos[0][4][0]
    print(f"[Line 1] Resolved IPv4: {ipv4}")

    print("\n--- Testing Port 587 STARTTLS ---")
    try:
        print("[Line 2] Creating SMTP instance and connecting...")
        s = smtplib.SMTP(timeout=15)
        code, msg = s.connect(ipv4, 587)
        print(f"   -> Connected! Banner: {code} {msg.decode() if isinstance(msg, bytes) else msg}")

        print("[Line 3] Sending initial EHLO...")
        code, msg = s.ehlo("localhost")
        print(f"   -> EHLO success: {code}")

        print("[Line 4] Executing STARTTLS...")
        s._host = "smtp.gmail.com"
        context = ssl.create_default_context()
        code, msg = s.starttls(context=context)
        print(f"   -> STARTTLS success: {code}")

        print("[Line 5] Sending post-TLS EHLO...")
        code, msg = s.ehlo("localhost")
        print(f"   -> Post-TLS EHLO success: {code}")

        print(f"[Line 6] Logging in as {user}...")
        code, msg = s.login(user, pwd1)
        print(f"   -> Login success: {code} {msg}")

        print(f"[Line 7] Sending test email to {target}...")
        email_msg = f"Subject: Mashal EMS Line Test\nFrom: {user}\nTo: {target}\n\nHello from EC2 Line-by-line test!"
        s.sendmail(user, target, email_msg)
        print("   -> Sendmail SUCCESS! Email sent!")
        s.quit()
        print("\n🎉 ALL 7 LINES PASSED SUCCESSFULLY ON PORT 587!")
        return
    except Exception as e:
        print(f"\n❌ FAILED AT STEP ABOVE: {type(e).__name__} - {e}")

    print("\n--- Testing Port 465 SSL ---")
    try:
        print("[Line 2b] Connecting to Port 465 with SSL...")
        raw_sock = socket.create_connection((ipv4, 465), timeout=15)
        context = ssl.create_default_context()
        ssl_sock = context.wrap_socket(raw_sock, server_hostname="smtp.gmail.com")
        s = smtplib.SMTP_SSL(timeout=15)
        s.sock = ssl_sock
        s.file = ssl_sock.makefile('rb')
        code, msg = s.getreply()
        print(f"   -> Connected! Banner: {code} {msg.decode() if isinstance(msg, bytes) else msg}")

        print(f"[Line 3b] Logging in as {user}...")
        s.login(user, pwd1)
        print("   -> Login success!")

        print(f"[Line 4b] Sending test email to {target}...")
        email_msg = f"Subject: Mashal EMS Line Test 465\nFrom: {user}\nTo: {target}\n\nHello from EC2 Port 465!"
        s.sendmail(user, target, email_msg)
        print("   -> Sendmail SUCCESS! Email sent!")
        s.quit()
        print("\n🎉 ALL LINES PASSED ON PORT 465!")
        return
    except Exception as e:
        print(f"\n❌ FAILED AT STEP ABOVE (465): {type(e).__name__} - {e}")

if __name__ == "__main__":
    main()
