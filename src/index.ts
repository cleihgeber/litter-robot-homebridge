import type { API } from 'homebridge';

import { LitterRobotPlatform } from './platform';
import { PLATFORM_NAME } from './settings';

module.exports = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, LitterRobotPlatform);
};
