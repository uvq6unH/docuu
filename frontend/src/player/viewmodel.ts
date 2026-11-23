import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  type PerspectiveCamera,
} from 'three';

export interface ViewModelUpdateParams {
  dtSeconds: number;
  speed: number;
  sprint: boolean;
  crouch: boolean;
  grounded: boolean;
  verticalSpeed: number;
  deltaYaw: number;
  deltaPitch: number;
  strafeInput: number; // -1 (left), +1 (right), 0 (none)
  isRescuing?: boolean;
}

export interface CameraMotionOutput {
  bobX: number;
  bobY: number;
  roll: number;
  landingDip: number;
}

/**
 * Creates low-poly first-person arms & hands (Viewmodel) matching the folk game aesthetic.
 * Attached directly to camera to provide first-person presence, locomotion arm swings,
 * action gestures (police capture swipe, robber rescue untie), mouse sway inertia,
 * and landing physics.
 */
export class ViewModelHands {
  public readonly root: Group;
  public role: 'POLICE' | 'ROBBER';

  private swayGroup: Group;
  private armL: Group;
  private armR: Group;

  private meshSleeveL: Mesh;
  private meshSleeveR: Mesh;
  private meshCuffL: Mesh;
  private meshCuffR: Mesh;
  private meshHandL: Mesh;
  private meshHandR: Mesh;
  private meshFingersL: Mesh;
  private meshFingersR: Mesh;
  private meshThumbL: Mesh;
  private meshThumbR: Mesh;

  private matSkin: MeshStandardMaterial;
  private matSleeve: MeshStandardMaterial;
  private matCuff: MeshStandardMaterial;
  private matAccent: MeshStandardMaterial;

  private customShirtColor?: string | undefined;

  // Motion animation state variables
  private walkCycle = 0;
  private idleTime = 0;
  private wasAirborne = false;
  private landingDip = 0;
  private captureSwingTime = 0; // > 0 when capture action is active
  private rescueAnimTime = 0;

  // Viewmodel mouse sway lag
  private currentSwayX = 0;
  private currentSwayY = 0;
  private currentSwayRoll = 0;

  // Camera motion / head bob state
  private camBobCycle = 0;
  private camLandingDip = 0;
  private camRoll = 0;

  // Default arm base transforms (camera-local space)
  private readonly basePosL = { x: -0.24, y: -0.23, z: -0.26 };
  private readonly basePosR = { x: 0.24, y: -0.23, z: -0.26 };
  private readonly baseRotL = { x: 0.18, y: -0.32, z: 0.16 };
  private readonly baseRotR = { x: 0.18, y: 0.32, z: -0.16 };

