import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Global Variables ---
let scene, camera, renderer, controls;
let cubeGroup;
const cubies = []; // Array to hold all 27 mesh objects
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const moveHistory = []; // Track moves for undo functionality

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

// --- OpenCV.js Scanner Implementation ---

// Scanner state
let scannerStream = null;
let opencvReady = false;
const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B']; // Up, Right, Front, Down, Left, Back
const FACE_NAMES = {
    'U': 'Up (White)',
    'R': 'Right (Red)',
    'F': 'Front (Green)',
    'D': 'Down (Yellow)',
    'L': 'Left (Orange)',
    'B': 'Back (Blue)'
};
let currentFaceIndex = 0;
let scannedFaces = {}; // Store colors for each face { 'U': [colors...], 'R': [...], ... }
let capturedImageData = null; // For manual correction

// Wait for OpenCV.js to load
window.addEventListener('load', () => {
    if (typeof cv !== 'undefined') {
        cv.onRuntimeInitialized = () => {
            opencvReady = true;
            console.log('OpenCV.js is ready');
        };
    } else {
        console.warn('OpenCV.js not loaded yet. Scanner will use fallback mode with basic color sampling. Face detection and perspective correction will not be available.');
    }
});

// Color definitions
const STANDARD_COLORS = [
    { name: 'R', hex: 0xb90000, r: 185, g: 0, b: 0 },       // Red
    { name: 'O', hex: 0xff5900, r: 255, g: 89, b: 0 },      // Orange
    { name: 'W', hex: 0xffffff, r: 255, g: 255, b: 255 },   // White
    { name: 'Y', hex: 0xffd500, r: 255, g: 213, b: 0 },     // Yellow
    { name: 'G', hex: 0x009b48, r: 0, g: 155, b: 72 },      // Green
    { name: 'B', hex: 0x0045ad, r: 0, g: 69, b: 173 }       // Blue
];

// UI Elements
const scannerModal = document.getElementById('scanner-modal');
const scannerVideo = document.getElementById('scanner-video');
const scannerCanvas = document.getElementById('scanner-canvas');
const correctionModal = document.getElementById('correction-modal');
const correctionGrid = document.getElementById('correction-grid');
const colorPalette = document.getElementById('color-palette');
const exportModal = document.getElementById('export-modal');

// Event listeners
document.getElementById('btn-scan').addEventListener('click', openScanner);
document.getElementById('btn-close-scanner').addEventListener('click', cancelScanner);
document.getElementById('btn-capture').addEventListener('click', captureFace);
document.getElementById('btn-confirm-correction').addEventListener('click', confirmCorrection);
document.getElementById('btn-recapture').addEventListener('click', recaptureFace);
document.getElementById('btn-apply-to-cube').addEventListener('click', applyToCube);
document.getElementById('btn-close-export').addEventListener('click', closeExport);
document.getElementById('btn-copy-string').addEventListener('click', copyKociembaString);

async function openScanner() {
    // Wait for OpenCV if not ready
    if (!opencvReady && typeof cv !== 'undefined') {
        await new Promise(resolve => {
            cv.onRuntimeInitialized = () => {
                opencvReady = true;
                resolve();
            };
        });
    }

    // Reset scanner state
    currentFaceIndex = 0;
    scannedFaces = {};
    updateScannerUI();

    scannerModal.classList.remove('hidden');
    try {
        scannerStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 1280 }
            } 
        });
        scannerVideo.srcObject = scannerStream;
    } catch (err) {
        console.error("Camera access denied:", err);
        alert("Camera access is required to scan the cube.");
        closeScanner();
    }
}

function cancelScanner() {
    if (Object.keys(scannedFaces).length > 0) {
        if (!confirm('Are you sure you want to cancel? You will lose scanned data.')) {
            return;
        }
    }
    closeScanner();
}

function closeScanner() {
    scannerModal.classList.add('hidden');
    if (scannerStream) {
        scannerStream.getTracks().forEach(track => track.stop());
        scannerStream = null;
    }
}

function updateScannerUI() {
    const currentFace = FACE_ORDER[currentFaceIndex];
    document.getElementById('scanner-current-face').textContent = FACE_NAMES[currentFace];
    document.getElementById('scanner-status').textContent = `Scanned: ${Object.keys(scannedFaces).length}/6 faces`;
}

