import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.app.config import settings
from backend.app.database import engine, Base
from backend.app.seed import seed_database
from backend.app.routers import auth_router, upload_router, analytics_router, export_router, activity_router, accounts_router

# Ensure DB schema and default data are ready
Base.metadata.create_all(bind=engine)
try:
    seed_database()
except Exception as e:
    print(f"Seed note: {e}")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="EMS Intelligence — Enterprise Energy Management System & SCADA Analytics Engine",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth_router.router, prefix=settings.API_V1_PREFIX)
app.include_router(upload_router.router, prefix=settings.API_V1_PREFIX)
app.include_router(analytics_router.router, prefix=settings.API_V1_PREFIX)
app.include_router(export_router.router, prefix=settings.API_V1_PREFIX)
app.include_router(activity_router.router, prefix=settings.API_V1_PREFIX)
app.include_router(accounts_router.router, prefix=settings.API_V1_PREFIX)

# Performance & Asset Caching Middleware (2X faster loading for static images & assets)
@app.middleware("http")
async def add_cache_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if any(path.startswith(prefix) for prefix in ["/img/", "/Images/", "/images/"]):
        response.headers["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=43200"
    elif any(path.startswith(prefix) for prefix in ["/css/", "/js/"]):
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION
    }

# Mount Frontend Static Assets
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))
images_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Images"))

if os.path.exists(images_dir):
    app.mount("/Images", StaticFiles(directory=images_dir), name="Images")
    app.mount("/images", StaticFiles(directory=images_dir), name="images")

if os.path.exists(frontend_dir):
    # Mount css, js, img subdirectories
    css_dir = os.path.join(frontend_dir, "css")
    js_dir = os.path.join(frontend_dir, "js")
    img_dir = os.path.join(frontend_dir, "img")
    if os.path.exists(css_dir):
        app.mount("/css", StaticFiles(directory=css_dir), name="css")
    if os.path.exists(js_dir):
        app.mount("/js", StaticFiles(directory=js_dir), name="js")
    if os.path.exists(img_dir):
        app.mount("/img", StaticFiles(directory=img_dir), name="img")

    # Serve index.html as root
    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(frontend_dir, "index.html"))

    # Catch-all for SPA client routing
    @app.get("/{catchall:path}")
    async def serve_spa(catchall: str):
        if catchall.startswith("api/") or catchall.startswith("api"):
            raise HTTPException(status_code=404, detail="API route not found")
        # If file exists in frontend, serve it
        target = os.path.join(frontend_dir, catchall)
        if os.path.isfile(target):
            return FileResponse(target)
        return FileResponse(os.path.join(frontend_dir, "index.html"))
