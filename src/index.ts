import type { API } from 'homebridge';

import { LitterRobotPlatform } from './platform';
import { PLATFORM_NAME } from './settings';

export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, LitterRobotPlatform);
};