async function captureFace() {
    if (!scannerVideo.videoWidth) {
        alert('Video not ready, please wait...');
        return;
    }

    // Create canvas for capture
    const canvas = document.createElement('canvas');
    canvas.width = scannerVideo.videoWidth;
    canvas.height = scannerVideo.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(scannerVideo, 0, 0);

    // Process with OpenCV
    let colors;
    if (opencvReady && typeof cv !== 'undefined') {
        colors = await processImageWithOpenCV(canvas);
    } else {
        // Fallback: simple grid sampling
        colors = sampleColorsSimple(canvas);
    }

    // Store the image for manual correction
    capturedImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Show correction modal
    showCorrectionModal(colors);
}

function processImageWithOpenCV(canvas) {
    try {
        const src = cv.imread(canvas);
        const gray = new cv.Mat();
        const blurred = new cv.Mat();
        const edges = new cv.Mat();
        
        // Convert to grayscale and blur
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
        
        // Detect edges
        cv.Canny(blurred, edges, 50, 150);
        
        // Find contours
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        
        // Find largest square-like contour
        let largestContour = null;
        let maxArea = 0;
        
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);
            const perimeter = cv.arcLength(contour, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
            
            // Look for roughly square shapes (4 corners)
            if (approx.rows === 4 && area > maxArea && area > canvas.width * canvas.height * 0.1) {
                maxArea = area;
                if (largestContour) largestContour.delete();
                largestContour = contour.clone();
            }
            approx.delete();
        }
        
        let colors;
        if (largestContour && maxArea > 0) {
            // Perspective correction
            colors = extractColorsWithPerspective(src, largestContour, canvas);
        } else {
            // Fallback to center sampling
            colors = extractColorsFromCenter(src, canvas);
        }
        
        // Cleanup
        src.delete();
        gray.delete();
        blurred.delete();
        edges.delete();
        contours.delete();
        hierarchy.delete();
        if (largestContour) largestContour.delete();
        
        return colors;
    } catch (err) {
        console.error('OpenCV processing error:', err);
        return sampleColorsSimple(canvas);
    }
}

function extractColorsWithPerspective(src, contour, canvas) {
    try {
        // Get the 4 corners
        const rect = cv.minAreaRect(contour);
        const vertices = cv.RotatedRect.points(rect);
        
        // Sort vertices to be in consistent order
        const sorted = sortVertices(vertices);
        
        // Define destination points for 300x300 square
        const dsize = new cv.Size(300, 300);
        const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            sorted[0].x, sorted[0].y,
            sorted[1].x, sorted[1].y,
            sorted[2].x, sorted[2].y,
            sorted[3].x, sorted[3].y
        ]);
        const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0, 0,
            299, 0,
            299, 299,
            0, 299
        ]);
        
        // Get perspective transform
        const M = cv.getPerspectiveTransform(srcTri, dstTri);
        const warped = new cv.Mat();
        cv.warpPerspective(src, warped, M, dsize);
        
        // Sample colors from the warped image
        const colors = sampleColorsFromMat(warped);
        
        // Auto-orient based on center sticker
        const oriented = autoOrient(colors);
        
        // Cleanup
        srcTri.delete();
        dstTri.delete();
        M.delete();
        warped.delete();
        
        return oriented;
    } catch (err) {
        console.error('Perspective correction error:', err);
        return extractColorsFromCenter(src, canvas);
    }
}

function sortVertices(vertices) {
    // Sort by y first, then x
    const sorted = vertices.sort((a, b) => a.y - b.y);
    const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
    return [top[0], top[1], bottom[1], bottom[0]]; // TL, TR, BR, BL
}

function extractColorsFromCenter(src, canvas) {
    // Sample from center 60% of image
    const centerSize = Math.min(canvas.width, canvas.height) * 0.6;
    const x0 = (canvas.width - centerSize) / 2;
    const y0 = (canvas.height - centerSize) / 2;
    
    const colors = [];
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const x = Math.floor(x0 + (col + 0.5) * centerSize / 3);
            const y = Math.floor(y0 + (row + 0.5) * centerSize / 3);
            
            // Sample 5x5 area and average
            const pixel = sampleAreaFromMat(src, x, y, 5);
            const color = findNearestColor(pixel.r, pixel.g, pixel.b);
            colors.push(color);
        }
    }
    
    return autoOrient(colors);
}

function sampleColorsFromMat(mat) {
    const colors = [];
    const size = mat.cols / 3;
    
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const x = Math.floor((col + 0.5) * size);
            const y = Math.floor((row + 0.5) * size);
            const pixel = sampleAreaFromMat(mat, x, y, 10);
            const color = findNearestColor(pixel.r, pixel.g, pixel.b);
            colors.push(color);
        }
    }
    
    return colors;
}

