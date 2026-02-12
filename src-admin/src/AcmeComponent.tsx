import React from 'react';

import { LinearProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material';
// important to make from package and not from some children.
// invalid
// import I18n from '@iobroker/adapter-react-v5/Components/I18n';
// valid
import { I18n } from '@iobroker/adapter-react-v5';
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from '@iobroker/json-config';

const styles: { [name: string]: React.CSSProperties } = {
    table: {
        minWidth: 400,
    },
    header: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    ok: {
        color: '#0ba20b',
    },
    warn: {
        color: '#f57d1d',
    },
    error: {
        color: '#c42c3a',
    },
};

interface AcmeComponentState extends ConfigGenericState {
    collections: Record<string, { tsExpires: number; staging: string; domains: string[] }> | null;
}

export default class AcmeComponent extends ConfigGeneric<ConfigGenericProps, AcmeComponentState> {
    constructor(props: ConfigGenericProps) {
        super(props);
        this.state = {
            ...this.state,
            collections: null,
        };
    }

    async componentDidMount(): Promise<void> {
        super.componentDidMount();
        await this.readData();
        await this.props.oContext.socket.subscribeObject('system.certificates', this.onCertsChanged);
    }

    async readData(obj?: ioBroker.Object): Promise<void> {
        const collectionsObj = obj || (await this.props.oContext.socket.getObject('system.certificates'));
        let collections: Record<string, { tsExpires: number; staging: string; domains: string[] }>;
        if (collectionsObj?.native?.collections) {
            collections = collectionsObj.native.collections;
        } else {
            collections = {};
        }

        this.setState({ collections });
    }

    async componentWillUnmount(): Promise<void> {
        await this.props.oContext.socket.unsubscribeObject('system.certificates', this.onCertsChanged);
    }

    onCertsChanged = (id: string, obj: ioBroker.Object | null | undefined): void => {
        if (id === 'system.certificates' && obj) {
            this.readData(obj).catch(() => {});
        }
    };

    renderItem(): React.JSX.Element {
        if (!this.state.collections) {
            return <LinearProgress />;
        }

        return (
            <div style={{ width: '100%' }}>
                <h4>{I18n.t('custom_acme_title')}</h4>
                <TableContainer
                    component={Paper}
                    style={{ width: '100%' }}
                >
                    <Table
                        style={{ width: '100%' }}
                        size="small"
                    >
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
                            {this.state.collections &&
                                Object.keys(this.state.collections).map(id => {
                                    if (!this.state.collections) {
                                        return null;
                                    }
                                    const collection = this.state.collections[id];
                                    let status;
                                    if (new Date(collection.tsExpires).getTime() > Date.now() && !collection.staging) {
                                        status = <span style={styles.ok}>OK</span>;
                                    } else if (new Date(collection.tsExpires).getTime() <= Date.now()) {
                                        status = <span style={styles.error}>{I18n.t('custom_acme_expired')}</span>;
                                    } else if (collection.staging) {
                                        status = <span style={styles.warn}>{I18n.t('custom_acme_staging')}</span>;
                                    }

                                    return (
                                        <TableRow
                                            key={id}
                                            sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                                        >
                                            <TableCell
                                                component="th"
                                                scope="row"
                                            >
                                                {id}
                                            </TableCell>
                                            <TableCell>{status}</TableCell>
                                            <TableCell>{collection.domains.join(', ')}</TableCell>
                                            <TableCell style={collection.staging ? styles.warn : undefined}>
                                                {collection.staging ? '✓' : ''}
                                            </TableCell>
                                            <TableCell
                                                style={
                                                    new Date(collection.tsExpires).getTime() < Date.now()
                                                        ? styles.error
                                                        : undefined
                                                }
                                            >
                                                {new Date(collection.tsExpires).toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                        </TableBody>
                    </Table>
                </TableContainer>
            </div>
        );
    }
}
