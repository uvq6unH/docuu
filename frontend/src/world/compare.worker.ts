import { compareRoutes, type ComparisonInput } from './compare-routes';

self.onmessage = (event: MessageEvent<ComparisonInput>) => {
  self.postMessage(compareRoutes(event.data));
};
