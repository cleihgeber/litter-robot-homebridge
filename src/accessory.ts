import type { CharacteristicValue, PlatformAccessory, Service, WithUUID } from 'homebridge';
import type { LitterRobotAPI } from './api';
import type { LitterRobotPlatform } from './platform';
import {
  LitterBoxCommand,
  LitterBoxStatus,
  type LitterRobot3Data,
} from './settings';

export class LitterRobotAccessory {
  private readonly powerService: Service;
  private readonly nightLightService: Service;
  private readonly cleanCycleService: Service;
  private readonly occupancyService: Service;
  private readonly filterService: Service;
  private readonly catMotionService: Service;
  private readonly cycleCompleteService: Service;
  private readonly drawerFullContactService: Service;

  private robot: LitterRobot3Data;
  private previousUnitStatus: string;

  constructor(
    private readonly platform: LitterRobotPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly api: LitterRobotAPI,
  ) {
    this.robot = accessory.context.robot as LitterRobot3Data;
    this.previousUnitStatus = this.robot.unitStatus;

    // Accessory Information
    const infoService = this.accessory.getService(this.platform.Service.AccessoryInformation)!;
    infoService
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Litter-Robot')
      .setCharacteristic(this.platform.Characteristic.Model, 'Litter-Robot 3')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.robot.litterRobotSerial || 'Unknown')
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, '1.0.0');

    // Power Switch
    this.powerService = this.getOrAddService(
      this.platform.Service.Switch,
      `${this.robot.litterRobotNickname} Power`,
      'power',
    );
    this.powerService
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.getPowerOn())
      .onSet((value) => this.setPowerOn(value));

    // Night Light Switch
    this.nightLightService = this.getOrAddService(
      this.platform.Service.Switch,
      `${this.robot.litterRobotNickname} Night Light`,
      'night-light',
    );
    this.nightLightService
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.getNightLightOn())
      .onSet((value) => this.setNightLightOn(value));

    // Clean Cycle Switch (momentary)
    this.cleanCycleService = this.getOrAddService(
      this.platform.Service.Switch,
      `${this.robot.litterRobotNickname} Clean`,
      'clean-cycle',
    );
    this.cleanCycleService
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.getCycleActive())
      .onSet((value) => this.startCleanCycle(value));

    // Occupancy Sensor for "cat detected"
    this.occupancyService = this.getOrAddService(
      this.platform.Service.OccupancySensor,
      `${this.robot.litterRobotNickname} Occupancy`,
      'occupancy',
    );
    this.occupancyService
      .getCharacteristic(this.platform.Characteristic.OccupancyDetected)
      .onGet(() => this.getOccupancy());

    // Filter Maintenance for drawer fill level
    this.filterService = this.getOrAddService(
      this.platform.Service.FilterMaintenance,
      `${this.robot.litterRobotNickname} Waste Drawer`,
      'waste-drawer',
    );
    this.filterService
      .getCharacteristic(this.platform.Characteristic.FilterChangeIndication)
      .onGet(() => this.getDrawerFullIndication());
    this.filterService
      .getCharacteristic(this.platform.Characteristic.FilterLifeLevel)
      .onGet(() => this.getDrawerLevel());

    // Motion Sensor for cat detection (triggers HomeKit automations)
    this.catMotionService = this.getOrAddService(
      this.platform.Service.MotionSensor,
      `${this.robot.litterRobotNickname} Cat Sensor`,
      'cat-motion',
    );
    this.catMotionService
      .getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(() => this.isOccupied());

    // Contact Sensor for clean cycle complete (OPEN = cycle just finished)
    this.cycleCompleteService = this.getOrAddService(
      this.platform.Service.ContactSensor,
      `${this.robot.litterRobotNickname} Cycle Complete`,
      'cycle-complete',
    );
    this.cycleCompleteService
      .getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .onGet(() => this.getCycleCompleteContact());

    // Contact Sensor for drawer full (OPEN = drawer full)
    this.drawerFullContactService = this.getOrAddService(
      this.platform.Service.ContactSensor,
      `${this.robot.litterRobotNickname} Drawer Full`,
      'drawer-full',
    );
    this.drawerFullContactService
      .getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .onGet(() => this.getDrawerFullContact());
  }

  private getOrAddService(
    serviceType: WithUUID<typeof Service>,
    name: string,
    subtype: string,
  ): Service {
    return (
      this.accessory.getServiceById(serviceType, subtype) ||
      this.accessory.addService(serviceType, name, subtype)
    );
  }

  updateState(robot: LitterRobot3Data): void {
    const prevStatus = this.previousUnitStatus;
    this.previousUnitStatus = robot.unitStatus;
    this.robot = robot;
    this.accessory.context.robot = robot;

    const statusChanged = prevStatus !== robot.unitStatus;
    if (statusChanged) {
      this.platform.log.info(
        `${robot.litterRobotNickname} status: ${prevStatus} -> ${robot.unitStatus}`,
      );
    }

    // --- Switches ---

    this.powerService.updateCharacteristic(
      this.platform.Characteristic.On,
      this.isPowerOn(),
    );

    this.nightLightService.updateCharacteristic(
      this.platform.Characteristic.On,
      this.isNightLightOn(),
    );

    this.cleanCycleService.updateCharacteristic(
      this.platform.Characteristic.On,
      this.isCycleActive(),
    );

    // --- Occupancy Sensor ---

    this.occupancyService.updateCharacteristic(
      this.platform.Characteristic.OccupancyDetected,
      this.isOccupied()
        ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
        : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED,
    );

    // --- Cat Motion Sensor (automation trigger) ---

    this.catMotionService.updateCharacteristic(
      this.platform.Characteristic.MotionDetected,
      this.isOccupied(),
    );

    // --- Cycle Complete Contact Sensor ---
    // Opens briefly when a clean cycle finishes, then closes on next poll.
    // This gives HomeKit a rising-edge event to trigger automations.

    const cycleJustCompleted = statusChanged
      && prevStatus === LitterBoxStatus.CLEAN_CYCLE
      && (robot.unitStatus === LitterBoxStatus.CLEAN_CYCLE_COMPLETE
        || robot.unitStatus === LitterBoxStatus.READY);

    this.cycleCompleteService.updateCharacteristic(
      this.platform.Characteristic.ContactSensorState,
      cycleJustCompleted
        ? this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
        : this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED,
    );

    // Auto-close the contact sensor after one poll cycle so it resets
    if (cycleJustCompleted) {
      this.platform.log.info(`Clean cycle completed on ${robot.litterRobotNickname}`);
      setTimeout(() => {
        this.cycleCompleteService.updateCharacteristic(
          this.platform.Characteristic.ContactSensorState,
          this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED,
        );
      }, 10000);
    }

    // --- Drawer Full Contact Sensor ---

    this.drawerFullContactService.updateCharacteristic(
      this.platform.Characteristic.ContactSensorState,
      this.isDrawerFull()
        ? this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
        : this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED,
    );

    // --- Filter Maintenance ---

    this.filterService.updateCharacteristic(
      this.platform.Characteristic.FilterChangeIndication,
      this.isDrawerFull()
        ? this.platform.Characteristic.FilterChangeIndication.CHANGE_FILTER
        : this.platform.Characteristic.FilterChangeIndication.FILTER_OK,
    );

    this.filterService.updateCharacteristic(
      this.platform.Characteristic.FilterLifeLevel,
      this.getDrawerLevelPercent(),
    );
  }

  // --- Power ---

  private isPowerOn(): boolean {
    return this.robot.unitStatus !== LitterBoxStatus.OFF
      && this.robot.unitStatus !== LitterBoxStatus.OFFLINE;
  }

  private getPowerOn(): boolean {
    return this.isPowerOn();
  }

  private async setPowerOn(value: CharacteristicValue): Promise<void> {
    const on = value as boolean;
    const command = on ? LitterBoxCommand.POWER_ON : LitterBoxCommand.POWER_OFF;
    try {
      await this.api.sendCommand(this.robot.litterRobotId, command);
      this.platform.log.info(`Power ${on ? 'on' : 'off'} sent to ${this.robot.litterRobotNickname}`);
    } catch (e) {
      this.platform.log.error(`Failed to set power: ${(e as Error).message}`);
      throw new this.platform.homebridgeApi.hap.HapStatusError(
        this.platform.homebridgeApi.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  // --- Night Light ---

  private isNightLightOn(): boolean {
    return this.robot.nightLightActive === '1' || this.robot.nightLightActive === 'true';
  }

  private getNightLightOn(): boolean {
    return this.isNightLightOn();
  }

  private async setNightLightOn(value: CharacteristicValue): Promise<void> {
    const on = value as boolean;
    const command = on ? LitterBoxCommand.NIGHT_LIGHT_ON : LitterBoxCommand.NIGHT_LIGHT_OFF;
    try {
      await this.api.sendCommand(this.robot.litterRobotId, command);
      this.platform.log.info(`Night light ${on ? 'on' : 'off'} sent to ${this.robot.litterRobotNickname}`);
    } catch (e) {
      this.platform.log.error(`Failed to set night light: ${(e as Error).message}`);
      throw new this.platform.homebridgeApi.hap.HapStatusError(
        this.platform.homebridgeApi.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  // --- Clean Cycle ---

  private isCycleActive(): boolean {
    return this.robot.unitStatus === LitterBoxStatus.CLEAN_CYCLE;
  }

  private getCycleActive(): boolean {
    return this.isCycleActive();
  }

  private async startCleanCycle(value: CharacteristicValue): Promise<void> {
    const on = value as boolean;
    if (!on) {
      return; // Can't cancel a cycle via this switch
    }
    try {
      await this.api.sendCommand(this.robot.litterRobotId, LitterBoxCommand.CLEAN);
      this.platform.log.info(`Clean cycle started on ${this.robot.litterRobotNickname}`);
      // Auto-reset the switch after a short delay
      setTimeout(() => {
        this.cleanCycleService.updateCharacteristic(
          this.platform.Characteristic.On,
          false,
        );
      }, 5000);
    } catch (e) {
      this.platform.log.error(`Failed to start clean cycle: ${(e as Error).message}`);
      throw new this.platform.homebridgeApi.hap.HapStatusError(
        this.platform.homebridgeApi.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  // --- Occupancy (Cat Detected) ---

  private isOccupied(): boolean {
    return this.robot.unitStatus === LitterBoxStatus.CAT_DETECTED
      || this.robot.unitStatus === LitterBoxStatus.CAT_SENSOR_TIMING;
  }

  private getOccupancy(): CharacteristicValue {
    return this.isOccupied()
      ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
      : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
  }

  // --- Cycle Complete Contact ---

  private getCycleCompleteContact(): CharacteristicValue {
    // Normally closed; only opens momentarily on transition
    return this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
  }

  // --- Drawer Full Contact ---

  private getDrawerFullContact(): CharacteristicValue {
    return this.isDrawerFull()
      ? this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
      : this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
  }

  // --- Waste Drawer ---

  private isDrawerFull(): boolean {
    const s = this.robot.unitStatus;
    return s === LitterBoxStatus.DRAWER_FULL
      || s === LitterBoxStatus.DRAWER_FULL_1
      || s === LitterBoxStatus.DRAWER_FULL_2;
  }

  private getDrawerLevelPercent(): number {
    if (this.robot.DFILevelPercent !== undefined && this.robot.DFILevelPercent !== null) {
      // DFILevelPercent is 0-100 where 100 = full
      // FilterLifeLevel expects 0-100 where 100 = fresh, so invert
      return Math.max(0, Math.min(100, 100 - this.robot.DFILevelPercent));
    }

    // Fallback: estimate from cycle count vs capacity
    const count = parseInt(this.robot.cycleCount, 10) || 0;
    const capacity = parseInt(this.robot.cycleCapacity, 10) || 30;
    const used = Math.min(count / capacity, 1);
    return Math.max(0, Math.round((1 - used) * 100));
  }

  private getDrawerFullIndication(): CharacteristicValue {
    return this.isDrawerFull()
      ? this.platform.Characteristic.FilterChangeIndication.CHANGE_FILTER
      : this.platform.Characteristic.FilterChangeIndication.FILTER_OK;
  }

  private getDrawerLevel(): CharacteristicValue {
    return this.getDrawerLevelPercent();
  }
}
