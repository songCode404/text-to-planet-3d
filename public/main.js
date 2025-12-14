// main.js - 통합 버전 (Sequence UI + 정보창 + GiantImpact + Eclipse + AsteroidImpact 통합)
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { Planet } from './planet.js';
import { getJsonFromAI } from './AIClient.js';

// ─────────────────────────────────────────────────────────────
// 시나리오 Import
// ─────────────────────────────────────────────────────────────
//import { initCollisionScene } from './scenarios/SceneCollision.js';
import { initSolarSystem } from './scenarios/SceneSolarSystem.js';
import { initBirthScene } from './scenarios/SceneBirth.js';
import { initSolarEclipseScene } from './scenarios/SceneSolarEclips.js';
import { initLunarEclipseScene } from './scenarios/SceneLunarEclips.js';

// ✅ SceneAsteroidImpact.js (namespace import로 export 꼬임 방지)
import * as AsteroidImpactMod from './scenarios/SceneAsteroidImpact.js';

import { Explosion } from './Explosion.js';

// ─────────────────────────────────────────────────────────────
// 1. 기본 씬 설정 & 배경
// ─────────────────────────────────────────────────────────────
const canvas = document.querySelector('#three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// 우주 배경
function createUniverse() {
  const loader = new THREE.TextureLoader();
  const geometry = new THREE.SphereGeometry(2000, 64, 64);
  const texture = loader.load(
    '/assets/textures/galaxy.png',
    undefined,
    undefined,
    () => console.warn('배경 이미지를 찾을 수 없습니다. (검은 배경 사용)')
  );

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.6,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  return mesh;
}
const universeMesh = createUniverse();

// 카메라 설정
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
const originalCameraPosition = new THREE.Vector3(0, 50, 150);
camera.position.copy(originalCameraPosition);
camera.lookAt(0, 0, 0);

// 조명
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);

const sunLight = new THREE.PointLight(0xffffff, 2, 1000);
sunLight.position.set(0, 0, 0);
scene.add(sunLight);

// ─────────────────────────────────────────────────────────────
// 2. 물리 월드 & 상태 변수
// ─────────────────────────────────────────────────────────────
const world = new CANNON.World();
world.gravity.set(0, 0, 0);
world.broadphase = new CANNON.NaiveBroadphase();

// 통합 상태 관리
let planets = [];
let explosions = [];
let currentScenarioType = '';
let currentScenarioUpdater = null;
let currentControlsCleanup = null;

// Giant Impact 전용 상태
let giantImpactTime = 0;
let isGiantImpactPlaying = false;
let gaiaRef = null;
let theiaRef = null;
let impactHappened = false;
let timeScale = 1.0;

// 카메라 추적 상태
let followTarget = null;

// ✅ Asteroid Impact 트레일 상태
let asteroidTrail = null;

// Sequence 모드 상태
let isSequenceMode = false;
let sequenceSteps = [];
let currentStepIndex = 0;

// ─────────────────────────────────────────────────────────────
// 3. UI (Sequence Overlay) + 유틸리티
// ─────────────────────────────────────────────────────────────

// 시퀀스 안내용 UI 오버레이 (우측 하단)
const sequenceOverlay = document.createElement('div');
sequenceOverlay.style.position = 'absolute';
sequenceOverlay.style.bottom = '20px';
sequenceOverlay.style.right = '20px';
sequenceOverlay.style.textAlign = 'right';
sequenceOverlay.style.color = '#ffffff';
sequenceOverlay.style.fontSize = '20px';
sequenceOverlay.style.fontWeight = 'bold';
sequenceOverlay.style.textShadow = '0px 2px 4px rgba(0,0,0,0.8)';
sequenceOverlay.style.pointerEvents = 'none';
sequenceOverlay.style.display = 'none';
sequenceOverlay.style.zIndex = '1000';
sequenceOverlay.id = 'sequence-ui';
document.body.appendChild(sequenceOverlay);

