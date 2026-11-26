// import * as THREE from "three";
import * as THREE from "../lib/three.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
// import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MMDLoader } from "three/addons/loaders/MMDLoader.js";
// import { MMDLoader } from "../lib/MMDLoader.js";

import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { ColorCorrectionShader } from "three/addons/shaders/ColorCorrectionShader.js";
// import { distance } from "three/src/nodes/math/MathNode.js";

const DEFAULTS = {
    backgroundColor: "#919191",

    cameraPosition: [0, 1, 4],
    cameraTarget: [0, 1, 0],

    light: {
        distance: 20,
        intensity: 3,
        horizontal: 0,
        vertical: 7,
        ambientIntensity: 0.1,

        fillIntensity: 0,
        fillPosition: [0, -1, -2],

        rimIntensity: 0,
        rimPower: 4,
        rimColor: "#004cff",
    },

    matConfig: {
        disable_sph: true,
        use_custom_color: true,
        diffuse: [1, 1, 1],
        specular: [0, 0, 0],
        ambient: [0, 0, 0],
        emissive_factor: 1.0,
        shininess: 30,
    }
};

const viewport = document.getElementById("modelViewport");
const modelList = document.getElementById("modelList");
const materialList = document.getElementById("materialList");
const searchInput = document.getElementById("modelSearch");
const showAllButton = document.getElementById("showAllMaterials");
const reverseButton = document.getElementById("reverseMaterials");
const loadingElement = document.getElementById("viewerLoading");
const emptyElement = document.getElementById("viewerEmpty");
const pinnedBar = document.getElementById("pinnedBar");

const pinnedModels = new Map();
let pipPinnedBar = null;
const PINNED_MODELS_COOKIE = "pinnedModels";
const PINNED_MODELS_MAX_AGE = 60 * 60 * 24 * 30;

// PANEL RESIZING

const root = document.documentElement;
const sidebar = document.getElementById("modelSidebar");
const verticalResizeHandle =  document.getElementById( "verticalResizeHandle");
const horizontalResizeHandle = document.getElementById("horizontalResizeHandle");

// VIEWER CTRL

const downloadButton = document.getElementById("downloadButton");

const backgroundColorPicker = document.getElementById("backgroundColor");
backgroundColorPicker.value = DEFAULTS.backgroundColor;

const resetCameraButton = document.getElementById("resetCamera");
const resetLightButton = document.getElementById("resetLightButton");

const lightSettings = document.getElementById("lightSettings");
const lightPanel = document.getElementById("lightPanel");

const lightDistance = document.getElementById("lightDistance");
const lightDistanceValue = document.getElementById("lightDistanceValue");

const lightIntensity = document.getElementById("lightIntensity");
const lightIntensityValue = document.getElementById("lightIntensityValue");

const lightHorizontal = document.getElementById("lightHorizontal");
const lightHorizontalValue = document.getElementById("lightHorizontalValue");

const lightVertical =document.getElementById("lightVertical");
const lightVerticalValue = document.getElementById("lightVerticalValue");

const ambientLight = document.getElementById("ambientLight");
const ambientLightValue = document.getElementById("ambientLightValue");

const rimColor = document.getElementById("rimColor");
const rimColorValue = document.getElementById("rimColorValue");
const rimIntensity = document.getElementById("rimIntensity");
const rimIntensityValue = document.getElementById("rimIntensityValue");
const rimPower = document.getElementById("rimPower");
const rimPowerValue = document.getElementById("rimPowerValue");


let topics = [];
let allModels = [];

// THREE.JS
let scene;
let camera;
let renderer;
let controls;

let hemisphereLight;
let directionalLight;

let currentModel = null;
let currentMaterials = [];
let previousMaterialVisibility = new Map();

let fillLight;
const rimShaderUniforms = {
    uRimColor: {
        value: new THREE.Color(DEFAULTS.light.rimColor)
    },
    uRimIntensity: {
        value: DEFAULTS.light.rimIntensity
    },
    uRimPower: {
        value: DEFAULTS.light.rimPower
    }
};

async function loadData() {

    try {
        const data = await fetchData();
        buildModelData(data);

        renderModelList();
        loadPinnedModels();
        renderPinnedBars();
        checkUrlParams();

    } catch (error) {
        console.error("Failed to load model data:", error);

        modelList.innerHTML =
            `<div class="alt-text viewer-empty">
                Failed to load model data.
            </div>`;
    }
}

function applyRimShader(material) {
    // ref https://threejsroadmap.com/blog/rim-lighting-shader
    const previousOnBeforeCompile = material.onBeforeCompile;
    material.onBeforeCompile = function(shader, renderer) {

        previousOnBeforeCompile?.call(this, shader, renderer);
        shader.uniforms.uRimColor = rimShaderUniforms.uRimColor;
        shader.uniforms.uRimPower = rimShaderUniforms.uRimPower;
        shader.uniforms.uRimIntensity = rimShaderUniforms.uRimIntensity;

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `
            #include <common>
            uniform vec3 uRimColor;
            uniform float uRimPower;
            uniform float uRimIntensity;
            `
        );
        const marker = '#include <emissivemap_fragment>';

        if (!shader.fragmentShader.includes(marker)) {
            console.warn(
                'Rim shader injection failed:',
                material.name,
                'emissivemap_fragment not found'
            );
            return;
        }
        // View-dependent Fresnel
        shader.fragmentShader = shader.fragmentShader.replace(
            marker,
            `
            ${marker}
            float rimDot = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);

            float rim = 1.0 - rimDot;
            rim = pow(rim, uRimPower);

            totalEmissiveRadiance += uRimColor * rim * uRimIntensity;
            `
        );
    };
    material.customProgramCacheKey = () => 'fresnel-rim';
    material.needsUpdate = true;
}

