import data from '../../../packages/shared/maps/village-v1.json';
import { validateMap } from '../../../packages/shared/src/map';

export const villageMap = validateMap(data);
