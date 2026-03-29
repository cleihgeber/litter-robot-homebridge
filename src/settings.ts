export const PLATFORM_NAME = 'LitterRobot';
export const PLUGIN_NAME = 'homebridge-litter-robot-3';

export const COGNITO_USER_POOL_ID = 'us-east-1_rjhNnZVAm';
export const COGNITO_CLIENT_ID = '4552ujeu3aic90nf8qn53levmn';
export const LR3_API_BASE = 'https://v2.api.whisker.iothings.site';
export const LR3_API_KEY = 'p7ndMoj61npRZP5CVz9v4Uj0bG769xy6758QRBPb';

export enum LitterBoxCommand {
  CLEAN = '<C',
  POWER_OFF = '<P0',
  POWER_ON = '<P1',
  NIGHT_LIGHT_OFF = '<N0',
  NIGHT_LIGHT_ON = '<N1',
  SLEEP_MODE_OFF = '<S0',
  SLEEP_MODE_ON = '<S1',
  LOCK_OFF = '<L0',
  LOCK_ON = '<L1',
}

export enum LitterBoxStatus {
  READY = 'RDY',
  CLEAN_CYCLE = 'CCP',
  CLEAN_CYCLE_COMPLETE = 'CCC',
  CAT_DETECTED = 'CD',
  CAT_SENSOR_FAULT = 'CSF',
  CAT_SENSOR_INTERRUPTED = 'CSI',
  CAT_SENSOR_TIMING = 'CST',
  DRAWER_FULL_1 = 'DF1',
  DRAWER_FULL_2 = 'DF2',
  DRAWER_FULL = 'DFS',
  DUMP_HOME_POSITION_FAULT = 'DHF',
  DUMP_POSITION_FAULT = 'DPF',
  EMPTY_CYCLE = 'EC',
  HOME_POSITION_FAULT = 'HPF',
  OFF = 'OFF',
  OFFLINE = 'OFFLINE',
  OVER_TORQUE_FAULT = 'OTF',
  PAUSED = 'P',
  PINCH_DETECT = 'PD',
  POWER_DOWN = 'PWRD',
  POWER_UP = 'PWRU',
  BONNET_REMOVED = 'BR',
  STARTUP_CAT_SENSOR_FAULT = 'SCF',
  STARTUP_DRAWER_FULL = 'SDF',
  STARTUP_PINCH_DETECT = 'SPF',
}

export interface LitterRobot3Data {
  litterRobotId: string;
  litterRobotSerial: string;
  litterRobotNickname: string;
  unitStatus: string;
  powerStatus: string;
  nightLightActive: string;
  sleepModeActive: string;
  cycleCount: string;
  cycleCapacity: string;
  cyclesAfterDrawerFull: string;
  cleanCycleWaitTimeMinutes: string;
  isDFITriggered: string;
  DFINumberOfCycles: number;
  DFILevelPercent: number;
  panelLockActive: string;
  sleepModeTime?: string;
  sleepModeStartTime?: string;
  sleepModeEndTime?: string;
  deviceType?: string;
  isOnboarded?: boolean;
}

export interface PlatformConfig {
  platform: string;
  email: string;
  password: string;
  pollingInterval?: number;
  hideNightLight?: boolean;
  hidePowerSwitch?: boolean;
}