function configureMMDLoader(loader) {

    const matConfig = DEFAULTS.matConfig;

    const disable_sph = matConfig.disable_sph;
    const use_custom_color = matConfig.use_custom_color;
    const custom_emissive = new THREE.Color().setRGB(...matConfig.ambient);
    const custom_specular = new THREE.Color().setRGB(...matConfig.specular);
    const custom_diffuse = new THREE.Color().setRGB(...matConfig.diffuse);

    const materialBuilder = loader.meshBuilder.materialBuilder;
    const originalBuild = materialBuilder.build;

    materialBuilder.build = function(data, geometry, ...args) {

        data.materials.forEach(material => {
            material.envTextureIndex = -1;
        });
        const materials = originalBuild.call(this, data, geometry, ...args);

        materials.forEach(material => {

            if (disable_sph) {
                material.matcap = null;
            }

            if (use_custom_color) {
                material.emissive.copy(custom_emissive);
                material.specular.copy(custom_specular);
                material.diffuse.copy(custom_diffuse);
            }

            material.emissive.multiplyScalar(matConfig.emissive_factor);

            material.specularMap = null;
            material.envMap = null;
            material.envMapIntensity = 0;

            material.shininess = matConfig.shininess;
            material.reflectivity = 0;

            if ("metalness" in material) {
                material.metalness = 0;
            }
            if ("roughness" in material) {
                material.roughness = 1;
            }
            applyRimShader(material);

            material.needsUpdate = true;
        });

        return materials;
    };

    return loader;
}

async function loadModel(model, selectedCard) {

    if (!model.modelFile) {
        return;
    }

    loadingElement.classList.remove("hidden");
    emptyElement.classList.add("hidden");

    try {
        // const loader = new MMDLoader();
        const loader = configureMMDLoader(new MMDLoader());

        const path = resolveFrontendPath(model.modelFile);
        const modelObj = await loader.loadAsync(path);

        // Store current camera position and target
        const currentCameraPos = camera.position.clone();
        const currentTarget = controls.target.clone();
        const isFirstModel = !currentModel;

        const modelName = `${model.character}_${model.keyname}_v${model.version}` || "modelViewer"
        // console.log(modelName);

        if (currentModel) {
            scene.remove(currentModel);
            disposeObject(currentModel);
            currentModel = null;
        }
        // currentModel = modelObj.scene;
        currentModel = modelObj;
        currentModel.name = modelName;

        scene.add(currentModel);
        collectMaterials(currentModel, getModelKey(model));

        renderMaterialList();

        // Only frame the model if it's the first model
        if (isFirstModel) {
            frameModel(currentModel);
        } else {
            // Restore camera position
            camera.position.copy(currentCameraPos);
            controls.target.copy(currentTarget);
            controls.update();
            
            // Update light target for the new model
            if (directionalLight) {
                const box = new THREE.Box3().setFromObject(currentModel);
                const center = box.getCenter(new THREE.Vector3());
                directionalLight.target.position.copy(center);
                directionalLight.target.updateMatrixWorld();
            }
        }

        document
            .querySelectorAll(".model-card.selected")
            .forEach(
                card =>
                    card.classList.remove(
                        "selected"
                    )
            );

        if (selectedCard) {
            selectedCard.classList.add("selected");
        }
        
        if (model.character && model.keyname) {
            updateUrlParams(
                model.character,
                model.keyname,
                model.version
            );
        }

    } catch (error) {
        window.showToast(viewport, "", `Failed to load model:\n${model.modelFile}`, "error");
        console.error("Failed to load model:", error);

    } finally {
        loadingElement.classList.add("hidden");
    }
}

function renderMaterialList() {
    materialList.innerHTML = "";

    if (currentMaterials.length === 0) {

        materialList.innerHTML =
            `<div class="alt-text viewer-empty">
                No materials
            </div>`;

        return;
    }

    for (const material of currentMaterials) {

        const item = document.createElement("button");
        item.type = "button";
        item.className = "material-item";

        if (!material.visible) {
            item.classList.add("hidden-material");
        }

        const visibility =document.createElement("span");
        visibility.className = "material-visibility";

        visibility.innerHTML = getEyeIcon(material.visible);

        visibility.addEventListener("click", event => {

                event.stopPropagation();
                toggleMaterial(material);

            }
        );

        const name = document.createElement("span");
        name.className = "material-name";
        name.textContent =
            material.name ||
            "Unnamed Material";

        item.appendChild(visibility);

        item.appendChild(name);

        item.addEventListener("click", () => {
                toggleMaterial(material);
            }
        );
        materialList.appendChild(item);
    }
}

function showAllMaterials() {
    // Show all materials
    for (const material of currentMaterials) {
        material.visible = true;
    }

    // Update state: everything is visible, nothing is hidden
    materialStates.visible = new Set(currentMaterials.map(m => m.uuid));
    materialStates.hidden = new Set();

    saveCurrentMaterialVisibility();
    renderMaterialList();
}

function getEyeIcon(visible) {

    if (visible) {
        return `
            <span class="material-symbols-outlined">visibility</span>
        `;
    }

    return `
        <span class="material-symbols-outlined">visibility_off</span>
    `;
}

const materialVisibilityByModel = new Map();

let currentModelVisibilityKey = null;
let currentMaterialKeys = new Map();

// switch hide-unhide
let materialStates = {
    visible: new Set(),
    hidden: new Set()
};


function toggleMaterial(material) {
    if (!material) {
        return;
    }
    // Toggle visibility
    material.visible = !material.visible;

    // Update state sets
    const uuid = material.uuid;
    if (material.visible) {
        materialStates.visible.add(uuid);
        materialStates.hidden.delete(uuid);
    } else {
        materialStates.hidden.add(uuid);
        materialStates.visible.delete(uuid);
    }
    saveCurrentMaterialVisibility();
    renderMaterialList();
}

