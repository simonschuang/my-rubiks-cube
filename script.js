import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Global Variables ---
let scene, camera, renderer, controls;
let cubeGroup;
const cubies = []; // Array to hold all 27 mesh objects
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let moveHistory = []; // Array to track rotation history

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

    updateCameraPosition();

    // 6. Build Cube
    scene.add(pivot);
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
    document.getElementById('btn-scan').addEventListener('click', openScanner);
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
// Pivot for rotation
const pivot = new THREE.Object3D();
// scene.add(pivot) moved to init()
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
            if (Math.abs(dx) > Math.abs(dy)) {
                direction = dx > 0 ? 1 : -1;
                // Invert for Top Face when dragging horizontally
                if (intersectFaceNormal.y > 0.5) direction *= -1;
            } else {
                direction = dy > 0 ? -1 : 1;
                // Invert for Right Face and Back Face when dragging vertically
                if (intersectFaceNormal.x > 0.5) direction *= -1;
                if (intersectFaceNormal.z < -0.5) direction *= -1;
            }

            // Determine which layer we are rotating
            // We need to find the coordinate of the layer based on the intersected cubie
            const worldPos = new THREE.Vector3();
            intersectCubie.getWorldPosition(worldPos);
            let layerCoord = 0;
            if (rotationAxis === 'x') layerCoord = worldPos.x;
            if (rotationAxis === 'y') layerCoord = worldPos.y;
            if (rotationAxis === 'z') layerCoord = worldPos.z;

            // Round to nearest layer coordinate (approx multiples of 1.02)
            // But we can just pass the raw worldPos to selectLayer which handles epsilon

            // Record move
            // Note: We need a clean way to store layer info. Steps of approx 1.02.
            moveHistory.push({ axis: rotationAxis, layerCoord: layerCoord, direction: direction });

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

    // Reuse selectLayer logic
    // We already identified rotationAxis in determineRotationAxis
    let layerCoord = 0;
    if (rotationAxis === 'x') layerCoord = worldPos.x;
    if (rotationAxis === 'y') layerCoord = worldPos.y;
    if (rotationAxis === 'z') layerCoord = worldPos.z;

    selectLayer(rotationAxis, layerCoord);
}

