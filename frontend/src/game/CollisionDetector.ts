import * as THREE from 'three';
import type { MapCollider } from './MapGeometry';

/**
 * CollisionDetector - Simple AABB and capsule-box collision detection
 *
 * Used for:
 * - Player movement (capsule vs map boxes)
 * - Projectile raycasting (ray vs map boxes)
 */

export class CollisionDetector {
  private colliders: MapCollider[] = [];

  constructor(colliders: MapCollider[]) {
    this.colliders = colliders;
  }

  /**
   * Check capsule collision with all map colliders
   * Returns collision response (penetration vector)
   */
  checkCapsuleCollision(
    position: THREE.Vector3,
    radius: number,
    height: number
  ): THREE.Vector3 | null {
    const response = new THREE.Vector3(0, 0, 0);
    let hasCollision = false;

    for (const collider of this.colliders) {
      if (collider.type === 'box') {
        const penetration = this.capsuleVsBox(position, radius, height, collider);

        if (penetration) {
          response.add(penetration);
          hasCollision = true;
        }
      }
    }

    return hasCollision ? response : null;
  }

  /**
   * Capsule vs AABB collision (simplified)
   *
   * Treats capsule as a vertical cylinder for simplicity
   * Returns penetration vector if colliding, null otherwise
   */
  private capsuleVsBox(
    capsulePos: THREE.Vector3,
    radius: number,
    height: number,
    box: MapCollider
  ): THREE.Vector3 | null {
    // Capsule bounds (treat as cylinder)
    const capsuleMinY = capsulePos.y - height / 2;
    const capsuleMaxY = capsulePos.y + height / 2;

    // Box bounds
    const boxMin = new THREE.Vector3(
      box.position.x - box.size.x / 2,
      box.position.y - box.size.y / 2,
      box.position.z - box.size.z / 2
    );
    const boxMax = new THREE.Vector3(
      box.position.x + box.size.x / 2,
      box.position.y + box.size.y / 2,
      box.position.z + box.size.z / 2
    );

    // Check Y overlap first (early exit)
    if (capsuleMaxY < boxMin.y || capsuleMinY > boxMax.y) {
      return null; // No vertical overlap
    }

    // Find closest point on box (XZ plane) to capsule center
    const closestX = Math.max(boxMin.x, Math.min(capsulePos.x, boxMax.x));
    const closestZ = Math.max(boxMin.z, Math.min(capsulePos.z, boxMax.z));

    // Distance from capsule center to closest point
    const dx = capsulePos.x - closestX;
    const dz = capsulePos.z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq >= radius * radius) {
      return null; // No collision
    }

    // Collision! Calculate penetration vector
    const dist = Math.sqrt(distSq);

    if (dist < 0.001) {
      // Capsule center is inside box - push out in closest axis direction
      const penetrationX = Math.min(
        Math.abs(capsulePos.x - boxMin.x),
        Math.abs(capsulePos.x - boxMax.x)
      );
      const penetrationZ = Math.min(
        Math.abs(capsulePos.z - boxMin.z),
        Math.abs(capsulePos.z - boxMax.z)
      );
      const penetrationY = Math.min(
        Math.abs(capsuleMinY - boxMin.y),
        Math.abs(capsuleMaxY - boxMax.y)
      );

      // Push out in direction of least penetration
      const minPenetration = Math.min(penetrationX, penetrationZ, penetrationY);

      if (minPenetration === penetrationY) {
        // Vertical push
        const dir = capsulePos.y > box.position.y ? 1 : -1;
        return new THREE.Vector3(0, penetrationY * dir, 0);
      } else if (minPenetration === penetrationX) {
        const dir = capsulePos.x > box.position.x ? 1 : -1;
        return new THREE.Vector3(penetrationX * dir, 0, 0);
      } else {
        const dir = capsulePos.z > box.position.z ? 1 : -1;
        return new THREE.Vector3(0, 0, penetrationZ * dir);
      }
    }

    // Normal case: push along vector from closest point to capsule center
    const penetrationDepth = radius - dist;
    const nx = dx / dist;
    const nz = dz / dist;

    // Calculate vertical penetration (if capsule is above/below box)
    let verticalPenetration = 0;

    // Check if capsule bottom is penetrating box top
    if (capsuleMinY < boxMax.y && capsuleMinY > boxMin.y) {
      verticalPenetration = boxMax.y - capsuleMinY; // Push UP
    }
    // Check if capsule top is penetrating box bottom (ceiling)
    else if (capsuleMaxY > boxMin.y && capsuleMaxY < boxMax.y) {
      verticalPenetration = boxMin.y - capsuleMaxY; // Push DOWN
    }

    return new THREE.Vector3(
      nx * penetrationDepth,
      verticalPenetration,
      nz * penetrationDepth
    );
  }

  /**
   * Raycast against all map colliders
   * Returns closest hit info or null
   */
  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number = 1000
  ): { point: THREE.Vector3; distance: number; normal: THREE.Vector3 } | null {
    let closestHit: { point: THREE.Vector3; distance: number; normal: THREE.Vector3 } | null = null;
    let closestDist = maxDistance;

    const raycaster = new THREE.Raycaster(origin, direction, 0, maxDistance);

    for (const collider of this.colliders) {
      if (collider.type === 'box') {
        const intersects = raycaster.intersectObject(collider.mesh, false);

        if (intersects.length > 0 && intersects[0].distance < closestDist) {
          closestDist = intersects[0].distance;
          closestHit = {
            point: intersects[0].point,
            distance: intersects[0].distance,
            normal: intersects[0].face?.normal || new THREE.Vector3(0, 1, 0),
          };
        }
      }
    }

    return closestHit;
  }

  /**
   * Update colliders (if map changes)
   */
  updateColliders(colliders: MapCollider[]) {
    this.colliders = colliders;
  }
}
