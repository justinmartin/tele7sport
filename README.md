# 📺 Télé7Sport

**Votre programme sportif personnalisé, chaque semaine dans votre boîte mail.**

Un bot qui envoie une newsletter hebdomadaire avec le programme de vos équipes et sports favoris : matchs à venir, chaînes TV, et résultats de la semaine passée. Style "Télé 7 Jours", mais pour le sport, et 100% personnalisé.

<p align="center">
  <img src="https://img.shields.io/badge/python-3.11-blue?style=flat-square&logo=python" alt="Python 3.11">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License">
  <img src="https://img.shields.io/badge/deploy-GitHub%20Actions-black?style=flat-square&logo=github" alt="GitHub Actions">
</p>

---

## ✨ Fonctionnalités

- 📅 **Programme jour par jour** — Vos matchs de la semaine, triés par jour et par sport
- 📺 **Chaînes TV** — Où regarder chaque match (Canal+, beIN, Eurosport, TF1…)
- ⭐ **Grandes rencontres** — Détection automatique des finales, demi-finales, playoffs
- 📊 **Résultats** — Récap des résultats de la semaine passée
- 🚴 **Multi-sport** — NBA, NFL, NCAAF, NCAAM, Ligue 1/2, Champions League, Top 14, Six Nations, Tennis Grand Chelem, Cyclisme, VTT…
- 🏆 **AP Top 25** — Suivi automatique des équipes classées AP en college football et basketball (mise à jour chaque semaine)
- 🌐 **Configurateur web** — Interface visuelle pour créer votre config ([tele7sport.vercel.app](https://tele7sport.vercel.app))
- 🤖 **100% automatique** — GitHub Actions envoie la newsletter chaque lundi matin

## 🏟️ Sports supportés

| Sport | Ligues / Compétitions |
|-------|----------------------|
| 🏀 Basketball | NBA, Betclic Élite |
| 🏈 Football US | NFL, NCAA Football (AP Top 25) |
| 🏀 College | NCAA Basketball (AP Top 25) |
| ⚽ Football | Ligue 1, Ligue 2, Champions League, Europa League, Conference League, Coupe de France, Ligue des Nations, Qualif. Coupe du Monde, **Coupe du Monde**, Euro, Amicaux |
| 🏉 Rugby | Top 14, Champions Cup, Challenge Cup, Six Nations, **Coupe du Monde** |
| 🎾 Tennis | Open d'Australie, Roland-Garros, Wimbledon, US Open (demi-finales + finales) |
| 🏅 Jeux Olympiques | Basketball (H/F), Football (H) |
| 🚴 Cyclisme | Grands Tours, Monuments, courses World Tour |
| 🚵 VTT | Coupe du Monde DH, Coupe du Monde Enduro |

## 📬 Exemple de newsletter

La newsletter arrive dans votre boîte mail avec :

```
📺 AU MENU CETTE SEMAINE
Semaine du 9 au 15 mars 2026

🌟 GRANDES RENCONTRES À NE PAS RATER
  ⚽ PSG vs Real Madrid — Mardi 11 mars, 21:00 — Canal+
  🏉 Toulouse vs Leinster — Samedi 15 mars, 16:00 — beIN Sports 2

📅 PROGRAMME JOUR PAR JOUR
  ── Lundi 9 mars ──
    🏀 NBA
      03:00  Lakers vs Celtics     beIN Sports 1
      01:30  Spurs vs Heat         NBA League Pass

  ── Mardi 10 mars ──
    ⚽ Ligue des Champions
      21:00  PSG vs Real Madrid    Canal+
    ...

📊 RÉSULTATS DE LA SEMAINE PASSÉE
  ✅ Lakers 118 - 105 Warriors
  ❌ Spurs 98 - 112 Nuggets
  ✅ MHSC 2 - 1 Caen
```

---

## 🚀 Installation rapide

### Option 1 : Fork GitHub (recommandé)

1. **Forkez** ce repo
2. Créez votre `favorites.json` :
   - 🌐 Utilisez le [configurateur web](https://tele7sport.vercel.app) pour générer votre config
   - Ou copiez `favorites.example.json` → `favorites.json` et modifiez-le
3. Allez dans **Settings → Secrets and variables → Actions** et ajoutez :

   | Secret | Description |
   |--------|-------------|
   | `EMAIL_USER` | Votre adresse Gmail |
   | `EMAIL_PASSWORD` | Votre [mot de passe d'application](https://myaccount.google.com/apppasswords) |
   | `EMAIL_TO` | Adresse destinataire |
   | `FAVORITES_JSON` | *(optionnel)* Le contenu JSON de vos favoris directement |
   | `TIMEZONE` | *(optionnel)* Fuseau horaire (défaut: `Europe/Paris`) |
   | `LANGUAGE` | *(optionnel)* `fr` ou `en` (défaut: `fr`) |

4. Activez **GitHub Actions** dans l'onglet Actions
5. La newsletter arrive chaque **lundi matin** ! 📬

### Option 2 : Exécution locale

```bash
# Cloner le repo
git clone https://github.com/YOUR_USERNAME/tele7sport.git
cd tele7sport

# Installer les dépendances
pip install -r requirements.txt

# Configurer
cp .env.example .env          # Éditer avec vos credentials
cp favorites.example.json favorites.json  # Personnaliser vos favoris

# Tester (sans envoyer d'email)
python run.py test

# Envoyer la newsletter
python run.py once
```

---

## ⚙️ Configuration

### `favorites.json`

Ce fichier définit vos sports, équipes et chaînes. Utilisez le [configurateur web](https://tele7sport.vercel.app) ou éditez-le manuellement :

```json
{
  "favorites": [
    {
      "league": "nba",
      "teams": ["Lakers", "Spurs"]
    },
    {
      "league": "ncaaf",
      "teams": "AP_RANKED"
    },
    {
      "league": "champions-league",
      "phases_only": ["QUARTERFINAL", "SEMIFINAL", "FINAL"]
    },
    {
      "league": "roland-garros",
      "rounds_only": ["SEMIFINAL", "FINAL"]
    },
    {
      "league": "cycling-road"
    }
  ],
  "channels": [
    "Canal+", "beIN Sports 1", "Eurosport 1", "TF1"
  ]
}
```

#### Options par ligue

| Champ | Description | Exemple |
|-------|-------------|---------|
| `league` | ID de la ligue (voir tableau ci-dessous) | `"nba"` |
| `teams` | *(optionnel)* Noms des équipes à suivre, ou `"AP_RANKED"` | `["Lakers", "France"]` ou `"AP_RANKED"` |
| `phases_only` | *(optionnel)* Ne montrer que certaines phases | `["SEMIFINAL", "FINAL"]` |
| `rounds_only` | *(optionnel)* Idem, pour le tennis | `["SEMIFINAL", "FINAL"]` |

#### AP Top 25 (NCAAF / NCAAM)

Pour le football et le basketball universitaire, utilisez `"teams": "AP_RANKED"` pour suivre automatiquement les 25 équipes classées au **AP Poll** :

```json
{ "league": "ncaaf", "teams": "AP_RANKED" }
```

Le classement est récupéré dynamiquement chaque semaine via l'API ESPN, donc votre newsletter reflète toujours le classement actuel.

#### IDs de ligues disponibles

<details>
<summary>Voir la liste complète</summary>

| ID | Label |
|----|-------|
| `nba` | NBA |
| `betclic-elite` | Betclic Élite |
| `nfl` | NFL |
| `ncaaf` | NCAA Football (AP Top 25) |
| `ncaam` | NCAA Basketball (AP Top 25) |
| `ligue-1` | Ligue 1 |
| `ligue-2` | Ligue 2 |
| `champions-league` | Ligue des Champions |
| `europa-league` | Europa League |
| `conference-league` | Conference League |
| `coupe-de-france` | Coupe de France |
| `nations-league` | Ligue des Nations |
| `world-cup-qual` | Qualif. Coupe du Monde |
| `euro` | Euro |
| `equipe-de-france-foot` | Matchs amicaux France |
| `world-cup` | Coupe du Monde FIFA |
| `jo-basket-m` | JO Basketball (Hommes) |
| `jo-basket-w` | JO Basketball (Femmes) |
| `jo-foot` | JO Football (Hommes) |
| `top-14` | Top 14 |
| `champions-cup-rugby` | Champions Cup Rugby |
| `challenge-cup-rugby` | Challenge Cup Rugby |
| `six-nations` | Six Nations |
| `rugby-world-cup` | Coupe du Monde Rugby |
| `australian-open` | Open d'Australie |
| `roland-garros` | Roland-Garros |
| `wimbledon` | Wimbledon |
| `us-open` | US Open |
| `cycling-road` | Cyclisme Route |
| `cycling-mtb-dh` | VTT Descente |
| `cycling-mtb-enduro` | VTT Enduro |

</details>

### Rechercher des noms d'équipes

Utilisez la CLI pour trouver les noms exacts :

```bash
# Rechercher dans la NBA
python run.py search basketball nba lakers

# Rechercher dans la Ligue 2
python run.py search soccer fra.2 montpellier

# Lister toutes les équipes du Top 14
python run.py search rugby 270559
```

---

## 📧 Configuration email (Gmail)

1. Activez la [vérification en 2 étapes](https://myaccount.google.com/security) sur votre compte Gmail
2. Créez un [mot de passe d'application](https://myaccount.google.com/apppasswords) :
   - Sélectionnez "Autre", nommez-le "Tele7Sport"
   - Copiez le mot de passe généré (16 caractères)
3. Utilisez ce mot de passe (pas votre mot de passe Gmail) dans `EMAIL_PASSWORD`

> **Autre fournisseur SMTP ?** Modifiez `MAIL_SMTP_HOST` et `MAIL_SMTP_PORT` dans `.env` :
> ```env
> MAIL_SMTP_HOST=smtp.outlook.com
> MAIL_SMTP_PORT=587
> ```

---

## 📺 Infos TV et chaînes

Le bot détermine les chaînes de diffusion de deux manières :

1. **Données ESPN** — Quand ESPN fournit les infos de diffusion (NBA sur beIN, matchs spécifiques sur Prime Video, etc.)
2. **Mapping par défaut** — Chaque ligue a des chaînes par défaut basées sur les droits TV français actuels

Le système croise ces infos avec **vos chaînes** (configurées dans `favorites.json`) pour ne vous montrer que ce que vous pouvez regarder.

### Mettre à jour les droits TV

Les droits TV changent par saison. Vous pouvez mettre à jour le mapping dans `src/config.py` sous `ESPN_LEAGUES` → `channels_fr`.

---

## 🏗️ Architecture

```
tele7sport/
├── src/
│   ├── fetchers/
│   │   ├── espn.py          # ESPN API (NBA, NFL, foot, rugby, tennis)
│   │   ├── rankings.py      # Classement AP Top 25 (NCAAF, NCAAM)
│   │   ├── cycling.py       # Calendrier cyclisme/VTT (PCS + statique)
│   │   └── tv_schedule.py   # Résolution des chaînes TV
│   ├── render/
│   │   └── newsletter.py    # Template HTML de la newsletter
│   ├── send/
│   │   └── mailer.py        # Envoi SMTP
│   ├── config.py            # Configuration & registre des ligues
│   └── main.py              # Orchestrateur principal
├── web/                     # Configurateur web (Vercel)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── .github/workflows/
│   └── weekly-newsletter.yml
├── favorites.example.json   # Exemple de configuration
├── run.py                   # Point d'entrée CLI
├── vercel.json              # Config Vercel (web)
└── requirements.txt
```

### Sources de données

| Source | Type | Données | Coût |
|--------|------|---------|------|
| ESPN API | REST (public) | Scores, calendrier, diffuseurs, classements AP | Gratuit |
| ProCyclingStats | Scraping | Calendrier cyclisme route | Gratuit |
| Calendrier statique | JSON local | VTT DH/Enduro, Grands Tours | Gratuit |

---

## 🔧 CLI

```bash
python run.py test           # Dry run — génère le HTML sans envoyer d'email
python run.py once           # Génère et envoie la newsletter
python run.py search <sport> <league> [query]  # Recherche d'équipes ESPN
```

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! Pour ajouter un nouveau sport ou une nouvelle ligue :

1. Ajoutez la ligue dans `src/config.py` → `ESPN_LEAGUES` (si ESPN la couvre)
2. Ou ajoutez un nouveau fetcher dans `src/fetchers/`
3. Ajoutez l'ID correspondant dans le configurateur web (`web/app.js`)
4. Testez avec `python run.py test`

---

## 📄 Licence

MIT — Faites-en ce que vous voulez ! 🎉
