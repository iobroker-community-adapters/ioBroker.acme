const engineHelper = require('@iobroker/legacy-testing/engineHelper');
const guiHelper = require('@iobroker/legacy-testing/guiHelper');
const packageJson = require('../package.json');

const adapterName = packageJson.name.replace('iobroker.', '');
let gPage;
const rootDir = `${__dirname}/../`;

describe('test-admin-gui', () => {
    before(async function () {
        this.timeout(240_000);

        // install js-controller, admin and matter
        await engineHelper.startIoBrokerAdapters();
        const { page } = await guiHelper.startBrowser(adapterName, rootDir, process.env.CI === 'true', '#tab-instances/config/system.adapter.acme.0/statusTab');
        gPage = page;
    });

    it('Check admin server', async function () {
        this.timeout(150_000);
        return new Promise(resolve =>
            setTimeout(async () => {
                await gPage.waitForSelector('#acme-custom-component', { timeout: 150_000 });
                resolve();
            }, 5000),
        );
    });

    after(async function () {
        this.timeout(5000);
        await guiHelper.stopBrowser();
        console.log('BROWSER stopped');
        await engineHelper.stopIoBrokerAdapters();
        console.log('ioBroker stopped');
    });
});
