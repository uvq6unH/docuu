import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three';

export interface AvatarMotionState {
  speed: number;
  crouch: boolean;
  grounded: boolean;
  jailed?: boolean;
}

export interface AvatarMaterials {
  skin: MeshStandardMaterial;
  hair: MeshStandardMaterial;
  primary: MeshStandardMaterial;
  secondary: MeshStandardMaterial;
  trim: MeshStandardMaterial;
  accent: MeshStandardMaterial;
  leather: MeshStandardMaterial;
}

/**
 * Creates low-poly materials for police or robber matching MAP_AND_ASSETS.md:
 * - Police: #2876C9 primary, #1C2A38 dark trousers, #F1C40F gold badge/insignia
 * - Robber: #EC8F32 primary, #4A3525 earth trousers, #D4A373 rustic bandana
 */
export function createAvatarMaterials(role: 'POLICE' | 'ROBBER'): AvatarMaterials {
  const isPolice = role === 'POLICE';
  return {
    skin: new MeshStandardMaterial({
      color: new Color('#f2c9ac'),
      roughness: 0.85,
      flatShading: true,
    }),
    hair: new MeshStandardMaterial({
      color: new Color(isPolice ? '#1f2937' : '#2d1f18'),
      roughness: 0.9,
      flatShading: true,
    }),
    primary: new MeshStandardMaterial({
      color: new Color(isPolice ? '#2876c9' : '#ec8f32'),
      roughness: 0.8,
      flatShading: true,
    }),
    secondary: new MeshStandardMaterial({
      color: new Color(isPolice ? '#1c2a38' : '#4a3525'),
      roughness: 0.85,
      flatShading: true,
    }),
    trim: new MeshStandardMaterial({
      color: new Color(isPolice ? '#0f172a' : '#d4a373'),
      roughness: 0.85,
      flatShading: true,
      side: DoubleSide,
    }),
    accent: new MeshStandardMaterial({
      color: new Color(isPolice ? '#f1c40f' : '#c06c27'),
      roughness: 0.6,
      metalness: isPolice ? 0.4 : 0.0,
      flatShading: true,
    }),
    leather: new MeshStandardMaterial({
      color: new Color(isPolice ? '#18181b' : '#2e2016'),
      roughness: 0.9,
      flatShading: true,
    }),
  };
}

export class CharacterAvatar {
  public readonly root: Group;
  public role: 'POLICE' | 'ROBBER';

  // Hierarchical skeletal joints
  private hips: Group;
  private torso: Group;
  private headGroup: Group;
  private shoulderL: Group;
  private shoulderR: Group;
  private armUpperL: Group;
  private armUpperR: Group;
  private armLowerL: Group;
  private armLowerR: Group;
  private hipL: Group;
  private hipR: Group;
  private legUpperL: Group;
  private legUpperR: Group;
  private legLowerL: Group;
  private legLowerR: Group;

  // Hat / Accessory containers
  private policeAccessories: Group;
  private robberAccessories: Group;

  private materials: AvatarMaterials;
  private animTime = 0;
  private currentCrouchBlend = 0;

