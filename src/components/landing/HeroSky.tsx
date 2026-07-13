import { useEffect, useRef } from 'react'
import bgImage from '@/assets/bg.jpg'

/* HeroSky — the sky texture (bg.jpg) rendered as a WebGL background whose
   sampling domain the cursor gravitationally distorts. The fragment shader
   cover-fits the photo (bottom-aligned, like the old brush reveal drew it)
   and reads it through a stack of vortices.

   Interaction — two kinds of gravity, identical to the nebula version.
   (1) Hover: a persistent vortex rides the cursor itself (trailing it with
   an eased lag), so just resting the pointer over the hero visibly twists
   the sky around it, the twist slowly breathing; it winds up while hovered
   and relaxes when the pointer leaves. (2) Stirring: pointer movement
   additionally drops decaying vortices along the path (a small ring buffer
   of them, like brush stamps). Each vortex rotates the sampling domain
   around itself with a gaussian falloff, so the clouds smear into a swirl,
   then relax as it decays. Swirl chirality follows the curvature of the
   pointer path (stir clockwise → swirls go clockwise), and the cursor
   carries a faint blue-white shimmer.

   Because the source image is static, the rAF loop parks itself once every
   vortex has decayed and the glow has faded (unlike the nebula, nothing
   drifts on its own), and it never runs while the hero is off screen
   (IntersectionObserver) or under prefers-reduced-motion (single static
   frame, no interaction). No WebGL → the canvas stays transparent and the
   .hero-sky CSS gradient backdrop stands in. */

const MAX_SWIRLS = 7 // slot 0 = the hover vortex on the cursor; the rest = path stirring
const SWIRL_RADIUS = 0.3 // gaussian falloff radius, in aspect units (1 = viewport height)
const SWIRL_SPACING = 0.09 // pointer must travel this far to drop the next vortex
const SWIRL_MAX_ANGLE = 2.6 // rad of domain rotation at a vortex core, full power
const SWIRL_ATTACK_MS = 130
const SWIRL_DECAY_TAU_MS = 1100 // exponential relax time after the attack
const HOVER_ANGLE = 1.9 // rad — the resting cursor's twist at full wind-up
const HOVER_RADIUS = 0.26
const HOVER_CHASE_RATE = 5 // 1/s — the hover vortex trails the cursor with this ease

