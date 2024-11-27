const fs = require('fs');
const { copyFiles, deleteFoldersRecursive, npmInstall, buildReact } = require('@iobroker/build-tools');

const srcAdmin = `${__dirname}/src-admin/`;

function clean() {
    deleteFoldersRecursive(`${__dirname}/admin/custom`);
    deleteFoldersRecursive(`${__dirname}/src-admin/build`);
}

function copyAllFiles() {
    copyFiles(['src-admin/build/static/js/*.js'], 'admin/custom/static/js');
    copyFiles(['src-admin/build/static/js/*.map', '!src-admin/build/static/js/vendors*.map'], 'admin/custom/static/js');
    copyFiles(['src-admin/build/customComponents.js'], 'admin/custom');
    copyFiles(['src-admin/build/customComponents.js.map'], 'admin/custom');
    copyFiles(['src-admin/src/i18n/*.json'], 'admin/custom/i18n');
}

if (process.argv.includes('--0-clean')) {
    clean();
} else if (process.argv.includes('--1-npm')) {
    npmInstall(srcAdmin)
        .catch(e => console.error(`Cannot install npm modules: ${e}`));
} else if (process.argv.includes('--2-build')) {
    buildReact(srcAdmin, { rootDir: __dirname, craco: true })
        .catch(e => console.error(`Cannot build: ${e}`));
} else if (process.argv.includes('--3-copy')) {
    copyAllFiles();
} else {
    clean();
    npmInstall(srcAdmin)
        .then(() => buildReact(srcAdmin, { rootDir: __dirname, craco: true }))
        .then(() => copyAllFiles())
        .catch(e => console.error(`Cannot build: ${e}`));
}
