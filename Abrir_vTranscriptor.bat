@echo off
echo Iniciando vTranscriptor con soporte de Google Drive...
REM Iniciar el servidor de desarrollo en segundo plano
start /b npm run dev
REM Esperar 3 segundos a que cargue Vite
timeout /t 3 /nobreak > nul
REM Iniciar la aplicacion (ventana + servidor backend)
.\backend\venv\Scripts\python.exe run_app.py
pause
