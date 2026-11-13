import { MathUtils, PerspectiveCamera, Quaternion, Vector3 } from 'three';

const up = new Vector3(0, 1, 0);
const duration = .56;

/** Carry the sea silhouette across the valley cut before easing into chase. */
export class ChapterView {
  constructor() {
    this.camera = new PerspectiveCamera();
    this.previousEye = new Vector3();
    this.previousRotation = new Quaternion();
    this.entryEye = new Vector3();
    this.entryRotation = new Quaternion();
    this.head = new Vector3();
    this.outgoingEye = new Vector3();
    this.yaw = new Quaternion();
    this.reset();
  }

  reset() {
    this.stage = -1;
    this.age = duration;
  }

  apply(camera, frame, evolving, dt) {
    const { stage, position, heading } = frame;
    this.head.set(position.x, position.y, position.z);
    const entry = stage === 3 && this.stage === 2 && evolving && camera.isPerspectiveCamera;
    if (this.stage !== stage) this.age = duration;
    if (entry) {
      this.age = 0;
      this.entryEye.copy(this.previousEye);
      this.entryRotation.copy(this.previousRotation);
      this.entryHeading = this.previousHeading;
      this.entryFov = this.previousFov;
    }
    this.stage = stage;
    this.previousEye.copy(camera.position).sub(this.head);
    this.previousRotation.copy(camera.quaternion);
    this.previousHeading = heading;
    this.previousFov = camera.fov;
    if (this.age >= duration) return camera;

    this.yaw.setFromAxisAngle(up, heading - this.entryHeading);
    this.outgoingEye.copy(this.entryEye).applyQuaternion(this.yaw);
    // Opposing eyes would cross through the dragon instead of staying behind it.
    if (this.outgoingEye.dot(this.previousEye) <= 0) {
      this.age = duration;
      return camera;
    }
    const blend = MathUtils.smootherstep(this.age, 0, duration);
    this.age += dt;
    const result = this.camera.copy(camera, false);
    result.position.copy(this.outgoingEye).add(this.head).lerp(camera.position, blend);
    result.quaternion.copy(this.entryRotation).premultiply(this.yaw).slerp(camera.quaternion, blend);
    result.fov = MathUtils.lerp(this.entryFov, camera.fov, blend);
    result.updateProjectionMatrix();
    result.updateMatrixWorld(true);
    return result;
  }
}
