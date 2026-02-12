// this file used only for simulation and not used in the end build
import { Theme } from '@iobroker/adapter-react-v5';

export default type => {
    /** @type {import('@iobroker/adapter-react-v5').IobTheme} */
    return Theme(type);
};
