"""Mail d'alerte quand le workflow échoue (bibliothèque standard uniquement :
fonctionne même si l'installation des dépendances a planté)."""
import os
import smtplib
from email.mime.text import MIMEText

run_url = f"{os.environ['GITHUB_SERVER_URL']}/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
msg = MIMEText(
    "Le run hebdo du Télé7Sport a échoué, aucune newsletter n'a été envoyée.\n\n"
    f"Logs : {run_url}\n",
    "plain", "utf-8",
)
msg["Subject"] = "❌ Télé7Sport : échec du run"
msg["From"] = os.environ["EMAIL_USER"]
msg["To"] = os.environ["EMAIL_TO"]

with smtplib.SMTP("smtp.gmail.com", 587) as server:
    server.starttls()
    server.login(os.environ["EMAIL_USER"], os.environ["EMAIL_PASSWORD"])
    server.sendmail(msg["From"], [r.strip() for r in msg["To"].split(",")], msg.as_string())
print(f"Alerte envoyée à {msg['To']}")
