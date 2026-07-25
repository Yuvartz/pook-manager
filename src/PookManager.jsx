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
const rnd = (a, b) => a + Math.random() * (b - a);

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

/* ═══ real farts — recorded samples, sliced & de-duped ══════ */
const REAL = [
  { slug: "real_11", name: "קטנצ'יק תת-קרקעי", dur: 0.47, color: "#6C8FD8" },
  { slug: "real_15", name: "ארוך-נשימה", dur: 0.63, color: "#E8763B" },
  { slug: "real_21", name: "חורק", dur: 0.80, color: "#E8763B" },
  { slug: "real_19", name: "זועם", dur: 0.89, color: "#E8763B" },
  { slug: "real_02", name: "מתגלגל", dur: 1.68, color: "#E8763B" },
  { slug: "real_01", name: "ענק קרוע", dur: 2.59, color: "#E8763B" },
  { slug: "real_05", name: "ענק בראפ", dur: 3.09, color: "#E8763B" },
  { slug: "real_03", name: "צורם", dur: 0.91, color: "#E8D14A" },
  { slug: "real_10", name: "חד", dur: 0.99, color: "#E8D14A" },
  { slug: "real_13", name: "צפצפן", dur: 1.29, color: "#E8D14A" },
  { slug: "real_07", name: "קטנצ'יק עסיסי", dur: 0.43, color: "#F0A93B" },
  { slug: "real_17", name: "חטוף", dur: 0.56, color: "#F0A93B" },
  { slug: "real_16", name: "מהוסס", dur: 0.60, color: "#F0A93B" },
  { slug: "real_14", name: "מנומס", dur: 0.82, color: "#F0A93B" },
  { slug: "real_09", name: "יבש", dur: 0.92, color: "#F0A93B" },
  { slug: "real_20", name: "פוט", dur: 1.04, color: "#F0A93B" },
  { slug: "real_18", name: "קלאסי", dur: 1.10, color: "#F0A93B" },
  { slug: "real_08", name: "מערה", dur: 0.73, color: "#5FA8D8" },
  { slug: "real_04", name: "מהדהד", dur: 0.82, color: "#5FA8D8" },
  { slug: "real_12", name: "חמים", dur: 1.16, color: "#5FA8D8" },
  { slug: "real_22", name: "עגול", dur: 1.17, color: "#5FA8D8" },
  { slug: "real_06", name: "עמוק", dur: 1.19, color: "#5FA8D8" },
  { slug: "real_24", name: "בוצי", dur: 0.70, color: "#6FBF6A" },
  { slug: "real_23", name: "ענק רטוב", dur: 3.17, color: "#6FBF6A" },
];
const REAL_COLOR = "#6FBF6A";
const sampleUrl = (slug) => `${import.meta.env.BASE_URL}farts/${slug}.mp3`;

/* ═══ music theory — scales for the fart keyboard ═══════════ */
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALES = [
  { id: "major",    name: "מז'ור",    emo: "☀️", steps: [0, 2, 4, 5, 7, 9, 11] },
  { id: "minor",    name: "מינור",    emo: "🌙", steps: [0, 2, 3, 5, 7, 8, 10] },
  { id: "penta",    name: "פנטטוני",  emo: "🎋", steps: [0, 3, 5, 7, 10] },
  { id: "blues",    name: "בלוז",     emo: "🎷", steps: [0, 3, 5, 6, 7, 10] },
  { id: "dorian",   name: "דוריאן",   emo: "🍃", steps: [0, 2, 3, 5, 7, 9, 10] },
  { id: "harmonic", name: "מזרחי",    emo: "🐪", steps: [0, 1, 4, 5, 7, 8, 11] },
];

/* one piano octave + the tonic on top; semitone offset from the sample's own pitch */
const WHITE = [0, 2, 4, 5, 7, 9, 11, 12];
/* black keys sit between whites — `after` is the index of the white key they follow */
const BLACK = [
  { semi: 1, after: 0 }, { semi: 3, after: 1 },
  { semi: 6, after: 3 }, { semi: 8, after: 4 }, { semi: 10, after: 5 },
];
const KEYS_ROW = ["a", "s", "d", "f", "g", "h", "j", "k"];
const BLACK_KEYS_ROW = { 1: "w", 3: "e", 6: "t", 8: "y", 10: "u" };
const semisToRate = (s) => Math.pow(2, s / 12);

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

