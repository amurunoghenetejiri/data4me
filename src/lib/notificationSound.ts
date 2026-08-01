/**
 * Lightweight notification sounds generated with the Web Audio API.
 * No audio assets to ship, works offline, and respects the user's mute choice.
 */
import { normalizeType } from "@/lib/notificationTypes";

const MUTE_KEY = "d4m_notification_sound_muted";

export function isSoundMuted() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setSoundMuted(muted: boolean) {
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

type Tone = { freq: number; dur: number; delay: number; type?: OscillatorType };

const TONES: Record<string, Tone[]> = {
  // bright ascending chime for money in
  wallet: [
    { freq: 784, dur: 0.12, delay: 0 },
    { freq: 1047, dur: 0.18, delay: 0.1 },
  ],
  cashback: [
    { freq: 880, dur: 0.1, delay: 0 },
    { freq: 1175, dur: 0.1, delay: 0.09 },
    { freq: 1568, dur: 0.16, delay: 0.18 },
  ],
  referral: [
    { freq: 659, dur: 0.12, delay: 0 },
    { freq: 988, dur: 0.16, delay: 0.11 },
  ],
  // soft two-note ping for purchases
  data: [{ freq: 932, dur: 0.14, delay: 0 }, { freq: 1245, dur: 0.14, delay: 0.1 }],
  airtime: [{ freq: 880, dur: 0.14, delay: 0 }, { freq: 1109, dur: 0.14, delay: 0.1 }],
  electricity: [{ freq: 740, dur: 0.14, delay: 0 }, { freq: 1109, dur: 0.14, delay: 0.1 }],
  cable: [{ freq: 698, dur: 0.14, delay: 0 }, { freq: 1047, dur: 0.14, delay: 0.1 }],
  // urgent descending alert
  security: [
    { freq: 622, dur: 0.14, delay: 0, type: "square" },
    { freq: 466, dur: 0.2, delay: 0.15, type: "square" },
  ],
  promotion: [
    { freq: 587, dur: 0.1, delay: 0 },
    { freq: 784, dur: 0.1, delay: 0.09 },
    { freq: 988, dur: 0.14, delay: 0.18 },
  ],
  ai: [{ freq: 1318, dur: 0.09, delay: 0 }, { freq: 1568, dur: 0.14, delay: 0.08 }],
  system: [{ freq: 784, dur: 0.16, delay: 0 }],
};

let ctx: AudioContext | null = null;

function audioContext() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function playNotificationSound(rawType?: string | null) {
  try {
    if (isSoundMuted()) return;
    const ac = audioContext();
    if (!ac) return;

    const tones = TONES[normalizeType(rawType)] || TONES.system;
    const now = ac.currentTime;

    for (const tone of tones) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = tone.type || "sine";
      osc.frequency.value = tone.freq;

      const start = now + tone.delay;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur);

      osc.connect(gain).connect(ac.destination);
      osc.start(start);
      osc.stop(start + tone.dur + 0.02);
    }
  } catch {
    /* sound must never break the app */
  }
}
