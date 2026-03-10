import React, { useState, useEffect } from "react";
import {
  FileAudio,
  FileText,
  Upload,
  Play,
  Download,
  Settings,
  Stethoscope,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  History as HistoryIcon,
  Activity,
  Maximize2,
  Moon,
  Sun,
  Palette,
  ClipboardCheck,
  Clipboard,
  Clock,
  ChevronDown,
  Calendar,
  Library,
  ChevronLeft,
  ChevronRight,
  Save,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Helper for classes (Vanilla style)
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Declare pywebview and Tauri interface for TypeScript
declare global {
  interface Window {
    __TAURI_INTERNALS__?: any;
    pywebview: {
      api: {
        open_file_dialog: (
          title: string,
          fileTypes: string,
        ) => Promise<string | null>;
      };
    };
  }
}

export default function App() {
  const [activeStep, setActiveStep] = useState(1); // 1: Upload, 2: Transcribing, 3: Editor
  const [activeHistoryItem, setActiveHistoryItem] = useState<any>(null);
  const [audioPath, setAudioPath] = useState<string>("");
  const [contextPath, setContextPath] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [quality, setQuality] = useState("base");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [deviceInfo, setDeviceInfo] = useState("Detectando hardware...");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("vtranscriptor_theme") || "dark",
  ); // persistencia local inmediata
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [transcriptionTitle, setTranscriptionTitle] = useState(
    "Nueva Transcripción",
  );
  const [category, setCategory] = useState("General");
  const [availableCategories, setAvailableCategories] = useState<string[]>([
    "General",
  ]);
  const [customDate, setCustomDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);

  // Library States
  const [selectedLibraryCategory, setSelectedLibraryCategory] =
    useState<string>("General");
  const [libraryMonth, setLibraryMonth] = useState<number>(
    new Date().getMonth(),
  );
  const [libraryYear, setLibraryYear] = useState<number>(
    new Date().getFullYear(),
  );
  const [selectedLibraryDay, setSelectedLibraryDay] = useState<number | null>(
    null,
  );
  const [isLibraryCategoryDropdownOpen, setIsLibraryCategoryDropdownOpen] =
    useState(false);

  // Google Drive States
  const [driveAccounts, setDriveAccounts] = useState<string[]>([]);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [driveCurrentFolderId, setDriveCurrentFolderId] = useState("root");
  const [driveBreadcrumbs, setDriveBreadcrumbs] = useState<any[]>([
    { id: "root", name: "Mi Unidad" },
  ]);
  const [selectedDriveAccount, setSelectedDriveAccount] = useState("");
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [driveTargetType, setDriveTargetType] = useState<"audio" | "context">(
    "audio",
  );
  const [isLinkingAccount, setIsLinkingAccount] = useState(false);
  const [driveError, setDriveError] = useState("");
  const [showAccountNamePrompt, setShowAccountNamePrompt] = useState(false);
  const [accountNameInput, setAccountNameInput] = useState("");

  // Auto-updater: chequear updates al iniciar la app
  useEffect(() => {
    const checkForUpdates = async () => {
      if (!window.__TAURI_INTERNALS__) return;
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const { ask } = await import("@tauri-apps/plugin-dialog");
        const update = await check();
        if (update?.available) {
          const yes = await ask(
            `¡Nueva versión disponible! (${update.version})\n¿Querés instalar la actualización ahora?`,
            { title: "Actualización disponible", kind: "info" },
          );
          if (yes) {
            await update.downloadAndInstall();
            const { relaunch } = await import("@tauri-apps/plugin-process");
            await relaunch();
          }
        }
      } catch (e) {
        console.error("Error al chequear updates:", e);
      }
    };
    checkForUpdates();
  }, []);

  // Drag & Drop con rutas reales (Tauri 2.0)
  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;
    let unlisten: (() => void) | null = null;
    const setupFileDrop = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlisten = await win.onDragDropEvent((event) => {
          if (event.payload.type === "drop") {
            const paths: string[] = event.payload.paths;
            if (paths.length === 0) return;
            const firstPath = paths[0];
            const ext = firstPath.split(".").pop()?.toLowerCase() || "";
            const audioExts = [
              "mp3",
              "wav",
              "m4a",
              "ogg",
              "flac",
              "mp4",
              "webm",
            ];
            const docExts = ["pdf", "docx", "txt", "doc"];
            if (audioExts.includes(ext)) {
              setAudioPath(firstPath);
            } else if (docExts.includes(ext)) {
              setContextPath(firstPath);
            }
          }
        });
      } catch (e) {
        console.error("Error al configurar drag&drop:", e);
      }
    };
    setupFileDrop();
    return () => {
      unlisten?.();
    };
  }, []);

  // 1. Cargar persistencia al iniciar
  useEffect(() => {
    const waitForBackend = async (
      retries = 20,
      delayMs = 1500,
    ): Promise<boolean> => {
      for (let i = 0; i < retries; i++) {
        try {
          const res = await fetch("http://localhost:8000/", {
            signal: AbortSignal.timeout(1000),
          });
          if (res.ok) return true;
        } catch (_) {
          /* backend no listo */
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
      return false;
    };

    const startBackend = async () => {
      if (window.__TAURI_INTERNALS__) {
        try {
          const { Command } = await import("@tauri-apps/plugin-shell");
          const command = Command.sidecar("vtranscriptor-engine");
          const child = await command.spawn();
          console.log("Backend Sidecar iniciado PID:", child.pid);

          window.addEventListener("beforeunload", () => {
            child.kill();
          });
        } catch (e) {
          console.error("Fallo al iniciar el motor sidecar:", e);
        }
      }
    };

    const init = async () => {
      await startBackend();
      // Esperar que el backend responda (hasta 30seg) antes de cargar settings
      // Esperar que el backend responda (hasta 15seg) antes de cargar settings
      const ready = await waitForBackend(10, 1500);
      if (!ready) {
        console.error("Backend no respondió después del tiempo de espera.");
        setDeviceInfo("Motor no iniciado");
        return;
      }

      // Obtener info del dispositivo desde el root del backend (con timeout)
      try {
        const rootRes = await fetch("http://localhost:8000/", {
          signal: AbortSignal.timeout(2000),
        });
        const rootData = await rootRes.json();
        if (rootData.device) setDeviceInfo(rootData.device);
      } catch (e) {
        setDeviceInfo("Procesador (CPU)");
      }

      await loadPersistedSettings();
      fetchDriveAccounts();
    };

    const loadPersistedSettings = async () => {
      try {
        const res = await fetch("http://localhost:8000/settings");
        const data = await res.json();
        if (data.theme) setTheme(data.theme);
        if (data.default_model) setQuality(data.default_model);

        // También cargar categorías únicas del historial
        const histRes = await fetch("http://localhost:8000/history");
        const histData = await histRes.json();
        if (histData && Array.isArray(histData)) {
          setHistoryItems(histData);
          const cats = Array.from(
            new Set(histData.map((h: any) => h.category || "General")),
          );
          if (cats.length > 0)
            setAvailableCategories((prev) =>
              Array.from(new Set([...prev, ...(cats as string[])])),
            );
        }
      } catch (e) {
        console.error("Error al cargar ajustes:", e);
      }
    };
    init();
  }, []);

  const fetchDriveAccounts = async () => {
    try {
      const res = await fetch("http://localhost:8000/drive/accounts");
      const data = await res.json();
      if (data.accounts) {
        setDriveAccounts(data.accounts);
        if (data.accounts.length > 0 && !selectedDriveAccount) {
          setSelectedDriveAccount(data.accounts[0]);
        }
      }
    } catch (e) {
      console.error("Error fetching drive accounts:", e);
    }
  };

  // 2. Guardar persistencia ante cambios (localStorage inmediato + backend)
  useEffect(() => {
    // Guardar en localStorage inmediatamente (disponible sin backend)
    localStorage.setItem("vtranscriptor_theme", theme);
    const syncSettings = async () => {
      try {
        await fetch("http://localhost:8000/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            theme: theme,
            default_model: quality,
            auto_save: true,
          }),
        });
      } catch (e) {
        /* Silently fail background sync */
      }
    };
    syncSettings();
  }, [theme, quality]);

  // Recargar historial al entrar a la biblioteca
  useEffect(() => {
    if (activeStep === 4) {
      const fetchHistory = async () => {
        try {
          const res = await fetch("http://localhost:8000/history");
          const data = await res.json();
          setHistoryItems(data);
          // Auto-seleccionamos la categoría actual en la biblioteca si existe
          if (availableCategories.includes(category)) {
            setSelectedLibraryCategory(category);
          }
        } catch (e) {
          console.error("Error loading history:", e);
        }
      };
      fetchHistory();
    }
  }, [activeStep, category, availableCategories]);

  // Real transcription process
  const startTranscription = async () => {
    if (!audioPath) return;
    setIsProcessing(true);
    setActiveStep(2);
    setProgress(0);
    setErrorMsg("");

    try {
      // PROGRESO REAL: Polling al backend cada segundo
      const progressInterval = setInterval(async () => {
        try {
          const res = await fetch("http://localhost:8000/progress");
          const data = await res.json();
          setProgress(data.progress || 0);
        } catch (e) {
          console.error("Error polling progress:", e);
        }
      }, 1000);

      const response = await fetch("http://localhost:8000/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_path: audioPath,
          context_path: contextPath,
          model_size: quality,
          title: transcriptionTitle,
          category: category,
          custom_date: customDate,
        }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Fallo en la transcripción");
      }

      const data = await response.json();
      setProgress(100);
      setTranscription(data.text);
      if (data.history_item) setActiveHistoryItem(data.history_item);
      setIsProcessing(false);
      setActiveStep(3);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "Error desconocido");
      setIsProcessing(false);
      setActiveStep(1);
    }
  };

  const reloadHistory = async () => {
    try {
      const res = await fetch("http://localhost:8000/history");
      const data = await res.json();
      if (data && Array.isArray(data)) {
        setHistoryItems(data);
        const cats = Array.from(
          new Set(data.map((h: any) => h.category || "General")),
        );
        if (cats.length > 0)
          setAvailableCategories((prev) =>
            Array.from(new Set([...prev, ...(cats as string[])])),
          );
      }
    } catch (e) {
      console.error("Error reloading history:", e);
    }
  };

  const handleSaveTranscription = async () => {
    if (!activeHistoryItem) return;
    try {
      setSaveStatus("Guardando cambios...");
      const res = await fetch("http://localhost:8000/history/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          real_date: activeHistoryItem.real_date,
          title: activeHistoryItem.title,
          new_text: transcription
        })
      });
      if (res.ok) {
        setSaveStatus("Cambios guardados");
        setTimeout(() => setSaveStatus(""), 2000);
        
        // Actualizamos el activeHistoryItem actual con el texto nuevo
        setActiveHistoryItem({ ...activeHistoryItem, full_text: transcription });
        await reloadHistory();
      }
    } catch (e) {
      console.error(e);
      setSaveStatus("Error al guardar");
      setTimeout(() => setSaveStatus(""), 2000);
    }
  };

  const handleDeleteHistoryItem = async (e: any, item: any) => {
    e.stopPropagation(); // Evitar que abra el editor
    if (!confirm(`¿Eliminar la transcripción "${item.title || "Sin Título"}" de manera permanente?`)) return;
    try {
      await fetch("http://localhost:8000/history/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          real_date: item.real_date,
          title: item.title
        })
      });
      if (activeHistoryItem && activeHistoryItem.real_date === item.real_date && activeHistoryItem.title === item.title) {
        // Cerramos si estamos editando el item que se borra
        setActiveStep(1);
        setActiveHistoryItem(null);
      }
      await reloadHistory();
    } catch (err) {
      console.error(err);
    }
  };

  const deleteCategory = (catToDelete: string) => {
    if (catToDelete === "General") return;
    setAvailableCategories((prev) => prev.filter((c) => c !== catToDelete));
    if (category === catToDelete) setCategory("General");
  };

  const handleExport = async (format: "txt" | "docx") => {
    try {
      setSaveStatus(`Guardando ${format.toUpperCase()}...`);
      const response = await fetch("http://localhost:8000/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: transcription,
          format: format,
          filename: transcriptionTitle || "transcripcion",
          category: category,
        }),
      });

      if (!response.ok) throw new Error("Error al exportar");

      await response.json();
      setSaveStatus(`¡Guardado en Documentos!`);
      setTimeout(() => setSaveStatus(""), 4000);
    } catch (e) {
      setSaveStatus("Error al guardar");
      setTimeout(() => setSaveStatus(""), 3000);
    }
  };

  const handleOpenAudio = async () => {
    if (window.__TAURI_INTERNALS__) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          multiple: false,
          filters: [
            { name: "Audio", extensions: ["mp3", "wav", "m4a", "flac"] },
          ],
        });
        if (selected) setAudioPath(selected as string);
      } catch (e) {
        console.error("Tauri Dialog Error:", e);
      }
    } else if (window.pywebview) {
      const path = await window.pywebview.api.open_file_dialog(
        "Seleccionar Audio Veterinario",
        "Audio files (*.mp3;*.wav;*.m4a;*.flac)",
      );
      if (path) setAudioPath(path);
    }
  };

  const handleOpenContext = async () => {
    if (window.__TAURI_INTERNALS__) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          multiple: false,
          filters: [{ name: "Documentos", extensions: ["pdf", "pptx"] }],
        });
        if (selected) setContextPath(selected as string);
      } catch (e) {
        console.error("Tauri Dialog Error:", e);
      }
    } else if (window.pywebview) {
      const path = await window.pywebview.api.open_file_dialog(
        "Seleccionar Presentación o PDF",
        "MedContext files (*.pptx;*.ppt;*.pdf)",
      );
      if (path) setContextPath(path);
    }
  };

  // Drop handler para modo navegador (fallback)
  const handleAudioDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (window.__TAURI_INTERNALS__) return; // Dejar que el listener global lo maneje

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      // En el navegador, creamos una URL de objeto para previsualizar
      const url = URL.createObjectURL(file);
      setAudioPath(url);
    }
  };

  const handleContextDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (window.__TAURI_INTERNALS__) return; // Dejar que el listener global lo maneje

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const url = URL.createObjectURL(file);
      setContextPath(url);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await fetch("http://localhost:8000/history");
      const data = await res.json();
      setHistoryItems(data);
      setShowHistory(true);
    } catch (e) {
      console.error("Error loading history:", e);
    }
  };

  const loadItemFromHistory = (item: any) => {
    setTranscription(item.full_text);
    setTranscriptionTitle(item.title || "Importado");
    setCategory(item.category || "General");
    setActiveHistoryItem(item);
    setActiveStep(3);
    setShowHistory(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcription);
    setSaveStatus("¡Copiado al portapapeles!");
    setTimeout(() => setSaveStatus(""), 3000);
  };

  const wordsCount =
    transcription.trim() === "" ? 0 : transcription.split(/\s+/).length;
  const readingTime = Math.ceil(wordsCount / 200);

  const getFileName = (path_str: string) => {
    return path_str.split(/[\\/]/).pop();
  };

  const isStepDisabled = (stepId: number) => {
    if (isProcessing) return true;
    if (stepId === 2) return !audioPath;
    if (stepId === 3) return !transcription;
    if (stepId === 4) return false;
    return false;
  };

  // Google Drive Helpers
  const handleLinkDriveAccount = () => {
    setAccountNameInput("");
    setShowAccountNamePrompt(true);
  };

  const confirmLinkDriveAccount = async () => {
    if (!accountNameInput.trim()) return;

    setShowAccountNamePrompt(false);
    setIsLinkingAccount(true);
    try {
      const res = await fetch(
        `http://localhost:8000/drive/auth?account_name=${encodeURIComponent(accountNameInput.trim())}`,
        {
          method: "POST",
        },
      );
      const data = await res.json();
      if (data.success) {
        setSaveStatus(data.message);
        fetchDriveAccounts();
        setTimeout(() => setSaveStatus(""), 3000);
      }
    } catch (e) {
      setDriveError("Error de autenticación. Verifica credentials.json.");
    } finally {
      setIsLinkingAccount(false);
    }
  };

  const handleOpenDriveExplorer = (type: "audio" | "context") => {
    if (driveAccounts.length === 0) {
      alert("Primero vincula una cuenta de Google Drive en Configuración.");
      setShowSettings(true);
      return;
    }
    setDriveTargetType(type);
    setIsDriveModalOpen(true);
    fetchDriveFiles("root");
  };

  const fetchDriveFiles = async (folderId: string) => {
    if (!selectedDriveAccount) return;
    setIsDriveLoading(true);
    setDriveError("");
    try {
      const res = await fetch("http://localhost:8000/drive/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_name: selectedDriveAccount,
          folder_id: folderId,
        }),
      });
      const data = await res.json();
      if (data.detail) throw new Error(data.detail);
      setDriveFiles(data.files || []);
      setDriveCurrentFolderId(folderId);
    } catch (e: any) {
      setDriveError(e.message || "Error al leer archivos de Drive.");
    } finally {
      setIsDriveLoading(false);
    }
  };

  const navigateToDriveFolder = (id: string, name: string) => {
    const newBreadcrumbs = [...driveBreadcrumbs];
    // Evitar duplicados si ya estamos ahí
    if (newBreadcrumbs[newBreadcrumbs.length - 1].id === id) return;
    newBreadcrumbs.push({ id, name });
    setDriveBreadcrumbs(newBreadcrumbs);
    fetchDriveFiles(id);
  };

  const goBackDriveBreadcrumb = (index: number) => {
    const newBreadcrumbs = driveBreadcrumbs.slice(0, index + 1);
    const target = newBreadcrumbs[index];
    setDriveBreadcrumbs(newBreadcrumbs);
    fetchDriveFiles(target.id);
  };

  const handleSelectDriveFile = async (file: any) => {
    // mimeTypes: audio/mpeg, audio/mp3, audio/x-wav, video/mp4, application/vnd.openxmlformats-officedocument.presentationml.presentation (PPTX)
    // application/pdf
    setIsDriveLoading(true);
    try {
      const res = await fetch("http://localhost:8000/drive/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_name: selectedDriveAccount,
          file_id: file.id,
          filename: file.name,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (driveTargetType === "audio") {
          setAudioPath(data.local_path);
        } else {
          setContextPath(data.local_path);
        }
        setIsDriveModalOpen(false);
      }
    } catch (e) {
      alert("Error al descargar de Drive.");
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handleSaveToDrive = async () => {
    if (!selectedDriveAccount) {
      alert("Vincula o selecciona una cuenta de Drive primero.");
      return;
    }

    // Primero exportamos localmente para tener el archivo
    try {
      setSaveStatus("Exportando localmente...");
      const exportRes = await fetch("http://localhost:8000/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: transcription,
          format: "docx",
          filename: transcriptionTitle || "transcripcion",
          category: category,
        }),
      });
      const exportData = await exportRes.json();

      if (exportData.success) {
        setSaveStatus("Subiendo a Google Drive...");
        const uploadRes = await fetch("http://localhost:8000/drive/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_name: selectedDriveAccount,
            file_path: exportData.path,
            title: transcriptionTitle + ".docx",
            category: category,
          }),
        });
        const uploadData = await uploadRes.json();
        if (uploadData.success) {
          setSaveStatus("¡Guardado en Drive!");
          setTimeout(() => setSaveStatus(""), 4000);
        }
      }
    } catch (e) {
      setSaveStatus("Error al subir a Drive.");
      setTimeout(() => setSaveStatus(""), 4000);
    }
  };

  // Calendar Helpers
  const getDaysInMonth = (month: number, year: number) =>
    new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => {
    let day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Lunes = 0, Domingo = 6
  };

  const handlePrevMonth = () => {
    if (libraryMonth === 0) {
      setLibraryMonth(11);
      setLibraryYear(libraryYear - 1);
    } else {
      setLibraryMonth(libraryMonth - 1);
    }
    setSelectedLibraryDay(null);
  };

  const handleNextMonth = () => {
    if (libraryMonth === 11) {
      setLibraryMonth(0);
      setLibraryYear(libraryYear + 1);
    } else {
      setLibraryMonth(libraryMonth + 1);
    }
    setSelectedLibraryDay(null);
  };

  const monthNames = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const weekDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  const daysInMonth = getDaysInMonth(libraryMonth, libraryYear);
  const firstDay = getFirstDayOfMonth(libraryMonth, libraryYear);

  // Filter history for selected category and month
  const libraryItemsForSelectedMonth = historyItems.filter((item: any) => {
    if ((item.category || "General") !== selectedLibraryCategory) return false;
    if (!item.date) return false;
    // item.date is DD/MM/YYYY HH:MM:SS or similar. Assuming format ends with YYYY or starts with YYYY-MM-DD.
    // Let's rely on standard parsing if possible or raw string matching.
    // Python history generates date as: datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    // Wait, let's check python history format. "date": "2026-03-09 18:41:22"
    const dateObj = new Date(item.date);
    if (isNaN(dateObj.getTime())) return false; // fallback
    return (
      dateObj.getMonth() === libraryMonth &&
      dateObj.getFullYear() === libraryYear
    );
  });

  const getItemsForDay = (day: number) => {
    return libraryItemsForSelectedMonth.filter((item: any) => {
      const dateObj = new Date(item.date);
      return dateObj.getDate() === day;
    });
  };

  // Render logic for calendar cells
  const renderCalendarCells = () => {
    const cells = [];
    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="p-2 opacity-0"></div>);
    }
    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      const dayItems = getItemsForDay(d);
      const hasItems = dayItems.length > 0;
      const isSelected = selectedLibraryDay === d;

      cells.push(
        <div
          key={`day-${d}`}
          onClick={() =>
            hasItems && setSelectedLibraryDay(isSelected ? null : d)
          }
          className={cn(
            "aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-300",
            hasItems
              ? "cursor-pointer hover:border-[var(--primary)] border-2"
              : "opacity-30 border border-transparent",
            isSelected
              ? "bg-[var(--primary)] bg-opacity-20 border-[var(--primary)] text-[var(--primary)] font-bold shadow-lg scale-110 z-10"
              : "border-[var(--border)] bg-[var(--secondary)]",
          )}
        >
          <span className="text-sm">{d}</span>
          {hasItems && (
            <div className="absolute bottom-2 flex gap-1">
              {dayItems.slice(0, 3).map((_, idx) => (
                <div
                  key={idx}
                  className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] shadow-[0_0_5px_rgba(var(--primary-rgb),0.8)]"
                ></div>
              ))}
              {dayItems.length > 3 && (
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] opacity-50"></div>
              )}
            </div>
          )}
        </div>,
      );
    }
    return cells;
  };

  return (
    <div
      className={cn(
        "flex flex-col h-screen overflow-hidden transition-colors duration-500",
        `theme-${theme}`,
        "bg-[var(--background)] text-[var(--foreground)]",
      )}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 glass-morphism border-b border-[var(--border)] bg-[var(--header)] z-50">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[var(--primary)] rounded-lg shadow-lg">
            <Stethoscope size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--foreground)] leading-tight text-left">
              vTranscriptor
            </h1>
            <p className="text-[10px] text-[var(--primary)] font-bold uppercase tracking-wider text-left">
              AI Local para Veterinaria
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={loadHistory}
            className="p-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-200"
          >
            <HistoryIcon size={20} />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-200"
          >
            <Settings size={20} />
          </button>
          <div className="h-6 w-px bg-[var(--border)] mx-2"></div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--card)] border border-[var(--border)]">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs font-medium text-[var(--foreground)]">
              GPU ACTIVE
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Step Navigation Sidebar */}
        <aside className="w-20 lg:w-64 border-r border-[var(--border)] flex flex-col pt-8 bg-[var(--sidebar)] z-40">
          {[
            { id: 1, label: "Cargar Archivos", icon: <Upload size={20} /> },
            { id: 2, label: "Procesamiento", icon: <Activity size={20} /> },
            { id: 3, label: "Editor & Export", icon: <FileText size={20} /> },
            { id: 4, label: "Biblioteca", icon: <Library size={20} /> },
          ].map((step) => {
            const disabled = isStepDisabled(step.id);
            const isCompleted =
              (step.id === 1 && audioPath) || (step.id === 2 && transcription);

            return (
              <div
                key={step.id}
                className={cn(
                  "flex items-center gap-3 px-6 py-4 transition-all duration-300 border-l-4",
                  activeStep === step.id
                    ? "bg-[var(--primary)] bg-opacity-10 border-[var(--primary)] text-[var(--primary)]"
                    : disabled
                      ? "border-transparent text-[var(--muted)] opacity-40 cursor-not-allowed"
                      : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer",
                )}
                onClick={() => !disabled && setActiveStep(step.id)}
              >
                {step.icon}
                <span className="hidden lg:block font-medium text-sm text-left">
                  {step.label}
                </span>
                {isCompleted && (
                  <CheckCircle2 size={14} className="ml-auto text-green-500" />
                )}
              </div>
            );
          })}
        </aside>

        {/* Viewport Area */}
        <section className="flex-1 overflow-y-auto p-12 bg-[var(--background)] relative">
          <div className="max-w-4xl mx-auto space-y-10 text-left">
            {/* STEP 1: UPLOAD */}
            {activeStep === 1 && (
              <div className="fade-in space-y-8">
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <h2 className="text-3xl font-bold text-[var(--foreground)] mb-2">
                      Identificar Transcripción
                    </h2>
                    <p className="text-[var(--muted)]">
                      Asigna un nombre y categoría para organizar tus archivos.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-[var(--card)] p-8 rounded-2xl border border-[var(--border)] items-end">
                  <div className="space-y-3 flex flex-col">
                    <div className="h-5 flex items-center">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--primary)]">
                        Título Clase
                      </label>
                    </div>
                    <input
                      type="text"
                      value={transcriptionTitle}
                      onChange={(e) => setTranscriptionTitle(e.target.value)}
                      placeholder="Ej: Clase 01"
                      className="w-full h-[48px] bg-[var(--secondary)] border border-[var(--border)] rounded-xl px-4 text-sm focus:border-[var(--primary)] outline-none"
                    />
                  </div>

                  <div className="space-y-3 flex flex-col relative">
                    <div className="h-5 flex justify-between items-center">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--primary)] text-left">
                        Ramo / Categoría
                      </label>
                      {category !== "General" && !isAddingNewCategory && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCategory(category);
                          }}
                          className="text-[10px] text-red-500 hover:underline font-bold"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>

                    {!isAddingNewCategory ? (
                      <div className="relative">
                        <button
                          onClick={() =>
                            setIsCategoryDropdownOpen(!isCategoryDropdownOpen)
                          }
                          className="w-full h-[48px] bg-[var(--secondary)] border border-[var(--border)] rounded-xl px-4 text-sm flex justify-between items-center hover:border-[var(--primary)] transition-all outline-none"
                        >
                          <span className="font-medium">{category}</span>
                          <ChevronDown
                            size={16}
                            className={cn(
                              "transition-transform duration-300",
                              isCategoryDropdownOpen && "rotate-180",
                            )}
                          />
                        </button>

                        {isCategoryDropdownOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-[60]"
                              onClick={() => setIsCategoryDropdownOpen(false)}
                            ></div>
                            <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                              <div className="max-h-48 overflow-y-auto">
                                {availableCategories.map((cat) => (
                                  <div
                                    key={cat}
                                    onClick={() => {
                                      setCategory(cat);
                                      setIsCategoryDropdownOpen(false);
                                    }}
                                    className={cn(
                                      "px-4 py-3 text-sm cursor-pointer hover:bg-[var(--primary)] hover:text-white transition-colors",
                                      category === cat &&
                                        "bg-[var(--primary)] bg-opacity-20 text-[var(--primary)] font-bold",
                                    )}
                                  >
                                    {cat}
                                  </div>
                                ))}
                                <div
                                  onClick={() => {
                                    setIsAddingNewCategory(true);
                                    setCategory("");
                                    setIsCategoryDropdownOpen(false);
                                  }}
                                  className="px-4 py-3 text-sm text-[var(--primary)] font-bold cursor-pointer hover:bg-[var(--primary)] hover:text-white border-t border-[var(--border)]"
                                >
                                  + Crear nuevo Ramo...
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          autoFocus
                          type="text"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          onBlur={() => {
                            if (!category) {
                              setIsAddingNewCategory(false);
                              setCategory("General");
                            }
                          }}
                          placeholder="Nombre del ramo"
                          className="w-full h-[48px] bg-[var(--secondary)] border border-[var(--primary)] rounded-xl px-4 text-sm outline-none shadow-[0_0_10px_rgba(var(--primary-rgb),0.1)]"
                        />
                        <button
                          onClick={() => setIsAddingNewCategory(false)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--primary)] text-xs font-bold px-2 bg-[var(--secondary)]"
                        >
                          LISTO
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 flex flex-col">
                    <div className="h-5 flex items-center">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--primary)]">
                        Fecha de Clase
                      </label>
                    </div>
                    <div className="relative group">
                      <input
                        type="date"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                        className="w-full h-[48px] bg-[var(--secondary)] border border-[var(--border)] rounded-xl px-4 text-sm focus:border-[var(--primary)] outline-none relative z-10 appearance-none font-medium text-[var(--foreground)]"
                      />
                      <Calendar
                        size={16}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none z-0"
                      />
                    </div>
                  </div>
                </div>

                {errorMsg && (
                  <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl flex items-center gap-3 text-red-400 animate-pulse text-sm">
                    <AlertCircle size={18} />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
                  {/* Audio Card */}
                  <div
                    onClick={handleOpenAudio}
                    className={cn(
                      "premium-card p-10 flex flex-col items-center justify-center gap-4 text-center cursor-pointer border-dashed border-2 transition-all duration-300 bg-[var(--card)]",
                      audioPath
                        ? "border-[var(--primary)] shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]"
                        : "border-[var(--border)] hover:border-[var(--primary)]",
                    )}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleAudioDrop}
                  >
                    <div
                      className={cn(
                        "p-6 rounded-2xl transition-all duration-500",
                        audioPath
                          ? "bg-[var(--primary)] text-white scale-110 shadow-lg"
                          : "bg-[var(--secondary)] text-[var(--muted)]",
                      )}
                    >
                      <FileAudio size={48} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-[var(--foreground)] tracking-tight">
                        Archivo de Audio
                      </h3>
                      <p className="text-xs text-[var(--muted)] mt-1 uppercase font-bold tracking-widest">
                        MP3, WAV, M4A, FLAC
                      </p>
                    </div>
                    {audioPath ? (
                      <div
                        className="w-full space-y-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between px-2">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-[var(--primary)] bg-opacity-10 rounded-lg text-[var(--primary)]">
                              <FileAudio size={16} />
                            </div>
                            <span className="text-xs font-bold text-[var(--foreground)] truncate max-w-[150px]">
                              {getFileName(audioPath)}
                            </span>
                          </div>
                          <button
                            onClick={() => setAudioPath("")}
                            className="p-1.5 text-[var(--muted)] hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {/* Audio Player Improvement */}
                        <div className="bg-[var(--secondary)] p-4 rounded-2xl border border-[var(--border)] shadow-inner">
                          <audio
                            key={audioPath}
                            src={`http://localhost:8000/stream-audio?path=${encodeURIComponent(audioPath)}`}
                            controls
                            className="w-full h-10"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <p className="text-[11px] text-[var(--muted)] italic">
                          Haz clic para buscar localmente
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDriveExplorer("audio");
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-[var(--secondary)] hover:bg-[var(--primary)] hover:text-white text-[var(--primary)] text-[10px] font-bold uppercase tracking-widest rounded-full border border-[var(--primary)] border-opacity-30 transition-all"
                        >
                          <Library size={14} /> Abrir desde Drive
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Context Card */}
                  <div
                    onClick={handleOpenContext}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleContextDrop}
                    className={cn(
                      "premium-card p-10 flex flex-col items-center justify-center gap-4 text-center cursor-pointer border-dashed border-2 transition-all duration-300 bg-[var(--card)]",
                      contextPath
                        ? "border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                        : "border-[var(--border)] hover:border-emerald-500",
                    )}
                  >
                    <div
                      className={cn(
                        "p-6 rounded-2xl transition-all duration-500",
                        contextPath
                          ? "bg-emerald-600 text-white scale-110 shadow-lg"
                          : "bg-[var(--secondary)] text-[var(--muted)]",
                      )}
                    >
                      <Maximize2 size={48} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-[var(--foreground)] tracking-tight">
                        Contexto Médico
                      </h3>
                      <p className="text-xs text-[var(--muted)] mt-1 uppercase font-bold tracking-widest">
                        PPTX o PDF
                      </p>
                    </div>
                    {contextPath ? (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 text-emerald-500 text-[11px] font-bold bg-emerald-500 bg-opacity-10 px-3 py-1.5 rounded-full border border-emerald-500 border-opacity-30"
                      >
                        <CheckCircle2 size={14} /> {getFileName(contextPath)}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <p className="text-[11px] text-[var(--muted)] italic">
                          Opcional para mejorar precisión
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDriveExplorer("context");
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-[var(--secondary)] hover:bg-emerald-600 hover:text-white text-emerald-500 text-[10px] font-bold uppercase tracking-widest rounded-full border border-emerald-500 border-opacity-30 transition-all"
                        >
                          <Library size={14} /> Contexto de Drive
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Settings Section */}
                <div className="glass-morphism rounded-2xl p-8 space-y-6">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)]">
                    Configuración del Modelo
                  </h4>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { id: "tiny", label: "Rápido (Tiny)" },
                      { id: "base", label: "Estándar (Base)" },
                      { id: "medium", label: "Preciso (Medium)" },
                      { id: "turbo", label: "Máxima Precisión (Turbo)" },
                    ].map((lvl) => (
                      <button
                        key={lvl.id}
                        onClick={() =>
                          setQuality(
                            lvl.id === "turbo" ? "large-v3-turbo" : lvl.id,
                          )
                        }
                        className={cn(
                          "px-6 py-3 rounded-xl border-2 transition-all font-semibold capitalize text-sm",
                          quality === lvl.id ||
                            (quality === "large-v3-turbo" && lvl.id === "turbo")
                            ? "border-[var(--primary)] bg-[var(--primary)] bg-opacity-10 text-[var(--primary)]"
                            : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--foreground)]",
                        )}
                      >
                        {lvl.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-[var(--card)] rounded-lg border border-[var(--border)]">
                    <AlertCircle
                      size={18}
                      className="text-[var(--muted)] mt-0.5"
                    />
                    <div className="space-y-1">
                      <p className="text-[13px] text-[var(--muted)] leading-relaxed italic">
                        La IA detectará automáticamente tu GPU para máxima
                        velocidad.
                      </p>
                      <p className="text-[11px] text-[var(--muted)] opacity-70">
                        Modo Turbo requiere 4GB+ de VRAM. Si falla, el sistema
                        usará CPU automáticamente.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    disabled={!audioPath || isProcessing}
                    onClick={startTranscription}
                    className={cn(
                      "btn-primary px-10 py-4 text-lg rounded-xl flex items-center gap-3",
                      (!audioPath || isProcessing) &&
                        "opacity-50 cursor-not-allowed",
                    )}
                  >
                    {isProcessing ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Play size={20} />
                    )}
                    Empezar Transcripción Real (GPU Mode)
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: PROCESSING */}
            {activeStep === 2 && (
              <div className="fade-in flex flex-col items-center justify-center min-h-[50vh] space-y-12">
                <div className="relative">
                  {/* Rotating Outer Ring */}
                  <div className="w-56 h-56 rounded-full border-4 border-[var(--border)] relative">
                    <div
                      className="absolute -top-1 -left-1 w-56 h-56 rounded-full border-4 border-[var(--primary)] border-t-transparent animate-spin"
                      style={{ animationDuration: "1.5s" }}
                    ></div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-5xl font-black text-[var(--foreground)]">
                        {progress}%
                      </span>
                      <span className="text-[10px] text-[var(--primary)] font-bold uppercase tracking-widest mt-2">
                        {progress < 30
                          ? "Cargando Modelo"
                          : progress < 80
                            ? "Analizando Audio"
                            : "Finalizando"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-center space-y-4 max-w-sm">
                  <h3 className="text-xl font-bold text-[var(--foreground)]">
                    Procesando audio veterinario...
                  </h3>
                  <p className="text-[var(--muted)] text-sm">
                    No cierres el programa. Estamos utilizando tu GPU para mayor
                    velocidad y privacidad absoluta.
                  </p>
                </div>

                <div className="w-full bg-[var(--secondary)] h-1.5 rounded-full overflow-hidden border border-[var(--border)]">
                  <div
                    className="h-full bg-[var(--primary)] transition-all duration-300 shadow-[0_0_20px_rgba(var(--primary-rgb),0.5)]"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* STEP 3: EDITOR */}
            {activeStep === 3 && (
              <div className="fade-in space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-[var(--foreground)]">
                      Transcripción Finalizada
                    </h2>
                    <p className="text-[var(--muted)] text-sm">
                      Revisa el contenido antes de exportar. La IA ha detectado
                      párrafos naturales.
                    </p>
                  </div>
                  <div className="flex gap-3 relative">
                    {saveStatus && (
                      <div className="absolute -top-12 right-0 px-4 py-2 bg-[var(--primary)] text-white text-xs font-bold rounded-lg shadow-xl animate-bounce">
                        {saveStatus}
                      </div>
                    )}
                    <button
                      onClick={copyToClipboard}
                      className="btn-secondary flex items-center gap-2 hover:bg-[var(--secondary)] font-bold text-xs"
                    >
                      {saveStatus.includes("Copiado") ? (
                        <ClipboardCheck size={16} className="text-green-500" />
                      ) : (
                        <Clipboard size={16} />
                      )}
                      COPIAR
                    </button>
                    <button
                      onClick={() => handleExport("txt")}
                      className="btn-secondary flex items-center gap-2 hover:bg-[var(--secondary)]"
                    >
                      <Download size={16} /> .TXT
                    </button>
                    <button
                      onClick={() => handleExport("docx")}
                      className="btn-primary flex items-center gap-2 shadow-xl"
                    >
                      <FileText size={18} /> Exportar Word
                    </button>
                    <button
                      onClick={handleSaveToDrive}
                      className="btn-primary flex items-center gap-2 bg-[#4285F4] hover:bg-[#357ae8] shadow-xl border-none"
                    >
                      <Library size={18} /> Guardar en Drive
                    </button>
                  </div>
                </div>

                <div className="relative group">
                  <div className="absolute inset-0 bg-[var(--primary)] opacity-5 blur-xl -z-10 group-hover:opacity-10 transition-colors"></div>
                  <div className="premium-card p-0 overflow-hidden shadow-2xl">
                    <div className="bg-[var(--secondary)] border-b border-[var(--border)] px-6 py-3 flex text-xs font-bold text-[var(--muted)] uppercase tracking-widest justify-between items-center">
                      <div className="flex items-center gap-4">
                        <span>Editor de Párrafos</span>
                        <span className="h-3 w-px bg-[var(--border)]"></span>
                        <span className="text-[var(--primary)] flex items-center gap-1.5">
                          <CheckCircle2 size={12} />{" "}
                          {transcription.split(/\s+/).length} palabras
                        </span>
                        <span className="text-[var(--muted)] flex items-center gap-1.5">
                          <Clock size={12} /> {readingTime} min de lectura
                        </span>
                      </div>
                      
                      {activeHistoryItem && (
                        <button
                          onClick={handleSaveTranscription}
                          className="bg-[var(--primary)] bg-opacity-10 hover:bg-opacity-20 text-[var(--primary)] px-4 py-1.5 rounded-full flex items-center gap-2 transition-all shadow-sm"
                        >
                          <Save size={14} />
                          Guardar Cambios
                        </button>
                      )}
                    </div>
                    <textarea
                      className="w-full h-[500px] bg-transparent p-10 text-[var(--foreground)] text-lg leading-relaxed focus:outline-none resize-none border-none selection:bg-[var(--primary)] selection:bg-opacity-30"
                      value={transcription}
                      onChange={(e) => setTranscription(e.target.value)}
                      placeholder="Empezando transcripción..."
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-[var(--muted)] italic bg-[var(--secondary)] p-3 rounded-lg border border-[var(--border)]">
                  <CheckCircle2 size={14} className="text-[var(--primary)]" />
                  Los términos médicos como 'Adenitis' y 'Cardiomegalia' fueron
                  reforzados por el motor de contexto local.
                </div>
              </div>
            )}

            {/* STEP 4: BIBLIOTECA */}
            {activeStep === 4 && (
              <div className="fade-in space-y-8">
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <h2 className="text-3xl font-bold text-[var(--foreground)] mb-2">
                      Biblioteca de Transcripciones
                    </h2>
                    <p className="text-[var(--muted)]">
                      Explora y recupera tus apuntes filtrando por Ramo y Fecha.
                    </p>
                  </div>
                </div>

                {/* Filtros de Biblioteca */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[var(--card)] p-6 rounded-2xl border border-[var(--border)] items-end">
                  <div className="space-y-3 flex flex-col relative z-20">
                    <div className="h-5 flex items-center">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--primary)] text-left">
                        Filtrar por Ramo
                      </label>
                    </div>

                    <div className="relative">
                      <button
                        onClick={() =>
                          setIsLibraryCategoryDropdownOpen(
                            !isLibraryCategoryDropdownOpen,
                          )
                        }
                        className="w-full h-[48px] bg-[var(--secondary)] border border-[var(--border)] rounded-xl px-4 text-sm flex justify-between items-center hover:border-[var(--primary)] transition-all outline-none"
                      >
                        <span className="font-medium">
                          {selectedLibraryCategory}
                        </span>
                        <ChevronDown
                          size={16}
                          className={cn(
                            "transition-transform duration-300",
                            isLibraryCategoryDropdownOpen && "rotate-180",
                          )}
                        />
                      </button>

                      {isLibraryCategoryDropdownOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-[60]"
                            onClick={() =>
                              setIsLibraryCategoryDropdownOpen(false)
                            }
                          ></div>
                          <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="max-h-48 overflow-y-auto">
                              {availableCategories.map((cat) => (
                                <div
                                  key={`lib-cat-${cat}`}
                                  onClick={() => {
                                    setSelectedLibraryCategory(cat);
                                    setIsLibraryCategoryDropdownOpen(false);
                                    setSelectedLibraryDay(null);
                                  }}
                                  className={cn(
                                    "px-4 py-3 text-sm cursor-pointer hover:bg-[var(--primary)] hover:text-white transition-colors",
                                    selectedLibraryCategory === cat &&
                                      "bg-[var(--primary)] bg-opacity-20 text-[var(--primary)] font-bold",
                                  )}
                                >
                                  {cat}
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-[var(--secondary)] border border-[var(--border)] rounded-xl h-[48px] px-2">
                    <button
                      onClick={handlePrevMonth}
                      className="p-2 hover:text-[var(--primary)] transition-colors rounded-lg hover:bg-[var(--primary)] hover:bg-opacity-10"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <div className="flex flex-col items-center">
                      <span className="font-bold text-[var(--foreground)] text-sm">
                        {monthNames[libraryMonth]}
                      </span>
                      <span className="text-[10px] text-[var(--muted)] font-black tracking-widest">
                        {libraryYear}
                      </span>
                    </div>
                    <button
                      onClick={handleNextMonth}
                      className="p-2 hover:text-[var(--primary)] transition-colors rounded-lg hover:bg-[var(--primary)] hover:bg-opacity-10"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>

                {/* Calendario */}
                {!selectedLibraryDay && (
                  <div className="glass-morphism rounded-2xl p-8 shadow-xl relative z-10 border border-[var(--border)] animate-in fade-in duration-300">
                    <div className="grid grid-cols-7 gap-2 mb-4">
                      {weekDays.map((day) => (
                        <div
                          key={day}
                          className="text-center text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest"
                        >
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-3">
                      {renderCalendarCells()}
                    </div>
                  </div>
                )}

                {/* Resultados del día seleccionado */}
                {selectedLibraryDay && (
                  <div className="animate-in slide-in-from-right-4 fade-in duration-300 space-y-6">
                    <div className="flex items-center gap-4 border-b border-[var(--border)] pb-4">
                      <button
                        onClick={() => setSelectedLibraryDay(null)}
                        className="p-2 bg-[var(--secondary)] hover:bg-[var(--primary)] hover:text-white text-[var(--foreground)] rounded-xl transition-colors border border-[var(--border)]"
                        title="Volver al calendario"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <h3 className="text-xl font-bold flex items-center gap-2 m-0 leading-none">
                        <Calendar className="text-[var(--primary)]" size={24} />
                        Apuntes del {selectedLibraryDay} de{" "}
                        {monthNames[libraryMonth]}
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {getItemsForDay(selectedLibraryDay).map(
                        (item: any, idx: number) => (
                          <div
                            key={`result-${idx}`}
                            className="premium-card p-5 group hover:border-[var(--primary)] transition-all cursor-pointer relative overflow-hidden"
                            onClick={() => loadItemFromHistory(item)}
                          >
                            <div className="absolute inset-0 bg-[var(--primary)] opacity-0 group-hover:opacity-5 transition-opacity"></div>
                            <div className="flex justify-between items-start mb-2 relative z-10">
                              <h4 className="font-bold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors text-lg">
                                {item.title || "Sin Título"}
                              </h4>
                              <div className="flex gap-2 items-center">
                                <button
                                  onClick={(e) => handleDeleteHistoryItem(e, item)}
                                  className="p-1.5 rounded-md text-red-500 hover:bg-red-500 hover:text-white bg-red-500 bg-opacity-10 transition-colors"
                                  title="Borrar permanentemente"
                                >
                                  <Trash2 size={16} />
                                </button>
                                <div className="p-1.5 rounded-md bg-[var(--secondary)] text-[var(--muted)]">
                                  <FileText size={16} />
                                </div>
                              </div>
                            </div>
                            <p className="text-[11px] text-[var(--muted)] line-clamp-2 italic leading-relaxed mb-4 relative z-10">
                              "{item.text}"
                            </p>
                            <button className="text-[10px] font-bold uppercase tracking-widest text-[var(--primary)] hover:underline relative z-10">
                              Leer / Editar en Editor →
                            </button>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer Info */}
      <footer className="px-8 py-2 bg-[var(--footer)] border-t border-[var(--border)] text-[10px] text-[var(--muted)] flex justify-between items-center z-50 text-left">
        <div className="flex items-center gap-4">
          <span>FASTER-WHISPER CORE V1.2</span>
          <span className="h-2 w-px bg-[var(--border)]"></span>
          <span>SOPORTE CUDA ACTIVADO</span>
        </div>

        {/* Theme Selector */}
        <div className="flex items-center gap-2 px-2 py-1 bg-[var(--background)] rounded-lg border border-[var(--border)]">
          <Palette size={12} className="text-[var(--muted)]" />
          {[
            { id: "dark", color: "#0a0a0c", icon: <Moon size={10} /> },
            {
              id: "light",
              color: "#f8fafc",
              icon: <Sun size={10} className="text-orange-500" />,
            },
            { id: "pink", color: "#db2777", icon: null },
            { id: "green", color: "#16a34a", icon: null },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={cn(
                "w-5 h-5 rounded-md flex items-center justify-center transition-all border",
                theme === t.id
                  ? "border-[var(--primary)] scale-110 shadow-lg"
                  : "border-transparent opacity-50 hover:opacity-100",
              )}
              style={{ backgroundColor: t.color }}
            >
              <span className="text-white">{t.icon}</span>
            </button>
          ))}
        </div>

        <div className="font-medium tracking-tight">
          <a
            href="https://github.com/mtynnn/vTransciptor"
            target="_blank"
            className="hover:text-blue-400 transition-colors"
          >
            MTYNNN © 2026 | VET-TRANSCRIPTION-OS
          </a>
        </div>
      </footer>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--card)] border border-[var(--border)] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-[var(--border)] flex justify-between items-center bg-[var(--header)]">
              <h3 className="text-xl font-bold text-[var(--foreground)]">
                Historial de Transcripciones
              </h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-[var(--muted)] hover:text-[var(--foreground)] text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {historyItems.length === 0 ? (
                <p className="text-center text-[var(--muted)] py-10 italic">
                  No hay transcripciones previas disponibles.
                </p>
              ) : (
                historyItems.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => loadItemFromHistory(item)}
                    className="p-5 rounded-2xl border border-[var(--border)] hover:border-[var(--primary)] bg-[var(--background)] cursor-pointer transition-all hover:translate-x-1 group"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-[var(--primary)] font-black text-[10px] uppercase tracking-tighter bg-[var(--primary)] bg-opacity-10 px-2 py-0.5 rounded-md w-fit">
                          {item.category || "GENERAL"}
                        </span>
                        <h4 className="font-bold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors">
                          {item.title || "Sin Título"}
                        </h4>
                      </div>
                      <div className="flex gap-4 items-center">
                        <span className="text-[var(--muted)] text-[10px] font-medium">
                          {item.date}
                        </span>
                        <button
                          onClick={(e) => handleDeleteHistoryItem(e, item)}
                          className="text-[var(--muted)] hover:text-red-500 transition-colors"
                          title="Borrar permanentemente"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--muted)] line-clamp-2 italic leading-relaxed">
                      "{item.text}"
                    </p>
                    <div className="mt-3 pt-3 border-t border-[var(--border)] border-opacity-30 flex items-center gap-2 text-[var(--muted)] text-[9px]">
                      <FileAudio size={10} /> {item.audio}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in zoom-in duration-200">
          <div className="bg-[var(--card)] border border-[var(--border)] w-full max-w-md rounded-2xl shadow-2xl p-8 space-y-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xl font-bold text-[var(--foreground)]">
                Configuración General
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-[var(--muted)] hover:text-[var(--foreground)] text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="space-y-4">
              {/* Hardware Status Badge */}
              <div className="flex items-center gap-2 p-3 bg-[var(--primary)] bg-opacity-5 border border-[var(--primary)] border-opacity-10 rounded-xl">
                <Activity size={16} className="text-[var(--primary)]" />
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-[var(--muted)] uppercase tracking-tighter">
                    Hardware Engine
                  </span>
                  <span className="text-xs font-bold text-[var(--foreground)]">
                    {deviceInfo}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-left">
                <label className="text-xs font-bold text-[var(--muted)] uppercase">
                  Modelo Predeterminado
                </label>
                <select
                  className="w-full bg-[var(--secondary)] border border-[var(--border)] rounded-lg p-3 text-sm text-[var(--foreground)] outline-none"
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                >
                  <option value="base">Estándar (Base)</option>
                  <option value="medium">Preciso (Medium)</option>
                  <option value="large-v3-turbo">
                    Máxima Precisión (Turbo)
                  </option>
                </select>
              </div>

              <div className="h-px bg-[var(--border)] my-4 opacity-30"></div>

              <div className="space-y-3 text-left">
                <label className="text-xs font-bold text-[var(--muted)] uppercase flex items-center gap-2">
                  <Library size={14} className="text-[var(--primary)]" /> Google
                  Drive (Nube)
                </label>
                <div className="flex flex-col gap-2">
                  {driveAccounts.length > 0 ? (
                    driveAccounts.map((acc) => (
                      <div
                        key={acc}
                        className="flex items-center justify-between bg-[var(--background)] border border-[var(--border)] rounded-xl p-3 text-[11px]"
                      >
                        <span className="font-bold flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></div>{" "}
                          {acc}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] text-[var(--muted)] italic mb-1 px-1">
                      Sin cuentas vinculadas aún.
                    </p>
                  )}
                  <button
                    onClick={handleLinkDriveAccount}
                    disabled={isLinkingAccount}
                    className="w-full py-4 mt-2 border border-dashed border-[var(--primary)] text-[var(--primary)] rounded-xl text-[10px] font-black uppercase tracking-widest hover:text-white hover:bg-[var(--primary)] transition-all flex items-center justify-center gap-2 group"
                    style={{
                      backgroundColor: "rgba(var(--primary-rgb), 0.05)",
                    }}
                  >
                    {isLinkingAccount ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <>
                        <Library
                          size={14}
                          className="group-hover:rotate-12 transition-transform"
                        />
                        <span>Vincular Nueva Cuenta</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="h-px bg-[var(--border)] my-4 opacity-30"></div>

              <div className="flex items-center justify-between py-2">
                <span className="text-[11px] font-bold text-[var(--muted)] uppercase tracking-widest">
                  Auto-Guardado TXT
                </span>
                <div className="w-10 h-5 bg-[var(--primary)] rounded-full border border-[var(--border)] relative cursor-pointer opacity-50">
                  <div className="absolute right-1 top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-sm"></div>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowSettings(false)}
              className="btn-primary w-full justify-center py-4 rounded-xl font-bold shadow-lg"
            >
              Cerrar Ajustes
            </button>
          </div>
        </div>
      )}

      {/* Google Drive Explorer Modal */}
      {isDriveModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[var(--card)] border border-[var(--border)] w-full max-w-3xl rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-[var(--border)] flex justify-between items-center bg-[var(--header)]">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-[#4285F4] rounded-lg">
                  <Library size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[var(--foreground)]">
                    Explorador de Google Drive
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <select
                      className="bg-transparent text-[10px] text-[var(--muted)] font-black uppercase tracking-widest outline-none border-none cursor-pointer hover:text-[var(--primary)]"
                      value={selectedDriveAccount}
                      onChange={(e) => {
                        setSelectedDriveAccount(e.target.value);
                        fetchDriveFiles("root");
                      }}
                    >
                      {driveAccounts.map((acc) => (
                        <option
                          key={acc}
                          value={acc}
                          className="bg-[var(--card)]"
                        >
                          {acc}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsDriveModalOpen(false)}
                className="text-[var(--muted)] hover:text-[var(--foreground)] text-3xl font-light"
              >
                &times;
              </button>
            </div>

            {/* Breadcrumbs */}
            <div className="bg-[var(--secondary)] border-b border-[var(--border)] px-6 py-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
              {driveBreadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.id}>
                  <button
                    onClick={() => goBackDriveBreadcrumb(idx)}
                    className={cn(
                      "text-xs font-bold transition-colors",
                      idx === driveBreadcrumbs.length - 1
                        ? "text-[var(--primary)]"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]",
                    )}
                  >
                    {crumb.name}
                  </button>
                  {idx < driveBreadcrumbs.length - 1 && (
                    <span className="text-[var(--muted)] opacity-30">/</span>
                  )}
                </React.Fragment>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[var(--background)]">
              {isDriveLoading ? (
                <div className="h-full flex flex-col items-center justify-center space-y-4 py-20">
                  <Loader2
                    size={40}
                    className="text-[var(--primary)] animate-spin"
                  />
                  <p className="text-[var(--muted)] text-[10px] animate-pulse tracking-[0.2em] uppercase font-black">
                    Sincronizando con Google Cloud...
                  </p>
                </div>
              ) : driveError ? (
                <div className="h-full flex flex-col items-center justify-center space-y-4 py-20 text-center px-10">
                  <div className="p-4 bg-red-500/10 rounded-full">
                    <AlertCircle size={40} className="text-red-500" />
                  </div>
                  <p className="text-red-400 font-bold text-sm tracking-tight">
                    {driveError}
                  </p>
                  <button
                    onClick={() => fetchDriveFiles(driveCurrentFolderId)}
                    className="text-[10px] uppercase font-bold text-[var(--primary)] hover:underline"
                  >
                    Reintentar
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-10 fade-in">
                  {/* Carperas Primero */}
                  {driveFiles
                    .filter(
                      (f) =>
                        f.mimeType === "application/vnd.google-apps.folder",
                    )
                    .map((folder) => (
                      <div
                        key={folder.id}
                        onClick={() =>
                          navigateToDriveFolder(folder.id, folder.name)
                        }
                        className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] transition-all cursor-pointer group text-center space-y-3"
                      >
                        <Library
                          className="mx-auto text-yellow-500 group-hover:scale-110 transition-transform"
                          size={40}
                        />
                        <span className="text-[11px] font-bold truncate block px-2 leading-relaxed text-[var(--foreground)]">
                          {folder.name}
                        </span>
                      </div>
                    ))}
                  {/* Archivos Después */}
                  {driveFiles
                    .filter(
                      (f) =>
                        f.mimeType !== "application/vnd.google-apps.folder",
                    )
                    .map((file) => {
                      const isSelectable =
                        driveTargetType === "audio"
                          ? file.mimeType.includes("audio") ||
                            file.mimeType.includes("video") ||
                            file.name.match(/\.(mp3|wav|m4a|flac)$/i)
                          : file.name.match(/\.(pptx|pdf|docx|txt)$/i) ||
                            file.mimeType.includes("presentation") ||
                            file.mimeType.includes("pdf");

                      return (
                        <div
                          key={file.id}
                          onClick={() =>
                            isSelectable && handleSelectDriveFile(file)
                          }
                          className={cn(
                            "p-5 rounded-2xl border transition-all text-center space-y-3 group",
                            isSelectable
                              ? "bg-[var(--card)] border-[var(--border)] hover:border-[var(--primary)] cursor-pointer"
                              : "opacity-30 border-transparent grayscale cursor-not-allowed",
                          )}
                        >
                          {file.mimeType.includes("audio") ? (
                            <FileAudio
                              className="mx-auto text-[var(--primary)] group-hover:scale-110 transition-transform"
                              size={40}
                            />
                          ) : file.mimeType.includes("presentation") ||
                            file.name.toLowerCase().endsWith(".pptx") ? (
                            <Maximize2
                              className="mx-auto text-orange-500 group-hover:scale-110 transition-transform"
                              size={40}
                            />
                          ) : (
                            <FileText
                              className="mx-auto text-red-500 group-hover:scale-110 transition-transform"
                              size={40}
                            />
                          )}
                          <span className="text-[10px] font-bold truncate block px-2 text-[var(--foreground)]">
                            {file.name}
                          </span>
                        </div>
                      );
                    })}
                  {driveFiles.length === 0 && (
                    <div className="col-span-full py-20 text-center">
                      <p className="text-[var(--muted)] text-sm italic py-10">
                        Esta carpeta no contiene archivos compatibles.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Account Name Prompt Modal */}
      {showAccountNamePrompt && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[var(--card)] border border-[var(--border)] w-full max-w-sm rounded-3xl shadow-[0_0_50px_rgba(var(--primary-rgb),0.2)] p-8 space-y-6 animate-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-[var(--primary)] bg-opacity-10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Library size={32} className="text-[var(--primary)]" />
              </div>
              <h3 className="text-xl font-bold text-[var(--foreground)]">
                Identifica tu cuenta
              </h3>
              <p className="text-[10px] text-[var(--muted)] uppercase font-bold tracking-widest">
                Google Drive Integration
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-[var(--primary)] uppercase tracking-wider ml-1">
                Nombre de la cuenta
              </label>
              <input
                autoFocus
                type="text"
                value={accountNameInput}
                onChange={(e) => setAccountNameInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && confirmLinkDriveAccount()
                }
                placeholder="Ej: Drive Universidad o tu@gmail.com"
                className="w-full h-14 bg-[var(--background)] border border-[var(--border)] rounded-2xl px-5 text-sm focus:border-[var(--primary)] outline-none shadow-inner transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setShowAccountNamePrompt(false)}
                className="py-4 rounded-xl text-xs font-bold text-[var(--muted)] hover:bg-[var(--secondary)] transition-colors"
              >
                CANCELAR
              </button>
              <button
                onClick={confirmLinkDriveAccount}
                disabled={!accountNameInput.trim()}
                className="btn-primary justify-center py-4 rounded-xl font-bold shadow-lg disabled:opacity-50 disabled:grayscale"
              >
                VINCULAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
