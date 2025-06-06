import {
  Renderer,
  Vec2,
  Vec4,
  Geometry,
  Texture,
  Program,
  Mesh,
  Flowmap,
} from "./src/index.js";

// Initialize smooth scrolling using Lenis
const lenis = new Lenis();
function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// Load shaders asynchronously
async function loadShader(url) {
  const response = await fetch(url);
  return response.text();
}

// Load vertex and fragment shaders
const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
uniform float uScale;
void main() {
  vUv = uv;
  gl_Position = vec4(position * uScale, 0, 1);
}
`;

const fragmentShader = `
precision highp float;
precision highp int;
uniform sampler2D tWater;
uniform sampler2D tFlow;
uniform float uTime;
varying vec2 vUv;
uniform vec4 res;

void main() {
  vec3 flow = texture2D(tFlow, vUv).rgb;
  vec2 myUV = vUv - flow.xy * 0.3; 
  vec3 tex = texture2D(tWater, myUV).rgb;

  gl_FragColor = vec4(tex, 1.0);
}
`;

// Define image resolution
const _size = [2048, 1638];

// Apply the shader effect to each image element
document.querySelectorAll(".img").forEach((imgElement) => {
  // Set up renderer and WebGL context
  const renderer = new Renderer({ dpr: 2 });
  const gl = renderer.gl;
  const canvas = document.createElement("canvas");
  imgElement.appendChild(canvas);
  imgElement.appendChild(gl.canvas);

  // Variables for aspect ratio and mouse interactions
  let aspect = 1;
  const mouse = new Vec2(-1);
  const velocity = new Vec2();

  // Handle resizing to maintain aspect ratio
  function resize() {
    const rect = imgElement.getBoundingClientRect();
    gl.canvas.width = rect.width * 2.0;
    gl.canvas.height = rect.height * 2.0;
    gl.canvas.style.width = `${rect.width}px`;
    gl.canvas.style.height = `${rect.height}px`;

    const imageAspect = _size[0] / _size[1];
    const canvasAspect = rect.width / rect.height;
    let a1, a2;
    if (canvasAspect > imageAspect) {
      a1 = imageAspect / canvasAspect;
      a2 = 1.0;
    } else {
      a1 = 1.0;
      a2 = canvasAspect / imageAspect;
    }

    mesh.program.uniforms.res.value = new Vec4(rect.width, rect.height, a1, a2);

    renderer.setSize(rect.width, rect.height);
    aspect = rect.width / rect.height;
  }

  // Create flowmap for distortion effect
  const flowmap = new Flowmap(gl, {
    falloff: 0.3,
    dissipation: 0.92,
    alpha: 0.5,
  });

  // Define geometry for rendering
  const geometry = new Geometry(gl, {
    position: {
      size: 2,
      data: new Float32Array([-1, -1, 3, -1, -1, 3]),
    },
    uv: { size: 2, data: new Float32Array([0, 0, 2, 0, 0, 2]) },
  });

  // Load texture from image
  const texture = new Texture(gl, {
    minFilter: gl.LINEAR,
    magFilter: gl.LINEAR,
  });
  texture.image = imgElement.querySelector("img");

  // Create shader program with uniforms
  const program = new Program(gl, {
    vertex: vertexShader,
    fragment: fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 1.0 }, // <--- ADD THIS LINE
      tWater: { value: texture },
      res: {
        value: new Vec4(window.innerWidth, window.innerHeight, 1, 1),
      },
      tFlow: flowmap.uniform,
    },
  });

  // Create mesh to apply the shader program
  const mesh = new Mesh(gl, { geometry, program });

  // Handle window resize events
  window.addEventListener("resize", resize, false);
  resize();

  // Set up mouse or touch event listeners for interaction
  const isTouchCapable = "ontouchstart" in window;
  if (isTouchCapable) {
    imgElement.addEventListener("touchstart", updateMouse, false);
    imgElement.addEventListener("touchmove", updateMouse, {
      passive: false,
    });
  } else {
    imgElement.addEventListener("mousemove", updateMouse, false);
  }

  let lastTime;
  const lastMouse = new Vec2();

  // Update mouse position and velocity
  function updateMouse(e) {
    e.preventDefault();

    const rect = imgElement.getBoundingClientRect();
    let x, y;

    if (e.changedTouches && e.changedTouches.length) {
      x = e.changedTouches[0].pageX - rect.left;
      y = e.changedTouches[0].pageY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    mouse.set(x / rect.width, 1.0 - y / rect.height);

    if (!lastTime) {
      lastTime = performance.now();
      lastMouse.set(x, y);
    }

    const deltaX = x - lastMouse.x;
    const deltaY = y - lastMouse.y;

    lastMouse.set(x, y);

    const time = performance.now();
    const delta = Math.max(10.4, time - lastTime);
    lastTime = time;
    velocity.x = deltaX / delta;
    velocity.y = deltaY / delta;
    velocity.needsUpdate = true;
  }

  // Animation loop to update and render the effect
  function update(t) {
    requestAnimationFrame(update);

    if (!velocity.needsUpdate) {
      mouse.set(-1);
      velocity.set(0);
    }
    velocity.needsUpdate = false;

    flowmap.mouse.copy(mouse);
    flowmap.velocity.lerp(velocity, velocity.len ? 0.15 : 0.1);
    flowmap.update();

    program.uniforms.uTime.value = t * 0.01;
    renderer.render({ scene: mesh });
  }

let targetScale = 1.0;
let scale = 1.0;
const SCALE_HOVER = 1.06;
const SCALE_NORMAL = 1.0;

function update(t) {
  requestAnimationFrame(update);

  if (!velocity.needsUpdate) {
    mouse.set(-1);
    velocity.set(0);
  }
  velocity.needsUpdate = false;

  flowmap.mouse.copy(mouse);
  flowmap.velocity.lerp(velocity, velocity.len ? 0.15 : 0.1);
  flowmap.update();

  // --- SCALE LOGIC START ---
  if (mouse.x >= 0 && mouse.y >= 0 && mouse.x <= 1 && mouse.y <= 1) {
    targetScale = SCALE_HOVER;
  } else {
    targetScale = SCALE_NORMAL;
  }
  scale += (targetScale - scale) * 0.1; // Smooth transition
  program.uniforms.uScale.value = scale;
  // --- SCALE LOGIC END ---

  program.uniforms.uTime.value = t * 0.01;
  renderer.render({ scene: mesh });
}

// Start the animation loop
requestAnimationFrame(update);
