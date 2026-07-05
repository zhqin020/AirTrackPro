/**
 * Web Audio API synthesizer for clean, lag-free mechanical key click sounds.
 * Avoids loading external audio assets and provides instant feedback.
 */
export function playClickSound(type: 'key' | 'click' | 'toggle' | 'error') {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'key') {
      // Crisp mechanical key click
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.04);
      
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.04);
    } else if (type === 'click') {
      // Tactile touchpad click
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, audioCtx.currentTime);
      
      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    } else if (type === 'toggle') {
      // Clean sliding / setting toggle
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(500, audioCtx.currentTime + 0.06);
      
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.06);
    } else if (type === 'error') {
      // Soft error double beep
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, audioCtx.currentTime);
      
      gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    }
  } catch (err) {
    // Fail silently to prevent console pollution
  }
}