// ─────────────────────────────────────────────────────────────
// 충돌 섬광 + 충격파 링 (공용)
// - GiantImpact / AsteroidImpact 둘 다 사용 가능
// ─────────────────────────────────────────────────────────────
function createImpactFlash(pos) {
  const geometry = new THREE.SphereGeometry(1, 32, 32);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1.0,
  });
  const flash = new THREE.Mesh(geometry, material);
  flash.position.set(pos.x, pos.y, pos.z);
  flash.scale.set(12, 12, 12);
  scene.add(flash);

  const expandFlash = () => {
    flash.scale.multiplyScalar(1.08);
    flash.material.opacity -= 0.12;
    if (flash.material.opacity > 0) requestAnimationFrame(expandFlash);
    else {
      scene.remove(flash);
      geometry.dispose();
      material.dispose();
    }
  };
  expandFlash();

  const ringGeo = new THREE.RingGeometry(8, 9, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfff2aa,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, pos.y, pos.z);
  scene.add(ring);

  const animateRing = () => {
    ring.scale.multiplyScalar(1.09);
    ring.material.opacity *= 0.9;
    if (ring.material.opacity > 0.02) requestAnimationFrame(animateRing);
    else {
      scene.remove(ring);
      ringGeo.dispose();
      ringMat.dispose();
    }
  };
  animateRing();
}

// ─────────────────────────────────────────────────────────────
// ✅ 소행성 “불꽃 트레일” (Asteroid Impact용)
// ─────────────────────────────────────────────────────────────
function createAsteroidFlameTrail(asteroid, earth) {
  const max = 1400;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(max * 3);
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.7,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: 0xffaa33,
  });

  const pts = new THREE.Points(geom, mat);
  scene.add(pts);

  let head = 0;
  let alive = 0;
  const vel = Array.from({ length: max }, () => new THREE.Vector3());

  const obj = {
    isFinished: false,
    update() {
      if (!asteroid?.mesh || asteroid.isDead) {
        mat.opacity *= 0.92;
        if (mat.opacity < 0.02) {
          this.isFinished = true;
          this.dispose();
        }
        return;
      }

      const aPos = asteroid.mesh.position;
      const ePos = earth?.mesh?.position || new THREE.Vector3(0, 0, 0);
      const dist = aPos.distanceTo(ePos);
      const strength = THREE.MathUtils.clamp(1.0 - dist / 200.0, 0, 1);

      mat.opacity = 0.10 + 0.90 * strength;

      const dir = new THREE.Vector3(
        asteroid.body?.velocity?.x || 1,
        asteroid.body?.velocity?.y || 0,
        asteroid.body?.velocity?.z || 0
      );
      if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
      dir.normalize().multiplyScalar(-1);

      const emit = Math.floor(2 + 14 * strength);

      for (let k = 0; k < emit; k++) {
        const i = head % max;
        head++;
        alive = Math.min(alive + 1, max);

        const jitter = 0.8 + Math.random() * 1.2;
        const spawn = new THREE.Vector3(
          aPos.x + (Math.random() - 0.5) * jitter,
          aPos.y + (Math.random() - 0.5) * jitter,
          aPos.z + (Math.random() - 0.5) * jitter
        );

        positions[i * 3 + 0] = spawn.x;
        positions[i * 3 + 1] = spawn.y;
        positions[i * 3 + 2] = spawn.z;

        vel[i].copy(dir).multiplyScalar(6 + Math.random() * 10);
        vel[i].add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 2.0,
            (Math.random() - 0.5) * 2.0,
            (Math.random() - 0.5) * 2.0
          )
        );
      }

      const dt = 1 / 60;
      for (let i = 0; i < alive; i++) {
        const ix = i * 3;
        positions[ix + 0] += vel[i].x * dt;
        positions[ix + 1] += vel[i].y * dt;
        positions[ix + 2] += vel[i].z * dt;
        vel[i].multiplyScalar(0.93 - 0.08 * strength);
      }

      geom.attributes.position.needsUpdate = true;
    },
    dispose() {
      scene.remove(pts);
      geom.dispose();
      mat.dispose();
    },
  };

  return obj;
}

// ─────────────────────────────────────────────────────────────
// 🌍☄️ 소행성 충돌 폭발 (병합 대신 폭발 + 파편)
// ─────────────────────────────────────────────────────────────
function startAsteroidImpactExplosion(earth, asteroid) {
  if (!earth?.mesh || !asteroid?.mesh) return;

  const posE = earth.mesh.position.clone();
  const posA = asteroid.mesh.position.clone();
  const impactDir = new THREE.Vector3().subVectors(posA, posE).normalize();
  const impactPos = posE.clone().add(impactDir.clone().multiplyScalar(earth.radius * 0.98));

  if (asteroid.body) {
    world.removeBody(asteroid.body);
    asteroid.body.isMarkedForRemoval = true;
  }
  asteroid.isDead = true;
  if (asteroid.mesh) asteroid.mesh.visible = false;

  createImpactFlash(impactPos);
  createAsteroidDebris(impactPos, impactDir, earth.radius);

  if (asteroidTrail?.dispose) asteroidTrail.dispose();
  asteroidTrail = null;
}

