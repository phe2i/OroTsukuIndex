import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
// import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MMDLoader } from "three/addons/loaders/MMDLoader.js";

import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { ColorCorrectionShader } from "three/addons/shaders/ColorCorrectionShader.js";
// import { distance } from "three/src/nodes/math/MathNode.js";


const originalParseMaterials = MMDLoader.prototype.parseMaterials;

// suppose to override to disable SPH
MMDLoader.prototype.parseMaterials = function(data) {

    const materials = originalParseMaterials.call(this, data);
    

    if (materials && Array.isArray(materials)) {
        materials.forEach(material => {

            if (material.sphMap) {
                material.sphMap = null;
            }
            if (material.specularMap) {
                material.specularMap = null;
            }
            
            material.specular = new THREE.Color(0x000000);
            material.shininess = 0;
            material.envMap = null;
            material.envMapIntensity = 0;
            
            if (material.userData) {
                material.userData.sphEnabled = false;
                // material.userData.toonEnabled = false;
            }
            
            material.needsUpdate = true;
        });
    }
    
    return materials;
};


const DATA_URL = "./data/topics.json";


const viewport = document.getElementById("modelViewport");

const modelList = document.getElementById("modelList");

const materialList = document.getElementById("materialList");

const searchInput = document.getElementById("modelSearch");

const showAllButton = document.getElementById("showAllMaterials");

const revertButton = document.getElementById("revertMaterials");

const loadingElement = document.getElementById("viewerLoading");

const emptyElement = document.getElementById("viewerEmpty");



// PANEL RESIZING

const root =
    document.documentElement;

const sidebar =
    document.getElementById("modelSidebar");

const verticalResizeHandle =
    document.getElementById(
        "verticalResizeHandle"
    );

const horizontalResizeHandle =
    document.getElementById(
        "horizontalResizeHandle"
    );



// VIEWER CTRL

const backgroundColorPicker =
    document.getElementById(
        "backgroundColor"
    );

const resetCameraButton =
    document.getElementById(
        "resetCamera"
    );

const lightSettings =
    document.getElementById(
        "lightSettings"
    );

const lightPanel =
    document.getElementById(
        "lightPanel"
    );

 const lightDistance =
    document.getElementById(
        "lightDistance"
    );

const lightDistanceValue =
    document.getElementById(
        "lightDistanceValue"
    );

const lightIntensity =
    document.getElementById(
        "lightIntensity"
    );

const lightIntensityValue =
    document.getElementById(
        "lightIntensityValue"
    );

const lightHorizontal =
    document.getElementById(
        "lightHorizontal"
    );

const lightHorizontalValue =
    document.getElementById(
        "lightHorizontalValue"
    );

const lightVertical =
    document.getElementById(
        "lightVertical"
    );

const lightVerticalValue =
    document.getElementById(
        "lightVerticalValue"
    );

const ambientLight =
    document.getElementById(
        "ambientLight"
    );

const ambientLightValue =
    document.getElementById(
        "ambientLightValue"
    );



let topics = [];
let allModels = [];

// THREE.JS
let scene;
let camera;
let renderer;
let controls;

let hemisphereLight;
let directionalLight;

let fillLight;
let rimLight;

let currentModel = null;

let currentMaterials = [];

let previousMaterialVisibility =
    new Map();



// LIGHT SETTINGS
// const lightDistance = 20;
let distanceLight = 20;

function updateDirectionalLight() {

    if (
        !directionalLight ||
        !lightHorizontal ||
        !lightVertical ||
        !lightDistance 
    ) {
        return;
    }
    const distance = distanceLight;

    const horizontal =
        THREE.MathUtils.degToRad(
            Number(
                lightHorizontal.value
            )
        );


    const vertical =
        THREE.MathUtils.degToRad(
            Number(
                lightVertical.value
            )
        );


    /*
     * Convert spherical coordinates
     * into XYZ position.
     *
     * Horizontal:
     *     Rotate around the model.
     *
     * Vertical:
     *     Move above / below the model.
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


    directionalLight.position.set(
        x,
        y,
        z
    );




    /*
     * Point the light toward the model.
     *
     * frameModel() will update this
     * to the actual model center.
     */

    if (
        currentModel
    ) {

        const box =
            new THREE.Box3().setFromObject(
                currentModel
            );

        const center =
            box.getCenter(
                new THREE.Vector3()
            );

        directionalLight.target.position.copy(
            center
        );

    } else {

        directionalLight.target.position.set(
            0,
            1,
            0
        );
    }


    directionalLight.target.updateMatrixWorld();
}


