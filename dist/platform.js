"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LitterRobotPlatform = void 0;
const accessory_1 = require("./accessory");
const api_1 = require("./api");
const settings_1 = require("./settings");
class LitterRobotPlatform {
    constructor(log, config, homebridgeApi) {
        this.log = log;
        this.config = config;
        this.homebridgeApi = homebridgeApi;
        this.accessories = [];
        this.activeAccessories = new Map();
        this.Service = this.homebridgeApi.hap.Service;
        this.Characteristic = this.homebridgeApi.hap.Characteristic;
        this.pollingInterval = config.pollingInterval || 30;
        this.api = new api_1.LitterRobotAPI(log, config.email, config.password);
        if (!config.email || !config.password) {
            this.log.error('Missing email or password in config. Plugin will not start.');
            return;
        }
        this.homebridgeApi.on('didFinishLaunching', () => {
            this.discoverDevices();
        });
    }
    configureAccessory(accessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }
    async discoverDevices() {
        try {
            await this.api.authenticate();
        }
        catch (e) {
            this.log.error('Failed to authenticate with Whisker:', e.message);
            return;
        }
        let robots;
        try {
            robots = await this.api.getRobots();
        }
        catch (e) {
            this.log.error('Failed to fetch robots:', e.message);
            return;
        }
        this.log.info(`Found ${robots.length} Litter Robot(s)`);
        const activeIds = new Set();
        for (const robot of robots) {
            activeIds.add(robot.litterRobotId);
            const uuid = this.homebridgeApi.hap.uuid.generate(robot.litterRobotId);
            const existingAccessory = this.accessories.find((a) => a.UUID === uuid);
            if (existingAccessory) {
                this.log.info('Restoring existing accessory:', robot.litterRobotNickname);
                existingAccessory.context.robot = robot;
                const handler = new accessory_1.LitterRobotAccessory(this, existingAccessory, this.api);
                this.activeAccessories.set(robot.litterRobotId, handler);
            }
            else {
                this.log.info('Adding new accessory:', robot.litterRobotNickname);
                const accessory = new this.homebridgeApi.platformAccessory(robot.litterRobotNickname || 'Litter Robot 3', uuid);
                accessory.context.robot = robot;
                const handler = new accessory_1.LitterRobotAccessory(this, accessory, this.api);
                this.activeAccessories.set(robot.litterRobotId, handler);
                this.homebridgeApi.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
            }
        }
        // Remove stale accessories
        const stale = this.accessories.filter((a) => !activeIds.has(a.context.robot?.litterRobotId));
        if (stale.length > 0) {
            this.log.info(`Removing ${stale.length} stale accessory(ies)`);
            this.homebridgeApi.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, stale);
        }
        // Start polling
        this.startPolling();
    }
    startPolling() {
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
            }
            catch (e) {
                this.log.debug('Polling error:', e.message);
            }
        }, this.pollingInterval * 1000);
    }
}
exports.LitterRobotPlatform = LitterRobotPlatform;
//# sourceMappingURL=platform.js.map