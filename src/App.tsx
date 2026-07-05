import React, { useState, useEffect, useRef } from 'react';
import PhoneClient from './components/PhoneClient';
import PcReceiver from './components/PcReceiver';
import { 
  Tv, 
  Smartphone, 
  Cpu, 
  Sparkles, 
  Wifi, 
  Radio, 
  Settings, 
  Code2, 
  Heart,
  HelpCircle
} from 'lucide-react';

type ViewMode = 'dual' | 'phone-only' | 'pc-only';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('dual');
  const [wsUrl, setWsUrl] = useState('');
  const [isScannedOnly, setIsScannedOnly] = useState(false);

  // Local/direct coupling callbacks to bypass WebSocket delay in local sandbox mode
  const directControlCallbackRef = useRef<((packet: any) => void) | null>(null);

  useEffect(() => {
    // Detect query parameter mode=phone
    const params = new URLSearchParams(window.location.search);
    const isPhoneQuery = params.get('mode') === 'phone';

    // Detect if loaded directly on mobile to auto-set mobile screen mode
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isPhoneQuery || isMobile) {
      setViewMode('phone-only');
    }

    if (isPhoneQuery) {
      setIsScannedOnly(true);
    }

    // Determine secure or unsecure WS protocol based on window URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    setWsUrl(`${protocol}//${host}/ws`);
  }, []);

  const handleRegisterDirectControl = (cb: (packet: any) => void) => {
    directControlCallbackRef.current = cb;
  };

  const handleDirectControl = (packet: any) => {
    if (directControlCallbackRef.current) {
      directControlCallbackRef.current(packet);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0C10] text-slate-300 flex flex-col font-sans select-none">
      
      {/* Universal Head Header Bar */}
      {!isScannedOnly && (
        <header className="h-auto sm:h-20 py-4 sm:py-0 px-8 flex flex-col sm:flex-row items-center justify-between border-b border-white/5 bg-[#0F1117] gap-4 select-none z-50 sticky top-0 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
              <Radio className="w-5.5 h-5.5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  AirTrack Pro <span className="text-[10px] font-normal text-blue-400 bg-blue-400/10 border border-blue-500/10 px-2 py-0.5 rounded-md ml-2 uppercase">Core</span>
                </h1>
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                使用手机作为低延时无线触摸板控制物理与仿真电脑 (已就绪)
              </p>
            </div>
          </div>

          {/* View Mode Switcher Toggles */}
          <div className="flex items-center bg-[#161922] p-1 rounded-2xl border border-white/5 self-stretch sm:self-auto text-xs">
            <button 
              onClick={() => setViewMode('dual')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${viewMode === 'dual' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>双端联动测试</span>
            </button>
            <button 
              onClick={() => setViewMode('phone-only')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${viewMode === 'phone-only' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>手机控制端</span>
            </button>
            <button 
              onClick={() => setViewMode('pc-only')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${viewMode === 'pc-only' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>电脑接收端</span>
            </button>
          </div>
        </header>
      )}

      {/* Main Workspace Frame */}
      <main className={isScannedOnly ? "flex-1 flex flex-col w-full h-screen overflow-hidden" : "flex-1 flex flex-col justify-center items-center px-6 py-8 max-w-7xl mx-auto w-full"}>
        {wsUrl && (
          <div className="w-full flex flex-col items-center">
            
            {/* View Mode 1: Dual Panel Debugging Mode (Recommended for testing) */}
            {viewMode === 'dual' && (
              <div className="w-full flex flex-col lg:flex-row justify-center items-stretch gap-8 lg:gap-12">
                
                {/* Left panel: Smartphone Client */}
                <div className="flex flex-col items-center gap-4">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 bg-[#0F1117] border border-white/5 px-4 py-1.5 rounded-full shadow-md">
                    <Smartphone className="w-3.5 h-3.5 text-blue-400" />
                    触控手机 (左侧控制)
                  </span>
                  
                  <PhoneClient 
                    socketUrl={wsUrl} 
                    defaultPin="1111"
                    onDirectControl={handleDirectControl}
                  />
                  
                  <p className="text-xs text-slate-500 mt-1 max-w-[280px] text-center leading-normal">
                    👆 <b>实时交互</b>: 拖拽绿色/蓝色区域控制右侧鼠标，在下方虚拟键盘打字、写字，右侧画板和记事本中将即刻呈现。
                  </p>
                </div>

                {/* Vertical Divider for widescreen desktop */}
                <div className="hidden lg:block w-[1px] bg-white/5 shrink-0"></div>

                {/* Right panel: Windows Desktop PC Receiver */}
                <div className="flex-1 flex flex-col items-center lg:items-start gap-4">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 bg-[#0F1117] border border-white/5 px-4 py-1.5 rounded-full shadow-md">
                    <Tv className="w-3.5 h-3.5 text-blue-400" />
                    电脑终端 (右侧接收)
                  </span>

                  <PcReceiver 
                    socketUrl={wsUrl} 
                    pin="1111"
                    onDirectControlRegister={handleRegisterDirectControl}
                  />
                </div>

              </div>
            )}

            {/* View Mode 2: Phone Client Only */}
            {viewMode === 'phone-only' && (
              <div className={isScannedOnly ? "w-full min-h-screen flex flex-col" : "flex flex-col items-center justify-center p-4"}>
                <PhoneClient 
                  socketUrl={wsUrl} 
                  defaultPin="1111"
                  isFullscreen={isScannedOnly}
                />
                {!isScannedOnly && (
                  <p className="text-xs text-slate-500 mt-4 text-center max-w-[280px]">
                    请确保此界面上的 PIN 与您在电脑端上设置的一致，即可无线连接。
                  </p>
                )}
              </div>
            )}

            {/* View Mode 3: PC Receiver Only */}
            {viewMode === 'pc-only' && (
              <div className="w-full flex justify-center items-center">
                <PcReceiver 
                  socketUrl={wsUrl} 
                  pin="1111"
                />
              </div>
            )}

          </div>
        )}
      </main>

      {/* Footer credits and assistance */}
      {!isScannedOnly && (
        <footer className="bg-[#0F1117] border-t border-white/5 py-6 px-8 text-center select-none">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500 leading-normal">
            <div className="flex items-center gap-1">
              <span>AirTrack Pro Control Ecosystem</span>
            </div>
            <div className="flex gap-6">
              <span className="hover:text-slate-300 transition-all cursor-help">服务条款</span>
              <span>·</span>
              <span className="hover:text-slate-300 transition-all cursor-help">隐私协议</span>
              <span>·</span>
              <span className="hover:text-slate-300 transition-all cursor-help">使用指南</span>
            </div>
            <div>
              <span>Powered by Google AI Studio Build</span>
            </div>
          </div>
        </footer>
      )}

    </div>
  );
}