// LIGHTING SETUP

function setupMMDLighting() {
    distanceLight = 20;

    directionalLight.position.set(3.5, 5.0, 4.0);
    directionalLight.intensity = 2.5;
    directionalLight.color.setHex(0xFFFFFF);
    directionalLight.castShadow = false;
    
    hemisphereLight.intensity = 0.0;
    hemisphereLight.color.setHex(0xFFFFFF);
    hemisphereLight.groundColor.setHex(0x8888AA);
    
    fillLight = new THREE.DirectionalLight(0xFFFFFF, 0.3);
    fillLight.position.set(0, -1, -2);
    scene.add(fillLight);
    
    rimLight = new THREE.DirectionalLight(0x8888FF, 0.3);
    rimLight.position.set(-2, 1, -6);
    scene.add(rimLight);

    if (lightDistance) {
        lightDistance.value = "20";
        lightDistanceValue.textContent = "20";
    }
    if (lightIntensity) {
        lightIntensity.value = "2.5";
        lightIntensityValue.textContent = "2.50";
    }
    if (lightHorizontal) {
        lightHorizontal.value = "0";
        lightHorizontalValue.textContent = "0°";
    }
    if (lightVertical) {
        lightVertical.value = "22";
        lightVerticalValue.textContent = "22°";
    }
    if (ambientLight) {
        ambientLight.value = "0.0";
        ambientLightValue.textContent = "0.00";
    }
    
    updateDirectionalLight();
}



// LIGHT PANEL

