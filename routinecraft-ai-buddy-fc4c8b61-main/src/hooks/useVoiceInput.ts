import { useCallback, useEffect, useRef, useState } from "react";

interface VoiceOptions {
  /** Called with a finalised utterance. */
  onFinal: (transcript: string, sttLatencyMs: number) => void;
  /** Called as soon as real speech energy is detected (used for barge-in). */
  onSpeechStart?: () => void;
  onInterim?: (text: string) => void;
  onError?: (message: string) => void;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
  return Ctor ? (new Ctor() as SpeechRecognitionLike) : null;
}

const VAD_THRESHOLD = 0.06;

/**
 * Continuous voice input: Web Speech recognition for transcription plus an
 * independent Web Audio VAD loop that reports mic energy (waveform + barge-in).
 */
export function useVoiceInput({ onFinal, onSpeechStart, onInterim, onError }: VoiceOptions) {
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const speechStartedAt = useRef<number>(0);
  const wantListening = useRef(false);
  const speaking = useRef(false);
  const callbacks = useRef({ onFinal, onSpeechStart, onInterim, onError });
  callbacks.current = { onFinal, onSpeechStart, onInterim, onError };

  useEffect(() => {
    setSupported(Boolean(getRecognition()));
  }, []);

  const stopMeter = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setLevel(0);
  }, []);

  const startMeter = useCallback(async () => {
    if (streamRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const data = new Float32Array(analyser.fftSize);

    const tick = () => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i]! * data[i]!;
      const rms = Math.sqrt(sum / data.length);
      setLevel(rms);
      if (rms > VAD_THRESHOLD && !speaking.current) {
        speaking.current = true;
        speechStartedAt.current = performance.now();
        callbacks.current.onSpeechStart?.();
      } else if (rms < VAD_THRESHOLD * 0.5) {
        speaking.current = false;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stop = useCallback(() => {
    wantListening.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    stopMeter();
    setListening(false);
  }, [stopMeter]);

  const start = useCallback(async () => {
    const recognition = getRecognition();
    if (!recognition) {
      callbacks.current.onError?.(
        "This browser does not support the Web Speech API. Use Chrome, or type your routine instead.",
      );
      return;
    }
    try {
      await startMeter();
    } catch {
      callbacks.current.onError?.("Microphone access is needed for voice input.");
      return;
    }

    wantListening.current = true;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = String(result[0].transcript).trim();
        if (result.isFinal) {
          if (text) {
            const latency = Math.max(
              0,
              Math.round(performance.now() - (speechStartedAt.current || performance.now())),
            );
            callbacks.current.onFinal(text, latency);
          }
        } else {
          interim += ` ${text}`;
        }
      }
      if (interim.trim()) callbacks.current.onInterim?.(interim.trim());
    };
    recognition.onerror = (event: any) => {
      if (event?.error === "not-allowed") {
        callbacks.current.onError?.("Microphone permission denied.");
        stop();
      }
    };
    recognition.onend = () => {
      if (wantListening.current) {
        try {
          recognition.start();
        } catch {
          /* restart race */
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(true);
    }
  }, [startMeter, stop]);

  useEffect(() => () => stop(), [stop]);

  return { listening, level, supported, start, stop };
}
