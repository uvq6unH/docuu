import { DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RGBAFormat, SRGBColorSpace } from 'three';

// Visual ground only. World coordinates and collision remain in the shared map.
export function createGroundMaterial() {
  const resolution = 512;
  const pixels = new Uint8Array(resolution * resolution * 4);
  for (let row = 0; row < resolution; row++) {
    for (let column = 0; column < resolution; column++) {
      const x = column / (resolution - 1) * 80 - 40;
      const z = row / (resolution - 1) * 80 - 40;
      const grain = Math.sin(column * 127.1 + row * 311.7) * 43758.5453;
      const noise = (grain - Math.floor(grain) - .5) * 14;
      const meadow = Math.sin(x * .27) * Math.cos(z * .19) * 8;
      const northSouth = Math.abs(x - Math.sin(z * .12) * .8);
      const eastWest = Math.abs(z - Math.sin(x * .14) * .7);
      const lane = Math.min(northSouth, eastWest);
      const edge = 2.1 + Math.sin(x * 1.1 + z * .8) * .14;
      const dirt = Math.max(0, Math.min(1, (edge - lane) * 2));
      const index = (row * resolution + column) * 4;
      pixels[index] = (113 + meadow) * (1 - dirt) + 185 * dirt + noise;
      pixels[index + 1] = (139 + meadow) * (1 - dirt) + 158 * dirt + noise;
      pixels[index + 2] = (66 + meadow * .4) * (1 - dirt) + 112 * dirt + noise;
      pixels[index + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, resolution, resolution, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return new MeshStandardMaterial({ map: texture, roughness: 1 });
}