if (
    lightSettings &&
    lightPanel
) {

    lightSettings.addEventListener(
        "click",
        () => {

            lightPanel.classList.toggle(
                "open"
            );

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


if (
    lightIntensity
) {

    lightIntensity.addEventListener(
        "input",
        event => {

            const value =
                Number(
                    event.target.value
                );


            if (
                directionalLight
            ) {

                directionalLight.intensity =
                    value;
            }


            if (
                lightIntensityValue
            ) {

                lightIntensityValue.textContent =
                    value.toFixed(2);
            }

        }
    );
}


// Horizontal

if (
    lightHorizontal
) {

    lightHorizontal.addEventListener(
        "input",
        event => {

            const value =
                Number(
                    event.target.value
                );


            if (
                lightHorizontalValue
            ) {

                lightHorizontalValue.textContent =
                    `${value}°`;
            }


            updateDirectionalLight();
        }
    );
}


// Vertical

if (
    lightVertical
) {

    lightVertical.addEventListener(
        "input",
        event => {

            const value =
                Number(
                    event.target.value
                );


            if (
                lightVerticalValue
            ) {

                lightVerticalValue.textContent =
                    `${value}°`;
            }


            updateDirectionalLight();
        }
    );
}


// Ambient

if (
    ambientLight
) {

    ambientLight.addEventListener(
        "input",
        event => {

            const value =
                Number(
                    event.target.value
                );


            if (
                hemisphereLight
            ) {

                hemisphereLight.intensity =
                    value;
            }


            if (
                ambientLightValue
            ) {

                ambientLightValue.textContent =
                    value.toFixed(2);
            }

        }
    );
}


// !! HORIZONTAL RESIZE
// Sidebar <-> viewer

if (
    horizontalResizeHandle &&
    sidebar
) {

    let resizing = false;


    horizontalResizeHandle.addEventListener(
        "pointerdown",
        event => {

            event.preventDefault();

            resizing = true;


            horizontalResizeHandle.setPointerCapture(
                event.pointerId
            );


            document.body.style.cursor =
                "col-resize";

            document.body.style.userSelect =
                "none";
        }
    );


    horizontalResizeHandle.addEventListener(
        "pointermove",
        event => {

            if (!resizing) {
                return;
            }


            const minWidth = 280;


            const maxWidth =
                Math.floor(
                    window.innerWidth *
                    0.7
                );


            const newWidth =
                Math.max(
                    minWidth,
                    Math.min(
                        event.clientX,
                        maxWidth
                    )
                );


            root.style.setProperty(
                "--sidebar-width",
                `${newWidth}px`
            );


            resizeViewer();
        }
    );


    horizontalResizeHandle.addEventListener(
        "pointerup",
        event => {

            resizing = false;


            try {

                horizontalResizeHandle.releasePointerCapture(
                    event.pointerId
                );

            } catch (_) {}


            document.body.style.cursor =
                "";

            document.body.style.userSelect =
                "";


            resizeViewer();
        }
    );


    horizontalResizeHandle.addEventListener(
        "pointercancel",
        () => {

            resizing = false;


            document.body.style.cursor =
                "";

            document.body.style.userSelect =
                "";


            resizeViewer();
        }
    );
}


// !! VERTICAL RESIZE
// Model list <-> material list

if (
    verticalResizeHandle &&
    sidebar
) {

    let resizing = false;


    verticalResizeHandle.addEventListener(
        "pointerdown",
        event => {

            event.preventDefault();

            resizing = true;


            verticalResizeHandle.setPointerCapture(
                event.pointerId
            );


            document.body.style.cursor =
                "row-resize";

            document.body.style.userSelect =
                "none";
        }
    );


    verticalResizeHandle.addEventListener(
        "pointermove",
        event => {

            if (!resizing) {
                return;
            }


            const rect =
                sidebar.getBoundingClientRect();


            const relativeY =
                event.clientY -
                rect.top;


            const minModelHeight = 150;

            const minMaterialHeight = 120;


            const maxModelHeight =
                rect.height -
                minMaterialHeight;


            const modelHeight =
                Math.max(
                    minModelHeight,
                    Math.min(
                        relativeY,
                        maxModelHeight
                    )
                );


            const percentage =
                (
                    modelHeight /
                    rect.height
                ) * 100;


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


            document.body.style.cursor =
                "";

            document.body.style.userSelect =
                "";


            resizeViewer();
        }
    );


    verticalResizeHandle.addEventListener(
        "pointercancel",
        () => {

            resizing = false;


            document.body.style.cursor =
                "";

            document.body.style.userSelect =
                "";


            resizeViewer();
        }
    );
}



// INIT CAM
const defaultCameraPosition =
    new THREE.Vector3(
        0,
        1,
        4
    );
const defaultCameraTarget =
    new THREE.Vector3(
        0,
        1,
        0
    );


// INIT THREE

let composer;
let colorCorrectionPass;

function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xC3C3C3);


    camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    camera.position.copy(defaultCameraPosition);


    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    viewport.appendChild(renderer.domElement);


    // POST-PROCESSING
    
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);


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
    
    composer.addPass(colorCorrectionPass);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.copy(defaultCameraTarget);
    controls.maxPolarAngle = Math.PI / 1.8;

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


// RESIZE VIEWER

function resizeViewer() {

    if (
        !viewport ||
        !renderer ||
        !camera
    ) {
        return;
    }


    const width =
        viewport.clientWidth;


    const height =
        viewport.clientHeight;


    if (
        width <= 0 ||
        height <= 0
    ) {
        return;
    }


    camera.aspect =
        width / height;


    camera.updateProjectionMatrix();


    renderer.setSize(
        width,
        height,
        false
    );
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
}


async function loadData() {

    try {

        const response =
            await fetch(
                DATA_URL
            );


        if (
            !response.ok
        ) {

            throw new Error(
                `Failed to load ${DATA_URL}`
            );
        }


        const data =
            await response.json();


        buildModelData(
            data
        );


        renderModelList();

        // Check for URL parameters after loading
        checkUrlParams();


    } catch (error) {

        console.error(
            "Failed to load model data:",
            error
        );


        modelList.innerHTML =
            `<div class="material-empty">
                Failed to load model data.
            </div>`;
    }
}

function buildModelData(
    data
) {

    allModels = [];
    if (
        data &&
        Array.isArray(data.topics)) 
        {
        topics =
            data.topics;

        for (
            const topic of topics
        ) {

            if (
                !Array.isArray(
                    topic.models
                )
            ) {
                continue;
            }


            for (
                const model of topic.models
            ) {

                allModels.push({

                    ...model,

                    // Parent topic information
                    character:
                        topic.character,

                    keyname:
                        topic.keyname,

                    cn:
                        topic.cn,

                    en:
                        topic.en,

                    source:
                        topic.source,

                    thumbnail:
                        model.thumbnail ||
                        topic.thumbnail ||
                        null,


                    type:
                        "character"
                });
            }
        }
    }



    // Qcostume


    if (
        data &&
        Array.isArray(
            data.Qcostume
        )
    ) {

        for (
            const costume of data.Qcostume
        ) {

            allModels.push({

                ...costume,

                character:
                    "Qcostume",

                keyname:
                    costume.name,

                name:
                    costume.name,

                type:
                    "Qcostume"
            });
        }
    }
}

// SEARCH

function matchesSearch(
    model,
    query
) {

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


function groupModels(
    models
) {

    const groups =
        new Map();


    for (
        const model of models
    ) {

        const groupName =
            model.type === "Qcostume"
                ? "Qcostume"
                : model.character ||
                  "Unknown";


        if (
            !groups.has(
                groupName
            )
        ) {

            groups.set(
                groupName,
                []
            );
        }


        groups
            .get(groupName)
            .push(model);
    }


    return groups;
}



function renderModelList() {

    const query =
        searchInput
            ? searchInput.value.trim()
            : "";


    const filteredModels =
        allModels.filter(
            model =>
                matchesSearch(
                    model,
                    query
                )
        );


    modelList.innerHTML =
        "";


    if (
        filteredModels.length === 0
    ) {

        modelList.innerHTML =
            `<div class="material-empty">
                No models found.
            </div>`;


        return;
    }


    const groups =
        groupModels(
            filteredModels
        );


    for (
        const [
            groupName,
            models
        ] of groups
    ) {

        const category =
            createCategory(
                groupName,
                models
            );


        modelList.appendChild(
            category
        );
    }
}



function createCategory(
    groupName,
    models
) {

    const category =
        document.createElement(
            "section"
        );


    category.className =
        "model-category";


    // -----------------------------------------------------
    // Header
    // -----------------------------------------------------

    const header =
        document.createElement(
            "button"
        );


    header.type =
        "button";


    header.className =
        "category-header";


    const arrow =
        document.createElement(
            "span"
        );


    arrow.className =
        "category-arrow";


    arrow.textContent =
        "▼";


    const title =
        document.createElement(
            "span"
        );


    title.textContent =
        groupName;


    header.appendChild(
        arrow
    );


    header.appendChild(
        title
    );


    header.addEventListener(
        "click",
        () => {

            category.classList.toggle(
                "collapsed"
            );
        }
    );


    // -----------------------------------------------------
    // Content
    // -----------------------------------------------------

    const content =
        document.createElement(
            "div"
        );


    content.className =
        "category-content";


    for (
        const model of models
    ) {

        const card =
            createModelCard(
                model
            );


        content.appendChild(
            card
        );
    }


    category.appendChild(
        header
    );


    category.appendChild(
        content
    );


    return category;
}

function createModelCard(
    model
) {

    const card =
        document.createElement(
            "button"
        );


    card.type =
        "button";


    card.className =
        "model-card";


    card.dataset.modelFile =
        model.modelFile ||
        "";

    // for URL sharing
    card.dataset.character =
        model.character ||
        "";

    card.dataset.keyname =
        model.keyname ||
        "";

    card.dataset.version =
        model.version ||
        "";


    // -----------------------------------------------------
    // Thumbnail
    // -----------------------------------------------------

    if (
        model.thumbnail
    ) {

        const image =
            document.createElement(
                "img"
            );


        image.className =
            "model-thumbnail";


        image.src =
            resolveFrontendPath(
                model.thumbnail
            );


        image.alt =
            model.name ||
            model.keyname ||
            "Model";


        image.loading =
            "lazy";


        card.appendChild(
            image
        );

    } else {

        const placeholder =
            document.createElement(
                "div"
            );


        placeholder.className =
            "model-thumbnail-placeholder";


        placeholder.textContent =
            "No Image";


        card.appendChild(
            placeholder
        );
    }


    const name =
        document.createElement(
            "span"
        );

    name.className =
        "model-name";

    const displayName =
        model.name ||
        model.keyname ||
        "Model";


    if (
        model.version !== undefined &&
        model.version !== null
    ) {

        name.textContent =
            `${displayName} v${model.version}`;

    } else {

        name.textContent =
            displayName;
    }


    card.appendChild(
        name
    );
    card.addEventListener(
        "click",
        () => {

            if (
                model.modelFile
            ) {

                loadModel(
                    model,
                    card
                );
            }
        }
    );
    return card;
}


function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        character: params.get('character'),
        keyname: params.get('keyname'),
        version: params.get('version')
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
                // Scroll to the card
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Load the model
                loadModel(model, targetCard);
            } else {
                // Card not found in current view - load model anyway
                loadModel(model, null);
            }
        }
    }
}