  constructor(role: 'POLICE' | 'ROBBER') {
    this.role = role;
    this.root = new Group();
    this.root.name = `avatar_${role.toLowerCase()}`;
    this.materials = createAvatarMaterials(role);

    // Reusable shared primitive geometries
    const geoBox = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
    const makeMesh = (geo: BoxGeometry | CylinderGeometry, mat: MeshStandardMaterial, name: string) => {
      const mesh = new Mesh(geo, mat);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };

    // 1. Hips (Pelvis at Y = 0.76)
    this.hips = new Group();
    this.hips.name = 'hips';
    this.hips.position.set(0, 0.76, 0);
    this.root.add(this.hips);

    const pelvisMesh = makeMesh(geoBox(0.30, 0.14, 0.20), this.materials.secondary, 'pelvis_mesh');
    this.hips.add(pelvisMesh);

    // Belt
    const beltMesh = makeMesh(geoBox(0.31, 0.05, 0.21), this.materials.leather, 'belt_mesh');
    beltMesh.position.set(0, 0.05, 0);
    this.hips.add(beltMesh);

    const buckleMesh = makeMesh(geoBox(0.06, 0.06, 0.215), this.materials.accent, 'buckle_mesh');
    buckleMesh.position.set(0, 0.05, 0);
    this.hips.add(buckleMesh);

    // 2. Torso (Pivot at top of hips, Y = 0.07)
    this.torso = new Group();
    this.torso.name = 'torso';
    this.torso.position.set(0, 0.07, 0);
    this.hips.add(this.torso);

    // Chest & abdomen (Height 0.42, from Y=0.0 to 0.42)
    const chestMesh = makeMesh(geoBox(0.34, 0.42, 0.22), this.materials.primary, 'chest_mesh');
    chestMesh.position.set(0, 0.21, 0);
    this.torso.add(chestMesh);

    // Collar
    const collarMesh = makeMesh(geoBox(0.22, 0.05, 0.23), this.materials.primary, 'collar_mesh');
    collarMesh.position.set(0, 0.41, 0);
    this.torso.add(collarMesh);

    // 3. Neck & Head (Pivot at top of torso, Y = 0.44)
    this.headGroup = new Group();
    this.headGroup.name = 'head_group';
    this.headGroup.position.set(0, 0.44, 0);
    this.torso.add(this.headGroup);

    // Neck
    const neckMesh = makeMesh(geoBox(0.11, 0.07, 0.11), this.materials.skin, 'neck_mesh');
    neckMesh.position.set(0, 0.03, 0);
    this.headGroup.add(neckMesh);

    // Stylized chibi head (0.26m cube, centered at Y = 0.18, top at Y = 0.31)
    const headMesh = makeMesh(geoBox(0.26, 0.26, 0.26), this.materials.skin, 'head_mesh');
    headMesh.position.set(0, 0.18, 0);
    this.headGroup.add(headMesh);

    // Face: Eyes at eye level (~1.55m world height)
    const eyeL = makeMesh(geoBox(0.04, 0.05, 0.02), this.materials.hair, 'eye_L');
    eyeL.position.set(0.065, 0.18, -0.132);
    this.headGroup.add(eyeL);

    const eyeR = makeMesh(geoBox(0.04, 0.05, 0.02), this.materials.hair, 'eye_R');
    eyeR.position.set(-0.065, 0.18, -0.132);
    this.headGroup.add(eyeR);

    // Hair cap / base
    const hairTop = makeMesh(geoBox(0.27, 0.05, 0.27), this.materials.hair, 'hair_top');
    hairTop.position.set(0, 0.30, 0);
    this.headGroup.add(hairTop);

    const hairBack = makeMesh(geoBox(0.27, 0.18, 0.05), this.materials.hair, 'hair_back');
    hairBack.position.set(0, 0.19, 0.12);
    this.headGroup.add(hairBack);

    // Role-specific accessories
    this.policeAccessories = new Group();
    this.policeAccessories.name = 'police_accessories';
    this.headGroup.add(this.policeAccessories);

    // Police Peaked Cap (Kepi, brings top to ~1.70m)
    const kepiCrown = makeMesh(geoBox(0.28, 0.07, 0.28), this.materials.primary, 'kepi_crown');
    kepiCrown.position.set(0, 0.33, -0.01);
    this.policeAccessories.add(kepiCrown);

    const kepiBrim = makeMesh(geoBox(0.26, 0.02, 0.10), this.materials.trim, 'kepi_brim');
    kepiBrim.position.set(0, 0.29, -0.16);
    kepiBrim.rotation.x = 0.12;
    this.policeAccessories.add(kepiBrim);

    const kepiBadge = makeMesh(geoBox(0.045, 0.045, 0.02), this.materials.accent, 'kepi_badge');
    kepiBadge.position.set(0, 0.34, -0.152);
    this.policeAccessories.add(kepiBadge);

    // Police Chest Badge & Epaulets
    const chestBadge = makeMesh(geoBox(0.05, 0.05, 0.02), this.materials.accent, 'chest_badge');
    chestBadge.position.set(0.08, 0.28, -0.115);
    this.torso.add(chestBadge);
    this.policeAccessories.add(chestBadge);

    const epauletL = makeMesh(geoBox(0.07, 0.02, 0.12), this.materials.accent, 'epaulet_L');
    epauletL.position.set(0.18, 0.40, 0);
    this.torso.add(epauletL);
    this.policeAccessories.add(epauletL);

    const epauletR = makeMesh(geoBox(0.07, 0.02, 0.12), this.materials.accent, 'epaulet_R');
    epauletR.position.set(-0.18, 0.40, 0);
    this.torso.add(epauletR);
    this.policeAccessories.add(epauletR);

    // Robber Accessories: Traditional Bandana / Headscarf
    this.robberAccessories = new Group();
    this.robberAccessories.name = 'robber_accessories';
    this.headGroup.add(this.robberAccessories);

    const bandanaFront = makeMesh(geoBox(0.28, 0.06, 0.28), this.materials.trim, 'bandana_front');
    bandanaFront.position.set(0, 0.26, 0);
    this.robberAccessories.add(bandanaFront);

    const bandanaKnot = makeMesh(geoBox(0.07, 0.08, 0.05), this.materials.trim, 'bandana_knot');
    bandanaKnot.position.set(0, 0.24, 0.16);
    bandanaKnot.rotation.z = 0.2;
    this.robberAccessories.add(bandanaKnot);

    // 4. Arms
    // Left Shoulder & Arm
    this.shoulderL = new Group();
    this.shoulderL.name = 'shoulder_L';
    this.shoulderL.position.set(0.21, 0.36, 0);
    this.torso.add(this.shoulderL);

    this.armUpperL = new Group();
    this.armUpperL.name = 'arm_upper_L';
    this.shoulderL.add(this.armUpperL);
    const armUpperMeshL = makeMesh(geoBox(0.09, 0.19, 0.09), this.materials.primary, 'arm_upper_mesh_L');
    armUpperMeshL.position.set(0, -0.095, 0);
    this.armUpperL.add(armUpperMeshL);

    this.armLowerL = new Group();
    this.armLowerL.name = 'arm_lower_L';
    this.armLowerL.position.set(0, -0.19, 0);
    this.armUpperL.add(this.armLowerL);
    const armLowerMeshL = makeMesh(geoBox(0.08, 0.17, 0.08), this.materials.primary, 'arm_lower_mesh_L');
    armLowerMeshL.position.set(0, -0.085, 0);
    this.armLowerL.add(armLowerMeshL);

    const handL = makeMesh(geoBox(0.07, 0.08, 0.07), this.materials.skin, 'hand_L');
    handL.position.set(0, -0.19, 0);
    this.armLowerL.add(handL);

    // Right Shoulder & Arm
    this.shoulderR = new Group();
    this.shoulderR.name = 'shoulder_R';
    this.shoulderR.position.set(-0.21, 0.36, 0);
    this.torso.add(this.shoulderR);

    this.armUpperR = new Group();
    this.armUpperR.name = 'arm_upper_R';
    this.shoulderR.add(this.armUpperR);
    const armUpperMeshR = makeMesh(geoBox(0.09, 0.19, 0.09), this.materials.primary, 'arm_upper_mesh_R');
    armUpperMeshR.position.set(0, -0.095, 0);
    this.armUpperR.add(armUpperMeshR);

    this.armLowerR = new Group();
    this.armLowerR.name = 'arm_lower_R';
    this.armLowerR.position.set(0, -0.19, 0);
    this.armUpperR.add(this.armLowerR);
    const armLowerMeshR = makeMesh(geoBox(0.08, 0.17, 0.08), this.materials.primary, 'arm_lower_mesh_R');
    armLowerMeshR.position.set(0, -0.085, 0);
    this.armLowerR.add(armLowerMeshR);

    const handR = makeMesh(geoBox(0.07, 0.08, 0.07), this.materials.skin, 'hand_R');
    handR.position.set(0, -0.19, 0);
    this.armLowerR.add(handR);

    // 5. Legs
    // Left Hip & Leg
    this.hipL = new Group();
    this.hipL.name = 'hip_L';
    this.hipL.position.set(0.09, -0.05, 0);
    this.hips.add(this.hipL);

    this.legUpperL = new Group();
    this.legUpperL.name = 'leg_upper_L';
    this.hipL.add(this.legUpperL);
    const legUpperMeshL = makeMesh(geoBox(0.11, 0.34, 0.12), this.materials.secondary, 'leg_upper_mesh_L');
    legUpperMeshL.position.set(0, -0.17, 0);
    this.legUpperL.add(legUpperMeshL);

    this.legLowerL = new Group();
    this.legLowerL.name = 'leg_lower_L';
    this.legLowerL.position.set(0, -0.34, 0);
    this.legUpperL.add(this.legLowerL);
    const legLowerMeshL = makeMesh(geoBox(0.10, 0.30, 0.11), this.materials.secondary, 'leg_lower_mesh_L');
    legLowerMeshL.position.set(0, -0.15, 0);
    this.legLowerL.add(legLowerMeshL);

    // Foot / Shoe (Length 0.16 extending forward)
    const footL = makeMesh(geoBox(0.11, 0.07, 0.16), this.materials.leather, 'foot_L');
    footL.position.set(0, -0.335, -0.03);
    this.legLowerL.add(footL);

    // Right Hip & Leg
    this.hipR = new Group();
    this.hipR.name = 'hip_R';
    this.hipR.position.set(-0.09, -0.05, 0);
    this.hips.add(this.hipR);

    this.legUpperR = new Group();
    this.legUpperR.name = 'leg_upper_R';
    this.hipR.add(this.legUpperR);
    const legUpperMeshR = makeMesh(geoBox(0.11, 0.34, 0.12), this.materials.secondary, 'leg_upper_mesh_R');
    legUpperMeshR.position.set(0, -0.17, 0);
    this.legUpperR.add(legUpperMeshR);

    this.legLowerR = new Group();
    this.legLowerR.name = 'leg_lower_R';
    this.legLowerR.position.set(0, -0.34, 0);
    this.legUpperR.add(this.legLowerR);
    const legLowerMeshR = makeMesh(geoBox(0.10, 0.30, 0.11), this.materials.secondary, 'leg_lower_mesh_R');
    legLowerMeshR.position.set(0, -0.15, 0);
    this.legLowerR.add(legLowerMeshR);

    const footR = makeMesh(geoBox(0.11, 0.07, 0.16), this.materials.leather, 'foot_R');
    footR.position.set(0, -0.335, -0.03);
    this.legLowerR.add(footR);

    this.setRole(role);
  }