function selectLayer(axis, coord) {
    activeCubies = [];
    const epsilon = 0.1;

    cubies.forEach(cubie => {
        const cPos = new THREE.Vector3();
        cubie.getWorldPosition(cPos);

        let shouldAdd = false;
        if (axis === 'x' && Math.abs(cPos.x - coord) < epsilon) shouldAdd = true;
        if (axis === 'y' && Math.abs(cPos.y - coord) < epsilon) shouldAdd = true;
        if (axis === 'z' && Math.abs(cPos.z - coord) < epsilon) shouldAdd = true;

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

        // Record move
        moveHistory.push({ axis: rotationAxis, layerCoord: layerCoord, direction: direction });

        // Manual initLoopRotation logic for scramble -> Use selectLayer
        isRotating = true;
        pivot.rotation.set(0, 0, 0);
        pivot.updateMatrixWorld();

        selectLayer(rotationAxis, layerCoord);

        // Fast, but sequential
        performRotation(direction, 60);

        moveCount++;
        // Wait for animation to finish + small buffer (60ms + 20ms)
        setTimeout(nextMove, 90);
    }

    nextMove();
}

function solveCube() {
    if (isRotating || moveHistory.length === 0) return;

    function nextSolveMove() {
        if (moveHistory.length === 0) {
            isRotating = false;
            return;
        }

        const move = moveHistory.pop();
        rotationAxis = move.axis; // Global var used by performRotation

        isRotating = true;
        pivot.rotation.set(0, 0, 0);
        pivot.updateMatrixWorld();

        selectLayer(move.axis, move.layerCoord);

        // Reverse direction
        performRotation(-move.direction, 100);

        // Wait for animation
        setTimeout(nextSolveMove, 120);
    }

    nextSolveMove();
}

function resetCube() {
    if (isRotating) return;
    createRubiksCube();
    moveHistory.length = 0;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    updateCameraPosition();
}

function updateCameraPosition() {
    // If mobile (portrait or small width), move camera back
    if (window.innerWidth < 768) {
        // Further out
        camera.position.set(9, 6, 9);
    } else {
        // Desktop / default
        camera.position.set(6, 4, 6);
    }
    controls.update();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Start
init();

// --- Scanner Start ---

let scannerStream = null;
const scannerModal = document.getElementById('scanner-modal');
const scannerVideo = document.getElementById('scanner-video');
const scannerCanvas = document.getElementById('scanner-canvas');
const correctionGrid = document.getElementById('correction-grid');
const colorGrid = document.getElementById('color-grid');
const colorPicker = document.getElementById('color-picker');

// Face scanning order: U, R, F, D, L, B
const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
const FACE_NAMES = {
    'U': 'Up (White)',
    'R': 'Right (Red)',
    'F': 'Front (Green)',
    'D': 'Down (Yellow)',
    'L': 'Left (Orange)',
    'B': 'Back (Blue)'
};
const FACE_INSTRUCTIONS = {
    'U': 'Position the WHITE (Up) face toward the camera',
    'R': 'Position the RED (Right) face toward the camera',
    'F': 'Position the GREEN (Front) face toward the camera',
    'D': 'Position the YELLOW (Down) face toward the camera',
    'L': 'Position the ORANGE (Left) face toward the camera',
    'B': 'Position the BLUE (Back) face toward the camera'
};

let currentFaceIndex = 0;
let scannedFaces = []; // Store all 6 faces as arrays of 9 colors
let currentFaceColors = []; // Current face being edited
let selectedCellIndex = null;

document.getElementById('btn-scan').addEventListener('click', openScanner);
document.getElementById('btn-close-scanner').addEventListener('click', closeScanner);
document.getElementById('btn-capture').addEventListener('click', captureFace);
document.getElementById('btn-confirm-face').addEventListener('click', confirmFace);

// Wait for OpenCV.js to load
function waitForOpenCV() {
    return new Promise((resolve) => {
        if (typeof cv !== 'undefined' && cv.Mat) {
            resolve();
        } else {
            setTimeout(() => waitForOpenCV().then(resolve), 100);
        }
    });
}

async function openScanner() {
    // Reset scanner state
    currentFaceIndex = 0;
    scannedFaces = [];
    currentFaceColors = [];
    selectedCellIndex = null;
    
    scannerModal.classList.remove('hidden');
    correctionGrid.classList.add('hidden');
    document.getElementById('btn-capture').classList.remove('hidden');
    document.getElementById('btn-confirm-face').classList.add('hidden');
    
    updateFaceDisplay();
    
    try {
        scannerStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment', width: 640, height: 480 } 
        });
        scannerVideo.srcObject = scannerStream;
        
        // Wait for OpenCV.js to be ready
        await waitForOpenCV();
    } catch (err) {
        console.error("Camera access denied or OpenCV not loaded:", err);
        alert("Camera access is required to scan the cube. Make sure OpenCV.js is loaded.");
        closeScanner();
    }
}

function closeScanner() {
    scannerModal.classList.add('hidden');
    if (scannerStream) {
        scannerStream.getTracks().forEach(track => track.stop());
        scannerStream = null;
    }
    
    // If all 6 faces were scanned, apply them to the cube
    if (scannedFaces.length === 6) {
        applyAllScannedFaces();
    }
}

function updateFaceDisplay() {
    const faceName = FACE_ORDER[currentFaceIndex];
    document.getElementById('current-face-name').textContent = `${faceName} (${FACE_NAMES[faceName]})`;
    document.getElementById('face-instruction').textContent = FACE_INSTRUCTIONS[faceName];
    document.getElementById('scanner-status').textContent = `Faces Scanned: ${scannedFaces.length}/6`;
}