function sampleAreaFromMat(mat, cx, cy, areaSize) {
    let r = 0, g = 0, b = 0, count = 0;
    const half = Math.floor(areaSize / 2);
    
    for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
            const x = Math.max(0, Math.min(mat.cols - 1, cx + dx));
            const y = Math.max(0, Math.min(mat.rows - 1, cy + dy));
            const pixel = mat.ucharPtr(y, x);
            r += pixel[0];
            g += pixel[1];
            b += pixel[2];
            count++;
        }
    }
    
    return { r: r / count, g: g / count, b: b / count };
}

function sampleColorsSimple(canvas) {
    const ctx = canvas.getContext('2d');
    const centerSize = Math.min(canvas.width, canvas.height) * 0.6;
    const x0 = (canvas.width - centerSize) / 2;
    const y0 = (canvas.height - centerSize) / 2;
    
    const colors = [];
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const x = Math.floor(x0 + (col + 0.5) * centerSize / 3);
            const y = Math.floor(y0 + (row + 0.5) * centerSize / 3);
            
            // Sample 5x5 area and average
            let r = 0, g = 0, b = 0, count = 0;
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const data = ctx.getImageData(x + dx, y + dy, 1, 1).data;
                    r += data[0];
                    g += data[1];
                    b += data[2];
                    count++;
                }
            }
            
            const color = findNearestColor(r / count, g / count, b / count);
            colors.push(color);
        }
    }
    
    return autoOrient(colors);
}

function findNearestColor(r, g, b) {
    let minDist = Infinity;
    let nearest = STANDARD_COLORS[0];
    
    STANDARD_COLORS.forEach(c => {
        const d = Math.sqrt(
            Math.pow(r - c.r, 2) +
            Math.pow(g - c.g, 2) +
            Math.pow(b - c.b, 2)
        );
        if (d < minDist) {
            minDist = d;
            nearest = c;
        }
    });
    
    return nearest;
}

function autoOrient(colors) {
    // Rotate the colors array to match canonical orientation
    // For each face, the center sticker should match the face color
    // We'll try 0, 90, 180, 270 degree rotations and pick the best match
    
    const currentFace = FACE_ORDER[currentFaceIndex];
    const expectedCenter = getExpectedCenterColor(currentFace);
    
    // Pre-calculate all 4 rotations
    const rotations = [
        colors, // 0 degrees
        [ // 90 degrees clockwise
            colors[6], colors[3], colors[0],
            colors[7], colors[4], colors[1],
            colors[8], colors[5], colors[2]
        ],
        [ // 180 degrees
            colors[8], colors[7], colors[6],
            colors[5], colors[4], colors[3],
            colors[2], colors[1], colors[0]
        ],
        [ // 270 degrees clockwise
            colors[2], colors[5], colors[8],
            colors[1], colors[4], colors[7],
            colors[0], colors[3], colors[6]
        ]
    ];
    
    // Find rotation where center matches expected
    for (let i = 0; i < rotations.length; i++) {
        if (rotations[i][4].name === expectedCenter) {
            return rotations[i];
        }
    }
    
    // If no match, return original
    return colors;
}

function getExpectedCenterColor(face) {
    const centerColors = {
        'U': 'W', // Up = White
        'R': 'R', // Right = Red
        'F': 'G', // Front = Green
        'D': 'Y', // Down = Yellow
        'L': 'O', // Left = Orange
        'B': 'B'  // Back = Blue
    };
    return centerColors[face] || 'W';
}

function showCorrectionModal(colors) {
    const currentFace = FACE_ORDER[currentFaceIndex];
    document.getElementById('correction-face-name').textContent = FACE_NAMES[currentFace];
    
    // Create correction grid
    correctionGrid.innerHTML = '';
    colors.forEach((color, index) => {
        const cell = document.createElement('div');
        cell.className = 'correction-cell';
        cell.style.backgroundColor = `#${color.hex.toString(16).padStart(6, '0')}`;
        cell.dataset.index = index;
        cell.dataset.colorName = color.name;
        cell.addEventListener('click', () => selectCell(cell));
        correctionGrid.appendChild(cell);
    });
    
    // Create color palette
    colorPalette.innerHTML = '';
    STANDARD_COLORS.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = `#${color.hex.toString(16).padStart(6, '0')}`;
        swatch.dataset.colorName = color.name;
        swatch.dataset.colorHex = color.hex;
        swatch.addEventListener('click', () => applyColorToSelected(color));
        colorPalette.appendChild(swatch);
    });
    
    scannerModal.classList.add('hidden');
    correctionModal.classList.remove('hidden');
}

let selectedCell = null;

function selectCell(cell) {
    if (selectedCell) {
        selectedCell.classList.remove('selected');
    }
    selectedCell = cell;
    cell.classList.add('selected');
}