interface Swirl {
  x: number
  y: number
  t: number // birth (ms, rAF clock)
  sign: number
  power: number // 0..1, from pointer speed
}

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = `
precision highp float;

uniform vec2 uRes;
uniform vec2 uImg;                   // source image size in pixels
uniform sampler2D uTex;
uniform vec4 uSwirls[${MAX_SWIRLS}]; // xy: center, z: signed angle, w: radius
uniform vec3 uMouse;                 // xy: pos, z: glow 0..1

// rotate the sampling domain around each live vortex — the whole photo
// reads through this, which is what makes the swirl feel gravitational
vec2 swirl(vec2 p) {
  for (int i = 0; i < ${MAX_SWIRLS}; i++) {
    vec2 c = uSwirls[i].xy;
    float rad = uSwirls[i].w;
    vec2 d = p - c;
    float ang = uSwirls[i].z * exp(-dot(d, d) / max(rad * rad, 1e-4));
    float s = sin(ang);
    float co = cos(ang);
    p = c + mat2(co, -s, s, co) * d;
  }
  return p;
}

void main() {
  // aspect-corrected, centered coords: y spans [-0.5, 0.5]
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec2 q = swirl(p);

  // back to y-up pixel space, then a bottom-aligned cover fit (horizontal
  // centered) — the same framing the old 2D brush reveal used for bg.jpg
  vec2 pix = q * uRes.y + 0.5 * uRes;
  float scale = max(uRes.x / uImg.x, uRes.y / uImg.y);
  vec2 sz = uImg * scale;
  vec2 uv = (pix - vec2(0.5 * (uRes.x - sz.x), 0.0)) / sz;
  vec3 col = texture2D(uTex, clamp(uv, 0.0, 1.0)).rgb;

  // faint blue-white shimmer riding on the cursor's gravity well
  vec2 md = p - uMouse.xy;
  float mg = exp(-dot(md, md) / 0.06) * uMouse.z;
  col += vec3(0.5, 0.65, 1.0) * mg * 0.16;

  gl_FragColor = vec4(col, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('HeroSky shader:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export function HeroSky() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    // the canvas is created per effect-run, not rendered by React: a canvas
    // hands back the SAME WebGL context for its whole life, so after a
    // StrictMode unmount→remount (where cleanup released the context) a
    // JSX canvas would return an unusable lost context
    const canvas = document.createElement('canvas')
    canvas.className = 'absolute inset-0 h-full w-full'
    host.appendChild(canvas)
    // alpha:true so the canvas stays see-through (CSS backdrop visible)
    // until the sky texture has loaded
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: true,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    })
    const bail = () => {
      canvas.remove()
      return undefined
    }
    if (!gl) return bail() // CSS gradient backdrop stands in

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return bail()
    const program = gl.createProgram()
    if (!program) return bail()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('HeroSky link:', gl.getProgramInfoLog(program))
      return bail()
    }
    gl.useProgram(program)

    // one big triangle covering clip space — no index buffer needed
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(program, 'uRes')
    const uImg = gl.getUniformLocation(program, 'uImg')
    const uSwirls = gl.getUniformLocation(program, 'uSwirls')
    const uMouse = gl.getUniformLocation(program, 'uMouse')

    let width = 0
    let height = 0
    let raf = 0
    let running = false
    let visible = true
    let contextLost = false
    let imgReady = false
    const timeOrigin = performance.now()

    // the sky photo, uploaded once it arrives (NPOT: clamp + linear, no mips)
    const img = new Image()
    img.onload = () => {
      if (contextLost) return
      const tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true) // shader uv is y-up
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.uniform2f(uImg, img.naturalWidth, img.naturalHeight)
      imgReady = true
      render(performance.now())
    }
    img.src = bgImage

    // ring buffer of gravity vortices dropped along the pointer path
    const swirls: Swirl[] = []
    const swirlData = new Float32Array(MAX_SWIRLS * 4)
    let mouseX = 0
    let mouseY = 0
    let glow = 0 // hover wind-up: eases to 1 over the hero, 0 outside —
    let glowTarget = 0 // drives both the cursor shimmer and the hover vortex
    let hoverX = 0 // hover vortex trails the cursor with an eased lag
    let hoverY = 0
    let lastTime = 0
    // pointer tracking for speed + path curvature
    let lastPx: number | null = null
    let lastPy = 0
    let lastPt = 0
    let lastDx = 0
    let lastDy = 0
    let lastSpawnX = 0
    let lastSpawnY = 0
    let lastSign = 1

    const render = (nowMs: number) => {
      if (!imgReady) return // canvas stays transparent over the CSS backdrop
      const t = (nowMs - timeOrigin) / 1000
      swirlData.fill(0)
      // slot 0: the persistent hover vortex — winds up while the cursor
      // rests over the hero, its twist slowly breathing so a stationary
      // pointer still reads as live gravity
      swirlData[0] = hoverX
      swirlData[1] = hoverY
      swirlData[2] = HOVER_ANGLE * glow * (0.8 + 0.2 * Math.sin(t * 0.9))
      swirlData[3] = HOVER_RADIUS
      let live = 1
      for (let i = swirls.length - 1; i >= 0; i--) {
        const s = swirls[i]
        if (!s) continue
        const age = nowMs - s.t
        const env =
          age < SWIRL_ATTACK_MS
            ? age / SWIRL_ATTACK_MS
            : Math.exp(-(age - SWIRL_ATTACK_MS) / SWIRL_DECAY_TAU_MS)
        if (env < 0.01) {
          swirls.splice(i, 1)
          continue
        }
        if (live < MAX_SWIRLS) {
          const o = live * 4
          swirlData[o] = s.x
          swirlData[o + 1] = s.y
          swirlData[o + 2] = s.sign * SWIRL_MAX_ANGLE * s.power * env
          swirlData[o + 3] = SWIRL_RADIUS
          live++
        }
      }
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform4fv(uSwirls, swirlData)
      gl.uniform3f(uMouse, mouseX, mouseY, glow)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 1 / 20)
      lastTime = now
      glow += (glowTarget - glow) * (1 - Math.exp(-6 * dt))
      const k = 1 - Math.exp(-HOVER_CHASE_RATE * dt)
      hoverX += (mouseX - hoverX) * k
      hoverY += (mouseY - hoverY) * k
      render(now) // also prunes dead swirls
      // the photo is static — once every vortex has decayed and the glow is
      // out, this frame already equals the resting image, so park the loop
      if (glowTarget === 0 && glow < 0.005 && swirls.length === 0) {
        glow = 0
        running = false
        return
      }
      if (running) raf = requestAnimationFrame(tick)
    }

    const start = () => {
      if (running || reduceMotion || contextLost) return
      running = true
      lastTime = performance.now()
      raf = requestAnimationFrame(tick)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }

    const layout = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      // fillrate-heavy shader — 1.5x is indistinguishable on a soft photo
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
      if (!running && !contextLost) render(performance.now())
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const inside = my >= 0 && my <= rect.height && mx >= 0 && mx <= rect.width
      glowTarget = inside ? 1 : 0
      if (!inside) {
        if (visible) start() // let the glow/vortex unwind, then self-park
        return
      }
      // shader coords: centered, aspect-corrected, y up
      const ax = (mx - width / 2) / height
      const ay = (height / 2 - my) / height
      mouseX = ax
      mouseY = ay
      const now = performance.now()
      if (lastPx !== null) {
        const dx = ax - lastPx
        const dy = ay - lastPy
        const dt = Math.max(now - lastPt, 1) / 1000
        const speed = Math.hypot(dx, dy) / dt // aspect units / s
        if (Math.hypot(ax - lastSpawnX, ay - lastSpawnY) > SWIRL_SPACING) {
          // chirality from path curvature: stirring clockwise keeps the
          // cross product's sign, so the swirls corotate with the gesture
          const cross = lastDx * dy - lastDy * dx
          const sign = Math.abs(cross) > 1e-6 ? Math.sign(cross) : lastSign
          swirls.push({
            x: ax,
            y: ay,
            t: now,
            sign,
            power: Math.min(speed / 2.5, 1) * 0.75 + 0.25,
          })
          if (swirls.length > MAX_SWIRLS - 1) swirls.shift() // slot 0 is the hover vortex
          lastSpawnX = ax
          lastSpawnY = ay
          lastSign = sign
        }
        lastDx = dx
        lastDy = dy
      } else {
        // first touch: the hover vortex starts right under the cursor
        hoverX = ax
        hoverY = ay
        lastSpawnX = ax
        lastSpawnY = ay
      }
      lastPx = ax
      lastPy = ay
      lastPt = now
      if (visible) start()
    }

    const onContextLost = (e: Event) => {
      e.preventDefault()
      contextLost = true
      stop()
    }

    const observer = new ResizeObserver(layout)
    observer.observe(canvas)
    layout()

    // never burn GPU while the hero is scrolled away
    const io = new IntersectionObserver(([entry]) => {
      if (!entry) return
      visible = entry.isIntersecting
      if (visible) start()
      else stop()
    })
    io.observe(canvas)

    canvas.addEventListener('webglcontextlost', onContextLost)
    if (!reduceMotion) {
      window.addEventListener('pointermove', onPointerMove, { passive: true })
    }

    return () => {
      stop()
      observer.disconnect()
      io.disconnect()
      canvas.removeEventListener('webglcontextlost', onContextLost)
      window.removeEventListener('pointermove', onPointerMove)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
    }
  }, [])

  return <div ref={hostRef} className="absolute inset-0" />
}
