import React, { useState, useEffect, useRef } from 'react';
import {
  Settings as SettingsIcon,
  Keyboard as KeyboardIcon,
  Grid3X3,
  Wifi,
  Battery,
  Sparkles,
  Check,
  AlertCircle,
  Play,
  RotateCcw,
  Volume2,
  Volume1,
  VolumeX,
  Lock,
  Moon,
  ChevronRight,
  ChevronLeft,
  SquareDot,
  Sliders
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TouchpadSettings, ActiveTab, TouchPoint } from '../types';
import { playClickSound } from '../utils/audio';

interface PhoneClientProps {
  socketUrl: string;
  defaultPin?: string;
  onSendMessage?: (msg: any) => void;
  // Allows embedding direct callback if running in same-tab sandbox mode
  onDirectControl?: (action: any) => void;
  isFullscreen?: boolean;
}

export default function PhoneClient({ socketUrl, defaultPin = '1111', onSendMessage, onDirectControl, isFullscreen = false }: PhoneClientProps) {
  // Connection state
  const [pin, setPin] = useState(defaultPin);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [peerConnected, setPeerConnected] = useState(false);
  const [clientCount, setClientCount] = useState(0);
  const [receiverCount, setReceiverCount] = useState(0);

  // Dynamic visible viewport height tracking
  const [viewportHeight, setViewportHeight] = useState<number>(typeof window !== 'undefined' ? window.innerHeight : 800);
  const [isMobileSize, setIsMobileSize] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth < 640 : false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
      setIsMobileSize(window.innerWidth < 640);
    };
    window.addEventListener('resize', handleResize);
    if (window.visualViewport) {
      const handleVisualResize = () => {
        setViewportHeight(window.visualViewport?.height ?? window.innerHeight);
        setIsMobileSize(window.innerWidth < 640);
      };
      window.visualViewport.addEventListener('resize', handleVisualResize);
      window.visualViewport.addEventListener('scroll', handleVisualResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        window.visualViewport?.removeEventListener('resize', handleVisualResize);
        window.visualViewport?.removeEventListener('scroll', handleVisualResize);
      };
    }
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const wsRef = useRef<WebSocket | null>(null);

  // Invisible input elements to capture native soft keyboard
  const nativeInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [nativeInputValue, setNativeInputValue] = useState('');
  const isComposingRef = useRef(false);

  // Settings matching Image 5
  const [settings, setSettings] = useState<TouchpadSettings>({
    showMouseButtons: true,
    leftHandMode: false,
    trackingSpeed: 5,
    scrollingSpeed: 5,
    naturalScrolling: true,
    showTouchFeedback: true,
    keyClickSound: true,
    preventSleep: true,
    lockRotation: false,
  });

  // Active Bottom Tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('touchpad');

  // Active Modifiers State
  const [activeModifiers, setActiveModifiers] = useState({
    ctrl: false,
    alt: false,
    shift: false,
    win: false,
  });

  // Touch tracking state
  const [touchFeedback, setTouchFeedback] = useState<TouchPoint | null>(null);
  const [isDraggingActive, setIsDraggingActive] = useState<boolean>(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchpadRef = useRef<HTMLDivElement | null>(null);
  const lastTouchPosRef = useRef<{ x: number; y: number } | null>(null);
  const isScrollingRef = useRef<boolean>(false);
  const lastScrollYRef = useRef<number | null>(null);
  const lastScrollXRef = useRef<number | null>(null);

  // Custom gesture tracking refs
  const lastTapTimeRef = useRef<number>(0);
  const lastTapPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingGestureRef = useRef<boolean>(false);
  const twoFingerStartRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const ignoreNextPointerClickRef = useRef<boolean>(false);

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('wireless_touchpad_settings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse settings', e);
      }
    }
  }, []);

  // Save settings helper
  const updateSetting = <K extends keyof TouchpadSettings>(key: K, value: TouchpadSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    localStorage.setItem('wireless_touchpad_settings', JSON.stringify(next));
    if (settings.keyClickSound) {
      playClickSound('toggle');
    }
  };

  // WebSocket Connection Manager
  const connect = () => {
    if (!pin || pin.length !== 4) {
      if (settings.keyClickSound) playClickSound('error');
      return;
    }

    setStatus('connecting');
    if (settings.keyClickSound) playClickSound('toggle');

    try {
      // Connect to WebSocket server
      const ws = new WebSocket(socketUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send join packet
        const payload = {
          type: 'join',
          role: 'client',
          pin: pin
        };
        ws.send(JSON.stringify(payload));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'joined') {
            setStatus('connected');
            setClientCount(data.clientCount);
            setReceiverCount(data.receiverCount);
            setPeerConnected(data.receiverCount > 0);
          } else if (data.type === 'peer-status') {
            setClientCount(data.clientCount);
            setReceiverCount(data.receiverCount);
            setPeerConnected(data.receiverCount > 0);
          }
        } catch (e) {
          console.error('Error parsing WS message', e);
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

    } catch (err) {
      console.error('WS Connection failed', err);
      setStatus('disconnected');
    }
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setStatus('disconnected');
    setPeerConnected(false);
    if (settings.keyClickSound) playClickSound('toggle');
  };

  // Quick auto-connect on mount if direct coupling is used
  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Prevent phone locking or sleeping when the active control touchpad is showing
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
        return;
      }
      try {
        wakeLock = await (navigator as any).wakeLock.request('screen');
      } catch (err: any) {
        console.warn('Wake Lock request failed:', err.message);
      }
    };

    if (settings.preventSleep && status === 'connected') {
      requestWakeLock();
    }

    const handleVisibilityChange = async () => {
      if (wakeLock !== null && document.visibilityState === 'visible' && settings.preventSleep && status === 'connected') {
        await requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().then(() => {
          wakeLock = null;
        }).catch((err: any) => {
          console.warn('Wake Lock release failed:', err);
        });
      }
    };
  }, [settings.preventSleep, status]);

  // Send packet helper (routes to WS and/or local callback)
  const sendControlPacket = (packet: any) => {
    if (onDirectControl) {
      onDirectControl(packet);
    }
    if (status === 'connected' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(packet));
    }
    if (onSendMessage) {
      onSendMessage(packet);
    }
  };

  // Handlers for the native keyboard input integration
  const handleNativeInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNativeInputValue(val);

    if (!isComposingRef.current) {
      if (val.length > 0) {
        for (const char of val) {
          sendControlPacket({
            type: 'key-press',
            key: char
          });
        }
        setNativeInputValue('');
      }
    }
  };

  const handleNativeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const key = e.key;
    if (key === 'Backspace' || key === 'Enter' || key === 'Tab' || key === 'Escape') {
      if (settings.keyClickSound) {
        playClickSound('key');
      }
      sendControlPacket({
        type: 'key-press',
        key: key
      });
    }
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    isComposingRef.current = false;
    const text = e.data;
    if (text) {
      for (const char of text) {
        sendControlPacket({
          type: 'key-press',
          key: char
        });
      }
    }
    setNativeInputValue('');
  };

  // Handle multi-touch (two-finger scroll)
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      isScrollingRef.current = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const avgY = (t1.clientY + t2.clientY) / 2;
      const avgX = (t1.clientX + t2.clientX) / 2;
      lastScrollYRef.current = avgY;
      lastScrollXRef.current = avgX;

      twoFingerStartRef.current = {
        time: Date.now(),
        x: avgX,
        y: avgY
      };

      // Prevent browser default gesture (e.g. pinch to zoom or scroll)
      if (e.cancelable) {
        e.preventDefault();
      }
    } else {
      isScrollingRef.current = false;
      lastScrollYRef.current = null;
      lastScrollXRef.current = null;
      twoFingerStartRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isScrollingRef.current || e.touches.length === 2) {
      if (e.cancelable) {
        e.preventDefault();
      }

      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentY = (t1.clientY + t2.clientY) / 2;
        const currentX = (t1.clientX + t2.clientX) / 2;

        if (twoFingerStartRef.current) {
          const dist = Math.hypot(
            currentX - twoFingerStartRef.current.x,
            currentY - twoFingerStartRef.current.y
          );
          // If they scroll/move more than 12 pixels, cancel the two-finger tap detection
          if (dist > 12) {
            twoFingerStartRef.current = null;
          }
        }

        if (lastScrollYRef.current !== null && lastScrollXRef.current !== null) {
          const dy = currentY - lastScrollYRef.current;
          const scrollSpeedMultiplier = settings.scrollingSpeed * 0.4;
          const scrollDy = settings.naturalScrolling ? dy : -dy;

          // Only send scroll if there's notable movement
          if (Math.abs(scrollDy) > 0.5) {
            sendControlPacket({
              type: 'mouse-scroll',
              dy: scrollDy * scrollSpeedMultiplier
            });
          }
        }

        lastScrollYRef.current = currentY;
        lastScrollXRef.current = currentX;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (twoFingerStartRef.current) {
      const elapsed = Date.now() - twoFingerStartRef.current.time;
      if (elapsed < 280) {
        // Two-finger tap detected! Trigger right click!
        triggerMouseClick(settings.leftHandMode ? 'left' : 'right');
        // Ignore the next pointer release click so we don't also fire a left-click
        ignoreNextPointerClickRef.current = true;
        setTimeout(() => {
          ignoreNextPointerClickRef.current = false;
        }, 300);
      }
      twoFingerStartRef.current = null;
    }

    if (isScrollingRef.current) {
      isScrollingRef.current = false;
      lastScrollYRef.current = null;
      lastScrollXRef.current = null;
      if (e.cancelable) {
        e.preventDefault();
      }
    }
  };

  // Handle Touchpad Interaction (mouse drag emulation)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = touchpadRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Set pointer capture to handle movement outside touchpad
    touchpadRef.current?.setPointerCapture(e.pointerId);

    const clientX = e.clientX;
    const clientY = e.clientY;

    // Check for double-tap to drag
    const now = Date.now();
    const timeDiff = now - lastTapTimeRef.current;
    let isDoubleTap = false;

    if (timeDiff < 300 && lastTapPosRef.current) {
      const dist = Math.hypot(
        clientX - lastTapPosRef.current.x,
        clientY - lastTapPosRef.current.y
      );
      if (dist < 45) {
        isDoubleTap = true;
      }
    }

    if (isDoubleTap) {
      isDraggingGestureRef.current = true;
      setIsDraggingActive(true);
      // Immediately press left mouse button down for dragging
      triggerMouseDown(settings.leftHandMode ? 'right' : 'left');
    } else {
      isDraggingGestureRef.current = false;
      setIsDraggingActive(false);
    }

    touchStartRef.current = {
      x: clientX,
      y: clientY,
      time: now
    };
    lastTouchPosRef.current = { x: clientX, y: clientY };
    isScrollingRef.current = false;
    lastScrollYRef.current = null;

    if (settings.showTouchFeedback) {
      setTouchFeedback({
        id: e.pointerId,
        x: clientX - rect.left,
        y: clientY - rect.top
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!lastTouchPosRef.current) return;

    const rect = touchpadRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clientX = e.clientX;
    const clientY = e.clientY;

    if (settings.showTouchFeedback) {
      setTouchFeedback({
        id: e.pointerId,
        x: clientX - rect.left,
        y: clientY - rect.top
      });
    }

    // Check if moving/dragging
    const dx = clientX - lastTouchPosRef.current.x;
    const dy = clientY - lastTouchPosRef.current.y;

    // Check for standard multi-touch or scroll mode simulation via shift/ctrl or simply standard swipe
    // If we are in Web, dragging with secondary button or holding certain modifier keys can trigger scroll.
    // Let's implement dragging to move cursor as primary.
    if (!isDraggingGestureRef.current && (e.buttons === 2 || e.shiftKey)) {
      // Scroll mode
      const scrollSpeedMultiplier = settings.scrollingSpeed * 0.4;
      const scrollDy = settings.naturalScrolling ? dy : -dy;

      if (Math.abs(scrollDy) > 0.5) {
        sendControlPacket({
          type: 'mouse-scroll',
          dy: scrollDy * scrollSpeedMultiplier
        });
      }
    } else {
      // Normal cursor movement or dragging movement
      const trackingMultiplier = settings.trackingSpeed * 0.3;
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        sendControlPacket({
          type: 'mouse-move',
          dx: dx * trackingMultiplier,
          dy: dy * trackingMultiplier,
          sensitivity: trackingMultiplier
        });
      }
    }

    lastTouchPosRef.current = { x: clientX, y: clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    touchpadRef.current?.releasePointerCapture(e.pointerId);
    setTouchFeedback(null);

    if (isDraggingGestureRef.current) {
      // Drag gesture ends, release left button
      triggerMouseUp(settings.leftHandMode ? 'right' : 'left');
      isDraggingGestureRef.current = false;
      setIsDraggingActive(false);
      lastTapTimeRef.current = 0;
      lastTapPosRef.current = null;
    } else {
      if (touchStartRef.current) {
        const duration = Date.now() - touchStartRef.current.time;
        const dist = Math.hypot(
          e.clientX - touchStartRef.current.x,
          e.clientY - touchStartRef.current.y
        );

        // Tap threshold: less than 12 pixels and under 250ms
        if (dist < 12 && duration < 250) {
          if (!ignoreNextPointerClickRef.current) {
            // Trigger left click
            triggerMouseClick(settings.leftHandMode ? 'right' : 'left');
            // Save tap info for potential double-tap drag on subsequent tap
            lastTapTimeRef.current = Date.now();
            lastTapPosRef.current = { x: e.clientX, y: e.clientY };
          }
        }
      }
    }

    touchStartRef.current = null;
    lastTouchPosRef.current = null;
    isScrollingRef.current = false;
  };

  const triggerMouseClick = (button: 'left' | 'middle' | 'right') => {
    if (settings.keyClickSound) {
      playClickSound('click');
    }

    // Send click down and click up in sequence
    sendControlPacket({
      type: 'mouse-click',
      button,
      action: 'click'
    });
  };

  const triggerMouseDown = (button: 'left' | 'middle' | 'right') => {
    if (settings.keyClickSound) {
      playClickSound('click');
    }
    sendControlPacket({
      type: 'mouse-click',
      button,
      action: 'down'
    });
  };

  const triggerMouseUp = (button: 'left' | 'middle' | 'right') => {
    sendControlPacket({
      type: 'mouse-click',
      button,
      action: 'up'
    });
  };

  // Keyboard button click handler
  const handleKeyClick = (key: string) => {
    if (settings.keyClickSound) {
      playClickSound('key');
    }

    // Check if any modifiers are active
    const activeKeys: string[] = [];
    if (activeModifiers.ctrl) activeKeys.push('ctrl');
    if (activeModifiers.alt) activeKeys.push('alt');
    if (activeModifiers.shift) activeKeys.push('shift');
    if (activeModifiers.win) activeKeys.push('win');

    if (activeKeys.length > 0) {
      sendControlPacket({
        type: 'shortcut-press',
        keys: [...activeKeys, key]
      });
      // Clear active modifiers after use to prevent getting stuck
      setActiveModifiers({ ctrl: false, alt: false, shift: false, win: false });
    } else {
      sendControlPacket({
        type: 'key-press',
        key
      });
    }
  };

  // Shortcut group action handler
  const handleShortcutClick = (keys: string[]) => {
    if (settings.keyClickSound) {
      playClickSound('toggle');
    }

    sendControlPacket({
      type: 'shortcut-press',
      keys
    });
  };

  // Touchpad double tap helper for right-click in desktop browsers
  const handleTouchpadDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    triggerMouseClick(settings.leftHandMode ? 'left' : 'right');
  };

  // Alphanumeric keys row layouts
  const qwertyRows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';'],
    ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Backspace'],
    ['Space', 'Enter']
  ];

  // Helper clock state
  const [simulatedTime, setSimulatedTime] = useState('20:00');
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setSimulatedTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    updateClock();
    const timer = setInterval(updateClock, 15000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      id={(isFullscreen || isMobileSize) ? "fullscreen-smartphone" : "simulated-smartphone"}
      className={
        (isFullscreen || isMobileSize)
          ? "relative w-full bg-neutral-950 flex flex-col overflow-hidden select-none"
          : "relative w-full max-w-[390px] h-[780px] bg-neutral-950 rounded-[48px] p-3.5 border-4 border-neutral-800 shadow-2xl flex flex-col overflow-hidden select-none"
      }
      style={
        (isFullscreen || isMobileSize)
          ? { height: `${viewportHeight}px`, minHeight: `${viewportHeight}px`, borderRadius: '0px', borderWidth: '0px', padding: '0px' }
          : undefined
      }
    >

      {/* Speaker and Camera notch (Only for desktop mockup, hidden on real fullscreen phone) */}
      {!isFullscreen && !isMobileSize && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-6 bg-neutral-950 rounded-b-2xl z-50 flex justify-center items-center gap-2 border-b border-x border-neutral-800/40">
          <div className="w-12 h-1 bg-neutral-800 rounded-full"></div>
          <div className="w-2 h-2 bg-neutral-900 rounded-full border border-neutral-800"></div>
        </div>
      )}

      {/* Screen container */}
      <div
        className={
          (isFullscreen || isMobileSize)
            ? "relative flex-1 bg-neutral-900 overflow-hidden flex flex-col"
            : "relative flex-1 bg-neutral-900 rounded-[34px] overflow-hidden flex flex-col border border-neutral-800"
        }
      >

        {/* Dynamic content area depending on connection */}
        {status !== 'connected' ? (
          /* Connecting Screen */
          <div className="flex-1 flex flex-col justify-center items-center px-6 bg-gradient-to-br from-[#161922] to-[#0D1017] text-center relative z-10">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shadow-lg shadow-blue-500/20 mb-5">
              <Sparkles className="w-8 h-8 text-blue-400 animate-pulse" />
            </div>

            <h2 className="text-xl font-bold text-white tracking-tight font-sans">AirTrack Pro</h2>
            <p className="text-xs text-slate-400 mt-2 max-w-[240px] leading-relaxed">
              请输入接收端电脑屏幕上显示的 4 位连接配对码
            </p>

            <div className="w-full mt-8 max-w-[220px]">
              <label className="block text-[10px] font-semibold text-slate-500 tracking-wider text-left uppercase mb-1">配对 PIN 码</label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="1111"
                  className="w-full h-12 bg-[#0F1117] border border-white/5 rounded-xl text-center text-xl font-bold tracking-[8px] text-blue-400 focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
            </div>

            <button
              onClick={connect}
              disabled={status === 'connecting'}
              className="w-full max-w-[220px] h-11 mt-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 cursor-pointer active:scale-[0.98]"
            >
              {status === 'connecting' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  连接中...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  即刻连接
                </>
              )}
            </button>

            {/* Simulated Demo Fast Connect Note */}
            <div className="mt-8 p-3.5 bg-[#0F1117] border border-white/5 rounded-xl max-w-[240px]">
              <p className="text-[10px] text-slate-500 leading-relaxed text-left">
                💡 <b className="text-slate-300">沙盒演示提示</b>: 右侧已为您自动运行 Windows 接收端。您可以点击上方按钮直接建立高仿真低延迟连接，或在真实手机浏览器中打开此页面连接。
              </p>
            </div>
          </div>
        ) : (
          /* Active Remote Control Screen */
          <div className="flex-1 flex flex-col bg-neutral-950">

            {/* Top controller header status bar */}
            <div className="h-8 bg-neutral-900 border-b border-white/5 px-4 flex justify-between items-center text-[10px] text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                <span>已连接电脑 (PIN: {pin})</span>
              </div>
              <button
                onClick={disconnect}
                className="text-slate-500 hover:text-red-400 transition-colors font-medium cursor-pointer"
              >
                断开
              </button>
            </div>

            {/* Touchpad Area (Sleek Royal Blue Theme) */}
            <div className="relative flex-1 min-h-[120px] bg-gradient-to-br from-[#161922] to-[#0D1017] p-4 flex flex-col justify-between overflow-hidden">

              {/* Background watermark label */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.03]">
                <span className="text-4xl font-extrabold tracking-widest text-blue-400">TOUCHPAD</span>
              </div>

              {/* Status info on touchpad */}
              <div className="flex justify-between items-start pointer-events-none select-none z-10 w-full">
                <span className="text-[10px] text-blue-400/60 font-mono tracking-wider">
                  SENS: {settings.trackingSpeed}x
                </span>
                <span className="text-[10px] text-blue-400/60 font-mono tracking-wider">
                  {peerConnected ? '● RECEIVER_ONLINE' : '▲ WAITING_RECEIVER'}
                </span>
              </div>

              {/* Real tactile touchpad interaction stage */}
              <div
                ref={touchpadRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                onDoubleClick={handleTouchpadDoubleClick}
                className="absolute inset-0 z-20 cursor-crosshair touch-none"
                title="单指轻触=左击，双指轻触=右击，双击并拖拽=拖拽"
              />

              {/* Centered typed text or scroll info indicator */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
                {isDraggingActive ? (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 0.8 }}
                    className="flex flex-col items-center gap-1 px-4 py-2 bg-blue-500/10 border border-blue-500/25 rounded-xl backdrop-blur-sm"
                  >
                    <span className="text-xs font-bold text-blue-400 tracking-wider animate-pulse flex items-center gap-1.5">
                      ✊ 正在拖拽 / 选择中...
                    </span>
                    <span className="text-[9px] text-blue-400/60 font-mono">
                      滑动控制，松开单指即释放
                    </span>
                  </motion.div>
                ) : activeTab === 'numpad' ? (
                  <motion.span
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 0.15 }}
                    className="text-4xl font-mono text-white tracking-widest font-extrabold"
                  >
                    1111
                  </motion.span>
                ) : (
                  <span className="text-[10px] text-blue-400/40 text-center max-w-[240px] leading-relaxed">
                    单指滑动控制光标 | 双指轻触右击<br />
                    双指滑动滚动 | 双击并滑动拖拽
                  </span>
                )}
              </div>

              {/* Interactive Visual Ripple Touch Feedback */}
              {settings.showTouchFeedback && touchFeedback && (
                <div
                  className="absolute w-12 h-12 border-2 border-blue-400/80 bg-blue-500/20 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 flex items-center justify-center"
                  style={{ left: touchFeedback.x, top: touchFeedback.y }}
                >
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-ping"></span>
                </div>
              )}
            </div>

            {/* Controls Cluster (Mouse Buttons + Keyboard Selection Buttons) */}
            <div className="w-full bg-[#0F1117] p-3 border-t border-white/5 flex flex-col gap-2 z-30 select-none pointer-events-auto">
              {/* Mouse Buttons (Optional) - Hidden when native keyboard is active to free up touchscreen height */}
              {settings.showMouseButtons && !isInputFocused && (
                <div className="w-full flex gap-1.5 h-11">
                  <button
                    onPointerDown={() => triggerMouseDown(settings.leftHandMode ? 'right' : 'left')}
                    onPointerUp={() => triggerMouseUp(settings.leftHandMode ? 'right' : 'left')}
                    onPointerLeave={() => triggerMouseUp(settings.leftHandMode ? 'right' : 'left')}
                    className={`flex-1 rounded-lg border border-white/5 active:bg-blue-600/30 transition-all font-medium text-[11px] flex items-center justify-center ${settings.leftHandMode ? 'bg-[#161922] text-slate-400' : 'bg-blue-600 text-white font-semibold'}`}
                  >
                    {settings.leftHandMode ? '右键 (R)' : '左键 (L)'}
                  </button>
                  <button
                    onPointerDown={() => triggerMouseDown('middle')}
                    onPointerUp={() => triggerMouseUp('middle')}
                    onPointerLeave={() => triggerMouseUp('middle')}
                    className="w-11 rounded-lg bg-[#161922] border border-white/5 active:bg-blue-600/20 text-[10px] text-slate-400 flex items-center justify-center"
                    title="中键"
                  >
                    M
                  </button>
                  <button
                    onPointerDown={() => triggerMouseDown(settings.leftHandMode ? 'left' : 'right')}
                    onPointerUp={() => triggerMouseUp(settings.leftHandMode ? 'left' : 'right')}
                    onPointerLeave={() => triggerMouseUp(settings.leftHandMode ? 'left' : 'right')}
                    className={`flex-1 rounded-lg border border-white/5 active:bg-blue-600/30 transition-all font-medium text-[11px] flex items-center justify-center ${settings.leftHandMode ? 'bg-blue-600 text-white font-semibold' : 'bg-[#161922] text-slate-400'}`}
                  >
                    {settings.leftHandMode ? '左键 (L)' : '右键 (R)'}
                  </button>
                </div>
              )}

              {/* Keyboard selection buttons (No text, compact, horizontal layout) */}
              <div className="w-full flex gap-1.5 h-9 bg-neutral-900/80 p-0.5 rounded-lg border border-white/5">
                {/* Control Tab */}
                <button
                  onClick={() => {
                    setActiveTab(activeTab === 'control' ? 'touchpad' : 'control');
                    if (settings.keyClickSound) playClickSound('toggle');
                  }}
                  className={`flex-1 rounded-md flex items-center justify-center transition-all cursor-pointer ${activeTab === 'control' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                  title="控制"
                >
                  <Sliders className="w-4 h-4" />
                </button>

                {/* Standard Keyboard (System native) */}
                <button
                  onClick={() => {
                    if (activeTab === 'keyboard') {
                      setActiveTab('touchpad');
                      nativeInputRef.current?.blur();
                      if (settings.keyClickSound) playClickSound('toggle');
                    } else {
                      setActiveTab('keyboard');
                      if (settings.keyClickSound) playClickSound('toggle');
                      setTimeout(() => nativeInputRef.current?.focus(), 150);
                    }
                  }}
                  className={`flex-1 rounded-md flex items-center justify-center transition-all cursor-pointer ${activeTab === 'keyboard' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                  title="普通键盘"
                >
                  <KeyboardIcon className="w-4 h-4" />
                </button>

                {/* Extended Keyboard */}
                <button
                  onClick={() => {
                    setActiveTab(activeTab === 'numpad' ? 'touchpad' : 'numpad');
                    if (settings.keyClickSound) playClickSound('toggle');
                  }}
                  className={`flex-1 rounded-md flex items-center justify-center transition-all cursor-pointer ${activeTab === 'numpad' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                  title="扩展键盘"
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>

                {/* Settings */}
                <button
                  onClick={() => {
                    setActiveTab(activeTab === 'settings' ? 'touchpad' : 'settings');
                    if (settings.keyClickSound) playClickSound('toggle');
                  }}
                  className={`flex-1 rounded-md flex items-center justify-center transition-all cursor-pointer ${activeTab === 'settings' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                  title="设置"
                >
                  <SettingsIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Invisible native textarea to trigger native soft keyboard */}
            <textarea
              ref={nativeInputRef}
              value={nativeInputValue}
              onChange={handleNativeInputChange}
              onKeyDown={handleNativeKeyDown}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              className="absolute opacity-0 pointer-events-none select-none"
              style={{ top: '-100px', left: '-100px', width: '1px', height: '1px' }}
              rows={1}
            />

            {/* Dynamic Panel Area (Standard keyboard, numpad/functional, control, or settings) */}
            <div
              className={`bg-[#111111] relative border-neutral-800/50 flex flex-col transition-all duration-300 ease-out ${(activeTab === 'numpad' || activeTab === 'settings' || activeTab === 'control' || (activeTab === 'keyboard' && isInputFocused))
                  ? 'h-[280px] border-t'
                  : 'h-0 border-t-0 overflow-hidden'
                }`}
            >
              <AnimatePresence mode="wait">
                {activeTab === 'touchpad' && (
                  <motion.div
                    key="intro"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="flex-1 flex flex-col justify-center items-center px-8 text-center text-neutral-500 select-none"
                  >
                    <Grid3X3 className="w-10 h-10 text-neutral-600 mb-2.5" />
                    <p className="text-xs text-neutral-400">触控板模式已就绪</p>
                    <p className="text-[10px] text-neutral-500 mt-1.5 max-w-[200px] leading-relaxed">
                      点击下方底栏选项卡，随时呼出<b>普通键盘</b>、<b>扩展键盘</b>或进行<b>高精度设置</b>。
                    </p>
                  </motion.div>
                )}

                {activeTab === 'control' && (
                  <motion.div
                    key="control"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 15 }}
                    className="flex-1 p-3 flex flex-col justify-between select-none text-xs text-neutral-200 h-full overflow-y-auto"
                  >
                    <div className="flex flex-col gap-2.5 h-full">

                      {/* Section 1: Modifier Keys (Toggles) */}
                      <div>
                        <div className="text-[10px] text-neutral-500 font-bold tracking-wider uppercase mb-1">修饰键锁定 (点击以启用组合键)</div>
                        <div className="grid grid-cols-4 gap-1.5">
                          <button
                            onClick={() => {
                              setActiveModifiers(prev => ({ ...prev, ctrl: !prev.ctrl }));
                              if (settings.keyClickSound) playClickSound('key');
                            }}
                            className={`h-9 rounded font-mono border transition-all flex items-center justify-center font-bold text-xs ${activeModifiers.ctrl
                                ? 'bg-blue-600 text-white border-blue-500 shadow shadow-blue-500/20'
                                : 'bg-[#1e1e1e] border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                              }`}
                          >
                            Ctrl
                          </button>
                          <button
                            onClick={() => {
                              setActiveModifiers(prev => ({ ...prev, alt: !prev.alt }));
                              if (settings.keyClickSound) playClickSound('key');
                            }}
                            className={`h-9 rounded font-mono border transition-all flex items-center justify-center font-bold text-xs ${activeModifiers.alt
                                ? 'bg-blue-600 text-white border-blue-500 shadow shadow-blue-500/20'
                                : 'bg-[#1e1e1e] border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                              }`}
                          >
                            Alt
                          </button>
                          <button
                            onClick={() => {
                              setActiveModifiers(prev => ({ ...prev, shift: !prev.shift }));
                              if (settings.keyClickSound) playClickSound('key');
                            }}
                            className={`h-9 rounded font-mono border transition-all flex items-center justify-center font-bold text-xs ${activeModifiers.shift
                                ? 'bg-blue-600 text-white border-blue-500 shadow shadow-blue-500/20'
                                : 'bg-[#1e1e1e] border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                              }`}
                          >
                            Shift
                          </button>
                          <button
                            onClick={() => {
                              setActiveModifiers(prev => ({ ...prev, win: !prev.win }));
                              if (settings.keyClickSound) playClickSound('key');
                            }}
                            className={`h-9 rounded font-mono border transition-all flex items-center justify-center font-bold text-xs ${activeModifiers.win
                                ? 'bg-blue-600 text-white border-blue-500 shadow shadow-blue-500/20'
                                : 'bg-[#1e1e1e] border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                              }`}
                          >
                            Win
                          </button>
                        </div>
                      </div>

                      {/* Section 2: Presets & Shortcuts */}
                      <div>
                        <div className="text-[10px] text-neutral-500 font-bold tracking-wider uppercase mb-1">常用系统组合键</div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            onClick={() => handleShortcutClick(['ctrl', 'alt', 'del'])}
                            className="h-9 rounded bg-[#1e1e1e] border border-neutral-800 hover:bg-neutral-800 active:bg-blue-600/20 transition-all font-mono text-[10px] text-red-400 font-semibold"
                          >
                            Ctrl+Alt+Del
                          </button>
                          <button
                            onClick={() => handleShortcutClick(['win', 'd'])}
                            className="h-9 rounded bg-[#1e1e1e] border border-neutral-800 hover:bg-neutral-800 active:bg-blue-600/20 transition-all font-mono text-[10px] text-blue-400"
                          >
                            Win+D (桌面)
                          </button>
                          <button
                            onClick={() => handleShortcutClick(['win', 'l'])}
                            className="h-9 rounded bg-[#1e1e1e] border border-neutral-800 hover:bg-neutral-800 active:bg-blue-600/20 transition-all font-mono text-[10px] text-neutral-300"
                          >
                            Win+L (锁屏)
                          </button>
                          <button
                            onClick={() => handleShortcutClick(['alt', 'tab'])}
                            className="h-9 rounded bg-[#1e1e1e] border border-neutral-800 hover:bg-neutral-800 active:bg-blue-600/20 transition-all font-mono text-[10px] text-neutral-300"
                          >
                            Alt+Tab (切换)
                          </button>
                          <button
                            onClick={() => handleShortcutClick(['ctrl', 'shift', 'esc'])}
                            className="h-9 rounded bg-[#1e1e1e] border border-neutral-800 hover:bg-neutral-800 active:bg-blue-600/20 transition-all font-mono text-[10px] text-neutral-300"
                          >
                            Ctrl+Shift+Esc
                          </button>
                          <button
                            onClick={() => handleShortcutClick(['alt', 'f4'])}
                            className="h-9 rounded bg-[#1e1e1e] border border-neutral-800 hover:bg-neutral-800 active:bg-blue-600/20 transition-all font-mono text-[10px] text-orange-400"
                          >
                            Alt+F4 (关闭)
                          </button>
                        </div>
                      </div>

                      {/* Section 3: Audio & Media Volume Controls */}
                      <div>
                        <div className="text-[10px] text-neutral-500 font-bold tracking-wider uppercase mb-1">系统音量与多媒体控制</div>
                        <div className="grid grid-cols-6 gap-1">
                          <button
                            onClick={() => handleKeyClick('volumedown')}
                            className="h-9 rounded bg-[#1a1c23] border border-neutral-800/80 hover:bg-neutral-800 flex flex-col items-center justify-center text-[9px] text-neutral-300"
                            title="音量减"
                          >
                            <Volume1 className="w-3.5 h-3.5 text-blue-400 mb-0.5" />
                            <span>音量-</span>
                          </button>
                          <button
                            onClick={() => handleKeyClick('volumemute')}
                            className="h-9 rounded bg-[#1a1c23] border border-neutral-800/80 hover:bg-neutral-800 flex flex-col items-center justify-center text-[9px] text-neutral-300"
                            title="静音"
                          >
                            <VolumeX className="w-3.5 h-3.5 text-red-400 mb-0.5" />
                            <span>静音</span>
                          </button>
                          <button
                            onClick={() => handleKeyClick('volumeup')}
                            className="h-9 rounded bg-[#1a1c23] border border-neutral-800/80 hover:bg-neutral-800 flex flex-col items-center justify-center text-[9px] text-neutral-300"
                            title="音量加"
                          >
                            <Volume2 className="w-3.5 h-3.5 text-emerald-400 mb-0.5" />
                            <span>音量+</span>
                          </button>
                          <button
                            onClick={() => handleKeyClick('prevtrack')}
                            className="h-9 rounded bg-[#1a1c23] border border-neutral-800/80 hover:bg-neutral-800 flex flex-col items-center justify-center text-[9px] text-neutral-400"
                            title="上一首"
                          >
                            <ChevronLeft className="w-3.5 h-3.5 text-neutral-400 mb-0.5" />
                            <span>上一首</span>
                          </button>
                          <button
                            onClick={() => handleKeyClick('playpause')}
                            className="h-9 rounded bg-[#1a1c23] border border-neutral-800/80 hover:bg-neutral-800 flex flex-col items-center justify-center text-[9px] text-neutral-400"
                            title="播放/暂停"
                          >
                            <Play className="w-3 h-3 text-neutral-400 mb-0.5 fill-neutral-400" />
                            <span>播/暂</span>
                          </button>
                          <button
                            onClick={() => handleKeyClick('nexttrack')}
                            className="h-9 rounded bg-[#1a1c23] border border-neutral-800/80 hover:bg-neutral-800 flex flex-col items-center justify-center text-[9px] text-neutral-400"
                            title="下一首"
                          >
                            <ChevronRight className="w-3.5 h-3.5 text-neutral-400 mb-0.5" />
                            <span>下一首</span>
                          </button>
                        </div>
                      </div>

                    </div>
                  </motion.div>
                )}

                {activeTab === 'keyboard' && (
                  <motion.div
                    key="native-keyboard-view"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 15 }}
                    className="flex-1 p-4 flex flex-col justify-center items-center text-center select-none cursor-pointer"
                    onClick={() => nativeInputRef.current?.focus()}
                  >
                    <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mb-2.5 animate-bounce">
                      <KeyboardIcon className="w-6 h-6 text-blue-400" />
                    </div>
                    <p className="text-xs font-semibold text-neutral-200">系统键盘已唤起</p>
                    <p className="text-[10px] text-neutral-500 mt-1 max-w-[220px] leading-normal">
                      正在使用您的手机系统自带输入法。如果您隐藏了键盘，请点击此区域重新呼出。
                    </p>

                    <div className="w-full max-w-[260px] mt-4 p-2 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-between">
                      <span className="text-neutral-400 text-[10px] truncate">
                        {isInputFocused ? '✍️ 键入字符将实时同步...' : '💤 键盘已隐藏，点击唤起'}
                      </span>
                      <span className="text-[8px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded uppercase font-mono">
                        {isInputFocused ? '活动' : '休眠'}
                      </span>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'numpad' && (
                  <motion.div
                    key="numpad"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 15 }}
                    className="flex-1 p-2 flex flex-col justify-between select-none"
                  >
                    {/* Implements exact keypad of Image 2 */}
                    <div className="grid grid-cols-7 gap-1 h-full text-[10px]">

                      {/* Row 1 */}
                      <button onClick={() => handleKeyClick('Escape')} className="h-10 rounded bg-[#2a2a2a] hover:bg-[#333] active:bg-emerald-600/30 text-neutral-200 font-bold border border-neutral-800">Esc</button>
                      <button onClick={() => handleKeyClick('Tab')} className="h-10 rounded bg-[#2a2a2a] hover:bg-[#333] active:bg-emerald-600/30 text-neutral-200 font-bold border border-neutral-800">Tab</button>
                      <button onClick={() => handleShortcutClick(['numlock'])} className="h-10 rounded bg-neutral-800 text-emerald-400 border border-neutral-700 font-bold flex flex-col items-center justify-center">
                        <span className="text-[7px] leading-none text-neutral-400">FN</span>
                        <span className="text-[9px] leading-none">NUM</span>
                      </button>
                      <button onClick={() => handleKeyClick('F1')} className="h-10 rounded bg-neutral-800 text-neutral-300 border border-neutral-700 flex flex-col items-center justify-center">
                        <span className="text-[7px] text-neutral-500">F1</span>
                        <span>←</span>
                      </button>
                      <button onClick={() => handleKeyClick('F2')} className="h-10 rounded bg-neutral-800 text-neutral-300 border border-neutral-700 flex flex-col items-center justify-center">
                        <span className="text-[7px] text-neutral-500">F2</span>
                        <span>/</span>
                      </button>
                      <button onClick={() => handleKeyClick('F3')} className="h-10 rounded bg-neutral-800 text-neutral-300 border border-neutral-700 flex flex-col items-center justify-center">
                        <span className="text-[7px] text-neutral-500">F3</span>
                        <span>*</span>
                      </button>
                      <button onClick={() => handleKeyClick('-')} className="h-10 rounded bg-[#202020] hover:bg-[#2c2c2c] text-neutral-200 border border-neutral-800">-</button>

                      {/* Row 2 */}
                      <button onClick={() => handleKeyClick('Insert')} className="h-10 rounded bg-[#2a2a2a] text-neutral-400 border border-neutral-800">Insert</button>
                      <button onClick={() => handleKeyClick('Home')} className="h-10 rounded bg-[#2a2a2a] text-neutral-400 border border-neutral-800">Home</button>
                      <button onClick={() => handleKeyClick('PageUp')} className="h-10 rounded bg-[#2a2a2a] text-neutral-400 border border-neutral-800">PgUp</button>
                      <button onClick={() => handleKeyClick('7')} className="h-10 rounded bg-[#1c1c1c] text-white border border-neutral-800 font-bold">
                        <span className="text-[7px] block text-neutral-500 leading-none">F4</span>
                        <span>7</span>
                      </button>
                      <button onClick={() => handleKeyClick('8')} className="h-10 rounded bg-[#1c1c1c] text-white border border-neutral-800 font-bold">
                        <span className="text-[7px] block text-neutral-500 leading-none">F5</span>
                        <span>8</span>
                      </button>
                      <button onClick={() => handleKeyClick('9')} className="h-10 rounded bg-[#1c1c1c] text-white border border-neutral-800 font-bold">
                        <span className="text-[7px] block text-neutral-500 leading-none">F6</span>
                        <span>9</span>
                      </button>
                      <button onClick={() => handleKeyClick('+')} className="h-10 rounded bg-[#202020] text-neutral-200 border border-neutral-800">+</button>

                      {/* Row 3 */}
                      <button onClick={() => handleKeyClick('Delete')} className="h-10 rounded bg-[#2a2a2a] text-neutral-400 border border-neutral-800">Delete</button>
                      <button onClick={() => handleKeyClick('End')} className="h-10 rounded bg-[#2a2a2a] text-neutral-400 border border-neutral-800">End</button>
                      <button onClick={() => handleKeyClick('PageDown')} className="h-10 rounded bg-[#2a2a2a] text-neutral-400 border border-neutral-800">PgDn</button>
                      <button onClick={() => handleKeyClick('4')} className="h-10 rounded bg-[#1c1c1c] text-white border border-neutral-800 font-bold">
                        <span className="text-[7px] block text-neutral-500 leading-none">F7</span>
                        <span>4</span>
                      </button>
                      <button onClick={() => handleKeyClick('5')} className="h-10 rounded bg-[#1c1c1c] text-white border border-neutral-800 font-bold">
                        <span className="text-[7px] block text-neutral-500 leading-none">F8</span>
                        <span>5</span>
                      </button>
                      <button onClick={() => handleKeyClick('6')} className="h-10 rounded bg-[#1c1c1c] text-white border border-neutral-800 font-bold">
                        <span className="text-[7px] block text-neutral-500 leading-none">F9</span>
                        <span>6</span>
                      </button>
                      <button onClick={() => handleKeyClick('=')} className="h-10 rounded bg-[#202020] text-neutral-200 border border-neutral-800">=</button>

                      {/* Row 4 */}
                      <div className="h-10 bg-transparent"></div> {/* empty spacer */}
                      <button onClick={() => handleKeyClick('ArrowUp')} className="h-10 rounded bg-[#2a2a2a] text-white border border-neutral-800 flex items-center justify-center">▲</button>
                      <div className="h-10 bg-transparent"></div> {/* empty spacer */}
                      <button onClick={() => handleKeyClick('1')} className="h-10 rounded bg-[#1c1c1c] text-white border border-neutral-800 font-bold">
                        <span className="text-[7px] block text-neutral-500 leading-none">F10</span>
                        <span>1</span>
                      </button>
                      <button onClick={() => handleKeyClick('2')} className="h-10 rounded bg-[#1c1c1c] text-white border border-neutral-800 font-bold">
                        <span className="text-[7px] block text-neutral-500 leading-none">F11</span>
                        <span>2</span>
                      </button>
                      <button onClick={() => handleKeyClick('3')} className="h-10 rounded bg-[#1c1c1c] text-white border border-neutral-800 font-bold">
                        <span className="text-[7px] block text-neutral-500 leading-none">F12</span>
                        <span>3</span>
                      </button>

                      {/* Vertical Enter Button */}
                      <button
                        onClick={() => handleKeyClick('Enter')}
                        className="row-span-2 h-[84px] rounded bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold flex flex-col justify-center items-center border border-emerald-700 cursor-pointer text-[9px]"
                      >
                        <span>enter</span>
                        <span className="text-[7px] font-normal text-emerald-200 mt-1">return</span>
                      </button>

                      {/* Row 5 */}
                      <button onClick={() => handleKeyClick('ArrowLeft')} className="h-10 rounded bg-[#2a2a2a] text-white border border-neutral-800 flex items-center justify-center">◀</button>
                      <button onClick={() => handleKeyClick('ArrowDown')} className="h-10 rounded bg-[#2a2a2a] text-white border border-neutral-800 flex items-center justify-center">▼</button>
                      <button onClick={() => handleKeyClick('ArrowRight')} className="h-10 rounded bg-[#2a2a2a] text-white border border-neutral-800 flex items-center justify-center">▶</button>
                      <button onClick={() => handleKeyClick('0')} className="col-span-2 h-10 rounded bg-[#1c1c1c] text-white border border-neutral-800 font-bold flex items-center justify-center text-xs">0</button>
                      <button onClick={() => handleKeyClick('.')} className="h-10 rounded bg-[#1c1c1c] text-white border border-neutral-800 font-bold">.</button>

                    </div>
                  </motion.div>
                )}

                {activeTab === 'settings' && (
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 15 }}
                    className="flex-1 bg-neutral-900 text-neutral-200 flex flex-col text-xs divide-y divide-neutral-800 text-[11px] overflow-y-auto"
                  >
                    {/* Settings Panel matching Image 5 */}

                    {/* Section 1: Core Toggles */}
                    <div className="p-2 flex flex-col gap-1 bg-neutral-950/20">
                      <div className="flex justify-between items-center py-1 px-2 hover:bg-white/5 rounded">
                        <span className="text-neutral-300">调整面板顺序</span>
                        <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
                      </div>

                      <div className="flex justify-between items-center py-1 px-2 hover:bg-white/5 rounded">
                        <span className="text-neutral-300">鼠标按钮</span>
                        <button
                          onClick={() => updateSetting('showMouseButtons', !settings.showMouseButtons)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${settings.showMouseButtons ? 'bg-emerald-500' : 'bg-neutral-800'}`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${settings.showMouseButtons ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </button>
                      </div>

                      <div className="flex justify-between items-center py-1 px-2 hover:bg-white/5 rounded">
                        <div>
                          <span className="text-neutral-300 block">空鼠按钮</span>
                          <span className="text-[8px] text-neutral-500">倾斜手机来移动光标</span>
                        </div>
                        <button
                          onClick={() => updateSetting('lockRotation', !settings.lockRotation)}
                          className="w-9 h-5 rounded-full p-0.5 bg-neutral-800/80 border border-neutral-700/60"
                        >
                          <div className="w-4 h-4 bg-neutral-600 rounded-full"></div>
                        </button>
                      </div>

                      <div className="flex justify-between items-center py-1 px-2 hover:bg-white/5 rounded">
                        <span className="text-neutral-300">单手滑动条</span>
                        <button
                          onClick={() => updateSetting('showTouchFeedback', !settings.showTouchFeedback)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${settings.showTouchFeedback ? 'bg-emerald-500' : 'bg-neutral-800'}`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${settings.showTouchFeedback ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </button>
                      </div>

                      <div className="flex justify-between items-center py-1 px-2 hover:bg-white/5 rounded">
                        <div>
                          <span className="text-neutral-300 block">左手模式</span>
                          <span className="text-[8px] text-neutral-500">翻转鼠标布局和控制方式</span>
                        </div>
                        <button
                          onClick={() => updateSetting('leftHandMode', !settings.leftHandMode)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${settings.leftHandMode ? 'bg-emerald-500' : 'bg-neutral-800'}`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${settings.leftHandMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </button>
                      </div>
                    </div>

                    {/* Section 2: Touchpad Group */}
                    <div className="p-3 flex flex-col gap-2">
                      <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-0.5">触控板</span>

                      {/* Tracking Speed */}
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center px-1">
                          <span className="text-neutral-300">跟踪速度</span>
                          <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                            <span>慢</span>
                            <span className="text-emerald-400 font-bold">{settings.trackingSpeed}</span>
                            <span>快</span>
                          </div>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={settings.trackingSpeed}
                          onChange={(e) => updateSetting('trackingSpeed', parseInt(e.target.value))}
                          className="w-full accent-emerald-500 h-1 bg-neutral-800 rounded-lg cursor-pointer"
                        />
                      </div>

                      {/* Scrolling Speed */}
                      <div className="flex flex-col gap-1 mt-1">
                        <div className="flex justify-between items-center px-1">
                          <span className="text-neutral-300">滚动速度</span>
                          <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                            <span>慢</span>
                            <span className="text-emerald-400 font-bold">{settings.scrollingSpeed}</span>
                            <span>快</span>
                          </div>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={settings.scrollingSpeed}
                          onChange={(e) => updateSetting('scrollingSpeed', parseInt(e.target.value))}
                          className="w-full accent-emerald-500 h-1 bg-neutral-800 rounded-lg cursor-pointer"
                        />
                      </div>

                      {/* Scrolling Direction */}
                      <div className="flex justify-between items-center py-1 mt-1 px-1">
                        <div>
                          <span className="text-neutral-300 block">滚动方向: 自然式</span>
                          <span className="text-[8px] text-neutral-500">内容随手指移动而滚动</span>
                        </div>
                        <button
                          onClick={() => updateSetting('naturalScrolling', !settings.naturalScrolling)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${settings.naturalScrolling ? 'bg-emerald-500' : 'bg-neutral-800'}`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${settings.naturalScrolling ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </button>
                      </div>

                      <div className="flex justify-between items-center py-1 mt-0.5 px-1 hover:bg-white/5 rounded">
                        <span className="text-neutral-300">高级设置</span>
                        <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
                      </div>
                    </div>

                    {/* Section 3: Inputs */}
                    <div className="p-3 flex flex-col gap-2">
                      <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-0.5">输入</span>

                      <div className="flex justify-between items-center py-1 px-1">
                        <span className="text-neutral-300">显示输入反馈</span>
                        <button
                          onClick={() => updateSetting('showTouchFeedback', !settings.showTouchFeedback)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${settings.showTouchFeedback ? 'bg-emerald-500' : 'bg-neutral-800'}`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${settings.showTouchFeedback ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </button>
                      </div>

                      <div className="flex justify-between items-center py-1 px-1">
                        <div>
                          <span className="text-neutral-300 block">拼写缓冲</span>
                          <span className="text-[8px] text-neutral-500">缓冲输入内容，按回车键发送</span>
                        </div>
                        <button
                          onClick={() => updateSetting('preventSleep', !settings.preventSleep)}
                          className="w-9 h-5 rounded-full p-0.5 bg-neutral-800/80 border border-neutral-700/60"
                        >
                          <div className="w-4 h-4 bg-neutral-600 rounded-full"></div>
                        </button>
                      </div>
                    </div>

                    {/* Section 4: General */}
                    <div className="p-3 flex flex-col gap-2">
                      <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-0.5">通用</span>

                      <div className="flex justify-between items-center py-1 px-1">
                        <div>
                          <span className="text-neutral-300 block">使用音量按钮</span>
                          <span className="text-[8px] text-neutral-500">用手机按钮控制电脑音量</span>
                        </div>
                        <button
                          onClick={() => updateSetting('preventSleep', !settings.preventSleep)}
                          className="w-9 h-5 rounded-full p-0.5 bg-neutral-800/80 border border-neutral-700/60"
                        >
                          <div className="w-4 h-4 bg-neutral-600 rounded-full"></div>
                        </button>
                      </div>

                      <div className="flex justify-between items-center py-1 px-1">
                        <span className="text-neutral-300">点击音效</span>
                        <button
                          onClick={() => updateSetting('keyClickSound', !settings.keyClickSound)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${settings.keyClickSound ? 'bg-emerald-500' : 'bg-neutral-800'}`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${settings.keyClickSound ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </button>
                      </div>

                      <div className="flex justify-between items-center py-1 px-1">
                        <div>
                          <span className="text-neutral-300 block">自动重连</span>
                          <span className="text-[8px] text-neutral-500">启动时重新连接上次的电脑</span>
                        </div>
                        <button
                          onClick={() => updateSetting('preventSleep', !settings.preventSleep)}
                          className="w-9 h-5 rounded-full p-0.5 bg-neutral-800/80 border border-neutral-700/60"
                        >
                          <div className="w-4 h-4 bg-neutral-600 rounded-full"></div>
                        </button>
                      </div>

                      <div className="flex justify-between items-center py-1 px-1">
                        <span className="text-neutral-300">防止屏幕休眠</span>
                        <button
                          onClick={() => updateSetting('preventSleep', !settings.preventSleep)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${settings.preventSleep ? 'bg-emerald-500' : 'bg-neutral-800'}`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${settings.preventSleep ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </button>
                      </div>

                      <div className="flex justify-between items-center py-1 px-1">
                        <span className="text-neutral-300">锁定旋转</span>
                        <button
                          onClick={() => updateSetting('lockRotation', !settings.lockRotation)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${settings.lockRotation ? 'bg-emerald-500' : 'bg-neutral-800'}`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${settings.lockRotation ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </button>
                      </div>
                    </div>

                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
        )}

        {/* Home navigation bar (simulated phone home indicator line) */}
        <div className="h-4 bg-neutral-950 flex justify-center items-center select-none">
          <div className="w-28 h-1 bg-neutral-700/80 rounded-full mb-1.5"></div>
        </div>

      </div>
    </div>
  );
}