async function captureFace() {
    if (!scannerVideo.videoWidth || !scannerVideo.videoHeight) {
        alert('Video not ready. Please wait a moment.');
        return;
    }
    
    // Setup canvas
    scannerCanvas.width = scannerVideo.videoWidth;
    scannerCanvas.height = scannerVideo.videoHeight;
    const ctx = scannerCanvas.getContext('2d');
    ctx.drawImage(scannerVideo, 0, 0);
    
    try {
        // Use OpenCV.js for processing
        const colors = await processImageWithOpenCV(scannerCanvas);
        
        if (colors && colors.length === 9) {
            currentFaceColors = colors;
            showCorrectionGrid(colors);
        } else {
            alert('Failed to detect face. Please try again with better lighting and alignment.');
        }
    } catch (err) {
        console.error('Error processing image:', err);
        alert('Error processing image. Using simple color sampling fallback.');
        
        // Fallback to simple sampling
        currentFaceColors = simpleSampleColors(scannerCanvas);
        showCorrectionGrid(currentFaceColors);
    }
}

async function processImageWithOpenCV(canvas) {
    // Check if OpenCV is loaded
    if (typeof cv === 'undefined' || !cv.Mat) {
        throw new Error('OpenCV not loaded');
    }
    
    const src = cv.imread(canvas);
    const gray = new cv.Mat();
    const edges = new cv.Mat();
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    
    try {
        // Convert to grayscale
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        
        // Apply Gaussian blur
        cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
        
        // Edge detection
        cv.Canny(gray, edges, 50, 150);
        
        // Find contours
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        
        // Find the largest square-like contour (the Rubik's cube face)
        let bestContour = null;
        let maxArea = 0;
        
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);
            const peri = cv.arcLength(contour, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(contour, approx, 0.02 * peri, true);
            
            // Look for quadrilateral with sufficient area
            if (approx.rows === 4 && area > maxArea && area > 10000) {
                maxArea = area;
                if (bestContour) bestContour.delete();
                bestContour = approx;
            } else {
                approx.delete();
            }
            contour.delete();
        }
        
        let colors;
        if (bestContour && maxArea > 10000) {
            // Perform perspective correction
            colors = extractColorsWithPerspective(src, bestContour);
            bestContour.delete();
        } else {
            // Fallback to center region sampling
            colors = sampleCenterRegion(src);
        }
        
        return colors;
    } finally {
        // Cleanup
        src.delete();
        gray.delete();
        edges.delete();
        contours.delete();
        hierarchy.delete();
    }
}

function extractColorsWithPerspective(src, contour) {
    try {
        // Get the 4 corner points
        const points = [];
        for (let i = 0; i < contour.rows; i++) {
            points.push({
                x: contour.data32S[i * 2],
                y: contour.data32S[i * 2 + 1]
            });
        }
        
        // Sort points to get them in order: top-left, top-right, bottom-right, bottom-left
        points.sort((a, b) => a.y - b.y);
        const topPoints = points.slice(0, 2).sort((a, b) => a.x - b.x);
        const bottomPoints = points.slice(2, 4).sort((a, b) => a.x - b.x);
        const orderedPoints = [...topPoints, ...bottomPoints];
        
        // Define source and destination points for perspective transform
        const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
            orderedPoints[0].x, orderedPoints[0].y,
            orderedPoints[1].x, orderedPoints[1].y,
            orderedPoints[3].x, orderedPoints[3].y,
            orderedPoints[2].x, orderedPoints[2].y
        ]);
        
        const size = 300;
        const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0, 0,
            size, 0,
            0, size,
            size, size
        ]);
        
        // Get perspective transform matrix
        const M = cv.getPerspectiveTransform(srcPoints, dstPoints);
        const warped = new cv.Mat();
        cv.warpPerspective(src, warped, M, new cv.Size(size, size));
        
        // Sample colors from the warped image
        const colors = sampleColorsFromMat(warped, size);
        
        // Cleanup
        srcPoints.delete();
        dstPoints.delete();
        M.delete();
        warped.delete();
        
        return colors;
    } catch (err) {
        console.error('Perspective transform failed:', err);
        return sampleCenterRegion(src);
    }
}

