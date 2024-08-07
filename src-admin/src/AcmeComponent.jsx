import React from 'react';
import PropTypes from 'prop-types';

import {
    LinearProgress, Table, TableBody,
    TableCell, TableContainer,
    TableHead, TableRow, Paper,
} from '@mui/material';
// important to make from package and not from some children.
// invalid
// import ConfigGeneric from '@iobroker/adapter-react-v5/ConfigGeneric';
// valid
import { ConfigGeneric, I18n } from '@iobroker/adapter-react-v5';

const styles = {
    table: {
        minWidth: 400,
    },
    header: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    ok: {
        color: '#0ba20b'
    },
    warn: {
        color: '#f57d1d'
    },
    error: {
        color: '#c42c3a'
    },
};

class AcmeComponent extends ConfigGeneric {
    constructor(props) {
        super(props);
        this.state = {
            collections: null,
        };
    }

    async componentDidMount() {
        super.componentDidMount();
        await this.readData();
        await this.props.socket.subscribeObject('system.certificates', this.onCertsChanged);
    }

    async readData(obj) {
        let collections = obj || (await this.props.socket.getObject('system.certificates'));
        if (collections?.native?.collections) {
            collections = collections.native.collections;
        } else {
            collections = {};
        }

        this.setState({ collections });
    }

    async componentWillUnmount() {
        await this.props.socket.unsubscribeObject('system.certificates', this.onCertsChanged);
    }

    onCertsChanged = (id, obj) => {
        if (id === 'system.certificates' && obj) {
            this.readData(obj)
                .catch(() => {});
        }
    };

    renderItem() {
        if (!this.state.collections) {
            return <LinearProgress />;
        } else {
            return <div style={{ width: '100%'}}>
                <h4>{I18n.t('custom_acme_title')}</h4>
                <TableContainer component={Paper} style={{ width: '100%' }}>
                    <Table style={{ width: '100%' }} size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{I18n.t('custom_acme_id')}</TableCell>
                                <TableCell>{I18n.t('custom_acme_status')}</TableCell>
                                <TableCell>{I18n.t('custom_acme_domains')}</TableCell>
                                <TableCell>{I18n.t('custom_acme_staging')}</TableCell>
                                <TableCell>{I18n.t('custom_acme_expires')}</TableCell>
                                <TableCell></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {Object.keys(this.state.collections).map(id => {
                                const collection = this.state.collections[id];
                                let status;
                                if (new Date(collection.tsExpires).getTime() > Date.now() && !collection.staging) {
                                    status = <span style={styles.ok}>OK</span>;
                                } else if (new Date(collection.tsExpires).getTime() <= Date.now()) {
                                    status = <span style={styles.error}>{I18n.t('custom_acme_expired')}</span>;
                                } else if (collection.staging) {
                                    status = <span style={styles.warn}>{I18n.t('custom_acme_staging')}</span>;
                                }

                                return <TableRow
                                    key={id}
                                    sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                                >
                                    <TableCell component="th" scope="row">{id}</TableCell>
                                    <TableCell>{status}</TableCell>
                                    <TableCell>{collection.domains.join(', ')}</TableCell>
                                    <TableCell style={collection.staging ? styles.warn : undefined}>{collection.staging ? '✓' : ''}</TableCell>
                                    <TableCell style={new Date(collection.tsExpires).getTime() < Date.now() ? styles.error : undefined}>{new Date(collection.tsExpires).toLocaleString()}</TableCell>
                                </TableRow>;
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            </div>;
        }
    }
}

AcmeComponent.propTypes = {
    socket: PropTypes.object.isRequired,
    themeType: PropTypes.string,
    themeName: PropTypes.string,
    style: PropTypes.object,
    data: PropTypes.object.isRequired,
    attr: PropTypes.string,
    schema: PropTypes.object,
    onError: PropTypes.func,
    onChange: PropTypes.func,
};

export default AcmeComponent;
