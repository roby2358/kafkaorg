from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.requests import Request
from pathlib import Path
from sqlalchemy.orm import Session
from pydantic import BaseModel
import asyncio

from kafkaorg.db import init_db, get_db
from kafkaorg.models import User


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database schema on startup"""
    # Run synchronous init_db in executor
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, init_db)
    yield
    # Cleanup if needed


app = FastAPI(lifespan=lifespan)

# Mount static files directory for CSS, JS, etc.
static_dir = Path("static")
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/")
async def read_root():
    """Serve the main HTML page"""
    html_file = static_dir / "index.html"
    return FileResponse(html_file)


@app.get("/signup")
async def signup_page():
    """Serve the signup page"""
    html_file = static_dir / "signup.html"
    return FileResponse(html_file)


class SignInRequest(BaseModel):
    username: str


class SignUpRequest(BaseModel):
    username: str
    name: str


@app.post("/api/signin")
async def signin(request: SignInRequest, db: Session = Depends(get_db)):
    """Look up user by username"""
    user = db.query(User).filter(User.username == request.username).first()
    
    if not user:
        return {"found": False}
    
    return {
        "found": True,
        "user": {
            "id": user.id,
            "username": user.username,
            "name": user.name,
            "created": user.created.isoformat() if user.created else None,
            "updated": user.updated.isoformat() if user.updated else None,
        }
    }


@app.post("/api/signup")
async def signup(request: SignUpRequest, db: Session = Depends(get_db)):
    """Create a new user"""
    existing_user = db.query(User).filter(User.username == request.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    new_user = User(username=request.username, name=request.name)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "name": new_user.name,
            "created": new_user.created.isoformat() if new_user.created else None,
            "updated": new_user.updated.isoformat() if new_user.updated else None,
        }
    }
