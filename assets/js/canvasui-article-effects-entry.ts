import {
  createDecryptReveal,
  supportsHtmlInCanvas as supportsDecryptReveal,
  type DecryptRevealInstance,
} from "../vendor/canvas-ui/DecryptRevealVanilla";
import {
  createDroplets,
  supportsHtmlInCanvas as supportsDroplets,
  type DropletsInstance,
} from "../vendor/canvas-ui/DropletsVanilla";
import {
  createParticleScroll,
  supportsHtmlInCanvas as supportsParticleScroll,
  type ParticleScrollInstance,
} from "../vendor/canvas-ui/ParticleScrollVanilla";
import {
  createRetroDither,
  supportsHtmlInCanvas as supportsRetroDither,
  type RetroDitherInstance,
} from "../vendor/canvas-ui/RetroDitherVanilla";

type EffectType = "decrypt-reveal" | "droplets" | "particle-scroll" | "retro-dither";
type CanvasUiInstance =
  | DecryptRevealInstance
  | DropletsInstance
  | ParticleScrollInstance
  | RetroDitherInstance;

interface MountedEffect {
  destroy: () => void;
}

const supportChecks: Record<EffectType, () => boolean> = {
  "decrypt-reveal": supportsDecryptReveal,
  droplets: supportsDroplets,
  "particle-scroll": supportsParticleScroll,
  "retro-dither": supportsRetroDither,
};

const defaults: Record<EffectType, Record<string, unknown>> = {
  "decrypt-reveal": {
    radius: 0.34,
    feather: 0.18,
    cipherColor: "#6B8B6B",
    waveColor: "#C6FF4A",
    fontSize: 12,
    chromaticAberration: 1.25,
  },
  droplets: {
    intensity: 0.58,
    speed: 1,
    scale: 0.42,
    dropWidth: 1,
    dropLength: 1.08,
    refraction: 0.22,
    blur: 0.08,
    vignette: 0.18,
    staticDrops: 0.24,
    tint: [0.42, 0.55, 0.42],
    tintStrength: 0.08,
  },
  "particle-scroll": {
    threshold: 0.48,
    radius: 0.24,
    particleSize: 1.25,
    particleGap: 2,
    speed: 1,
    color: "#6B8B6B",
  },
  "retro-dither": {
    radius: 0.34,
    pixelSize: 4,
    levels: 4,
    contrast: 1.22,
    brightness: 0,
    mix: 0.92,
  },
};

function canvasStyle(canvas: HTMLCanvasElement, zIndex: number) {
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = String(zIndex);
}

function mount(page: HTMLElement, type: EffectType): MountedEffect | null {
  const supports = supportChecks[type];
  const native = Boolean(supports && supports());

  const source = document.createElement("canvas");
  const output = document.createElement("canvas");
  source.setAttribute("layoutsubtree", "true");
  source.setAttribute("aria-hidden", "true");
  output.setAttribute("aria-hidden", "true");
  source.className = "canvasui-article-source";
  output.className = "canvasui-article-output canvasui-article-output--" + type;
  canvasStyle(source, -1);
  canvasStyle(output, 4);
  source.style.opacity = "0";
  page.prepend(source);
  page.prepend(output);

  let instance: CanvasUiInstance | null = null;
  const elements = { source, content: page, output };
  if (type === "decrypt-reveal") instance = createDecryptReveal(elements, defaults[type]);
  else if (type === "droplets") instance = createDroplets(elements, defaults[type]);
  else if (type === "particle-scroll") instance = createParticleScroll(elements, defaults[type]);
  else if (type === "retro-dither") instance = createRetroDither(elements, defaults[type]);

  if (!instance) {
    source.remove();
    output.remove();
    page.dataset.canvasuiSupported = "false";
    return null;
  }

  page.dataset.canvasuiSupported = native ? "true" : "false";
  page.dataset.canvasuiMounted = type;
  const resizeObserver = new ResizeObserver(() => instance?.resize());
  resizeObserver.observe(page);

  return {
    destroy() {
      resizeObserver.disconnect();
      instance?.destroy();
      source.remove();
      output.remove();
      delete page.dataset.canvasuiMounted;
    },
  };
}

declare global {
  interface Window {
    BlogCanvasUIArticleEffects?: {
      mount: (page: HTMLElement, type: EffectType) => MountedEffect | null;
      supports: Record<EffectType, () => boolean>;
    };
  }
}

window.BlogCanvasUIArticleEffects = {
  mount,
  supports: supportChecks,
};
