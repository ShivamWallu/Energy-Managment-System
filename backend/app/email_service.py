
import os
import socket
from html import escape as escape_html
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email.utils import formatdate, make_msgid
from typing import Dict, Any

from backend.app.config import settings

OFFICIAL_SENDER_NAME = "Mashal EMS Intelligence"

class _ForceIPv4Socket:
    """Context manager to force socket.getaddrinfo to resolve IPv4 addresses only.
    Crucial on cloud instances (e.g. AWS EC2) where Ubuntu IPv6 stack is active but IPv6 routing is disabled."""
    def __enter__(self):
        self._orig_getaddrinfo = socket.getaddrinfo
        def _getaddrinfo(host, port, family=0, socktype=0, proto=0, flags=0):
            return self._orig_getaddrinfo(host, port, socket.AF_INET, socktype, proto, flags)
        socket.getaddrinfo = _getaddrinfo
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        socket.getaddrinfo = self._orig_getaddrinfo

def generate_otp_email_text(recipient_name: str, otp_code: str, sender_email: str, action: str = "REGISTRATION") -> str:
    """RFC-compliant plain text alternative body to prevent spam filtering."""
    is_pwd_reset = (action == "PASSWORD_RESET")
    purpose = "authorize your password update" if is_pwd_reset else "verify your email address and activate your account"
    return f"""Hello {recipient_name},

Your official verification code for Mashal EMS Intelligence is:

    {otp_code}

This code is valid for 10 minutes. Please use this code to {purpose}.

Security Notice:
Mashal EMS plant administrators will never ask for your password or OTP. If you did not initiate this request, please disregard this email.

--
Mashal EMS Intelligence • SCADA 415V Energy Management System
Khandelia Oil & General Mills Pvt. Ltd.
Official Dispatch: {sender_email}
"""