function sampleCenterRegion(src) {
    // Sample from center 60% of the image
    const centerX = src.cols / 2;
    const centerY = src.rows / 2;
    const regionSize = Math.min(src.cols, src.rows) * 0.6;
    
    const colors = [];
    const cellSize = regionSize / 3;
    
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const x = Math.floor(centerX - regionSize / 2 + col * cellSize + cellSize / 2);
            const y = Math.floor(centerY - regionSize / 2 + row * cellSize + cellSize / 2);
            
            // Sample 5x5 region and average
            let r = 0, g = 0, b = 0, count = 0;
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const px = Math.max(0, Math.min(src.cols - 1, x + dx));
                    const py = Math.max(0, Math.min(src.rows - 1, y + dy));
                    const idx = (py * src.cols + px) * 4;
                    r += src.data[idx];
                    g += src.data[idx + 1];
                    b += src.data[idx + 2];
                    count++;
                }
            }
            
            r = Math.floor(r / count);
            g = Math.floor(g / count);
            b = Math.floor(b / count);
            
            colors.push(findNearestColor(r, g, b));
        }
    }
    
    return colors;
}

function sampleColorsFromMat(mat, size) {
    const colors = [];
    const cellSize = size / 3;
    
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const x = Math.floor(col * cellSize + cellSize / 2);
            const y = Math.floor(row * cellSize + cellSize / 2);
            
            // Sample 5x5 region and average
            let r = 0, g = 0, b = 0, count = 0;
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const px = Math.max(0, Math.min(size - 1, x + dx));
                    const py = Math.max(0, Math.min(size - 1, y + dy));
                    const idx = (py * mat.cols + px) * 4;
                    r += mat.data[idx];
                    g += mat.data[idx + 1];
                    b += mat.data[idx + 2];
                    count++;
                }
            }
            
            r = Math.floor(r / count);
            g = Math.floor(g / count);
            b = Math.floor(b / count);
            
            colors.push(findNearestColor(r, g, b));
        }
    }
    
    return colors;
}

function simpleSampleColors(canvas) {
    const ctx = canvas.getContext('2d');
    const cellWidth = canvas.width / 3;
    const cellHeight = canvas.height / 3;
    
    const capturedColors = [];
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const x = Math.floor(col * cellWidth + cellWidth / 2);
            const y = Math.floor(row * cellHeight + cellHeight / 2);
            const pixel = ctx.getImageData(x, y, 1, 1).data;
            
            const matchedColor = findNearestColor(pixel[0], pixel[1], pixel[2]);
            capturedColors.push(matchedColor);
        }
    }
    
    return capturedColors;
}

function showCorrectionGrid(colors) {
    // Hide video, show correction grid
    document.getElementById('btn-capture').classList.add('hidden');
    document.getElementById('btn-confirm-face').classList.remove('hidden');
    correctionGrid.classList.remove('hidden');
    
    // Build the grid
    colorGrid.innerHTML = '';
    colors.forEach((color, index) => {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.style.backgroundColor = '#' + color.toString(16).padStart(6, '0');
        cell.dataset.index = index;
        cell.addEventListener('click', () => selectCell(index));
        colorGrid.appendChild(cell);
    });
    
    // Setup color picker
    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', () => {
            if (selectedCellIndex !== null) {
                const colorHex = parseInt(option.dataset.color);
                currentFaceColors[selectedCellIndex] = colorHex;
                updateCellColor(selectedCellIndex, colorHex);
                selectedCellIndex = null;
                document.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('selected'));
            }
        });
    });
}

function selectCell(index) {
    selectedCellIndex = index;
    document.querySelectorAll('.grid-cell').forEach((cell, i) => {
        cell.classList.toggle('selected', i === index);
    });
}

function updateCellColor(index, color) {
    const cell = colorGrid.children[index];
    if (cell) {
        cell.style.backgroundColor = '#' + color.toString(16).padStart(6, '0');
    }
}

function confirmFace() {
    // Save this face
    scannedFaces.push([...currentFaceColors]);
    
    // Move to next face or finish
    currentFaceIndex++;
    if (currentFaceIndex < 6) {
        // Show video again for next face
        correctionGrid.classList.add('hidden');
        document.getElementById('btn-capture').classList.remove('hidden');
        document.getElementById('btn-confirm-face').classList.add('hidden');
        selectedCellIndex = null;
        currentFaceColors = [];
        updateFaceDisplay();
    } else {
        // All faces scanned
        closeScanner();
    }
}

