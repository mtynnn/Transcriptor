from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import os
import sys
import json
from datetime import datetime

# Configuración de carpetas de datos (Persistencia en AppData)
if os.name == 'nt': # Windows
    base_data_dir = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'vTranscriptor')
else:
    base_data_dir = os.path.expanduser('~/.vtranscriptor')

if not os.path.exists(base_data_dir):
    os.makedirs(base_data_dir)

HISTORY_FILE = os.path.join(base_data_dir, "history.json")
SETTINGS_FILE = os.path.join(base_data_dir, "settings.json")

# Importar lógica local
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from transcriber import AudioTranscriber
from context_extractor import get_whisper_initial_prompt
import drive_api

app = FastAPI(title="vTranscriptor API")

# Asegurar que uvicorn use el puerto y host correcto para Tauri
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000

# Persistence Utils
def get_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return []
    return []

def save_history(entry):
    history = get_history()
    history.insert(0, entry)
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history[:50], f, ensure_ascii=False, indent=2)

def get_settings():
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {"default_model": "base", "auto_save": True, "theme": "dark"}

def save_settings(settings):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Transcriber Instance
_transcriber_instance = None
current_progress = 0

def update_progress(val):
    global current_progress
    current_progress = val

# Models
class TranscriptionRequest(BaseModel):
    audio_path: str
    context_path: str = None
    model_size: str = "base"
    title: str = "Sin Título"
    category: str = "General"
    custom_date: str = None

class ExportRequest(BaseModel):
    text: str
    format: str 
    filename: str = "transcripcion"
    category: str = "General"

class DriveListRequest(BaseModel):
    account_name: str
    folder_id: str = 'root'

class DriveDownloadRequest(BaseModel):
    account_name: str
    file_id: str
    filename: str

class DriveUploadRequest(BaseModel):
    account_name: str
    file_path: str
    title: str
    category: str

# Endpoints
@app.get("/")
def read_root():
    return {"status": "ok", "app": "vTranscriptor"}

@app.get("/progress")
def get_prog():
    return {"progress": current_progress}

@app.get("/history")
async def fetch_history():
    print("API: Solicitud de historial recibida")
    return get_history()

@app.get("/settings")
async def fetch_settings():
    return get_settings()

@app.post("/settings")
async def update_settings(settings: dict):
    save_settings(settings)
    return {"status": "ok"}

@app.get("/stream-audio")
async def stream_audio(path: str = Query(...)):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(path)

@app.post("/export")
def export_file(request: ExportRequest):
    global _transcriber_instance
    try:
        # Carpeta base: Documents/vTranscriptor/Categoria
        base_path = os.path.join(os.path.expanduser("~"), "Documents", "vTranscriptor")
        category_path = os.path.join(base_path, request.category)
        
        if not os.path.exists(category_path):
            os.makedirs(category_path)

        file_ext = ".docx" if request.format == "docx" else ".txt"
        output_path = os.path.join(category_path, request.filename + file_ext)

        # Usar instancia global o crear una temporal si no existe
        temp_transcriber = _transcriber_instance or AudioTranscriber(model_size="tiny")
        
        if request.format == "docx":
            temp_transcriber.save_as_docx(request.text, output_path)
        else:
            temp_transcriber.save_as_txt(request.text, output_path)

        return {"path": output_path, "success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/transcribe")
def transcribe_audio(request: TranscriptionRequest):
    global _transcriber_instance, current_progress
    
    if not os.path.exists(request.audio_path):
        raise HTTPException(status_code=400, detail="Archivo de audio no encontrado")
    
    try:
        current_progress = 0
        
        # Singleton de transcripción para no recargar modelo en memoria innecesariamente
        if _transcriber_instance is None or _transcriber_instance.model_size != request.model_size:
            print(f"API: Cargando modelo {request.model_size}...")
            _transcriber_instance = AudioTranscriber(model_size=request.model_size)
        
        prompt = ""
        if request.context_path and os.path.exists(request.context_path):
            prompt = get_whisper_initial_prompt(request.context_path)
        
        segments = _transcriber_instance.transcribe(
            request.audio_path, 
            initial_prompt=prompt if prompt else None,
            progress_callback=update_progress
        )
        
        text_result = _transcriber_instance.format_to_fluid_paragraphs(segments)

        # Registro en Historial con Metadatos
        save_history({
            "date": request.custom_date or datetime.now().strftime("%Y-%m-%d %H:%M"),
            "real_date": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "title": request.title,
            "category": request.category,
            "audio": os.path.basename(request.audio_path),
            "text": text_result[:200] + "...",
            "full_text": text_result
        })

        # Autoguardado de seguridad
        try:
             _transcriber_instance.save_as_txt(text_result, request.audio_path + ".txt")
        except:
            pass
        
        return {"text": text_result, "success": True}
    except Exception as e:
        current_progress = 0
        print(f"API Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ================================
# GOOGLE DRIVE ENDPOINTS
# ================================

@app.get("/drive/accounts")
def get_drive_accounts():
    try:
        accounts = drive_api.list_accounts()
        return {"accounts": accounts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/drive/auth")
def auth_drive_account(account_name: str = Query(...)):
    try:
        # Esto abrirá el navegador en la PC donde corre el servidor (la tuya)
        creds = drive_api.get_credentials(account_name)
        if creds and creds.valid:
            return {"success": True, "message": f"Cuenta {account_name} vinculada con éxito"}
        raise HTTPException(status_code=400, detail="Fallo en la autenticación")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/drive/list")
def list_drive_folder(req: DriveListRequest):
    try:
        service = drive_api.get_drive_service(req.account_name)
        files = drive_api.list_files_in_folder(service, req.folder_id)
        return {"files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/drive/download")
def download_drive_file(req: DriveDownloadRequest):
    try:
        service = drive_api.get_drive_service(req.account_name)
        # Bajar a carpeta temporal local
        temp_dir = os.path.join(current_dir, "temp_downloads")
        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)
        
        dest_path = os.path.join(temp_dir, req.filename)
        out_path = drive_api.download_file(service, req.file_id, dest_path)
        return {"local_path": out_path, "success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/drive/upload")
def upload_drive_file(req: DriveUploadRequest):
    try:
        service = drive_api.get_drive_service(req.account_name)
        # 1. Crear o buscar carpeta base
        base_folder_id = drive_api.create_folder(service, "vTranscriptor", "root")
        
        # 2. Crear o buscar carpeta de categoría
        cat_folder_id = drive_api.create_folder(service, req.category, base_folder_id)
        
        # 3. Subir el archivo ahí
        file_id = drive_api.upload_file(service, req.file_path, req.title, cat_folder_id)
        
        return {"file_id": file_id, "success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    print("BACKEND: Iniciando servidor en puerto 8000...")
    uvicorn.run(app, host="127.0.0.1", port=8000)
