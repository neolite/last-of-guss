import * as THREE from 'three';

/**
 * MapGeometry - cs_discounter CQB map
 *
 * Layout: Discount store (30x40 units) with:
 * - Торговый зал (store) with shelves
 * - Офис (office) - separate walled area
 * - Склад/Рампа (warehouse/ramp)
 * - Парковка (parking) with cars for cover
 * - Задвор (backyard)
 *
 * Inspired by: cs_discounter from CS 1.6 - tight indoor/outdoor retail combat
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
    this.createGround(scene);
    this.createBoundaryWalls(scene);
    this.createStoreArea(scene);      // Торговый зал
    this.createOfficeArea(scene);     // Офис
    this.createWarehouseArea(scene);  // Склад/Рампа
    this.createParkingArea(scene);    // Парковка
    this.createBackyard(scene);       // Задвор
    this.createLighting(scene);       // Lamps - last
  }

  /**
   * Create lighting setup (strategic lamps like discounter)
   */
  private createLighting(scene: THREE.Scene) {
    // Low ambient for dark atmosphere
    const ambient = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(ambient);
    this.meshes.push(ambient);

    // Strategic lamp positions (store, office, parking)
    const lampPositions = [
      { x: -10, z: -15 },  // Store entrance
      { x: -8, z: 0 },     // Store center-left
      { x: 2, z: -5 },     // Store center-right
      { x: 11, z: -5 },    // Office
      { x: -5, z: 10 },    // Warehouse
      { x: -8, z: 16 },    // Parking (T spawn)
      { x: 5, z: 17 },     // Parking area
      { x: 10, z: 14 },    // Backyard
    ];

    for (const pos of lampPositions) {
      // Lamp post
      const postGeometry = new THREE.CylinderGeometry(0.1, 0.1, 3.5, 8);
      const postMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
      const post = new THREE.Mesh(postGeometry, postMaterial);
      post.position.set(pos.x, 1.75, pos.z);
      scene.add(post);
      this.meshes.push(post);

      // Lamp bulb (glowing sphere)
      const bulbGeometry = new THREE.SphereGeometry(0.3, 16, 16);
      const bulbMaterial = new THREE.MeshStandardMaterial({
        color: 0xffeeaa,
        emissive: 0xffeeaa,
        emissiveIntensity: 2,
      });
      const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
      bulb.position.set(pos.x, 3.5, pos.z);
      scene.add(bulb);
      this.meshes.push(bulb);

      // Point light
      const light = new THREE.PointLight(0xffeeaa, 2, 20, 2);
      light.position.set(pos.x, 3.5, pos.z);
      light.castShadow = true;
      light.shadow.mapSize.width = 512;
      light.shadow.mapSize.height = 512;
      scene.add(light);
      this.meshes.push(light);
    }
  }

  /**
   * Create ground plane (larger map: 30x40)
   */
  private createGround(scene: THREE.Scene) {
    const geometry = new THREE.PlaneGeometry(30, 40);

    // Tiled floor texture
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const ctx = floorCanvas.getContext('2d')!;

    // White tiles with gray grout
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const tileColor = (x + y) % 2 === 0 ? '#e8e8e8' : '#f0f0f0';
        ctx.fillStyle = tileColor;
        ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
        ctx.fillStyle = '#999';
        ctx.fillRect(x * 64, y * 64, 64, 2);
        ctx.fillRect(x * 64, y * 64, 2, 64);
      }
    }

    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(4, 6);

    const material = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.7,
      metalness: 0.1,
    });

    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;

    scene.add(ground);
    this.meshes.push(ground);

    // Add floor collider (thin box at y=0)
    this.colliders.push({
      type: 'box',
      position: new THREE.Vector3(0, -0.05, 0), // Just below ground level
      size: new THREE.Vector3(30, 0.1, 40),      // Match floor size, thin (0.1m)
      mesh: ground,
    });
  }

  /**
   * Create boundary walls (map 30x40)
   */
  private createBoundaryWalls(scene: THREE.Scene) {
    const wallHeight = 4;
    const wallThickness = 0.3;

    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc, // Light gray walls
      roughness: 0.8,
      metalness: 0.05,
    });

    // Left wall (X = -15)
    this.createWall(
      scene,
      new THREE.Vector3(-15, wallHeight / 2, 0),
      new THREE.Vector3(wallThickness, wallHeight, 40),
      wallMaterial
    );

    // Right wall (X = 15)
    this.createWall(
      scene,
      new THREE.Vector3(15, wallHeight / 2, 0),
      new THREE.Vector3(wallThickness, wallHeight, 40),
      wallMaterial
    );

    // Front wall (Z = -20)
    this.createWall(
      scene,
      new THREE.Vector3(0, wallHeight / 2, -20),
      new THREE.Vector3(30, wallHeight, wallThickness),
      wallMaterial
    );

    // Back wall (Z = 20)
    this.createWall(
      scene,
      new THREE.Vector3(0, wallHeight / 2, 20),
      new THREE.Vector3(30, wallHeight, wallThickness),
      wallMaterial
    );
  }

  /**
   * ТОРГОВЫЙ ЗАЛ (Store Area) - Main shopping area with shelves
   */
  private createStoreArea(scene: THREE.Scene) {
    const shelfMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b6f47, // Wood color
      roughness: 0.8,
      metalness: 0.1,
    });

    // Store boundary walls (separates from office)
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xaaaaaa,
      roughness: 0.8,
      metalness: 0.05,
    });

    // Store back wall (separate from warehouse)
    this.createWall(
      scene,
      new THREE.Vector3(-5, 2, 5),
      new THREE.Vector3(12, 4, 0.3),
      wallMaterial
    );

    // Shelves in store (stacks marked as H in ASCII)
    const shelfPositions = [
      { x: -8, z: -5 },   // Left row
      { x: -8, z: 0 },
      { x: -4, z: -5 },   // Center-left row
      { x: -4, z: 0 },
      { x: 2, z: -5 },    // Right side (marked H H in ASCII)
      { x: 6, z: -5 },
    ];

    for (const pos of shelfPositions) {
      this.createShelf(
        scene,
        new THREE.Vector3(pos.x, 1.1, pos.z),
        new THREE.Vector3(1.2, 2.2, 3),
        shelfMaterial
      );
    }

    // Checkout counters near entrance
    const counterMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.6,
      metalness: 0.3,
    });

    this.createCounter(
      scene,
      new THREE.Vector3(-6, 0.5, -12),
      new THREE.Vector3(3, 1, 1.5),
      counterMaterial
    );
  }

  /**
   * ОФИС (Office Area) - Walled off section with desk
   */
  private createOfficeArea(scene: THREE.Scene) {
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xaaaaaa,
      roughness: 0.8,
      metalness: 0.05,
    });

    // Office walls (creates enclosed space on right side)
    // Left wall of office
    this.createWall(
      scene,
      new THREE.Vector3(8, 2, -5),
      new THREE.Vector3(0.3, 4, 10),
      wallMaterial
    );

    // Back wall of office
    this.createWall(
      scene,
      new THREE.Vector3(11.5, 2, -10),
      new THREE.Vector3(7, 4, 0.3),
      wallMaterial
    );

    // Front wall of office (with door gap)
    this.createWall(
      scene,
      new THREE.Vector3(11.5, 2, 0),
      new THREE.Vector3(7, 4, 0.3),
      wallMaterial
    );

    // Office desk (marked H in ASCII)
    const deskMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b6f47,
      roughness: 0.6,
      metalness: 0.1,
    });

    this.createBox(
      scene,
      new THREE.Vector3(11, 0.4, -5),
      new THREE.Vector3(2, 0.8, 1),
      deskMaterial
    );
  }

  /**
   * СКЛАД/РАМПА (Warehouse/Ramp Area)
   */
  private createWarehouseArea(_scene: THREE.Scene) {
    // Warehouse area - empty for now (crates removed for bunny hop testing)
  }

  /**
   * ПАРКОВКА (Parking Area) - Tall shelves and crates for cover (no low objects!)
   */
  private createParkingArea(scene: THREE.Scene) {
    const shelfMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a4a3a, // Brown wood
      roughness: 0.8,
      metalness: 0.1,
    });

    const crateMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b5a4a, // Lighter wood
      roughness: 0.9,
      metalness: 0.05,
    });

    // Tall shelves (T spawn area) - vertical cover, can't walk under
    const shelfPositions = [
      { x: -10, z: 15 },
      { x: -5, z: 17 },
      { x: 2, z: 16 },
    ];

    for (const pos of shelfPositions) {
      // Tall shelf (full height - no gap to walk under)
      this.createBox(
        scene,
        new THREE.Vector3(pos.x, 1.5, pos.z),   // Centered at 1.5m height
        new THREE.Vector3(1.5, 3.0, 0.4),       // 1.5m wide, 3m tall, 0.4m deep
        shelfMaterial
      );

      // Wooden crates beside shelves (stacked, also tall)
      this.createBox(
        scene,
        new THREE.Vector3(pos.x + 2, 0.6, pos.z),  // Next to shelf
        new THREE.Vector3(0.8, 1.2, 0.8),           // Small crate
        crateMaterial
      );
      this.createBox(
        scene,
        new THREE.Vector3(pos.x + 2, 1.8, pos.z),  // Stacked on top
        new THREE.Vector3(0.8, 1.2, 0.8),
        crateMaterial
      );
    }
  }

  /**
   * ЗАДВОР (Backyard) - Open area with some cover
   */
  private createBackyard(scene: THREE.Scene) {
    const fenceMaterial = new THREE.MeshStandardMaterial({
      color: 0x654321,
      roughness: 0.9,
      metalness: 0.1,
    });

    // Fence posts
    const fencePositions = [
      { x: 8, z: 12 },
      { x: 8, z: 16 },
      { x: 12, z: 12 },
    ];

    for (const pos of fencePositions) {
      this.createBox(
        scene,
        new THREE.Vector3(pos.x, 1, pos.z),
        new THREE.Vector3(0.2, 2, 0.2),
        fenceMaterial
      );
    }

    // Dumpster
    const dumpsterMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a5a2a,
      roughness: 0.8,
      metalness: 0.3,
    });

    this.createBox(
      scene,
      new THREE.Vector3(10, 0.8, 14),
      new THREE.Vector3(2, 1.6, 3),
      dumpsterMaterial
    );
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
   * Helper: Create a shelf collider
   */
  private createShelf(
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
   * Helper: Create a counter collider
   */
  private createCounter(
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
   * Helper: Create a generic box collider (crates, cars, etc.)
   */
  private createBox(
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
