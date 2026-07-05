export interface TouchpadSettings {
  showMouseButtons: boolean;
  leftHandMode: boolean;
  trackingSpeed: number; // 1 to 10 multiplier
  scrollingSpeed: number; // 1 to 10 multiplier
  naturalScrolling: boolean;
  showTouchFeedback: boolean;
  keyClickSound: boolean;
  preventSleep: boolean;
  lockRotation: boolean;
}

export type ActiveTab = 'touchpad' | 'keyboard' | 'numpad' | 'settings' | 'control';

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
}
