import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MODEL_URL = new URL("../../exports/Letter_A_puff_morphs_full.glb", import.meta.url).href;
const SWITCH_OFF_URL = new URL("../../exports/assets/toggle-off-ui.png", import.meta.url).href;
const SWITCH_ON_URL = new URL("../../exports/assets/toggle-on-ui.png", import.meta.url).href;
const COMPRESSOR_SOUND_URL = new URL(
  "../../exports/assets/compressor-sound-trimmed.mp4",
  import.meta.url,
).href;
const SWITCH_SOUND_URL = new URL("../../exports/assets/switchSound.mp3", import.meta.url).href;
const ROOM_SIZE = 1.5;
const FLOOR_Y = -ROOM_SIZE / 2;
const BASE_LETTER_ROTATION_X = 0;
const BASE_LETTER_ROTATION_Z = -0.08;
const FLOAT_STOP_RATIO = 0.54;
const LETTER_SCALE = 0.79;
const PUFF_DURATION = 9;
const COMPRESSOR_SOUND_START_TIME = 0.01;

export function mountLetterA(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
  camera.position.set(0.58, 0.82, 2.35);
  camera.lookAt(0, -0.06, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  container.appendChild(renderer.domElement);

  const compressorSwitch = document.createElement("button");
  compressorSwitch.className = "compressor-switch";
  compressorSwitch.type = "button";
  compressorSwitch.ariaLabel = "Toggle air compressor";
  compressorSwitch.ariaPressed = "false";

  const compressorSwitchImage = document.createElement("img");
  compressorSwitchImage.className = "compressor-switch__image";
  compressorSwitchImage.src = SWITCH_OFF_URL;
  compressorSwitchImage.alt = "";
  compressorSwitchImage.draggable = false;
  compressorSwitch.append(compressorSwitchImage);
  container.appendChild(compressorSwitch);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableRotate = false;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minDistance = 0.9;
  controls.maxDistance = 5;
  controls.target.set(0, -0.06, 0);

  scene.environment = createWarehouseEnvironmentMap();
  scene.add(new THREE.HemisphereLight(0xf4f7ff, 0x1b1d22, 1.1));
  const room = createLetterRoom();
  scene.add(room);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(-1.8, -2.3, 3.2);
  scene.add(keyLight);

  const keyTargets = [];
  const group = new THREE.Group();
  scene.add(group);

  let mesh = null;
  let playStart = 0;
  let isPuffing = false;
  let restY = 0;
  let floorLift = 0;
  let floorVelocity = 0;
  let fillProgress = 0;
  let puffStartProgress = 0;
  let heliumProgress = 0;
  let heliumLift = 0;
  let heliumVelocity = 0;
  let letterHalfHeight = 0.34;
  let maxHeliumLift = 0.42;
  let previousTime = 0;
  let pointerDown = null;
  let compressorOn = false;
  const compressorSound = createAirCompressorSound();
  const switchSound = createSwitchSound();

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  function startCompressorSound() {
    compressorSound?.start();
  }

  function stopCompressorSound() {
    compressorSound?.stop();
  }

  function playSwitchClick() {
    switchSound?.start();
  }

  function updateCompressorSwitch() {
    compressorSwitch.classList.toggle("is-on", compressorOn);
    compressorSwitch.ariaPressed = String(compressorOn);
    compressorSwitchImage.src = compressorOn ? SWITCH_ON_URL : SWITCH_OFF_URL;
  }

  function startPuff() {
    if (fillProgress >= 1) return;

    puffStartProgress = fillProgress;
    playStart = performance.now();
    isPuffing = true;
    floorVelocity = Math.max(floorVelocity, 0.12);
    startCompressorSound();
  }

  function resetPuff() {
    isPuffing = false;
    floorVelocity = 0;
    heliumVelocity = 0;
    stopCompressorSound();
    playSwitchClick();
    setMorphProgress(heliumProgress * keyTargets.length);
  }

  function setCompressorOn(nextCompressorOn) {
    compressorOn = nextCompressorOn;
    updateCompressorSwitch();

    if (!mesh) return;

    if (compressorOn) {
      startPuff();
    } else {
      resetPuff();
    }
  }

  new GLTFLoader().load(MODEL_URL, (gltf) => {
    group.add(gltf.scene);

    gltf.scene.traverse((child) => {
      if (!child.isMesh || !child.morphTargetDictionary) return;

      mesh = child;
      mesh.material = createLightlyScratchedMetal();

      keyTargets.push(
        ...Object.entries(child.morphTargetDictionary)
          .filter(([name]) => name.startsWith("Puff_"))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, index]) => index),
      );
    });

    const box = new THREE.Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    gltf.scene.position.sub(center);
    const scale = LETTER_SCALE / Math.max(size.x, size.y, size.z);
    group.scale.setScalar(scale);
    letterHalfHeight = size.y * scale * 0.5;
    restY = FLOOR_Y + letterHalfHeight + 0.015;
    maxHeliumLift = Math.max(
      0.12,
      (ROOM_SIZE / 2 - letterHalfHeight - restY - 0.08) * FLOAT_STOP_RATIO,
    );
    group.position.set(0, restY, 0);
    group.rotation.x = BASE_LETTER_ROTATION_X;
    group.rotation.z = BASE_LETTER_ROTATION_Z;
    setMorphProgress(0);

    if (compressorOn) {
      startPuff();
    }
  });

  compressorSwitch.addEventListener("click", (event) => {
    event.stopPropagation();
    setCompressorOn(!compressorOn);
  });

  renderer.domElement.addEventListener("pointerdown", (event) => {
    pointerDown = {
      x: event.clientX,
      y: event.clientY,
      canStart: mesh !== null && !isPuffing,
    };
  });

  renderer.domElement.addEventListener("pointerup", (event) => {
    if (!pointerDown) return;

    const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    const canStart = pointerDown.canStart;
    pointerDown = null;

    if (canStart && distance < 6) {
      setCompressorOn(true);
    }
  });

  function setMorphProgress(progress) {
    if (!mesh) return;

    for (const index of keyTargets) {
      mesh.morphTargetInfluences[index] = 0;
    }

    const clamped = THREE.MathUtils.clamp(progress, 0, keyTargets.length);

    if (clamped >= keyTargets.length) {
      const finalIndex = keyTargets[keyTargets.length - 1];
      if (finalIndex !== undefined) {
        mesh.morphTargetInfluences[finalIndex] = 1;
      }
      return;
    }

    const fromStage = Math.floor(clamped);
    const toStage = Math.min(fromStage + 1, keyTargets.length);
    const mix = clamped - fromStage;
    const fromIndex = keyTargets[fromStage - 1];
    const toIndex = keyTargets[toStage - 1];

    if (fromIndex !== undefined) {
      mesh.morphTargetInfluences[fromIndex] = 1 - mix;
    }

    if (toIndex !== undefined) {
      mesh.morphTargetInfluences[toIndex] = mix;
    }
  }

  function animate(time) {
    requestAnimationFrame(animate);

    const deltaTime = Math.min((time - previousTime) / 1000 || 0, 0.05);
    previousTime = time;

    if (isPuffing) {
      const elapsed = Math.max(0, (performance.now() - playStart) / 1000);
      fillProgress = Math.min(puffStartProgress + elapsed / PUFF_DURATION, 1);
      heliumProgress = fillProgress * fillProgress * (3 - 2 * fillProgress);

      setMorphProgress(heliumProgress * keyTargets.length);

      if (fillProgress >= 1) {
        isPuffing = false;
        compressorOn = false;
        updateCompressorSwitch();
        stopCompressorSound();
        playSwitchClick();
        compressorSwitch.hidden = true;
        setMorphProgress(keyTargets.length);
      }
    } else {
      setMorphProgress(heliumProgress * keyTargets.length);
    }

    const springStrength = 32;
    const springDamping = 10;
    floorVelocity += (-floorLift * springStrength - floorVelocity * springDamping) * deltaTime;
    floorLift += floorVelocity * deltaTime;

    if (floorLift < 0) {
      floorLift = 0;
      floorVelocity = 0;
    }

    const desiredHeliumLift = maxHeliumLift * Math.pow(heliumProgress, 1.35);
    const buoyancyStrength = 10.5;
    const airDamping = 3.4;
    heliumVelocity +=
      ((desiredHeliumLift - heliumLift) * buoyancyStrength - heliumVelocity * airDamping) *
      deltaTime;
    heliumLift += heliumVelocity * deltaTime;

    if (heliumLift > maxHeliumLift) {
      heliumLift = maxHeliumLift;
      heliumVelocity = Math.min(0, heliumVelocity * -0.22);
    }

    if (heliumLift < 0) {
      heliumLift = 0;
      heliumVelocity = 0;
    }

    const ceilingEase = maxHeliumLift > 0 ? 1 - heliumLift / maxHeliumLift : 0;
    const topFloat = heliumProgress * (0.35 + 0.65 * ceilingEase);
    const floatBob = topFloat * Math.sin(time * 0.0024) * 0.028;
    const floatSway = heliumProgress * Math.sin(time * 0.0015) * 0.044;
    const floatTilt = heliumProgress * Math.sin(time * 0.0018) * 0.055;
    const liftRatio = maxHeliumLift > 0 ? heliumLift / maxHeliumLift : 0;
    const forwardPitch =
      liftRatio * 0.5 + heliumProgress * Math.sin(time * 0.0012) * 0.034;
    const compressorShake = isPuffing ? 1 - heliumProgress * 0.35 : 0;
    const letterVibrationX =
      Math.sin(time * 0.42) * 0.0045 * compressorShake +
      Math.sin(time * 0.73 + 0.6) * 0.0025 * compressorShake;
    const letterVibrationY = Math.sin(time * 0.58 + 1.2) * 0.0038 * compressorShake;
    const letterVibrationTilt = Math.sin(time * 0.47 + 0.4) * 0.011 * compressorShake;

    group.position.x = floatSway + letterVibrationX;
    group.position.y = restY + floorLift + heliumLift + floatBob + letterVibrationY;
    group.position.z = 0;
    group.rotation.x = BASE_LETTER_ROTATION_X + forwardPitch;
    group.rotation.z = BASE_LETTER_ROTATION_Z + floatTilt + letterVibrationTilt;

    room.position.x =
      Math.sin(time * 0.48) * 0.008 * compressorShake +
      Math.sin(time * 0.86 + 0.9) * 0.0035 * compressorShake;
    room.position.y = Math.sin(time * 0.64 + 1.4) * 0.0065 * compressorShake;
    room.rotation.z = Math.sin(time * 0.52 + 0.6) * 0.0075 * compressorShake;

    controls.update();
    renderer.render(scene, camera);
  }

  animate(0);
}

