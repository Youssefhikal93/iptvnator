import { RouterFeatures } from '@angular/router';

// Web, PWA and Electron keep the default path location strategy. The tizen
// build configuration replaces this file with router-location.providers.tizen.ts:
// a Samsung TV widget runs from a file: origin, where the History API cannot
// change the path, so it routes with the URL fragment instead.
export const routerLocationFeatures: RouterFeatures[] = [];
