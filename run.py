#!/usr/bin/env python3
"""
Télé7Sport — CLI entry point.

Usage:
    python run.py test           # Dry run (no email sent), saves HTML to out/
    python run.py once           # Run once and send email
    python run.py search <sport> <league> [query]  # Search ESPN teams
"""
import sys
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("tele7sport")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "test":
        from src.main import run
        run(dry_run=True)

    elif command == "once":
        from src.main import run
        run(dry_run=False)

    elif command == "search":
        if len(sys.argv) < 4:
            print("Usage: python run.py search <sport> <league> [query]")
            print("Example: python run.py search soccer fra.2 montpellier")
            print("Example: python run.py search basketball nba")
            sys.exit(1)
        from src.fetchers.espn import search_teams
        sport = sys.argv[2]
        league = sys.argv[3]
        query = sys.argv[4] if len(sys.argv) > 4 else ""
        teams = search_teams(sport, league, query)
        if not teams:
            print(f"No teams found for {sport}/{league}" + (f" matching '{query}'" if query else ""))
        else:
            print(f"\n{'ID':<8} {'Abbr':<8} {'Name'}")
            print("-" * 50)
            for t in teams:
                print(f"{t['id']:<8} {t['abbreviation']:<8} {t['name']}")
            print(f"\n{len(teams)} team(s) found.")

    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