function collectMaterials(object, modelKey) {

    currentMaterials = [];
    previousMaterialVisibility = new Map();
    currentMaterialKeys = new Map();
    const materialMap = new Map();

    object.traverse(child => {
        if (!child.isMesh) return;

        const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];

        for (const material of materials) {
            if (!material) continue;
            if (!materialMap.has(material.uuid)) {
                materialMap.set(material.uuid, material);
            }
        }
    });

    currentMaterials = Array.from(materialMap.values());

    currentModelVisibilityKey = modelKey;
    const savedVisibility = materialVisibilityByModel.get(modelKey);

    materialStates.visible = new Set();
    materialStates.hidden = new Set();

    // Handle materials with dupe names
    const nameCounts = new Map();

    for (const material of currentMaterials) {

        const name = material.name || "Unnamed Material";

        const occurrence = nameCounts.get(name) || 0;
        nameCounts.set(name, occurrence + 1);

        const materialKey = `${name}::${occurrence}`;

        currentMaterialKeys.set(material.uuid, materialKey);

        if (savedVisibility?.has(materialKey)) {
            material.visible = savedVisibility.get(materialKey);
        }

        previousMaterialVisibility.set(
            material.uuid,
            material.visible
        );

        if (material.visible) {
            materialStates.visible.add(material.uuid);
        } else {
            materialStates.hidden.add(material.uuid);
        }
    }

    saveCurrentMaterialVisibility();
}

function saveCurrentMaterialVisibility() {
    if (!currentModelVisibilityKey) return;
    const visibilityMap = new Map();

    for (const material of currentMaterials) {
        const key = currentMaterialKeys.get(material.uuid);

        if (key !== undefined) {
            visibilityMap.set(key, material.visible);
        }
    }
    materialVisibilityByModel.set(
        currentModelVisibilityKey,
        visibilityMap
    );
}

function reverseMaterials() {
    if (currentMaterials.length === 0) {
        return;
    }

    // Safety check - if states are empty, rebuild them
    if (materialStates.visible.size === 0 && materialStates.hidden.size === 0) {
        for (const material of currentMaterials) {
            if (material.visible) {
                materialStates.visible.add(material.uuid);
            } else {
                materialStates.hidden.add(material.uuid);
            }
        }
        renderMaterialList();
        return;
    }

    // Toggle visibility
    for (const material of currentMaterials) {
        const uuid = material.uuid;
        
        if (materialStates.visible.has(uuid)) {
            material.visible = false;
        } else if (materialStates.hidden.has(uuid)) {
            material.visible = true;
        }
    }

    // Swap the sets
    const temp = materialStates.visible;
    materialStates.visible = materialStates.hidden;
    materialStates.hidden = temp;

    saveCurrentMaterialVisibility();
    renderMaterialList();
}

// NOTE: LIGHT SETTINGS
let distanceLight = DEFAULTS.light.distance;

const defaultCameraPosition = new THREE.Vector3(...DEFAULTS.cameraPosition);

const defaultCameraTarget = new THREE.Vector3(...DEFAULTS.cameraTarget);

function updateDirectionalLight() {

    if (!directionalLight ||
        !lightHorizontal ||
        !lightVertical ||
        !lightDistance 
    ) {
        return;
    }
    const distance = distanceLight;

    const horizontal = THREE.MathUtils.degToRad(Number(lightHorizontal.value));
    const vertical = THREE.MathUtils.degToRad(Number(lightVertical.value));

    /*
     Convert spherical coordinates into XYZ position.
     
     Horizontal: Rotate around the model.
     Vertical: Move above / below the model.
     */

    const x =
        distance *
        Math.cos(vertical) *
        Math.sin(horizontal);

    const y =
        distance *
        Math.sin(vertical);

    const z =
        distance *
        Math.cos(vertical) *
        Math.cos(horizontal);


    directionalLight.position.set(x, y, z);

    if (currentModel) {
        const box = new THREE.Box3().setFromObject(currentModel);
        const center = box.getCenter(new THREE.Vector3());
        
        directionalLight.target.position.copy(center);

    } else {
        directionalLight.target.position.set(0, 1, 0);
    }

    directionalLight.target.updateMatrixWorld();
}

function updateDirectionalLightColor() {
    if (!directionalLight || !backgroundColorPicker || !ambientLight) {
        return;
    }

    const backgroundColor = new THREE.Color(backgroundColorPicker.value);
    const white = new THREE.Color(0xffffff);

    const influence = THREE.MathUtils.clamp(Number(ambientLight.value/100), 0, 1);

    directionalLight.color.copy(white).lerp(backgroundColor, influence);
    // const hsl = {};
    // backgroundColor.getHSL(hsl);
    // directionalLight.color.setHSL(
    //     hsl.h * influence,
    //     hsl.s * influence,
    //     directionalLight.intensity/ambientLight.value
    // );
    // console.log("directionalLight", directionalLight.intensity)
    // console.log("rimLight intensity", rimLight.intensity)
}


function updateAmbientColor(color) {
    if (!hemisphereLight) return;
    const bgColor = new THREE.Color(color);

    // Sky
    hemisphereLight.color.copy(bgColor);
    // Ground
    hemisphereLight.groundColor.copy(bgColor).multiplyScalar(0.4);
}

function updaterimIntensity(value) {
    rimShaderUniforms.uRimIntensity.value = Number(value);
}

function updaterimColor(color) {
    rimShaderUniforms.uRimColor.value.set(color);
}

function updaterimPower(value) {
    rimShaderUniforms.uRimPower.value = Number(value);
}

rimColor.addEventListener('input', function(e) {
  var hue = ((this.value/100)*360).toFixed(0)
  var hsl = "hsl("+ hue + ", 100%, 50%)"
  rimColor.style.color = hsl
  rimColorValue.style.color = hsl
  rimColorValue.innerHTML = hsl

  updaterimColor(hsl)
});

// INITIALIZE LIGHTS
function setupMMDLighting() {
    fillLight = new THREE.DirectionalLight(0xffffff, 1);
    scene.add(fillLight);

    resetLighting();
}

