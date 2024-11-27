const { shared } = require('@iobroker/adapter-react-v5/modulefederation.admin.config');

module.exports = {
    name: 'ConfigCustomAcmeSet',
    filename: 'customComponents.js',
    exposes: {
        './Components': './src/Components.jsx',
    },
    shared,
};
