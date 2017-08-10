import * as THREE from 'three';
import { World } from './game/world';
import { Boid } from './game/boid';
import { BoidView, createFloor, createLights, createCamera, createSkyView } from './renderer';
import { initializeConfig, storeConfigChanges } from './persistence';
import PointerLockControler from './pointerLockControls';
import CameraController from './CameraController';
import loadAllResources from './resources';
import Page from './page';

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

class Program {
    constructor() {
        this.page = new Page();
        this.context = {
            config: {
                showForceLine: false,
                showRepelLine: false,
                showAttractLine: false,
                showFollowLine: false,
                showFriendLines: false,
                showAxis: false
            },
            simulationRunning: false,
            zoom: false
        };
    }

    update(delta, boidsViews, world) {
        world.update(delta);
        for (const boidView of boidsViews) {
            boidView.update(this.context, delta);
        }
    }

    setupBoids(scene, world, boidGeometry, boidMaterial, boids = []) {
        const numBoids = 500;

        for (let i = 0; i < numBoids; i++) {
            const gameBoid = Boid.createWithRandomPositionAndDirection(-20, 20, 1);
            world.addBoid(gameBoid);
            const boidView = new BoidView(scene, boidGeometry, boidMaterial, gameBoid);
            boids.push(boidView);
        }
    }

    async setup(scene, assetRoot = '') {
        initializeConfig(this.context.config);
        const world = new World();

        const boids = [];
        const resources = await loadAllResources(this._createResourcesDescription(assetRoot));

        const resourceStratergies = this._createResourcesStrategies(scene, world, boids);
        resources.forEach(x => resourceStratergies[x.name](x));

        for (const light of createLights()) {
            scene.add(light);
        }

        var camera = createCamera();

        world.addController(new CameraController(camera), cameraKey);

        return { world, boids, camera };
    }

    createRenderLoop(clock, boids, scene, camera, renderer, world) {
        const internalRender = () => {
            window.requestAnimationFrame(internalRender);

            var delta = clock.getDelta();
            if (this.context.simulationRunning) {
                this.update(delta, boids, world);
            }

            renderer.render(scene, camera);
        };
        return internalRender;
    }

    toggleForceLine() {
        this.context.config.showForceLine = !this.context.config.showForceLine;
    }

    toggleAttractLine() {
        this.context.config.showAttractLine = !this.context.config.showAttractLine;
    }


    _createResourcesDescription(assetRoot) {
        return [
            {
                name: 'skySphere',
                url: `${assetRoot}/assets/models/skySphere.json`
            },
            {
                name: 'bird',
                url: `${assetRoot}/assets/models/birdSimple02.json`
            },
            {
                name: 'terrain',
                url: `${assetRoot}/assets/models/terain01.json`
            }
        ];
    }

    _createResourcesStrategies(scene, world, boids) {
        return {
            skySphere: skySphere => scene.add(createSkyView(skySphere.geometry, skySphere.materials)),
            bird: bird => this.setupBoids(scene, world, bird.geometry, bird.materials[0], boids),
            terrain: terrain => scene.add(createFloor(terrain.geometry, terrain.material))
        };
    }

    createOnDocumentKeyDown(cameraController, domElement) {
        return (event) => {
            console.log('keydown', event);
            switch (event.keyCode) {
                case KEYS.KEY_Y:
                    this.toggleForceLine();
                    break;
                case KEYS.KEY_U:
                    this.context.config.showRepelLine = !this.context.config.showRepelLine;
                    break;
                case KEYS.KEY_I:
                    this.toggleAttractLine();
                    break;
                case KEYS.KEY_O:
                    this.context.config.showFollowLine = !this.context.config.showFollowLine;
                    break;
                case KEYS.KEY_P:
                    this.context.config.showFriendLines = !this.context.config.showFriendLines;
                    break;
                case KEYS.KEY_B:
                    this.context.config.showAxis = !this.context.config.showAxis;
                    break;
                case KEYS.KEY_Z:
                    this.context.zoom = !this.context.zoom;
                    if (this.context.zoom) {
                        cameraController.zoomIn();
                    } else {
                        cameraController.zoomOut();
                    }
                    break;
                case KEYS.KEY_F:
                    this.context.fullscreen = !this.context.fullscreen;
                    if (this.context.fullscreen) {
                        if (domElement.webkitRequestFullscreen) {
                            domElement.webkitRequestFullscreen();
                        }
                    }
                    break;

            }
            storeConfigChanges(this.context.config);
        };
    }

    setupKeyboardListeners(cameraController, domElement) {
        this.page.addKeyDownListener(this.createOnDocumentKeyDown(cameraController, domElement));
    }

    createHandleWindowResize(camera, renderer) {
        return () => {
            camera.aspect = this.page.getAspectRatio();
            camera.updateProjectionMatrix();

            renderer.setSize(this.page.getInnerWidth(), this.page.getInnerHeight());
        };
    }

    run(assetRoot) {
        this.page.registerOnLoad(async page => {
            var scene = new THREE.Scene();

            var renderer = new THREE.WebGLRenderer();
            renderer.setSize(page.getInnerWidth(), page.getInnerHeight());

            page.appendToBody(renderer.domElement);

            var { world, boids, camera } = await this.setup(scene, assetRoot);

            console.log('setup complete');

            page.registerOnResize(this.createHandleWindowResize(camera, renderer));

            if (page.isPointerLockSupported()) {
                const controls = new PointerLockControler(camera);
                world.getControllerByName(cameraKey).setPointerLockControls(controls);
                scene.add(controls.getObject());
                controls.getObject().position.setX(0);
                controls.getObject().position.setY(1);
                controls.getObject().position.setZ(30);

                var blocker = page.getElementById('blocker');

                page.registerOnPointerLockChanged((isSourceElement) => {
                    if (isSourceElement) {
                        controls.enabled = true;
                        blocker.style.display = 'none';
                        this.context.simulationRunning = true;
                    } else {
                        controls.enabled = false;
                        blocker.style.display = '';
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
            this.setupKeyboardListeners(world.getControllerByName(cameraKey), renderer.domElement);

            var clock = new THREE.Clock();

            var render = this.createRenderLoop(clock, boids, scene, camera, renderer, world);

            render();
        });
    }
}

export function startUp(assetRoot = '') {
    new Program().run(assetRoot);
}