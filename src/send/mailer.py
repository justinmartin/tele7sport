import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from src.config import MAIL_SMTP_HOST, MAIL_SMTP_PORT, EMAIL_USER, EMAIL_PASSWORD, EMAIL_TO

logger = logging.getLogger("tele7sport")


def send_mail(html_body: str, subject: str):
    """Send the newsletter via SMTP."""
    if not EMAIL_USER or not EMAIL_PASSWORD:
        logger.warning("⚠️  SMTP not configured (EMAIL_USER/EMAIL_PASSWORD missing). Email not sent.")
        return
    if not EMAIL_TO:
        logger.warning("⚠️  EMAIL_TO not configured. Email not sent.")
        return

    recipients = [e.strip() for e in EMAIL_TO.split(",") if e.strip()]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = EMAIL_USER
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(MAIL_SMTP_HOST, MAIL_SMTP_PORT) as server:
            server.starttls()
            server.login(EMAIL_USER, EMAIL_PASSWORD)
            server.sendmail(EMAIL_USER, recipients, msg.as_string())
        logger.info("✅ Newsletter sent to %s", ", ".join(recipients))
    except smtplib.SMTPAuthenticationError as e:
        logger.error("SMTP auth failed: %s", e)
        raise
    except smtplib.SMTPException as e:
        logger.error("SMTP error: %s", e)
        raise
