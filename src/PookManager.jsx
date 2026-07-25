import { useRef, useState, useEffect, useCallback } from "react";

/* ═══ palette ═══════════════════════════════════════════════ */
const C = {
  bg: "#0B1211",
  panel: "#131E1C",
  panel2: "#0F1918",
  pad: "#1B2A27",
  padHot: "#263B35",
  line: "#283B36",
  line2: "#1E2E2A",
  bone: "#EDE8DA",
  dim: "#7A9089",
  dim2: "#556963",
  amber: "#F0A93B",
  cyan: "#45B3A6",
  rec: "#D2542A",
};

/* ═══ helpers ═══════════════════════════════════════════════ */
const L = (a, b, k) => a + (b - a) * k;
const rnd = (a, b) => a + Math.random() * (b - a);
const pad2 = (n) => String(n).padStart(2, "0");

function seeded(n) {
  let s = (n * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function makeCurve(k) {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

function makeNoise(ctx, brown) {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.022 * w) / 1.022;
      d[i] = last * 3.6;
    } else d[i] = w;
  }
  return buf;
}

/* ═══ fart voice ════════════════════════════════════════════ */
function burst(ctx, dest, p, t0, bufs) {
  const dur = Math.max(0.05, p.dur * rnd(0.9, 1.12));
  const jit = rnd(0.9, 1.12);
  const atk = p.attack ?? 0.012;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.linearRampToValueAtTime(p.gain, t0 + atk);
  if (p.hold) amp.gain.setValueAtTime(p.gain, t0 + dur * 0.68);
  amp.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = p.q ?? 5;
  lp.frequency.setValueAtTime(p.cut0, t0);
  lp.frequency.exponentialRampToValueAtTime(Math.max(60, p.cut1), t0 + dur);

  const shaper = ctx.createWaveShaper();
  shaper.curve = makeCurve(p.drive ?? 8);
  shaper.oversample = "2x";

  shaper.connect(lp);
  lp.connect(amp);
  amp.connect(dest);

  const osc = ctx.createOscillator();
  osc.type = p.wave ?? "sawtooth";
  osc.frequency.setValueAtTime(Math.max(20, p.f0 * jit), t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(18, p.f1 * jit), t0 + dur);
  const og = ctx.createGain();
  og.gain.value = p.oscAmt ?? 1;
  osc.connect(og);
  og.connect(shaper);
  osc.start(t0);
  osc.stop(t0 + dur + 0.06);

  if (p.wobDepth) {
    const lfo = ctx.createOscillator();
    lfo.type = p.wobWave ?? "triangle";
    lfo.frequency.setValueAtTime(Math.max(0.5, p.wobRate * rnd(0.85, 1.18)), t0);
    if (p.wobRate1) lfo.frequency.linearRampToValueAtTime(Math.max(0.5, p.wobRate1), t0 + dur);
    const lg = ctx.createGain();
    lg.gain.value = p.wobDepth;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.06);
  }

  if (p.noise) {
    const src = ctx.createBufferSource();
    src.buffer = p.white ? bufs.white : bufs.brown;
    src.loop = true;
    src.playbackRate.value = rnd(0.8, 1.25);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = p.noiseQ ?? 1.1;
    bp.frequency.setValueAtTime(Math.max(60, p.noiseF ?? 800), t0);
    bp.frequency.exponentialRampToValueAtTime(Math.max(60, p.noiseF1 ?? p.noiseF ?? 500), t0 + dur);
    const ng = ctx.createGain();
    ng.gain.value = p.noise;
    src.connect(bp);
    bp.connect(ng);
    ng.connect(shaper);
    src.start(t0, rnd(0, 1));
    src.stop(t0 + dur + 0.06);
  }

  if (p.sputRate) {
    const s = ctx.createOscillator();
    s.type = "square";
    s.frequency.value = p.sputRate * rnd(0.8, 1.25);
    const sg = ctx.createGain();
    sg.gain.value = p.gain * (p.sputDepth ?? 0.5);
    s.connect(sg);
    sg.connect(amp.gain);
    s.start(t0);
    s.stop(t0 + dur + 0.06);
  }
}

/* ═══ the library — 100 units in 12 families ════════════════ */
const NOTES = [
  ["A2", 110], ["C3", 130.8], ["D3", 146.8], ["E3", 164.8],
  ["G3", 196], ["A3", 220], ["C4", 261.6], ["D4", 293.7],
];

