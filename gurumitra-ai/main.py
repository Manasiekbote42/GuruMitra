"""
GuruMitra AI microservice: analyzes classroom video/audio and returns deterministic feedback.
Call from Node backend per new upload. Same video -> same metrics -> same feedback.
Load .env first and set ffmpeg path before pydub is used.
"""
from pathlib import Path
from typing import Optional
import os

# Load .env from gurumitra-ai directory
_env_dir = Path(__file__).resolve().parent
_env_file = _env_dir / ".env"
if _env_file.is_file():
    from dotenv import load_dotenv
    load_dotenv(_env_file)

# Add ffmpeg to PATH *before* pydub is ever imported (so pydub finds it and no 500s)
def _setup_ffmpeg():
    ffmpeg = (os.environ.get("FFMPEG_PATH") or "").strip()
    if not ffmpeg and os.name == "nt":
        base = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Packages")
        if os.path.isdir(base):
            for name in os.listdir(base):
                if "ffmpeg" not in name.lower() and "Gyan" not in name:
                    continue
                p = os.path.join(base, name)
                if not os.path.isdir(p):
                    continue
                for sub in os.listdir(p):
                    exe = os.path.join(p, sub, "bin", "ffmpeg.exe")
                    if os.path.isfile(exe):
                        ffmpeg = exe
                        break
                if ffmpeg:
                    break
    if ffmpeg and os.path.isfile(ffmpeg):
        bin_dir = os.path.dirname(ffmpeg)
        path_sep = ";" if os.name == "nt" else ":"
        old_path = os.environ.get("PATH", "")
        if bin_dir not in old_path.split(path_sep):
            os.environ["PATH"] = bin_dir + path_sep + old_path

_setup_ffmpeg()

import tempfile
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydub import AudioSegment

from analyzer import download_video_or_youtube, run_analysis


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # cleanup if needed


app = FastAPI(title="GuruMitra AI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "gurumitra-ai"}


@app.post("/analyze")
def analyze(video_url: str = Body(..., embed=True), session_id: Optional[str] = Body(None, embed=True)):
    """
    Analyze video. JSON body: { "video_url": "https://...", "session_id": "optional-uuid" }.
    Runs Whisper transcription + audio metrics + teaching-content analysis; returns session-level JSON.
    Empty transcript returns warning and no scores.
    """
    path = None
    url = (video_url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="video_url is required")
    try:
        path = download_video_or_youtube(url)
        result = run_analysis(path, session_id=session_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e)
        if "WinError 2" in err_msg or "cannot find the file specified" in err_msg:
            raise HTTPException(
                status_code=500,
                detail="ffmpeg not found. Install ffmpeg and add it to your system PATH, or set FFMPEG_PATH in gurumitra-ai/.env",
            )
        raise HTTPException(status_code=500, detail=err_msg)
    finally:
        if path and os.path.isfile(path):
            try:
                os.unlink(path)
            except Exception:
                pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
