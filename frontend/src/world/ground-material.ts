import { DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RGBAFormat, SRGBColorSpace } from 'three';

// Visual ground only. World coordinates and collision remain authoritative in shared map.
export function createGroundMaterial() {
  const resolution = 1024;
  const pixels = new Uint8Array(resolution * resolution * 4);
  for (let row = 0; row < resolution; row++) {
    for (let column = 0; column < resolution; column++) {
      const x = (column / (resolution - 1)) * 80 - 40;
      const z = (row / (resolution - 1)) * 80 - 40;

      // Fine grain organic noise
      const grain = Math.sin(column * 127.1 + row * 311.7) * 43758.5453;
      const fineNoise = (grain - Math.floor(grain) - 0.5) * 10;
      const macroNoise = Math.sin(x * 0.35 + z * 0.28) * 8 + Math.cos(x * 0.18 - z * 0.22) * 6;

      // Village intersecting footpaths and center courtyard
      const northSouth = Math.abs(x - Math.sin(z * 0.12) * 1.2);
      const eastWest = Math.abs(z - Math.sin(x * 0.14) * 1.0);
      const diagonal = Math.abs((x - z) * 0.707 - Math.sin((x + z) * 0.08) * 1.4);
      const centerDist = Math.hypot(x, z);
      const courtyard = Math.max(0, Math.min(1, (7.0 - centerDist) * 0.6));

      const lane = Math.min(northSouth, eastWest, diagonal * 1.35);
      const pathEdge = 2.4 + Math.sin(x * 0.85 + z * 0.75) * 0.28;
      const pathDirt = Math.max(0, Math.min(1, (pathEdge - lane) * 1.8));
      const dirt = Math.max(pathDirt, courtyard * 0.82);

      // Grass & Clover color gradient (lush emerald to sunlit olive)
      const grassR = 76 + macroNoise * 0.8;
      const grassG = 138 + macroNoise * 1.1;
      const grassB = 52 + macroNoise * 0.5;

      // Earthen footpath color (warm terracotta ochre to trodden dirt)
      const dirtR = 178 + macroNoise * 0.6;
      const dirtG = 142 + macroNoise * 0.5;
      const dirtB = 92 + macroNoise * 0.4;

      const index = (row * resolution + column) * 4;
      pixels[index] = Math.max(0, Math.min(255, grassR * (1 - dirt) + dirtR * dirt + fineNoise));
      pixels[index + 1] = Math.max(0, Math.min(255, grassG * (1 - dirt) + dirtG * dirt + fineNoise));
      pixels[index + 2] = Math.max(0, Math.min(255, grassB * (1 - dirt) + dirtB * dirt + fineNoise));
      pixels[index + 3] = 255;
    }
  }

  const texture = new DataTexture(pixels, resolution, resolution, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return new MeshStandardMaterial({ map: texture, roughness: 0.96 });
}
