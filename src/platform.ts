import type {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';

import { LitterRobotAccessory } from './accessory';
import { LitterRobotAPI } from './api';
import { PLATFORM_NAME, PLUGIN_NAME, type LitterRobot3Data } from './settings';

export class LitterRobotPlatform implements DynamicPlatformPlugin {
  public readonly Service;
  public readonly Characteristic;

  private readonly accessories: PlatformAccessory[] = [];
  private readonly activeAccessories = new Map<string, LitterRobotAccessory>();
  private readonly api: LitterRobotAPI;
  private readonly pollingInterval: number;
  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly homebridgeApi: API,
  ) {
    this.Service = this.homebridgeApi.hap.Service;
    this.Characteristic = this.homebridgeApi.hap.Characteristic;

    this.pollingInterval = (config.pollingInterval as number) || 30;
    const email = (config.email || config.username) as string;
    this.api = new LitterRobotAPI(
      log,
      email,
      config.password as string,
    );

    if (!email || !config.password) {
      this.log.error('Missing email/username or password in config. Plugin will not start.');
      return;
    }

    this.homebridgeApi.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  private async discoverDevices(): Promise<void> {
    try {
      await this.api.authenticate();
    } catch (e) {
      this.log.error('Failed to authenticate with Whisker:', (e as Error).message);
      return;
    }

    let robots: LitterRobot3Data[];
    try {
      robots = await this.api.getRobots();
    } catch (e) {
      this.log.error('Failed to fetch robots:', (e as Error).message);
      return;
    }

    this.log.info(`Found ${robots.length} Litter Robot(s)`);

    const activeIds = new Set<string>();

    for (const robot of robots) {
      activeIds.add(robot.litterRobotId);

      const uuid = this.homebridgeApi.hap.uuid.generate(robot.litterRobotId);
      const existingAccessory = this.accessories.find((a) => a.UUID === uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory:', robot.litterRobotNickname);
        existingAccessory.context.robot = robot;
        const handler = new LitterRobotAccessory(this, existingAccessory, this.api);
        this.activeAccessories.set(robot.litterRobotId, handler);
      } else {
        this.log.info('Adding new accessory:', robot.litterRobotNickname);
        const accessory = new this.homebridgeApi.platformAccessory(
          robot.litterRobotNickname || 'Litter Robot 3',
          uuid,
        );
        accessory.context.robot = robot;
        const handler = new LitterRobotAccessory(this, accessory, this.api);
        this.activeAccessories.set(robot.litterRobotId, handler);
        this.homebridgeApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    // Remove stale accessories
    const stale = this.accessories.filter(
      (a) => !activeIds.has(a.context.robot?.litterRobotId),
    );
    if (stale.length > 0) {
      this.log.info(`Removing ${stale.length} stale accessory(ies)`);
      this.homebridgeApi.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
    }

    // Start polling
    this.startPolling();
  }

  private startPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    this.pollTimer = setInterval(async () => {
      try {
        const robots = await this.api.getRobots();
        for (const robot of robots) {
          const handler = this.activeAccessories.get(robot.litterRobotId);
          if (handler) {
            handler.updateState(robot);
          }
        }
      } catch (e) {
        this.log.debug('Polling error:', (e as Error).message);
      }
    }, this.pollingInterval * 1000);
  }
}
