import os
import json
import socket
from urllib.request import urlopen
import uvicorn
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8004"))
    workers = int(os.getenv("WORKERS", "1"))

    # Detect an existing server before Uvicorn attempts to bind the same port.
    # Never terminate an unknown process just to free the port.
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            try:
                with urlopen(f"http://127.0.0.1:{port}/health", timeout=2) as response:
                    health = json.loads(response.read().decode("utf-8"))
                if health.get("status") == "healthy" and "Mashal EMS" in health.get("service", ""):
                    print(f"Mashal EMS is already running at http://127.0.0.1:{port}.")
                    raise SystemExit(0)
            except SystemExit:
                raise
            except Exception:
                pass

            raise SystemExit(
                f"Port {port} is already in use by another service. "
                "Stop that service or set PORT to a free port, then try again."
            )
    except (ConnectionRefusedError, TimeoutError, OSError):
        # Nothing is listening on the port; continue with normal startup.
        pass
    
    print(f"🚀 Starting Mashal EMS Intelligence on http://{host}:{port}...")
    uvicorn.run(
        "backend.app.main:app",
        host=host,
        port=port,
        workers=workers,
        proxy_headers=True,
        forwarded_allow_ips="*"
    )

