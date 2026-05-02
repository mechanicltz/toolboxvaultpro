"""Gmail SMTP email sender for Toolbox Vault.

Uses a Gmail App Password (not the account password) to send transactional
emails like password-reset codes.

Env vars (all in /app/backend/.env):
    GMAIL_APP_PASSWORD   — 16-character app password from Google Account
    GMAIL_FROM_ADDRESS   — e.g. MechanicVault@gmail.com
    GMAIL_FROM_NAME      — display name shown in the recipient's inbox
"""
from __future__ import annotations

import os
import smtplib
import ssl
import logging
from email.message import EmailMessage
from typing import Optional

logger = logging.getLogger(__name__)


def _get_config():
    pw = os.environ.get("GMAIL_APP_PASSWORD", "").strip()
    sender = os.environ.get("GMAIL_FROM_ADDRESS", "").strip()
    name = os.environ.get("GMAIL_FROM_NAME", "Toolbox Vault").strip()
    return pw, sender, name


def send_email(
    to_address: str,
    subject: str,
    body_plain: str,
    body_html: Optional[str] = None,
) -> bool:
    """Send an email via Gmail SMTP. Returns True on success, False otherwise.

    Never raises — caller should log the returned bool and continue. This is
    intentional so that password-reset endpoints never leak SMTP errors to
    clients.
    """
    pw, sender, name = _get_config()
    if not pw or not sender:
        logger.error("Email send aborted: GMAIL_APP_PASSWORD or GMAIL_FROM_ADDRESS is not set.")
        return False
    if not to_address:
        logger.error("Email send aborted: to_address is empty.")
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{name} <{sender}>" if name else sender
    msg["To"] = to_address
    msg.set_content(body_plain)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    # Gmail app-passwords are shown with spaces for readability; SMTP accepts
    # them with or without. Strip for safety.
    clean_pw = pw.replace(" ", "")

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context, timeout=20) as server:
            server.login(sender, clean_pw)
            server.send_message(msg)
        logger.info("Email sent to %s (subject=%s)", to_address, subject)
        return True
    except smtplib.SMTPAuthenticationError as e:
        logger.error("Gmail SMTP auth failed: %s", e)
        return False
    except Exception as e:
        logger.error("Gmail SMTP error sending to %s: %s", to_address, e)
        return False


def send_password_reset_code(to_address: str, code: str, display_name: str = "") -> bool:
    """Send a 6-digit password reset code formatted nicely."""
    greeting = f"Hi {display_name.strip()}," if display_name.strip() else "Hi,"
    subject = "Your Toolbox Vault password reset code"
    body_plain = (
        f"{greeting}\n\n"
        f"Your password reset code is:\n\n"
        f"    {code}\n\n"
        f"Enter this code in the app to set a new password. "
        f"The code expires in 15 minutes.\n\n"
        f"If you didn't request a password reset, you can safely ignore this email — "
        f"your password has not been changed.\n\n"
        f"— Toolbox Vault"
    )
    body_html = f"""
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background:#f4f4f4; margin:0; padding:20px;">
  <div style="max-width:480px; margin:0 auto; background:#ffffff; border-radius:8px; padding:32px; border:1px solid #e5e5e5;">
    <h1 style="color:#0A0A0A; font-size:20px; margin:0 0 12px 0;">Toolbox Vault</h1>
    <p style="color:#333; font-size:15px; line-height:1.5; margin:0 0 16px 0;">{greeting}</p>
    <p style="color:#333; font-size:15px; line-height:1.5; margin:0 0 16px 0;">Your password reset code is:</p>
    <div style="background:#0A0A0A; color:#F59E0B; font-size:32px; font-weight:900; letter-spacing:8px; text-align:center; padding:18px; border-radius:6px; margin:16px 0; font-family:ui-monospace, SFMono-Regular, monospace;">{code}</div>
    <p style="color:#555; font-size:14px; line-height:1.5; margin:0 0 16px 0;">Enter this code in the app to set a new password. <strong>The code expires in 15 minutes.</strong></p>
    <p style="color:#888; font-size:13px; line-height:1.5; margin:24px 0 0 0; border-top:1px solid #eee; padding-top:16px;">If you didn't request a password reset, you can safely ignore this email — your password has not been changed.</p>
    <p style="color:#888; font-size:12px; margin:12px 0 0 0;">— Toolbox Vault</p>
  </div>
</body>
</html>
""".strip()
    return send_email(to_address, subject, body_plain, body_html)