function resetLighting() {
    if (!directionalLight || !hemisphereLight) return;

    const defaults = DEFAULTS.light;

    distanceLight = defaults.distance;

    // Main directional light
    directionalLight.color.setHex(0xffffff);
    directionalLight.intensity = defaults.intensity;
    directionalLight.castShadow = false;

    // Ambient light
    hemisphereLight.intensity = defaults.ambientIntensity;
    updateAmbientColor(backgroundColorPicker.value || DEFAULTS.backgroundColor);

    if (fillLight) {
        fillLight.intensity = defaults.fillIntensity;
        fillLight.position.fromArray(defaults.fillPosition);
        fillLight.color.setHex(0xffffff);
    }

    const { h, s, l } = tinycolor(defaults.rimColor).toHsl();
    rimColor.value = ((h/360)*100).toFixed(0);

    var event = new Event('input');
    rimColor.dispatchEvent(event);


    lightDistance.value = String(defaults.distance);
    lightDistanceValue.textContent = defaults.distance.toFixed(2);

    lightIntensity.value = String(defaults.intensity);
    lightIntensityValue.textContent = defaults.intensity.toFixed(2);

    lightHorizontal.value = String(defaults.horizontal);
    lightHorizontalValue.textContent = `${defaults.horizontal}°`;

    lightVertical.value = String(defaults.vertical);
    lightVerticalValue.textContent = `${defaults.vertical}°`;

    ambientLight.value = String(defaults.ambientIntensity);
    ambientLightValue.textContent = defaults.ambientIntensity.toFixed(2);

    rimIntensity.value = String(defaults.rimIntensity);
    rimIntensityValue.textContent = defaults.rimIntensity.toFixed(2);
    
    rimPower.value = String(defaults.rimPower);
    rimPowerValue.textContent = defaults.rimPower.toFixed(2);

    updateDirectionalLight();
    updateDirectionalLightColor();

    updaterimIntensity(defaults.rimIntensity);
    updaterimPower(defaults.rimPower);
    updaterimColor(defaults.rimColor);
}

function resetCamera() {
    if (!camera || !controls) return;

    if (currentModel) {
        camera.position.copy(defaultCameraPosition);
        camera.quaternion.identity();

        frameModel(currentModel);
    } else {
        camera.position.copy(defaultCameraPosition);
        controls.target.copy(defaultCameraTarget);
        controls.update();
    }
}

function resetBackground() {
    const color = DEFAULTS.backgroundColor;

    scene.background.set(color);
    backgroundColorPicker.value = color;

    updateAmbientColor(color);
}

// LIGHT PANEL

if (lightSettings && lightPanel) {

    lightSettings.addEventListener("click", () => {
        lightSettings.classList.toggle("clicked");
        lightPanel.classList.toggle("open");
        }
    );
}

// LIGHT CTRL
if (lightDistance) {
    lightDistance.addEventListener("input", event => {
        distanceLight = Number(event.target.value);
        if (lightDistanceValue) {
            lightDistanceValue.textContent = `${distanceLight}`;
        }
        updateDirectionalLight();
    });
}
if (lightIntensity) {
    lightIntensity.addEventListener("input", event => {

            const value = Number(event.target.value);

            if (directionalLight) {
                directionalLight.intensity = value;
            }
            if (lightIntensityValue) {
                lightIntensityValue.textContent = value.toFixed(2);
            }

        }
    );
}
if (lightHorizontal) {
    lightHorizontal.addEventListener("input", event => {
            const value = Number(event.target.value);

            if (lightHorizontalValue) {
                lightHorizontalValue.textContent = `${value}°`;
            }
            updateDirectionalLight();
        }
    );
}
if (lightVertical) {
    lightVertical.addEventListener("input", event => {

            const value = Number(event.target.value);

            if (lightVerticalValue) {
                lightVerticalValue.textContent = `${value}°`;
            }
            updateDirectionalLight();
        }
    );
}
if (ambientLight) {
    ambientLight.addEventListener("input", event => {

            const value = Number(event.target.value);

            // if (hemisphereLight) {
            //     hemisphereLight.intensity = value;
            // }
            if (ambientLightValue) {
                ambientLightValue.textContent = value.toFixed(2);
            }
            updateDirectionalLightColor();
        }
    );
}
if (rimIntensity) {
    rimIntensity.addEventListener("input", event => {

            const value = Number(event.target.value);
            if (rimIntensityValue) {
                rimIntensityValue.textContent = value.toFixed(2);
            }
            updaterimIntensity(value);
        }
    );
}
if (rimPower) {
    rimPower.addEventListener("input", event => {

            const value = Number(event.target.value);
            if (rimPowerValue) {
                rimPowerValue.textContent = value.toFixed(2);
            }
            updaterimPower(value);
        }
    );
}

if (backgroundColorPicker) {
    backgroundColorPicker.addEventListener("input", event => {
            if (!scene) return;
            const color = event.target.value;
            scene.background.set(color);
            updateAmbientColor(color);
            updateDirectionalLightColor();
        }
    );
}

function recreateOrbitControls(target = controls?.target.clone() ?? defaultCameraTarget.clone()) {
    if (controls) {
        controls.dispose();
        controls = null;
    }

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.copy(target);
    controls.maxPolarAngle = Math.PI / 1.8;
    controls.update();
}

// NOTE: INIT THREE

let composer;
let colorCorrectionPass;