function applyAllScannedFaces() {
    // Apply all 6 scanned faces to the cube
    // Face order: U(0), R(1), F(2), D(3), L(4), B(5)
    
    const faceNormals = [
        new THREE.Vector3(0, 1, 0),   // U - Top
        new THREE.Vector3(1, 0, 0),   // R - Right
        new THREE.Vector3(0, 0, 1),   // F - Front
        new THREE.Vector3(0, -1, 0),  // D - Bottom
        new THREE.Vector3(-1, 0, 0),  // L - Left
        new THREE.Vector3(0, 0, -1)   // B - Back
    ];
    
    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
        const colors = scannedFaces[faceIdx];
        const normal = faceNormals[faceIdx];
        applySampledColorsToFace(colors, normal);
    }
    
    // Clear move history
    moveHistory.length = 0;
    alert('All faces applied! Move history cleared.');
}

function applySampledColorsToFace(colors, targetNormal) {
    // Apply colors to cubies on this face
    const epsilon = 0.1;
    const offset = CUBE_SIZE + SPACING;
    
    const faceCubies = cubies.filter(c => {
        const pos = new THREE.Vector3();
        c.getWorldPosition(pos);
        if (targetNormal.x !== 0) return Math.abs(pos.x - targetNormal.x * offset) < epsilon;
        if (targetNormal.y !== 0) return Math.abs(pos.y - targetNormal.y * offset) < epsilon;
        if (targetNormal.z !== 0) return Math.abs(pos.z - targetNormal.z * offset) < epsilon;
        return false;
    });
    
    // Sort cubies to match grid order
    faceCubies.sort((a, b) => {
        const posA = new THREE.Vector3(); a.getWorldPosition(posA);
        const posB = new THREE.Vector3(); b.getWorldPosition(posB);
        
        if (Math.abs(targetNormal.y) > 0.5) {
            const dz = posB.z - posA.z;
            if (Math.abs(dz) > epsilon) return dz;
            return posA.x - posB.x;
        }
        
        const dy = posB.y - posA.y;
        if (Math.abs(dy) > epsilon) return dy;
        
        if (Math.abs(targetNormal.x) > 0.5) {
            if (targetNormal.x > 0) return posB.z - posA.z;
            else return posA.z - posB.z;
        } else {
            if (targetNormal.z > 0) return posA.x - posB.x;
            else return posB.x - posA.x;
        }
    });
    
    if (faceCubies.length !== 9) {
        console.warn("Found " + faceCubies.length + " cubies, expected 9.");
        return;
    }
    
    faceCubies.forEach((cubie, index) => {
        if (colors[index] !== undefined) {
            let matIndex = -1;
            if (targetNormal.x > 0.5) matIndex = 0;
            if (targetNormal.x < -0.5) matIndex = 1;
            if (targetNormal.y > 0.5) matIndex = 2;
            if (targetNormal.y < -0.5) matIndex = 3;
            if (targetNormal.z > 0.5) matIndex = 4;
            if (targetNormal.z < -0.5) matIndex = 5;
            
            if (matIndex >= 0) {
                cubie.material[matIndex].color.setHex(colors[index]);
            }
        }
    });
}

function findNearestColor(r, g, b) {
    const standardColors = [
        { hex: 0xb90000, r: 185, g: 0, b: 0 },       // Red
        { hex: 0xff5900, r: 255, g: 89, b: 0 },      // Orange
        { hex: 0xffffff, r: 255, g: 255, b: 255 },   // White
        { hex: 0xffd500, r: 255, g: 213, b: 0 },     // Yellow
        { hex: 0x009b48, r: 0, g: 155, b: 72 },      // Green
        { hex: 0x0045ad, r: 0, g: 69, b: 173 }       // Blue
    ];

    let minDist = Infinity;
    let nearest = standardColors[0].hex;

    standardColors.forEach(c => {
        const d = Math.sqrt(
            Math.pow(r - c.r, 2) +
            Math.pow(g - c.g, 2) +
            Math.pow(b - c.b, 2)
        );
        if (d < minDist) {
            minDist = d;
            nearest = c.hex;
        }
    });

    return nearest;
}

// --- Scanner End ---
