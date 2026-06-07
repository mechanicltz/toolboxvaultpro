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
    reply_to: Optional[str] = None,
    cc: Optional[str] = None,
    attachment_base64: Optional[str] = None,
    attachment_filename: str = "screenshot.png",
    attachment_mime: str = "image/png",
) -> bool:
    """Send an email via Gmail SMTP. Returns True on success, False otherwise.

    Never raises — caller should log the returned bool and continue. This is
    intentional so that password-reset endpoints never leak SMTP errors to
    clients.

    If ``reply_to`` is provided, a ``Reply-To`` header is added so that when
    the operator replies from Gmail the response goes to the end-user rather
    than to the MechanicVault inbox itself.
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
    if reply_to:
        msg["Reply-To"] = reply_to
    # Optional CC — e.g. the feedback submitter, so support can reply-all and
    # the user keeps a copy of what they sent.
    cc_clean = (cc or "").strip()
    if cc_clean and cc_clean.lower() != (to_address or "").strip().lower():
        msg["Cc"] = cc_clean
    msg.set_content(body_plain)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    # Attach screenshot if provided (for bug reports with attached photos).
    if attachment_base64:
        try:
            import base64 as _b64
            raw = _b64.b64decode(attachment_base64)
            maintype, _, subtype = attachment_mime.partition("/")
            msg.add_attachment(
                raw,
                maintype=maintype or "image",
                subtype=subtype or "png",
                filename=attachment_filename,
            )
        except Exception as _e:
            logger.warning("Failed to attach base64 image: %s", _e)

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


def send_email_change_code(to_address: str, code: str, display_name: str = "") -> bool:
    """Send a 6-digit code to a user's NEW email to confirm a login-email change."""
    greeting = f"Hi {display_name.strip()}," if display_name.strip() else "Hi,"
    subject = "Confirm your new Toolbox Vault login email"
    body_plain = (
        f"{greeting}\n\n"
        f"You requested to change the email you use to sign in to Toolbox Vault "
        f"to this address. Your confirmation code is:\n\n"
        f"    {code}\n\n"
        f"Enter this code in the app to finish updating your login email. "
        f"The code expires in 15 minutes.\n\n"
        f"If you didn't request this change, you can safely ignore this email — "
        f"your login email has not been changed.\n\n"
        f"— Toolbox Vault"
    )
    body_html = f"""
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background:#f4f4f4; margin:0; padding:20px;">
  <div style="max-width:480px; margin:0 auto; background:#ffffff; border-radius:8px; padding:32px; border:1px solid #e5e5e5;">
    <h1 style="color:#0A0A0A; font-size:20px; margin:0 0 12px 0;">Toolbox Vault</h1>
    <p style="color:#333; font-size:15px; line-height:1.5; margin:0 0 16px 0;">{greeting}</p>
    <p style="color:#333; font-size:15px; line-height:1.5; margin:0 0 16px 0;">Confirm your new login email with this code:</p>
    <div style="background:#0A0A0A; color:#F59E0B; font-size:32px; font-weight:900; letter-spacing:8px; text-align:center; padding:18px; border-radius:6px; margin:16px 0; font-family:ui-monospace, SFMono-Regular, monospace;">{code}</div>
    <p style="color:#555; font-size:14px; line-height:1.5; margin:0 0 16px 0;">Enter this code in the app to finish updating your login email. <strong>The code expires in 15 minutes.</strong></p>
    <p style="color:#888; font-size:13px; line-height:1.5; margin:24px 0 0 0; border-top:1px solid #eee; padding-top:16px;">If you didn't request this change, you can safely ignore this email — your login email has not been changed.</p>
    <p style="color:#888; font-size:12px; margin:12px 0 0 0;">— Toolbox Vault</p>
  </div>
</body>
</html>
""".strip()
    return send_email(to_address, subject, body_plain, body_html)


def send_feedback_email(
    to_address: str,
    from_name: str,
    from_email: str,
    subject: str,
    message: str,
    is_bug: bool = False,
    is_feature: bool = False,
    platform: str = "",
    app_version: str = "",
    screenshot_base64: Optional[str] = None,
) -> bool:
    """Send a feedback / bug report / feature request email to the operator.

    The ``from_email`` becomes the Reply-To so replies go back to the user.
    Tags (BUG/FEATURE) are included at the top and in the subject line.
    """
    tag_parts = []
    if is_bug:
        tag_parts.append("BUG")
    if is_feature:
        tag_parts.append("FEATURE")
    tag_prefix = f"[{' · '.join(tag_parts)}] " if tag_parts else ""
    email_subject = f"{tag_prefix}{subject}".strip()

    check_lines = []
    check_lines.append("[x] BUG REPORT" if is_bug else "[ ] Bug report")
    check_lines.append("[x] FEATURE REQUEST" if is_feature else "[ ] Feature request")
    header_block = "\n".join(check_lines)

    body_plain = (
        f"{header_block}\n"
        f"Platform: {platform or 'Unknown'}\n"
        f"App version: {app_version or 'Unknown'}\n"
        f"\n"
        f"Subject: {subject}\n"
        f"\n"
        f"Message:\n{message}\n"
        f"\n"
        f"---\n"
        f"Submitted by:\n"
        f"{from_name.strip() or '(no name)'}\n"
        f"{from_email.strip() or '(no email)'}\n"
    )

    bug_badge = '<span style="background:#DC2626;color:#fff;padding:3px 8px;border-radius:3px;font-size:11px;font-weight:900;letter-spacing:1px;margin-right:6px;">BUG</span>' if is_bug else ""
    feat_badge = '<span style="background:#F59E0B;color:#000;padding:3px 8px;border-radius:3px;font-size:11px;font-weight:900;letter-spacing:1px;margin-right:6px;">FEATURE</span>' if is_feature else ""
    body_html = f"""
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background:#f4f4f4; margin:0; padding:20px;">
  <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; padding:28px; border:1px solid #e5e5e5;">
    <div style="margin-bottom:12px;">{bug_badge}{feat_badge}</div>
    <h1 style="color:#0A0A0A; font-size:20px; margin:0 0 4px 0;">Toolbox Vault — Feedback</h1>
    <p style="color:#666; font-size:13px; margin:0 0 18px 0;">Platform: <strong>{platform or 'Unknown'}</strong> · App version: <strong>{app_version or 'Unknown'}</strong></p>
    <h2 style="color:#0A0A0A; font-size:16px; margin:16px 0 6px 0; font-weight:700;">{subject}</h2>
    <div style="color:#333; font-size:14px; line-height:1.6; white-space:pre-wrap; background:#fafafa; border-left:3px solid #F59E0B; padding:12px 14px; border-radius:4px;">{message}</div>
    <hr style="border:none; border-top:1px solid #eee; margin:24px 0 14px 0;" />
    <p style="color:#888; font-size:12px; margin:0;">Submitted by:<br/><strong style="color:#333;">{from_name.strip() or '(no name)'}</strong><br/>{from_email.strip() or '(no email)'}</p>
    <p style="color:#aaa; font-size:11px; margin:16px 0 0 0;">Reply to this email to respond directly to the user.</p>
  </div>
</body>
</html>
""".strip()

    return send_email(
        to_address,
        email_subject,
        body_plain,
        body_html,
        reply_to=from_email.strip() or None,
        cc=from_email.strip() or None,
        attachment_base64=screenshot_base64,
        attachment_filename="screenshot.png",
        attachment_mime="image/png",
    )
