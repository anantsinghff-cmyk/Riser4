import { useEffect, useRef } from "react";

/** Live mic waveform driven by the VAD RMS level. */
export function AudioVisualizer({ level, active }: { level: number; active: boolean }) {
  const history = useRef<number[]>(new Array(48).fill(0));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levelRef = useRef(level);
  levelRef.current = level;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
          canvas.width = width * dpr;
          canvas.height = height * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        history.current.push(activeRef.current ? Math.min(1, levelRef.current * 7) : 0);
        history.current.shift();

        const bars = history.current.length;
        const barWidth = width / bars;
        history.current.forEach((value, index) => {
          const barHeight = Math.max(2, value * height * 0.9);
          const x = index * barWidth;
          const y = (height - barHeight) / 2;
          const alpha = 0.25 + value * 0.75;
          ctx.fillStyle = activeRef.current
            ? `rgba(52, 211, 153, ${alpha})`
            : "rgba(148, 163, 184, 0.25)";
          ctx.beginPath();
          ctx.roundRect(x + barWidth * 0.2, y, barWidth * 0.6, barHeight, 999);
          ctx.fill();
        });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="h-9 w-full" aria-hidden />;
}