  public setRole(role: 'POLICE' | 'ROBBER'): void {
    this.role = role;
    const isPolice = role === 'POLICE';
    this.policeAccessories.visible = isPolice;
    this.policeAccessories.traverse((child) => { child.visible = isPolice; });
    this.robberAccessories.visible = !isPolice;
    this.robberAccessories.traverse((child) => { child.visible = !isPolice; });

    const colors = {
      POLICE: {
        primary: new Color('#2876c9'),
        secondary: new Color('#1c2a38'),
        trim: new Color('#0f172a'),
        accent: new Color('#f1c40f'),
        leather: new Color('#18181b'),
      },
      ROBBER: {
        primary: new Color('#ec8f32'),
        secondary: new Color('#4a3525'),
        trim: new Color('#d4a373'),
        accent: new Color('#c06c27'),
        leather: new Color('#2e2016'),
      },
    }[role];

    this.materials.primary.color.copy(colors.primary);
    this.materials.secondary.color.copy(colors.secondary);
    this.materials.trim.color.copy(colors.trim);
    this.materials.accent.color.copy(colors.accent);
    this.materials.leather.color.copy(colors.leather);
  }

  /**
   * Procedural skeletal kinematics:
   * Drives idle breathing, walking, sprint running, crouching (down to 1.1m), and jailed sitting.
   */
  public update(dtSeconds: number, motion: AvatarMotionState): void {
    this.animTime += dtSeconds;
    const { speed, crouch, jailed } = motion;

    // Smooth crouch blending (0 = standing ~1.7m, 1 = crouching ~1.1m)
    const targetCrouch = crouch ? 1 : 0;
    this.currentCrouchBlend += (targetCrouch - this.currentCrouchBlend) * Math.min(1, dtSeconds * 14);

    if (jailed) {
      // Jailed sitting pose
      this.hips.position.y = 0.25;
      this.torso.rotation.x = 0.2;
      this.legUpperL.rotation.x = -1.4;
      this.legUpperR.rotation.x = -1.4;
      this.legLowerL.rotation.x = 1.6;
      this.legLowerR.rotation.x = 1.6;
      this.armUpperL.rotation.x = -0.6;
      this.armUpperR.rotation.x = -0.6;
      this.armLowerL.rotation.x = -0.8;
      this.armLowerR.rotation.x = -0.8;
      this.headGroup.rotation.x = 0.15;
      return;
    }

    // Dynamic Hip Height: 0.76 standing -> 0.40 crouching
    const baseHipY = 0.76 - this.currentCrouchBlend * 0.36;

    if (speed > 0.15) {
      // Walking / Running locomotion cycle
      const isSprinting = speed > 4.2;
      const strideFreq = isSprinting ? speed * 2.2 : speed * 2.8;
      const cycle = this.animTime * strideFreq;
      const strideAmp = isSprinting ? 0.85 : 0.55;
      const armAmp = isSprinting ? 1.05 : 0.60;

      // Bobbing while walking
      const bob = Math.abs(Math.sin(cycle)) * (isSprinting ? 0.05 : 0.03);
      this.hips.position.y = baseHipY + bob;

      // Leg stride swing
      const legL = Math.sin(cycle) * strideAmp;
      const legR = -legL;

      this.legUpperL.rotation.x = legL + this.currentCrouchBlend * 0.7;
      this.legUpperR.rotation.x = legR + this.currentCrouchBlend * 0.7;

      // Natural knee flexion on back-swing / foot lift
      this.legLowerL.rotation.x = Math.max(0, -legL * 1.3) + this.currentCrouchBlend * 0.9;
      this.legLowerR.rotation.x = Math.max(0, -legR * 1.3) + this.currentCrouchBlend * 0.9;

      // Opposing arm swings
      const armL = -Math.sin(cycle) * armAmp;
      const armR = -armL;

      this.armUpperL.rotation.x = armL;
      this.armUpperR.rotation.x = armR;

      // Elbows bent naturally
      this.armLowerL.rotation.x = isSprinting ? -0.8 : -0.3;
      this.armLowerR.rotation.x = isSprinting ? -0.8 : -0.3;

      // Torso leans forward during sprint or crouch
      const forwardLean = (isSprinting ? 0.22 : 0.08) + this.currentCrouchBlend * 0.40;
      this.torso.rotation.x = forwardLean;
      this.headGroup.rotation.x = -forwardLean * 0.75;
    } else {
      // Idle breathing cycle
      const breath = Math.sin(this.animTime * 2.5);
      this.hips.position.y = baseHipY + breath * 0.012;

      // Standing / Crouching posture
      this.torso.rotation.x = this.currentCrouchBlend * 0.40;
      this.headGroup.rotation.x = -this.currentCrouchBlend * 0.30;

      this.legUpperL.rotation.x = this.currentCrouchBlend * 0.85;
      this.legUpperR.rotation.x = this.currentCrouchBlend * 0.85;
      this.legLowerL.rotation.x = this.currentCrouchBlend * 1.15;
      this.legLowerR.rotation.x = this.currentCrouchBlend * 1.15;

      // Relaxed arms with subtle sway
      this.armUpperL.rotation.x = breath * 0.04;
      this.armUpperR.rotation.x = -breath * 0.04;
      this.armLowerL.rotation.x = -0.15;
      this.armLowerR.rotation.x = -0.15;
    }
  }

  public dispose(): void {
    const disposeObj = (obj: Object3D) => {
      if (obj instanceof Mesh) {
        obj.geometry.dispose();
      }
      for (const child of obj.children) {
        disposeObj(child);
      }
    };
    disposeObj(this.root);
    Object.values(this.materials).forEach(mat => mat.dispose());
  }
}

export function createCharacterModel(role: 'POLICE' | 'ROBBER'): CharacterAvatar {
  return new CharacterAvatar(role);
}