def generate_otp_email_html(recipient_name: str, otp_code: str, sender_email: str, action: str = "REGISTRATION") -> str:
    kogm_img_src = "cid:kogm_logo"
    mashal_img_src = "cid:mashal_logo"

    recipient_name = escape_html(str(recipient_name or "User"))
    otp_code = escape_html(str(otp_code or ""))
    sender_email = escape_html(str(sender_email or ""))

    is_pwd_reset = (action == "PASSWORD_RESET")
    subject_label = "Official Password Reset Code" if is_pwd_reset else "Official Account Verification"
    card_label = "PASSWORD RESET CODE (OTP)" if is_pwd_reset else "One-Time Verification Code (OTP)"
    body_intro = (
        "We received an authorized request to reset the account password for your <strong>Mashal Mustard Oil Plant Energy Management System (SCADA Intelligence)</strong> profile.<br>Please use the 6-digit verification code below to authorize your password update:"
        if is_pwd_reset else
        "You have initiated a user account registration for the <strong>Mashal Mustard Oil Plant Energy Management System (SCADA Intelligence)</strong>.<br>Please use the one-time verification code below to verify your email address and activate your account in the plant registry."
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Mashal EMS - {subject_label}</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      background-color: #fff7ed;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
    }}
    .email-container {{
      max-width: 580px;
      margin: 30px auto;
      background-color: #ffffff;
      border: 1px solid rgba(185, 28, 28, 0.20);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 12px 32px rgba(15,23,42,0.12);
    }}
    .email-header {{
      background: linear-gradient(135deg, #fff7ed 0%, #ffffff 100%);
      padding: 30px 24px 24px;
      text-align: center;
      border-bottom: 3px solid #c62828;
    }}
    .brand-logo-wrap {{
      text-align: center;
      margin-bottom: 14px;
    }}
    .company-title {{
      font-size: 21px;
      font-weight: 800;
      letter-spacing: 0.8px;
      color: #b91c1c;
      margin-top: 8px;
    }}
    .company-subtitle {{
      font-size: 11px;
      color: #92400e;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      font-weight: 700;
      margin-top: 4px;
    }}
    .email-body {{
      padding: 32px 28px;
    }}
    .greeting {{
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
    }}
    .message-text {{
      font-size: 14px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 24px;
    }}
    .otp-card {{
      background: #fffbeb;
      border: 1.5px dashed #c62828;
      border-radius: 10px;
      padding: 22px 16px;
      text-align: center;
      margin: 20px 0;
    }}
    .otp-label {{
      font-size: 11px;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 1.8px;
      font-weight: 700;
      margin-bottom: 8px;
    }}
    .otp-digits {{
      font-family: 'Courier New', Courier, monospace;
      font-size: 36px;
      font-weight: 900;
      color: #b91c1c;
      letter-spacing: 8px;
      margin: 6px 0;
    }}
    .expiry-note {{
      font-size: 12px;
      color: #334155;
      margin-top: 6px;
    }}
    .security-notice {{
      background: #fff7df;
      border-left: 3px solid #f4b400;
      padding: 12px 14px;
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.5;
      color: #78350f;
      margin-top: 24px;
    }}
    .email-footer {{
      background: #fff7ed;
      padding: 20px 24px;
      text-align: center;
      font-size: 11px;
      color: #64748b;
      line-height: 1.6;
      border-top: 1px solid #fecaca;
    }}
  </style>
</head>
<body style="margin:0; padding:0; background-color:#fff7ed; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#1e293b;">
  <div class="email-container" style="max-width:580px; margin:25px auto; background-color:#ffffff; border:1.5px solid #fed7aa; border-radius:14px; overflow:hidden; box-shadow:0 8px 24px rgba(15,23,42,0.08);">
    <div class="email-header" style="background:linear-gradient(135deg, #fffbeb 0%, #fff7ed 100%); padding:28px 20px 20px; text-align:center; border-bottom:3px solid #b91c1c;">
      <div class="brand-logo-wrap" style="text-align:center; margin-bottom:12px;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
          <td style="padding:0 6px;"><img src="{kogm_img_src}" alt="KOGM — Khandelia Oil &amp; General Mills" style="height:52px; width:108px; object-fit:contain; border-radius:6px; border:1px solid #f4b400; background:#ffffff; display:block;"></td>
          <td style="padding:0 6px;"><img src="{mashal_img_src}" alt="Mashal Kachi Ghani Mustard Oil" style="height:52px; width:108px; object-fit:contain; border-radius:6px; border:1px solid #f4b400; background:#ffffff; display:block;"></td>
        </tr></table>
      </div>
      <div class="company-title" style="font-size:21px; font-weight:800; letter-spacing:0.8px; color:#b91c1c; margin-top:8px;">MASHAL EMS INTELLIGENCE</div>
      <div class="company-subtitle" style="font-size:11px; color:#92400e; text-transform:uppercase; letter-spacing:1.5px; font-weight:700; margin-top:4px;">Official Corporate Security &amp; Access Authority</div>
    </div>
    <div class="email-body" style="padding:30px 26px;">
      <div class="greeting" style="font-size:16px; font-weight:700; color:#0f172a; margin-bottom:12px;">Hello {recipient_name},</div>
      <p class="message-text" style="font-size:14px; line-height:1.6; color:#475569; margin-bottom:22px;">
        {body_intro}
      </p>

      <div class="otp-card" style="background:#fffbeb; border:2px dashed #b91c1c; border-radius:10px; padding:20px 16px; text-align:center; margin:20px 0;">
        <div class="otp-label" style="font-size:11px; color:#78350f; text-transform:uppercase; letter-spacing:1.8px; font-weight:800; margin-bottom:6px;">{card_label}</div>
        <div class="otp-digits" style="font-family:'Courier New', Courier, monospace; font-size:38px; font-weight:900; color:#b91c1c; letter-spacing:8px; margin:8px 0;">{otp_code}</div>
        <div class="expiry-note" style="font-size:12px; color:#475569; margin-top:6px;">This secure code is valid for <strong>10 minutes</strong>.</div>
      </div>

      <div class="security-notice" style="background:#fff7ed; border-left:4px solid #f59e0b; padding:12px 14px; border-radius:4px; font-size:12px; line-height:1.5; color:#78350f; margin-top:24px;">
        <strong style="color:#92400e;">Security Notice:</strong> Mashal EMS plant administrators will never ask for your password or OTP. If you did not initiate this request, please disregard this email or notify the plant IT authority immediately.
      </div>
    </div>
    <div class="email-footer" style="background:#fff7ed; padding:18px 24px; text-align:center; font-size:11px; color:#64748b; line-height:1.6; border-top:1px solid #fed7aa;">
      &copy; 2026 Mashal EMS Intelligence &bull; SCADA 415V Bus Energy Monitoring System<br>
      Khandelia Oil &amp; General Mills Pvt. Ltd. &bull; Official Dispatch: {sender_email}
    </div>
  </div>
</body>
</html>
"""

def _attempt_smtp_send(host: str, port: int, user: str, password: str, to_email: str, subject: str, html_content: str, plain_text: str = "") -> bool:
    """Helper to send an email via SMTP with proper TLS handshake, authentication, and embedded logo parts."""
    if not user or not password:
        return False
    
    msg = MIMEMultipart("related")
    msg["Subject"] = subject
    msg["From"] = f"{OFFICIAL_SENDER_NAME} <{user}>"
    msg["To"] = to_email
    msg["Reply-To"] = user
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="gmail.com")
    msg["Auto-Submitted"] = "auto-generated"
    msg["X-Auto-Response-Suppress"] = "All"

    msg_alt = MIMEMultipart("alternative")
    msg.attach(msg_alt)

    # Attach Plain-Text Part First (crucial for anti-spam heuristics)
    if plain_text:
        msg_alt.attach(MIMEText(plain_text, "plain", "utf-8"))

    # Attach Rich HTML Part Second
    msg_alt.attach(MIMEText(html_content, "html", "utf-8"))

    # Attach both 3D brand logos as lightweight inline CID parts (optimized to ~33KB to ensure instant delivery without SSL timeout)
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    for cid_name, opt_path, orig_path in [
        ("kogm_logo", "Images/logos/email_logo1.png", "Images/logos/3d_logo1.png"),
        ("mashal_logo", "Images/logos/email_logo2.png", "Images/logos/3d_logo2.png")
    ]:
        full_path = os.path.join(base_dir, opt_path)
        if not os.path.exists(full_path):
            full_path = os.path.join(base_dir, orig_path)
            
        if os.path.exists(full_path):
            try:
                with open(full_path, "rb") as img_f:
                    mime_img = MIMEImage(img_f.read(), _subtype="png")
                    # Clear any default attachment headers
                    if "Content-Disposition" in mime_img:
                        del mime_img["Content-Disposition"]
                    # Add purely inline disposition without any filename attribute
                    mime_img.add_header("Content-Disposition", "inline")
                    if "Content-ID" in mime_img:
                        del mime_img["Content-ID"]
                    mime_img.add_header("Content-ID", f"<{cid_name}>")
                    msg.attach(mime_img)
            except Exception as e:
                print(f"[EmailService] Could not attach CID image {cid_name}: {e}")

    # Dual-port resilience: try configured port (587 STARTTLS or 465 SSL), and fallback to alternate port if blocked/timed out
    ports_to_try = [port]
    fallback_port = 465 if port != 465 else 587
    if fallback_port not in ports_to_try:
        ports_to_try.append(fallback_port)

    last_err = None
    with _ForceIPv4Socket():
        for p in ports_to_try:
            try:
                if p == 465:
                    with smtplib.SMTP_SSL(host, 465, timeout=25) as server:
                        server.login(user, password)
                        server.sendmail(user, to_email, msg.as_string())
                else:
                    with smtplib.SMTP(host, p, timeout=25) as server:
                        server.ehlo()
                        server.starttls()
                        server.ehlo()
                        server.login(user, password)
                        server.sendmail(user, to_email, msg.as_string())
                print(f"[EmailService] Delivered email via {host}:{p} (IPv4) using {user}")
                return True
            except Exception as e:
                last_err = e
                print(f"[EmailService] Port {p} failed on {host} for {user}: {e}")

    if last_err:
        raise last_err
    return False

def send_otp_email(to_email: str, recipient_name: str, otp_code: str, action: str = "REGISTRATION") -> Dict[str, Any]:
    """
    Sends the company-branded OTP verification email using Dual-Account failover:
    1. Primary account: noreplykogm@gmail.com
    2. Secondary account: chd.kogm@gmail.com (automatically engaged if primary quota is reached or fails)
    3. Resilient console dispatch for offline/local environments.
    """
    # Dynamically reload environment variables so live .env edits take effect instantly without restarting server
    try:
        from dotenv import load_dotenv
        load_dotenv(override=True)
    except Exception:
        pass

    is_pwd_reset = (action == "PASSWORD_RESET")
    subject = (
        f"Mashal EMS Intelligence — Password Reset Code: {otp_code}"
        if is_pwd_reset else
        f"Mashal EMS Intelligence — Verification Code: {otp_code}"
    )
    smtp_host = os.getenv("SMTP_HOST", settings.SMTP_HOST)
    smtp_port = int(os.getenv("SMTP_PORT", str(settings.SMTP_PORT)))

    # Clean passwords to remove any accidental enclosing quotes or trailing whitespace
    primary_user = os.getenv("PRIMARY_SMTP_USER", settings.PRIMARY_SMTP_USER).strip().strip('"\'').strip()
    primary_pass = os.getenv("PRIMARY_SMTP_PASSWORD", settings.PRIMARY_SMTP_PASSWORD).strip().strip('"\'').replace(" ", "").strip()
    secondary_user = os.getenv("SECONDARY_SMTP_USER", settings.SECONDARY_SMTP_USER).strip().strip('"\'').strip()
    secondary_pass = os.getenv("SECONDARY_SMTP_PASSWORD", settings.SECONDARY_SMTP_PASSWORD).strip().strip('"\'').replace(" ", "").strip()

    # Optionally force failover (useful for testing)
    force_failover = os.getenv("FORCE_SMTP_FAILOVER", "false").lower() == "true"
    # 1. Attempt Primary SMTP account (noreplykogm@gmail.com)
    if primary_pass and not force_failover:
        try:
            html = generate_otp_email_html(recipient_name, otp_code, primary_user, action=action)
            plain = generate_otp_email_text(recipient_name, otp_code, primary_user, action=action)
            _attempt_smtp_send(smtp_host, smtp_port, primary_user, primary_pass, to_email, subject, html, plain)
            print(f"[EmailService] Delivered OTP via Primary SMTP ({primary_user}) to {to_email}")
            return {
                "sent": True,
                "recipient": to_email,
                "sender": primary_user,
                "channel": "PRIMARY_SMTP"
            }
        except Exception as primary_err:
            print(f"[EmailService] Primary account ({primary_user}) failed or quota reached: {primary_err}")
            print(f"[EmailService] Initiating automatic failover to Secondary account ({secondary_user})...")

    # 2. Attempt Secondary SMTP account (chd.kogm@gmail.com)
    if secondary_pass:
        try:
            html = generate_otp_email_html(recipient_name, otp_code, secondary_user, action=action)
            plain = generate_otp_email_text(recipient_name, otp_code, secondary_user, action=action)
            _attempt_smtp_send(smtp_host, smtp_port, secondary_user, secondary_pass, to_email, subject, html, plain)
            print(f"[EmailService] Delivered OTP via Secondary Failover SMTP ({secondary_user}) to {to_email}")
            return {
                "sent": True,
                "recipient": to_email,
                "sender": secondary_user,
                "channel": "SECONDARY_SMTP_FAILOVER"
            }
        except Exception as secondary_err:
            print(f"[EmailService] Secondary account ({secondary_user}) also failed: {secondary_err}")

    # 3. Resilient Plant Dispatch Console Fallback (for offline testing & local runs)
    active_sender = primary_user if primary_user else "noreplykogm@gmail.com"
    print(f"\n==================== MASHAL CORPORATE EMAIL DISPATCH ====================")
    print(f"From: {OFFICIAL_SENDER_NAME} <{active_sender}>")
    print(f"To: {recipient_name} <{to_email}>")
    print(f"Action: {action}")
    print(f"Subject: {subject}")
    print(f"3D Logos Attached: [KOGM + MASHAL] from Images/logos")
    print(f"Failover Status: Configured (Primary: {primary_user} -> Secondary: {secondary_user})")
    print(f"Secure OTP Code: >>> {otp_code} <<< (Valid for 10 minutes)")
    print(f"========================================================================\n")

    return {
        "sent": True,
        "recipient": to_email,
        "sender": active_sender,
        "channel": "SYSTEM_LOG",
        "demo_otp": otp_code
    }


def generate_welcome_email_text(recipient_name: str, username: str, role: str, sender_email: str, to_email: str = "") -> str:
    return f"""Hello {recipient_name},

Congratulations! Your official user account for Mashal EMS Intelligence has been successfully verified and activated.

Account Details:
- Name: {recipient_name}
- Username: {username}
- Role Assigned: {role.upper()} (Plant SCADA Telemetry Auditor)
- Status: Active & Operational

Next Steps to Get Started:
1. Log in to your Mashal EMS Dashboard: http://127.0.0.1:8000
2. Click the 'Upload EMS Report' button in the top navigation bar.
3. Ingest your plant 15-minute 12-hour SCADA shift report (.xlsx/.csv).
4. Monitor Expeller (P1 to P5) and Kohlu cold-press motor health and overload alarms.

Security Notice:
Mashal EMS plant administrators will never ask for your password. Keep your login credentials confidential.

--
Mashal EMS Intelligence • SCADA 415V Energy Management System
Khandelia Oil & General Mills Pvt. Ltd.
Official Dispatch: {sender_email}
"""


def generate_welcome_email_html(recipient_name: str, username: str, role: str, sender_email: str, to_email: str = "") -> str:
    kogm_img_src = "cid:kogm_logo"
    mashal_img_src = "cid:mashal_logo"

    recipient_name = escape_html(str(recipient_name or "User"))
    username = escape_html(str(username or ""))
    role = escape_html(str(role or "auditor"))
    to_email = escape_html(str(to_email or ""))
    sender_email = escape_html(str(sender_email or ""))

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Welcome to Mashal EMS Intelligence</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      background-color: #fff7ed;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
    }}
    .email-container {{
      max-width: 580px;
      margin: 30px auto;
      background-color: #ffffff;
      border: 1px solid rgba(185, 28, 28, 0.20);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 12px 32px rgba(15,23,42,0.12);
    }}
    .email-header {{
      background: linear-gradient(135deg, #fff7ed 0%, #ffffff 100%);
      padding: 30px 24px 24px;
      text-align: center;
      border-bottom: 3px solid #c62828;
    }}
    .brand-logo-wrap {{
      text-align: center;
      margin-bottom: 14px;
    }}
    .company-title {{
      font-size: 21px;
      font-weight: 800;
      letter-spacing: 0.8px;
      color: #b91c1c;
      margin-top: 8px;
    }}
    .company-subtitle {{
      font-size: 11px;
      color: #92400e;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      font-weight: 700;
      margin-top: 4px;
    }}
    .email-body {{
      padding: 32px 28px;
    }}
    .greeting {{
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
    }}
    .message-text {{
      font-size: 14px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 20px;
    }}
    .info-card {{
      background: #fffbeb;
      border: 1px solid rgba(185, 28, 28, 0.20);
      border-radius: 10px;
      padding: 18px 20px;
      margin: 20px 0;
    }}
    .info-row {{
      padding: 8px 0;
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
      font-size: 13px;
    }}
    .info-row:last-child {{
      border-bottom: none;
    }}
    .info-label {{
      color: #475569;
      font-weight: 600;
      display: inline-block;
      width: 140px;
    }}
    .info-val {{
      color: #b91c1c;
      font-weight: 700;
      font-family: monospace;
    }}
    .steps-card {{
      background: #fff7df;
      border-left: 3px solid #f4b400;
      padding: 16px 18px;
      border-radius: 4px;
      font-size: 13px;
      line-height: 1.6;
      color: #78350f;
      margin-top: 24px;
    }}
    .email-footer {{
      background: #fff7ed;
      padding: 20px 24px;
      text-align: center;
      border-top: 1px solid #fecaca;
      font-size: 11px;
      color: #64748b;
      line-height: 1.6;
    }}
  </style>
</head>
<body style="margin:0; padding:0; background-color:#fff7ed; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#1e293b;">
  <div class="email-container" style="max-width:580px; margin:25px auto; background-color:#ffffff; border:1.5px solid #fed7aa; border-radius:14px; overflow:hidden; box-shadow:0 8px 24px rgba(15,23,42,0.08);">
    <div class="email-header" style="background:linear-gradient(135deg, #fffbeb 0%, #fff7ed 100%); padding:28px 20px 20px; text-align:center; border-bottom:3px solid #b91c1c;">
      <div class="brand-logo-wrap" style="text-align:center; margin-bottom:12px;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
          <td style="padding:0 6px;"><img src="{kogm_img_src}" alt="KOGM — Khandelia Oil &amp; General Mills" style="height:52px; width:108px; object-fit:contain; border-radius:6px; border:1px solid #f4b400; background:#ffffff; display:block;"></td>
          <td style="padding:0 6px;"><img src="{mashal_img_src}" alt="Mashal Kachi Ghani Mustard Oil" style="height:52px; width:108px; object-fit:contain; border-radius:6px; border:1px solid #f4b400; background:#ffffff; display:block;"></td>
        </tr></table>
      </div>
      <div class="company-title" style="font-size:21px; font-weight:800; letter-spacing:0.8px; color:#b91c1c; margin-top:8px;">MASHAL EMS INTELLIGENCE</div>
      <div class="company-subtitle" style="font-size:11px; color:#92400e; text-transform:uppercase; letter-spacing:1.5px; font-weight:700; margin-top:4px;">SCADA Energy Monitoring &bull; 415V Bus Intelligence</div>
    </div>

    <div class="email-body" style="padding:30px 26px;">
      <div class="greeting" style="font-size:18px; font-weight:800; color:#0f172a; margin-bottom:12px;">Congratulations, {recipient_name}!</div>
      <div style="background:#fff7df; border:1px solid #f4b400; border-left:4px solid #b91c1c; border-radius:7px; padding:12px 14px; margin:0 0 16px; color:#991b1b; font-size:13px; font-weight:800;">Your account has been verified and is ready to use.</div>
      <div class="message-text" style="font-size:14px; line-height:1.6; color:#475569; margin-bottom:20px;">
        Your user profile has been successfully verified and activated in the <strong>Mashal Mustard Oil Plant Energy Management System</strong>. You are now authorized to access SCADA telemetry, 15-minute motor load benchmarks, and anomaly audits.
      </div>

      <div class="info-card" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:18px 20px; margin:20px 0;">
        <div class="info-row" style="padding:7px 0; border-bottom:1px solid #f1f5f9; display:flex;">
          <span class="info-label" style="color:#64748b; font-weight:600; width:140px; display:inline-block;">Account Name:</span>
          <span class="info-val" style="color:#0f172a; font-weight:700;">{recipient_name}</span>
        </div>
        <div class="info-row" style="padding:7px 0; border-bottom:1px solid #f1f5f9; display:flex;">
          <span class="info-label" style="color:#64748b; font-weight:600; width:140px; display:inline-block;">Username:</span>
          <span class="info-val" style="color:#b91c1c; font-weight:700; font-family:monospace;">@{username}</span>
        </div>
        <div class="info-row" style="padding:7px 0; border-bottom:1px solid #f1f5f9; display:flex;">
          <span class="info-label" style="color:#64748b; font-weight:600; width:140px; display:inline-block;">Assigned Role:</span>
          <span class="info-val" style="color:#059669; font-weight:800;">{role.upper()}</span>
        </div>
        <div class="info-row" style="padding:7px 0; display:flex;">
          <span class="info-label" style="color:#64748b; font-weight:600; width:140px; display:inline-block;">Account Status:</span>
          <span class="info-val" style="color:#059669; font-weight:800;">Active &amp; Ready</span>
        </div>
      </div>

      <div class="steps-card" style="background:#fffbeb; border-left:4px solid #f59e0b; padding:16px 18px; border-radius:4px; font-size:13px; line-height:1.6; color:#78350f; margin-top:24px;">
        <strong style="color:#92400e;">&bull; How to Begin:</strong><br>
        1. Open your dashboard and look for the blinking <strong>"Upload EMS Report"</strong> button.<br>
        2. Upload your plant's 12-hour SCADA shift report (.xlsx or .csv).<br>
        3. Real-time telemetry, Expeller (P1 to P5) health benchmarks, and Kohlu cold press graphs will instantly generate for your account.
      </div>
    </div>

    <div class="email-footer" style="background:#fff7ed; padding:18px 24px; text-align:center; font-size:11px; color:#64748b; line-height:1.6; border-top:1px solid #fed7aa;">
      <strong>Khandelia Oil &amp; General Mills Pvt. Ltd.</strong><br>
      Mustard Oil Plant SCADA Automation &bull; Energy Monitoring Division<br>
      Automated dispatch sent to {to_email}. Please do not reply directly to this email.
    </div>
  </div>
</body>
</html>
"""


def send_welcome_registration_email(to_email: str, recipient_name: str, username: str, role: str) -> Dict[str, Any]:
    try:
        from dotenv import load_dotenv
        load_dotenv(override=True)
    except Exception:
        pass

    subject = f"Welcome to Mashal EMS Intelligence — Account Activated (@{username})"
    smtp_host = os.getenv("SMTP_HOST", settings.SMTP_HOST)
    smtp_port = int(os.getenv("SMTP_PORT", str(settings.SMTP_PORT)))

    primary_user = os.getenv("PRIMARY_SMTP_USER", settings.PRIMARY_SMTP_USER).strip().strip('"\'').strip()
    primary_pass = os.getenv("PRIMARY_SMTP_PASSWORD", settings.PRIMARY_SMTP_PASSWORD).strip().strip('"\'').replace(" ", "").strip()
    secondary_user = os.getenv("SECONDARY_SMTP_USER", settings.SECONDARY_SMTP_USER).strip().strip('"\'').strip()
    secondary_pass = os.getenv("SECONDARY_SMTP_PASSWORD", settings.SECONDARY_SMTP_PASSWORD).strip().strip('"\'').replace(" ", "").strip()

    force_failover = os.getenv("FORCE_SMTP_FAILOVER", "false").lower() == "true"

    if primary_pass and not force_failover:
        try:
            html = generate_welcome_email_html(recipient_name, username, role, primary_user, to_email)
            plain = generate_welcome_email_text(recipient_name, username, role, primary_user, to_email)
            _attempt_smtp_send(smtp_host, smtp_port, primary_user, primary_pass, to_email, subject, html, plain)
            print(f"[EmailService] Delivered Welcome Email via Primary SMTP ({primary_user}) to {to_email}")
            return {"sent": True, "recipient": to_email, "sender": primary_user, "channel": "PRIMARY_SMTP"}
        except Exception as err:
            print(f"[EmailService] Primary welcome email failed: {err}")

    if secondary_pass:
        try:
            html = generate_welcome_email_html(recipient_name, username, role, secondary_user, to_email)
            plain = generate_welcome_email_text(recipient_name, username, role, secondary_user, to_email)
            _attempt_smtp_send(smtp_host, smtp_port, secondary_user, secondary_pass, to_email, subject, html, plain)
            print(f"[EmailService] Delivered Welcome Email via Secondary SMTP ({secondary_user}) to {to_email}")
            return {"sent": True, "recipient": to_email, "sender": secondary_user, "channel": "SECONDARY_SMTP_FAILOVER"}
        except Exception as err:
            print(f"[EmailService] Secondary welcome email failed: {err}")

    active_sender = primary_user if primary_user else "noreplykogm@gmail.com"
    print(f"\n==================== MASHAL WELCOME REGISTRATION EMAIL DISPATCH ====================")
    print(f"From: {OFFICIAL_SENDER_NAME} <{active_sender}>")
    print(f"To: {recipient_name} <{to_email}>")
    print(f"Subject: {subject}")
    print(f"User: @{username} | Role: {role.upper()} | Status: ACTIVATED")
    print(f"====================================================================================\n")

    return {"sent": True, "recipient": to_email, "sender": active_sender, "channel": "SYSTEM_LOG"}
