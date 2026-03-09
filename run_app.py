import webview
import threading
import uvicorn
import os
import sys

# Añadir el backend/src al path
backend_path = os.path.join(os.path.dirname(__file__), 'backend', 'src')
if backend_path not in sys.path:
    sys.path.append(backend_path)

from main import app

def run_backend():
    # Inicia la API de FastAPI en el puerto 8000
    uvicorn.run(app, host="127.0.0.1", port=8000)

class Api:
    def open_file_dialog(self, title, file_types_str):
        """Abre el explorador de archivos nativo para obtener la ruta absoluta real."""
        # pywebview en Windows espera una lista de strings de filtros
        # Ejemplo: ["Audio files (*.mp3;*.wav)", "*.pdf;*.docx"]
        filters = [file_types_str]
        result = window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=False, file_types=filters)
        return result[0] if (result and len(result) > 0) else None

if __name__ == '__main__':
    # Hilo para que el servidor de FastAPI corra al mismo tiempo que la ventana
    t = threading.Thread(target=run_backend, daemon=True)
    t.start()

    api = Api()
    # Lanzar la ventana nativa
    window = webview.create_window(
        'vTranscriptor - AI Veterinaria Local', 
        'http://localhost:1420', # URL servidor de desarrollo Vite
        width=1200,
        height=850,
        resizable=True,
        js_api=api,
        background_color='#0a0a0c'
    )
    webview.start()
