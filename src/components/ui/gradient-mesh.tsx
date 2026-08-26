'use client';
import { Renderer, Program, Mesh, Color, Triangle } from 'ogl';
import { useEffect, useRef, useState } from 'react';

const vert = `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position, 0, 1);
}
`;

const frag = (distortion: number) => `
precision highp float;

uniform float uTime;
uniform float uSwirl;
uniform float uSpeed;
uniform float uScale;
uniform float uOffsetX;
uniform float uOffsetY;
uniform float uRotation;
uniform float uWaveAmp;
uniform float uWaveFreq;
uniform float uWaveSpeed;
uniform float uGrain;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uResolution;

varying vec2 vUv;

float wave(vec2 uv, float freq, float speed, float time) {
    return sin(uv.x * freq + time * speed) * cos(uv.y * freq + time * speed);
}

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec3 colorDodge(vec3 base, vec3 blend) {
    return min(base / (1.0 - blend + 0.0001), 1.0);
}

void main() {
    float mr = min(uResolution.x, uResolution.y);
    vec2 uv = (vUv.xy * 2.0 - 1.0) * uResolution.xy / mr;

    uv = uv * uScale + vec2(uOffsetX, uOffsetY);

    float cosR = cos(uRotation);
    float sinR = sin(uRotation);
    uv = vec2(uv.x * cosR - uv.y * sinR, uv.x * sinR + uv.y * cosR);

    uv.x += wave(uv, uWaveFreq, uWaveSpeed, uTime) * uWaveAmp;
    uv.y += wave(uv + 10.0, uWaveFreq * 1.5, uWaveSpeed * 0.8, uTime) * uWaveAmp * 0.5;

    float angle = atan(uv.y, uv.x);
    float radius = length(uv);
    angle += uSwirl * radius;
    uv = vec2(cos(angle), sin(angle)) * radius;

    float d = -uTime * 0.5 * uSpeed;
    float a = 0.0;
    for (float i = 0.0; i < ${distortion.toFixed(1)}; ++i) {
        a += cos(i - d - a * uv.x);
        d += sin(uv.y * i + a);
    }
    d += uTime * 0.5 * uSpeed;

    float mix1 = (sin(d) + 1.0) * 0.5;
    float mix2 = (cos(a) + 1.0) * 0.5;
    vec3 col = mix(uColorA, uColorB, mix1);
    col = mix(col, uColorC, mix2);

    // เกรนคิดจากตำแหน่งพิกเซลอย่างเดียว ไม่ผูกกับเวลา
    // เดิมใส่ uTime เข้าไปด้วย ทำให้ทุกพิกเซลต้องคำนวณ random ใหม่ทุกเฟรม
    // ซึ่งกินกำลัง GPU มากที่สุดในทั้ง shader โดยที่ตาแทบมองไม่เห็นความต่าง
    float grain = (random(gl_FragCoord.xy) - 0.5) * uGrain;
    col = colorDodge(col, vec3(0.5 + grain));

    gl_FragColor = vec4(col, 1.0);
}
`;

export interface GradientMeshProps extends React.HTMLAttributes<HTMLDivElement> {
  colors?: string[];
  distortion?: number;
  swirl?: number;
  speed?: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  /** องศา (แปลงเป็นเรเดียนให้อัตโนมัติ) */
  rotation?: number;
  waveAmp?: number;
  waveFreq?: number;
  waveSpeed?: number;
  grain?: number;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
};

/**
 * พื้นหลังไล่สีเคลื่อนไหวด้วย WebGL (ogl)
 * - เคารพ prefers-reduced-motion : วาดภาพนิ่งเฟรมเดียว ไม่วนลูป
 * - ถ้าเครื่องไม่รองรับ WebGL จะถอยไปใช้ไล่สีแบบ CSS อัตโนมัติ
 */