function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(DEFAULTS.backgroundColor);


    camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    camera.position.copy(defaultCameraPosition);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    // renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;

    viewport.appendChild(renderer.domElement);

    renderer.domElement.tabIndex = 0;
    renderer.domElement.addEventListener("pointerdown", () => {
        renderer.domElement.focus({ preventScroll: true });
    });

    // POST-PROCESSING

    colorCorrectionPass = new ShaderPass(ColorCorrectionShader);
    // R, G, B
    colorCorrectionPass.uniforms['powRGB'].value = new THREE.Vector3(
        0.6,
        0.6,
        0.6
    );
    colorCorrectionPass.uniforms['mulRGB'].value = new THREE.Vector3(
        1.0,
        1.0,
        1.0
    );
    colorCorrectionPass.uniforms['addRGB'].value = new THREE.Vector3(
        0.0,
        0.0,
        0.0
    );
    
    const renderPass = new RenderPass(scene, camera);

    composer = new EffectComposer(renderer);
    composer.passes = [];
    
    composer.addPass(renderPass);
    composer.addPass(colorCorrectionPass);

    // Controls
    recreateOrbitControls(defaultCameraTarget);

    // Lights
    hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2);
    scene.add(hemisphereLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, 3);
    scene.add(directionalLight);
    scene.add(directionalLight.target);

    // updateDirectionalLight();
    setupMMDLighting();

    window.addEventListener("resize", resizeViewer);
    resizeViewer();
    animate();
}


// NOTE: RESIZE VIEWER
function resizeViewer() {
    if (!renderer || !camera) return;

    const canvas = renderer.domElement;
    const host = canvas.parentElement || viewport;

    const width = host.clientWidth;
    const height = host.clientHeight;

    if (width <= 0 || height <= 0) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height, false);

    if (composer) {
        composer.setSize(width, height);
    }
}

function animate() {
    requestAnimationFrame(animate);

    if (controls) {
        controls.update();
    }

    if (composer) {
        composer.render();
    } else if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
    // if (renderer && scene && camera) {
    //     renderer.render(scene, camera);
    // }
}

function frameModel(object) {

    const box = new THREE.Box3().setFromObject(object);

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxSize =
        Math.max(
            size.x,
            size.y,
            size.z
        );

    if (!isFinite(maxSize) || maxSize <= 0) return;

    // Update light target
    if (directionalLight) {
        directionalLight.target.position.copy(center);
        directionalLight.target.updateMatrixWorld();
    }

    const distance =
        maxSize /
        (
            2 *
            Math.tan(
                THREE.MathUtils.degToRad(
                    camera.fov / 2
                )
            )
        );

    const direction = new THREE.Vector3(0, 0, 1);

    direction.applyQuaternion(camera.quaternion);

    camera.position.copy(center);
    camera.position.add(direction.multiplyScalar(distance * 1.4));
    // Orbit target
    controls.target.copy(center);
    // Camera clipping
    camera.near =
        Math.max(
            maxSize / 1000,
            0.001
        );
    camera.far =
        Math.max(
            maxSize * 100,
            1000
        );

    camera.updateProjectionMatrix();
    controls.update();
}

async function saveViewportImage(transparent = true, scale = 2, output = "download") {
    if (!renderer || !scene || !camera || !currentModel) return;

    const originalSize = renderer.getSize(new THREE.Vector2());
    const originalPixelRatio = renderer.getPixelRatio();
    const originalComposerPixelRatio = composer?.getPixelRatio?.() ?? 1;

    const width = Math.round(renderer.domElement.width * scale);
    const height = Math.round(renderer.domElement.height * scale);

    const previousBackground = scene.background;
    const previousClearColor = renderer.getClearColor(new THREE.Color());
    const previousClearAlpha = renderer.getClearAlpha();

    let clipboardWritePromise = null;

    try {
        if (transparent) {
            scene.background = null;
            renderer.setClearColor(0x000000, 0);
        }

        renderer.setPixelRatio(1);
        renderer.setSize(width, height, false);

        if (composer) {
            composer.setPixelRatio(1);
            composer.setSize(width, height);
            composer.render();
        } else {
            renderer.render(scene, camera);
        }

    // Gen PNG
    if (output === "clipboard") {
        if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
            throw new Error("Clipboard image API is not supported :(");
        }

        const blobPromise = new Promise((resolve, reject) => {
            renderer.domElement.toBlob(blob => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("Failed to generate PNG."));
                }
            }, "image/png");
        });

        clipboardWritePromise = navigator.clipboard.write([
            new ClipboardItem({
                "image/png": blobPromise
            })
        ]);

    } else if (output === "download") {
        renderer.domElement.toBlob(blob => {
            if (!blob) {
                console.error("Failed to export viewport image.");
                return;
            }
            const url = URL.createObjectURL(blob);

            const timestamp = new Date()
                .toLocaleString("sv-SE", { hour12: false })
                .replace(/[-: ]/g, "")
                .replace(",", "_");

            const safeName = `${currentModel.name}_${timestamp}`.replace(/[<>:"/\\|?*]/g, "_");

            const link = document.createElement("a");
            link.href = url;
            link.download = `${safeName}.png`;
            link.click();

            setTimeout(() => URL.revokeObjectURL(url), 1000);

        }, "image/png");
    }

    } catch (error) {
        console.error("Failed to save viewport image:", error);
    } finally {
        renderer.setPixelRatio(originalPixelRatio);
        renderer.setSize(originalSize.x, originalSize.y, false);

        if (composer) {
            composer.setPixelRatio(originalComposerPixelRatio);
            composer.setSize(originalSize.x, originalSize.y);
        }
        
        scene.background = previousBackground;
        renderer.setClearColor(previousClearColor, previousClearAlpha);
    }

    if (clipboardWritePromise) {
        try {
            await clipboardWritePromise;
            console.log("image copied");
            window.showToast(viewport, "content_copy", "Copied to clipboard");

        } catch (error) {
            console.error("Failed to copy viewport image:", error);
            window.showToast(viewport, "", "Failed to copy image to clipboard.", "error");
        }
    }
}

function disposeObject(object) {
    object.traverse(
        child => {
            if (!child.isMesh) return;
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material
            ) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];

                materials.forEach( material => disposeMaterial(material));
            }
        }
    );
}

function disposeMaterial(material) {
    if (!material) return;
    for (const key in material) {

        const value = material[key];

        if (value && value.isTexture) {
            value.dispose();
        }
    }
    material.dispose();
}

