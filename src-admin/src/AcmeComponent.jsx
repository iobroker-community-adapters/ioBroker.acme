import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';

import { LinearProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material';
// important to make from package and not from some children.
// invalid
// import ConfigGeneric from '@iobroker/adapter-react-v5/ConfigGeneric';
// valid
import { ConfigGeneric, i18n as I18n } from '@iobroker/adapter-react-v5';

const styles = () => ({
    table: {
        minWidth: 400,
    },
    header: {
        fontSize: 16,
        fontWeight: 'bold',
    },
});

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

        this.setState({ collections }, () => this.readData());
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
                                <TableCell></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {Object.keys(this.state.collections).map(id => <TableRow
                                key={id}
                                sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                            >
                                <TableCell component="th" scope="row">{id}</TableCell>
                                <TableCell><pre>{JSON.stringify(this.state.collections[id])}</pre></TableCell>
                            </TableRow>)}
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
    className: PropTypes.string,
    data: PropTypes.object.isRequired,
    attr: PropTypes.string,
    schema: PropTypes.object,
    onError: PropTypes.func,
    onChange: PropTypes.func,
};

export default withStyles(styles)(AcmeComponent);