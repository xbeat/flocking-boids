import * as THREE from 'three';
import { World } from './game/world';
import { Boid } from './game/boid';
import { BoidView, createFloor, createLights, createCamera, createSkyView } from './renderer';
import { initializeConfig, storeConfigChanges } from './persistence';
import PointerLockControler from './pointerLockControls';
import CameraController from './CameraController';
import loadAllResources from './resources';
import Page from './page';
import createLoadingScene, { setupLoadingCamera } from './loadingScene';
import CompositeView from './CompositeView';

const cameraKey = 'camera';
const KEYS = {
    KEY_B: 66,
    KEY_F: 70,
    KEY_I: 73,
    KEY_U: 85,
    KEY_O: 79,
    KEY_P: 80,
    KEY_Y: 89,
    KEY_Z: 90
};

const createKeyHandlingStrategies = (cameraController, domElement) => ({
    [KEYS.KEY_Y]: program => program.context.config.toggleForceLine(),
    [KEYS.KEY_U]: program => program.context.config.toggleRepelLines(),
    [KEYS.KEY_I]: program => program.context.config.toggleAttractLine(),
    [KEYS.KEY_O]: program => program.context.config.toggleFollowLine(),
    [KEYS.KEY_P]: program => program.context.config.toggleFriendLines(),
    [KEYS.KEY_B]: program => program.context.config.toggleAxis(),
    [KEYS.KEY_Z]: () => {
        cameraController.zoom();
    },
    [KEYS.KEY_F]: program => {
        program.context.toggleFullscreen();
        if (program.context.fullscreen) {
            if (domElement.webkitRequestFullscreen) {
                domElement.webkitRequestFullscreen();
            }
        }
    }
});

const mainSceneResources = [
    {
        name: 'skySphere',
        url: '/assets/models/skySphere.json'
    },
    {
        name: 'bird',
        url: '/assets/models/birdSimple02.json'
    },
    {
        name: 'terrain',
        url: '/assets/models/terain01.json'
    }
];

class Config {
    constructor() {
        this.showForceLine = false;
        this.showRepelLine = false;
        this.showAttractLine = false;
        this.showFollowLine = false;
        this.showFriendLines = false;
        this.showAxis = false;
    }

    toggleForceLine() {
        this.showForceLine = !this.showForceLine;
    }

    toggleAttractLine() {
        this.showAttractLine = !this.showAttractLine;
    }

    toggleRepelLines() {
        this.showRepelLine = !this.showRepelLine;
    }

    toggleFollowLine() {
        this.showFollowLine = !this.showFollowLine;
    }

    toggleFriendLines() {
        this.showFriendLines = !this.showFriendLines;
    }

    toggleAxis() {
        this.showAxis = !this.showAxis;
    }

    toggleZoom() {
        this.zoom = !this.zoom;
    }

    toggleFullscreen() {
        this.fullscreen = !this.fullscreen;
    }
}

class Context {
    constructor(config = new Config()) {
        this.config = config;
        this.simulationRunning = false;
        this.zoom = false;
    }

    toggleZoom() {
        this.zoom = !this.zoom;
    }

    toggleFullscreen() {
        this.fullscreen = !this.fullscreen;
    }
}

class Program {
    constructor(assetRoot) {
        this.assetRoot = assetRoot;
        this.page = new Page();
        this.context = new Context();
    }

    _setupBoids(scene, world, boidGeometry, boidMaterial, boids = []) {
        const numBoids = 500;

        for (let i = 0; i < numBoids; i++) {
            const gameBoid = Boid.createWithRandomPositionAndDirection(-20, 20, 1);
            world.addBoid(gameBoid);
            const boidView = new BoidView(scene, boidGeometry, boidMaterial, gameBoid);
            boids.push(boidView);
        }
    }

    async _setupMainScene(assetRoot = '') {
        initializeConfig(this.context.config);
        const world = new World();

        const boids = [];
        const resources = await loadAllResources(mainSceneResources, assetRoot);

        const scene = new THREE.Scene();
        const resourceStratergies = this._createResourcesStrategies(scene, world, boids);
        resources.forEach(x => resourceStratergies[x.name](x));

        for (const light of createLights()) {
            scene.add(light);
        }

        return { world, boids, scene };
    }

