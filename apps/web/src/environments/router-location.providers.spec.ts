import { HashLocationStrategy, LocationStrategy } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { routerLocationFeatures } from './router-location.providers';
import { routerLocationFeatures as tizenRouterLocationFeatures } from './router-location.providers.tizen';

describe('router location features', () => {
    it('keeps path routing for web, PWA and Electron builds', () => {
        TestBed.configureTestingModule({
            providers: [provideRouter([], ...routerLocationFeatures)],
        });
        expect(TestBed.inject(LocationStrategy)).not.toBeInstanceOf(
            HashLocationStrategy
        );
    });

    it('routes in the URL fragment for the Tizen widget build', () => {
        TestBed.configureTestingModule({
            providers: [provideRouter([], ...tizenRouterLocationFeatures)],
        });
        expect(TestBed.inject(LocationStrategy)).toBeInstanceOf(
            HashLocationStrategy
        );
    });
});
