<script setup lang="ts">
// Abstract, grainy, animated gradient (WebGL, no dependencies). Colors come from the design tokens,
// so a palette change or a theme toggle carries through. Falls back to the CSS glow without WebGL.
import { onMounted, onUnmounted, ref } from "vue";

const canvas = ref<HTMLCanvasElement>();

const vertex = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const fragment = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uBg, uA, uB, uC;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + 7.3; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (uv - vec2(0.76, 0.5)) * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime * 0.06;

  // Domain-warped flow: slow, smooth, never repeats.
  vec2 q = vec2(fbm(p * 1.8 + t), fbm(p * 1.8 + vec2(5.2, 1.3) - t));
  float r = fbm(p * 1.8 + 2.4 * q + vec2(t, -t));

  // A luminous core, bent by the flow, with plenty of tonal variation inside it.
  float core = 1.0 - smoothstep(0.0, 0.75, length(p + (q - 0.5) * 0.8));
  float body = clamp(core * 0.95 + (r - 0.5) * 1.15, 0.0, 1.0);

  // Grain dithers the tone, so the gradient dissolves into speckle instead of banding.
  float n = hash(gl_FragCoord.xy + floor(uTime * 12.0));
  float b = clamp(body + (n - 0.5) * 0.22, 0.0, 1.0);

  // Tonal ramp: page, deep rust, accent, hot core. Violet drifts through the mids.
  vec3 deep = mix(uBg, uB, 0.7);
  vec3 mid = mix(uA, uC, smoothstep(0.45, 0.95, q.y) * 0.6);
  vec3 hot = mix(uA, vec3(1.0), 0.5);
  vec3 col = uBg;
  col = mix(col, deep, smoothstep(0.08, 0.38, b));
  col = mix(col, mid, smoothstep(0.32, 0.65, b));
  col = mix(col, hot, smoothstep(0.7, 1.0, b));

  // Fine film grain on top.
  col += (hash(gl_FragCoord.xy * 1.7 + uTime) - 0.5) * 0.05;
  gl_FragColor = vec4(col, 1.0);
}`;

function token(el: Element, name: string, fallback: [number, number, number]): [number, number, number] {
  const hex = getComputedStyle(el).getPropertyValue(name).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return fallback;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

let stop = () => {};

onMounted(() => {
  const el = canvas.value;
  const gl = el?.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
  if (!el || !gl) return;

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const uRes = u("uRes"), uTime = u("uTime"), uBg = u("uBg"), uA = u("uA"), uB = u("uB"), uC = u("uC");

  const setColors = () => {
    const root = document.documentElement;
    gl.uniform3fv(uBg, token(root, "--background", [0.08, 0.08, 0.08]));
    gl.uniform3fv(uA, token(root, "--primary", [0.93, 0.46, 0.18]));
    gl.uniform3fv(uB, token(root, "--primary-ink", [0.7, 0.28, 0.05]));
    gl.uniform3fv(uC, token(root, "--status-in-review", [0.5, 0.4, 0.68]));
  };

  const resize = () => {
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    el.width = Math.max(1, Math.round(el.clientWidth * scale));
    el.height = Math.max(1, Math.round(el.clientHeight * scale));
    gl.viewport(0, 0, el.width, el.height);
    gl.uniform2f(uRes, el.width, el.height);
  };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;
  let visible = true;
  const start = performance.now();

  const draw = () => {
    gl.uniform1f(uTime, reduced.matches ? 14 : 14 + (performance.now() - start) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const loop = () => {
    frame = 0;
    draw();
    if (!reduced.matches && visible && !document.hidden) frame = requestAnimationFrame(loop);
  };
  const kick = () => {
    if (!frame) frame = requestAnimationFrame(loop);
  };

  setColors();
  resize();
  kick();

  const size = new ResizeObserver(() => (resize(), kick()));
  size.observe(el);
  const theme = new MutationObserver(() => (setColors(), kick()));
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const seen = new IntersectionObserver(([e]) => ((visible = !!e?.isIntersecting), kick()));
  seen.observe(el);
  document.addEventListener("visibilitychange", kick);
  reduced.addEventListener("change", kick);

  stop = () => {
    cancelAnimationFrame(frame);
    size.disconnect();
    theme.disconnect();
    seen.disconnect();
    document.removeEventListener("visibilitychange", kick);
    reduced.removeEventListener("change", kick);
  };
});

onUnmounted(() => stop());
</script>

<template>
  <div class="hero-glow hero-mask pointer-events-none" aria-hidden="true">
    <canvas ref="canvas" class="block size-full" />
  </div>
</template>