  constructor(role: 'POLICE' | 'ROBBER' = 'ROBBER') {
    this.role = role;
    this.root = new Group();
    this.root.name = 'viewmodel_root';

    // Materials
    const isPolice = role === 'POLICE';
    this.matSkin = new MeshStandardMaterial({
      color: new Color('#f2c9ac'),
      roughness: 0.85,
      flatShading: true,
      depthTest: true,
    });

    this.matSleeve = new MeshStandardMaterial({
      color: new Color(isPolice ? '#2876c9' : '#ec8f32'),
      roughness: 0.8,
      flatShading: true,
      depthTest: true,
    });

    this.matCuff = new MeshStandardMaterial({
      color: new Color(isPolice ? '#1c2a38' : '#d4a373'),
      roughness: 0.85,
      flatShading: true,
      depthTest: true,
    });

    this.matAccent = new MeshStandardMaterial({
      color: new Color(isPolice ? '#f1c40f' : '#8b5a2b'),
      roughness: 0.6,
      flatShading: true,
      depthTest: true,
    });

    // Sway group responds to mouse rotation lag and strafe roll
    this.swayGroup = new Group();
    this.swayGroup.name = 'viewmodel_sway';
    this.root.add(this.swayGroup);

    // Left Arm Setup - Forearm extends along -Z into the screen
    this.armL = new Group();
    this.armL.name = 'viewmodel_arm_L';
    this.armL.position.set(this.basePosL.x, this.basePosL.y, this.basePosL.z);
    this.swayGroup.add(this.armL);

    // Sleeve (forearm)
    const geoSleeve = new BoxGeometry(0.074, 0.074, 0.20);
    this.meshSleeveL = new Mesh(geoSleeve, this.matSleeve);
    this.meshSleeveL.position.set(0, 0, -0.10);
    this.armL.add(this.meshSleeveL);

    // Cuff
    const geoCuff = new BoxGeometry(0.080, 0.080, 0.025);
    this.meshCuffL = new Mesh(geoCuff, this.matCuff);
    this.meshCuffL.position.set(0, 0, -0.202);
    this.armL.add(this.meshCuffL);

    // Hand Palm
    const geoHand = new BoxGeometry(0.064, 0.050, 0.075);
    this.meshHandL = new Mesh(geoHand, this.matSkin);
    this.meshHandL.position.set(0, -0.005, -0.248);
    this.armL.add(this.meshHandL);

    // Fingers
    const geoFingers = new BoxGeometry(0.060, 0.038, 0.042);
    this.meshFingersL = new Mesh(geoFingers, this.matSkin);
    this.meshFingersL.position.set(0, -0.008, -0.295);
    this.armL.add(this.meshFingersL);

    // Thumb (angled inwards)
    const geoThumb = new BoxGeometry(0.022, 0.022, 0.034);
    this.meshThumbL = new Mesh(geoThumb, this.matSkin);
    this.meshThumbL.position.set(0.036, 0.008, -0.245);
    this.armL.add(this.meshThumbL);

    // Right Arm Setup (mirrored)
    this.armR = new Group();
    this.armR.name = 'viewmodel_arm_R';
    this.armR.position.set(this.basePosR.x, this.basePosR.y, this.basePosR.z);
    this.swayGroup.add(this.armR);

    this.meshSleeveR = new Mesh(geoSleeve, this.matSleeve);
    this.meshSleeveR.position.set(0, 0, -0.10);
    this.armR.add(this.meshSleeveR);

    this.meshCuffR = new Mesh(geoCuff, this.matCuff);
    this.meshCuffR.position.set(0, 0, -0.202);
    this.armR.add(this.meshCuffR);

    this.meshHandR = new Mesh(geoHand, this.matSkin);
    this.meshHandR.position.set(0, -0.005, -0.248);
    this.armR.add(this.meshHandR);

    this.meshFingersR = new Mesh(geoFingers, this.matSkin);
    this.meshFingersR.position.set(0, -0.008, -0.295);
    this.armR.add(this.meshFingersR);

    this.meshThumbR = new Mesh(geoThumb, this.matSkin);
    this.meshThumbR.position.set(-0.036, 0.008, -0.245);
    this.armR.add(this.meshThumbR);

    // Initial orientation: arms angled slightly inwards and upwards towards crosshair
    this.armL.rotation.set(this.baseRotL.x, this.baseRotL.y, this.baseRotL.z);
    this.armR.rotation.set(this.baseRotR.x, this.baseRotR.y, this.baseRotR.z);
    this.armR.rotation.set(0.35, -0.22, 0.15);
  }

  /**
   * Attaches viewmodel root directly to Three.js camera.
   */
  public attachToCamera(camera: PerspectiveCamera): void {
    camera.add(this.root);
  }

  public setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  public setRole(role: 'POLICE' | 'ROBBER'): void {
    this.role = role;
    const isPolice = role === 'POLICE';
    if (!this.customShirtColor) {
      this.matSleeve.color.set(isPolice ? '#2876c9' : '#ec8f32');
    }
    this.matCuff.color.set(isPolice ? '#1c2a38' : '#d4a373');
  }

  public setShirtColor(color?: string): void {
    this.customShirtColor = color;
    if (color) {
      this.matSleeve.color.set(color);
    } else {
      this.setRole(this.role);
    }
  }

