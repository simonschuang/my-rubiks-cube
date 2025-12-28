import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Global Variables ---
let scene, camera, renderer, controls;
let cubeGroup;
const cubies = []; // Array to hold all 27 mesh objects
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Configuration
const CUBE_SIZE = 1; // Size of individual cubie
const SPACING = 0.02; // Gap between cubies

// Colors (Red, Green, Blue, Yellow, Orange, White)
const COLORS = [
    0xb90000, // Right - Red
    0xff5900, // Left - Orange
    0xffffff, // Top - White
    0xffd500, // Bottom - Yellow
    0x009b48, // Front - Green
    0x0045ad  // Back - Blue
];
const BLACK = 0x282828; // Inner color

// --- Initialization ---

function init() {
    // 1. Scene
    scene = new THREE.Scene();

    // 2. Camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(6, 4, 6);

    // 3. Renderer
    const container = document.getElementById('canvas-container');
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
    backLight.position.set(-10, -10, -10);
    scene.add(backLight);

    // 5. Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 20;

    // 6. Build Cube
    createRubiksCube();

    // 7. Event Listeners
    window.addEventListener('resize', onWindowResize);

    // Interaction
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Touch support
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);

    // Buttons
    document.getElementById('btn-scramble').addEventListener('click', scrambleCube);
    document.getElementById('btn-reset').addEventListener('click', resetCube);

    // 8. Animation Loop
    animate();
}

function createRubiksCube() {
    // Clear existing if any
    if (cubeGroup) {
        scene.remove(cubeGroup);
        // Dispose geometries/materials to avoid leaks (optional simplified here)
        cubies.length = 0;
    }

    cubeGroup = new THREE.Group();
    scene.add(cubeGroup);

    const geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);

    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
            for (let z = -1; z <= 1; z++) {
                // Determine colors for this specific cubie
                const materials = [];

                // Order: Right (x+), Left (x-), Top (y+), Bottom (y-), Front (z+), Back (z-)

                // Right (x=1)
                materials.push(new THREE.MeshStandardMaterial({
                    color: x === 1 ? COLORS[0] : BLACK, roughness: 0.1, metalness: 0.1
                }));
                // Left (x=-1)
                materials.push(new THREE.MeshStandardMaterial({
                    color: x === -1 ? COLORS[1] : BLACK, roughness: 0.1, metalness: 0.1
                }));
                // Top (y=1)
                materials.push(new THREE.MeshStandardMaterial({
                    color: y === 1 ? COLORS[2] : BLACK, roughness: 0.1, metalness: 0.1
                }));
                // Bottom (y=-1)
                materials.push(new THREE.MeshStandardMaterial({
                    color: y === -1 ? COLORS[3] : BLACK, roughness: 0.1, metalness: 0.1
                }));
                // Front (z=1)
                materials.push(new THREE.MeshStandardMaterial({
                    color: z === 1 ? COLORS[4] : BLACK, roughness: 0.1, metalness: 0.1
                }));
                // Back (z=-1)
                materials.push(new THREE.MeshStandardMaterial({
                    color: z === -1 ? COLORS[5] : BLACK, roughness: 0.1, metalness: 0.1
                }));

                const mesh = new THREE.Mesh(geometry, materials);

                // Position with spacing
                const offset = CUBE_SIZE + SPACING;
                mesh.position.set(x * offset, y * offset, z * offset);

                // Store logical coordinates for reference
                mesh.userData = {
                    x: x,
                    y: y,
                    z: z,
                    isCubie: true,
                    initialPosition: new THREE.Vector3(x * offset, y * offset, z * offset)
                };

                cubeGroup.add(mesh);
                cubies.push(mesh);
            }
        }
    }
}

// --- Interaction State ---
let isDragging = false;
let startMouse = new THREE.Vector2();
let intersectCubie = null;
let intersectFaceNormal = null;
let dragDirection = null; // 'x' or 'y' on screen
let rotationAxis = null; // 'x', 'y', or 'z' in 3D
let isRotating = false;

// Pivot for rotation
const pivot = new THREE.Object3D();
scene.add(pivot);
let activeCubies = []; // Cubies currently being rotated

