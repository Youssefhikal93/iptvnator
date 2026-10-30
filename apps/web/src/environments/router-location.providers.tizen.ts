import { RouterFeatures, withHashLocation } from '@angular/router';

// Swapped in for router-location.providers.ts by the tizen build configuration
// only (apps/tizen): the widget's file: origin rejects path changes through
// history.replaceState, so routes live in the fragment (index.html#/workspace).
// The tizen configuration also sets <base href="index.html">: assets still
// resolve next to index.html, and '#/route' resolves to index.html#/route
// instead of the directory URL, which file: would reject as a path change.
export const routerLocationFeatures: RouterFeatures[] = [withHashLocation()];
