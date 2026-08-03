// this file used only for simulation and not used in the end build
import { Theme } from '@iobroker/gui-components';

export default type => {
    /** @type {import('@iobroker/gui-components').IobTheme} */
    return Theme(type);
};