function applyColorToSelected(color) {
    if (!selectedCell) {
        // Apply to first cell by default
        selectedCell = correctionGrid.children[0];
    }
    
    selectedCell.style.backgroundColor = `#${color.hex.toString(16).padStart(6, '0')}`;
    selectedCell.dataset.colorName = color.name;
    
    // Move to next cell
    const index = parseInt(selectedCell.dataset.index);
    if (index < 8) {
        selectedCell.classList.remove('selected');
        selectedCell = correctionGrid.children[index + 1];
        selectedCell.classList.add('selected');
    }
}

function confirmCorrection() {
    // Get corrected colors
    const correctedColors = [];
    for (let i = 0; i < 9; i++) {
        const cell = correctionGrid.children[i];
        const colorName = cell.dataset.colorName;
        const color = STANDARD_COLORS.find(c => c.name === colorName);
        correctedColors.push(color);
    }
    
    // Store the face
    const currentFace = FACE_ORDER[currentFaceIndex];
    scannedFaces[currentFace] = correctedColors;
    
    // Move to next face or finish
    currentFaceIndex++;
    selectedCell = null;
    
    if (currentFaceIndex < FACE_ORDER.length) {
        // Continue to next face
        correctionModal.classList.add('hidden');
        scannerModal.classList.remove('hidden');
        updateScannerUI();
    } else {
        // All faces scanned, show export
        correctionModal.classList.add('hidden');
        closeScanner();
        showExportModal();
    }
}

function recaptureFace() {
    selectedCell = null;
    correctionModal.classList.add('hidden');
    scannerModal.classList.remove('hidden');
}

function showExportModal() {
    // Generate thumbnail
    generateThumbnail();
    
    // Generate Kociemba string
    const kociembaString = generateKociembaString();
    const input = document.getElementById('export-string');
    input.value = kociembaString;
    input.classList.remove('invalid');
    
    // Add input validation
    input.addEventListener('input', validateKociembaString);
    
    exportModal.classList.remove('hidden');
}

function validateKociembaString() {
    const input = document.getElementById('export-string');
    const value = input.value.toUpperCase();
    const validChars = /^[ROWYG B]*$/;
    const isValid = value.length === 54 && validChars.test(value);
    
    if (isValid) {
        input.classList.remove('invalid');
    } else {
        input.classList.add('invalid');
    }
    
    return isValid;
}

function generateThumbnail() {
    const canvas = document.getElementById('export-thumbnail');
    const ctx = canvas.getContext('2d');
    const cellSize = 30;
    const padding = 10;
    
    // Clear canvas
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw faces in cross pattern
    const layout = [
        { face: 'U', x: 3, y: 0 },
        { face: 'L', x: 0, y: 3 },
        { face: 'F', x: 3, y: 3 },
        { face: 'R', x: 6, y: 3 },
        { face: 'B', x: 9, y: 3 },
        { face: 'D', x: 3, y: 6 }
    ];
    
    layout.forEach(({ face, x, y }) => {
        const colors = scannedFaces[face] || Array(9).fill(STANDARD_COLORS[0]);
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const color = colors[row * 3 + col];
                ctx.fillStyle = `#${color.hex.toString(16).padStart(6, '0')}`;
                const px = padding + (x + col) * cellSize;
                const py = padding + (y + row) * cellSize;
                ctx.fillRect(px, py, cellSize - 2, cellSize - 2);
            }
        }
        
        // Draw face label
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.fillText(face, padding + x * cellSize + cellSize, padding + y * cellSize - 5);
    });
}

function generateKociembaString() {
    // Kociemba format: UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB
    // Each face contributes 9 characters
    let str = '';
    FACE_ORDER.forEach(face => {
        const colors = scannedFaces[face] || Array(9).fill(STANDARD_COLORS[0]);
        colors.forEach(color => {
            str += color.name;
        });
    });
    return str;
}

async function copyKociembaString() {
    const input = document.getElementById('export-string');
    const text = input.value;
    
    try {
        // Try modern Clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            alert('Copied to clipboard!');
        } else {
            // Fallback for older browsers
            input.select();
            document.execCommand('copy');
            alert('Copied to clipboard!');
        }
    } catch (err) {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard. Please copy manually.');
    }
}