function createLetterRoom() {
  const room = new THREE.Group();
  const size = ROOM_SIZE;
  const half = size / 2;

  const wallMaterial = new THREE.MeshBasicMaterial({
    color: 0xf3f3f0,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const sideMaterial = wallMaterial.clone();
  sideMaterial.opacity = 0.28;

  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(size, size), wallMaterial);
  backWall.position.z = -half;
  room.add(backWall);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), wallMaterial.clone());
  floor.material.color.setHex(0xe7e7e2);
  floor.material.opacity = 0.52;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  room.add(floor);

  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(size, size), sideMaterial.clone());
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.x = -half;
  room.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(size, size), sideMaterial.clone());
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.x = half;
  room.add(rightWall);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(size, size), sideMaterial.clone());
  ceiling.material.opacity = 0.12;
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = half;
  room.add(ceiling);

  const edgeGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size));
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x80807b,
    transparent: true,
    opacity: 0.48,
  });
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  room.add(edges);

  return room;
}

function createAirCompressorSound() {
  const audio = new Audio(COMPRESSOR_SOUND_URL);
  audio.preload = "auto";
  audio.volume = 0.82;
  audio.load();

  let isPlaying = false;
  let playbackToken = 0;

  function seekToCompressorStart() {
    try {
      audio.currentTime = COMPRESSOR_SOUND_START_TIME;
    } catch {
      audio.currentTime = 0;
    }
  }

  return {
    start() {
      if (isPlaying) return;

      audio.volume = 0.82;
      audio.loop = false;
      isPlaying = true;
      playbackToken += 1;
      const currentToken = playbackToken;
      seekToCompressorStart();

      void audio.play().then(() => {
        if (!isPlaying || currentToken !== playbackToken) {
          audio.pause();
          seekToCompressorStart();
        }
      }).catch(() => {
        isPlaying = false;
      });
    },
    stop() {
      playbackToken += 1;
      isPlaying = false;
      audio.loop = false;
      audio.pause();
      audio.volume = 0.82;
      seekToCompressorStart();
    },
  };
}

