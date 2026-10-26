const { defineConfig } = require('@playwright/test');

// TV_TEST_PORT lets two worktrees run the suite at the same time.
const port = Number(process.env.TV_TEST_PORT || 8767);

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
        baseURL: 'http://localhost:' + port,
        viewport: { width: 1920, height: 1080 },
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'node fake-xtream/server.js "" ' + port,
        url: 'http://localhost:' + port,
        reuseExistingServer: true,
    },
});
