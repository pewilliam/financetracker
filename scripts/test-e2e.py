"""Run browser regression against the built frontend and a disposable SQLite database."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen


root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="kashy-e2e-") as temporary:
    scratch = Path(temporary)
    env = os.environ | {
        "APP_ENV": "test",
        "JWT_SECRET_KEY": "local-browser-regression-key-never-used-in-production-2026",
        "DATABASE_URL": f"sqlite:///{scratch / 'regression.db'}",
        "KASHY_API_PROXY_TARGET": "http://127.0.0.1:8010",
        "KASHY_E2E_API_URL": "http://127.0.0.1:8010/api",
        "KASHY_E2E_WEB_URL": "http://127.0.0.1:4173",
    }
    subprocess.run([sys.executable, "-c", "from app.database import Base, engine; from app import models; Base.metadata.create_all(engine)"], cwd=root / "backend", env=env, check=True)
    processes = []
    logs = []
    try:
        for command, cwd, name in [
            ([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8010"], root / "backend", "api"),
            (["node", "node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], root / "frontend", "web"),
        ]:
            log = open(scratch / f"{name}.log", "w")
            logs.append(log)
            processes.append(subprocess.Popen(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT))
        for attempt in range(100):
            if any(process.poll() is not None for process in processes):
                raise RuntimeError("A regression server stopped during startup")
            try:
                for url in (env["KASHY_E2E_API_URL"] + "/health", env["KASHY_E2E_WEB_URL"]):
                    with urlopen(url, timeout=1):
                        pass
                break
            except OSError:
                time.sleep(0.1)
        else:
            raise RuntimeError("Regression servers did not become ready")
        subprocess.run(["npm", "run", "test:e2e"], cwd=root / "frontend", env=env, check=True, timeout=300)
    except Exception:
        for log in logs:
            log.flush()
            print(Path(log.name).read_text()[-6000:], file=sys.stderr)
        raise
    finally:
        for process in processes:
            process.terminate()
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        for log in logs:
            log.close()