function createSwitchSound() {
  const audio = new Audio(SWITCH_SOUND_URL);
  audio.preload = "auto";
  audio.volume = 0.95;
  audio.load();

  return {
    start() {
      audio.pause();
      audio.currentTime = 0;
      void audio.play();
    },
  };
}

function createWarehouseEnvironmentMap() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0.0, "#f8fbff");
  gradient.addColorStop(0.18, "#9ca5ae");
  gradient.addColorStop(0.42, "#20252b");
  gradient.addColorStop(0.7, "#6c737b");
  gradient.addColorStop(1.0, "#1b1d20");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(8, 10, 13, 0.72)";
  for (let x = -80; x < canvas.width + 120; x += 155) {
    ctx.fillRect(x, 0, 32, canvas.height);
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  for (let x = 36; x < canvas.width; x += 190) {
    ctx.fillRect(x, 46, 112, 18);
    ctx.fillRect(x + 16, 96, 80, 10);
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  for (let x = 0; x < canvas.width; x += 64) {
    ctx.fillRect(x, 292, 34, 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createLightlyScratchedMetal() {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xe8edf2,
    side: THREE.FrontSide,
    metalness: 1.0,
    roughness: 0.16,
    clearcoat: 0.0,
    envMapIntensity: 2.25,
    ior: 1.45,
    thickness: 0,
    transmission: 0,
    transparent: false,
    opacity: 1,
  });

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "varying vec3 vScratchObjectPosition;\nvoid main() {")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n\tvScratchObjectPosition = transformed;"
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `varying vec3 vScratchObjectPosition;

        float lightScratchMask() {
          vec3 scratchPos = vScratchObjectPosition * vec3(52.0, 18.0, 34.0);
          float scratchBands = abs(sin(scratchPos.x + scratchPos.z * 1.75));
          float scratchBreakup = fract(sin(dot(floor(scratchPos.xz), vec2(12.9898, 78.233))) * 43758.5453);
          return smoothstep(0.985, 1.0, scratchBands) * smoothstep(0.82, 1.0, scratchBreakup);
        }

        void main() {
          float fineScratches = lightScratchMask();`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.28, fineScratches * 0.32);`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.74, 0.76), fineScratches * 0.05);`
      );
  };

  material.customProgramCacheKey = () => "lightly-scratched-metal-v1";
  return material;
}