function buildModelData(data) {

    allModels = [];
    if (data &&Array.isArray(data.topics)) {

        topics = data.topics;

        for (const topic of topics) {
            if (!Array.isArray(topic.models)) {
                continue;
            }
            const uiIcon = topic.otherImages?.find(
                image => image.category === "UI Icon"
            )?.src || null;


            for (const model of topic.models) {

                allModels.push({
                    ...model,
                    // Parent topic information
                    character: topic.character,
                    keyname: topic.keyname,
                    cn: topic.cn,
                    en: topic.en,
                    source: topic.source,
                    icon: model.icon || uiIcon || null,
                    thumbnail:
                        model.thumbnail ||
                        topic.thumbnail ||
                        null,
                    type: "character"

                });
            }
        }
    }

    // for models that do not have a Topic record yet
    if (data && Array.isArray(data.characterModels)) {
        for (const group of data.characterModels) {
            if (!Array.isArray(group.models)) continue;

            for (const model of group.models) {
                allModels.push({
                    ...model,
                    character: group.character,
                    keyname: group.keyname,
                    cn: null,
                    en: null,
                    source: null,
                    icon: model.icon || null,
                    thumbnail: model.thumbnail || null,
                    type: "character"
                });
            }
        }
    }

    // Qcostume
    if (data && Array.isArray(data.Qcostume)) {

        for (
            const costume of data.Qcostume
        ) {
            allModels.push({
                ...costume,
                character: "Qcostume",
                keyname: costume.name,
                name: costume.name,
                type: "Qcostume"
            });
        }
    }
}

// NOTE: MODEL LIST PANEL

function matchesSearch(model, query) {

    if (!query) {
        return true;
    }
    const searchText = [
        model.character,
        model.keyname,
        model.name,
        model.cn,
        model.en,
        model.source
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return searchText.includes(
        query.toLowerCase()
    );
}

function groupModels(models) {

    const groups = new Map();

    for (const model of models) {

        const groupName =
            model.type === "Qcostume"
                ? "Qcostume"
                : model.character ||
                  "Unknown";

        if (!groups.has(groupName)) {
            groups.set(groupName, []);
        }
        
        groups
            .get(groupName)
            .push(model);
    }
    return groups;
}

function renderModelList() {

    const query = searchInput ? searchInput.value.trim(): "";

    const filteredModels = allModels.filter(model => matchesSearch(model, query));

    modelList.innerHTML = "";

    if (filteredModels.length === 0) {

        modelList.innerHTML =
            `<div class="alt-text viewer-empty">
                No models found.
            </div>`;
        return;
    }

    const groups = groupModels(filteredModels);

    for (const [ groupName, models] of groups) {

        const category = createCategory(groupName, models);

        modelList.appendChild( category);
    }
}

function createCategory(groupName, models) {

    const category = document.createElement("section");
    category.className = "char-category";

// Header
    const header =document.createElement("button");
    header.type = "button";
    header.className = "category-header";

    const arrow = document.createElement("span");
    arrow.className = "category-arrow";
    arrow.textContent = "▼";


    const title = document.createElement("span");
    title.textContent = groupName;

    header.appendChild(arrow);
    header.appendChild(title);

    header.addEventListener("click", () => {
        
        category.classList.toggle("collapsed");
        header.scrollIntoView()
        }
    );

// Content
    const content = document.createElement("div");
    content.className = "category-content";

    for (const model of models) {

        const card = createModelCard(model);
        content.appendChild(card);
    }

    category.appendChild(header);
    category.appendChild(content);

    return category;
}

function createModelCard(model) {

    const card = document.createElement("button");

    card.type ="button";
    card.className = "model-card";

    card.dataset.modelFile = model.modelFile || "";
    card.dataset.pinKey = getModelKey(model);

    // for URL sharing
    card.dataset.character = model.character || "";
    card.dataset.keyname = model.keyname || "";
    card.dataset.version = model.version || "";

// Thumbnail
    if (model.thumbnail) {

        const image = document.createElement("img");
        image.className = "model-thumbnail";
        image.src = new URL(resolveFrontendPath(model.thumbnail), window.location.href).href;
        image.alt =
            model.name ||
            model.keyname ||
            "Model";

        image.loading = "lazy";

        card.appendChild(image);

    } else {

        const placeholder = document.createElement("div");
        placeholder.className = "model-thumbnail-placeholder";
        placeholder.textContent = "No Image";

        card.appendChild(placeholder);
    }

    const name = document.createElement("span");
    name.className = "model-name";

    const displayName =
        model.name ||
        model.keyname ||
        "Model";

    if (
        model.version !== undefined &&
        model.version !== null
    ) {
        name.textContent = `${displayName} v${model.version}`;

    } else {
        name.textContent = displayName;
    }

    card.appendChild(name);

    const pinButton = document.createElement("span");
    pinButton.className = "model-pin-button material-symbols-outlined";
    pinButton.textContent = isModelPinned(model) ? "keep" : "keep";
    pinButton.setAttribute("role", "button");
    pinButton.setAttribute("tabindex", "0");
    pinButton.setAttribute("aria-label", isModelPinned(model) ? "Unpin model" : "Pin model");
    pinButton.setAttribute("title", isModelPinned(model) ? "Unpin model" : "Pin model");
    pinButton.classList.toggle("is-pinned", isModelPinned(model));

    const handlePin = event => {
        event.preventDefault();
        event.stopPropagation();
        togglePinnedModel(model);
    };

    pinButton.addEventListener("click", handlePin);
    pinButton.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") handlePin(event);
    });
    card.appendChild(pinButton);

    card.addEventListener("click", () => {
        if (model.modelFile) loadModel(model, card);
    });
    return card;
}

function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        character: params.get('character'),
        keyname: params.get('keyname'),
        version: params.get('version'),
        from: params.get('from')
    };
}

