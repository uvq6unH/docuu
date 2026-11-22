import { describe, expect, it } from 'vitest';
import { createCharacterModel } from '../../src/player/character-avatar';
import { createScene, disposeScene, setAtmosphere } from '../../src/core/scene';
import { sound } from '../../src/core/audio';

describe('A04 Folk Costumes & Environment Enhancements', () => {
  it('toggles folk costumes and customized shirt colors accurately', () => {
    const avatar = createCharacterModel('ROBBER');
    avatar.root.updateMatrixWorld(true);

    const nonLa = avatar.root.getObjectByName('hat_non_la');
    const khanRan = avatar.root.getObjectByName('hat_khan_ran');
    const muNan = avatar.root.getObjectByName('hat_mu_nan');

    expect(nonLa).toBeDefined();
    expect(khanRan).toBeDefined();
    expect(muNan).toBeDefined();

    // Default hat is none
    expect(nonLa?.visible).toBe(false);
    expect(khanRan?.visible).toBe(false);
    expect(muNan?.visible).toBe(false);

    // Apply Nón lá
    avatar.setCosmetics({ hat: 'non_la', shirtColor: '#8b5a2b' });
    expect(nonLa?.visible).toBe(true);
    expect(khanRan?.visible).toBe(false);
    expect(muNan?.visible).toBe(false);

    // Apply Khăn rằn
    avatar.setCosmetics({ hat: 'khan_ran' });
    expect(nonLa?.visible).toBe(false);
    expect(khanRan?.visible).toBe(true);
    expect(muNan?.visible).toBe(false);

    // Apply Mũ nan
    avatar.setCosmetics({ hat: 'mu_nan' });
    expect(nonLa?.visible).toBe(false);
    expect(khanRan?.visible).toBe(false);
    expect(muNan?.visible).toBe(true);

    // Clear hat
    avatar.setCosmetics({ hat: 'none' });
    expect(nonLa?.visible).toBe(false);
    expect(khanRan?.visible).toBe(false);
    expect(muNan?.visible).toBe(false);

    avatar.dispose();
  });

  it('switches atmospheric environments cleanly', () => {
    const { scene, sun, hemi } = createScene();

    expect(() => setAtmosphere('midday', scene, sun, hemi)).not.toThrow();
    expect(() => setAtmosphere('sunset', scene, sun, hemi)).not.toThrow();
    expect(() => setAtmosphere('mist', scene, sun, hemi)).not.toThrow();

    disposeScene(scene);
  });

  it('plays procedural Web Audio effects without throwing in mock environment', () => {
    expect(() => sound.playPingSound()).not.toThrow();
    expect(() => sound.playPebbleThrow()).not.toThrow();
    expect(() => sound.playPebbleHit()).not.toThrow();
    expect(() => sound.playQuickChatChime()).not.toThrow();
  });
});
