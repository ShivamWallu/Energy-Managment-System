import os
import uvicorn
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8004"))
    workers = int(os.getenv("WORKERS", "1"))
    
    print(f"🚀 Starting Mashal EMS Intelligence on http://{host}:{port}...")
    uvicorn.run(
        "backend.app.main:app",
        host=host,
        port=port,
        workers=workers,
        proxy_headers=True,
        forwarded_allow_ips="*"
    )