function updateUrlParams(character, keyname, version) {
    const params = new URLSearchParams();
    
    if (character) {
        params.set('character', character);
    }
    if (keyname) {
        params.set('keyname', keyname);
    }
    if (version) {
        params.set('version', version);
    }
    
    const newUrl = window.location.pathname + '?' + params.toString();
    window.history.pushState({}, '', newUrl);
}

function findModelByParams(character, keyname, version) {
    // Try to find exact match first
    if (character && keyname) {
        // Try with version first
        if (version) {
            const exactMatch = allModels.find(model => 
                model.character === character && 
                model.keyname === keyname && 
                String(model.version) === String(version)
            );
            if (exactMatch) return exactMatch;
        }
        
        // Try without version
        const match = allModels.find(model => 
            model.character === character && 
            model.keyname === keyname
        );
        if (match) return match;
    }
    
    return null;
}

function checkUrlParams() {
    const params = getUrlParams();
    
    if (params.character && params.keyname) {
        const model = findModelByParams(
            params.character,
            params.keyname,
            params.version
        );
        
        if (model) {
            // Find and highlight the card
            const cards = document.querySelectorAll('.model-card');
            let targetCard = null;
            
            for (const card of cards) {
                if (card.dataset.character === params.character && 
                    card.dataset.keyname === params.keyname) {
                    if (params.version) {
                        if (card.dataset.version === params.version) {
                            targetCard = card;
                            break;
                        }
                    } else {
                        targetCard = card;
                        break;
                    }
                }
            }
            if (targetCard) {
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                loadModel(model, targetCard);
            } else {
                loadModel(model, null);
            }
        } else if (params.from === "gallery") {
            emptyElement.textContent = "Coming Soon";
        }
    }
}

function resolveFrontendPath(path) {

    if (!path) {
        return "";
    }
    if (
        path.startsWith("./") ||
        path.startsWith("/") ||
        path.startsWith("http://") ||
        path.startsWith("https://")
    ) {
        return path;
    }

    return `./${path}`;
}


// NOTE: PINS
function getModelKey(model) {
    return [
        model.character || "",
        model.keyname || model.name || "",
        model.version ?? "",
        model.modelFile || ""
    ].join("::");
}

function isModelPinned(model) {
    return pinnedModels.has(getModelKey(model));
}

function togglePinnedModel(model) {
    const key = getModelKey(model);

    if (pinnedModels.has(key)) {
        pinnedModels.delete(key);
    } else {
        pinnedModels.set(key, model);
    }
    savePinnedModels();
    renderPinnedBars();
    updatePinButtons();
}

function clearPinnedModels() {
    pinnedModels.clear();
    savePinnedModels();
    renderPinnedBars();
    updatePinButtons();
}
pinnedBar?.querySelector(".pinned-clear-button")
    ?.addEventListener("click", clearPinnedModels);

function createPinnedBar(container, isPiP = false) {
    if (!container) return null;

    const bar = document.createElement("aside");
    const barClass = isPiP? "scroll-x" : "";
    bar.className = "pinned-bar";
    bar.innerHTML = `
        <div class="pinned-bar-header">
            <button type="button" class="pinned-clear-button">clear all</button>
        </div>
        <div class="pinned-model-list colourScroll ${barClass}" 
            aria-label="Pinned models">
        </div>
    `;

    bar.querySelector(".pinned-clear-button").addEventListener("click", clearPinnedModels);

    if (isPiP){
        const scrollList = bar.querySelector(".scroll-x");
        scrollList.addEventListener('wheel', (event) => {
            // translate scroll it to horizontal
            if (event.deltaY !== 0) {
                event.preventDefault();
                scrollList.scrollLeft += event.deltaY / 1.5;
            }
        });
    }
    container.appendChild(bar);
    return bar;
}

function renderPinnedBar(bar) {
    if (!bar) return;

    const modelsContainer = bar.querySelector(".pinned-model-list");
    const models = Array.from(pinnedModels.values());

    bar.classList.toggle("has-pinned", models.length > 0);
    modelsContainer.innerHTML = "";

    for (const model of models) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "pinned-model-item";
        item.title = [model.name || model.keyname || "Model",
            model.version != null ? `v${model.version}` : ""].filter(Boolean).join(" ");

        const itemImage = model.icon || model.thumbnail;
        const isModelThumb = itemImage?.includes('/thumbnail/') ?? false;

        if (itemImage) {
            const image = document.createElement("img");

            image.src = new URL( resolveFrontendPath(itemImage), window.location.href).href;
            image.alt = item.title;
            image.loading = "lazy";

            if (!model.icon && !isModelThumb) {
                image.className = "non-icon";
            }
            item.appendChild(image);

            if (model.keyname.startsWith("Dye") &&
                !["Orochi", "Tsukuyomi"].includes(model.character)
            ) {
                const dyeName = model.keyname.split("_");
                const altDisplay = document.createElement("span");
                altDisplay.className = "alt-text";
                altDisplay.textContent = dyeName[1] ?? "Dye";

                item.appendChild(altDisplay);
            }
        } else {
            const placeholder = document.createElement("span");
            placeholder.className = "alt-text";
            placeholder.textContent = item.title;
            item.appendChild(placeholder);
        }

        item.addEventListener("click", () => {
            if (model.modelFile) loadModel(model, null);
        });
        modelsContainer.appendChild(item);
    }
}

function renderPinnedBars() {
    renderPinnedBar(pinnedBar);
    renderPinnedBar(pipPinnedBar);
}

function updatePinButtons() {
    document.querySelectorAll(".model-card").forEach(card => {

        const pinButton = card.querySelector(".model-pin-button");

        if (!pinButton) return;

        const isPinned = pinnedModels.has(card.dataset.pinKey);
        pinButton.classList.toggle("is-pinned", isPinned);

        pinButton.setAttribute(
            "aria-label",
            isPinned ? "Unpin model" : "Pin model"
        );
        pinButton.setAttribute(
            "title",
            isPinned ? "Unpin model" : "Pin model"
        );
    });
}