export function GradientMesh({
  colors = ['#012a30', '#14827c', '#a9eade'],
  distortion = 5,
  swirl = 0.5,
  speed = 1.0,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
  rotation = 90,
  waveAmp = 0.1,
  waveFreq = 10,
  waveSpeed = 0.2,
  grain = 0.06,
  style,
  ...rest
}: GradientMeshProps) {
  const ctnDom = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const colorKey = colors.join(',');

  useEffect(() => {
    const ctn = ctnDom.current;
    if (!ctn) return;

    /* ---------- เครื่องที่ไม่ควรเปิดเอฟเฟกต์ ----------
       พื้นหลังนี้เป็นแค่ของตกแต่ง ไม่คุ้มที่จะเบียดกำลังเครื่องของผู้ใช้
       เครื่องสเปกต่ำหรือผู้ใช้ที่ขอประหยัดข้อมูล ให้ใช้ไล่สีแบบ CSS ซึ่งไม่กินอะไรเลย */
    const nav = navigator as any;
    const weakDevice =
      (nav.hardwareConcurrency ?? 8) <= 4 ||
      (nav.deviceMemory ?? 8) <= 4 ||
      nav.connection?.saveData === true;
    if (weakDevice) { setFailed(true); return; }

    let renderer: Renderer;
    try {
      renderer = new Renderer({ alpha: false, antialias: false, dpr: 1 });
    } catch {
      setFailed(true);
      return;
    }

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 1);

    /* ---------- จำกัดจำนวนพิกเซลที่ต้องคำนวณ ----------
       เดิมวาดเต็มขนาดจริงของพื้นที่ บนจอกว้าง ๆ คือเกินล้านพิกเซลต่อเฟรม
       ภาพนี้เป็นไล่สีนุ่ม ๆ วาดเล็กแล้วให้เบราว์เซอร์ขยายด้วย CSS
       ตาคนแยกไม่ออก แต่งานของ GPU ลดลงหลายเท่า */
    const MAX_PIXELS = 480_000;
    const resize = () => {
      const w = Math.max(1, ctn.offsetWidth);
      const h = Math.max(1, ctn.offsetHeight);
      const shrink = Math.min(1, Math.sqrt(MAX_PIXELS / (w * h)));
      renderer.setSize(Math.round(w * shrink), Math.round(h * shrink));
      const c = gl.canvas as HTMLCanvasElement;
      c.style.width = '100%';
      c.style.height = '100%';
      (program?.uniforms.uResolution as any)?.value?.set?.(
        c.width, c.height, c.width / c.height
      );
    };

    const geometry = new Triangle(gl);
    const uniforms: Record<string, { value: unknown }> = {
      uTime: { value: 0 },
      uSwirl: { value: swirl },
      uSpeed: { value: speed },
      uScale: { value: scale },
      uOffsetX: { value: offsetX },
      uOffsetY: { value: offsetY },
      uRotation: { value: (rotation * Math.PI) / 180 },
      uWaveAmp: { value: waveAmp },
      uWaveFreq: { value: waveFreq },
      uWaveSpeed: { value: waveSpeed },
      uGrain: { value: grain },
      uResolution: {
        value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height),
      },
    };

    (['A', 'B', 'C'] as const).forEach((label, i) => {
      const hex = colors[i] ?? colors[colors.length - 1];
      uniforms[`uColor${label}`] = { value: new Color(...hexToRgb(hex)) };
    });

    const program = new Program(gl, { vertex: vert, fragment: frag(distortion), uniforms });
    const mesh = new Mesh(gl, { geometry, program });

    resize();
    window.addEventListener('resize', resize, false);

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animateId = 0;
    let last = 0;
    let onScreen = true;
    let running = false;

    const drawOnce = () => {
      program.uniforms.uTime.value = 0;
      renderer.render({ scene: mesh });
    };

    /* ---------- จำกัดที่ 30 เฟรมต่อวินาที ----------
       เดิมปล่อยตามจอ จอ 144Hz จะวาด 144 ครั้งต่อวินาที
       ภาพเคลื่อนช้าอยู่แล้ว 30 เฟรมก็ลื่นพอ แต่งานลดลงเกินครึ่ง */
    const FRAME_MS = 1000 / 30;
    const update = (t: number) => {
      animateId = requestAnimationFrame(update);
      if (t - last < FRAME_MS) return;
      last = t;
      program.uniforms.uTime.value = t * 0.001;
      renderer.render({ scene: mesh });
    };

    const start = () => {
      if (running || reduceMotion) return;
      running = true;
      last = 0;
      animateId = requestAnimationFrame(update);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(animateId);
    };

    /* ---------- หยุดวาดเมื่อผู้ใช้ไม่ได้มองอยู่ ----------
       requestAnimationFrame หยุดเองเฉพาะตอนสลับแท็บ
       แต่ถ้าหน้าต่างถูกบังหรือย้ายไปจอที่สอง มันยังวาดต่อและกิน GPU ไปเรื่อย ๆ */
    const sync = () => {
      if (onScreen && !document.hidden) start();
      else stop();
    };

    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); },
      { threshold: 0.01 });
    io.observe(ctn);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('blur', stop);
    window.addEventListener('focus', sync);

    ctn.appendChild(gl.canvas);
    if (reduceMotion) drawOnce(); else sync();

    return () => {
      stop();
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('blur', stop);
      window.removeEventListener('focus', sync);
      window.removeEventListener('resize', resize);
      if (gl.canvas.parentNode === ctn) ctn.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [
    colorKey,
    distortion,
    swirl,
    speed,
    scale,
    offsetX,
    offsetY,
    rotation,
    waveAmp,
    waveFreq,
    waveSpeed,
    grain,
  ]);

  return (
    <div
      ref={ctnDom}
      aria-hidden
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        ...(failed
          ? { background: `linear-gradient(140deg, ${colors[0]} 0%, ${colors[1] ?? colors[0]} 55%, ${colors[2] ?? colors[0]} 100%)` }
          : null),
        ...style,
      }}
      {...rest}
    />
  );
}
