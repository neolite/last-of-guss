import * as THREE from 'three';

/**
 * MapGeometry - Shipment-style CQB map
 *
 * Layout: Small rectangular arena (15x43 units) with shipping containers and walls for cover
 * Inspired by: COD Shipment, Nuketown, Dust2 - classic tight CQB arenas
 */

export interface MapCollider {
  type: 'box';
  position: THREE.Vector3;
  size: THREE.Vector3;
  mesh: THREE.Mesh;
}

export class MapGeometry {
  private colliders: MapCollider[] = [];
  private meshes: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene) {
    this.createLighting(scene);
    this.createGround(scene);
    this.createBoundaryWalls(scene);
    this.createContainers(scene);
    this.createCenterCover(scene);
  }

  /**
   * Create lighting setup
   */
  private createLighting(scene: THREE.Scene) {
    // Ambient light for base visibility
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);
    this.meshes.push(ambient);

    // Directional light (sun) for shadows
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(10, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 50;
    sun.shadow.camera.left = -25;
    sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 25;
    sun.shadow.camera.bottom = -25;
    scene.add(sun);
    this.meshes.push(sun);

    // Additional fill light from opposite side
    const fill = new THREE.DirectionalLight(0x8899ff, 0.4);
    fill.position.set(-10, 10, -10);
    scene.add(fill);
    this.meshes.push(fill);
  }

  /**
   * Create ground plane
   */
  private createGround(scene: THREE.Scene) {
    const geometry = new THREE.PlaneGeometry(15, 43);
    const material = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.8,
      metalness: 0.2,
    });

    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;

    scene.add(ground);
    this.meshes.push(ground);

    // Add grid lines for visual reference
    const gridHelper = new THREE.GridHelper(43, 43, 0x444444, 0x333333);
    gridHelper.rotation.x = 0;
    scene.add(gridHelper);
    this.meshes.push(gridHelper);
  }

  /**
   * Create boundary walls (15x43 arena)
   */
  private createBoundaryWalls(scene: THREE.Scene) {
    const wallHeight = 4;
    const wallThickness = 0.5;

    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a4a4a,
      roughness: 0.7,
      metalness: 0.1,
    });

    // Left wall (X = -7.5)
    this.createWall(
      scene,
      new THREE.Vector3(-7.5, wallHeight / 2, 0),
      new THREE.Vector3(wallThickness, wallHeight, 43),
      wallMaterial
    );

    // Right wall (X = 7.5)
    this.createWall(
      scene,
      new THREE.Vector3(7.5, wallHeight / 2, 0),
      new THREE.Vector3(wallThickness, wallHeight, 43),
      wallMaterial
    );

    // Front wall (Z = -21.5)
    this.createWall(
      scene,
      new THREE.Vector3(0, wallHeight / 2, -21.5),
      new THREE.Vector3(15, wallHeight, wallThickness),
      wallMaterial
    );

    // Back wall (Z = 21.5)
    this.createWall(
      scene,
      new THREE.Vector3(0, wallHeight / 2, 21.5),
      new THREE.Vector3(15, wallHeight, wallThickness),
      wallMaterial
    );
  }

  /**
   * Create shipping containers (main cover elements)
   */
  private createContainers(scene: THREE.Scene) {
    const containerMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.9,
      metalness: 0.1,
    });

    // Container dimensions (standard shipping container scaled down)
    const containerWidth = 2.4;
    const containerHeight = 2.6;
    const containerDepth = 6;

    // 4 corner containers (like Shipment)

    // Front-left corner
    this.createContainer(
      scene,
      new THREE.Vector3(-5, containerHeight / 2, -15),
      new THREE.Vector3(containerWidth, containerHeight, containerDepth),
      containerMaterial
    );

    // Front-right corner
    this.createContainer(
      scene,
      new THREE.Vector3(5, containerHeight / 2, -15),
      new THREE.Vector3(containerWidth, containerHeight, containerDepth),
      containerMaterial
    );

    // Back-left corner
    this.createContainer(
      scene,
      new THREE.Vector3(-5, containerHeight / 2, 15),
      new THREE.Vector3(containerWidth, containerHeight, containerDepth),
      containerMaterial
    );

    // Back-right corner
    this.createContainer(
      scene,
      new THREE.Vector3(5, containerHeight / 2, 15),
      new THREE.Vector3(containerWidth, containerHeight, containerDepth),
      containerMaterial
    );

    // Mid-section containers (side lanes)

    // Left mid
    this.createContainer(
      scene,
      new THREE.Vector3(-5, containerHeight / 2, 0),
      new THREE.Vector3(containerWidth, containerHeight, containerDepth),
      containerMaterial
    );

    // Right mid
    this.createContainer(
      scene,
      new THREE.Vector3(5, containerHeight / 2, 0),
      new THREE.Vector3(containerWidth, containerHeight, containerDepth),
      containerMaterial
    );
  }

  /**
   * Create center cover (low walls/crates)
   */
  private createCenterCover(scene: THREE.Scene) {
    const crateMaterial = new THREE.MeshStandardMaterial({
      color: 0x654321,
      roughness: 0.8,
    });

    const crateSize = 1.5;
    const crateHeight = 1.2;

    // Center crates (scattered for dynamic gameplay)
    const centerPositions = [
      new THREE.Vector3(-2, crateHeight / 2, -8),
      new THREE.Vector3(2, crateHeight / 2, -8),
      new THREE.Vector3(-2, crateHeight / 2, 8),
      new THREE.Vector3(2, crateHeight / 2, 8),
      new THREE.Vector3(0, crateHeight / 2, 0),
    ];

    for (const pos of centerPositions) {
      this.createCrate(
        scene,
        pos,
        new THREE.Vector3(crateSize, crateHeight, crateSize),
        crateMaterial
      );
    }
  }

  /**
   * Helper: Create a wall collider
   */
  private createWall(
    scene: THREE.Scene,
    position: THREE.Vector3,
    size: THREE.Vector3,
    material: THREE.Material
  ) {
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    scene.add(mesh);
    this.meshes.push(mesh);

    this.colliders.push({
      type: 'box',
      position: position.clone(),
      size: size.clone(),
      mesh,
    });
  }

  /**
   * Helper: Create a container collider
   */
  private createContainer(
    scene: THREE.Scene,
    position: THREE.Vector3,
    size: THREE.Vector3,
    material: THREE.Material
  ) {
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    scene.add(mesh);
    this.meshes.push(mesh);

    this.colliders.push({
      type: 'box',
      position: position.clone(),
      size: size.clone(),
      mesh,
    });
  }

  /**
   * Helper: Create a crate collider
   */
  private createCrate(
    scene: THREE.Scene,
    position: THREE.Vector3,
    size: THREE.Vector3,
    material: THREE.Material
  ) {
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    scene.add(mesh);
    this.meshes.push(mesh);

    this.colliders.push({
      type: 'box',
      position: position.clone(),
      size: size.clone(),
      mesh,
    });
  }

  /**
   * Get all colliders for physics system
   */
  getColliders(): MapCollider[] {
    return this.colliders;
  }

  /**
   * Cleanup
   */
  destroy(scene: THREE.Scene) {
    for (const mesh of this.meshes) {
      scene.remove(mesh);
      if (mesh instanceof THREE.Mesh) {
        mesh.geometry.dispose();
        if (mesh.material instanceof THREE.Material) {
          mesh.material.dispose();
        }
      }
    }
    this.meshes = [];
    this.colliders = [];
  }
}
