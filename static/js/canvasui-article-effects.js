var BlogCanvasUIBundle = (() => {
  // assets/vendor/canvas-ui/DecryptRevealVanilla.ts
  var PRINTABLE_ASCII = Array.from(
    { length: 95 },
    (_, i) => String.fromCharCode(32 + i)
  ).join("");
  var DEFAULTS = {
    radius: 400,
    softness: 0.5,
    cell: 10,
    aspect: 0.75,
    charset: PRINTABLE_ASCII,
    colored: 1,
    color: "#4ade80",
    brightness: 1,
    legibility: 1,
    contrast: 1,
    exposure: 1,
    scramble: 0.1,
    scrambleSpeed: 6,
    edgeWidth: 0.2,
    edgeFlicker: 1,
    edgeGlow: 2,
    edgeTint: 0.75,
    aberration: 10,
    passthrough: 0.15,
    threshold: 0.025,
    background: "#000000",
    smoothing: 0.2
  };
  var ATLAS_CELL = 64;
  var ATLAS_PAD = 8;
  var MAX_GLYPHS = 255;
  var INNER_CIRCLES = [
    [0.28, 0.26],
    [0.72, 0.14],
    [0.28, 0.56],
    [0.72, 0.44],
    [0.28, 0.86],
    [0.72, 0.74]
  ];
  var VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var CELL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uShapes;
uniform vec2 uContentRes;
uniform vec2 uCellPx;
uniform int uGlyphCount;
uniform float uContrast;
uniform float uExposure;
uniform float uThreshold;
uniform vec3 uBg;

const vec2 INNER[6] = vec2[6](
  vec2(0.28, 0.26), vec2(0.72, 0.14),
  vec2(0.28, 0.56), vec2(0.72, 0.44),
  vec2(0.28, 0.86), vec2(0.72, 0.74)
);
const vec2 OUTER[10] = vec2[10](
  vec2(0.28, -0.2), vec2(0.72, -0.2),
  vec2(-0.22, 0.25), vec2(1.22, 0.25),
  vec2(-0.22, 0.5), vec2(1.22, 0.5),
  vec2(-0.22, 0.75), vec2(1.22, 0.75),
  vec2(0.28, 1.2), vec2(0.72, 1.2)
);
const vec2 RING[6] = vec2[6](
  vec2(1.0, 0.0), vec2(0.5, 0.8660254), vec2(-0.5, 0.8660254),
  vec2(-1.0, 0.0), vec2(-0.5, -0.8660254), vec2(0.5, -0.8660254)
);

vec2 cellBase;

vec4 fetchTap (vec2 p) {
  vec2 uv = p / uContentRes;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture(uContent, uv);
}

vec4 sampleCircle (vec2 c) {
  vec2 middle = cellBase + c * uCellPx;
  float r = uCellPx.y * 0.161;
  vec4 acc = fetchTap(middle);
  for (int k = 0; k < 6; k++) acc += fetchTap(middle + RING[k] * r);
  return acc / 7.0;
}

float tapLevel (vec4 t) {
  vec3 straight = t.rgb / max(t.a, 1e-4);
  return dot(abs(straight - uBg), vec3(0.299, 0.587, 0.114)) * t.a;
}

float circleSig (vec4 acc) {
  return clamp(tapLevel(acc) * uExposure, 0.0, 1.0);
}

float dirContrast (float value, float ext) {
  float peak = max(value, ext);
  if (peak < 1e-4) return value;
  return pow(value / peak, uContrast) * peak;
}

void main () {
  cellBase = floor(gl_FragCoord.xy) * uCellPx;
  float v[6];
  vec3 colAcc = vec3(0.0);
  float alphaAcc = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 acc = sampleCircle(INNER[i]);
    v[i] = circleSig(acc);
    colAcc += acc.rgb;
    alphaAcc += acc.a;
  }
  float e[10];
  for (int i = 0; i < 10; i++) e[i] = circleSig(sampleCircle(OUTER[i]));
  v[0] = dirContrast(v[0], max(max(e[0], e[1]), max(e[2], e[4])));
  v[1] = dirContrast(v[1], max(max(e[0], e[1]), max(e[3], e[5])));
  v[2] = dirContrast(v[2], max(e[2], max(e[4], e[6])));
  v[3] = dirContrast(v[3], max(e[3], max(e[5], e[7])));
  v[4] = dirContrast(v[4], max(max(e[4], e[6]), max(e[8], e[9])));
  v[5] = dirContrast(v[5], max(max(e[5], e[7]), max(e[8], e[9])));
  float gm[6];
  for (int i = 0; i < 6; i++) gm[i] = 0.0;
  float levSum = 0.0;
  float inkLev = 0.0;
  vec3 inkCol = vec3(0.0);
  int nx = int(clamp(uCellPx.x, 6.0, 20.0));
  int ny = int(clamp(uCellPx.y, 8.0, 32.0));
  float fx = float(nx - 1);
  float fy = float(ny - 1);
  for (int gy = 0; gy < ny; gy++) {
    for (int gx = 0; gx < nx; gx++) {
      vec2 p = vec2(float(gx) / fx, float(gy) / fy);
      vec4 t = fetchTap(cellBase + p * uCellPx);
      float lev = tapLevel(t);
      int idx = (p.y < 0.41 ? 0 : (p.y < 0.71 ? 2 : 4)) + (p.x < 0.5 ? 0 : 1);
      gm[idx] = max(gm[idx], lev);
      levSum += lev;
      if (lev > inkLev) {
        inkLev = lev;
        inkCol = t.rgb / max(t.a, 1e-4);
      }
    }
  }
  inkLev *= uExposure;
  for (int i = 0; i < 6; i++)
    v[i] = max(v[i], clamp(gm[i] * uExposure, 0.0, 1.0));
  float peak = max(max(max(v[0], v[1]), max(v[2], v[3])), max(v[4], v[5]));
  vec3 avgCol = colAcc / max(alphaAcc, 1e-4);
  if (peak < uThreshold) {
    outColor = vec4(avgCol, 0.0);
    return;
  }
  float mean = levSum * uExposure / float(nx * ny);
  float sharp = inkLev / max(mean, 1e-4);
  float solid = smoothstep(uThreshold, uThreshold * 1.6, inkLev);
  float lift = smoothstep(1.5, 3.0, sharp) * solid;
  float lifted = mix(peak, 1.0, lift);
  for (int i = 0; i < 6; i++)
    v[i] = pow(min(v[i] / max(peak, 1e-4), 1.0), uContrast) * lifted;
  vec3 cellCol = mix(avgCol, inkCol, lift);
  int best = 0;
  float bestD = 1e9;
  for (int g = 0; g < uGlyphCount; g++) {
    float d = 0.0;
    for (int i = 0; i < 6; i++) {
      float diff = v[i] - texelFetch(uShapes, ivec2(i, g), 0).r;
      d += diff * diff;
    }
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  outColor = vec4(cellCol, float(best) / 255.0);
}`;
  var MAIN_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uCells;
uniform sampler2D uAtlas;
uniform vec2 uRes;
uniform float uDpr;
uniform vec2 uCellPx;
uniform vec2 uGrid;
uniform vec2 uAtlasGrid;
uniform vec2 uAtlasPad;
uniform vec2 uAtlasInner;
uniform int uGlyphCount;
uniform vec2 uPointer;
uniform float uActive;
uniform float uRadius;
uniform float uSoftness;
uniform float uColored;
uniform vec3 uColor;
uniform float uBrightness;
uniform float uLegibility;
uniform float uScramble;
uniform float uScrambleSpeed;
uniform float uEdgeWidth;
uniform float uEdgeFlicker;
uniform float uEdgeGlow;
uniform float uEdgeTint;
uniform float uAberration;
uniform float uPassthrough;
uniform vec3 uBg;
uniform float uTime;
uniform float uMaxX;
uniform float uCrisp;

float hash (vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 samp (vec2 p) {
  vec2 uv = p / uRes;
  uv = clamp(uv, vec2(0.001), vec2(uMaxX - 0.001, 0.999));
  return texture(uContent, uv);
}

void main () {
  vec2 pc = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  if (pc.x > uMaxX * uRes.x) {
    outColor = vec4(0.0);
    return;
  }
  if (uCrisp > 0.5) {
    outColor = samp(pc);
    return;
  }

  float dist = length(pc - uPointer);
  float radius = max(uRadius, 1.0);
  float inner = radius * (1.0 - clamp(uSoftness, 0.02, 1.0));
  float e = (1.0 - smoothstep(inner, radius, dist)) * uActive;

  float bandW = max(radius * clamp(uEdgeWidth, 0.0, 1.0) * 0.5, 6.0);
  float bandD = dist - mix(inner, radius, 0.5);
  float ring = exp(-bandD * bandD / (2.0 * bandW * bandW)) * uActive;

  vec2 dir = (pc - uPointer) / max(dist, 1e-3);
  float ca = uAberration * ring;
  vec4 rC = samp(pc);
  vec3 real = vec3(samp(pc + dir * ca).r, rC.g, samp(pc - dir * ca).b);

  vec2 cellPos = pc * uDpr / uCellPx;
  vec2 cell = clamp(floor(cellPos), vec2(0.0), uGrid - 1.0);
  vec4 info = texelFetch(uCells, ivec2(cell), 0);
  float glyph = floor(info.a * 255.0 + 0.5);

  float rerollP = clamp(uScramble * 0.35 + ring * uEdgeFlicker, 0.0, 1.0);
  float speed = max(uScrambleSpeed, 0.001) * (1.0 + ring * 2.5);
  float ft = floor(uTime * speed);
  float swap = step(1.0 - rerollP, hash(cell * 3.3 + vec2(ft * 0.717, ft * 0.523)))
    * step(0.5, glyph);
  float pick = hash(cell + vec2(ft * 0.613, ft * 0.831));
  glyph = mix(glyph, floor(pick * float(uGlyphCount - 1)) + 1.0, swap);

  vec2 local = clamp(cellPos - cell, 0.0, 1.0);
  float gx = mod(glyph, uAtlasGrid.x);
  float gy = floor(glyph / uAtlasGrid.x);
  vec2 atlasUv = vec2(
    (gx + uAtlasPad.x + local.x * uAtlasInner.x) / uAtlasGrid.x,
    (gy + uAtlasPad.y + local.y * uAtlasInner.y) / uAtlasGrid.y
  );
  vec2 atlasStep = uAtlasInner / uAtlasGrid;
  float mask = textureGrad(
    uAtlas,
    atlasUv,
    dFdx(cellPos) * atlasStep,
    dFdy(cellPos) * atlasStep
  ).a * step(0.5, glyph);

  vec3 cellCol = info.rgb;
  vec3 lw = vec3(0.299, 0.587, 0.114);
  vec3 dev = cellCol - uBg;
  float mag = dot(abs(dev), lw);
  float target = clamp(uLegibility, 0.0, 1.0) * 0.75;
  float boost = clamp(target / max(mag, 0.01), 1.0, 32.0);
  vec3 vivid = clamp(uBg + dev * boost, 0.0, 1.0);
  float vividMag = dot(abs(vivid - uBg), lw);
  vec3 ink = mix(vec3(1.0), vec3(0.06), step(0.5, dot(uBg, lw)));
  vivid = mix(vivid, ink, clamp((target - vividMag) / max(target, 1e-3), 0.0, 1.0));
  float cellSig = clamp(mag * 1.6, 0.0, 1.0);
  vec3 mono = uColor * mix(0.35, 1.2, cellSig);
  vec3 glyphColor = mix(mono, vivid, clamp(uColored, 0.0, 1.0));
  glyphColor = clamp(uBg + (glyphColor - uBg) * uBrightness, 0.0, 1.0);
  float cellLum = dot(vivid, lw);
  glyphColor = mix(
    glyphColor,
    uColor * max(uBrightness, 1.0) * (0.6 + cellLum),
    ring * clamp(uEdgeTint, 0.0, 1.0)
  );
  glyphColor = clamp(
    uBg + (glyphColor - uBg) * (1.0 + ring * uEdgeGlow * 1.6),
    0.0,
    1.0
  );

  vec3 base = mix(uBg, real, clamp(uPassthrough, 0.0, 1.0));
  vec3 encrypted = mix(base, glyphColor, mask);
  vec3 col = mix(encrypted, real, e);
  float alpha = mix(max(rC.a, mask), rC.a, e);
  outColor = vec4(col, alpha);
}`;
  var colorProbe = null;
  function parseColor(input) {
    if (typeof document === "undefined") return [0, 0, 0];
    if (!colorProbe) {
      const probe = document.createElement("canvas");
      probe.width = 1;
      probe.height = 1;
      colorProbe = probe.getContext("2d", { willReadFrequently: true });
    }
    if (!colorProbe) return [0, 0, 0];
    colorProbe.fillStyle = "#000000";
    colorProbe.fillStyle = input;
    colorProbe.clearRect(0, 0, 1, 1);
    colorProbe.fillRect(0, 0, 1, 1);
    const data = colorProbe.getImageData(0, 0, 1, 1).data;
    return [data[0] / 255, data[1] / 255, data[2] / 255];
  }
  function buildGlyphList(charset) {
    const seen = /* @__PURE__ */ new Set([" "]);
    const glyphs = [" "];
    for (const ch of charset) {
      if (glyphs.length >= MAX_GLYPHS) break;
      if (ch === "\n" || ch === "\r" || ch === "	" || seen.has(ch)) continue;
      seen.add(ch);
      glyphs.push(ch);
    }
    return glyphs;
  }
  function glyphShapes(image, cols, cellW, cellH, count) {
    const vectors = new Float32Array(count * 6);
    const radius = cellH * 0.26;
    const padW = cellW + ATLAS_PAD * 2;
    const padH = cellH + ATLAS_PAD * 2;
    for (let g = 0; g < count; g++) {
      const originX = g % cols * padW + ATLAS_PAD;
      const originY = Math.floor(g / cols) * padH + ATLAS_PAD;
      for (let c = 0; c < 6; c++) {
        const cx = INNER_CIRCLES[c][0] * cellW;
        const cy = INNER_CIRCLES[c][1] * cellH;
        let sum = 0;
        let total = 0;
        for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
          for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
            const dx = x + 0.5 - cx;
            const dy = y + 0.5 - cy;
            if (dx * dx + dy * dy > radius * radius) continue;
            total += 1;
            if (x < -ATLAS_PAD || y < -ATLAS_PAD || x >= cellW + ATLAS_PAD || y >= cellH + ATLAS_PAD)
              continue;
            sum += image.data[((originY + y) * image.width + originX + x) * 4 + 3];
          }
        }
        vectors[g * 6 + c] = total ? sum / (total * 255) : 0;
      }
    }
    for (let c = 0; c < 6; c++) {
      let peak = 0;
      for (let g = 0; g < count; g++) {
        peak = Math.max(peak, vectors[g * 6 + c]);
      }
      if (peak > 0) {
        for (let g = 0; g < count; g++) vectors[g * 6 + c] /= peak;
      }
    }
    return vectors;
  }
  function clampAspect(aspect) {
    return Math.min(Math.max(aspect || DEFAULTS.aspect, 0.35), 1.25);
  }
  function supportsHtmlInCanvas() {
    if (typeof document === "undefined") return false;
    const probe = document.createElement("canvas");
    const ctx = probe.getContext("2d");
    return Boolean(
      ctx && typeof ctx.drawElementImage === "function" && typeof probe.requestPaint === "function"
    );
  }
  function createDecryptReveal(elements, options = {}) {
    const config = { ...DEFAULTS, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    let contentDirty = false;
    let cellsDirty = true;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          sourceCtx.drawElementImage(content, 0, 0);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(
          "DecryptReveal shader error:",
          gl.getShaderInfoLog(shader)
        );
      }
      return shader;
    }
    function link(frag) {
      const vs = compile(gl.VERTEX_SHADER, VERT);
      const fs = compile(gl.FRAGMENT_SHADER, frag);
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      const uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        uniforms[info.name] = gl.getUniformLocation(program, info.name);
      }
      return { program, vs, fs, uniforms };
    }
    const cellPass = link(CELL_FRAG);
    const mainPass = link(MAIN_FRAG);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    function makeTexture(filter) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    }
    const contentTexture = makeTexture(gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    const cellTexture = makeTexture(gl.NEAREST);
    const cellFbo = gl.createFramebuffer();
    let cellCols = 0;
    let cellRows = 0;
    const shapeTexture = makeTexture(gl.NEAREST);
    const atlasTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    let glyphCount = 0;
    let atlasCols = 1;
    let atlasRows = 1;
    let atlasPad = [0, 0];
    let atlasInner = [1, 1];
    let builtCharset = "";
    let builtAspect = 0;
    function rebuildAtlas() {
      const aspect = clampAspect(config.aspect);
      if (builtCharset === config.charset && builtAspect === aspect) return;
      const glyphs = buildGlyphList(config.charset);
      const cellH = ATLAS_CELL;
      const cellW = Math.max(Math.round(cellH * aspect), 8);
      const padW = cellW + ATLAS_PAD * 2;
      const padH = cellH + ATLAS_PAD * 2;
      const cols = Math.ceil(Math.sqrt(glyphs.length));
      const rows = Math.ceil(glyphs.length / cols);
      const surface = document.createElement("canvas");
      surface.width = cols * padW;
      surface.height = rows * padH;
      const ctx = surface.getContext("2d");
      if (!ctx) return;
      builtCharset = config.charset;
      builtAspect = aspect;
      ctx.clearRect(0, 0, surface.width, surface.height);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const fontPx = Math.floor(Math.min(cellH * 0.92, cellW / 0.58));
      ctx.font = `600 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      for (let g = 0; g < glyphs.length; g++) {
        ctx.fillText(
          glyphs[g],
          g % cols * padW + padW / 2,
          Math.floor(g / cols) * padH + padH / 2
        );
      }
      const image = ctx.getImageData(0, 0, surface.width, surface.height);
      const vectors = glyphShapes(image, cols, cellW, cellH, glyphs.length);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        surface
      );
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, shapeTexture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R32F,
        6,
        glyphs.length,
        0,
        gl.RED,
        gl.FLOAT,
        vectors
      );
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      glyphCount = glyphs.length;
      atlasCols = cols;
      atlasRows = rows;
      atlasPad = [ATLAS_PAD / padW, ATLAS_PAD / padH];
      atlasInner = [cellW / padW, cellH / padH];
      cellsDirty = true;
    }
    let contentMaxX = 1;
    function cellSizePx(dpr) {
      const h = Math.min(Math.max(config.cell, 4), 40) * dpr;
      return [h * clampAspect(config.aspect), h];
    }
    function syncCanvasSize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const cssWidth = Math.max(1, Math.round(source.clientWidth));
        const cssHeight = Math.max(1, Math.round(source.clientHeight));
        if (source.width !== cssWidth * dpr || source.height !== cssHeight * dpr) {
          source.width = cssWidth * dpr;
          source.height = cssHeight * dpr;
        }
        paintable.requestPaint();
      }
      cellsDirty = true;
    }
    function syncCellGrid() {
      const dpr = output.width / Math.max(output.clientWidth, 1);
      const [cw, ch] = cellSizePx(dpr);
      const cols = Math.max(Math.ceil(output.width / cw), 1);
      const rows = Math.max(Math.ceil(output.height / ch), 1);
      if (cols === cellCols && rows === cellRows) return;
      cellCols = cols;
      cellRows = rows;
      gl.bindTexture(gl.TEXTURE_2D, cellTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        cols,
        rows,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, cellFbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        cellTexture,
        0
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      cellsDirty = true;
    }
    const pointer = {
      x: -1e5,
      y: -1e5,
      tx: -1e5,
      ty: -1e5,
      active: 0,
      target: 0
    };
    let time = 0;
    let bgKey = "";
    let bg = [0, 0, 0];
    let colorKey = "";
    let fg = [0.29, 0.87, 0.5];
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    rebuildAtlas();
    syncCanvasSize();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      cellsDirty = true;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
    }
    function renderCells() {
      if (!cellsDirty) return;
      cellsDirty = false;
      const dpr = output.width / Math.max(output.clientWidth, 1);
      const [cw, ch] = cellSizePx(dpr);
      const u = cellPass.uniforms;
      gl.useProgram(cellPass.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(u.uContent, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, shapeTexture);
      gl.uniform1i(u.uShapes, 1);
      gl.uniform2f(u.uContentRes, output.width, output.height);
      gl.uniform2f(u.uCellPx, cw, ch);
      gl.uniform1i(u.uGlyphCount, glyphCount);
      gl.uniform1f(u.uContrast, Math.min(Math.max(config.contrast, 0.3), 3));
      gl.uniform1f(u.uExposure, Math.min(Math.max(config.exposure, 0.2), 3));
      gl.uniform1f(u.uThreshold, Math.max(config.threshold, 5e-3));
      gl.uniform3f(u.uBg, bg[0], bg[1], bg[2]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, cellFbo);
      gl.viewport(0, 0, cellCols, cellRows);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    function render() {
      uploadContent();
      if (config.background !== bgKey) {
        bgKey = config.background;
        bg = parseColor(config.background);
        cellsDirty = true;
      }
      if (config.color !== colorKey) {
        colorKey = config.color;
        fg = parseColor(config.color);
      }
      rebuildAtlas();
      syncCellGrid();
      renderCells();
      const w = Math.max(output.clientWidth, 1);
      const h = Math.max(output.clientHeight, 1);
      const dpr = output.width / w;
      const [cw, ch] = cellSizePx(dpr);
      const u = mainPass.uniforms;
      gl.useProgram(mainPass.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(u.uContent, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, cellTexture);
      gl.uniform1i(u.uCells, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.uniform1i(u.uAtlas, 2);
      gl.uniform2f(u.uRes, w, h);
      gl.uniform1f(u.uDpr, dpr);
      gl.uniform2f(u.uCellPx, cw, ch);
      gl.uniform2f(u.uGrid, cellCols, cellRows);
      gl.uniform2f(u.uAtlasGrid, atlasCols, atlasRows);
      gl.uniform2f(u.uAtlasPad, atlasPad[0], atlasPad[1]);
      gl.uniform2f(u.uAtlasInner, atlasInner[0], atlasInner[1]);
      gl.uniform1i(u.uGlyphCount, glyphCount);
      gl.uniform2f(u.uPointer, pointer.x, pointer.y);
      gl.uniform1f(u.uActive, pointer.active);
      gl.uniform1f(u.uRadius, Math.max(config.radius, 1));
      gl.uniform1f(u.uSoftness, config.softness);
      gl.uniform1f(u.uColored, config.colored);
      gl.uniform3f(u.uColor, fg[0], fg[1], fg[2]);
      gl.uniform1f(u.uBrightness, Math.min(Math.max(config.brightness, 0.2), 3));
      gl.uniform1f(u.uLegibility, Math.min(Math.max(config.legibility, 0), 1));
      gl.uniform1f(u.uScramble, Math.min(Math.max(config.scramble, 0), 1));
      gl.uniform1f(
        u.uScrambleSpeed,
        Math.min(Math.max(config.scrambleSpeed, 0), 30)
      );
      gl.uniform1f(u.uEdgeWidth, config.edgeWidth);
      gl.uniform1f(u.uEdgeFlicker, Math.min(Math.max(config.edgeFlicker, 0), 1));
      gl.uniform1f(u.uEdgeGlow, Math.min(Math.max(config.edgeGlow, 0), 3));
      gl.uniform1f(u.uEdgeTint, config.edgeTint);
      gl.uniform1f(u.uAberration, Math.max(config.aberration, 0));
      gl.uniform1f(u.uPassthrough, config.passthrough);
      gl.uniform3f(u.uBg, bg[0], bg[1], bg[2]);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uMaxX, contentMaxX);
      gl.uniform1f(u.uCrisp, reducedMotion || !htmlInCanvas ? 1 : 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      time += delta;
      const tau = Math.max(config.smoothing, 1e-4);
      const k = reducedMotion ? 1 : 1 - Math.exp(-delta / tau);
      pointer.x += (pointer.tx - pointer.x) * k;
      pointer.y += (pointer.ty - pointer.y) * k;
      pointer.active += (pointer.target - pointer.active) * k;
      render();
      const settled = Math.abs(pointer.tx - pointer.x) < 0.1 && Math.abs(pointer.ty - pointer.y) < 0.1 && Math.abs(pointer.target - pointer.active) < 1e-3;
      const churning = config.scramble > 0 && config.scrambleSpeed > 0 || pointer.active > 1e-3 && config.edgeFlicker > 0;
      if (settled && !contentDirty && (reducedMotion || !htmlInCanvas || !churning)) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
        pointer.active = pointer.target;
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = new ResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    const listenTarget = output.parentElement ?? output;
    function onPointerMove(event) {
      const rect = output.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (pointer.target === 0 && pointer.active < 1e-3) {
        pointer.x = x;
        pointer.y = y;
      }
      pointer.tx = x;
      pointer.ty = y;
      pointer.target = 1;
      start();
    }
    function onPointerLeave() {
      pointer.target = 0;
      start();
    }
    listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
    return {
      setOptions(next) {
        let changed = false;
        for (const [key, value] of Object.entries(next)) {
          if (typeof value === "function") continue;
          if (config[key] !== value) {
            changed = true;
            break;
          }
        }
        if (!changed) {
          Object.assign(config, next);
          return;
        }
        const prev = {
          cell: config.cell,
          aspect: config.aspect,
          contrast: config.contrast,
          exposure: config.exposure,
          threshold: config.threshold
        };
        Object.assign(config, next);
        if (config.cell !== prev.cell || config.aspect !== prev.aspect || config.contrast !== prev.contrast || config.exposure !== prev.exposure || config.threshold !== prev.threshold) {
          cellsDirty = true;
        }
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        listenTarget.removeEventListener("pointermove", onPointerMove);
        listenTarget.removeEventListener("pointerleave", onPointerLeave);
        gl.deleteTexture(contentTexture);
        gl.deleteTexture(cellTexture);
        gl.deleteTexture(shapeTexture);
        gl.deleteTexture(atlasTexture);
        gl.deleteFramebuffer(cellFbo);
        gl.deleteProgram(cellPass.program);
        gl.deleteShader(cellPass.vs);
        gl.deleteShader(cellPass.fs);
        gl.deleteProgram(mainPass.program);
        gl.deleteShader(mainPass.vs);
        gl.deleteShader(mainPass.fs);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // assets/vendor/canvas-ui/DropletsVanilla.ts
  var DEFAULTS2 = {
    intensity: 0.5,
    speed: 1,
    scale: 0.4,
    dropWidth: 1,
    dropLength: 1,
    refraction: 0.2,
    blur: 0,
    vignette: 0,
    fallSpeed: 1,
    wiggle: 1,
    staticDrops: 0.2,
    interactive: true,
    interactionRadius: 0.3,
    interactionStrength: 0.6,
    interactionDistortion: 3,
    tint: [1, 1, 1],
    tintStrength: 0
  };
  var VERT2 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform vec2 uOffset;
uniform float uTime;
uniform float uIntensity;
uniform float uScale;
uniform float uDropWidth;
uniform float uDropLength;
uniform float uRefraction;
uniform float uBlur;
uniform float uVignette;
uniform float uFallSpeed;
uniform float uWiggle;
uniform float uStaticDrops;
uniform float uMaxX;
uniform sampler2D uTrail;
uniform float uWipe;
uniform float uWipeDistort;
uniform vec3 uTint;
uniform float uTintStrength;
uniform float uHasContent;

#define S(a, b, t) smoothstep(a, b, t)

vec3 N13 (float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract(vec3(
    (p3.x + p3.y) * p3.z,
    (p3.x + p3.z) * p3.y,
    (p3.y + p3.z) * p3.x
  ));
}

float N (float t) {
  return fract(sin(t * 12345.564) * 7658.76);
}

float Saw (float b, float t) {
  return S(0.0, b, t) * S(1.0, b, t);
}

float sdEgg (vec2 p, float ra, float rb) {
  const float k = 1.7320508;
  p.x = abs(p.x);
  float r = ra - rb;
  return ((p.y < 0.0) ? length(vec2(p.x, p.y)) - r :
          (k * (p.x + r) < p.y) ? length(vec2(p.x, p.y - k * r)) :
          length(vec2(p.x + r, p.y)) - 2.0 * r) - rb;
}

vec2 DropLayer (vec2 uv, float t) {
  vec2 UV = uv;
  vec2 a = vec2(6.0, 1.0);
  vec2 grid = a * 2.0;

  vec2 id = floor(uv * grid);
  float gridFall = N(id.x) / 3.0 + 0.5;
  uv.y += t * gridFall / a.y;
  id = floor(uv * grid);
  uv.y += N(id.x);

  id = floor(uv * grid);
  vec2 st = fract(uv * grid) - vec2(0.5, 0.0);
  vec3 n = N13(id.x * 35.2 + id.y * 2376.1);

  float x = n.x - 0.5;
  float lambda = UV.y * 20.0;
  float wiggle = sin(lambda + sin(lambda));
  x += wiggle * (0.5 - abs(x)) * (n.z - 0.5) * uWiggle;
  x *= 0.6;

  float slowStart = 0.85;
  float ti = fract(t * (gridFall + 0.1) + n.z);
  float y = (Saw(slowStart, ti) - 0.5) * 0.9 + 0.5;
  vec2 p = vec2(x, y);

  float dropShape = (ti > slowStart)
    ? -sin(6.2831853 * ti / (1.0 - slowStart)) * 0.5 - 0.5
    : 0.0;
  float d = sdEgg((st - p) * a.yx / vec2(uDropWidth, uDropLength), 0.0, dropShape);
  float diameter = N(id.x + id.y) / 7.0 + 0.2;
  float mainDrop = S(diameter / 1.5, 0.0, d);

  float r2 = S(1.0, y, st.y);
  float r = sqrt(r2);
  float cd = abs(st.x - x);
  float thickness = diameter * 0.95 * uDropWidth;
  float trail = S(thickness * r, 0.0, cd);
  float trailFront = S(-0.02, 0.02, st.y - y);
  trail *= r2 * trailFront * 0.5;

  y = UV.y;
  float trail2 = S((thickness - 0.15) * r, 0.0, cd);
  trail2 *= trailFront * n.z;
  float rndX = N(id.x) / 1.5 + 0.5;
  float rndY = N(st.y) / 40.0 + 0.05;
  y = fract(y * 11.0 * rndX) + (st.y - 0.5);
  float dd = length(st - vec2(x, y));
  float droplets = S(trail2 + rndY, 0.0, dd);

  float m = mainDrop + droplets * r * trailFront;
  return vec2(m, trail);
}

float StaticDrops (vec2 uv, float t) {
  uv *= 40.0;

  vec2 id = floor(uv);
  vec3 n = N13(id.x * 107.45 + id.y * 3543.654);
  vec2 p = (n.xy - 0.5) * 0.6;
  uv = fract(uv) - 0.5;

  float d = length(uv - p);
  float drop = S(0.3 * clamp(uDropWidth, 0.4, 1.4), 0.0, d);

  float fade = Saw(0.1, fract(t + n.y));
  float intensity = fract(n.x * 27.0);
  return drop * fade * intensity;
}

vec2 Drops (vec2 uv, float t, float tFall, float l0, float l1, float l2, float wipe) {
  float s = StaticDrops(uv, t) * l0 * (1.0 - wipe);
  vec2 m1 = DropLayer(uv, tFall) * (l1 * (1.0 - wipe * 0.8));
  vec2 m2 = DropLayer(uv * 1.85, tFall) * (l2 * (1.0 - wipe * 0.8));

  float c = s + m1.x + m2.x;
  c = S(0.3, 1.0, c);

  return vec2(c, m1.y + m2.y);
}

void main () {
  vec2 uv = vUv;

  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  vec2 aspectUv = (uv + uOffset - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float t = uTime * 0.2;
  float dropScale = clamp(min(uResolution.x, uResolution.y) / 900.0, 0.75, 1.35) * uScale;
  vec2 scaledUv = aspectUv * dropScale;

  float rainAmount = clamp(uIntensity, 0.0, 1.25);

  float staticDrops = S(-0.5, 1.0, rainAmount) * 2.0 * uStaticDrops;
  float layer1 = S(0.25, 0.75, rainAmount);
  float layer2 = S(0.0, 0.5, rainAmount);
  float tFall = t * uFallSpeed;

  float wipeMask = texture(uTrail, uv).r;
  float wipe = wipeMask * clamp(uWipe, 0.0, 1.0);

  vec2 c = Drops(scaledUv, t, tFall, staticDrops, layer1, layer2, wipe);

  vec2 e = vec2(0.001, 0.0);
  float cx = Drops(scaledUv + e, t, tFall, staticDrops, layer1, layer2, wipe).x;
  float cy = Drops(scaledUv + e.yx, t, tFall, staticDrops, layer1, layer2, wipe).x;
  vec2 normal = vec2(cx - c.x, cy - c.x);

  vec2 e2 = vec2(0.012, 0.0);
  float wx = texture(uTrail, uv + e2).r;
  float wy = texture(uTrail, uv + e2.yx).r;
  normal += vec2(wipeMask - wx, wipeMask - wy) * 0.05 * uWipeDistort * clamp(uWipe, 0.0, 1.0);

  vec2 refractedUv = clamp(uv + normal * uRefraction, vec2(0.001), vec2(uMaxX - 0.004, 0.999));
  float fog = clamp(uBlur, 0.0, 8.0) * mix(0.7, 1.0, rainAmount);
  float back = fog * (1.0 - clamp(c.y * 2.0, 0.0, 1.0)) * (1.0 - wipe);
  float focus = mix(back, 0.0, S(0.1, 0.2, c.x));

  if (uHasContent < 0.5) {
    float mask = S(0.02, 0.14, c.x);
    vec3 n3 = normalize(vec3(normal * 42.0, 1.0));
    vec3 L = normalize(vec3(-0.35, 0.75, 0.55));
    float spec = pow(max(dot(reflect(vec3(0.0, 0.0, -1.0), n3), L), 0.0), 34.0);
    float rim = clamp(length(normal) * 26.0, 0.0, 1.0);
    vec3 dropCol = mix(vec3(0.72), uTint, clamp(uTintStrength, 0.0, 1.0));
    vec3 colF = dropCol * (0.12 + 0.5 * rim) + vec3(spec);
    float alphaF = mask * clamp(0.1 + rim * 0.5 + spec * 0.9, 0.0, 1.0);
    outColor = vec4(clamp(colF, 0.0, 1.0) * alphaF, alphaF);
    return;
  }

  vec4 content = textureLod(uContent, vec2(refractedUv.x, 1.0 - refractedUv.y), focus);
  vec3 col = content.rgb;

  col = mix(col, uTint, clamp(uTintStrength, 0.0, 1.0) * 0.35);

  vec2 vignetteUv = uv - 0.5;
  col *= 1.0 - dot(vignetteUv, vignetteUv) * clamp(uVignette, 0.0, 1.0) * 2.0;

  outColor = vec4(col * content.a, content.a);
}`;
  var TRAIL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPrev;
uniform vec2 uFrom;
uniform vec2 uTo;
uniform float uAspect;
uniform float uRadius;
uniform float uDecay;
uniform float uDrain;
uniform float uSplat;

float capsule (vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main () {
  float prev = max(texture(uPrev, vUv).r * uDecay - uDrain, 0.0);
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 a = vec2(uFrom.x * uAspect, uFrom.y);
  vec2 b = vec2(uTo.x * uAspect, uTo.y);
  float d = capsule(p, a, b);
  float m = smoothstep(uRadius, uRadius * 0.5, d) * uSplat;
  outColor = vec4(max(prev, m), 0.0, 0.0, 1.0);
}`;
  function supportsHtmlInCanvas2() {
    if (typeof document === "undefined") return false;
    const probe = document.createElement("canvas");
    const ctx = probe.getContext("2d");
    return Boolean(
      ctx && typeof ctx.drawElementImage === "function" && typeof probe.requestPaint === "function"
    );
  }
  function createDroplets(elements, options = {}) {
    const config = { ...DEFAULTS2, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          sourceCtx.drawElementImage(content, 0, 0);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Droplets shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT2);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
    const trailShader = compile(gl.FRAGMENT_SHADER, TRAIL_FRAG);
    function link(fragment) {
      const prog = gl.createProgram();
      gl.attachShader(prog, vertexShader);
      gl.attachShader(prog, fragment);
      gl.linkProgram(prog);
      const locations = {};
      const total = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < total; i++) {
        const info = gl.getActiveUniform(prog, i);
        locations[info.name] = gl.getUniformLocation(prog, info.name);
      }
      return { program: prog, uniforms: locations };
    }
    const { program, uniforms } = link(fragmentShader);
    const { program: trailProgram, uniforms: trailUniforms } = link(trailShader);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    let contentMaxX = 1;
    function syncCanvasSize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const cssWidth = Math.max(1, Math.round(source.clientWidth));
        const cssHeight = Math.max(1, Math.round(source.clientHeight));
        if (source.width !== cssWidth * dpr || source.height !== cssHeight * dpr) {
          source.width = cssWidth * dpr;
          source.height = cssHeight * dpr;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    let trailWidth = 0;
    let trailHeight = 0;
    const trailTextures = [];
    const trailFramebuffers = [];
    let trailIndex = 0;
    function ensureTrailTargets() {
      const width = Math.max(1, Math.round(output.width / 4));
      const height = Math.max(1, Math.round(output.height / 4));
      if (width === trailWidth && height === trailHeight && trailTextures.length)
        return;
      trailWidth = width;
      trailHeight = height;
      for (const texture of trailTextures) gl.deleteTexture(texture);
      for (const framebuffer of trailFramebuffers)
        gl.deleteFramebuffer(framebuffer);
      trailTextures.length = 0;
      trailFramebuffers.length = 0;
      for (let i = 0; i < 2; i++) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          width,
          height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null
        );
        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          texture,
          0
        );
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        trailTextures.push(texture);
        trailFramebuffers.push(framebuffer);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    const pointer = {
      x: 0.5,
      y: 0.5,
      px: 0.5,
      py: 0.5,
      seen: false,
      moved: false
    };
    function updateTrail(delta) {
      ensureTrailTargets();
      gl.useProgram(trailProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, trailTextures[trailIndex]);
      gl.uniform1i(trailUniforms.uPrev, 0);
      gl.uniform1f(trailUniforms.uDecay, Math.exp(-delta * 0.5));
      gl.uniform1f(trailUniforms.uDrain, delta * 0.3);
      gl.uniform1f(
        trailUniforms.uAspect,
        output.width / Math.max(output.height, 1)
      );
      gl.uniform2f(trailUniforms.uFrom, pointer.px, pointer.py);
      gl.uniform2f(trailUniforms.uTo, pointer.x, pointer.y);
      gl.uniform1f(
        trailUniforms.uRadius,
        Math.max(config.interactionRadius, 0.01)
      );
      gl.uniform1f(
        trailUniforms.uSplat,
        config.interactive && pointer.moved ? 1 : 0
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, trailFramebuffers[1 - trailIndex]);
      gl.viewport(0, 0, trailWidth, trailHeight);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      trailIndex = 1 - trailIndex;
      pointer.px = pointer.x;
      pointer.py = pointer.y;
      pointer.moved = false;
    }
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    function render(timeSec) {
      uploadContent();
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform1f(uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      gl.uniform2f(
        uniforms.uOffset,
        content.scrollLeft / Math.max(content.clientWidth, 1),
        -content.scrollTop / Math.max(content.clientHeight, 1)
      );
      gl.uniform1f(uniforms.uTime, timeSec);
      gl.uniform1f(uniforms.uIntensity, config.intensity);
      gl.uniform1f(uniforms.uScale, Math.max(config.scale, 0.01));
      gl.uniform1f(uniforms.uDropWidth, Math.max(config.dropWidth, 0.05));
      gl.uniform1f(uniforms.uDropLength, Math.max(config.dropLength, 0.05));
      gl.uniform1f(uniforms.uRefraction, config.refraction);
      gl.uniform1f(uniforms.uBlur, Math.max(config.blur, 0));
      gl.uniform1f(uniforms.uVignette, config.vignette);
      gl.uniform1f(uniforms.uFallSpeed, config.fallSpeed);
      gl.uniform1f(uniforms.uWiggle, config.wiggle);
      gl.uniform1f(uniforms.uStaticDrops, config.staticDrops);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, trailTextures[trailIndex]);
      gl.uniform1i(uniforms.uTrail, 1);
      gl.uniform1f(
        uniforms.uWipe,
        config.interactive ? Math.min(Math.max(config.interactionStrength, 0), 1) : 0
      );
      gl.uniform1f(
        uniforms.uWipeDistort,
        Math.max(config.interactionDistortion, 0)
      );
      gl.uniform3f(
        uniforms.uTint,
        config.tint[0],
        config.tint[1],
        config.tint[2]
      );
      gl.uniform1f(uniforms.uTintStrength, config.tintStrength);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let elapsed = 0;
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      elapsed += delta * config.speed;
      updateTrail(delta);
      render(elapsed);
      if (reducedMotion && !contentDirty) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = new ResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    const listenTarget = output.parentElement ?? output;
    function onPointerMove(event) {
      if (!config.interactive || reducedMotion) return;
      const rect = output.getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
      const y = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
      if (!pointer.seen) {
        pointer.seen = true;
        pointer.px = x;
        pointer.py = y;
      }
      pointer.x = x;
      pointer.y = y;
      pointer.moved = true;
      start();
    }
    function onPointerLeave() {
      pointer.seen = false;
    }
    listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
    content.addEventListener("scroll", start, { passive: true });
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        listenTarget.removeEventListener("pointermove", onPointerMove);
        listenTarget.removeEventListener("pointerleave", onPointerLeave);
        content.removeEventListener("scroll", start);
        gl.deleteTexture(contentTexture);
        for (const texture of trailTextures) gl.deleteTexture(texture);
        for (const framebuffer of trailFramebuffers)
          gl.deleteFramebuffer(framebuffer);
        gl.deleteProgram(program);
        gl.deleteProgram(trailProgram);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteShader(trailShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // assets/vendor/canvas-ui/ParticleScrollVanilla.ts
  var DEFAULTS3 = {
    point: 0.68,
    band: 420,
    density: 2,
    size: 1.25,
    spread: 220,
    gravity: 0.35,
    drift: 0.7,
    swirl: 60,
    stagger: 0.7,
    fade: 0.85,
    settle: 1.2,
    smoothing: 0.6
  };
  var HASH = `
float hash (vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}`;
  var QUAD_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var BASE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uRowTex;
uniform vec2 uRes;
uniform float uDensity;
uniform float uRowCount;
uniform float uStagger;
uniform float uMaxX;
uniform float uCover;
uniform float uScroll;
uniform float uWinStart;
uniform vec3 uBg;
${HASH}
void main () {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec2 cell = floor(vec2(px.x, px.y + uScroll) / uDensity);
  float h1 = hash(cell);
  float d = h1 * uStagger;
  int row = int(clamp(cell.y - uWinStart, 0.0, uRowCount - 1.0));
  float p = texelFetch(uRowTex, ivec2(row, 0), 0).r;
  float t = clamp((p - d) / max(1.0 - d, 1e-3), 0.0, 1.0);
  float vis = step(0.9995, t) * step(px.x, uMaxX * uRes.x);
  vec4 tex = texture(uContent, vec2(vUv.x, 1.0 - vUv.y));
  outColor = vec4(mix(uBg, tex.rgb, vis * tex.a), uCover);
}`;
  var POINT_VERT = `#version 300 es
precision highp float;
uniform sampler2D uRowTex;
uniform vec2 uRes;
uniform vec2 uGrid;
uniform float uDensity;
uniform float uStagger;
uniform float uSpread;
uniform float uGravity;
uniform float uDrift;
uniform float uSwirl;
uniform float uTime;
uniform float uFade;
uniform float uSize;
uniform float uDpr;
uniform float uMaxX;
uniform float uLag;
uniform float uScroll;
uniform float uWinStart;
out vec2 vCenter;
out float vSize;
out float vAlpha;
out float vLod;
out float vMerge;
${HASH}
void main () {
  float fid = float(gl_VertexID);
  vec2 local = vec2(mod(fid, uGrid.x), floor(fid / uGrid.x));
  vec2 cell = vec2(local.x, local.y + uWinStart);
  float h1 = hash(cell);
  float h2 = hash(cell + vec2(1.7, 9.1));
  float h3 = hash(cell + vec2(5.5, 2.9));
  float h4 = hash(cell + vec2(8.4, 4.2));
  float d = h1 * uStagger;
  vec2 home = vec2(
    (cell.x + 0.5) * uDensity,
    (cell.y + 0.5) * uDensity - uScroll
  );
  int row = int(clamp(local.y, 0.0, uGrid.y - 1.0));
  float p = texelFetch(uRowTex, ivec2(row, 0), 0).r;
  float t = clamp((p - d) / max(1.0 - d, 1e-3), 0.0, 1.0);
  float e = 1.0 - pow(1.0 - t, 3.0);
  float vis = (1.0 - step(0.9995, t))
    * step(home.x, uMaxX * uRes.x)
    * step(home.y, uRes.y)
    * step(-uDensity, home.y);
  if (vis < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vCenter = vec2(0.0);
    vSize = 0.0;
    vAlpha = 0.0;
    vLod = 0.0;
    vMerge = 0.0;
    return;
  }
  vec2 dir = normalize(vec2(h2 - 0.5, h3 - 0.5) + vec2(1e-4, 0.0));
  float reach = 0.08 + 0.92 * pow(h4, 2.4);
  vec2 off = dir * uSpread * reach;
  off.y += uGravity * uSpread * (0.25 + 0.75 * h4);
  vec2 scat = home + off;
  vec2 pos = mix(scat, home, e);
  vec2 perp = vec2(-dir.y, dir.x);
  pos += perp * (h2 - 0.5) * 2.0 * uSwirl * sin(e * 3.14159);
  float tt = uTime * uDrift;
  float amp = (1.0 - e) * (uSpread * 0.05 + 2.5);
  pos += vec2(
    sin(tt * (4.0 + 5.0 * h2) + h3 * 40.0),
    cos(tt * (3.5 + 5.5 * h3) + h2 * 40.0)
  ) * amp;
  pos.y += uLag * (1.0 - e) * (0.5 + 0.5 * h4);
  pos += vec2(h4 - 0.5, h1 - 0.5) * uDensity * 3.0
    * (1.0 - smoothstep(0.5, 0.85, t));
  float grow = smoothstep(0.55, 1.0, e);
  float sizeCss = mix(uSize, uDensity * 1.3, grow);
  vCenter = home;
  vSize = sizeCss;
  vAlpha = mix(uFade, 1.0, e);
  vLod = (1.0 - e) * 1.5;
  vMerge = smoothstep(0.75, 0.97, t);
  gl_Position = vec4(
    pos.x / uRes.x * 2.0 - 1.0,
    1.0 - pos.y / uRes.y * 2.0,
    0.0,
    1.0
  );
  gl_PointSize = max(sizeCss * uDpr, 1.0);
}`;
  var POINT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uContent;
uniform vec2 uRes;
in vec2 vCenter;
in float vSize;
in float vAlpha;
in float vLod;
in float vMerge;
out vec4 outColor;
void main () {
  vec2 o = gl_PointCoord - 0.5;
  vec2 uv = clamp((vCenter + o * vSize) / uRes, 0.0, 1.0);
  vec4 tex = textureLod(uContent, uv, vLod);
  float circle = 1.0 - smoothstep(0.25, 0.5, length(o));
  float mask = mix(circle, 1.0, vMerge);
  float a = vAlpha * mask * tex.a;
  if (a < 0.01) discard;
  outColor = vec4(tex.rgb, a);
}`;
  function supportsHtmlInCanvas3() {
    if (typeof document === "undefined") return false;
    const probe = document.createElement("canvas");
    const ctx = probe.getContext("2d");
    return Boolean(
      ctx && typeof ctx.drawElementImage === "function" && typeof probe.requestPaint === "function"
    );
  }
  function createParticleScroll(elements, options = {}) {
    const config = { ...DEFAULTS3, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          sourceCtx.drawElementImage(content, 0, 0);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(
          "ParticleScroll shader error:",
          gl.getShaderInfoLog(shader)
        );
      }
      return shader;
    }
    function link(vertText, fragText) {
      const vert = compile(gl.VERTEX_SHADER, vertText);
      const frag = compile(gl.FRAGMENT_SHADER, fragText);
      const program = gl.createProgram();
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      const uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        uniforms[info.name] = gl.getUniformLocation(program, info.name);
      }
      return { program, vert, frag, uniforms };
    }
    const base = link(QUAD_VERT, BASE_FRAG);
    const points = link(POINT_VERT, POINT_FRAG);
    const quadVao = gl.createVertexArray();
    gl.bindVertexArray(quadVao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const pointVao = gl.createVertexArray();
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    let contentMaxX = 1;
    const rowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, rowTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    let rowProgress = new Float32Array(0);
    let rowWindow = new Float32Array(0);
    let rowsAnimating = false;
    let rowsAssembled = false;
    let bg = [0, 0, 0];
    const bgProbe = document.createElement("canvas");
    bgProbe.width = bgProbe.height = 1;
    const bgCtx = bgProbe.getContext("2d", { willReadFrequently: true });
    function syncBgColor() {
      if (!bgCtx) return;
      let el = content;
      while (el) {
        const css = getComputedStyle(el).backgroundColor;
        if (css && css !== "transparent") {
          bgCtx.clearRect(0, 0, 1, 1);
          bgCtx.fillStyle = css;
          bgCtx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = bgCtx.getImageData(0, 0, 1, 1).data;
          if (a > 0) {
            bg = [r / 255, g / 255, b / 255];
            return;
          }
        }
        el = el.parentElement;
      }
      bg = [0, 0, 0];
    }
    function syncCanvasSize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const cssWidth = Math.max(1, Math.round(source.clientWidth));
        const cssHeight = Math.max(1, Math.round(source.clientHeight));
        if (source.width !== cssWidth * dpr || source.height !== cssHeight * dpr) {
          source.width = cssWidth * dpr;
          source.height = cssHeight * dpr;
        }
        paintable.requestPaint();
      }
    }
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    let time = 0;
    let introDone = false;
    let introWait = 0;
    let introReady = false;
    let scrollSmooth = content.scrollTop;
    syncCanvasSize();
    syncBgColor();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      introReady = true;
      syncBgColor();
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    function rowTargetFor(docRowY) {
      if (reducedMotion || !introDone) return 1;
      const h = Math.max(output.clientHeight, 1);
      const band = Math.max(config.band, 1);
      const max = content.scrollHeight - content.clientHeight;
      let line = Math.min(Math.max(config.point, 0), 1) * h;
      if (max <= 1) {
        line = h + band;
      } else {
        const endP = Math.min(
          Math.max((scrollSmooth - (max - h * 0.5)) / (h * 0.5), 0),
          1
        );
        line += (h + band - line) * endP * endP;
      }
      const vy = docRowY - scrollSmooth;
      return Math.min(Math.max((line + band - vy) / band, 0), 1);
    }
    function updateRows(dt, density, winStart, winLen) {
      const docRows = Math.max(1, Math.ceil(content.scrollHeight / density));
      if (rowProgress.length !== docRows) {
        const next = new Float32Array(docRows);
        for (let i = 0; i < docRows; i++) {
          next[i] = rowTargetFor((i + 0.5) * density);
        }
        rowProgress = next;
      }
      if (rowWindow.length !== winLen) rowWindow = new Float32Array(winLen);
      rowsAnimating = false;
      let minP = 1;
      const settle = Math.max(config.settle, 0.05);
      for (let i = 0; i < docRows; i++) {
        const target = rowTargetFor((i + 0.5) * density);
        let p = rowProgress[i];
        const inWin = i >= winStart - 4 && i < winStart + winLen + 4;
        if (p !== target) {
          if (reducedMotion || !inWin) {
            p = target;
          } else {
            if (p < target) p = Math.min(p + dt / settle, target);
            else p = Math.max(p - dt / (settle * 0.6), target);
            if (p !== target) rowsAnimating = true;
          }
          rowProgress[i] = p;
        }
        if (inWin && p < minP) minP = p;
      }
      rowsAssembled = minP >= 0.9995;
      rowWindow.fill(1);
      const from = Math.min(Math.max(winStart, 0), docRows);
      const to = Math.min(winStart + winLen, docRows);
      if (to > from)
        rowWindow.set(rowProgress.subarray(from, to), from - winStart);
      gl.bindTexture(gl.TEXTURE_2D, rowTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R32F,
        winLen,
        1,
        0,
        gl.RED,
        gl.FLOAT,
        rowWindow
      );
    }
    function render(dt) {
      uploadContent();
      const w = Math.max(output.clientWidth, 1);
      const h = Math.max(output.clientHeight, 1);
      const dpr = output.width / w;
      const density = Math.max(
        Math.max(config.density, 1),
        Math.sqrt(w * h / 8e5)
      );
      const scrollTop = content.scrollTop;
      const gridX = Math.ceil(w / density);
      const winStart = Math.floor(scrollTop / density);
      const winLen = Math.ceil(h / density) + 2;
      const stagger = Math.min(Math.max(config.stagger, 0), 0.95);
      updateRows(dt, density, winStart, winLen);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, rowTex);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.disable(gl.BLEND);
      gl.useProgram(base.program);
      gl.bindVertexArray(quadVao);
      gl.uniform1i(base.uniforms.uContent, 0);
      gl.uniform1i(base.uniforms.uRowTex, 1);
      gl.uniform2f(base.uniforms.uRes, w, h);
      gl.uniform1f(base.uniforms.uDensity, density);
      gl.uniform1f(base.uniforms.uRowCount, winLen);
      gl.uniform1f(base.uniforms.uStagger, stagger);
      gl.uniform1f(base.uniforms.uMaxX, contentMaxX);
      gl.uniform1f(base.uniforms.uCover, htmlInCanvas ? 1 : 0);
      gl.uniform1f(base.uniforms.uScroll, scrollTop);
      gl.uniform1f(base.uniforms.uWinStart, winStart);
      gl.uniform3f(base.uniforms.uBg, bg[0], bg[1], bg[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!htmlInCanvas || rowsAssembled) return;
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ZERO,
        gl.ONE
      );
      gl.useProgram(points.program);
      gl.bindVertexArray(pointVao);
      gl.uniform1i(points.uniforms.uRowTex, 1);
      gl.uniform2f(points.uniforms.uRes, w, h);
      gl.uniform2f(points.uniforms.uGrid, gridX, winLen);
      gl.uniform1f(points.uniforms.uDensity, density);
      gl.uniform1f(points.uniforms.uStagger, stagger);
      gl.uniform1f(points.uniforms.uSpread, Math.max(config.spread, 0));
      gl.uniform1f(
        points.uniforms.uGravity,
        Math.min(Math.max(config.gravity, -1), 1)
      );
      gl.uniform1f(points.uniforms.uDrift, Math.max(config.drift, 0));
      gl.uniform1f(points.uniforms.uSwirl, Math.max(config.swirl, 0));
      gl.uniform1f(points.uniforms.uTime, time);
      gl.uniform1f(points.uniforms.uFade, Math.min(Math.max(config.fade, 0), 1));
      gl.uniform1f(points.uniforms.uSize, Math.max(config.size, 0.5));
      gl.uniform1f(points.uniforms.uDpr, dpr);
      gl.uniform1f(points.uniforms.uMaxX, contentMaxX);
      gl.uniform1i(points.uniforms.uContent, 0);
      gl.uniform1f(points.uniforms.uLag, lag);
      gl.uniform1f(points.uniforms.uScroll, scrollTop);
      gl.uniform1f(points.uniforms.uWinStart, winStart);
      gl.drawArrays(gl.POINTS, 0, gridX * winLen);
      gl.bindVertexArray(quadVao);
      gl.disable(gl.BLEND);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    let lag = 0;
    let lastScrollTop = content.scrollTop;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      time += delta;
      const scrollTop = content.scrollTop;
      lag += scrollTop - lastScrollTop;
      lastScrollTop = scrollTop;
      lag *= Math.exp(-delta / 0.22);
      lag = Math.min(Math.max(lag, -400), 400);
      if (reducedMotion || Math.abs(lag) < 0.1) lag = 0;
      if (!introDone) {
        if (reducedMotion || !htmlInCanvas) introDone = true;
        else if (introReady) {
          introWait += delta;
          if (introWait >= 1) introDone = true;
        }
      }
      const tau = config.smoothing;
      const k = reducedMotion || tau <= 0 ? 1 : 1 - Math.exp(-delta / Math.max(tau, 1e-4));
      scrollSmooth += (scrollTop - scrollSmooth) * k;
      if (Math.abs(scrollTop - scrollSmooth) < 0.5) scrollSmooth = scrollTop;
      render(delta);
      if (!contentDirty && scrollSmooth === scrollTop && !rowsAnimating && rowsAssembled && introDone && lag === 0) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onScroll() {
      if (htmlInCanvas) paintable.requestPaint();
      start();
    }
    content.addEventListener("scroll", onScroll, { passive: true });
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = new ResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        content.removeEventListener("scroll", onScroll);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        gl.deleteTexture(contentTexture);
        gl.deleteTexture(rowTex);
        gl.deleteProgram(base.program);
        gl.deleteProgram(points.program);
        gl.deleteShader(base.vert);
        gl.deleteShader(base.frag);
        gl.deleteShader(points.vert);
        gl.deleteShader(points.frag);
        gl.deleteBuffer(quad);
        gl.deleteVertexArray(quadVao);
        gl.deleteVertexArray(pointVao);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // assets/vendor/canvas-ui/RetroDitherVanilla.ts
  var DEFAULTS4 = {
    radius: 0.5,
    softness: 1,
    pixelSize: 2,
    levels: 4,
    darkColor: [0, 0, 0],
    lightColor: [1, 1, 1],
    colorize: 0.1,
    contrast: 0.6,
    brightness: 0,
    strength: 0.75,
    baseStrength: 0,
    invert: 0,
    scanlines: 0,
    pattern: "bayer",
    trail: 0.4,
    degauss: 0.8,
    followSpeed: 3
  };
  var PATTERNS = { bayer: 0, halftone: 1, hatch: 2, dash: 3 };
  var VERT3 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var TRAIL_N = 24;
  var RIPPLE_N = 3;
  var FRAG2 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uPixelSize;
uniform float uLevels;
uniform float uRadius;
uniform float uSoftness;
uniform vec2 uPointer;
uniform float uActive;
uniform vec3 uDark;
uniform vec3 uLight;
uniform float uColorize;
uniform float uContrast;
uniform float uBrightness;
uniform float uStrength;
uniform float uBase;
uniform float uInvert;
uniform float uScanlines;
uniform float uMaxX;
uniform sampler2D uTextMask;
uniform int uPattern;
uniform vec3 uTrail[${TRAIL_N}];
uniform vec4 uRipples[${RIPPLE_N}];

#define S(a, b, t) smoothstep(a, b, t)

float bayer (ivec2 p) {
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(b[(p.y % 4) * 4 + (p.x % 4)]) + 0.5) / 16.0;
}

float patternThreshold (ivec2 cell) {
  if (uPattern == 1) {
    vec2 p = vec2(cell % 4) - 1.5;
    return clamp(length(p) / 2.6, 0.03, 0.97);
  }
  if (uPattern == 2) {
    return fract(float(cell.x + cell.y) * 0.25 + 0.125);
  }
  if (uPattern == 3) {
    return fract(float(cell.x) * 0.25 + float(cell.y % 2) * 0.5 + 0.125);
  }
  return bayer(cell);
}

float ditherQuant (float v, ivec2 cell) {
  float x = v * uLevels;
  return floor(x + step(patternThreshold(cell), fract(x))) / uLevels;
}

void main () {
  vec2 uv = vUv;

  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  float aspect = uResolution.x / uResolution.y;

  float rippleReveal = 0.0;
  vec2 rippleWarp = vec2(0.0);
  for (int i = 0; i < ${RIPPLE_N}; i++) {
    float amp = uRipples[i].w;
    if (amp <= 0.001) continue;
    vec2 toUv = (uv - uRipples[i].xy) * vec2(aspect, 1.0);
    float d = length(toUv);
    float band = exp(-pow((d - uRipples[i].z) / 0.07, 2.0)) * amp;
    rippleReveal = max(rippleReveal, band);
    rippleWarp += normalize(toUv + 1e-5) * band * 0.012 / vec2(aspect, 1.0);
  }
  uv = clamp(uv + rippleWarp, vec2(0.0), vec2(uMaxX, 1.0));

  vec4 content = texture(uContent, vec2(uv.x, 1.0 - uv.y));

  vec2 frag = uv * uResolution;
  vec2 cell = floor(frag / uPixelSize);
  vec2 cellUv = (cell + 0.5) * uPixelSize / uResolution;
  cellUv = clamp(cellUv, vec2(0.001), vec2(uMaxX - 0.002, 0.999));
  vec4 pixel = texture(uContent, vec2(cellUv.x, 1.0 - cellUv.y));
  float rawLum = dot(pixel.rgb, vec3(0.299, 0.587, 0.114));

  float textness = texture(uTextMask, vec2(uv.x, 1.0 - uv.y)).r;
  float crisp = 0.0;
  if (textness > 0.4) {
    float px = max(uPixelSize * 0.25, 1.0);
    vec2 fineUv = (floor(frag / px) + 0.5) * px / uResolution;
    fineUv = clamp(fineUv, vec2(0.001), vec2(uMaxX - 0.002, 0.999));
    vec4 fine = texture(uContent, vec2(fineUv.x, 1.0 - fineUv.y));
    float fineLum = dot(fine.rgb, vec3(0.299, 0.587, 0.114));
    if (abs(fineLum - rawLum) > 0.1) {
      crisp = 1.0;
      pixel = fine;
      rawLum = fineLum;
    }
  }

  float contrastAmt = mix(uContrast, max(uContrast, 0.5), crisp);
  float brightAmt = uBrightness * mix(1.0, 0.3, crisp);
  float lum = clamp((rawLum - 0.5) * contrastAmt + 0.5 + brightAmt, 0.0, 1.0);
  lum = mix(lum, 1.0 - lum, clamp(uInvert, 0.0, 1.0));
  float q = crisp > 0.5
    ? clamp(floor(lum * uLevels + 0.5) / uLevels, 0.0, 1.0)
    : ditherQuant(lum, ivec2(cell));

  vec3 palette = mix(uDark, uLight, q);
  vec3 keepHue = pixel.rgb * (q / max(lum, 0.001));
  vec3 dithered = mix(keepHue, palette, clamp(uColorize, 0.0, 1.0));
  float scanAmp = mix(0.45, 0.15, crisp);
  dithered *= 1.0 - uScanlines * scanAmp * mod(cell.y, 2.0);
  dithered *= 1.0 + rippleReveal * vec3(0.22, -0.06, 0.3);

  float dist = length((uv - uPointer) * vec2(aspect, 1.0));
  float radius = max(uRadius * uActive, 1e-4);
  float inner = radius * (1.0 - clamp(uSoftness, 0.0, 1.0));
  float lens = (1.0 - S(inner, radius, dist)) * uActive;

  float ghost = 0.0;
  for (int i = 0; i < ${TRAIL_N}; i++) {
    float amp = uTrail[i].z;
    if (amp <= 0.001) continue;
    float td = length((uv - uTrail[i].xy) * vec2(aspect, 1.0));
    float tr = max(uRadius * 0.8, 1e-4);
    ghost = max(ghost, (1.0 - S(tr * 0.2, tr, td)) * amp);
  }

  float mask = clamp(max(max(lens, ghost), clamp(uBase, 0.0, 1.0)), 0.0, 1.0)
    * clamp(uStrength, 0.0, 1.0);
  mask = clamp(max(mask, rippleReveal), 0.0, 1.0);

  float apply = step(bayer(ivec2(cell)), mask);

  vec3 col = mix(content.rgb, dithered, apply);
  float alpha = mix(content.a, pixel.a, apply);
  outColor = vec4(col, alpha);
}`;
  function supportsHtmlInCanvas4() {
    if (typeof document === "undefined") return false;
    const probe = document.createElement("canvas");
    const ctx = probe.getContext("2d");
    return Boolean(
      ctx && typeof ctx.drawElementImage === "function" && typeof probe.requestPaint === "function"
    );
  }
  function createRetroDither(elements, options = {}) {
    const config = { ...DEFAULTS4, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          sourceCtx.drawElementImage(content, 0, 0);
          contentDirty = true;
          scheduleTextMask();
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("RetroDither shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT3);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG2);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    const textMaskTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, textMaskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    const MASK_SCALE = 0.25;
    const maskCanvas = document.createElement("canvas");
    const maskCtx = maskCanvas.getContext("2d");
    let maskDirty = false;
    let maskTimer = 0;
    let maskStamp = 0;
    function buildTextMask() {
      if (!maskCtx) return;
      const bounds = output.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width * MASK_SCALE));
      const height = Math.max(1, Math.round(bounds.height * MASK_SCALE));
      if (maskCanvas.width !== width || maskCanvas.height !== height) {
        maskCanvas.width = width;
        maskCanvas.height = height;
      }
      maskCtx.clearRect(0, 0, width, height);
      maskCtx.fillStyle = "#fff";
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let node;
      while (node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const parent = node.parentElement;
        if (!parent || parent.checkVisibility && !parent.checkVisibility()) {
          continue;
        }
        range.selectNodeContents(node);
        const rects = range.getClientRects();
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          if (r.width < 1 || r.height < 1) continue;
          if (r.bottom < bounds.top || r.top > bounds.bottom) continue;
          maskCtx.fillRect(
            (r.left - bounds.left - 1) * MASK_SCALE,
            (r.top - bounds.top - 1) * MASK_SCALE,
            (r.width + 2) * MASK_SCALE,
            (r.height + 2) * MASK_SCALE
          );
        }
      }
      const fields = content.querySelectorAll("input, textarea, select");
      for (let i = 0; i < fields.length; i++) {
        const r = fields[i].getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (r.bottom < bounds.top || r.top > bounds.bottom) continue;
        maskCtx.fillRect(
          (r.left - bounds.left) * MASK_SCALE,
          (r.top - bounds.top) * MASK_SCALE,
          r.width * MASK_SCALE,
          r.height * MASK_SCALE
        );
      }
      maskDirty = true;
    }
    function scheduleTextMask() {
      if (maskTimer) return;
      const wait = Math.max(0, 120 - (performance.now() - maskStamp));
      maskTimer = window.setTimeout(() => {
        maskTimer = 0;
        maskStamp = performance.now();
        buildTextMask();
        start();
      }, wait);
    }
    let contentMaxX = 1;
    function syncCanvasSize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const cssWidth = Math.max(1, Math.round(source.clientWidth));
        const cssHeight = Math.max(1, Math.round(source.clientHeight));
        if (source.width !== cssWidth * dpr || source.height !== cssHeight * dpr) {
          source.width = cssWidth * dpr;
          source.height = cssHeight * dpr;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, target: 0 };
    const trailData = new Float32Array(TRAIL_N * 3);
    const trailPts = [];
    const rippleData = new Float32Array(RIPPLE_N * 4);
    const ripples = [];
    let fxAlive = false;
    function updateEffects(nowS) {
      fxAlive = false;
      if (config.trail > 1e-3 && pointer.active > 0.1 && !reducedMotion) {
        const last = trailPts[trailPts.length - 1];
        if (!last || nowS - last.t >= 0.04) {
          trailPts.push({ x: pointer.x, y: pointer.y, t: nowS });
          if (trailPts.length > TRAIL_N) trailPts.shift();
        }
      }
      trailData.fill(0);
      for (let i = trailPts.length - 1; i >= 0; i--) {
        const p = trailPts[i];
        const age = nowS - p.t;
        const fade = Math.min(Math.max((0.95 - age) / 0.25, 0), 1);
        const s = config.trail * Math.exp(-age * 2.2) * fade;
        if (s < 5e-3) {
          trailPts.splice(0, i + 1);
          break;
        }
        trailData[i * 3] = p.x;
        trailData[i * 3 + 1] = p.y;
        trailData[i * 3 + 2] = s;
        fxAlive = true;
      }
      rippleData.fill(0);
      for (let i = ripples.length - 1; i >= 0; i--) {
        if (nowS - ripples[i].t > 0.9) ripples.splice(i, 1);
      }
      for (let i = 0; i < ripples.length && i < RIPPLE_N; i++) {
        const age = nowS - ripples[i].t;
        rippleData[i * 4] = ripples[i].x;
        rippleData[i * 4 + 1] = ripples[i].y;
        rippleData[i * 4 + 2] = age * 1.2;
        rippleData[i * 4 + 3] = config.degauss * (1 - age / 0.9);
        fxAlive = true;
      }
    }
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
    }
    function uploadMask() {
      if (!maskDirty) return;
      maskDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, textMaskTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        maskCanvas
      );
    }
    function render() {
      uploadContent();
      uploadMask();
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textMaskTexture);
      gl.uniform1i(uniforms.uTextMask, 1);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      const dpr = output.width / Math.max(output.clientWidth, 1);
      gl.uniform1f(uniforms.uPixelSize, Math.max(config.pixelSize, 1) * dpr);
      gl.uniform1f(uniforms.uLevels, Math.max(config.levels, 1));
      gl.uniform1f(uniforms.uRadius, Math.max(config.radius, 0.01));
      gl.uniform1f(uniforms.uSoftness, config.softness);
      gl.uniform2f(uniforms.uPointer, pointer.x, pointer.y);
      gl.uniform1f(uniforms.uActive, pointer.active);
      gl.uniform3f(
        uniforms.uDark,
        config.darkColor[0],
        config.darkColor[1],
        config.darkColor[2]
      );
      gl.uniform3f(
        uniforms.uLight,
        config.lightColor[0],
        config.lightColor[1],
        config.lightColor[2]
      );
      gl.uniform1f(uniforms.uColorize, config.colorize);
      gl.uniform1f(uniforms.uContrast, Math.max(config.contrast, 0));
      gl.uniform1f(uniforms.uBrightness, config.brightness);
      gl.uniform1f(uniforms.uStrength, config.strength);
      gl.uniform1f(uniforms.uBase, config.baseStrength);
      gl.uniform1f(uniforms.uInvert, config.invert);
      gl.uniform1f(uniforms.uScanlines, config.scanlines);
      gl.uniform1i(uniforms.uPattern, PATTERNS[config.pattern] ?? 0);
      gl.uniform3fv(uniforms["uTrail[0]"], trailData);
      gl.uniform4fv(uniforms["uRipples[0]"], rippleData);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      const ease = reducedMotion ? 1 : 1 - Math.exp(-delta * Math.max(config.followSpeed, 0.5));
      pointer.x += (pointer.tx - pointer.x) * ease;
      pointer.y += (pointer.ty - pointer.y) * ease;
      pointer.active += (pointer.target - pointer.active) * ease;
      updateEffects(now / 1e3);
      render();
      const settled = Math.abs(pointer.tx - pointer.x) < 5e-4 && Math.abs(pointer.ty - pointer.y) < 5e-4 && Math.abs(pointer.target - pointer.active) < 1e-3 && !fxAlive;
      if (settled && !contentDirty) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
        pointer.active = pointer.target;
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = new ResizeObserver(() => {
      syncCanvasSize();
      scheduleTextMask();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    const listenTarget = output.parentElement ?? output;
    function onPointerMove(event) {
      const rect = output.getBoundingClientRect();
      pointer.tx = (event.clientX - rect.left) / Math.max(rect.width, 1);
      pointer.ty = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
      pointer.target = 1;
      start();
    }
    function onPointerLeave() {
      pointer.target = 0;
      start();
    }
    function onPointerDown(event) {
      if (reducedMotion || config.degauss <= 1e-3) return;
      const rect = output.getBoundingClientRect();
      ripples.push({
        x: (event.clientX - rect.left) / Math.max(rect.width, 1),
        y: 1 - (event.clientY - rect.top) / Math.max(rect.height, 1),
        t: performance.now() / 1e3
      });
      if (ripples.length > RIPPLE_N) ripples.shift();
      start();
    }
    listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
    listenTarget.addEventListener("pointerdown", onPointerDown, { passive: true });
    content.addEventListener("scroll", scheduleTextMask, {
      capture: true,
      passive: true
    });
    scheduleTextMask();
    return {
      setOptions(next) {
        let changed = false;
        for (const [key, value] of Object.entries(next)) {
          const prev = config[key];
          if (Array.isArray(value) && Array.isArray(prev)) {
            if (value.length !== prev.length || value.some((item, i) => item !== prev[i])) {
              changed = true;
              break;
            }
          } else if (prev !== value) {
            changed = true;
            break;
          }
        }
        Object.assign(config, next);
        if (!changed) return;
        scheduleTextMask();
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        window.clearTimeout(maskTimer);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        listenTarget.removeEventListener("pointermove", onPointerMove);
        listenTarget.removeEventListener("pointerleave", onPointerLeave);
        listenTarget.removeEventListener("pointerdown", onPointerDown);
        content.removeEventListener("scroll", scheduleTextMask, {
          capture: true
        });
        gl.deleteTexture(contentTexture);
        gl.deleteTexture(textMaskTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // assets/js/canvasui-article-effects-entry.ts
  var supportChecks = {
    "decrypt-reveal": supportsHtmlInCanvas,
    droplets: supportsHtmlInCanvas2,
    "particle-scroll": supportsHtmlInCanvas3,
    "retro-dither": supportsHtmlInCanvas4
  };
  var defaults = {
    "decrypt-reveal": {
      radius: 0.34,
      feather: 0.18,
      cipherColor: "#6B8B6B",
      waveColor: "#C6FF4A",
      fontSize: 12,
      chromaticAberration: 1.25
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
      tintStrength: 0.08
    },
    "particle-scroll": {
      threshold: 0.48,
      radius: 0.24,
      particleSize: 1.25,
      particleGap: 2,
      speed: 1,
      color: "#6B8B6B"
    },
    "retro-dither": {
      radius: 0.34,
      pixelSize: 4,
      levels: 4,
      contrast: 1.22,
      brightness: 0,
      mix: 0.92
    }
  };
  function canvasStyle(canvas, zIndex) {
    canvas.style.position = "fixed";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = String(zIndex);
  }
  function mount(page, type) {
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
    let instance = null;
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
      }
    };
  }
  window.BlogCanvasUIArticleEffects = {
    mount,
    supports: supportChecks
  };
})();