  /**
   * Triggers the police capture swipe animation.
   */
  public triggerCapture(): void {
    this.captureSwingTime = 0.38; // 380ms animation duration
  }

  /**
   * Primary animation update step called every render frame at 60 FPS.
   * Drives viewmodel arm swings, action gestures, breathing, landing recoil, and mouse sway.
   */
  public update(params: ViewModelUpdateParams): CameraMotionOutput {
    const { dtSeconds, speed, sprint, crouch, grounded, deltaYaw, deltaPitch, strafeInput, isRescuing } = params;
    const dt = Math.min(0.1, Math.max(0.001, dtSeconds));

    // 1. Detect landing from air
    if (!this.wasAirborne && !grounded) {
      this.wasAirborne = true;
    } else if (this.wasAirborne && grounded) {
      this.wasAirborne = false;
      this.landingDip = -0.065;
      this.camLandingDip = -0.050;
    }

    // Smooth landing recovery
    this.landingDip *= Math.exp(-18 * dt);
    this.camLandingDip *= Math.exp(-16 * dt);

    // 2. Mouse Sway & Inertia
    const targetSwayX = Math.max(-0.035, Math.min(0.035, -deltaYaw * 0.0028));
    const targetSwayY = Math.max(-0.025, Math.min(0.025, deltaPitch * 0.0028));
    const targetSwayRoll = Math.max(-0.08, Math.min(0.08, deltaYaw * 0.005 - strafeInput * 0.035));

    this.currentSwayX += (targetSwayX - this.currentSwayX) * (1 - Math.exp(-15 * dt));
    this.currentSwayY += (targetSwayY - this.currentSwayY) * (1 - Math.exp(-15 * dt));
    this.currentSwayRoll += (targetSwayRoll - this.currentSwayRoll) * (1 - Math.exp(-15 * dt));

    this.swayGroup.position.set(this.currentSwayX, this.currentSwayY, 0);
    this.swayGroup.rotation.z = this.currentSwayRoll;

    // 3. Action Gesture: Capture Swing (Police)
    let captureOffsetZ = 0;
    let captureOffsetX = 0;
    let captureRotX = 0;
    let captureRotY = 0;
    let captureRotZ = 0;

    if (this.captureSwingTime > 0) {
      this.captureSwingTime -= dt;
      const progress = 1.0 - Math.max(0, this.captureSwingTime / 0.38); // 0 -> 1
      const strikeProgress = Math.sin(progress * Math.PI); // Peak at mid-stroke

      captureOffsetZ = -strikeProgress * 0.16; // Lunges forward into screen
      captureOffsetX = -strikeProgress * 0.08; // Swipes toward center
      captureRotX = strikeProgress * 0.45;     // Forward reach/grab
      captureRotY = -strikeProgress * 0.35;
      captureRotZ = strikeProgress * 0.30;
    }

    // 4. Action Gesture: Rescue Untying (Robber)
    let rescueBobL = 0;
    let rescueBobR = 0;
    if (isRescuing) {
      this.rescueAnimTime += dt * 18;
      rescueBobL = Math.sin(this.rescueAnimTime) * 0.025;
      rescueBobR = Math.cos(this.rescueAnimTime) * 0.025;
    }

    // 5. Locomotion Arm Swing & Idle Breathing
    let swingL_Z: number;
    let swingR_Z: number;
    let swingL_Y: number;
    let swingR_Y: number;
    let swingL_RotX: number;
    let swingR_RotX: number;
    let swingL_RotZ: number;
    let swingR_RotZ: number;

    let bobX = 0;
    let bobY = 0;

    const isMoving = speed > 0.25;

    if (isMoving && grounded) {
      // Dynamic frequency: Sprint ~14 rad/s, Walk ~8.5 rad/s
      const freq = sprint ? 14.0 : 8.5;
      this.walkCycle += dt * freq;
      this.camBobCycle += dt * freq;

      const ampZ = sprint ? 0.085 : 0.040;
      const ampY = sprint ? 0.028 : 0.012;
      const rotAmpX = sprint ? 0.45 : 0.22;
      const rotAmpZ = sprint ? 0.14 : 0.07;

      // Opposing arm swings (Left vs Right)
      const phase = this.walkCycle;
      swingL_Z = Math.sin(phase) * ampZ;
      swingR_Z = -Math.sin(phase) * ampZ;

      swingL_Y = Math.abs(Math.sin(phase)) * ampY;
      swingR_Y = Math.abs(Math.cos(phase)) * ampY;

      swingL_RotX = Math.sin(phase) * rotAmpX;
      swingR_RotX = -Math.sin(phase) * rotAmpX;

      swingL_RotZ = Math.cos(phase) * rotAmpZ;
      swingR_RotZ = -Math.cos(phase) * rotAmpZ;

      // Camera Head Bobbing
      bobY = Math.abs(Math.sin(this.camBobCycle)) * (sprint ? 0.038 : 0.018);
      bobX = Math.cos(this.camBobCycle * 0.5) * (sprint ? 0.022 : 0.010);
    } else {
      // Idle Breathing
      this.idleTime += dt * 2.2;
      const breath = Math.sin(this.idleTime);

      swingL_Z = 0;
      swingR_Z = 0;
      swingL_Y = breath * 0.005;
      swingR_Y = -breath * 0.005;
      swingL_RotX = breath * 0.025;
      swingR_RotX = breath * 0.025;
      swingL_RotZ = 0;
      swingR_RotZ = 0;
    }

    // Crouch posture: pull arms closer inward and lower down
    const crouchOffset = crouch ? -0.05 : 0.0;
    const airOffset = !grounded ? 0.035 : 0.0;

    // Apply computed positions & rotations to arms
    // Left Arm
    this.armL.position.set(
      this.basePosL.x + (crouch ? 0.03 : 0),
      this.basePosL.y + swingL_Y + crouchOffset + airOffset + this.landingDip + rescueBobL,
      this.basePosL.z + swingL_Z + (isRescuing ? -0.08 : 0)
    );
    this.armL.rotation.set(
      this.baseRotL.x + swingL_RotX + (crouch ? 0.15 : 0) + (isRescuing ? 0.3 : 0),
      this.baseRotL.y + (isRescuing ? 0.25 : 0),
      this.baseRotL.z + swingL_RotZ
    );

    // Right Arm
    this.armR.position.set(
      this.basePosR.x + captureOffsetX + (crouch ? -0.03 : 0),
      this.basePosR.y + swingR_Y + crouchOffset + airOffset + this.landingDip + rescueBobR,
      this.basePosR.z + swingR_Z + captureOffsetZ + (isRescuing ? -0.08 : 0)
    );
    this.armR.rotation.set(
      this.baseRotR.x + swingR_RotX + captureRotX + (crouch ? 0.15 : 0) + (isRescuing ? 0.3 : 0),
      this.baseRotR.y + captureRotY - (isRescuing ? 0.25 : 0),
      this.baseRotR.z + swingR_RotZ + captureRotZ
    );

    // Camera Strafe Roll Banking
    const targetCamRoll = -strafeInput * (sprint ? 0.026 : 0.016) - deltaYaw * 0.015;
    this.camRoll += (targetCamRoll - this.camRoll) * (1 - Math.exp(-14 * dt));

    return {
      bobX,
      bobY,
      roll: this.camRoll,
      landingDip: this.camLandingDip,
    };
  }

  public dispose(): void {
    this.meshSleeveL.geometry.dispose();
    this.meshSleeveR.geometry.dispose();
    this.meshCuffL.geometry.dispose();
    this.meshCuffR.geometry.dispose();
    this.meshHandL.geometry.dispose();
    this.meshHandR.geometry.dispose();
    this.meshFingersL.geometry.dispose();
    this.meshFingersR.geometry.dispose();
    this.meshThumbL.geometry.dispose();
    this.meshThumbR.geometry.dispose();

    this.matSkin.dispose();
    this.matSleeve.dispose();
    this.matCuff.dispose();
    this.matAccent.dispose();

    this.root.clear();
  }
}
