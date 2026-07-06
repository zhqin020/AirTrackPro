import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor,
  Terminal,
  Copy,
  Check,
  Settings,
  RefreshCw,
  FileText,
  Palette,
  Radio,
  Cpu,
  Download,
  Clock,
  Maximize2,
  Trash2,
  Undo2,
  Volume2,
  Wifi,
  SquareDot,
  MousePointerClick,
  HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PYTHON_RECEIVER_SCRIPT } from '../utils/pythonScript';
import { playClickSound } from '../utils/audio';

interface PcReceiverProps {
  socketUrl: string;
  pin?: string;
  // Allows direct simulation feed from PhoneClient
  simulatedPackets?: any[];
  onDirectControlRegister?: (callback: (packet: any) => void) => void;
}

export default function PcReceiver({ socketUrl, pin = '1111', onDirectControlRegister }: PcReceiverProps) {
  // Connection and system states
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [clientCount, setClientCount] = useState(0);
  const [receiverCount, setReceiverCount] = useState(0);
  const [peerConnected, setPeerConnected] = useState(false);
  const [receivedBytes, setReceivedBytes] = useState(0);
  const [packetCount, setPacketCount] = useState(0);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([1.2, 1.5, 0.9, 1.1, 1.4, 1.3, 1.0, 1.2]);

  // Logs of incoming packets
  const [packetLogs, setPacketLogs] = useState<Array<{ id: string; type: string; payload: string; time: string }>>([]);

  // Windows State Manager
  const [activeWindow, setActiveWindow] = useState<'notepad' | 'paint' | 'terminal' | 'console' | 'help' | null>('console');
  const [minimizedWindows, setMinimizedWindows] = useState<Record<string, boolean>>({
    notepad: true,
    paint: true,
    terminal: true,
    console: false,
    help: true,
  });

  // Notepad State
  const [notepadText, setNotepadText] = useState('欢迎使用无线触摸板与普通/扩展键盘控制系统！\n\n请在左侧的手机端点击“普通键盘”、“扩展键盘”或“控制”开始滑动、打字。所有的动作都会实时同步到这台电脑的记事本与电子画板中...\n\n支持回车、空格和退格键删除。您可以通过桌面的“系统使用帮助”窗口获取完整的操作说明与真机连线配置！');

  // Paint Canvas State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [brushColor, setBrushColor] = useState('#3b82f6'); // default Sleek Royal Blue
  const [brushSize, setBrushSize] = useState(4);
  const [autoDraw, setAutoDraw] = useState(true); // Draw on hover to make touchpad usage extremely friendly!

  // Copy success indicator
  const [copied, setCopied] = useState(false);

  // Screen layout size reference for coordinate translation
  const desktopRef = useRef<HTMLDivElement | null>(null);
  const [cursorPos, setCursorPos] = useState({ x: 300, y: 180 });
  const [isMouseDown, setIsMouseDown] = useState(false);
  const lastLinePosRef = useRef<{ x: number; y: number } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Windows system clock
  const [pcTime, setPcTime] = useState('20:00');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setPcTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  const [hudMessage, setHudMessage] = useState<string | null>(null);
  const [hudTimer, setHudTimer] = useState<any>(null);

  const triggerHud = (message: string) => {
    setHudMessage(message);
    if (hudTimer) clearTimeout(hudTimer);
    const timer = setTimeout(() => {
      setHudMessage(null);
    }, 2000);
    setHudTimer(timer);
  };

  const handleSystemMediaAction = (action: string) => {
    playClickSound('toggle');
    if (action === 'volumeup') {
      triggerHud(`🔊 音量增加`);
    } else if (action === 'volumedown') {
      triggerHud(`🔉 音量降低`);
    } else if (action === 'volumemute') {
      triggerHud('🔇 静音 / 恢复');
    } else if (action === 'playpause') {
      triggerHud('⏯️ 播放 / 暂停');
    } else if (action === 'nexttrack') {
      triggerHud('⏭️ 下一首');
    } else if (action === 'prevtrack') {
      triggerHud('⏮️ 上一首');
    }
  };

  const handleIncomingControlEventRef = useRef<any>(null);

  // Handle incoming control packets from the phone
  const handleIncomingControlEvent = (rawEvent: any) => {
    // Map phone-client specific types to PcReceiver simplified types
    const event = { ...rawEvent };
    if (event.type === 'mouse-move') event.type = 'move';
    else if (event.type === 'mouse-click') event.type = 'click';
    else if (event.type === 'mouse-scroll') event.type = 'scroll';
    else if (event.type === 'key-press') event.type = 'key';
    else if (event.type === 'shortcut-press') event.type = 'shortcut';

    // Print real-time clicks and keyboard actions in browser receiver developer console
    if (event.type !== 'move') {
      console.log(`%c[PC Remote Action]%c Type: ${event.type} | Detail:`, 'color: #3b82f6; font-weight: bold;', 'color: inherit;', event);
    }

    // Add packets to live telemetry debug console
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(new Date().getMilliseconds()).padStart(3, '0');

    let payloadDesc = '';
    if (event.type === 'move') {
      payloadDesc = `dx: ${event.dx.toFixed(1)}, dy: ${event.dy.toFixed(1)}`;
    } else if (event.type === 'click') {
      payloadDesc = `button: ${event.button}, double: ${event.double || false}`;
    } else if (event.type === 'scroll') {
      payloadDesc = `dy: ${event.dy.toFixed(1)}`;
    } else if (event.type === 'key') {
      payloadDesc = `key: ${event.key}`;
    } else if (event.type === 'text') {
      payloadDesc = `content: ${event.content}`;
    } else {
      payloadDesc = JSON.stringify(event);
    }

    setPacketLogs(prev => [
      { id: Math.random().toString(), type: event.type, payload: payloadDesc, time: timeStr },
      ...prev.slice(0, 48)
    ]);

    // Handle cursor movement
    if (event.type === 'move') {
      if (!desktopRef.current) return;
      const rect = desktopRef.current.getBoundingClientRect();
      const sensitivity = 1.0;

      setCursorPos(prev => {
        let nx = prev.x + event.dx * sensitivity;
        let ny = prev.y + event.dy * sensitivity;

        // Keep cursor bound to desktop monitor frame
        nx = Math.max(0, Math.min(rect.width - 20, nx));
        ny = Math.max(0, Math.min(rect.height - 20, ny));

        // If paint board is open and autoDraw/isMouseDown is active, write lines
        if (!minimizedWindows.paint) {
          const drawOnCanvas = (autoDraw || isMouseDown);
          if (drawOnCanvas && lastLinePosRef.current) {
            drawPaintLine(lastLinePosRef.current.x, lastLinePosRef.current.y, nx, ny);
          }
          lastLinePosRef.current = { x: nx, y: ny };
        }

        return { x: nx, y: ny };
      });

      // Update latency metrics simulation
      setLatencyHistory(prev => [...prev.slice(1), 0.8 + Math.random() * 0.9]);
    }

    // Handle virtual desktop page scrolling
    if (event.type === 'scroll') {
      const activeWin = activeWindow;
      if (activeWin) {
        let scrollEl: HTMLElement | null = null;
        if (activeWin === 'notepad') {
          scrollEl = document.getElementById('win-notepad-textarea');
        } else {
          const winEl = document.querySelector(`[data-window-id="${activeWin}"]`);
          if (winEl) {
            scrollEl = winEl.querySelector('.overflow-y-auto');
          }
        }
        if (scrollEl) {
          // scrollEl.scrollTop increases when scrolling down
          // event.dy is sent from phone client (positive = drag down/scroll up, negative = drag up/scroll down)
          // We scroll by adding event.dy * 8 to scrollTop
          scrollEl.scrollTop += event.dy * 8;
        }
      }
    }

    // Handle mouse button clicks
    if (event.type === 'click') {
      const action = event.action || 'click';
      if (event.button === 'left') {
        if (action === 'click') {
          setIsMouseDown(true);
          setCursorPos(prev => {
            simulateDesktopClick(prev.x, prev.y, 'left');
            return prev;
          });
          setTimeout(() => setIsMouseDown(false), 120);
        } else if (action === 'down') {
          setIsMouseDown(true);
          setCursorPos(prev => {
            simulateDesktopClick(prev.x, prev.y, 'left');
            return prev;
          });
        } else if (action === 'up') {
          setIsMouseDown(false);
        }
      } else if (event.button === 'right') {
        if (action === 'click' || action === 'down') {
          playClickSound('toggle');
        }
      }
    }

    // Handle virtual keyboard character typing
    if (event.type === 'key') {
      const keyLower = event.key ? event.key.toLowerCase() : '';
      if (['volumeup', 'volumedown', 'volumemute', 'playpause', 'nexttrack', 'prevtrack'].includes(keyLower)) {
        handleSystemMediaAction(keyLower);
        return;
      }

      playClickSound('key');

      const activeEl = document.activeElement as HTMLTextAreaElement | HTMLInputElement | null;
      if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
        const input = activeEl;
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        const val = input.value;

        let newVal = val;
        let newCursorPos = start;

        if (event.key === 'Backspace') {
          if (start === end) {
            newVal = val.slice(0, Math.max(0, start - 1)) + val.slice(start);
            newCursorPos = Math.max(0, start - 1);
          } else {
            newVal = val.slice(0, start) + val.slice(end);
            newCursorPos = start;
          }
        } else if (event.key === 'Space' || event.key === ' ') {
          newVal = val.slice(0, start) + ' ' + val.slice(end);
          newCursorPos = start + 1;
        } else if (event.key === 'Enter') {
          newVal = val.slice(0, start) + '\n' + val.slice(end);
          newCursorPos = start + 1;
        } else if (event.key === 'Tab') {
          newVal = val.slice(0, start) + '    ' + val.slice(end);
          newCursorPos = start + 4;
        } else if (event.key && !['control', 'alt', 'shift', 'meta', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'escape', 'capslock', 'delete', 'insert', 'home', 'end', 'pageup', 'pagedown'].includes(event.key.toLowerCase())) {
          newVal = val.slice(0, start) + event.key + val.slice(end);
          newCursorPos = start + event.key.length;
        }

        input.value = newVal;
        input.selectionStart = input.selectionEnd = newCursorPos;

        // Trigger react onChange state binding
        if (input.id === 'win-notepad-textarea') {
          setNotepadText(newVal);
        } else {
          const ev = new Event('input', { bubbles: true });
          input.dispatchEvent(ev);
        }
      } else {
        // Fallback: If no input is focused but the notepad window is active, input into notepad anyway!
        if (activeWindow === 'notepad') {
          setNotepadText(prev => {
            if (event.key === 'Backspace') {
              return prev.slice(0, -1);
            } else if (event.key === 'Space' || event.key === ' ') {
              return prev + ' ';
            } else if (event.key === 'Enter') {
              return prev + '\n';
            } else if (event.key === 'Tab') {
              return prev + '    ';
            } else if (event.key && !['control', 'alt', 'shift', 'meta', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'escape', 'capslock', 'delete', 'insert', 'home', 'end', 'pageup', 'pagedown'].includes(event.key.toLowerCase())) {
              return prev + event.key;
            }
            return prev;
          });
        }
      }
    }

    // Handle bulk text transmissions
    if (event.type === 'text') {
      playClickSound('toggle');
      const activeEl = document.activeElement as HTMLTextAreaElement | HTMLInputElement | null;
      if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
        const input = activeEl;
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        const val = input.value;
        const newVal = val.slice(0, start) + event.content + val.slice(end);
        input.value = newVal;
        input.selectionStart = input.selectionEnd = start + event.content.length;
        if (input.id === 'win-notepad-textarea') {
          setNotepadText(newVal);
        } else {
          const ev = new Event('input', { bubbles: true });
          input.dispatchEvent(ev);
        }
      } else {
        setNotepadText(prev => prev + event.content);
      }
    }
  };
  handleIncomingControlEventRef.current = handleIncomingControlEvent;

  // Connect to websocket server as receiver
  const connectReceiver = () => {
    setStatus('connecting');
    try {
      const ws = new WebSocket(socketUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        const payload = {
          type: 'join',
          role: 'receiver',
          pin: pin
        };
        ws.send(JSON.stringify(payload));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setReceivedBytes(prev => prev + event.data.length);
          setPacketCount(prev => prev + 1);

          if (data.type === 'joined') {
            setStatus('connected');
            setClientCount(data.clientCount);
            setReceiverCount(data.receiverCount);
            setPeerConnected(data.clientCount > 0);
          } else if (data.type === 'peer-status') {
            setClientCount(data.clientCount);
            setReceiverCount(data.receiverCount);
            setPeerConnected(data.clientCount > 0);
          } else {
            // Process touchpad/mouse control events
            handleIncomingControlEventRef.current?.(data);
          }
        } catch (e) {
          console.error('Error parsing WS receiver message', e);
        }
      };

      ws.onclose = () => {
        setStatus('disconnected');
        setPeerConnected(false);
      };

      ws.onerror = () => {
        setStatus('disconnected');
        setPeerConnected(false);
      };

    } catch (e) {
      console.error('WS Receiver Connection failed', e);
      setStatus('disconnected');
    }
  };

  useEffect(() => {
    connectReceiver();

    // Register direct coupling if available
    if (onDirectControlRegister) {
      onDirectControlRegister((packet) => {
        // Direct simulation packets for local developer latency bypass
        setReceivedBytes(prev => prev + 120);
        setPacketCount(prev => prev + 1);
        handleIncomingControlEventRef.current?.(packet);
        if (!peerConnected) {
          setPeerConnected(true);
        }
      });
    }

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [socketUrl, pin]);

  // Handle local drawing on electronic board
  const drawPaintLine = (x1: number, y1: number, x2: number, y2: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const desktopEl = desktopRef.current;
    if (!ctx || !desktopEl) return;

    const desktopRect = desktopEl.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const canvasLeft = canvasRect.left - desktopRect.left;
    const canvasTop = canvasRect.top - desktopRect.top;

    // Calculate start and end coordinates relative to the canvas itself
    const cx1 = x1 - canvasLeft;
    const cy1 = y1 - canvasTop;
    const cx2 = x2 - canvasLeft;
    const cy2 = y2 - canvasTop;

    // Only draw if within bounds of the canvas
    if (cx2 >= 0 && cx2 <= canvasRect.width && cy2 >= 0 && cy2 <= canvasRect.height) {
      ctx.beginPath();
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // If we don't have a clean last point inside canvas, just draw a dot at end
      if (cx1 >= 0 && cx1 <= canvasRect.width && cy1 >= 0 && cy1 <= canvasRect.height) {
        ctx.moveTo(cx1, cy1);
      } else {
        ctx.moveTo(cx2, cy2);
      }
      ctx.lineTo(cx2, cy2);
      ctx.stroke();
    }
  };

  // Simulate clicking Windows taskbar icons or desktop window buttons
  const simulateDesktopClick = (x: number, y: number, button: 'left' | 'right' | 'middle') => {
    if (!desktopRef.current) return;
    const rect = desktopRef.current.getBoundingClientRect();
    const height = rect.height;

    // Convert relative coordinates to client coordinates
    const clientX = rect.left + x;
    const clientY = rect.top + y;

    // Find the element at these coordinates
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;

    if (element) {
      // 1. Determine which window (if any) was clicked and bring it to focus
      let activeWinKey: 'notepad' | 'paint' | 'terminal' | 'console' | 'help' | null = null;
      let currentEl: HTMLElement | null = element;
      while (currentEl && currentEl !== desktopRef.current) {
        const winId = currentEl.getAttribute('data-window-id');
        if (winId) {
          activeWinKey = winId as any;
          break;
        }
        currentEl = currentEl.parentElement;
      }

      if (activeWinKey) {
        setActiveWindow(activeWinKey);
      }

      // 2. Click and/or focus the element
      if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
        element.focus();
      }

      // Dispatch a standard click on the element
      element.click();
    }

    // Taskbar height is roughly 44px
    if (y >= height - 44) {
      // Clicking on taskbar icons!
      const width = rect.width;
      const center = width / 2;

      // taskbar icons are centered in Win11
      const clickOffsetFromCenter = x - center;
      if (Math.abs(clickOffsetFromCenter) < 140) {
        // We are on the icons cluster. Supporting 5 windows: console, paint, notepad, terminal, help
        const windowKeys: Array<'console' | 'paint' | 'notepad' | 'terminal' | 'help'> = ['console', 'paint', 'notepad', 'terminal', 'help'];
        const iconWidth = 36;
        const totalWidth = windowKeys.length * iconWidth;
        const startOffset = -totalWidth / 2;
        const iconIndex = Math.floor((clickOffsetFromCenter - startOffset) / iconWidth);
        const targetKey = windowKeys[iconIndex];
        if (targetKey) {
          setMinimizedWindows(prev => ({ ...prev, [targetKey]: !prev[targetKey] }));
          setActiveWindow(targetKey);
          playClickSound('click');
        }
      }
    }
  };

  // Clear paint board
  const clearPaintBoard = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    playClickSound('toggle');
  };

  // Copy code utility
  const copyScriptToClipboard = () => {
    navigator.clipboard.writeText(PYTHON_RECEIVER_SCRIPT);
    setCopied(true);
    playClickSound('toggle');
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleMinimize = (windowName: 'notepad' | 'paint' | 'terminal' | 'console' | 'help') => {
    setMinimizedWindows(prev => ({ ...prev, [windowName]: !prev[windowName] }));
    setActiveWindow(windowName);
    playClickSound('click');
  };

  // LAN IP Configurator states to assist user offline/local connection
  const [detectedIps, setDetectedIps] = useState<string[]>([]);
  const [customIp, setCustomIp] = useState(() => {
    const hn = window.location.hostname;
    if (hn === 'localhost' || hn === '127.0.0.1') {
      return ''; // Let user enter their actual LAN IP or load it dynamically
    }
    return hn;
  });
  const [customPort, setCustomPort] = useState(() => {
    return window.location.port || '3000';
  });
  const [isEditingIp, setIsEditingIp] = useState(false);

  // Fetch detected host IPs from our backend endpoint
  useEffect(() => {
    fetch('/api/ips')
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.ips)) {
          setDetectedIps(data.ips);
          // Auto-select first IP if none has been set and we are on localhost
          const hn = window.location.hostname;
          if ((hn === 'localhost' || hn === '127.0.0.1') && !customIp && data.ips.length > 0) {
            setCustomIp(data.ips[0]);
          }
        }
      })
      .catch(err => console.error('Failed to fetch local IPs', err));
  }, []);

  // Generate self QR Code & instructions based on custom local IP or window location
  const baseAppUrl = customIp
    ? `http://${customIp}${customPort ? ':' + customPort : ''}`
    : (window.location.origin + window.location.pathname);
  const appUrl = baseAppUrl.includes('?') ? `${baseAppUrl}&mode=phone` : `${baseAppUrl}?mode=phone`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(appUrl)}`;

  return (
    <div className="flex-1 flex flex-col gap-6 w-full max-w-4xl">

      {/* PC Simulator Stage Frame */}
      <div className="flex flex-col bg-[#0F1117] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">

        {/* Frame Top Header Bar (Desktop monitor look) */}
        <div className="h-10 bg-[#0A0C10] px-4 flex items-center justify-between border-b border-white/5 select-none">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold text-slate-300 tracking-wider uppercase font-sans">
              Windows 11 仿真接收端
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 font-mono bg-[#161922] border border-white/5 px-2 py-0.5 rounded">
              IP: {customIp || '192.168.1.100'}
            </span>
            <div className={`w-2.5 h-2.5 rounded-full ${status === 'connected' ? 'bg-blue-500 animate-pulse' : 'bg-amber-500'}`}></div>
          </div>
        </div>

        {/* Windows Desktop Container */}
        <div
          ref={desktopRef}
          id="win-desktop"
          className="relative w-full aspect-video bg-gradient-to-tr from-[#0A0C10] via-[#0E1B30] to-[#0F1117] text-white overflow-hidden p-4 select-none"
        >
          {/* System Media HUD Overlay */}
          <AnimatePresence>
            {hudMessage && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-neutral-900/95 border border-blue-500/30 text-blue-400 font-bold rounded-xl text-xs z-[10000] shadow-2xl flex items-center gap-2"
              >
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping"></div>
                {hudMessage}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Real-time moving Windows cursor */}
          <div
            className="absolute pointer-events-none transition-all duration-75 ease-out z-[9999]"
            style={{
              left: cursorPos.x,
              top: cursorPos.y,
            }}
          >
            <div className="relative">
              {/* Customized high visibility neon blue cursor */}
              <MousePointerClick className="w-5 h-5 text-blue-400 fill-blue-500 drop-shadow-[0_2px_8px_rgba(59,130,246,0.6)]" />
              {isMouseDown && (
                <span className="absolute top-2 left-2 w-3.5 h-3.5 bg-blue-400/50 rounded-full animate-ping pointer-events-none"></span>
              )}
            </div>
          </div>

          {/* GRID OF WINDOWS */}
          <div className="relative w-full h-full z-10">

            {/* WINDOW 1: SERVER CONSOLE & CONFIG (Always useful) */}
            <AnimatePresence>
              {!minimizedWindows.console && (
                <motion.div
                  data-window-id="console"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`absolute top-4 left-4 w-[360px] h-[395px] bg-[#161922]/95 border border-white/5 rounded-xl shadow-xl flex flex-col overflow-hidden ${activeWindow === 'console' ? 'ring-2 ring-blue-500/50' : ''}`}
                  onClick={() => setActiveWindow('console')}
                >
                  <div className="h-8 bg-[#0F1117] px-3 flex justify-between items-center border-b border-white/5 text-[10px] font-bold text-slate-300">
                    <span className="flex items-center gap-1.5"><Radio className="w-3.5 h-3.5 text-blue-400" /> 配对与状态控制台</span>
                    <button onClick={() => toggleMinimize('console')} className="text-slate-500 hover:text-white transition-colors cursor-pointer">✕</button>
                  </div>
                  <div className="flex-1 p-2.5 flex flex-col gap-2 text-xs overflow-y-auto bg-[#0A0C10]/95">
                    <div className="flex items-center gap-2">
                      <div className="px-2.5 py-1 bg-blue-500/15 border border-blue-500/30 text-blue-400 rounded-lg text-lg font-black tracking-widest font-mono shrink-0">
                        {pin}
                      </div>
                      <div className="text-[10px] text-slate-400 leading-normal">
                        <b className="text-slate-200">配对码 PIN</b><br />
                        输入配对码完成两端绑定
                      </div>
                    </div>

                    {/* Client Connection Stats */}
                    <div className="grid grid-cols-2 gap-2 bg-[#0A0C10]/60 p-2 border border-white/5 rounded-lg">
                      <div>
                        <span className="text-[9px] text-slate-500 block">手机状态</span>
                        <span className={`text-[11px] font-bold ${peerConnected ? 'text-blue-400' : 'text-slate-400'}`}>
                          {peerConnected ? '● 已配对 (1)' : '▲ 等待手机连接'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 block">服务器响应</span>
                        <span className="text-[11px] font-bold text-slate-300">
                          {latencyHistory[latencyHistory.length - 1].toFixed(1)} ms
                        </span>
                      </div>
                      <div className="col-span-2 border-t border-white/5 pt-1 flex justify-between text-[9px] text-slate-500">
                        <span>包数量: {packetCount}</span>
                        <span>缓存: {receivedBytes} B</span>
                      </div>
                    </div>

                    {/* LAN IP Configurator */}
                    <div className="bg-[#0A0C10]/60 p-2 border border-white/5 rounded-lg flex flex-col gap-1">
                      <div className="flex justify-between items-center text-[9px] text-slate-400">
                        <span>局域网访问地址:</span>
                        <button
                          onClick={() => setIsEditingIp(!isEditingIp)}
                          className="text-blue-400 hover:underline hover:text-blue-300 font-medium transition-colors"
                        >
                          {isEditingIp ? '确定' : '手动输入'}
                        </button>
                      </div>
                      {isEditingIp ? (
                        <div className="flex gap-1 mt-1">
                          <input
                            type="text"
                            value={customIp}
                            onChange={(e) => setCustomIp(e.target.value)}
                            placeholder="请输入您的电脑 IP (如 192.168.1.5)"
                            className="flex-1 bg-[#161922] border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white outline-none focus:border-blue-500/50 font-mono"
                          />
                          <input
                            type="text"
                            value={customPort}
                            onChange={(e) => setCustomPort(e.target.value)}
                            placeholder="端口"
                            className="w-12 bg-[#161922] border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white text-center outline-none focus:border-blue-500/50 font-mono"
                          />
                        </div>
                      ) : (
                        <div className="text-[11px] text-blue-400 font-bold font-mono select-text truncate">
                          {appUrl}
                        </div>
                      )}

                      {/* Quick-select detected IPs */}
                      {detectedIps.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 items-center">
                          <span className="text-[8px] text-slate-500 mr-1">可用 IP:</span>
                          {detectedIps.map((ip) => (
                            <button
                              key={ip}
                              onClick={() => {
                                setCustomIp(ip);
                                playClickSound('click');
                              }}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-all border ${customIp === ip
                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                                : 'bg-[#161922] text-slate-400 hover:text-slate-200 border-white/5'
                                }`}
                            >
                              {ip}
                            </button>
                          ))}
                        </div>
                      )}

                      <span className="text-[8px] text-slate-500 leading-normal mt-0.5">
                        {window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                          ? '已为您自动检测局域网 IP，请保持同一 WiFi。'
                          : '若在本地测试，请输入您电脑的局域网 IP 以修正扫码地址。'}
                      </span>
                    </div>

                    {/* QR Code Section */}
                    <div className="flex gap-3 items-center bg-[#161922] p-2 rounded-lg border border-white/5">
                      <img
                        src={qrCodeUrl}
                        alt="Mobile QR Code"
                        className="w-24 h-24 object-contain pointer-events-none select-none bg-white p-1 rounded shrink-0"
                      />
                      <div className="flex-1 text-[9px] text-slate-400 font-sans leading-relaxed">
                        <b className="text-white text-[10px]">扫描二维码控制</b><br />
                        使用手机浏览器扫码，直接作为无线物理触控板，支持真正的多指滑动！
                      </div>
                    </div>

                    <div className="text-[9px] text-slate-500 mt-1 text-center">
                      点击底部栏图标，随时展开或隐藏不同的应用窗口。
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* WINDOW 2: PAINT BOARD (电子画板) */}
            <AnimatePresence>
              {!minimizedWindows.paint && (
                <motion.div
                  data-window-id="paint"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`absolute top-4 right-4 w-[360px] h-[340px] bg-[#161922]/95 border border-white/5 rounded-xl shadow-xl flex flex-col overflow-hidden ${activeWindow === 'paint' ? 'ring-2 ring-blue-500/50' : ''}`}
                  onClick={() => setActiveWindow('paint')}
                >
                  <div className="h-8 bg-[#0F1117] px-3 flex justify-between items-center border-b border-white/5 text-[10px] font-bold text-slate-300">
                    <span className="flex items-center gap-1.5"><Palette className="w-3.5 h-3.5 text-blue-400" /> 电子手写画板</span>
                    <button onClick={() => toggleMinimize('paint')} className="text-slate-500 hover:text-white transition-colors cursor-pointer">✕</button>
                  </div>

                  {/* Drawing Area */}
                  <div className="flex-1 relative bg-[#0A0C10]">
                    <canvas
                      ref={canvasRef}
                      width={360}
                      height={240}
                      className="w-full h-full bg-[#0A0C10] cursor-crosshair"
                    />

                    {/* Floating tools bar */}
                    <div className="absolute bottom-2 left-2 right-2 h-9 bg-[#0F1117]/90 border border-white/5 rounded-lg p-1 px-2 flex justify-between items-center text-xs gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setBrushColor('#10b981')}
                          className={`w-4.5 h-4.5 rounded-full bg-emerald-500 border ${brushColor === '#10b981' ? 'border-white scale-110' : 'border-transparent'}`}
                          title="绿"
                        />
                        <button
                          onClick={() => setBrushColor('#3b82f6')}
                          className={`w-4.5 h-4.5 rounded-full bg-blue-500 border ${brushColor === '#3b82f6' ? 'border-white scale-110' : 'border-transparent'}`}
                          title="蓝"
                        />
                        <button
                          onClick={() => setBrushColor('#ef4444')}
                          className={`w-4.5 h-4.5 rounded-full bg-red-500 border ${brushColor === '#ef4444' ? 'border-white scale-110' : 'border-transparent'}`}
                          title="红"
                        />
                        <button
                          onClick={() => setBrushColor('#eab308')}
                          className={`w-4.5 h-4.5 rounded-full bg-yellow-500 border ${brushColor === '#eab308' ? 'border-white scale-110' : 'border-transparent'}`}
                          title="黄"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setAutoDraw(!autoDraw)}
                          className={`px-1.5 py-0.5 rounded text-[9px] border transition-all ${autoDraw ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                          title="开启后无需点击左键即可滑动绘画"
                        >
                          悬停绘图
                        </button>
                        <button
                          onClick={clearPaintBoard}
                          className="p-1 rounded bg-[#161922] border border-white/5 text-slate-300 hover:text-red-400 transition-colors"
                          title="清除画板"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* WINDOW 3: NOTEPAD (记事本 - standard typing test) */}
            <AnimatePresence>
              {!minimizedWindows.notepad && (
                <motion.div
                  data-window-id="notepad"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`absolute bottom-4 left-4 w-[360px] h-[190px] bg-[#161922]/95 border border-white/5 rounded-xl shadow-xl flex flex-col overflow-hidden ${activeWindow === 'notepad' ? 'ring-2 ring-blue-500/50' : ''}`}
                  onClick={() => setActiveWindow('notepad')}
                >
                  <div className="h-8 bg-[#0F1117] px-3 flex justify-between items-center border-b border-white/5 text-[10px] font-bold text-slate-300">
                    <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-blue-400" /> 记事本 - 无线打字演示.txt</span>
                    <button onClick={() => toggleMinimize('notepad')} className="text-slate-500 hover:text-white transition-colors cursor-pointer">✕</button>
                  </div>
                  <div className="flex-1 p-2 bg-[#0A0C10] relative">
                    <textarea
                      id="win-notepad-textarea"
                      value={notepadText}
                      onChange={(e) => setNotepadText(e.target.value)}
                      className="w-full h-full bg-[#0A0C10] border-0 outline-none resize-none text-slate-200 text-[11px] font-mono leading-relaxed focus:ring-0 p-2 select-text"
                      placeholder="等待手机键盘输入..."
                    />
                    <div className="absolute bottom-1 right-2 text-[8px] text-slate-600 font-mono">
                      字符: {notepadText.length} | UTF-8
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* WINDOW 4: PACKET TERMINAL LOGS (按键包监视器) */}
            <AnimatePresence>
              {!minimizedWindows.terminal && (
                <motion.div
                  data-window-id="terminal"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`absolute bottom-4 right-4 w-[360px] h-[190px] bg-[#0A0C10]/95 border border-blue-500/20 rounded-xl shadow-xl flex flex-col overflow-hidden ${activeWindow === 'terminal' ? 'ring-2 ring-blue-500/50' : ''}`}
                  onClick={() => setActiveWindow('terminal')}
                >
                  <div className="h-8 bg-[#0F1117] px-3 flex justify-between items-center border-b border-[#161922] text-[10px] font-mono text-blue-400">
                    <span className="flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5" /> cmd.exe - Touchpad Packet Stream</span>
                    <button onClick={() => toggleMinimize('terminal')} className="text-slate-500 hover:text-blue-400 transition-colors cursor-pointer">✕</button>
                  </div>
                  <div className="flex-1 p-2.5 font-mono text-[9px] text-blue-400/90 overflow-y-auto leading-relaxed select-text bg-[#0A0C10]">
                    {packetLogs.length === 0 ? (
                      <div className="text-neutral-600 text-center py-8">
                        [WAITING_PACKETS] 正在等待无线传输协议数据包...
                      </div>
                    ) : (
                      packetLogs.map((log) => (
                        <div key={log.id} className="flex gap-2 hover:bg-blue-500/5 px-1 py-0.5 rounded">
                          <span className="text-blue-700">{log.time}</span>
                          <span className="text-blue-300 font-bold uppercase">[{log.type}]</span>
                          <span className="text-blue-400/80 max-w-[200px] truncate">{log.payload}</span>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* WINDOW 5: HELP & SYSTEM INTRO (帮助与系统介绍) */}
            <AnimatePresence>
              {!minimizedWindows.help && (
                <motion.div
                  data-window-id="help"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`absolute top-[20px] left-1/2 -translate-x-1/2 w-[420px] h-[310px] bg-[#161922]/98 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden ${activeWindow === 'help' ? 'ring-2 ring-blue-500/50' : ''}`}
                  onClick={() => setActiveWindow('help')}
                >
                  <div className="h-8 bg-[#0F1117] px-3 flex justify-between items-center border-b border-white/5 text-[10px] font-bold text-slate-300">
                    <span className="flex items-center gap-1.5"><HelpCircle className="w-3.5 h-3.5 text-blue-400" /> AirTrack Pro - 系统使用帮助</span>
                    <button onClick={() => toggleMinimize('help')} className="text-slate-500 hover:text-white transition-colors cursor-pointer">✕</button>
                  </div>
                  <div className="flex-1 p-3.5 text-[11px] leading-relaxed overflow-y-auto bg-[#0A0C10]/95 text-slate-300 font-sans custom-scrollbar select-text">
                    <h4 className="text-xs font-bold text-white mb-1.5 flex items-center gap-1">🚀 简介：智能手机变成无线多功能触控板</h4>
                    <p className="text-slate-400 mb-3">
                      AirTrack Pro 是一套极低延时的多功能无线触控与键盘同步解决方案。您可以配对智能手机，体验丝滑的全手势光标操控！既支持当前浏览器内仿真桌面，也能直接控制您的真实实体操作系统。
                    </p>

                    <h4 className="text-xs font-bold text-white mb-1.5 flex items-center gap-1">🎯 手机端触控板控制手势</h4>
                    <ul className="list-disc pl-4 text-slate-400 mb-3 space-y-1">
                      <li><b>单指滑动：</b>控制鼠标光标移动</li>
                      <li><b>单指轻触：</b>模拟鼠标左键单击</li>
                      <li><b>双指轻触/长按：</b>模拟鼠标右键单击</li>
                      <li><b>双指拖动/侧边栏滑动：</b>模拟鼠标滑轮滚动（可在设置里开启自然滚动方向）</li>
                    </ul>

                    <h4 className="text-xs font-bold text-white mb-1.5 flex items-center gap-1">⌨️ 双模式键盘切换</h4>
                    <ul className="list-disc pl-4 text-slate-400 mb-3 space-y-1">
                      <li><b>普通键盘：</b>标准 QWERTY 全键盘布局，支持在文本区进行英文字符录入，回车、空格和退格键完美模拟。</li>
                      <li><b>扩展键盘：</b>内置 Fn 功能键、F1-F12 按键、常用小数字键盘（0-9, ., +, -）以及方向按键。</li>
                      <li><b>系统快捷键：</b>下方提供 <b>Ctrl+Alt+Del</b>、<b>Win+D</b> 等一键挂起或返回桌面功能。</li>
                    </ul>

                    <h4 className="text-xs font-bold text-white mb-1.5 flex items-center gap-1">🎨 电子画板 & 记事本仿真</h4>
                    <p className="text-slate-400 mb-3">
                      桌面的 <b>电子手写画板</b> 完美配合触控滑动输入，支持“悬停绘图”；<b>记事本</b> 演示则能即时呈现手机端的键盘打字成效。
                    </p>

                    <h4 className="text-xs font-bold text-white mb-1.5 flex items-center gap-1">🖥️ 无线连接真实实体电脑 (控制您的实际电脑光标)</h4>
                    <ol className="list-decimal pl-4 text-slate-400 mb-1 space-y-1">
                      <li><b>第一步：</b>在电脑终端执行：<code className="bg-black text-blue-400 px-1 rounded font-mono">pip install pyautogui websockets asyncio</code></li>
                      <li><b>第二步：</b>复制下方 <b>“连接实体电脑”</b> 模块里的 Python 接收代码，并保存为 <code className="bg-black text-blue-400 px-1 rounded font-mono">receiver.py</code></li>
                      <li><b>第三步：</b>在命令行运行该脚本并传入当前配对 PIN：<code className="bg-black text-blue-400 px-1.5 py-0.5 rounded font-mono">python receiver.py --pin {pin} --server {appUrl}</code></li>
                    </ol>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>

          {/* Windows 11 Centered Taskbar */}
          <div className="absolute bottom-0 left-0 right-0 h-11 bg-[#0F1117]/90 border-t border-white/5 px-4 flex justify-between items-center z-50 select-none">

            {/* Start icon / Left widgets */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-slate-500 font-mono tracking-widest bg-[#161922] px-2 py-0.5 rounded border border-white/5">
                WIN_11
              </span>
            </div>

            {/* Centered Taskbar App Launcher Icons */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#161922]/60 p-1 px-2.5 border border-white/5 rounded-full shadow-lg">
              {/* Home/Console Icon */}
              <button
                onClick={() => toggleMinimize('console')}
                className={`p-1.5 rounded-full transition-all active:scale-90 relative ${!minimizedWindows.console ? 'bg-blue-500/10 text-blue-400 scale-105' : 'text-slate-400 hover:bg-slate-800'}`}
                title="配对与状态控制台"
              >
                <Radio className="w-4 h-4" />
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-current rounded-full"></span>
              </button>

              {/* Paint Icon */}
              <button
                onClick={() => toggleMinimize('paint')}
                className={`p-1.5 rounded-full transition-all active:scale-90 relative ${!minimizedWindows.paint ? 'bg-blue-500/10 text-blue-400 scale-105' : 'text-slate-400 hover:bg-slate-800'}`}
                title="电子画板"
              >
                <Palette className="w-4 h-4" />
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-current rounded-full"></span>
              </button>

              {/* Notepad Icon */}
              <button
                onClick={() => toggleMinimize('notepad')}
                className={`p-1.5 rounded-full transition-all active:scale-90 relative ${!minimizedWindows.notepad ? 'bg-blue-500/10 text-blue-400 scale-105' : 'text-slate-400 hover:bg-slate-800'}`}
                title="记事本"
              >
                <FileText className="w-4 h-4" />
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-current rounded-full"></span>
              </button>

              {/* Terminal Icon */}
              <button
                onClick={() => toggleMinimize('terminal')}
                className={`p-1.5 rounded-full transition-all active:scale-90 relative ${!minimizedWindows.terminal ? 'bg-blue-500/10 text-blue-400 scale-105' : 'text-slate-400 hover:bg-slate-800'}`}
                title="网络包终端"
              >
                <Terminal className="w-4 h-4" />
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-current rounded-full"></span>
              </button>

              {/* Help & Intro Icon */}
              <button
                onClick={() => toggleMinimize('help')}
                className={`p-1.5 rounded-full transition-all active:scale-90 relative ${!minimizedWindows.help ? 'bg-blue-500/10 text-blue-400 scale-105' : 'text-slate-400 hover:bg-slate-800'}`}
                title="系统使用帮助"
              >
                <HelpCircle className="w-4 h-4" />
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-current rounded-full"></span>
              </button>
            </div>

            {/* Clock & Notification tray on the right */}
            <div className="flex items-center gap-2 text-[10px] font-medium text-slate-400 font-mono">
              <Wifi className="w-3.5 h-3.5 text-blue-400" />
              <Volume2 className="w-3.5 h-3.5" />
              <span>{pcTime}</span>
            </div>

          </div>

        </div>

      </div>

      {/* Copyable Python script section for REAL Windows Control */}
      <div className="bg-[#0F1117] border border-white/5 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-white/5 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-400" />
              连接实体电脑 (Windows / macOS / Linux)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              您可以在真实电脑中，用下面的 Python 脚本建立物理连接，控制实际的操作系统光标。
            </p>
          </div>

          <button
            onClick={copyScriptToClipboard}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer active:scale-[0.98] ${copied ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-[#161922] hover:bg-slate-800 text-slate-200 border border-white/5'}`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                已复制接收端代码
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                复制 Python 脚本
              </>
            )}
          </button>
        </div>

        {/* Instructions Tabs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-[#0A0C10] border border-white/5 rounded-xl leading-relaxed">
            <span className="text-blue-400 font-mono block mb-1">步骤 1: 安装依赖</span>
            打开终端或命令提示符，执行以下命令安装依赖：
            <pre className="mt-2 bg-black p-2.5 rounded border border-white/5 text-[10px] font-mono text-blue-400 overflow-x-auto">
              pip install pyautogui websockets asyncio
            </pre>
          </div>

          <div className="p-4 bg-[#0A0C10] border border-white/5 rounded-xl leading-relaxed">
            <span className="text-blue-400 font-mono block mb-1">步骤 2: 保存并运行</span>
            将复制的脚本保存为 <code className="text-slate-300 font-bold font-mono">receiver.py</code>，然后输入电脑对应的 PIN 运行它：
            <pre className="mt-2 bg-black p-2.5 rounded border border-white/5 text-[10px] font-mono text-blue-400 overflow-x-auto">
              python receiver.py --pin {pin} --server {appUrl}
            </pre>
          </div>

          <div className="p-4 bg-[#0A0C10] border border-white/5 rounded-xl leading-relaxed">
            <span className="text-blue-400 font-mono block mb-1">步骤 3: 体验真机操控</span>
            用手机打开此网页，并输入 PIN 配对成功后，在手机上的所有划动和打字就会<b>真实控制您眼前的物理电脑 cursor 啦</b>！
          </div>
        </div>
      </div>

    </div>
  );
}
