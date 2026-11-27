import {
  DataTexture, Float32BufferAttribute, LinearFilter, LinearMipmapLinearFilter,
  Mesh, MeshStandardMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, type Object3D,
} from 'three';

// Texture detail is generated in the client, keeping the Blender source intact.
export function detailModelSurfaces(model: Object3D, roofRidgeAlongZ = false) {
  const textures = new Map<string, DataTexture>();
  model.traverse(part => {
    if (!(part instanceof Mesh) || !(part.material instanceof MeshStandardMaterial)) return;
    const material = part.material;
    const roof = material.name === 'fired_clay';
    const plaster = material.name === 'lime_plaster';
    const wood = ['bark', 'frame', 'bamboo', 'rails', 'posts'].includes(material.name);
    const straw = ['straw', 'under_thatch'].includes(material.name);
    if (!roof && !plaster && !wood && !straw) return;
    if (!textures.has(material.name)) {
      const size = 128;
      const pixels = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const grain = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
          const noise = grain - Math.floor(grain);
          let shade: number;
          if (roof) {
            const joint = y % 32 < 3 || (x + Math.floor(y / 32) * 16) % 32 < 2;
            shade = joint ? 145 : 207 + Math.sin(x / 32 * Math.PI * 2) * 24 + noise * 15;
          } else if (wood || straw) {
            shade = 205 + Math.sin(x * .8 + Math.sin(y * .06) * 2) * 22 + noise * 24;
          } else {
            shade = 247 + noise * 6 - Math.sin(x * .09) * Math.cos(y * .13) * 3;
          }
          const offset = (y * size + x) * 4;
          pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = shade;
          pixels[offset + 3] = 255;
        }
      }
      const texture = new DataTexture(pixels, size, size, RGBAFormat);
      texture.colorSpace = SRGBColorSpace;
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.magFilter = LinearFilter;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      textures.set(material.name, texture);
    }
    material.map = textures.get(material.name)!;
    material.roughness = roof ? .86 : 1;
    const positions = part.geometry.getAttribute('position');
    const normals = part.geometry.getAttribute('normal');
    const uv = new Float32Array(positions.count * 2);
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const horizontal = Math.abs(normals.getY(vertex)) > .5;
      if (roofRidgeAlongZ && horizontal) {
        uv[vertex * 2] = positions.getZ(vertex);
        uv[vertex * 2 + 1] = positions.getX(vertex);
      } else {
        uv[vertex * 2] = Math.abs(normals.getX(vertex)) > .5 ? positions.getZ(vertex) : positions.getX(vertex);
        uv[vertex * 2 + 1] = horizontal ? positions.getZ(vertex) : positions.getY(vertex);
      }
    }
    part.geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  });
}