/* ═══ icons ═════════════════════════════════════════════════ */
const Ico = ({ d, fill = "none", size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ display: "block", flexShrink: 0 }}>
    {d}
  </svg>
);
const IconPlay = () => <Ico fill="currentColor" d={<path d="M7 4.5v15l13-7.5z" stroke="none" />} />;
const IconStop = () => <Ico fill="currentColor" d={<rect x="5.5" y="5.5" width="13" height="13" rx="1.5" stroke="none" />} />;
const IconRec = () => <Ico fill="currentColor" d={<circle cx="12" cy="12" r="6.5" stroke="none" />} />;
const IconTrash = () => <Ico d={<><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></>} />;
const IconGrid = () => <Ico d={<><path d="M4 9h16M4 15h16M9 4v16M15 4v16" /></>} />;

/* ═══ component ═════════════════════════════════════════════ */
export default function PookManager() {
  const [armed, setArmed] = useState(false);
  const [fartVol, setFartVol] = useState(0.85);
  const [drumVol, setDrumVol] = useState(0.7);
  const [level, setLevel] = useState(0);
  const [total, setTotal] = useState(0);
  const [active, setActive] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [beatIdx, setBeatIdx] = useState(0);
  const [bpm, setBpm] = useState(BEATS[0].bpm);
  const [step, setStep] = useState(0);
  const [quantize, setQuantize] = useState(true);
  const [recording, setRecording] = useState(false);
  const [loop, setLoop] = useState([]);
  const [realLoaded, setRealLoaded] = useState(0);
  /* fart keyboard — plays whichever pad is currently selected */
  const [kbUnit, setKbUnit] = useState(15);
  const [scaleIdx, setScaleIdx] = useState(0);
  const [noteHot, setNoteHot] = useState(null);

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
    A.current = { ctx, master, fart, drums, an, data: new Uint8Array(an.fftSize), bufs: { white: makeNoise(ctx, false), brown: makeNoise(ctx, true) }, samples: new Map(), loading: false };
    A.current.fart.gain.value = fartVol;
    A.current.drums.gain.value = drumVol;
    return A.current;
  }, [fartVol, drumVol]);

  /* ── load recorded fart samples once (first user gesture) ── */
  const loadSamples = useCallback(async () => {
    const a = A.current;
    if (!a || a.loading || a.samples.size === REAL.length) return;
    a.loading = true;
    let done = 0;
    await Promise.all(
      REAL.map(async (r) => {
        try {
          const res = await fetch(sampleUrl(r.slug));
          const arr = await res.arrayBuffer();
          const buf = await a.ctx.decodeAudioData(arr);
          a.samples.set(r.slug, buf);
        } catch (e) {
          /* leave missing; pad will just no-op */
        } finally {
          done++;
          setRealLoaded(done);
        }
      })
    );
    a.loading = false;
  }, []);

  useEffect(() => { if (A.current) A.current.fart.gain.value = fartVol; }, [fartVol]);
  useEffect(() => { if (A.current) A.current.drums.gain.value = drumVol; }, [drumVol]);
  /* warm up recorded samples once the engine is armed */
  useEffect(() => { if (armed) loadSamples(); }, [armed, loadSamples]);

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


  /* play a recorded sample through the fart bus.
     semis != null → pitched (keyboard); null → natural pitch with a touch of jitter */
  const playSample = useCallback((idx, when, semis = null) => {
    const a = init();
    const r = REAL[idx];
    if (!r) return;
    const fireBuf = (buf) => {
      const src = a.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = semis === null ? rnd(0.97, 1.04) : semisToRate(semis);
      const g = a.ctx.createGain();
      /* pitching up shortens and brightens the sample — trim the gain a little */
      g.gain.value = semis === null ? 0.92 : 0.92 * (semis > 0 ? 0.92 : 1);
      src.connect(g);
      g.connect(a.fart);
      src.start(Math.max(when, a.ctx.currentTime));
    };
    const buf = a.samples.get(r.slug);
    if (buf) { fireBuf(buf); return; }
    /* not decoded yet — fetch just this one, then play immediately */
    loadSamples();
    fetch(sampleUrl(r.slug))
      .then((res) => res.arrayBuffer())
      .then((arr) => a.ctx.decodeAudioData(arr))
      .then((b) => { a.samples.set(r.slug, b); fireBuf(b); })
      .catch(() => {});
  }, [init, loadSamples]);

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
      S.current.loop.forEach((h) => { if (h.step === i) playSample(h.real, t, h.semis ?? null); });
      const shown = i;
      setTimeout(() => setStep(shown), Math.max(0, (T.current.next - ctx.currentTime) * 1000));
      T.current.next += sd;
      T.current.step = (i + 1) % 16;
      if (T.current.step === 0) T.current.start = T.current.next;
    }
  }, [stepDur, playSample]);

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

  /* ── fire a recorded (real) fart — quantize + loop-record path.
        semis != null → played as a pitched note from the keyboard ── */
  const fireReal = useCallback((idx, semis = null) => {
    const a = init();
    const { ctx } = a;
    if (ctx.state === "suspended") ctx.resume();
    setArmed(true);
    loadSamples();
    if (!raf.current) raf.current = requestAnimationFrame(meter);

    const sd = stepDur();
    const mod16 = (n) => ((n % 16) + 16) % 16;
    let when = ctx.currentTime + 0.02;
    let landStep = null;
    if (S.current.playing) {
      const elapsed = ctx.currentTime - T.current.start;
      if (S.current.quantize) {
        const k = Math.ceil(elapsed / sd);
        when = T.current.start + k * sd;
        landStep = mod16(k);
      } else {
        landStep = mod16(Math.round(elapsed / sd));
      }
    }
    playSample(idx, when, semis);
    if (S.current.recording && landStep !== null) {
      setLoop((l) => (l.length > 31 ? l : [...l, { step: landStep, real: idx, semis, k: Date.now() + Math.random() }]));
    }
    setTotal((n) => n + 1);
    setActive(semis === null ? "r" + idx : null);
    if (flash.current) clearTimeout(flash.current);
    flash.current = setTimeout(() => setActive(null), 160);
  }, [init, meter, stepDur, playSample, loadSamples]);

  /* ── the fart keyboard: play one piano key (semitones above the sample) ── */
  const playNote = useCallback((semi) => {
    fireReal(kbUnit, semi);
    setNoteHot(semi);
    setTimeout(() => setNoteHot((s) => (s === semi ? null : s)), 150);
  }, [kbUnit, fireReal]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && e.target.tagName === "INPUT") return;
      if (e.code === "Space") { e.preventDefault(); S.current.playing ? stop() : start(); return; }
      if (e.repeat) return;
      const n = parseInt(e.key, 10);
      if (!isNaN(n) && e.key.length === 1) { fireReal(n === 0 ? Math.floor(Math.random() * REAL.length) : Math.min(n - 1, REAL.length - 1)); return; }
      const key = e.key.toLowerCase();
      const wi = KEYS_ROW.indexOf(key);
      if (wi !== -1) { playNote(WHITE[wi]); return; }
      const bs = Object.keys(BLACK_KEYS_ROW).find((s) => BLACK_KEYS_ROW[s] === key);
      if (bs) playNote(Number(bs));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fireReal, playNote, start, stop]);

  /* ── derived ── */
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
        .pk { transition: transform 90ms ease-out, background 120ms, border-color 120ms, box-shadow 150ms; }
        .pk:active { transform: scale(0.95); }
        @keyframes pk-recpulse { 0% { box-shadow: 0 0 0 0 ${C.rec}88; } 70% { box-shadow: 0 0 0 7px ${C.rec}00; } 100% { box-shadow: 0 0 0 0 ${C.rec}00; } }
        .pk-recording { animation: pk-recpulse 1.15s ease-out infinite; }
        @keyframes pk-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
        .pk-blink { animation: pk-blink 0.95s steps(1, end) infinite; }
        .pk-glow { box-shadow: 0 0 12px ${C.cyan}66; }
        @media (prefers-reduced-motion: reduce) { .pk, .pk:active { transition: none; transform: none; } .pk-recording, .pk-blink { animation: none; } }
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
            <p className="mt-1 text-xs" style={{ color: C.dim }}>תחנת פליטות · 24 פליצות · 12 מקצבים</p>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: armed ? C.cyan : C.dim }}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: armed ? C.cyan : C.line, boxShadow: armed ? `0 0 8px ${C.cyan}` : "none" }} />
            {armed ? "פעיל" : "ממתין"}
          </div>
        </header>

        {/* meter */}
        <section className="mt-3 rounded-sm border p-3" style={{ borderColor: C.line, background: C.panel }}>
          <div className="flex items-baseline justify-between text-xs" style={{ color: C.dim }}>
            <span>עוצמה</span>
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
            <span className="text-sm font-bold" style={{ color: C.bone, letterSpacing: "0.12em" }}>מקצב</span>
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
                      <span key={h.k} className="h-1 w-1 rounded-full" style={{ background: REAL[h.real].color }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* transport */}
          <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
            <button onClick={() => (playing ? stop() : start())}
              className={`pk flex items-center gap-2 rounded-sm border px-4 py-2 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${playing ? "pk-glow" : ""}`}
              style={btn(playing, C.cyan)} aria-pressed={playing} aria-label={playing ? "עצור" : "נגן"}>
              {playing ? <IconStop /> : <IconPlay />}
              {playing ? "עצור" : "נגן"}
            </button>
            <button onClick={() => { if (!playing) start(); setRecording((r) => !r); }}
              className={`pk flex items-center gap-2 rounded-sm border px-3 py-2 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${recording ? "pk-recording" : ""}`}
              style={btn(recording, C.rec)} aria-pressed={recording} aria-label={recording ? "מקליט" : "הקלט"}>
              <span className={recording ? "pk-blink" : ""} style={{ display: "flex" }}><IconRec /></span>
              {recording ? "מקליט" : "הקלט"}
            </button>
            <button onClick={() => setLoop([])}
              className="pk flex items-center gap-2 rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              style={{ borderColor: C.line, color: C.dim }} aria-label="נקה לולאה">
              <IconTrash /> נקה {loop.length > 0 && `(${loop.length})`}
            </button>
            <button onClick={() => setQuantize((q) => !q)}
              className="pk flex items-center gap-2 rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              style={btn(quantize, C.amber)} aria-pressed={quantize}>
              <IconGrid /> יישור לביט
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
          <button onClick={() => fireReal(Math.floor(Math.random() * REAL.length))}
            className="pk rounded-sm border px-4 py-2 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            style={{ borderColor: C.amber, color: C.amber }}>
            נאד בהפתעה
          </button>
        </section>

        {/* library — real farts only */}
        <section className="mt-3 rounded-sm border" style={{ borderColor: C.line, background: C.panel }}>
          <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: C.line2 }}>
            <span className="text-xs" style={{ color: C.dim }}>פליצות</span>
            <span className="mr-auto text-xs" style={{ color: C.dim2 }}>
              {REAL.length} דגומות{realLoaded > 0 && realLoaded < REAL.length ? " · טוען…" : ""}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 p-3 sm:grid-cols-5 md:grid-cols-6">
            {REAL.map((r, ri) => {
              const hot = active === "r" + ri;
              const ready = realLoaded >= REAL.length || (A.current && A.current.samples.has(r.slug));
              return (
                <button key={r.slug} onClick={() => { fireReal(ri); setKbUnit(ri); }}
                  className="pk flex flex-col items-start gap-1 rounded-sm border px-2 py-2 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  style={{
                    background: hot ? C.padHot : C.pad,
                    borderColor: hot ? r.color : ri === kbUnit ? r.color + "AA" : C.line2,
                    opacity: ready ? 1 : 0.55,
                  }}
                  aria-pressed={ri === kbUnit}>
                  <span className="h-1 w-full rounded-full" style={{ background: r.color, opacity: hot || ri === kbUnit ? 1 : 0.55 }} />
                  <span className="w-full truncate text-xs font-bold" style={{ color: C.bone }}>{r.name}</span>
                  <span className="flex w-full items-center justify-between text-xs" style={{ color: C.dim2, fontSize: 10 }}>
                    {r.dur.toFixed(1)}s
                    {ri === kbUnit && <span style={{ color: r.color }}>♪</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* piano */}
        <section className="mt-3 rounded-sm border" style={{ borderColor: C.line, background: C.panel }}>
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2" style={{ borderColor: C.line2 }}>
            <span className="text-sm font-bold" style={{ color: C.bone, letterSpacing: "0.12em" }}>קלידים</span>
            <span className="text-xs font-bold" style={{ color: REAL[kbUnit].color }}>{REAL[kbUnit].name}</span>
            <span className="mr-auto text-xs" style={{ color: C.dim2 }}>בחר פליצה למעלה</span>
          </div>

          {/* scale picker — emoji only */}
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="shrink-0 text-xs" style={{ color: C.dim }}>סולם</span>
            <div className="pk-scroll flex gap-1 overflow-x-auto">
              {SCALES.map((s, i) => (
                <button key={s.id} onClick={() => setScaleIdx(i)}
                  className="pk shrink-0 rounded-sm border px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  style={{ ...btn(i === scaleIdx, C.amber), fontSize: 17, lineHeight: 1.15, minWidth: 38 }}
                  title={s.name} aria-label={s.name} aria-pressed={i === scaleIdx}>
                  {s.emo}
                </button>
              ))}
            </div>
          </div>

          {/* the piano — white keys with black keys straddling them */}
          <div className="px-3 pb-3">
            <div className="relative select-none" style={{ height: 128 }}>
              {/* white keys */}
              <div className="flex h-full gap-1">
                {WHITE.map((semi, wi) => {
                  const inScale = SCALES[scaleIdx].steps.includes(semi % 12);
                  const hot = noteHot === semi;
                  return (
                    <button key={semi} onMouseDown={() => playNote(semi)}
                      onTouchStart={(e) => { e.preventDefault(); playNote(semi); }}
                      className="pk flex flex-1 flex-col items-center justify-end rounded-b-sm pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                      style={{
                        background: hot ? C.amber : inScale ? C.bone : "#8D9691",
                        borderWidth: "0 1px 1px 1px",
                        borderStyle: "solid",
                        borderColor: hot ? C.amber : C.line,
                        boxShadow: hot ? `inset 0 -6px 12px ${C.amber}` : "inset 0 -7px 9px rgba(0,0,0,0.16)",
                        color: "#4A5450",
                      }}
                      aria-label={`תו ${NOTE_NAMES[semi % 12]}`}>
                      <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.75 }}>{KEYS_ROW[wi]}</span>
                    </button>
                  );
                })}
              </div>

              {/* black keys */}
              <div className="pointer-events-none absolute inset-0">
                {BLACK.map((b) => {
                  const inScale = SCALES[scaleIdx].steps.includes(b.semi % 12);
                  const hot = noteHot === b.semi;
                  /* sit on the seam between two white keys (RTL: measure from the right) */
                  const unit = 100 / WHITE.length;
                  const right = `calc(${(b.after + 1) * unit}% - ${unit * 0.29}%)`;
                  return (
                    <button key={b.semi} onMouseDown={() => playNote(b.semi)}
                      onTouchStart={(e) => { e.preventDefault(); playNote(b.semi); }}
                      className="pk pointer-events-auto absolute top-0 flex flex-col items-center justify-end rounded-b-sm pb-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                      style={{
                        right, width: `${unit * 0.58}%`, height: "62%",
                        background: hot ? C.amber : inScale ? "#1C2B27" : "#0C1413",
                        borderWidth: "0 1px 1px 1px",
                        borderStyle: "solid",
                        borderColor: hot ? C.amber : "#000",
                        boxShadow: hot ? `0 0 10px ${C.amber}99` : "0 3px 6px rgba(0,0,0,0.55)",
                        color: hot ? C.bg : C.dim2,
                      }}
                      aria-label={`תו ${NOTE_NAMES[b.semi % 12]}`}>
                      <span style={{ fontSize: 9, fontWeight: 700 }}>{BLACK_KEYS_ROW[b.semi]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <p className="mt-3 text-center text-xs" style={{ color: C.dim2 }}>
          מקלדת: 1–9 פליצות · 0 נאד בהפתעה · A–K קלידים לבנים · W/E/T/Y/U שחורים · רווח נגן/עצור
        </p>
      </div>
    </div>
  );
}
