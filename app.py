from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

app = FastAPI()

# Mount static files directory for CSS, JS, etc.
static_dir = Path("static")
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

@app.get("/")
async def read_root():
    """Serve the main HTML page"""
    html_file = static_dir / "index.html"
    return FileResponse(html_file)