function savePinnedModels() {
    const value = encodeURIComponent(JSON.stringify([...pinnedModels.entries()]));

    document.cookie =
        `${PINNED_MODELS_COOKIE}=${value}; ` +
        `Max-Age=${PINNED_MODELS_MAX_AGE}; ` +
        `Path=/; SameSite = Lax` +
        (location.protocol === "https:" ? "; Secure" : "");
}

function loadPinnedModels() {
    const cookie = document.cookie.split("; ").find(row => row.startsWith(`${PINNED_MODELS_COOKIE}=`));
    if (!cookie) return;

    try {
        const value = cookie.substring(PINNED_MODELS_COOKIE.length + 1);
        const entries = JSON.parse(decodeURIComponent(value));

        if (!Array.isArray(entries)) return;

        pinnedModels.clear();   
        for (const [key, model] of entries) {
            pinnedModels.set(key, model);
        }
    } catch (error) {
        console.warn("Unable to restore pinned models:", error);
        pinnedModels.clear();
    }
}

// NOTE: HORIZONTAL RESIZE
// Sidebar <-> viewer

if (horizontalResizeHandle && sidebar) {

    let resizing = false;
    horizontalResizeHandle.addEventListener("pointerdown", event => {

            event.preventDefault();
            resizing = true;

            horizontalResizeHandle.setPointerCapture(
                event.pointerId
            );
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
        }
    );
    horizontalResizeHandle.addEventListener("pointermove", event => {

            if (!resizing) {
                return;
            }
            const minWidth = 280;
            const maxWidth = Math.floor(window.innerWidth * 0.7);

            const newWidth = Math.max(minWidth, Math.min(event.clientX, maxWidth));

            root.style.setProperty(
                "--sidebar-width",
                `${newWidth}px`
            );

            resizeViewer();
        }
    );
    horizontalResizeHandle.addEventListener("pointerup", event => {

            resizing = false;
            try {
                horizontalResizeHandle.releasePointerCapture(event.pointerId);
            } catch (_) {}

            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            resizeViewer();
        }
    );
    horizontalResizeHandle.addEventListener("pointercancel", () => {

            resizing = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            resizeViewer();
        }
    );
}


// !! VERTICAL RESIZE
// Model list <-> material list

if (verticalResizeHandle &&sidebar) {
    let resizing = false;

    verticalResizeHandle.addEventListener("pointerdown", event => {

            event.preventDefault();
            resizing = true;

            verticalResizeHandle.setPointerCapture(
                event.pointerId
            );

            document.body.style.cursor = "row-resize";
            document.body.style.userSelect = "none";
        }
    );

    verticalResizeHandle.addEventListener("pointermove", event => {
            if (!resizing) return;

            const rect = sidebar.getBoundingClientRect();

            const relativeY = event.clientY - rect.top;

            const minModelHeight = 150;
            const minMaterialHeight = 120;

            const maxModelHeight = rect.height - minMaterialHeight;

            const modelHeight =
                Math.max(
                    minModelHeight,
                    Math.min(relativeY, maxModelHeight)
                );
            const percentage = ( modelHeight / rect.height ) * 100;

            root.style.setProperty(
                "--model-list-height",
                `${percentage}%`
            );
            resizeViewer();
        }
    );

    verticalResizeHandle.addEventListener(
        "pointerup",
        event => {
            resizing = false;
            try {
                verticalResizeHandle.releasePointerCapture(
                    event.pointerId
                );

            } catch (_) {}
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            resizeViewer();
        }
    );

    verticalResizeHandle.addEventListener("pointercancel", () => {

            resizing = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            resizeViewer();
        }
    );
}

// NOTE: EVENTS

searchInput?.addEventListener("input", renderModelList);
resetCameraButton?.addEventListener("click", resetCamera);
resetLightButton?.addEventListener("click", resetLighting);
showAllButton?.addEventListener("click", showAllMaterials);
reverseButton?.addEventListener("click", reverseMaterials);

// save img
window.addEventListener("keydown", event => {
    const isSave = event.code === "KeyS" && event.shiftKey && !event.ctrlKey;
    const isCopy = event.code === "KeyC" && event.ctrlKey && !event.shiftKey;

    if (!currentModel) return;
    if (!isSave && !isCopy) return;
    if (document.activeElement !== renderer?.domElement) return;

    event.preventDefault();

    if (isSave) {
        saveViewportImage(true, 2, "download");
    } else if (isCopy) {
        saveViewportImage(true, 2, "clipboard");
    }
});

downloadButton.addEventListener("click", event => {
    event.preventDefault();
    saveViewportImage(true, 2, "download");
});

// Handle browser back/forward navigation

window.addEventListener('popstate', function(event) {
    const params = getUrlParams();
    if (params.character && params.keyname) {
        const model = findModelByParams(
            params.character,
            params.keyname,
            params.version
        );
        if (model) {
            loadModel(model, null);
        }
    }
});

initThree();
loadData();

let pipViewerStage = null;

window.modelViewerPiPBridge = {
    moveTo(container) {
        const target = controls.target.clone();

        controls.dispose();
        controls = null;

        pipViewerStage = document.createElement("div");
        pipViewerStage.className = "pip-viewer-stage";
        pipViewerStage.appendChild(renderer.domElement);
        container.appendChild(pipViewerStage);

        recreateOrbitControls(target);
        resizeViewer();
    },

    restore() {
        const target = controls.target.clone();

        controls.dispose();
        controls = null;

        viewport.appendChild(renderer.domElement);
        pipViewerStage?.remove();
        pipViewerStage = null;

        recreateOrbitControls(target);
        resizeViewer();
    },

    mountPinnedBar(container) {
        if (pipPinnedBar) pipPinnedBar.remove();
        pipPinnedBar = createPinnedBar(container, true);
        renderPinnedBar(pipPinnedBar);
    },

    unmountPinnedBar() {
        pipPinnedBar?.remove();
        pipPinnedBar = null;
    },

    resize: resizeViewer
};