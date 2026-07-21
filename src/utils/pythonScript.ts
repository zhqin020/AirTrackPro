export const PYTHON_RECEIVER_SCRIPT = `#!/usr/bin/env python3
"""
Wireless Touchpad - Windows Desktop Receiver Script
Requirements:
  pip install pyautogui websockets asyncio

Usage:
  python receiver.py --pin 1111 --server ws://your-applet-url/ws
"""

import asyncio
import json
import sys
import argparse
try:
    import pyautogui
    # Fail-safe: moving mouse to corner aborts the script
    pyautogui.FAILSAFE = True
    # Disable default 0.1-second pause to prevent movement queuing and lag
    pyautogui.PAUSE = 0
except ImportError:
    print("Warning: 'pyautogui' package is missing. Mouse & Keyboard simulation will only be printed.")
    pyautogui = None

def force_unhide_cursor():
    """Forces the operating system to show the mouse cursor if hidden by typing."""
    if sys.platform.startswith("win"):
        try:
            import ctypes
            class POINT(ctypes.Structure):
                _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
            pt = POINT()
            ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
            # 1. Absolute mouse move via SetCursorPos
            ctypes.windll.user32.SetCursorPos(pt.x + 1, pt.y + 1)
            ctypes.windll.user32.SetCursorPos(pt.x, pt.y)
            # 2. Relative hardware event via mouse_event
            # MOUSEEVENTF_MOVE = 0x0001
            ctypes.windll.user32.mouse_event(0x0001, 1, 1, 0, 0)
            ctypes.windll.user32.mouse_event(0x0001, -1, -1, 0, 0)
        except Exception:
            pass
    elif sys.platform == "darwin":
        try:
            from AppKit import NSCursor
            NSCursor.unhide()
        except Exception:
            pass
        try:
            import Quartz
            Quartz.CGDisplayShowCursor(0)
        except Exception:
            pass

def map_key(key: str) -> str:
    """Maps Web Keyboard events (like ArrowLeft, PageDown) to PyAutoGUI key strings."""
    k_lower = key.lower()
    if k_lower == "arrowleft":
        return "left"
    elif k_lower == "arrowright":
        return "right"
    elif k_lower == "arrowup":
        return "up"
    elif k_lower == "arrowdown":
        return "down"
    elif k_lower == "pageup":
        return "pgup"
    elif k_lower == "pagedown":
        return "pgdn"
    elif k_lower == "escape":
        return "esc"
    return k_lower

async def receiver_client(server_url, pin):
    print(f"Connecting to wireless touchpad server: {server_url} ...")
    
    try:
        import websockets
    except ImportError:
        print("Error: 'websockets' package is required. Run 'pip install websockets'")
        sys.exit(1)

    async for websocket in websockets.connect(server_url, ping_interval=20, ping_timeout=20):
        try:
            # 1. Join room with specified PIN
            join_payload = {
                "type": "join",
                "role": "receiver",
                "pin": pin
            }
            await websocket.send(json.dumps(join_payload))
            print(f"Successfully joined room PIN: {pin}. Listening for mobile commands...")

            # 2. Process incoming touchpad commands
            async for message in websocket:
                try:
                    data = json.loads(message)
                    event_type = data.get("type")

                    if event_type == "joined":
                        print(f"Server acknowledged join. Clients in room: {data.get('clientCount')}")
                    
                    elif event_type == "peer-status":
                        status = "connected" if data.get("connected") else "disconnected"
                        print(f"Mobile client {status}. Active clients in room: {data.get('clientCount')}")

                    elif event_type == "mouse-move":
                        dx = data.get("dx", 0)
                        dy = data.get("dy", 0)
                        sens = data.get("sensitivity", 1.0)
                        
                        # Apply sensitivity scaling
                        move_x = int(dx * sens)
                        move_y = int(dy * sens)
                        
                        if pyautogui:
                            pyautogui.moveRel(move_x, move_y, duration=0)
                            force_unhide_cursor()
                        else:
                            print(f"[Simulated Mouse Move] dx: {move_x}, dy: {move_y}")

                    elif event_type == "mouse-click":
                        btn = data.get("button", "left") # left, right, middle
                        action = data.get("action", "click") # click, down, up
                        print(f"[Remote Action] Mouse Click -> button: {btn}, action: {action}")
                        
                        if pyautogui:
                            if action == "click":
                                pyautogui.click(button=btn)
                            elif action == "down":
                                pyautogui.mouseDown(button=btn)
                            elif action == "up":
                                pyautogui.mouseUp(button=btn)
                            force_unhide_cursor()

                    elif event_type == "mouse-scroll":
                        amount = data.get("dy", 0)
                        print(f"[Remote Action] Mouse Scroll -> dy: {amount}")
                        if pyautogui:
                            # Windows scrolling amount is typically multiplied by 100 or 120
                            pyautogui.scroll(int(amount * 20))
                            force_unhide_cursor()

                    elif event_type == "key-press":
                        key = data.get("key", "")
                        if not key:
                            continue
                        
                        print(f"[Remote Action] Keyboard Input -> key: {key}")
                        if pyautogui:
                            # Map special keys to pyautogui keys
                            key_lower = map_key(key)

                            if key_lower == "backspace":
                                pyautogui.press("backspace")
                            elif key_lower in ("enter", "return"):
                                pyautogui.press("enter")
                            elif key_lower == "tab":
                                pyautogui.press("tab")
                            elif key_lower in ("escape", "esc"):
                                pyautogui.press("esc")
                            elif key_lower == "space":
                                pyautogui.press("space")
                            elif len(key) == 1:
                                pyautogui.write(key)
                            else:
                                pyautogui.press(key_lower)

                    elif event_type == "shortcut-press":
                        keys = data.get("keys", [])
                        print(f"[Remote Action] Shortcut Press -> keys: {keys}")
                        if pyautogui:
                            # Triggers hotkeys e.g. pyautogui.hotkey('ctrl', 'c')
                            pyautogui.hotkey(*[map_key(k) for k in keys])

                except json.JSONDecodeError:
                    print(f"Failed to parse incoming packet: {message}")
                except Exception as e:
                    print(f"Error executing command: {e}")

        except websockets.ConnectionClosed:
            print("Connection to server closed. Retrying in 3 seconds...")
            await asyncio.sleep(3)
        except Exception as e:
            print(f"Connection error: {e}. Retrying in 3 seconds...")
            await asyncio.sleep(3)

def main():
    parser = argparse.ArgumentParser(description="Wireless Touchpad Receiver")
    parser.add_argument("--pin", default="1111", help="4-digit room connection PIN (e.g., 1111)")
    parser.add_argument("--server", default="ws://localhost:3000/ws", help="Server WebSocket URL")
    args = parser.parse_args()

    # Convert standard HTTP urls to ws:// or wss:// if provided
    url = args.server
    if url.startswith("http://"):
        url = url.replace("http://", "ws://") + "/ws"
    elif url.startswith("https://"):
        url = url.replace("https://", "wss://") + "/ws"

    print("==============================================")
    print("      Android Wireless Touchpad Receiver       ")
    print("==============================================")
    print(f"PIN code:       {args.pin}")
    print(f"Target server:  {url}")
    print("Press Ctrl+C to exit.")
    print("Failsafe: Move physical mouse to screen edge to abort.")
    print("==============================================")

    try:
        asyncio.run(receiver_client(url, args.pin))
    except KeyboardInterrupt:
        print("\\nExiting receiver.")

if __name__ == "__main__":
    main()
`;