// Raycasting helper
function getIntersects(event, object) {
    const rect = renderer.domElement.getBoundingClientRect();
    const clientX = event.changedTouches ? event.changedTouches[0].clientX : event.clientX;
    const clientY = event.changedTouches ? event.changedTouches[0].clientY : event.clientY;

    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    return raycaster.intersectObjects(object.children, true);
}

function onMouseDown(event) {
    if (isRotating || isDragging) return;

    // Only handle left click or touch
    if (event.button !== 0 && event.type !== 'touchstart') return;

    const intersects = getIntersects(event, cubeGroup);

    if (intersects.length > 0) {
        // Disable orbit controls when clicking on a cube
        controls.enabled = false;

        intersectCubie = intersects[0].object;
        intersectFaceNormal = intersects[0].face.normal.clone();
        // Transform normal to world space in case the cubie is rotated
        intersectFaceNormal.transformDirection(intersectCubie.matrixWorld).round();

        startMouse.set(mouse.x, mouse.y);
        isDragging = true;
        dragDirection = null;
    }
}

function onMouseMove(event) {
    if (!isDragging) return;

    // We need to determine the drag direction first
    if (!dragDirection) {
        const rect = renderer.domElement.getBoundingClientRect();
        const clientX = event.changedTouches ? event.changedTouches[0].clientX : event.clientX;
        const clientY = event.changedTouches ? event.changedTouches[0].clientY : event.clientY;

        const currentMouseX = ((clientX - rect.left) / rect.width) * 2 - 1;
        const currentMouseY = -((clientY - rect.top) / rect.height) * 2 + 1;

        const deltaX = currentMouseX - startMouse.x;
        const deltaY = currentMouseY - startMouse.y;

        const minMove = 0.05; // Threshold to detect drag

        if (Math.abs(deltaX) > minMove || Math.abs(deltaY) > minMove) {
            // Determine direction based on local face orientation
            // Logic: Project screen drag vector onto possible rotation axes
            determineRotationAxis(deltaX, deltaY);

            if (rotationAxis) {
                // Start the rotation
                initLoopRotation();
                dragDirection = true; // Lock direction
            } else {
                // If invalid drag, cancel
                isDragging = false;
                controls.enabled = true;
            }
        }
    }
}

function onMouseUp(event) {
    if (isDragging) {
        if (dragDirection && activeCubies.length > 0) {
            // Determine direction of final rotation
            const rect = renderer.domElement.getBoundingClientRect();
            const clientX = event.changedTouches ? event.changedTouches[0].clientX : event.clientX;
            const clientY = event.changedTouches ? event.changedTouches[0].clientY : event.clientY;
            const currentMouseX = ((clientX - rect.left) / rect.width) * 2 - 1;
            const currentMouseY = -((clientY - rect.top) / rect.height) * 2 + 1;

            const dx = currentMouseX - startMouse.x;
            const dy = currentMouseY - startMouse.y;

            // Check if substantial move?
            // For now, simple logic: if enough drag, rotate 90.
            let direction = 1;
            if (Math.abs(dx) > Math.abs(dy)) direction = dx > 0 ? 1 : -1;
            else direction = dy > 0 ? -1 : 1;

            performRotation(direction, 300);
        } else {
            // Didn't drag enough, just reset
            isRotating = false;
            activeCubies.forEach(c => cubeGroup.attach(c));
            pivot.rotation.set(0, 0, 0);
            activeCubies = [];
        }
    }

    isDragging = false;
    intersectCubie = null;
    controls.enabled = true;
}

function onTouchStart(event) { onMouseDown(event); }
function onTouchMove(event) { onMouseMove(event); }
function onTouchEnd(event) { onMouseUp(event); }

function determineRotationAxis(dx, dy) {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Normal: X (1 or -1)
    if (Math.abs(intersectFaceNormal.x) > 0.5) {
        if (absDy > absDx) rotationAxis = 'z';
        else rotationAxis = 'y';
    }
    // Normal: Y (1 or -1)
    else if (Math.abs(intersectFaceNormal.y) > 0.5) {
        if (absDy > absDx) rotationAxis = 'x';
        else rotationAxis = 'z';
    }
    // Normal: Z (1 or -1)
    else if (Math.abs(intersectFaceNormal.z) > 0.5) {
        if (absDy > absDx) rotationAxis = 'x';
        else rotationAxis = 'y';
    }
}

