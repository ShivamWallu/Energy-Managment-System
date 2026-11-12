import sys
import os
import smtplib
import socket
import ssl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app.config import settings
from backend.app.email_service import send_otp_email

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "itchd.kogm@gmail.com"
    print("=" * 65)
    print("  AWS EC2 ➔ GMAIL SMTP IN-DEPTH DIAGNOSTIC")
    print("=" * 65)
    
    # 1. DNS Resolution
    print("\n[Step 1] Resolving smtp.gmail.com IP Addresses:")
    v4_ips = []
    v6_ips = []
    try:
        infos = socket.getaddrinfo("smtp.gmail.com", 587, socket.AF_UNSPEC, socket.SOCK_STREAM)
        for fam, _, _, _, addr in infos:
            ip = addr[0]
            if fam == socket.AF_INET and ip not in v4_ips:
                v4_ips.append(ip)
            elif fam == socket.AF_INET6 and ip not in v6_ips:
                v6_ips.append(ip)
        print(f"  - IPv4 Addresses found: {v4_ips}")
        print(f"  - IPv6 Addresses found: {v6_ips}")
    except Exception as e:
        print(f"  - DNS Resolution failed: {e}")
        return

    # 2. Test IPv4 specifically on Port 587
    print("\n[Step 2] Testing Force-IPv4 Connection on Port 587:")
    if v4_ips:
        target_ip = v4_ips[0]
        try:
            print(f"  - Connecting directly to IPv4 {target_ip}:587...")
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(6)
            s.connect((target_ip, 587))
            banner = s.recv(1024).decode("utf-8", errors="ignore").strip()
            print(f"  - Server Banner Received: {banner}")
            s.close()
            print("  ==> Force-IPv4 Port 587: REACHABLE & BANNER RECEIVED!")
        except Exception as e:
            print(f"  - Force-IPv4 Port 587 FAILED: {type(e).__name__} - {e}")

    # 3. Test IPv4 specifically on Port 465
    print("\n[Step 3] Testing Force-IPv4 Connection on Port 465 (SSL):")
    if v4_ips:
        target_ip = v4_ips[0]
        try:
            print(f"  - Connecting directly to IPv4 {target_ip}:465 with SSL...")
            context = ssl.create_default_context()
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(6)
            s.connect((target_ip, 465))
            with context.wrap_socket(s, server_hostname="smtp.gmail.com") as ss:
                banner = ss.recv(1024).decode("utf-8", errors="ignore").strip()
                print(f"  - SSL Server Banner Received: {banner}")
            print("  ==> Force-IPv4 Port 465: REACHABLE & SSL HANDSHAKE OK!")
        except Exception as e:
            print(f"  - Force-IPv4 Port 465 FAILED: {type(e).__name__} - {e}")

    # 4. If IPv6 is present, test IPv6
    if v6_ips:
        print("\n[Step 4] Testing IPv6 Connection on Port 587:")
        target_ip = v6_ips[0]
        try:
            print(f"  - Connecting to IPv6 [{target_ip}]:587...")
            s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
            s.settimeout(6)
            s.connect((target_ip, 587))
            banner = s.recv(1024).decode("utf-8", errors="ignore").strip()
            print(f"  - IPv6 Banner Received: {banner}")
            s.close()
            print("  ==> IPv6 Port 587: SUCCESS!")
        except Exception as e:
            print(f"  - IPv6 Port 587 FAILED: {type(e).__name__} - {e}")

    print("\n" + "=" * 65)

if __name__ == "__main__":
    main()
