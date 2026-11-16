"""Sonde de santé du worker : la boucle principale touche un fichier à chaque tour.

Le conteneur est jugé sain tant que ce fichier a moins de 20 secondes. Un worker qui ne parvient
pas à se connecter, ou dont la boucle est bloquée, devient malsain : `deploy.sh` le voit.
"""

import sys
import tempfile
import time
from pathlib import Path

# Dans le conteneur, le dossier temporaire est un tmpfs privé (infra/compose/staging.yml).
HEALTH_FILE = Path(tempfile.gettempdir()) / "trame-worker-alive"
MAX_SILENCE_SECONDS = 20


def mark_alive(path: Path) -> None:
    path.touch()


def is_alive(path: Path, max_silence_seconds: float) -> bool:
    try:
        last_beat = path.stat().st_mtime
    except FileNotFoundError:
        return False
    return time.time() - last_beat < max_silence_seconds


if __name__ == "__main__":
    sys.exit(0 if is_alive(HEALTH_FILE, MAX_SILENCE_SECONDS) else 1)
