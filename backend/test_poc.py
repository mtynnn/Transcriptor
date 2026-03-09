import os
import sys

# Configurar el path para importar desde la carpeta 'src'
current_dir = os.path.dirname(os.path.abspath(__file__))
src_path = os.path.join(current_dir, "src")
sys.path.append(src_path)

from transcriber import AudioTranscriber
from context_extractor import get_whisper_initial_prompt

def main():
    print("--- vTranscriptor PoC (Prueba de Concepto CLI) ---")
    
    audio_path = input("Ruta del archivo de audio (WAV, MP3, etc): ").strip()
    ppt_path = input("Ruta del archivo PPT/PPTX (opcional, enter para omitir): ").strip()
    
    if not os.path.exists(audio_path):
        print("Error: Audio no encontrado.")
        return

    prompt = ""
    if ppt_path and os.path.exists(ppt_path):
        print("\n[+] Extrayendo contexto del archivo PPT...")
        prompt = get_whisper_initial_prompt(ppt_path)
        print(f"[+] Contexto extraído ({len(prompt.split(','))} keywords).")
        print(f"    Prompt generado: {prompt[:100]}...\n")
    
    transcriber = AudioTranscriber(model_size="base", compute_type="int8", device="cpu")
    
    print("\n[+] Procesando audio, por favor espera...")
    segments = transcriber.transcribe(audio_path, initial_prompt=prompt if prompt else None)
    
    print("\n[+] Transcripción finalizada, formateando a párrafos...\n")
    text_result = transcriber.format_to_fluid_paragraphs(segments)
    
    print("================ RESULTADO ================")
    print(text_result)
    print("===========================================")
    
    # Guardar en archivo
    output_file = audio_path + "_transcripcion.txt"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(text_result)
    print(f"\n[+] Resultado guardado en {output_file}")


if __name__ == "__main__":
    main()
