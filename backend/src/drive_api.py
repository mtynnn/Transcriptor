import os
import json
import io
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaFileUpload

SCOPES = ['https://www.googleapis.com/auth/drive']

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CREDENTIALS_FILE = os.path.join(BASE_DIR, 'credentials.json')
TOKENS_DIR = os.path.join(BASE_DIR, 'drive_tokens')

if not os.path.exists(TOKENS_DIR):
    os.makedirs(TOKENS_DIR)

def get_credentials(account_name: str) -> Credentials:
    """Obtiene crendeciales para una cuenta específica."""
    token_path = os.path.join(TOKENS_DIR, f'token_{account_name}.json')
    creds = None
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDENTIALS_FILE):
                raise FileNotFoundError(f"¡Falta el archivo {CREDENTIALS_FILE}! Descárgalo de Google Cloud Console.")
            
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            # Port 0 means random available port, but for consistency we can use a fixed one or let it choose.
            creds = flow.run_local_server(port=0)
            
        with open(token_path, 'w') as token:
            token.write(creds.to_json())
            
    return creds

def list_accounts():
    """Lista las cuentas (tokens) actualmente guardadas."""
    accounts = []
    if os.path.exists(TOKENS_DIR):
        for file in os.listdir(TOKENS_DIR):
            if file.startswith('token_') and file.endswith('.json'):
                accounts.append(file.replace('token_', '').replace('.json', ''))
    return accounts

def get_drive_service(account_name: str):
    creds = get_credentials(account_name)
    return build('drive', 'v3', credentials=creds)

def list_files_in_folder(service, folder_id='root'):
    """Lista archivos y carpetas en un ID de Google Drive (o root por defecto)."""
    # Se filtran solo carpetas, audios que solemos usar y docs como pptx/pdf.
    query = f"'{folder_id}' in parents and trashed = false"
    # Campos que necesitamos para mostrarlo bonito en UI
    fields = "files(id, name, mimeType, size, iconLink)"
    
    results = service.files().list(
        q=query, 
        spaces='drive',
        fields=fields,
        pageSize=1000
    ).execute()
    
    return results.get('files', [])

def download_file(service, file_id: str, dest_path: str):
    """Descarga un archivo desde Drive a una ruta local."""
    request = service.files().get_media(fileId=file_id)
    fh = io.FileIO(dest_path, 'wb')
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while done is False:
        status, done = downloader.next_chunk()
    return dest_path

def upload_file(service, file_path: str, title: str, parent_folder_id: str = 'root'):
    """Sube un archivo de texto o docx a Drive."""
    file_metadata = {
        'name': title,
        'parents': [parent_folder_id]
    }
    
    mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' if file_path.endswith('.docx') else 'text/plain'
    
    media = MediaFileUpload(file_path, mimetype=mime_type, resumable=True)
    
    file = service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id'
    ).execute()
    
    return file.get('id')

def create_folder(service, folder_name: str, parent_folder_id: str = 'root'):
    """Crea una carpeta en Drive y retorna su ID. Si ya existe (nombre igual) retorna ese ID."""
    # Primero vemos si ya existe (búsqueda simple)
    query = f"name='{folder_name}' and '{parent_folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
    results = service.files().list(q=query, fields="files(id, name)").execute()
    files = results.get('files', [])
    if files:
        return files[0]['id']
        
    file_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder',
        'parents': [parent_folder_id]
    }
    file = service.files().create(body=file_metadata, fields='id').execute()
    return file.get('id')