function initLoopRotation() {
    isRotating = true;
    pivot.rotation.set(0, 0, 0);
    pivot.updateMatrixWorld();

    activeCubies = [];

    // Using simple world position check
    const worldPos = new THREE.Vector3();
    intersectCubie.getWorldPosition(worldPos);

    const epsilon = 0.1;

    cubies.forEach(cubie => {
        const cPos = new THREE.Vector3();
        cubie.getWorldPosition(cPos);

        let shouldAdd = false;
        if (rotationAxis === 'x' && Math.abs(cPos.x - worldPos.x) < epsilon) shouldAdd = true;
        if (rotationAxis === 'y' && Math.abs(cPos.y - worldPos.y) < epsilon) shouldAdd = true;
        if (rotationAxis === 'z' && Math.abs(cPos.z - worldPos.z) < epsilon) shouldAdd = true;

        if (shouldAdd) {
            activeCubies.push(cubie);
            pivot.attach(cubie);
        }
    });
}

function performRotation(direction, duration = 300) {
    const targetAngle = (Math.PI / 2) * direction;

    const startRot = pivot.rotation[rotationAxis];
    const endRot = startRot + targetAngle;

    if (duration === 0) {
        // Instant
        pivot.rotation[rotationAxis] = endRot;
        pivot.updateMatrixWorld();
        for (let i = 0; i < activeCubies.length; i++) {
            cubeGroup.attach(activeCubies[i]);
        }
        pivot.rotation.set(0, 0, 0);
        isRotating = false;
        activeCubies = [];
        return;
    }

    const startTime = Date.now();

    function animateRotation() {
        const now = Date.now();
        const progress = Math.min((now - startTime) / duration, 1);
        const ease = 1 - (1 - progress) * (1 - progress);

        pivot.rotation[rotationAxis] = startRot + (endRot - startRot) * ease;

        if (progress < 1) {
            requestAnimationFrame(animateRotation);
        } else {
            pivot.rotation[rotationAxis] = endRot;
            pivot.updateMatrixWorld();
            for (let i = 0; i < activeCubies.length; i++) {
                cubeGroup.attach(activeCubies[i]);
            }
            pivot.rotation.set(0, 0, 0);
            isRotating = false;
            activeCubies = [];
        }
    }

    animateRotation();
}

function scrambleCube() {
    if (isRotating) return;

    const axes = ['x', 'y', 'z'];
    const layers = [-1, 0, 1]; // Coordinates approximation because we use world pos with offset
    const directions = [1, -1];

    let moveCount = 0;
    const totalMoves = 20;

    function nextMove() {
        if (moveCount >= totalMoves) {
            isRotating = false;
            return;
        }

        // Pick random move
        rotationAxis = axes[Math.floor(Math.random() * axes.length)];
        // Note: layer calculation below needs to match our world position logic (times offset)
        // offset = CUBE_SIZE + SPACING = 1.02
        const offset = CUBE_SIZE + SPACING;
        const layerIdx = layers[Math.floor(Math.random() * layers.length)];
        const layerCoord = layerIdx * offset;

        const direction = directions[Math.floor(Math.random() * directions.length)];

        // Manual initLoopRotation logic for scramble
        isRotating = true;
        pivot.rotation.set(0, 0, 0);
        pivot.updateMatrixWorld();
        activeCubies = [];

        const epsilon = 0.1;

        cubies.forEach(cubie => {
            const cPos = new THREE.Vector3();
            cubie.getWorldPosition(cPos);

            let shouldAdd = false;
            if (rotationAxis === 'x' && Math.abs(cPos.x - layerCoord) < epsilon) shouldAdd = true;
            if (rotationAxis === 'y' && Math.abs(cPos.y - layerCoord) < epsilon) shouldAdd = true;
            if (rotationAxis === 'z' && Math.abs(cPos.z - layerCoord) < epsilon) shouldAdd = true;

            if (shouldAdd) {
                activeCubies.push(cubie);
                pivot.attach(cubie);
            }
        });

        // Fast, but sequential
        performRotation(direction, 60);

        moveCount++;
        // Wait for animation to finish + small buffer (60ms + 20ms)
        setTimeout(nextMove, 90);
    }

    nextMove();
}

function resetCube() {
    if (isRotating) return;
    createRubiksCube();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Start
init();
