import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email.utils import formatdate, make_msgid

user = 'noreplykogm@gmail.com'
pwd = 'eywx ymyd xntx mtrt'
to_email = 'er.shivamwallu@gmail.com'

msg = MIMEMultipart('related')
msg['Subject'] = 'Your Mashal EMS verification code is 619284'
msg['From'] = f'Mashal EMS Intelligence <{user}>'
msg['To'] = to_email
msg['Date'] = formatdate(localtime=True)
msg['Message-ID'] = make_msgid(domain='gmail.com')

msg_alt = MIMEMultipart('alternative')
msg.attach(msg_alt)

html = '''<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 24px; text-align: center;">
    <div style="margin-bottom: 16px;">
      <img src="cid:kogm_logo" style="height: 48px; margin: 0 8px; vertical-align: middle;">
      <img src="cid:mashal_logo" style="height: 48px; margin: 0 8px; vertical-align: middle;">
    </div>
    <h2 style="color: #0f172a; margin: 0 0 8px; font-size: 20px;">Mashal EMS Intelligence</h2>
    <p style="color: #64748b; font-size: 14px; margin: 0 0 20px;">SCADA 415V Energy Management System</p>
    <div style="background: #f1f5f9; border: 1px dashed #0284c7; border-radius: 8px; padding: 18px; margin: 20px 0;">
      <div style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Your One-Time Verification Code</div>
      <div style="font-size: 32px; font-weight: 800; color: #0284c7; letter-spacing: 6px; margin: 8px 0;">619284</div>
      <div style="font-size: 12px; color: #94a3b8;">Valid for 10 minutes</div>
    </div>
    <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0;">If you did not request this verification code, please disregard this email.</p>
  </div>
</body>
</html>'''

msg_alt.attach(MIMEText('Your Mashal EMS verification code is 619284. Valid for 10 minutes.', 'plain', 'utf-8'))
msg_alt.attach(MIMEText(html, 'html', 'utf-8'))

for cid, fn in [('kogm_logo', 'Images/logos/email_kogm_logo.png'), ('mashal_logo', 'Images/logos/email_mashal_logo.png')]:
    with open(fn, 'rb') as f:
        img = MIMEImage(f.read(), _subtype='png')
        img.add_header('Content-ID', f'<{cid}>')
        # Crucial: NO filename, so Gmail embeds inline and DOES NOT treat as bottom attachment!
        img.add_header('Content-Disposition', 'inline')
        msg.attach(img)

with smtplib.SMTP('smtp.gmail.com', 587, timeout=12) as s:
    s.starttls()
    s.login(user, pwd)
    s.sendmail(user, to_email, msg.as_string())

print('Test script completed successfully!')