const FAMILIES = [
  {
    id: "classic", name: "קלאסי", color: "#F0A93B", count: 10,
    mods: ["קצר", "יבש", "חד", "נקי", "עגול", "מהוסס", "חצוף", "מהיר", "מנומס", "ממושך"],
    make: (k) => ({ p: { dur: L(0.2, 0.45, k), f0: L(250, 150, k), f1: L(125, 72, k), gain: 0.9, wobRate: L(27, 15, k), wobDepth: L(28, 56, k), noise: L(0.18, 0.32, k), noiseF: 900, noiseF1: 400, cut0: L(1150, 780, k), cut1: L(420, 290, k), drive: L(8, 14, k) } }),
  },
  {
    id: "brap", name: "בראפ", color: "#E8763B", count: 10,
    mods: ["רגיל", "שמן", "קרוע", "מתמשך", "זועם", "עמוק", "מתגלגל", "חורק", "אינסופי", "אפי"],
    make: (k) => ({ p: { dur: L(0.65, 1.9, k), f0: L(155, 105, k), f1: L(92, 62, k), gain: 0.95, hold: true, wobWave: "square", wobRate: L(21, 12, k), wobRate1: L(11, 6, k), wobDepth: L(42, 74, k), noise: 0.2, noiseF: 1000, noiseF1: 430, cut0: L(1300, 900, k), cut1: L(500, 330, k), drive: L(12, 19, k) } }),
  },
  {
    id: "squeak", name: "צייצן", color: "#E8D14A", count: 8,
    mods: ["עכבר", "ציוץ", "דק", "מצפצף", "חלקלק", "נמלט", "מחט", "אולטרה"],
    make: (k) => ({ p: { dur: L(0.16, 0.36, k), f0: L(370, 640, k), f1: L(680, 1150, k), gain: L(0.45, 0.58, k), q: L(8, 13, k), wobRate: L(33, 50, k), wobDepth: L(24, 46, k), noise: 0.1, white: true, noiseF: 2400, cut0: L(2400, 3600, k), cut1: L(2800, 4000, k), drive: 4 } }),
  },
  {
    id: "bass", name: "באס", color: "#6C8FD8", count: 10,
    mods: ["תת-קרקעי", "רעם", "מנוע", "אדמה", "תופת", "מערה", "לוויתן", "טקטוני", "געש", "שבר"],
    make: (k) => ({ p: { dur: L(1, 2.3, k), f0: L(90, 58, k), f1: L(46, 29, k), gain: 1, hold: true, wobRate: L(11, 5.5, k), wobDepth: L(9, 22, k), noise: L(0.1, 0.2, k), noiseF: 330, noiseF1: 140, cut0: L(520, 340, k), cut1: L(190, 115, k), drive: L(15, 22, k) } }),
  },
  {
    id: "burst", name: "רצף", color: "#D2542A", count: 8,
    mods: ["שלישייה", "מקלע", "טרטור", "דפיקות", "גמגום", "מורס", "ברד", "עצבני"],
    make: (k, r) => {
      const n = Math.round(L(3, 9, k));
      const gap = L(0.15, 0.085, k);
      const bursts = [];
      for (let i = 0; i < n; i++) bursts.push({ d: i * gap * (0.85 + r() * 0.3), g: 1 - i * 0.04 });
      return { bursts, p: { dur: L(0.13, 0.08, k), f0: L(235, 165, k), f1: L(150, 110, k), gain: 0.85, wobRate: L(28, 36, k), wobDepth: 48, noise: 0.3, noiseF: 1100, cut0: 1150, cut1: 600, drive: 12 } };
    },
  },
  {
    id: "wet", name: "רטוב", color: "#6FBF6A", count: 10,
    mods: ["רטוב", "בוצי", "נזלת", "מרק", "ביצה", "מלמול", "שלולית", "רפש", "גרגור", "טובעני"],
    make: (k) => ({ p: { dur: L(0.45, 1.2, k), f0: L(165, 120, k), f1: L(95, 70, k), gain: 0.85, wobRate: L(15, 10, k), wobDepth: L(40, 58, k), sputRate: L(32, 16, k), sputDepth: L(0.5, 0.72, k), noise: L(0.42, 0.72, k), noiseF: 1500, noiseF1: 560, cut0: L(1700, 1200, k), cut1: L(500, 380, k), drive: 12 } }),
  },
  {
    id: "tonal", name: "טונאלי", color: "#C77BD8", count: 8,
    mods: ["חצוצרה", "שופר", "קרן", "טובה", "קלרינט", "אבוב", "צופר", "אקורדיון"],
    make: (k) => ({ p: { wave: k > 0.5 ? "square" : "sawtooth", dur: L(0.55, 1.3, k), f0: L(260, 170, k), f1: L(215, 150, k), gain: 0.62, hold: true, wobRate: L(6.5, 4.5, k), wobDepth: L(7, 14, k), noise: 0.06, noiseF: 1200, cut0: L(2000, 1300, k), cut1: L(1500, 950, k), drive: L(5, 9, k) } }),
  },
  {
    id: "air", name: "אוויר", color: "#8FA8A0", count: 8,
    mods: ["נשיפה", "דליפה", "בלון", "צמיג", "לחישה", "אדים", "סילון", "רוח"],
    make: (k) => ({ p: { dur: L(0.55, 1.5, k), f0: L(130, 95, k), f1: L(100, 70, k), oscAmt: L(0.1, 0.26, k), gain: 0.8, hold: true, noise: 1, white: true, noiseF: L(1100, 750, k), noiseF1: L(430, 280, k), noiseQ: 0.75, cut0: L(2500, 1600, k), cut1: L(900, 620, k), drive: 3 } }),
  },
  {
    id: "exotic", name: "אקזוטי", color: "#45B3A6", count: 10,
    mods: ["טורבו", "חייזר", "מפוחית", "לייזר", "גלישה", "דופלר", "מנוע-על", "זיגזג", "ואו-ואו", "הפוך"],
    make: (k, r) => {
      const up = r() > 0.45;
      return { p: { dur: L(0.5, 1.5, k), f0: up ? L(95, 130, k) : L(330, 420, k), f1: up ? L(330, 500, k) : L(90, 70, k), gain: 0.9, hold: true, wobWave: r() > 0.5 ? "sine" : "triangle", wobRate: L(6, 14, k), wobRate1: L(30, 44, k), wobDepth: L(55, 100, k), noise: 0.28, noiseF: 800, noiseF1: 1600, cut0: L(800, 1400, k), cut1: L(2200, 900, k), drive: L(12, 18, k) } };
    },
  },
  {
    id: "echo", name: "הדהוד", color: "#5FA8D8", count: 6,
    mods: ["אמבטיה", "מנהרה", "חדר מדרגות", "קתדרלה", "מעלית", "חלל"],
    make: (k) => ({ echo: true, echoTime: L(0.11, 0.32, k), echoFb: L(0.35, 0.62, k), p: { dur: L(0.35, 0.7, k), f0: L(185, 130, k), f1: L(105, 78, k), gain: 0.85, wobRate: L(20, 13, k), wobDepth: 50, noise: 0.24, noiseF: 900, cut0: 1000, cut1: 380, drive: 12 } }),
  },
  {
    id: "boss", name: "בוס", color: "#E04A4A", count: 4,
    mods: ["הבוס", "קרקן", "אפוקליפסה", "סוף העולם"],
    make: (k) => ({ echo: true, echoTime: 0.16, echoFb: 0.45, p: { dur: L(2.4, 4.2, k), f0: L(165, 190, k), f1: L(48, 36, k), gain: 1, hold: true, wobRate: L(22, 26, k), wobRate1: L(7, 5, k), wobDepth: L(70, 95, k), sputRate: L(9, 6, k), sputDepth: 0.3, noise: 0.35, noiseF: 1300, noiseF1: 250, cut0: 1600, cut1: L(210, 150, k), drive: L(20, 24, k) } }),
  },
  {
    id: "melodic", name: "מלודי", color: "#F0C93B", count: 8,
    mods: NOTES.map((n) => n[0]),
    make: (k, r, i) => {
      const f = NOTES[i][1];
      return { p: { dur: 0.42, f0: f, f1: f * 0.94, gain: 0.75, hold: true, wave: "sawtooth", wobRate: 15, wobDepth: f * 0.06, noise: 0.12, noiseF: f * 6, cut0: f * 8, cut1: f * 3, drive: 10, q: 4 } };
    },
  },
];

