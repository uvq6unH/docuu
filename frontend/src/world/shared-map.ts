import data from '../../../packages/shared/maps/vietnam-village.json';
import { validateMap } from '../../../packages/shared/src/map';

export const villageMap = validateMap(data);
