import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MODEL_URL = new URL("../../exports/Letter_A_puff_morphs_full.glb", import.meta.url).href;
const ROOM_SIZE = 1.5;
const FLOOR_Y = -ROOM_SIZE / 2;

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
  scene.add(createLetterRoom());

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(-1.8, -2.3, 3.2);
  scene.add(keyLight);

  const keyTargets = [];
  const group = new THREE.Group();
  scene.add(group);

  let mesh = null;
  let playStart = 0;
  let isPuffing = false;
  let isHoldingFinal = false;
  let restY = 0;
  let floorLift = 0;
  let floorVelocity = 0;
  let previousTime = 0;
  let pointerDown = null;

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

  function startPuff() {
    playStart = performance.now();
    isPuffing = true;
    isHoldingFinal = false;
    floorVelocity = Math.max(floorVelocity, 0.12);
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
    const scale = 0.74 / Math.max(size.x, size.y, size.z);
    group.scale.setScalar(scale);
    restY = FLOOR_Y + size.y * scale * 0.5 + 0.015;
    group.position.set(0, restY, 0);
    group.rotation.x = 0;
    group.rotation.z = -0.08;
    setMorphProgress(0);
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
      startPuff();
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
    const puffDuration = 4.5;

    if (isPuffing) {
      const elapsed = Math.max(0, (performance.now() - playStart) / 1000);
      const playback = Math.min(elapsed / puffDuration, 1);
      const eased = playback * playback * (3 - 2 * playback);

      setMorphProgress(eased * keyTargets.length);

      if (playback >= 1) {
        isPuffing = false;
        isHoldingFinal = true;
        setMorphProgress(keyTargets.length);
      }
    } else if (isHoldingFinal) {
      setMorphProgress(keyTargets.length);
    } else {
      setMorphProgress(0);
    }

    const springStrength = 32;
    const springDamping = 10;
    floorVelocity += (-floorLift * springStrength - floorVelocity * springDamping) * deltaTime;
    floorLift += floorVelocity * deltaTime;

    if (floorLift < 0) {
      floorLift = 0;
      floorVelocity = 0;
    }

    group.position.y = restY + floorLift;
    group.position.z = 0;

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
    color: 0xf8f8f5,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const sideMaterial = wallMaterial.clone();
  sideMaterial.opacity = 0.18;

  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(size, size), wallMaterial);
  backWall.position.z = -half;
  room.add(backWall);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), wallMaterial.clone());
  floor.material.opacity = 0.36;
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

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 48),
    new THREE.MeshBasicMaterial({
      color: 0x6d6d68,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.45, 0.62, 1);
  shadow.position.set(0, FLOOR_Y + 0.003, 0.03);
  room.add(shadow);

  const edgeGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size));
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0xbebeba,
    transparent: true,
    opacity: 0.42,
  });
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  room.add(edges);

  const gridMaterial = new THREE.LineBasicMaterial({
    color: 0xd7d7d2,
    transparent: true,
    opacity: 0.22,
  });
  const gridGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-half, -half, -half),
    new THREE.Vector3(half, -half, -half),
    new THREE.Vector3(-half, 0, -half),
    new THREE.Vector3(half, 0, -half),
    new THREE.Vector3(0, -half, -half),
    new THREE.Vector3(0, half, -half),
  ]);
  room.add(new THREE.LineSegments(gridGeometry, gridMaterial));

  return room;
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