function createAsteroidDebris(impactPos, impactNormal, earthRadius) {
  const count = 900;
  const positions = [];
  const velocities = [];
  const colors = [];

  const geometry = new THREE.BufferGeometry();

  const up = new THREE.Vector3(0, 1, 0);
  let tangent1 = new THREE.Vector3().crossVectors(impactNormal, up);
  if (tangent1.lengthSq() < 0.0001) tangent1.set(1, 0, 0);
  tangent1.normalize();
  const tangent2 = new THREE.Vector3().crossVectors(impactNormal, tangent1).normalize();

  for (let i = 0; i < count; i++) {
    const r = Math.random() * earthRadius * 0.3;
    const a = Math.random() * Math.PI * 2;
    const offset = tangent1
      .clone()
      .multiplyScalar(Math.cos(a) * r)
      .add(tangent2.clone().multiplyScalar(Math.sin(a) * r))
      .add(impactNormal.clone().multiplyScalar(earthRadius * 0.02));

    const start = impactPos.clone().add(offset);
    positions.push(start.x, start.y, start.z);

    const normalSpeed = 28 + Math.random() * 12;
    const swirlSpeed = 10 + Math.random() * 8;
    const v = impactNormal
      .clone()
      .multiplyScalar(normalSpeed)
      .add(tangent1.clone().multiplyScalar((Math.random() - 0.5) * swirlSpeed))
      .add(tangent2.clone().multiplyScalar((Math.random() - 0.5) * swirlSpeed));

    velocities.push(v);

    const c = Math.random();
    if (c > 0.88) colors.push(1.0, 1.0, 1.0);
    else if (c > 0.55) colors.push(0.78, 0.78, 0.80);
    else if (c > 0.25) colors.push(0.48, 0.50, 0.52);
    else colors.push(0.22, 0.23, 0.25);
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.3,
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const debris = new THREE.Points(geometry, material);
  debris.userData.velocities = velocities;
  scene.add(debris);

  debris.update = function () {
    const dt = 1 / 60;
    const posAttr = this.geometry.attributes.position;
    const arr = posAttr.array;
    const vs = this.userData.velocities;

    for (let i = 0; i < vs.length; i++) {
      const ix = i * 3;
      const v = vs[i];
      v.multiplyScalar(0.985);
      v.addScaledVector(impactNormal, 0.3 * dt);

      arr[ix] += v.x * dt;
      arr[ix + 1] += v.y * dt;
      arr[ix + 2] += v.z * dt;
    }

    posAttr.needsUpdate = true;
    this.material.opacity *= 0.96;
    this.scale.multiplyScalar(1.005);

    if (this.material.opacity <= 0.02) {
      this.isFinished = true;
      this.dispose();
    }
  };

  debris.dispose = function () {
    scene.remove(this);
    this.geometry.dispose();
    this.material.dispose();
  };

  explosions.push(debris);
}

// 씬 초기화
function resetScene() {
  currentScenarioUpdater = null;
  followTarget = null;
  giantImpactTime = 0;
  isGiantImpactPlaying = false;
  impactHappened = false;
  timeScale = 1.0;

  // ✅ 소행성 트레일 정리
  if (asteroidTrail?.dispose) asteroidTrail.dispose();
  asteroidTrail = null;

  // 정보창 숨김
  if (infoBox) infoBox.style.display = 'none';

  // 시나리오별 컨트롤 cleanup
  if (currentControlsCleanup) {
    currentControlsCleanup();
    currentControlsCleanup = null;
  }

  // Planet 정리
  for (const p of planets) {
    if (p.dispose) p.dispose();
  }
  planets = [];

  // Explosion/파편/트레일 정리
  for (const e of explosions) e.dispose?.();
  explosions = [];

  // 씬 오브젝트 정리 (라이트/카메라/배경 제외)
  for (let i = scene.children.length - 1; i >= 0; i--) {
    const obj = scene.children[i];
    if (obj.isLight || obj.isCamera || obj === universeMesh) continue;

    scene.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  }

  if (currentScenarioType !== 'giant_impact') {
    controls.target.set(0, 0, 0);
    controls.enableZoom = true;
    controls.enableRotate = true;
  }

  console.log('🧹 씬 초기화 완료');
}

// 폭발 이펙트
window.createExplosion = (position, color) => {
  try {
    const explosion = new Explosion(scene, position, color);
    explosions.push(explosion);
  } catch (e) {
    console.warn('Explosion error:', e);
  }
};

function checkCollisions() {
  if (currentScenarioType === 'solar_eclipse' || currentScenarioType === 'lunar_eclipse') return;
  if (planets.length < 2) return;

  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const p1 = planets[i];
      const p2 = planets[j];
      if (p1.isDead || p2.isDead) continue;

      const dist = p1.mesh.position.distanceTo(p2.mesh.position);
      const threshold = (p1.radius + p2.radius) * 0.9;

      if (dist < threshold) {
        window.handleMerger(p1, p2);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Sequence 관리
// ─────────────────────────────────────────────────────────────
function startSequence(steps) {
  if (!steps || steps.length === 0) return;

  isSequenceMode = true;
  sequenceSteps = steps;
  currentStepIndex = 0;

  console.log(`🎬 시퀀스 시작: 총 ${steps.length}단계`);
  playStep(0);
}

function playStep(index) {
  if (index >= sequenceSteps.length) {
    endSequence();
    return;
  }

  const stepData = sequenceSteps[index];
  currentStepIndex = index;

  console.log(`▶ Step ${index + 1} 데이터:`, stepData);

  if (!stepData.objects || stepData.objects.length === 0) {
    console.warn('⚠️ 경고: 이 단계에는 objects 데이터가 없습니다.');
  }

  createSceneFromData(stepData);

  sequenceOverlay.style.display = 'block';
  const typeName = stepData.scenarioType ? stepData.scenarioType.toUpperCase() : 'SCENE';

  sequenceOverlay.innerHTML = `
    <div style="font-size: 24px; color: #ffeb3b; margin-bottom: 5px;">Step ${index + 1} / ${sequenceSteps.length}</div>
    <div style="font-size: 18px; color: #fff;">현재 장면: ${typeName}</div>
    <div style="font-size: 14px; color: #ccc; margin-top: 10px; animation: blink 1.5s infinite;">
      [SPACE] 키를 눌러 다음 장면으로 ▶
    </div>
    <style>
      @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
    </style>
  `;
}

function nextSequenceStep() {
  if (!isSequenceMode) return;
  playStep(currentStepIndex + 1);
}

function endSequence() {
  console.log('🎬 시퀀스 종료');
  isSequenceMode = false;
  sequenceSteps = [];
  currentStepIndex = 0;

  sequenceOverlay.style.display = 'none';
  alert('모든 시나리오 재생이 끝났습니다!');
}

// ─────────────────────────────────────────────────────────────
// 4. Giant Impact 로직
// ─────────────────────────────────────────────────────────────
function startGiantImpactTimeline() {
  giantImpactTime = 0;
  isGiantImpactPlaying = true;
  impactHappened = false;
  followTarget = null;

  if (theiaRef?.body) {
    theiaRef.body.velocity.set(-8, 0, 0);
  }
}

function updateGiantImpactCamera(delta) {
  if (!isGiantImpactPlaying) return;
  giantImpactTime += delta;

  if (giantImpactTime < 4) {
    timeScale = 0.7;
    const targetPos = new THREE.Vector3(0, 35, 260);
    camera.position.lerp(targetPos, 0.03);
    controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.1);
  } else if (giantImpactTime < 8) {
    timeScale = 0.3;
    const targetPos = new THREE.Vector3(0, 20, 120);
    camera.position.lerp(targetPos, 0.05);
  } else {
    timeScale = 0.5;
    const t = giantImpactTime - 8;
    const radius = 150;
    const height = 25;
    const speed = 0.2;
    camera.position.lerp(
      new THREE.Vector3(Math.cos(speed * t) * radius, height, Math.sin(speed * t) * radius),
      0.08
    );
    camera.lookAt(0, 0, 0);
  }
}

// ─────────────────────────────────────────────────────────────
// 전역 병합 핸들러
// - ✅ Earth+Asteroid는 병합 대신 폭발
// - ✅ GiantImpact는 기존 연출 유지
// ─────────────────────────────────────────────────────────────
window.handleMerger = (p1, p2) => {
  if (p1.isDead || p2.isDead) return;

  const n1 = (p1.data?.name || '').toLowerCase();
  const n2 = (p2.data?.name || '').toLowerCase();
  const combined = n1 + n2;

  const hasEarth = combined.includes('earth');
  const hasAsteroid = combined.includes('asteroid');

  // ✅ Earth + Asteroid → 폭발 (병합 X)
  if (hasEarth && hasAsteroid) {
    const earth = n1.includes('earth') ? p1 : p2;
    const asteroid = n1.includes('asteroid') ? p1 : p2;
    startAsteroidImpactExplosion(earth, asteroid);
    return;
  }

  // Giant Impact 판단
  const isGiantImpact = combined.includes('theia');

  if (currentScenarioType === 'giant_impact') {
    if (impactHappened) return;
    impactHappened = true;
  }

  const newMass = p1.mass + p2.mass;
  const newRadius = Math.cbrt(Math.pow(p1.radius, 3) + Math.pow(p2.radius, 3));
  const ratio = p1.mass / newMass;

  const newPos = {
    x: p1.body.position.x * ratio + p2.body.position.x * (1 - ratio),
    y: p1.body.position.y * ratio + p2.body.position.y * (1 - ratio),
    z: p1.body.position.z * ratio + p2.body.position.z * (1 - ratio),
  };
  const newVel = {
    x: (p1.mass * p1.body.velocity.x + p2.mass * p2.body.velocity.x) / newMass,
    y: (p1.mass * p1.body.velocity.y + p2.mass * p2.body.velocity.y) / newMass,
    z: (p1.mass * p1.body.velocity.z + p2.mass * p2.body.velocity.z) / newMass,
  };

  p1.isDead = true;
  p2.isDead = true;

  setTimeout(() => {
    const loader = new THREE.TextureLoader();
    const textureKey = isGiantImpact
      ? 'MoltenEarth'
      : p1.mass > p2.mass
      ? p1.data.textureKey
      : p2.data.textureKey;

    const name = isGiantImpact ? 'Molten-Earth' : `Merged-${p1.data.name}`;

    const mergedPlanet = new Planet(
      scene,
      world,
      loader,
      {
        name,
        textureKey,
        size: newRadius / 3.0,
        mass: newMass,
        position: newPos,
        velocity: newVel,
      },
      'merge_event'
    );

    if (isGiantImpact) {
      mergedPlanet.mesh.material.color.setHex(0xffaa00);
      mergedPlanet.mesh.material.emissive = new THREE.Color(0xff2200);
      mergedPlanet.mesh.material.emissiveIntensity = 3.0;

      // ✅ 섬광 연출 (정의가 없어서 에러나던 부분도 이제 해결됨)
      createImpactFlash(new THREE.Vector3(newPos.x, newPos.y, newPos.z));
    } else {
      window.createExplosion(newPos, 0xffffff);
    }

    planets.push(mergedPlanet);
  }, 50);
};

// ─────────────────────────────────────────────────────────────
// 5. 통합 시나리오 생성 함수 (AI Data -> Scene)
// ─────────────────────────────────────────────────────────────
async function createSceneFromData(aiData) {
  resetScene();

  if (!aiData) {
    console.error('🚨 데이터가 없습니다.');
    return;
  }

  // AI가 type으로 보내는 경우 등 호환 처리
  let safeScenarioType = (aiData.scenarioType || aiData.type || '').toLowerCase().trim();
  console.log(`🎬 씬 생성: ${safeScenarioType}`);

  // Theia 감지 -> giant_impact 강제 전환
  const hasTheia = aiData.objects?.some((o) => o.name && o.name.toLowerCase().includes('theia'));
  if (hasTheia) safeScenarioType = 'giant_impact';

  // ✅ Earth+Asteroid 감지 -> asteroid_impact 강제 전환
  const names = aiData.objects?.map((o) => (o.name || '').toLowerCase()) || [];
  const hasEarth = names.some((n) => n.includes('earth'));
  const hasAsteroid = names.some((n) => n.includes('asteroid'));
  if (hasEarth && hasAsteroid) {
    console.log("☄️ 'Earth' + 'Asteroid' 감지 -> asteroid_impact 로 전환");
    safeScenarioType = 'asteroid_impact';
  }

  currentScenarioType = safeScenarioType;

  let setupData = null;
  const loader = new THREE.TextureLoader();

  switch (safeScenarioType) {
    case 'collision':
      setupData = initCollisionScene(scene, world, loader, aiData);
      break;

    case 'solar_system':
    case 'orbit':
      setupData = initSolarSystem(scene, world, loader, aiData);
      break;

    case 'solar_eclipse':
      setupData = initSolarEclipseScene(scene, world, loader, aiData);
      break;

    case 'lunar_eclipse':
      setupData = initLunarEclipseScene(scene, world, loader, aiData);
      break;

    case 'planet_birth':
      setupData = initBirthScene(scene, world, loader, aiData);
      break;

    case 'asteroid_impact': {
      console.log('[AsteroidImpact exports]', Object.keys(AsteroidImpactMod));

      if (typeof AsteroidImpactMod.initAsteroidImpact !== 'function') {
        console.error('🚨 SceneAsteroidImpact.js 에서 initAsteroidImpact export를 찾지 못함');
        console.error('📌 exports:', Object.keys(AsteroidImpactMod));
        setupData = { planets: [], cameraPosition: aiData.cameraPosition };
        break;
      }

      setupData = AsteroidImpactMod.initAsteroidImpact(scene, world, loader, aiData);

      // ✅ 트레일 연결
      if (setupData?.asteroid && setupData?.earth) {
        if (asteroidTrail?.dispose) asteroidTrail.dispose();
        asteroidTrail = createAsteroidFlameTrail(setupData.asteroid, setupData.earth);
        explosions.push(asteroidTrail);
      }
      break;
    }

    case 'giant_impact':
      // ⚠️ 너 기존 코드에 initGiantImpact가 다른 파일에 있을 수 있는데,
      // 여기서는 "기존 main.js의 구조를 유지"하려고 그대로 둠.
      // 만약 initGiantImpact가 실제로 import되어 있지 않다면,
      // 네 프로젝트에서 기존대로 import를 추가해야 함.
      setupData = initGiantImpact(scene, world, loader, aiData);
      gaiaRef = setupData.gaia;
      theiaRef = setupData.theia;
      startGiantImpactTimeline();
      break;

    default:
      setupData = { planets: [], cameraPosition: aiData.cameraPosition };
      if (aiData.objects && Array.isArray(aiData.objects)) {
        for (const objData of aiData.objects) {
          const p = new Planet(scene, world, loader, objData, currentScenarioType);
          planets.push(p);
        }
      }
      break;
  }

  if (setupData) {
    if (setupData.planets) planets = setupData.planets;
    if (setupData.update) currentScenarioUpdater = setupData.update;

    if (setupData.setupControls && typeof setupData.setupControls === 'function') {
      currentControlsCleanup = setupData.setupControls(camera, controls);
    }

    // 카메라 위치 안전장치
    const defaultCamPos = { x: 0, y: 50, z: 150 };
    const camPos = setupData.cameraPosition || aiData.cameraPosition || defaultCamPos;
    const lookAtPos = setupData.cameraLookAt || { x: 0, y: 0, z: 0 };

    if (!isGiantImpactPlaying) {
      const x = Number.isFinite(camPos.x) ? camPos.x : 0;
      const y = Number.isFinite(camPos.y) ? camPos.y : 50;
      const z = Number.isFinite(camPos.z) ? camPos.z : 150;

      camera.position.set(x, y, z);
      camera.lookAt(lookAtPos.x || 0, lookAtPos.y || 0, lookAtPos.z || 0);
      controls.target.set(lookAtPos.x || 0, lookAtPos.y || 0, lookAtPos.z || 0);
      originalCameraPosition.set(x, y, z);

      controls.update();
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 6. 물리 로직
// ─────────────────────────────────────────────────────────────
function applyGravity() {
  // ✅ 충돌/탄생/소행성 충돌에서는 중력 끔
  if (
    currentScenarioType === 'collision' ||
    currentScenarioType === 'planet_birth' ||
    currentScenarioType === 'asteroid_impact'
  ) {
    return;
  }

  if (planets.length < 2) return;

  const sortedPlanets = [...planets].sort((a, b) => b.mass - a.mass);
  const star = sortedPlanets[0];
  const G = 10;

  for (let i = 1; i < sortedPlanets.length; i++) {
    const planet = sortedPlanets[i];
    const distVec = new CANNON.Vec3();
    star.body.position.vsub(planet.body.position, distVec);
    const r_sq = distVec.lengthSquared();
    if (r_sq < 1) continue;

    const force = (G * star.mass * planet.mass) / r_sq;
    distVec.normalize();
    distVec.scale(force, distVec);
    planet.body.applyForce(distVec, planet.body.position);
  }
}

function applyMutualDeformation(deltaTime) {
  if (currentScenarioType !== 'giant_impact' || planets.length < 2) return;

  for (const p of planets) p.targetDeformAmount = 0;

  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i];
      const b = planets[j];
      const dist = a.mesh.position.distanceTo(b.mesh.position);
      const sumR = a.radius + b.radius;

      if (dist > sumR * 1.4) continue;
      const t = THREE.MathUtils.clamp(1 - (dist - sumR * 0.7) / (sumR * 0.7), 0, 1);
      if (t <= 0) continue;

      const dirAB = new THREE.Vector3().subVectors(b.mesh.position, a.mesh.position).normalize();
      a.setDeform(dirAB, t);
      b.setDeform(dirAB.clone().negate(), t);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 7. 사용자 입력 (AI 요청 & Raycasting Interaction)
// ─────────────────────────────────────────────────────────────
const inputField = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const statusDiv = document.getElementById('ai-status');

async function handleUserRequest() {
  const text = inputField.value;
  if (!text) return;

  sendBtn.disabled = true;
  inputField.disabled = true;

  // 새 요청이 오면 기존 시퀀스 중단 및 UI 숨김
  isSequenceMode = false;
  sequenceOverlay.style.display = 'none';

  try {
    statusDiv.innerText = 'AI가 생각 중... 🤔';

    const aiData = await getJsonFromAI(text);

    // 시퀀스 모드 vs 단일 모드
    if ((aiData.scenarioType || '').toLowerCase() === 'sequence') {
      statusDiv.innerText = `✅ 시퀀스 모드: 총 ${aiData.steps?.length ?? 0}개 장면`;
      startSequence(aiData.steps);
    } else {
      await createSceneFromData(aiData);
      statusDiv.innerText = `✅ 적용 완료: ${aiData.scenarioType}`;
    }
  } catch (error) {
    console.error('🚨 오류:', error);
    statusDiv.innerText = '🚨 예상과 다른 시나리오가 들어왔습니다.';
  } finally {
    sendBtn.disabled = false;
    inputField.disabled = false;
    inputField.value = '';
    inputField.focus();
  }
}

if (sendBtn) {
  sendBtn.addEventListener('click', handleUserRequest);
  inputField.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleUserRequest();
  });
}

// Raycasting + 정보창
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const infoBox = document.getElementById('planet-info');
const infoTitle = document.getElementById('info-title');
const infoDesc = document.getElementById('info-desc');

const planetDescriptions = {
  sun: '태양 (Sun)\n태양계의 중심이자 유일한 항성입니다.\n\n• 지름: 약 139만 km (지구의 109배)\n• 질량: 1.989 × 10^30 kg (지구의 33만 배)\n• 표면온도: 약 5,500°C',
  mercury: '수성 (Mercury)\n태양과 가장 가까운 행성으로, 대기가 거의 없습니다.\n\n• 지름: 4,879 km\n• 질량: 3.285 × 10^23 kg (지구의 0.055배)\n• 공전주기: 88일',
  venus: '금성 (Venus)\n두꺼운 이산화탄소 대기로 인해 가장 뜨거운 행성입니다.\n\n• 지름: 12,104 km\n• 질량: 4.867 × 10^24 kg (지구의 0.815배)\n• 평균온도: 462°C',
  earth: '지구 (Earth)\n우리의 고향이며 액체 상태의 물이 존재하는 행성입니다.\n\n• 지름: 12,742 km\n• 질량: 5.972 × 10^24 kg\n• 위성: 1개 (달)',
  moon: '달 (Moon)\n지구의 유일한 자연 위성입니다.\n\n• 지름: 3,474 km\n• 질량: 7.342 × 10^22 kg (지구의 0.012배)\n• 거리: 약 384,400 km',
  mars: '화성 (Mars)\n산화철 표면으로 인해 붉게 보이는 행성입니다.\n\n• 지름: 6,779 km\n• 질량: 6.39 × 10^23 kg (지구의 0.107배)\n• 대기: 얇은 이산화탄소 층',
  jupiter: '목성 (Jupiter)\n태양계에서 가장 거대한 가스 행성입니다.\n\n• 지름: 139,820 km (지구의 11배)\n• 질량: 1.898 × 10^27 kg (지구의 318배)\n• 특징: 대적점(거대 폭풍)',
  saturn: '토성 (Saturn)\n아름다운 얼음 고리를 가진 가스 행성입니다.\n\n• 지름: 116,460 km (지구의 9배)\n• 질량: 5.683 × 10^26 kg (지구의 95배)\n• 밀도: 물보다 낮음',
  uranus: '천왕성 (Uranus)\n자전축이 98도 기울어져 누워서 공전하는 얼음 거인입니다.\n\n• 지름: 50,724 km (지구의 4배)\n• 질량: 8.681 × 10^25 kg (지구의 14.5배)\n• 대기: 수소, 헬륨, 메탄',
  neptune: '해왕성 (Neptune)\n태양계의 마지막 행성으로, 강력한 폭풍이 붑니다.\n\n• 지름: 49,244 km (지구의 3.8배)\n• 질량: 1.024 × 10^26 kg (지구의 17배)\n• 색상: 짙은 푸른색',
  pluto: '명왕성 (Pluto)\n현재는 왜소행성으로 분류된 작은 천체입니다.\n\n• 지름: 2,377 km\n• 질량: 1.309 × 10^22 kg (지구의 0.002배)\n• 표면: 질소 얼음과 암석',
  'molten-earth':
    '파괴된 지구 (Molten Earth)\n거대 충돌 직후의 가상의 지구입니다.\n\n• 상태: 지각 붕괴 및 마그마 바다 형성\n• 온도: 약 2,000°C 이상\n• 거주가능성: 불가능',
};

let isDragging = false;
let mouseDownTime = 0;

window.addEventListener('pointerdown', () => {
  isDragging = false;
  mouseDownTime = Date.now();
});
window.addEventListener('pointermove', () => {
  isDragging = true;
});
window.addEventListener('pointerup', (event) => {
  if (isDragging || Date.now() - mouseDownTime > 200) return;
  if (isGiantImpactPlaying) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);

  let foundTarget = null;
  let foundName = null;

  if (intersects.length > 0) {
    const object = intersects[0].object;

    if (object.material?.map?.source?.data?.src) {
      const src = object.material.map.source.data.src;
      const match = src.match(/\/([^\/]+)\.(jpg|png)/i);
      if (match) foundName = match[1].replace('2k_', '').toLowerCase();
    }
    if (!foundName && object.userData?.name) foundName = object.userData.name.toLowerCase();

    if (foundName && (planetDescriptions[foundName] || object.userData.isPlanet)) {
      foundTarget = object;
      if (infoBox) {
        infoTitle.innerText = foundName.toUpperCase();
        infoDesc.innerText = planetDescriptions[foundName] || foundName;
        infoBox.style.display = 'block';

        // 정보창 우측 상단 고정
        infoBox.style.left = 'auto';
        infoBox.style.top = '20px';
        infoBox.style.right = '20px';
      }
    }
  }

  if (foundTarget) {
    followTarget = foundTarget;
    console.log(`🔭 추적: ${foundName}`);
  } else {
    followTarget = null;
    if (infoBox) infoBox.style.display = 'none';
  }
});

// ─────────────────────────────────────────────────────────────
// 8. 애니메이션 루프
// ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

function animate() {
  requestAnimationFrame(animate);
  const rawDelta = clock.getDelta();

  if (currentScenarioType === 'giant_impact' && isGiantImpactPlaying) {
    updateGiantImpactCamera(rawDelta);
  } else {
    timeScale = 1.0;
  }

  const deltaTime = rawDelta * timeScale;

  applyGravity();
  checkCollisions();
  world.step(1 / 60, deltaTime, 10);

  for (let i = planets.length - 1; i >= 0; i--) {
    const p = planets[i];
    p.update(deltaTime);

    // ✅ SceneAsteroidImpact.js의 customUpdate(앞면 글로우/불티 스파크) 실행
    if (p.customUpdate) p.customUpdate(deltaTime);

    if (p.isDead) {
      p.dispose?.();
      planets.splice(i, 1);
    }
  }

  applyMutualDeformation(deltaTime);

  for (let i = explosions.length - 1; i >= 0; i--) {
    explosions[i].update?.();
    if (explosions[i].isFinished) explosions.splice(i, 1);
  }

  if (currentScenarioUpdater) currentScenarioUpdater(deltaTime);

  if (universeMesh) universeMesh.rotation.y += 0.0001;

  if (!isGiantImpactPlaying && followTarget) {
    const targetPos = new THREE.Vector3();
    followTarget.getWorldPosition(targetPos);
    controls.target.lerp(targetPos, 0.05);

    const dist = camera.position.distanceTo(targetPos);
    if (dist > 40) {
      const dir = new THREE.Vector3().subVectors(camera.position, targetPos).normalize();
      camera.position.lerp(targetPos.clone().add(dir.multiplyScalar(40)), 0.05);
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 스페이스바 이벤트 (시퀀스 제어)
window.addEventListener('keydown', (event) => {
  if (isSequenceMode && event.code === 'Space') {
    event.preventDefault();
    nextSequenceStep();
  }
});
