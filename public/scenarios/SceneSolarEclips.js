// public/scenarios/SceneSolarEclipse.js

import { Planet } from '../planet.js';
import * as THREE from 'three'; // ✨ THREE 객체를 사용하려면 import 필요
import * as CANNON from 'cannon-es'

/**
 * 개기일식 장면을 초기화합니다. (Sun -> Moon -> Earth 정렬)
 * @returns {Object} { planets: Planet[], cameraPosition: {x, y, z} }
 */
export function initSolarEclipseScene(scene, world, loader, aiData, ambientLight) {
    console.log("🌑 [SceneSolarEclipse] 함수 실행되었습니다.");
    const planets = [];
    const SCENARIO_TYPE = 'solar_eclipse';

    // --- 설정 상수 ---
    const SCALE_DISTANCE = 30; 
    const SCALE_SIZE = 1;      

    // --- 기본 천체 데이터 ---
    const sunData = { name: 'Sun', textureKey: 'Sun', size: SCALE_SIZE * 20};//, mass: 10000 
    const earthData = { name: 'Earth', textureKey: 'Earth', size: SCALE_SIZE * 1.5};//, mass: 100 
    const moonData = { name: 'Moon', textureKey: 'Moon', size: SCALE_SIZE * 0.5};//, mass: 5 

    // --- 1. 위치/속도 설정 (일식 정렬) ---
    
    // A. 태양: 멀리 떨어진 광원 (Z축 음수 방향)
    sunData.position = { x: 0, y: 0, z: -SCALE_DISTANCE * 10 }; 
    sunData.velocity = { x: 0, y: 0, z: 0 };

    // B. 지구: 관찰 기준점 (중앙)
    earthData.position = { x: 0, y: 0, z: 0 };
    earthData.velocity = { x: 0, y: 0, z: 0 }; 

    // C. 달: 지구와 태양 사이에 위치하여 태양을 가림
    moonData.position = { x: 0, y: 0, z: -SCALE_SIZE * 5 }; 
    moonData.velocity = { x: 0, y: 0, z: 0 }; // 서서히 이동하며 일식 진행

    // --- 2. 행성 생성 ---

    const sun = new Planet(scene, world, loader, sunData, SCENARIO_TYPE);
    const earth = new Planet(scene, world, loader, earthData, SCENARIO_TYPE);
    const moon = new Planet(scene, world, loader, moonData, SCENARIO_TYPE);

    planets.push(sun, earth, moon); // 인스턴스를 배열에 추가

    const sunLight = new THREE.DirectionalLight(0xffffff, 3);
        sunLight.distance = 0;
    
        if(sun.body){
            sunLight.position.copy(sun.body.position);
        }
        else{
            sunLight.position.set(sunData.position.x, sunData.position.y, sunData.position.z);
        }
        sunLight.castShadow = true;
        sunLight.target.position.set(0, 0, 0);
        scene.add(sunLight)
        scene.add(sunLight.target);
    
    // ✨ 수정: moon과 earth 인스턴스의 mesh 속성에 접근합니다.
    // 안전을 위해 객체가 존재하는지 확인합니다.
    if (moon.mesh) {
        moon.mesh.castShadow = true; // 달이 그림자를 던져 태양을 가림
    }
    if (earth.mesh) {
        earth.mesh.receiveShadow = true; // 지구가 달의 그림자를 받음
    }
    scene.add(sunLight);

    // --- 3. 카메라 설정 ---
    const cameraPosition = { x: 0, y: SCALE_SIZE * 10, z: SCALE_DISTANCE * 3 }; 


    // ✨ setupControls 함수가 ambientLight를 세 번째 인수로 받도록 수정
    const setupControls = (camera, controls, ambientLight) => { 
            
        // 전역 조명 밝기를 애니메이션하는 함수
        const animateBrightness = (targetIntensity, duration) => {
            if (!ambientLight) return; // ambientLight가 없으면 종료

            const startIntensity = ambientLight.intensity;
            const startTime = performance.now();
            
            const animate = (time) => {
                const elapsed = time - startTime;
                const progress = Math.min(elapsed / duration, 1.0);
                
                // 선형 보간 (밝기를 서서히 변화시킵니다)
                ambientLight.intensity = startIntensity + (targetIntensity - startIntensity) * progress;
                
                if (progress < 1.0) {
                    requestAnimationFrame(animate);
                }
            };
            
            requestAnimationFrame(animate);
        };
        
        const handleKeydown = (event) => {
            if (event.key === 'Enter') {
                if (earth.mesh && moon.body) {

                    // 1. 초기 위치 설정 (일식 시작 직전 위치)
                    moon.body.position = new CANNON.Vec3(5, 0, -SCALE_SIZE * 5 );
                    const earthPos = earth.mesh.position;
                    
                    // 1. 카메라 위치 이동
                    camera.position.set(earthPos.x,earthPos.y,earthPos.z)
                        
                    // 2. OrbitControls 타겟 업데이트
                    controls.target.set(sunData.position.x, sunData.position.y, sunData.position.z); // 지구의 중심을 바라보도록 설정
                    controls.update();

                    // 3. ✨ 밝기 변화 애니메이션 시작 (최대 1.0 -> 0.1로 어두워짐)
                    // 일식 시작 시 밝기를 2초 동안 0.1로 어둡게 합니다.
                    const INITIAL_FADE_DURATION = 12000; // 3초
                    animateBrightness(0.1, INITIAL_FADE_DURATION);

                    // 4. ✨ 일식 애니메이션 시작 (달의 속도 설정)
                    const MOON_SPEED = 0.5; // X축 속도 (유닛/초)
                    const DISTANCE_TO_COVER = 6; // 달이 지나가야 하는 총 거리 (예: X=3에서 X=-3까지)
                    const moonVelocity = new CANNON.Vec3(-MOON_SPEED, 0, 0); // 느린 속도
                    moon.body.velocity = moonVelocity; // 직접 할당
                    
                    // 5. ✨ 일식 종료 후 밝기 복구 예약
                    // 달이 지구를 완전히 가리는 데 걸리는 시간 (예: X=3에서 X=-3까지 이동, 속도 0.05 -> 6 / 0.05 = 120초)
                    const MOVE_TIME_SECONDS = DISTANCE_TO_COVER / MOON_SPEED; // 예: 6 / 0.5 = 12초
                    const TOTAL_DELAY_MS = (MOVE_TIME_SECONDS * 1000) + INITIAL_FADE_DURATION;
                    //const animationDuration = (6 / 0.5) * (1000 / 60) + 2000; // 대략 2분 후 밝기 복구
                    
                   setTimeout(() => {
                        animateBrightness(1.0, 3000); // 3초 동안 원래 밝기(1.0)로 복구
                        
                        // 달의 이동을 멈추거나 반대 방향으로 이동시켜 Scene을 정리합니다.
                        // moon.body.velocity = new CANNON.Vec3(0, 0, 0); 
                    }, TOTAL_DELAY_MS);
                    
                    console.log("📸 카메라 이동 및 일식 애니메이션 시작.");

                } else {
                    console.warn("⚠️ 행성 Mesh/Body가 정의되지 않아 카메라 이동/애니메이션 불가.");
                }
            }
        };
        
        window.addEventListener('keydown', handleKeydown);
        
        // Scene 종료 시 리스너를 정리할 함수 반환
        return () => {
            window.removeEventListener('keydown', handleKeydown);
            console.log("🧹 일식 Scene 컨트롤이 정리되었습니다.");
        };
    };

    return { 
        planets, 
        cameraPosition,
        setupControls : (camera, controls) => setupControls(camera, controls, ambientLight)
    };
}