const UNITS = (() => {
  const out = [];
  FAMILIES.forEach((f, fi) => {
    for (let i = 0; i < f.count; i++) {
      const k = f.count === 1 ? 0 : i / (f.count - 1);
      const r = seeded(fi * 977 + i * 31);
      const u = f.make(k, r, i);
      out.push({ id: out.length, fam: f.id, famName: f.name, color: f.color, name: f.mods[i], ...u });
    }
  });
  return out;
})();

/* ═══ drum voices ═══════════════════════════════════════════ */
function dKick(ctx, d, t, g = 1) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(155, t);
  o.frequency.exponentialRampToValueAtTime(44, t + 0.09);
  const a = ctx.createGain();
  a.gain.setValueAtTime(g, t);
  a.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
  o.connect(a);
  a.connect(d);
  o.start(t);
  o.stop(t + 0.45);
}
function dSnare(ctx, d, t, bufs, g = 0.75) {
  const n = ctx.createBufferSource();
  n.buffer = bufs.white;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1300;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(g, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  n.connect(hp);
  hp.connect(ng);
  ng.connect(d);
  n.start(t, Math.random());
  n.stop(t + 0.2);
  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(195, t);
  const og = ctx.createGain();
  og.gain.setValueAtTime(g * 0.45, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  o.connect(og);
  og.connect(d);
  o.start(t);
  o.stop(t + 0.12);
}
function dClap(ctx, d, t, bufs, g = 0.6) {
  [0, 0.011, 0.023].forEach((off, i) => {
    const n = ctx.createBufferSource();
    n.buffer = bufs.white;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1600;
    bp.Q.value = 1.4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(g * (i === 2 ? 1 : 0.7), t + off);
    ng.gain.exponentialRampToValueAtTime(0.001, t + off + (i === 2 ? 0.16 : 0.04));
    n.connect(bp);
    bp.connect(ng);
    ng.connect(d);
    n.start(t + off, Math.random());
    n.stop(t + off + 0.18);
  });
}
function dHat(ctx, d, t, bufs, open, g = 0.3) {
  const dur = open ? 0.26 : 0.045;
  const n = ctx.createBufferSource();
  n.buffer = bufs.white;
  n.playbackRate.value = 1.7;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7500;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(g, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(hp);
  hp.connect(ng);
  ng.connect(d);
  n.start(t, Math.random());
  n.stop(t + dur + 0.02);
}
function dPerc(ctx, d, t, bufs, g = 0.5) {
  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(180, t + 0.07);
  const a = ctx.createGain();
  a.gain.setValueAtTime(g, t);
  a.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  o.connect(a);
  a.connect(d);
  o.start(t);
  o.stop(t + 0.16);
}
function dClick(ctx, d, t, g = 0.5) {
  const o = ctx.createOscillator();
  o.type = "square";
  o.frequency.value = 1400;
  const a = ctx.createGain();
  a.gain.setValueAtTime(g, t);
  a.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  o.connect(a);
  a.connect(d);
  o.start(t);
  o.stop(t + 0.04);
}

/* ═══ beats ═════════════════════════════════════════════════ */
const BEATS = [
  { id: "boombap", name: "בום באפ", bpm: 90, swing: 0.16, k: "x------x--x-----", s: "----x-------x---", h: "x-x-x-x-x-x-x-x-", p: "" },
  { id: "trap", name: "טראפ", bpm: 140, swing: 0, k: "x-----x---x-----", c: "--------x-------", h: "x-xxx-xxx-xxxxxx", p: "" },
  { id: "house", name: "האוס", bpm: 124, swing: 0, k: "x---x---x---x---", c: "----x-------x---", h: "--o---o---o---o-", p: "" },
  { id: "techno", name: "טכנו", bpm: 132, swing: 0, k: "x---x---x---x---", s: "", h: "x-x-x-x-x-x-x-x-", o: "--o---o---o---o-", p: "----------x-----" },
  { id: "reggaeton", name: "רגאטון", bpm: 96, swing: 0, k: "x-------x-------", s: "---x--x----x--x-", h: "x-x-x-x-x-x-x-x-", p: "" },
  { id: "dnb", name: "דראם אנד באס", bpm: 172, swing: 0, k: "x---------x-----", s: "----x-------x---", h: "--x---x---x---x-", p: "" },
  { id: "funk", name: "פאנק", bpm: 104, swing: 0.1, k: "x--x------x-----", s: "----x-------x---", h: "xxxxxxxxxxxxxxxx", p: "" },
  { id: "rock", name: "רוק", bpm: 118, swing: 0, k: "x-------x-------", s: "----x-------x---", h: "x-x-x-x-x-x-x-x-", p: "" },
  { id: "mizrahi", name: "מזרחי", bpm: 108, swing: 0, k: "x-----x-x-------", s: "----x-------x---", h: "x-xxx-x-x-xxx-x-", p: "--x-------x---x-" },
  { id: "lofi", name: "לו-פיי", bpm: 76, swing: 0.2, k: "x---------x-----", s: "----x-------x---", h: "x-x-x-x-x-x-x-x-", p: "" },
  { id: "disco", name: "דיסקו", bpm: 118, swing: 0, k: "x---x---x---x---", c: "----x-------x---", o: "--o---o---o---o-", h: "x-x-x-x-x-x-x-x-", p: "" },
  { id: "click", name: "מטרונום", bpm: 100, swing: 0, k: "", s: "", h: "", p: "", click: "x---x---x---x---" },
];

/* ═══ component ═════════════════════════════════════════════ */
export default function PookManager() {
  const [armed, setArmed] = useState(false);
  const [fartVol, setFartVol] = useState(0.85);
  const [drumVol, setDrumVol] = useState(0.7);
  const [level, setLevel] = useState(0);
  const [total, setTotal] = useState(0);
  const [active, setActive] = useState(null);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState(false);
  const [beatIdx, setBeatIdx] = useState(0);
  const [bpm, setBpm] = useState(BEATS[0].bpm);
  const [step, setStep] = useState(0);
  const [quantize, setQuantize] = useState(true);
  const [recording, setRecording] = useState(false);
  const [loop, setLoop] = useState([]);

  const A = useRef(null);
  const raf = useRef(null);
  const flash = useRef(null);
  const T = useRef({ next: 0, step: 0, start: 0, timer: null });
  const S = useRef({});
  S.current = { bpm, beatIdx, drumVol, loop, playing, recording, quantize };

  /* ── engine ── */
  const init = useCallback(() => {
    if (A.current) return A.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    const fart = ctx.createGain();
    const drums = ctx.createGain();
    fart.connect(master);
    drums.connect(master);
    master.connect(limiter);
    limiter.connect(an);
    an.connect(ctx.destination);
    A.current = { ctx, master, fart, drums, an, data: new Uint8Array(an.fftSize), bufs: { white: makeNoise(ctx, false), brown: makeNoise(ctx, true) } };
    A.current.fart.gain.value = fartVol;
    A.current.drums.gain.value = drumVol;
    return A.current;
  }, [fartVol, drumVol]);

  useEffect(() => { if (A.current) A.current.fart.gain.value = fartVol; }, [fartVol]);
  useEffect(() => { if (A.current) A.current.drums.gain.value = drumVol; }, [drumVol]);

  const meter = useCallback(() => {
    const a = A.current;
    if (!a) return;
    a.an.getByteTimeDomainData(a.data);
    let sum = 0;
    for (let i = 0; i < a.data.length; i++) {
      const v = (a.data[i] - 128) / 128;
      sum += v * v;
    }
    setLevel((p) => Math.max(Math.sqrt(sum / a.data.length) * 2.3, p * 0.9));
    raf.current = requestAnimationFrame(meter);
  }, []);

  const voice = useCallback((i, when) => {
    const u = UNITS[i];
    const a = init();
    const { ctx, fart, bufs } = a;
    let dest = fart;
    if (u.echo) {
      const dly = ctx.createDelay(1);
      dly.delayTime.value = u.echoTime ?? 0.15;
      const fb = ctx.createGain();
      fb.gain.value = u.echoFb ?? 0.42;
      const damp = ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = 1200;
      const wet = ctx.createGain();
      wet.gain.value = 0.5;
      dly.connect(damp);
      damp.connect(fb);
      fb.connect(dly);
      dly.connect(wet);
      wet.connect(fart);
      const bus = ctx.createGain();
      bus.connect(fart);
      bus.connect(dly);
      dest = bus;
    }
    const list = u.bursts ?? [{ d: 0 }];
    list.forEach((b) => burst(ctx, dest, { ...u.p, dur: u.p.dur * (b.s ?? 1), gain: u.p.gain * (b.g ?? 1) }, when + b.d, bufs));
  }, [init]);

  /* ── transport ── */
  const stepDur = useCallback(() => 60 / S.current.bpm / 4, []);

  const tick = useCallback(() => {
    const a = A.current;
    if (!a) return;
    const { ctx, drums, bufs } = a;
    const beat = BEATS[S.current.beatIdx];
    const sd = stepDur();
    while (T.current.next < ctx.currentTime + 0.12) {
      const i = T.current.step;
      const sw = i % 2 === 1 ? (beat.swing || 0) * sd : 0;
      const t = T.current.next + sw;
      if (beat.k && beat.k[i] === "x") dKick(ctx, drums, t);
      if (beat.s && beat.s[i] === "x") dSnare(ctx, drums, t, bufs);
      if (beat.c && beat.c[i] === "x") dClap(ctx, drums, t, bufs);
      if (beat.h && (beat.h[i] === "x" || beat.h[i] === "o")) dHat(ctx, drums, t, bufs, beat.h[i] === "o", beat.h[i] === "o" ? 0.24 : 0.28);
      if (beat.o && beat.o[i] === "o") dHat(ctx, drums, t, bufs, true, 0.22);
      if (beat.p && beat.p[i] === "x") dPerc(ctx, drums, t, bufs);
      if (beat.click && beat.click[i] === "x") dClick(ctx, drums, t, i === 0 ? 0.7 : 0.4);
      S.current.loop.forEach((h) => { if (h.step === i) voice(h.u, t); });
      const shown = i;
      setTimeout(() => setStep(shown), Math.max(0, (T.current.next - ctx.currentTime) * 1000));
      T.current.next += sd;
      T.current.step = (i + 1) % 16;
      if (T.current.step === 0) T.current.start = T.current.next;
    }
  }, [stepDur, voice]);

  const stop = useCallback(() => {
    if (T.current.timer) clearInterval(T.current.timer);
    T.current.timer = null;
    setPlaying(false);
    setRecording(false);
  }, []);

  const start = useCallback(() => {
    const a = init();
    if (a.ctx.state === "suspended") a.ctx.resume();
    setArmed(true);
    if (!raf.current) raf.current = requestAnimationFrame(meter);
    T.current.next = a.ctx.currentTime + 0.06;
    T.current.start = T.current.next;
    T.current.step = 0;
    setPlaying(true);
    if (T.current.timer) clearInterval(T.current.timer);
    T.current.timer = setInterval(tick, 25);
  }, [init, meter, tick]);

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (T.current.timer) clearInterval(T.current.timer);
    if (flash.current) clearTimeout(flash.current);
  }, []);

  /* restart clock when tempo or beat changes so the grid stays true */
  useEffect(() => {
    if (!playing || !A.current) return;
    T.current.next = A.current.ctx.currentTime + 0.06;
    T.current.start = T.current.next;
    T.current.step = 0;
  }, [bpm, beatIdx]); // eslint-disable-line

  /* ── fire a fart ── */
  const fire = useCallback((i) => {
    const a = init();
    const { ctx } = a;
    if (ctx.state === "suspended") ctx.resume();
    setArmed(true);
    if (!raf.current) raf.current = requestAnimationFrame(meter);

    const sd = stepDur();
    const mod16 = (n) => ((n % 16) + 16) % 16;
    let when = ctx.currentTime + 0.02;
    let landStep = null;
    if (S.current.playing) {
      const elapsed = ctx.currentTime - T.current.start;
      if (S.current.quantize) {
        const idx = Math.ceil(elapsed / sd);
        when = T.current.start + idx * sd;
        landStep = mod16(idx);
      } else {
        landStep = mod16(Math.round(elapsed / sd));
      }
    }
    voice(i, when);
    if (S.current.recording && landStep !== null) {
      setLoop((l) => (l.length > 31 ? l : [...l, { step: landStep, u: i, k: Date.now() + Math.random() }]));
    }
    setTotal((n) => n + 1);
    setActive(i);
    if (flash.current) clearTimeout(flash.current);
    flash.current = setTimeout(() => setActive(null), 160);
  }, [init, meter, stepDur, voice]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && e.target.tagName === "INPUT") return;
      if (e.code === "Space") { e.preventDefault(); S.current.playing ? stop() : start(); return; }
      const n = parseInt(e.key, 10);
      if (!isNaN(n)) fire(n === 0 ? Math.floor(Math.random() * UNITS.length) : n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fire, start, stop]);

  /* ── derived ── */
  const shown = UNITS.filter((u) => (tab === "all" || u.fam === tab) && (query === "" || u.name.includes(query) || u.famName.includes(query)));
  const segs = 28;
  const lit = Math.min(segs, Math.round(level * segs));
  const beat = BEATS[beatIdx];

  const btn = (on, col) => ({
    background: on ? col : "transparent",
    borderColor: on ? col : C.line,
    color: on ? C.bg : C.dim,
  });

  return (
    <div dir="rtl" className="min-h-screen w-full font-mono" style={{ background: C.bg, color: C.bone }}>
      <style>{`
        .pk { transition: transform 90ms ease-out, background 120ms, border-color 120ms; }
        .pk:active { transform: scale(0.95); }
        @media (prefers-reduced-motion: reduce) { .pk, .pk:active { transition: none; transform: none; } }
        .pk-rng { -webkit-appearance:none; appearance:none; height:4px; border-radius:2px; outline:none; }
        .pk-rng::-webkit-slider-thumb { -webkit-appearance:none; width:13px; height:22px; border-radius:2px; background:${C.amber}; cursor:pointer; }
        .pk-rng::-moz-range-thumb { width:13px; height:22px; border:0; border-radius:2px; background:${C.amber}; cursor:pointer; }
        .pk-scroll::-webkit-scrollbar { height:6px; width:6px; }
        .pk-scroll::-webkit-scrollbar-thumb { background:${C.line}; border-radius:3px; }
      `}</style>

      <div className="mx-auto max-w-4xl px-3 pb-12 pt-5 sm:px-5">
        {/* header */}
        <header className="flex items-end justify-between border-b pb-3" style={{ borderColor: C.line }}>
          <div>
            <h1 className="text-xl font-bold sm:text-3xl" style={{ letterSpacing: "0.16em" }}>POOK&nbsp;MANAGER</h1>
            <p className="mt-1 text-xs" style={{ color: C.dim }}>תחנת פליטות · 100 יחידות · 12 מקצבים</p>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: armed ? C.cyan : C.dim }}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: armed ? C.cyan : C.line, boxShadow: armed ? `0 0 8px ${C.cyan}` : "none" }} />
            {armed ? "פעיל" : "ממתין"}
          </div>
        </header>

        {/* meter */}
        <section className="mt-3 rounded-sm border p-3" style={{ borderColor: C.line, background: C.panel }}>
          <div className="flex items-baseline justify-between text-xs" style={{ color: C.dim }}>
            <span>לחץ מוצא</span>
            <span>סה״כ <b style={{ color: C.amber }}>{total}</b></span>
          </div>
          <div className="mt-2 flex gap-px" aria-hidden="true">
            {Array.from({ length: segs }).map((_, i) => {
              const on = i < lit;
              const col = i > segs - 4 ? C.rec : i > segs - 9 ? C.amber : C.cyan;
              return <span key={i} className="h-3 flex-1 rounded-sm" style={{ background: on ? col : C.pad, boxShadow: on ? `0 0 6px ${col}66` : "none" }} />;
            })}
          </div>
        </section>

        {/* rhythm section */}
        <section className="mt-3 rounded-sm border" style={{ borderColor: C.line, background: C.panel }}>
          <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: C.line2 }}>
            <span className="text-xs" style={{ color: C.dim }}>מקצב</span>
            <span className="text-xs font-bold" style={{ color: C.cyan }}>{beat.name}</span>
            <span className="mr-auto text-xs" style={{ color: C.dim2 }}>רווח = נגן/עצור</span>
          </div>

          <div className="pk-scroll flex gap-1 overflow-x-auto px-3 py-2">
            {BEATS.map((b, i) => (
              <button key={b.id} onClick={() => { setBeatIdx(i); setBpm(b.bpm); }}
                className="pk shrink-0 rounded-sm border px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                style={btn(i === beatIdx, C.cyan)}>
                {b.name}
              </button>
            ))}
          </div>

          {/* step grid */}
          <div className="flex gap-1 px-3 pb-2">
            {Array.from({ length: 16 }).map((_, i) => {
              const hits = loop.filter((h) => h.step === i);
              const on = playing && step === i;
              return (
                <div key={i} className="flex-1">
                  <div className="h-6 rounded-sm border" style={{ background: on ? C.amber : i % 4 === 0 ? C.pad : C.panel2, borderColor: on ? C.amber : C.line2 }} />
                  <div className="mt-1 flex justify-center gap-px" style={{ height: 4 }}>
                    {hits.slice(0, 3).map((h) => (
                      <span key={h.k} className="h-1 w-1 rounded-full" style={{ background: UNITS[h.u].color }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* transport */}
          <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
            <button onClick={() => (playing ? stop() : start())}
              className="pk rounded-sm border px-4 py-2 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              style={btn(playing, C.cyan)}>
              {playing ? "עצור" : "נגן"}
            </button>
            <button onClick={() => { if (!playing) start(); setRecording((r) => !r); }}
              className="pk rounded-sm border px-3 py-2 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              style={btn(recording, C.rec)}>
              ● הקלט
            </button>
            <button onClick={() => setLoop([])}
              className="pk rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              style={{ borderColor: C.line, color: C.dim }}>
              נקה לולאה {loop.length > 0 && `(${loop.length})`}
            </button>
            <button onClick={() => setQuantize((q) => !q)}
              className="pk rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              style={btn(quantize, C.amber)}>
              יישור לביט
            </button>
            <label className="flex flex-1 items-center gap-2 text-xs" style={{ color: C.dim, minWidth: 150 }}>
              {bpm} BPM
              <input className="pk-rng flex-1" type="range" min="60" max="180" value={bpm}
                onChange={(e) => setBpm(parseInt(e.target.value, 10))} style={{ background: C.line }} aria-label="קצב" />
            </label>
          </div>
        </section>

        {/* mixer */}
        <section className="mt-3 flex flex-col gap-3 rounded-sm border p-3 sm:flex-row" style={{ borderColor: C.line, background: C.panel }}>
          <label className="flex flex-1 items-center gap-2 text-xs" style={{ color: C.dim }}>
            פליצות
            <input className="pk-rng flex-1" type="range" min="0" max="1" step="0.01" value={fartVol}
              onChange={(e) => setFartVol(parseFloat(e.target.value))} style={{ background: C.line }} aria-label="עוצמת פליצות" />
            <span style={{ color: C.bone, width: 34, textAlign: "left" }}>{Math.round(fartVol * 100)}</span>
          </label>
          <label className="flex flex-1 items-center gap-2 text-xs" style={{ color: C.dim }}>
            מוזיקה
            <input className="pk-rng flex-1" type="range" min="0" max="1" step="0.01" value={drumVol}
              onChange={(e) => setDrumVol(parseFloat(e.target.value))} style={{ background: C.line }} aria-label="עוצמת מוזיקה" />
            <span style={{ color: C.bone, width: 34, textAlign: "left" }}>{Math.round(drumVol * 100)}</span>
          </label>
          <button onClick={() => fire(Math.floor(Math.random() * UNITS.length))}
            className="pk rounded-sm border px-4 py-2 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            style={{ borderColor: C.amber, color: C.amber }}>
            אקראי
          </button>
        </section>

        {/* library */}
        <section className="mt-3 rounded-sm border" style={{ borderColor: C.line, background: C.panel }}>
          <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: C.line2 }}>
            <span className="text-xs" style={{ color: C.dim }}>ספריית צלילים</span>
            <span className="text-xs" style={{ color: C.dim2 }}>{shown.length}/100</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש"
              className="mr-auto w-24 rounded-sm border px-2 py-1 text-xs focus:outline-none sm:w-40"
              style={{ background: C.panel2, borderColor: C.line, color: C.bone }} />
          </div>

          <div className="pk-scroll flex gap-1 overflow-x-auto px-3 py-2">
            <button onClick={() => setTab("all")}
              className="pk shrink-0 rounded-sm border px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              style={btn(tab === "all", C.bone)}>הכל</button>
            {FAMILIES.map((f) => (
              <button key={f.id} onClick={() => setTab(f.id)}
                className="pk shrink-0 rounded-sm border px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                style={btn(tab === f.id, f.color)}>{f.name}</button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1 p-3 pt-1 sm:grid-cols-5 md:grid-cols-6">
            {shown.map((u) => {
              const hot = active === u.id;
              return (
                <button key={u.id} onClick={() => fire(u.id)}
                  className="pk flex flex-col items-start gap-1 rounded-sm border px-2 py-2 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  style={{ background: hot ? C.padHot : C.pad, borderColor: hot ? u.color : C.line2 }}>
                  <span className="h-1 w-full rounded-full" style={{ background: u.color, opacity: hot ? 1 : 0.55 }} />
                  <span className="w-full truncate text-xs font-bold" style={{ color: C.bone }}>{u.name}</span>
                  <span className="text-xs" style={{ color: C.dim2, fontSize: 10 }}>{u.famName} {pad2(u.id + 1)}</span>
                </button>
              );
            })}
            {shown.length === 0 && (
              <p className="col-span-full py-6 text-center text-xs" style={{ color: C.dim }}>אין תוצאות. נסה שם אחר או בחר קטגוריה.</p>
            )}
          </div>
        </section>

        <p className="mt-3 text-center text-xs" style={{ color: C.dim2 }}>
          מקלדת: 1–9 יחידות · 0 אקראי · רווח נגן/עצור
        </p>
      </div>
    </div>
  );
}