function applyToCube() {
    // Validate the Kociemba string
    if (!validateKociembaString()) {
        alert('Invalid Kociemba string! Must be exactly 54 characters using only R, O, W, Y, G, B.');
        return;
    }
    
    // Get the Kociemba string from input (may be manually edited)
    const input = document.getElementById('export-string');
    const kociembaString = input.value.toUpperCase();
    
    // Parse the Kociemba string and apply colors to the 3D cube
    // Format: UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB
    let stringIndex = 0;
    
    FACE_ORDER.forEach((face) => {
        // Map face to material index
        const materialIndexMap = {
            'U': 2, // Top
            'D': 3, // Bottom
            'F': 4, // Front
            'B': 5, // Back
            'R': 0, // Right
            'L': 1  // Left
        };
        
        const matIndex = materialIndexMap[face];
        
        // Get cubies for this face
        const faceCubies = getCubiesForFace(face);
        
        // Apply colors from the Kociemba string
        faceCubies.forEach((cubie, index) => {
            if (stringIndex < kociembaString.length && cubie && cubie.material[matIndex]) {
                const colorChar = kociembaString[stringIndex];
                const color = STANDARD_COLORS.find(c => c.name === colorChar);
                if (color) {
                    cubie.material[matIndex].color.setHex(color.hex);
                }
                stringIndex++;
            }
        });
    });
    
    // Clear move history
    moveHistory.length = 0;
    
    alert('Colors applied to 3D cube! You can continue editing the Kociemba string and re-apply.');
}

function getCubiesForFace(face) {
    const epsilon = 0.1;
    const offset = CUBE_SIZE + SPACING;
    
    let filter, sorter;
    
    switch (face) {
        case 'U': // Top (y=1)
            filter = c => {
                const pos = new THREE.Vector3();
                c.getWorldPosition(pos);
                return Math.abs(pos.y - offset) < epsilon;
            };
            sorter = (a, b) => {
                const posA = new THREE.Vector3(); a.getWorldPosition(posA);
                const posB = new THREE.Vector3(); b.getWorldPosition(posB);
                const dz = posB.z - posA.z;
                if (Math.abs(dz) > epsilon) return dz;
                return posA.x - posB.x;
            };
            break;
        case 'D': // Bottom (y=-1)
            filter = c => {
                const pos = new THREE.Vector3();
                c.getWorldPosition(pos);
                return Math.abs(pos.y + offset) < epsilon;
            };
            sorter = (a, b) => {
                const posA = new THREE.Vector3(); a.getWorldPosition(posA);
                const posB = new THREE.Vector3(); b.getWorldPosition(posB);
                const dz = posA.z - posB.z;
                if (Math.abs(dz) > epsilon) return dz;
                return posA.x - posB.x;
            };
            break;
        case 'F': // Front (z=1)
            filter = c => {
                const pos = new THREE.Vector3();
                c.getWorldPosition(pos);
                return Math.abs(pos.z - offset) < epsilon;
            };
            sorter = (a, b) => {
                const posA = new THREE.Vector3(); a.getWorldPosition(posA);
                const posB = new THREE.Vector3(); b.getWorldPosition(posB);
                const dy = posB.y - posA.y;
                if (Math.abs(dy) > epsilon) return dy;
                return posA.x - posB.x;
            };
            break;
        case 'B': // Back (z=-1)
            filter = c => {
                const pos = new THREE.Vector3();
                c.getWorldPosition(pos);
                return Math.abs(pos.z + offset) < epsilon;
            };
            sorter = (a, b) => {
                const posA = new THREE.Vector3(); a.getWorldPosition(posA);
                const posB = new THREE.Vector3(); b.getWorldPosition(posB);
                const dy = posB.y - posA.y;
                if (Math.abs(dy) > epsilon) return dy;
                return posB.x - posA.x;
            };
            break;
        case 'R': // Right (x=1)
            filter = c => {
                const pos = new THREE.Vector3();
                c.getWorldPosition(pos);
                return Math.abs(pos.x - offset) < epsilon;
            };
            sorter = (a, b) => {
                const posA = new THREE.Vector3(); a.getWorldPosition(posA);
                const posB = new THREE.Vector3(); b.getWorldPosition(posB);
                const dy = posB.y - posA.y;
                if (Math.abs(dy) > epsilon) return dy;
                return posB.z - posA.z;
            };
            break;
        case 'L': // Left (x=-1)
            filter = c => {
                const pos = new THREE.Vector3();
                c.getWorldPosition(pos);
                return Math.abs(pos.x + offset) < epsilon;
            };
            sorter = (a, b) => {
                const posA = new THREE.Vector3(); a.getWorldPosition(posA);
                const posB = new THREE.Vector3(); b.getWorldPosition(posB);
                const dy = posB.y - posA.y;
                if (Math.abs(dy) > epsilon) return dy;
                return posA.z - posB.z;
            };
            break;
    }
    
    return cubies.filter(filter).sort(sorter);
}

function closeExport() {
    exportModal.classList.add('hidden');
}

// --- Scanner End ---
