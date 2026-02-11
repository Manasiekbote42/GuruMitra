from fastapi import APIRouter
from pathlib import Path

router = APIRouter()

@router.get("/debug/list_posture_outputs")
def list_posture_outputs():
    folder = Path(__file__).parent / "posture_outputs"
    abs_path = str(folder.resolve())
    if not folder.exists():
        return {"error": "posture_outputs directory does not exist", "abs_path": abs_path}
    files = [f.name for f in folder.iterdir() if f.is_file()]
    return {"files": files, "abs_path": abs_path}


@router.get("/debug/static_posture_outputs_path")
def static_posture_outputs_path():
    from main import POSTURE_OUTPUTS_DIR
    return {"POSTURE_OUTPUTS_DIR": POSTURE_OUTPUTS_DIR}