    _createRenderLoop(renderer) {
        const clock = new THREE.Clock();

        const internalRender = () => {
            this.page.requestAnimationFrame(internalRender);

            var delta = clock.getDelta();
            if (this.context.simulationRunning) {
                this.experience.update(delta, this.context);
            }

            this.experience.renderUsing(renderer);
        };
        return internalRender;
    }

    _createResourcesStrategies(scene, world, boids) {
        return {
            skySphere: skySphere => scene.add(createSkyView(skySphere.geometry, skySphere.materials)),
            bird: bird => this._setupBoids(scene, world, bird.geometry, bird.materials[0], boids),
            terrain: terrain => scene.add(createFloor(terrain.geometry, terrain.material))
        };
    }

    _createDocumentKeyDownHandler(keyHandlingStrategies) {
        return (event) => {
            console.log('keydown', event);
            const handler = keyHandlingStrategies[event.keyCode];
            if (handler) {
                handler(this);
                storeConfigChanges(this.context.config);
                return;
            } else {
                console.log(`no handler found for key ${event.keyCode}`);
            }
            storeConfigChanges(this.context.config);
        };
    }

    _createWindowResizeHandler(renderer) {
        return () => {
            this.experience.pageResized(this.page);

            renderer.setSize(this.page.getInnerWidth(), this.page.getInnerHeight());
        };
    }

    async _createFlockingExperience(page, renderer) {
        var { world, boids, scene } = await this._setupMainScene(this.assetRoot);

        var camera = createCamera();        
        const cameraController = new CameraController(camera);
        world.addController(cameraController, cameraKey);

        console.log('setup complete');


        if (page.isPointerLockSupported()) {
            const controls = new PointerLockControler(camera);
            cameraController.setPointerLockControls(controls);
            scene.add(controls.getObject());
            controls.setPosition(0, 1, 30);

            page.registerOnPointerLockChanged((isSourceElement) => {
                if (isSourceElement) {
                    controls.enabled = true;
                    this.context.simulationRunning = true;
                } else {
                    controls.enabled = false;
                    this.context.simulationRunning = false;
                }
            });

            page.registerOnClick((p) => {
                controls.enabled = true;
                p.lockPointer();
            });
        } else {
            console.log('pointer lock not supported');
        }

        this.page.addKeyDownListener(
            this._createDocumentKeyDownHandler(
                createKeyHandlingStrategies(
                    cameraController,
                    renderer.domElement)));

        return new Experience(scene, camera, new CompositeView(boids), world);
    }

    _createLoadingExperience() {
        var loadingCamera = setupLoadingCamera();
        const { loadingScene, loadingView } = createLoadingScene();
        return new Experience(loadingScene, loadingCamera, loadingView);        
    }
    async _startApp(page) {

        var renderer = new THREE.WebGLRenderer();
        renderer.setSize(page.getInnerWidth(), page.getInnerHeight());

        page.addViewPort(renderer);        
        page.registerOnResize(this._createWindowResizeHandler(renderer));
        
        this.experience = this._createLoadingExperience();

        this.context.simulationRunning = true;

        this._createRenderLoop(renderer)();

        this.experience = await this._createFlockingExperience(page, renderer);
        this.context.simulationRunning = false;
    }

    run() {
        this.page.registerOnLoad(async page => await this._startApp(page));
    }
}

class Experience {
    constructor(scene, camera, view, world = null) {
        this.scene = scene;
        this.camera = camera;
        this.view = view;
        this.world = world;
    }

    update(delta, context) {
        if (this.world) {
            this.world.update(delta);
        }
        if (this.view) {
            this.view.update(context, delta);
        }
    }

    pageResized(page) {
        this.camera.aspect = page.getAspectRatio();
        this.camera.updateProjectionMatrix();
    }

    renderUsing(renderer) {
        renderer.render(this.scene, this.camera);
    }
}

export function startUp(assetRoot = '') {
    new Program(assetRoot).run();
}