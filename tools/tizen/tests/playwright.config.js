const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './specs',
    workers: 1,
    fullyParallel: false,
    timeout: 90_000,
    expect: { timeout: 15_000 },
    retries: 0,
    reporter: 'list',
    use: {
        channel: 'chrome',
        baseURL: 'http://localhost:8767',
        viewport: { width: 1920, height: 1080 },
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'node fake-xtream/server.js',
        url: 'http://localhost:8767',
        reuseExistingServer: true,
    },
});
