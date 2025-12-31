"use client";

import { useConversation } from "@11labs/react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { 
  Mic, MicOff, MapPin, Image as ImageIcon, BrainCircuit, 
  LayoutDashboard, Menu, Send, Sparkles, LogOut, 
  Activity, Navigation, Eye, Satellite, Music, MessageCircle, BellRing, X, Minimize2
} from "lucide-react";
import { askGemini, analyzeRoadImage } from "./actions"; 

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

type Message = {
  role: 'user' | 'ai';
  text: string;
  type?: 'text' | 'location' | 'image' | 'gemini' | 'nav' | 'music' | 'whatsapp';
  metadata?: string;
  id: string; 
  timestamp: string;
};

export default function KorsikaHome() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentView, setCurrentView] = useState<'chat' | 'dashboard'>('chat');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // --- ESTADOS ---
  const [userLocation, setUserLocation] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'searching' | 'locked' | 'error'>('searching');
  const [isDriverMode, setIsDriverMode] = useState(false);
  const [lastNotification, setLastNotification] = useState<{sender: string, text: string} | null>(null);
  
  // 🗺️ Navegación + Memoria de última ruta
  const [activeNavigation, setActiveNavigation] = useState<{destination: string} | null>(null);
  const [lastDestination, setLastDestination] = useState<string | null>(null); // Para recordar la ruta si se cierra

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const hasStarted = messages.length > 0;
  
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // 1. GPS
  useEffect(() => {
    if (!("geolocation" in navigator)) { setGpsStatus('error'); return; }
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
          const loc = `${p.coords.latitude.toFixed(4)},${p.coords.longitude.toFixed(4)}`;
          setUserLocation(loc);
          setGpsStatus('locked');
      },
      (e) => { console.error("Error GPS:", e); setGpsStatus('error'); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 2. DRIVER MODE
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isDriverMode) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(stream => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }})
            .catch(e => setIsDriverMode(false));
        interval = setInterval(async () => {
            if (videoRef.current && canvasRef.current) {
                const v = videoRef.current;
                const c = canvasRef.current;
                c.width = v.videoWidth; c.height = v.videoHeight;
                c.getContext('2d')?.drawImage(v, 0, 0);
                const warning = await analyzeRoadImage(c.toDataURL('image/jpeg', 0.5));
                if (warning) addMessage('ai', `⚠️ ${warning}`);
            }
        }, 5000);
    } else {
        if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    return () => clearInterval(interval);
  }, [isDriverMode]);

  const addMessage = useCallback((role: 'user' | 'ai', text: string, type: Message['type'] = 'text', metadata?: string) => {
    setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === role && lastMsg.text === text) return prev;
        return [...prev, { role, text, type, metadata, id: Date.now().toString() + Math.random(), timestamp: new Date().toLocaleTimeString() }];
    });
  }, []);

  // 4. PROCESADOR VISUAL (Ahora con comandos de UI)
  const processVisuals = useCallback((responseText: string) => {
      if (!responseText) return "Procesando...";
      const navMatch = responseText.match(/\[NAV:\s*(.*?)\]/);
      const locMatch = responseText.match(/\[LOC:\s*(.*?)\]/);
      const imgMatch = responseText.match(/\[IMG:\s*(.*?)\]/);
      const musicMatch = responseText.match(/\[MUSIC:\s*(.*?)\]/);
      const wapMatch = responseText.match(/\[WHATSAPP:\s*(.*?)\]/);
      const uiMatch = responseText.match(/\[UI:\s*(.*?)\]/); // Nuevo comando UI

      let cleanText = responseText
          .replace(/\[NAV:.*?\]/, '')
          .replace(/\[LOC:.*?\]/, '')
          .replace(/\[IMG:.*?\]/, '')
          .replace(/\[MUSIC:.*?\]/, '')
          .replace(/\[WHATSAPP:.*?\]/, '')
          .replace(/\[UI:.*?\]/, '')
          .trim();

      if (!cleanText) cleanText = "Hecho.";

      if (navMatch) {
          const dest = navMatch[1];
          addMessage('ai', cleanText, 'nav', dest);
          setActiveNavigation({ destination: dest });
          setLastDestination(dest); // Guardamos la ruta por si la cierra y la vuelve a pedir
      } else if (locMatch) {
          const place = locMatch[1];
          addMessage('ai', cleanText, 'location', place);
      } else if (imgMatch) {
          const prompt = imgMatch[1];
          addMessage('ai', cleanText, 'image', prompt);
      } else if (musicMatch) {
          const song = musicMatch[1];
          addMessage('ai', cleanText, 'music', song);
          window.open(`https://open.spotify.com/search/${encodeURIComponent(song)}`, '_blank');
      } else if (wapMatch) {
          const wapData = wapMatch[1];
          addMessage('ai', cleanText, 'whatsapp', wapData);
          setLastNotification(null);
      } else if (uiMatch) {
          const command = uiMatch[1];
          if (command === "CLOSE_MAP") {
              setActiveNavigation(null); // Cierra el mapa
          } else if (command === "OPEN_MAP") {
              // Si había una ruta previa, la recuperamos
              if (lastDestination) {
                  setActiveNavigation({ destination: lastDestination });
              } else {
                  // Si no hay ruta previa, mostramos ubicación actual (default)
                  addMessage('ai', "No hay ruta activa, mostrando ubicación.", 'location', userLocation || "Current Location");
              }
          }
          addMessage('ai', cleanText, 'gemini');
      } else {
          addMessage('ai', cleanText, 'gemini');
      }
      return cleanText;
  }, [addMessage, lastDestination, userLocation]);

  const clientTools = useMemo(() => ({
    consultGemini: async (p: { query: string }) => {
        try {
            const contextInfo = lastNotification 
               ? `Notificación pendiente de ${lastNotification.sender}: "${lastNotification.text}".`
               : "";
            const res = await askGemini(p.query, userLocation || undefined, contextInfo);
            return processVisuals(res);
        } catch (e) { return "Error técnico."; }
    },
    Showmap: async (p: { location: string }) => { 
        addMessage('ai', `Mapa de ${p.location}`, 'location', p.location); 
        return "Mapa mostrado."; 
    },
    GenerateImage: async (p: { prompt: string }) => { 
        addMessage('ai', `Generando: ${p.prompt}`, 'image', p.prompt); 
        return "Imagen generada."; 
    }
  }), [addMessage, processVisuals, userLocation, lastNotification]);

  const conversation = useConversation({
    agentId: process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "",
    clientTools,
    onMessage: (m: any) => {
      if (m.source === "user") addMessage('user', m.text || m.message || "");
      if (m.source === "ai" && m.text && !m.text.includes("__")) addMessage('ai', m.text);
    },
    onError: (e) => console.error(e)
  });
  const { status, isSpeaking } = conversation;

  const simulateIncomingMessage = async () => {
      const sender = "Mamá";
      const msgText = "¿A qué hora llegas?";
      setLastNotification({ sender, text: msgText });
      const alertText = `🔔 Mensaje de ${sender}: "${msgText}"`;
      addMessage('ai', alertText, 'text');
      
      if (status === 'connected') {
          // @ts-ignore
          await (conversation as any).sendMessage(`[SYSTEM ALERT] Notificación de ${sender}: "${msgText}".`);
      }
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isProcessing]);

  const handleSendText = async () => {
    if (!inputText.trim()) return;
    const t = inputText; setInputText(""); addMessage('user', t);
    
    if (status !== 'connected') {
        setIsProcessing(true);
        try {
            const contextInfo = lastNotification ? `Notificación: ${lastNotification.text}` : "";
            const res = await askGemini(t, userLocation || undefined, contextInfo);
            processVisuals(res);
        } catch (e) { addMessage('ai', "Error.", 'text'); }
        finally { setIsProcessing(false); }
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#050505] text-white font-sans overflow-hidden relative selection:bg-cyan-500/30">
      
      {/* FONDO AURORA */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-purple-900/30 rounded-full blur-[120px] mix-blend-screen animate-pulse" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-pink-900/20 rounded-full blur-[100px] mix-blend-screen" />
      </div>

      <video ref={videoRef} className={`fixed top-4 right-4 w-24 h-32 object-cover rounded-xl border border-red-500/50 shadow-2xl z-[60] transition-all duration-500 ${isDriverMode ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10 pointer-events-none'}`} muted playsInline />
      <canvas ref={canvasRef} className="hidden" />

      {/* SIDEBAR DESKTOP */}
      <aside className="hidden md:flex w-20 bg-white/5 backdrop-blur-xl border-r border-white/5 flex-col items-center py-8 z-50 shadow-2xl relative">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 to-purple-600 shadow-[0_0_20px_rgba(168,85,247,0.4)] flex items-center justify-center font-bold text-white mb-10">K</div>
        <nav className="flex flex-col gap-6 w-full items-center flex-1 cursor-pointer">
            <SidebarButton icon={<LayoutDashboard size={22}/>} active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
            <SidebarButton icon={<BrainCircuit size={22}/>} active={currentView === 'chat'} onClick={() => setCurrentView('chat')} />
            <div className="w-8 h-[1px] bg-white/10 my-2" />
            <button onClick={() => setIsDriverMode(!isDriverMode)} className={`p-3.5 rounded-2xl transition-all duration-300 ${isDriverMode ? 'bg-red-500/20 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}>
                <Eye size={22} className={isDriverMode ? "animate-pulse" : ""}/>
            </button>
        </nav>
        <button className="mb-4 text-gray-500 hover:text-red-400 transition p-3 hover:bg-white/5 rounded-xl cursor-pointer"><LogOut size={20}/></button>
      </aside>

      {/* MENÚ MÓVIL (NUEVO CÓDIGO AGREGADO) */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ x: "-100%" }} 
            animate={{ x: 0 }} 
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center gap-8 md:hidden"
          >
            <button onClick={() => setIsMobileMenuOpen(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white">
              <X size={32} />
            </button>

            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-400 to-purple-600 shadow-[0_0_30px_rgba(168,85,247,0.4)] flex items-center justify-center font-bold text-white text-2xl mb-4">K</div>
            
            <nav className="flex flex-col gap-6 w-full max-w-xs px-8">
              <button onClick={() => { setCurrentView('dashboard'); setIsMobileMenuOpen(false); }} className={`flex items-center gap-4 text-xl p-4 rounded-xl border border-white/10 ${currentView === 'dashboard' ? 'bg-purple-600/20 text-purple-400' : 'text-gray-300'}`}>
                <LayoutDashboard size={24}/> Dashboard
              </button>
              
              <button onClick={() => { setCurrentView('chat'); setIsMobileMenuOpen(false); }} className={`flex items-center gap-4 text-xl p-4 rounded-xl border border-white/10 ${currentView === 'chat' ? 'bg-cyan-600/20 text-cyan-400' : 'text-gray-300'}`}>
                <BrainCircuit size={24}/> Chat Copilot
              </button>

              <button onClick={() => { setIsDriverMode(!isDriverMode); setIsMobileMenuOpen(false); }} className={`flex items-center gap-4 text-xl p-4 rounded-xl border border-white/10 ${isDriverMode ? 'bg-red-500/20 text-red-400' : 'text-gray-300'}`}>
                <Eye size={24}/> {isDriverMode ? 'Desactivar Cámara' : 'Modo Conductor'}
              </button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN */}
      <main className="flex-1 flex flex-col md:flex-row relative h-full z-10 overflow-hidden">
        
        {/* MAPA SPLIT */}
        <AnimatePresence mode="popLayout">
            {activeNavigation && (
                <motion.div 
                    initial={{ width: 0, opacity: 0 }} 
                    animate={{ width: "50%", opacity: 1 }} 
                    exit={{ width: 0, opacity: 0 }}
                    className="hidden md:block h-full relative border-r border-white/10 bg-black/20 backdrop-blur-lg"
                >
                    <div className="absolute top-4 left-4 z-20 bg-black/60 backdrop-blur rounded-full px-4 py-2 flex items-center gap-2 border border-green-500/30">
                        <Navigation size={16} className="text-green-400 animate-pulse"/>
                        <span className="text-xs font-bold text-white uppercase tracking-wider">{activeNavigation.destination}</span>
                    </div>
                    <button onClick={() => setActiveNavigation(null)} className="absolute top-4 right-4 z-20 p-2 bg-black/50 hover:bg-white/20 rounded-full text-white transition"><Minimize2 size={18}/></button>
                    
                    {/* ✅ API MAPS OFICIAL */}
                    <iframe 
                        width="100%" height="100%" frameBorder="0" loading="eager" allowFullScreen 
                        style={{ border: 0, filter: 'grayscale(20%) invert(90%) contrast(110%)' }} 
                        src={`https://www.google.com/maps/embed/v1/directions?key=${GOOGLE_MAPS_KEY}&origin=${userLocation || "current+location"}&destination=${encodeURIComponent(activeNavigation.destination)}&mode=driving`}>
                    </iframe>
                </motion.div>
            )}
        </AnimatePresence>

        {/* MAPA MOVIL */}
        <AnimatePresence>
            {activeNavigation && (
                <motion.div 
                    initial={{ height: 0 }} animate={{ height: "40%" }} exit={{ height: 0 }}
                    className="md:hidden w-full relative border-b border-white/10 bg-black/20 backdrop-blur-lg"
                >
                      <button onClick={() => setActiveNavigation(null)} className="absolute top-2 right-2 z-20 p-2 bg-black/50 rounded-full text-white"><Minimize2 size={16}/></button>
                      <iframe 
                        width="100%" height="100%" frameBorder="0" loading="eager" allowFullScreen 
                        style={{ border: 0, filter: 'grayscale(20%) invert(90%) contrast(110%)' }} 
                        src={`https://www.google.com/maps/embed/v1/directions?key=${GOOGLE_MAPS_KEY}&origin=${userLocation || "current+location"}&destination=${encodeURIComponent(activeNavigation.destination)}&mode=driving`}>
                    </iframe>
                </motion.div>
            )}
        </AnimatePresence>

        {/* CHAT */}
        <div className="flex-1 flex flex-col relative h-full">
            <header className="absolute top-0 w-full p-6 flex justify-between items-center z-40 pointer-events-none">
                <div className="flex items-center gap-3 pointer-events-auto">
                    <div className="md:hidden"><button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 bg-white/5 rounded-full"><Menu className="text-gray-300 w-5 h-5"/></button></div>
                    <div className="hidden md:block"><h1 className="text-lg font-bold text-white tracking-wide">Korsika <span className="text-purple-400">Core</span></h1></div>
                    
                    <div className="flex items-center gap-2 ml-4">
                        <div className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest ${gpsStatus === 'locked' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'}`}>
                            <Satellite size={12} className={gpsStatus === 'searching' ? 'animate-spin' : ''}/>
                            <span>{gpsStatus === 'locked' ? 'GPS OK' : 'GPS...'}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10 shadow-lg pointer-events-auto">
                    <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500' : 'bg-gray-500'}`} />
                    <span className="text-xs font-medium text-gray-300 uppercase tracking-wider">{status === 'connected' ? 'Voz' : 'Offline'}</span>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto pt-24 pb-40 px-4 scrollbar-hide z-20">
                {currentView === 'dashboard' && (
                    <div className="px-4 animate-in fade-in zoom-in duration-500 mt-10">
                        <h2 className="text-2xl font-bold mb-6">Panel de Control</h2>
                        <div className="bg-white/10 p-5 rounded-2xl border border-white/10 hover:border-purple-500/30 transition shadow-lg cursor-pointer flex items-center gap-4 backdrop-blur-md" onClick={simulateIncomingMessage}>
                            <BellRing className="text-purple-400"/>
                            <div>
                                <p className="font-bold text-white">Prueba WhatsApp</p>
                                <p className="text-xs text-gray-400">Simular mensaje entrante</p>
                            </div>
                        </div>
                    </div>
                )}

                {currentView === 'chat' && (
                    <div className="max-w-2xl mx-auto flex flex-col gap-4">
                        {!hasStarted && (
                            <div className="flex flex-col items-center justify-center mt-20 text-center animate-in fade-in duration-1000">
                                <BrainCircuit size={64} className="text-purple-400 mb-6 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]"/>
                                <h2 className="text-3xl font-bold text-white">Hola, Erick</h2>
                                <p className="text-gray-400 mt-2 text-sm">Sistemas en línea.</p>
                            </div>
                        )}

                        <AnimatePresence>
                        {messages.map((msg) => (
                            <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`px-5 py-3 rounded-2xl max-w-[90%] text-sm backdrop-blur-md shadow-lg ${msg.role === 'user' ? 'bg-gradient-to-br from-purple-600/20 to-blue-600/20 text-white rounded-tr-sm border border-white/10' : 'bg-white/10 text-gray-200 rounded-tl-sm border border-white/5'}`}>
                                    {msg.text}
                                </div>
                                
                                {msg.type === 'music' && (
                                    <div className="mt-2 w-full max-w-xs bg-black/40 border border-green-500/30 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition" onClick={() => window.open(`https://open.spotify.com/search/${encodeURIComponent(msg.metadata || '')}`, '_blank')}>
                                        <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-black"><Music size={20}/></div>
                                        <div className="overflow-hidden"><p className="text-xs font-bold text-white truncate">Spotify</p><p className="text-[10px] text-gray-400 truncate">{msg.metadata}</p></div>
                                    </div>
                                )}

                                {msg.type === 'location' && (
                                    <div className="mt-2 w-full max-w-lg bg-black/40 border border-purple-500/30 rounded-xl overflow-hidden">
                                        <div className="p-3 border-b border-white/10 flex gap-2 items-center"><MapPin size={16} className="text-purple-400"/><span className="text-xs font-bold">Ubicación</span></div>
                                        <iframe width="100%" height="200" frameBorder="0" style={{border:0}} src={`https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_KEY}&q=${encodeURIComponent(msg.metadata || '')}`}></iframe>
                                    </div>
                                )}

                                {msg.type === 'nav' && !activeNavigation && (
                                    <div className="mt-2">
                                        <button onClick={() => setActiveNavigation({destination: msg.metadata || ''})} className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-600/50 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition">
                                            <Navigation size={14}/> Abrir Mapa
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        ))}
                        </AnimatePresence>
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            <div className="absolute bottom-0 w-full z-50 flex flex-col items-center pb-8 pt-10 bg-gradient-to-t from-[#050505] via-[#050505]/90 to-transparent pointer-events-none">
                <div className="w-full max-w-2xl px-6 flex flex-col items-center gap-4 pointer-events-auto">
                    <AnimatePresence>
                        {hasStarted && !status && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="w-full">
                                <div className="w-full bg-[#151515]/80 border border-white/10 rounded-full px-2 py-1.5 shadow-xl flex items-center gap-2 backdrop-blur-md">
                                    <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendText()} placeholder="Comandos..." className="flex-1 bg-transparent border-none outline-none text-gray-200 px-4 text-sm h-9 placeholder-gray-600"/>
                                    <button onClick={handleSendText} className="p-2 bg-white/10 rounded-full hover:bg-cyan-500 hover:text-black transition text-gray-400"><Send size={16}/></button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <motion.button 
                        whileTap={{ scale: 0.9 }} 
                        onClick={() => {
                            if (status === 'connected') {
                                conversation.endSession();
                            } else {
                                // @ts-ignore
                                (conversation as any).startSession(); 
                            }
                        }} 
                        className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 relative z-50 cursor-pointer ${status === 'connected' ? 'bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.4)]' : 'bg-gradient-to-b from-cyan-400 to-purple-600 shadow-[0_0_30px_rgba(168,85,247,0.3)] border-4 border-[#050505]'}`}
                    >
                        {status === 'connected' ? <MicOff size={24} className="text-white"/> : <Mic size={24} className="text-white fill-white/20"/>}
                    </motion.button>
                </div>
            </div>
        </div>

      </main>
    </div>
  );
}

const SidebarButton = ({ icon, active, onClick, children }: any) => (
    <button onClick={onClick} className={`p-3.5 rounded-2xl transition-all duration-300 relative cursor-pointer ${active ? 'bg-gradient-to-br from-cyan-500/20 to-purple-500/20 text-cyan-400 shadow-inner' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}>
        {icon} {children}
    </button>
);