function resolveFrontendPath(
    path
) {

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


async function loadModel(
    model,
    selectedCard
) {

    if (
        !model.modelFile
    ) {
        return;
    }


    loadingElement.classList.remove(
        "hidden"
    );


    emptyElement.classList.add(
        "hidden"
    );


    try {

        const loader = new MMDLoader();
        const path =
            resolveFrontendPath(
                model.modelFile
            );

        const modelObj = await loader.loadAsync(path);

        // Store current camera position and target
        const currentCameraPos = camera.position.clone();
        const currentTarget = controls.target.clone();
        const isFirstModel = !currentModel;

        if (
            currentModel
        ) {
            scene.remove(
                currentModel
            );
            disposeObject(
                currentModel
            );
            currentModel =
                null;
        }

        // currentModel = modelObj.scene;
        currentModel = modelObj;

        scene.add(
            currentModel
        );

        collectMaterials(
            currentModel
        );


        renderMaterialList();

        // Only frame the model if it's the first model
        if (isFirstModel) {
            frameModel(
                currentModel
            );
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
            .querySelectorAll(
                ".model-card.selected"
            )
            .forEach(
                card =>
                    card.classList.remove(
                        "selected"
                    )
            );


        if (
            selectedCard
        ) {

            selectedCard.classList.add(
                "selected"
            );
        }
        
        if (model.character && model.keyname) {
            updateUrlParams(
                model.character,
                model.keyname,
                model.version
            );
        }


    } catch (error) {

        console.error(
            "Failed to load model:",
            error
        );


        alert(
            `Failed to load model:\n${model.modelFile}`
        );


    } finally {

        loadingElement.classList.add(
            "hidden"
        );
    }
}

// function collectMaterials(
//     object
// ) {

//     currentMaterials = [];


//     previousMaterialVisibility =
//         new Map();


//     const materialMap =
//         new Map();


//     object.traverse(
//         child => {

//             if (
//                 !child.isMesh
//             ) {
//                 return;
//             }


//             const materials =
//                 Array.isArray(
//                     child.material
//                 )
//                     ? child.material
//                     : [child.material];


//             for (
//                 const material of materials
//             ) {

//                 if (
//                     !material
//                 ) {
//                     continue;
//                 }


//                 if (
//                     !materialMap.has(
//                         material.uuid
//                     )
//                 ) {

//                     materialMap.set(
//                         material.uuid,
//                         material
//                     );
//                 }
//             }
//         }
//     );


//     currentMaterials =
//         Array.from(
//             materialMap.values()
//         );


//     /*
//      * Store initial visibility.
//      */

//     for (
//         const material of currentMaterials
//     ) {

//         previousMaterialVisibility.set(
//             material.uuid,
//             material.visible
//         );
//     }
// }

function renderMaterialList() {

    materialList.innerHTML =
        "";


    if (
        currentMaterials.length === 0
    ) {

        materialList.innerHTML =
            `<div class="material-empty">
                No materials
            </div>`;


        return;
    }


    for (
        const material of currentMaterials
    ) {

        const item =
            document.createElement(
                "button"
            );


        item.type =
            "button";


        item.className =
            "material-item";


        if (
            !material.visible
        ) {

            item.classList.add(
                "hidden-material"
            );
        }

        const visibility =
            document.createElement(
                "span"
            );

        visibility.className =
            "material-visibility";

        visibility.innerHTML =
            getEyeIcon(
                material.visible
            );

        visibility.addEventListener(
            "click",
            event => {

                event.stopPropagation();


                toggleMaterial(
                    material
                );
            }
        );


        const name =
            document.createElement(
                "span"
            );

        name.className =
            "material-name";

        name.textContent =
            material.name ||
            "Unnamed Material";


        item.appendChild(
            visibility
        );

        item.appendChild(
            name
        );

        item.addEventListener(
            "click",
            () => {

                toggleMaterial(
                    material
                );
            }
        );

        materialList.appendChild(
            item
        );
    }
}

// FIGMA ICON
function getEyeIcon(
    visible
) {

    if (
        visible
    ) {

        return `
            <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
            >
                <path
                    d="M2 12
                       C5 7 8 5 12 5
                       C16 5 19 7 22 12
                       C19 17 16 19 12 19
                       C8 19 5 17 2 12Z"
                ></path>

                <circle
                    cx="12"
                    cy="12"
                    r="3"
                ></circle>
            </svg>
        `;

    }


    return `
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
        >
            <path
                d="M3 3L21 21"
            ></path>

            <path
                d="M10.6 5.2
                   C11.05 5.07 11.52 5 12 5
                   C16 5 19 7 22 12
                   C20.95 13.75 19.85 15.1 18.6 16.1"
            ></path>

            <path
                d="M6.25 6.25
                   C4.65 7.25 3.25 9
                   2 12
                   C5 17 8 19 12 19
                   C13.4 19 14.7 18.7 15.9 18.15"
            ></path>
        </svg>
    `;
}




function showAllMaterials() {
    // Show all materials
    for (const material of currentMaterials) {
        material.visible = true;
    }

    // Update state: everything is visible, nothing is hidden
    materialStates.visible = new Set(currentMaterials.map(m => m.uuid));
    materialStates.hidden = new Set();

    renderMaterialList();
}

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

    renderMaterialList();
}

// switch hide-unhide
let materialStates = {
    visible: new Set(),
    hidden: new Set()
};

function collectMaterials(object) {
    currentMaterials = [];
    previousMaterialVisibility = new Map();
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

    materialStates.visible = new Set();
    materialStates.hidden = new Set();
    
    for (const material of currentMaterials) {
        previousMaterialVisibility.set(material.uuid, material.visible);
        if (material.visible) {
            materialStates.visible.add(material.uuid);
        } else {
            materialStates.hidden.add(material.uuid);
        }
    }
}

function revertMaterials() {
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

    renderMaterialList();
}


function frameModel(
    object
) {

    const box =
        new THREE.Box3().setFromObject(
            object
        );


    const size =
        box.getSize(
            new THREE.Vector3()
        );


    const center =
        box.getCenter(
            new THREE.Vector3()
        );


    const maxSize =
        Math.max(
            size.x,
            size.y,
            size.z
        );


    if (
        !isFinite(maxSize) ||
        maxSize <= 0
    ) {
        return;
    }


    // Update light target
    if (
        directionalLight
    ) {
        directionalLight.target.position.copy(
            center
        );
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

    const direction =
        new THREE.Vector3(
            0,
            0,
            1
        );

    direction.applyQuaternion(
        camera.quaternion
    );

    camera.position.copy(
        center
    );


    camera.position.add(
        direction.multiplyScalar(
            distance * 1.4
        )
    );

    // Orbit target
    controls.target.copy(
        center
    );

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

function resetCamera() {

    if (
        currentModel
    ) {

        frameModel(
            currentModel
        );

        return;
    }


    camera.position.copy(
        defaultCameraPosition
    );


    controls.target.copy(
        defaultCameraTarget
    );


    controls.update();
}


function disposeObject(
    object
) {

    object.traverse(
        child => {

            if (
                !child.isMesh
            ) {
                return;
            }


            if (
                child.geometry
            ) {

                child.geometry.dispose();
            }


            if (
                child.material
            ) {

                const materials =
                    Array.isArray(
                        child.material
                    )
                        ? child.material
                        : [child.material];


                materials.forEach(
                    material =>
                        disposeMaterial(
                            material
                        )
                );
            }
        }
    );
}

function disposeMaterial(
    material
) {

    if (!material) {
        return;
    }


    for (
        const key in material
    ) {

        const value =
            material[key];


        if (
            value &&
            value.isTexture
        ) {

            value.dispose();
        }
    }


    material.dispose();
}


// EVENTS

if (searchInput
) {

    searchInput.addEventListener(
        "input",
        renderModelList
    );
}


if (resetCameraButton
) {

    resetCameraButton.addEventListener(
        "click",
        resetCamera
    );
}


if (showAllButton
) {

    showAllButton.addEventListener(
        "click",
        showAllMaterials
    );
}

if (revertButton
) {

    revertButton.addEventListener(
        "click",
        revertMaterials
    );
}

if (backgroundColorPicker
) {

    backgroundColorPicker.addEventListener(
        "input",
        event => {

            if (!scene) {
                return;
            }


            scene.background.set(
                event.target.value
            );
        }
    );
}


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