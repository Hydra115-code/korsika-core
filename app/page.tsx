"use client";

import { useConversation } from "@11labs/react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { 
  Mic, MicOff, MapPin, Image as ImageIcon, BrainCircuit, 
  LayoutDashboard, Menu, Send, Sparkles, LogOut, 
  Activity, Navigation, Eye // Agregamos Eye y Navigation
} from "lucide-react";
import { askGemini, analyzeRoadImage } from "./actions"; // Importamos la visión

// --- TIPOS ---
type Message = {
  role: 'user' | 'ai';
  text: string;
  type?: 'text' | 'location' | 'image' | 'gemini' | 'nav';
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
  
  // --- ESTADOS NUEVOS (Lógica Invisible) ---
  const [userLocation, setUserLocation] = useState<string | null>(null);
  const [isDriverMode, setIsDriverMode] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // -----------------------------------------

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasStarted = messages.length > 0;
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // 1. GPS SILENCIOSO (No rompe UI)
  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (p) => setUserLocation(`${p.coords.latitude.toFixed(4)},${p.coords.longitude.toFixed(4)}`),
        (e) => console.log("GPS Standby"),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // 2. DRIVER MODE (Cámara en Loop)
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
                const base64 = c.toDataURL('image/jpeg', 0.5);
                const warning = await analyzeRoadImage(base64);
                if (warning) addMessage('ai', `⚠️ ${warning}`);
            }
        }, 5000);
    } else {
        if (videoRef.current?.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        }
    }
    return () => clearInterval(interval);
  }, [isDriverMode]);

  // 3. GESTOR MENSAJES
  const addMessage = useCallback((role: 'user' | 'ai', text: string, type: Message['type'] = 'text', metadata?: string) => {
    setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === role && lastMsg.text === text) return prev;
        return [...prev, { role, text, type, metadata, id: Date.now().toString() + Math.random(), timestamp: new Date().toLocaleTimeString() }];
    });
  }, []);

  // 4. PROCESADOR VISUAL
  const processVisuals = useCallback((responseText: string) => {
      if (!responseText) return "Procesando...";
      const navMatch = responseText.match(/\[NAV:\s*(.*?)\]/);
      const locMatch = responseText.match(/\[LOC:\s*(.*?)\]/);
      const imgMatch = responseText.match(/\[IMG:\s*(.*?)\]/);
      let cleanText = responseText;

      if (navMatch) {
          const dest = navMatch[1];
          cleanText = responseText.replace(/\[NAV:.*?\]/, '').trim();
          addMessage('ai', cleanText, 'nav', dest);
      } else if (locMatch) {
          const place = locMatch[1];
          cleanText = responseText.replace(/\[LOC:.*?\]/, '').trim();
          addMessage('ai', cleanText, 'location', place);
      } else if (imgMatch) {
          const prompt = imgMatch[1];
          cleanText = responseText.replace(/\[IMG:.*?\]/, '').trim();
          addMessage('ai', cleanText, 'image', prompt);
      }
      return cleanText;
  }, [addMessage]);

  // 5. HERRAMIENTAS
  const clientTools = useMemo(() => ({
    consultGemini: async (p: { query: string }) => {
        try {
            const res = await askGemini(p.query, userLocation || undefined);
            const spoken = processVisuals(res);
            if (spoken === res) addMessage('ai', spoken, 'gemini');
            return spoken;
        } catch (e) { return "Reconectando..."; }
    },
    Showmap: async (p: { location: string }) => { addMessage('ai', `Mapa: ${p.location}`, 'location', p.location); return "Mapa."; },
    GenerateImage: async (p: { prompt: string }) => { addMessage('ai', `Imagen...`, 'image', p.prompt); return "Hecho."; }
  }), [addMessage, processVisuals, userLocation]);

  // 6. VOZ
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
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isProcessing]);

  // 7. CHAT MANUAL
  const handleSendText = async () => {
    if (!inputText.trim()) return;
    const t = inputText; setInputText(""); addMessage('user', t);
    if (status !== 'connected') {
        setIsProcessing(true);
        try {
            if (t.toLowerCase().startsWith("genera")) {
                const p = t.replace(/genera|crea/i, "").trim();
                addMessage('ai', `Generando: ${p}`, 'image', p);
                setIsProcessing(false); return;
            }
            const res = await askGemini(t, userLocation || undefined);
            const clean = processVisuals(res);
            if (!res.match(/\[(LOC|NAV|IMG):/)) addMessage('ai', clean, 'gemini');
        } catch (e) { addMessage('ai', "Error.", 'text'); }
        finally { setIsProcessing(false); }
    }
  };

  return (
    <div className="flex h-screen bg-[#050505] text-white font-sans overflow-hidden relative selection:bg-cyan-500/30">
      
      {/* --- ELEMENTOS FLOTANTES INVISIBLES (NO ROMPEN LAYOUT) --- */}
      <video ref={videoRef} className={`fixed bottom-24 right-6 w-24 h-32 object-cover rounded-xl border border-red-500/50 shadow-2xl z-[100] transition-all duration-500 ${isDriverMode ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`} muted playsInline />
      <canvas ref={canvasRef} className="hidden" />
      {/* -------------------------------------------------------- */}

      {/* FONDO AURORA (Intacto) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-purple-900/20 rounded-full blur-[120px] mix-blend-screen" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-cyan-900/10 rounded-full blur-[100px] mix-blend-screen" />
      </div>

      {/* SIDEBAR (Intacto + Botón Ojo) */}
      <aside className="hidden md:flex w-20 bg-white/5 backdrop-blur-xl border-r border-white/5 flex-col items-center py-8 z-50 shadow-2xl relative">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-600 shadow-[0_0_20px_rgba(34,211,238,0.4)] flex items-center justify-center font-bold text-white mb-10">K</div>
        <nav className="flex flex-col gap-6 w-full items-center flex-1 cursor-pointer">
            <SidebarButton icon={<LayoutDashboard size={22}/>} active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
            <SidebarButton icon={<BrainCircuit size={22}/>} active={currentView === 'chat'} onClick={() => setCurrentView('chat')} />
            
            {/* NUEVO BOTÓN DRIVER MODE (Integrado sutilmente) */}
            <div className="w-8 h-[1px] bg-white/10 my-2" />
            <button onClick={() => setIsDriverMode(!isDriverMode)} className={`p-3.5 rounded-2xl transition-all duration-300 ${isDriverMode ? 'bg-red-500/20 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}>
                <Eye size={22} className={isDriverMode ? "animate-pulse" : ""}/>
            </button>
        </nav>
        <button className="mb-4 text-gray-500 hover:text-red-400 transition p-3 hover:bg-white/5 rounded-xl cursor-pointer"><LogOut size={20}/></button>
      </aside>

      {/* MAIN */}
      <main className="flex-1 flex flex-col relative h-full z-10">
        <header className="absolute top-0 w-full p-6 flex justify-between items-center z-40 pointer-events-none">
            <div className="flex items-center gap-3 pointer-events-auto">
                <div className="md:hidden"><button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 bg-white/5 rounded-full"><Menu className="text-gray-300 w-5 h-5"/></button></div>
                <div className="hidden md:block"><h1 className="text-lg font-bold text-white tracking-wide">Korsika <span className="text-cyan-500">Core</span></h1></div>
                {/* INDICADOR DRIVER MODE EN HEADER */}
                <AnimatePresence>
                  {isDriverMode && (
                    <motion.div initial={{opacity:0, x:-10}} animate={{opacity:1, x:0}} exit={{opacity:0}} className="hidden md:flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full ml-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"/>
                      <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Driver Mode</span>
                    </motion.div>
                  )}
                </AnimatePresence>
            </div>
            <div className="flex items-center gap-3 px-4 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10 shadow-lg pointer-events-auto">
                 <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500' : 'bg-gray-500'}`} />
                 <span className="text-xs font-medium text-gray-300 uppercase tracking-wider">{status === 'connected' ? 'Voz Activa' : 'Offline'}</span>
            </div>
        </header>

        {/* CHAT AREA */}
        <div className="flex-1 overflow-y-auto pt-24 pb-40 px-4 md:px-0 scrollbar-hide z-20">
            {currentView === 'dashboard' && (
                <div className="px-4 md:px-12 animate-in fade-in zoom-in duration-500">
                    <h2 className="text-3xl font-bold mb-8">Estado de Misión</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="bg-white/5 p-6 rounded-3xl border border-white/5 hover:border-cyan-500/30 transition shadow-xl backdrop-blur-md">
                            <Activity className="text-cyan-400 mb-4"/>
                            <p className="text-4xl font-light text-white">{messages.length}</p>
                            <p className="text-sm text-gray-400 uppercase tracking-widest mt-1">Interacciones</p>
                        </div>
                        <div className="col-span-1 lg:col-span-2 bg-white/5 p-6 rounded-3xl border border-white/5 backdrop-blur-md">
                            <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-gray-200">Memoria Visual</h3><ImageIcon size={18} className="text-purple-400"/></div>
                            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                                 {messages.filter(m => m.type === 'image').length === 0 && <span className="text-gray-600 text-sm italic">Sin datos visuales.</span>}
                                 {messages.filter(m => m.type === 'image').map(m => (
                                     <img key={m.id} src={`https://image.pollinations.ai/prompt/${m.metadata}?width=200&height=150&nologo=true`} className="w-32 h-24 rounded-xl object-cover border border-white/10 hover:scale-105 transition"/>
                                 ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {currentView === 'chat' && (
                <div className="max-w-2xl mx-auto flex flex-col gap-6">
                    {!hasStarted && (
                        <div className="flex flex-col items-center justify-center mt-20 md:mt-32 text-center animate-in fade-in duration-1000">
                            <BrainCircuit size={64} className="text-cyan-400 relative z-10 mb-6 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]"/>
                            <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">Hola, Erick</h2>
                            <p className="text-gray-500 mt-2 text-lg">
                                {isDriverMode ? "Sensores Visuales Activados." : "Tu Agente Personal está listo."}
                            </p>
                        </div>
                    )}

                    <AnimatePresence>
                    {messages.map((msg) => (
                        <motion.div key={msg.id} initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <span className="text-[10px] text-gray-500 mb-1 px-2 uppercase tracking-wider">{msg.role === 'user' ? 'Tú' : 'Korsika'}</span>
                            <div className={`px-6 py-4 rounded-[2rem] max-w-[90%] text-[15px] leading-relaxed backdrop-blur-md shadow-lg ${msg.role === 'user' ? 'bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] text-white rounded-tr-sm border border-white/10' : 'bg-white/5 text-gray-200 rounded-tl-sm border border-white/5'}`}>
                                {msg.text}
                            </div>
                            
                            {/* WIDGET IMAGEN */}
                            {msg.type === 'image' && (
                                <motion.div initial={{opacity:0}} animate={{opacity:1}} className="mt-3 relative group">
                                    <div className="absolute inset-0 bg-cyan-500/20 blur-xl group-hover:bg-cyan-500/30 transition rounded-full" />
                                    <img src={`https://image.pollinations.ai/prompt/${encodeURIComponent(msg.metadata || '')}?width=500&height=300&nologo=true`} className="relative z-10 rounded-2xl w-full max-w-sm border border-white/10 shadow-2xl" />
                                </motion.div>
                            )}
                            
                            {/* WIDGET MAPA ESTÁTICO */}
                            {msg.type === 'location' && (
                                <motion.div initial={{opacity:0, height: 0}} animate={{opacity:1, height: 'auto'}} className="mt-3 w-full max-w-sm overflow-hidden rounded-2xl border border-cyan-500/30 shadow-lg">
                                    <div className="bg-[#0a0a0a] p-3 flex items-center gap-2 border-b border-white/10"><MapPin size={16} className="text-red-500" /><span className="text-xs font-bold text-gray-300 uppercase">Ubicación</span></div>
                                    <div className="h-48 w-full bg-gray-800 relative">
                                        <iframe width="100%" height="100%" frameBorder="0" style={{ border: 0, filter: 'grayscale(100%) invert(90%) contrast(120%)' }} src={`https://maps.google.com/maps?q=${encodeURIComponent(msg.metadata || '')}&t=m&z=14&output=embed&iwloc=near`}></iframe>
                                    </div>
                                </motion.div>
                            )}

                            {/* WIDGET NAVEGACIÓN [NAV] */}
                            {msg.type === 'nav' && (
                                <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} className="mt-3 w-full max-w-sm overflow-hidden rounded-2xl border border-green-500/30 shadow-[0_0_30px_rgba(34,197,94,0.1)] bg-[#0a0a0a]">
                                    <div className="p-3 flex items-center justify-between border-b border-white/10 bg-green-900/10">
                                        <div className="flex items-center gap-2"><Navigation size={16} className="text-green-400" /><span className="text-xs font-bold text-green-400 uppercase tracking-wider">Ruta Activa</span></div>
                                    </div>
                                    <div className="h-64 w-full bg-gray-800 relative">
                                        {/* TRUCO GPS: Usamos userLocation si existe, sino My Location */}
                                        <iframe width="100%" height="100%" frameBorder="0" style={{ border: 0, filter: 'grayscale(100%) invert(90%) contrast(120%)' }} src={`https://www.google.com/maps?saddr=${userLocation || "My+Location"}&daddr=${encodeURIComponent(msg.metadata || '')}&output=embed&t=m`}></iframe>
                                    </div>
                                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(msg.metadata || '')}&travelmode=driving`} target="_blank" rel="noreferrer" className="block w-full py-3 text-center bg-green-600 hover:bg-green-500 text-black font-bold uppercase text-xs tracking-widest transition flex items-center justify-center gap-2">
                                        INICIAR CONDUCCIÓN <Navigation size={14}/>
                                    </a>
                                </motion.div>
                            )}

                        </motion.div>
                    ))}
                    </AnimatePresence>
                    
                    {isProcessing && <div className="flex items-center gap-2 text-gray-500 text-sm ml-4 animate-pulse"><Sparkles size={14} className="text-purple-400"/> Pensando...</div>}
                    <div ref={messagesEndRef} />
                </div>
            )}
        </div>

        {/* INPUT BAR (Intacto) */}
        <div className="absolute bottom-0 w-full z-50 flex flex-col items-center pointer-events-none">
            <div className="w-full h-32 bg-gradient-to-t from-[#050505] via-[#050505] to-transparent absolute bottom-0 -z-10" />
            
            <div className="relative pb-10 w-full max-w-3xl px-6 flex flex-col items-center gap-6 pointer-events-auto">
                <AnimatePresence>
                    {hasStarted && !status && (
                        <motion.div initial={{ opacity: 0, y: 20, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} className="w-full">
                            <div className="w-full bg-[#151515]/90 backdrop-blur-xl border border-white/10 rounded-full px-2 py-2 shadow-2xl flex items-center gap-2">
                                <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendText()} placeholder="Escribe para interactuar..." className="flex-1 bg-transparent border-none outline-none text-gray-200 px-4 text-sm h-10 placeholder-gray-600"/>
                                <button onClick={handleSendText} className="p-3 bg-white/5 rounded-full hover:bg-cyan-500 hover:text-black transition text-gray-400 cursor-pointer"><Send size={18}/></button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="h-6 flex items-center justify-center">
                    {status === 'connected' ? (
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"/>
                            <p className="text-red-400 text-xs font-bold tracking-[0.2em] uppercase">{isSpeaking ? "Korsika Hablando" : "Escuchando..."}</p>
                            <div className="flex gap-1 ml-2">{[1,2,3,4].map(i => (<motion.div key={i} animate={{height: isSpeaking ? [4, 12, 4] : 4}} transition={{repeat: Infinity, duration: 0.5, delay: i*0.1}} className="w-1 bg-red-500/50 rounded-full"/>))}</div>
                        </div>
                    ) : (!hasStarted && <p className="text-gray-600 text-xs tracking-widest uppercase">Sistemas Listos</p>)}
                </div>

                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={status === 'connected' ? () => conversation.endSession() : () => conversation.startSession()} className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 relative z-50 cursor-pointer ${status === 'connected' ? 'bg-red-500 shadow-[0_0_60px_rgba(239,68,68,0.5)]' : 'bg-gradient-to-b from-cyan-400 to-blue-600 shadow-[0_0_40px_rgba(6,182,212,0.4)] border-4 border-[#050505]'}`}>
                    {!status && (<div className="absolute inset-0 rounded-full border-2 border-cyan-400/30 animate-ping-slow" />)}
                    {status === 'connected' ? <MicOff size={32} className="text-white"/> : <Mic size={32} className="text-white fill-white/20"/>}
                </motion.button>
            </div>
        </div>

      </main>
    </div>
  );
}

// COMPONENTE SIDEBARBUTTON (Intacto)
const SidebarButton = ({ icon, active, onClick, children }: any) => (
    <button onClick={onClick} className={`p-3.5 rounded-2xl transition-all duration-300 relative cursor-pointer ${active ? 'bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-400 shadow-inner' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}>
        {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-cyan-400 rounded-r-full blur-[2px]" />}
        {icon}
        {children}
    </button>
);