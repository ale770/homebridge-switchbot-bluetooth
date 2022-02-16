
import SwitchBot, { SwitchbotDeviceWoHand, AdvertisementData } from 'node-switchbot';
import NodeCache from 'node-cache';
import { HAP } from 'homebridge/lib/api';
import { delay } from '../utils/helpers';
import {
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAPStatus,
  Logging,
  Service,
} from 'homebridge';

export const BotMode = {
  PRESS: 1,
  SWITCH: 2,
};

export class Bot {
  private readonly switchbotClient = new SwitchBot();
  private readonly nodeCache = new NodeCache({ stdTTL: 60, useClones: false, deleteOnExpire: true });

  private readonly cacheKey = 'mybot';

  private readonly hap;

  private readonly name: string;
  private readonly bleMac: string;
  private readonly scanCooldown: number;
  private readonly scanRetries: number;
  private readonly scanDuration: number;

  private readonly batteryService: Service;
  private readonly informationService: Service;
  private readonly botService: Service;

  private readonly log: Logging;

  private retryCount = 0;

  private mode = BotMode.PRESS;
  private state = true;
  private batteryLevel = 100;

  private switchState = false;

  private scanning = false;
  private findingDevice = false;

  private runTimer;

  constructor(
    hap: HAP,
    log: Logging,
    name: string,
    bleMac: string,
    scanCooldown: number,
    scanRetries: number,
    scanDuration: number,
  ) {
    this.hap = hap;
    this.log = log;
    this.name = name;
    this.bleMac = bleMac;
    this.scanCooldown = scanCooldown;
    this.scanRetries = scanRetries;
    this.scanDuration = scanDuration;


    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(hap.Characteristic.Model, 'Bot')
      .setCharacteristic(hap.Characteristic.SerialNumber, this.bleMac);

    this.botService = new this.hap.Service.Switch(this.name);
    this.botService.getCharacteristic(this.hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, this.handleGetSwitchValue)
      .on(CharacteristicEventTypes.SET, this.handleSetSwitchValue);

    this.batteryService = new this.hap.Service.Battery(this.name + ' Battery');
    this.batteryService
      .getCharacteristic(hap.Characteristic.BatteryLevel)
      .onGet(this.handleGetBatteryLevel);

    this.batteryService
      .getCharacteristic(hap.Characteristic.StatusLowBattery)
      .onGet(() => {
        const batteryLevel = this.handleGetBatteryLevel();
        return batteryLevel < 15
          ? hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
          : hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
      });
    this.init();
  }

  public getServices = () => ([this.botService, this.informationService, this.batteryService]);

  private handleGetBatteryLevel = () => this.batteryLevel;

  private handleGetSwitchValue = async (callback: CharacteristicGetCallback) => {
    try {
      const stateString = this.switchState ? 'ON' : 'OFF';
      this.log.debug(`Handle Get Switch State :: ${this.bleMac} :: ${stateString}`);
      const cachedDevice = this.getDeviceFromCache();
      if (!cachedDevice) {
        await this.findDevice();
      }
      callback(HAPStatus.SUCCESS, this.switchState);
    } catch (e) {
      this.log.error(`${e}`);
      callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  };

  private handleSetSwitchValue = async (state: CharacteristicValue, callback: CharacteristicSetCallback) => {
    const newStateString = state ? 'ON' : 'OFF';
    try {
      this.log.debug(`Handle Set Switch State :: ${this.bleMac} :: ${newStateString}`);

      const newState = Boolean(state);

      if (newState === this.switchState) {
        this.updateServiceState(newState);
        callback(HAPStatus.SUCCESS);
        this.retryCount = 0;
        return;
      }

      if (this.mode === BotMode.PRESS && !newState) {
        this.updateServiceState(false);
        this.switchState = false;
        callback(HAPStatus.SUCCESS);
        this.retryCount = 0;
        return;
      }

      await this.setDeviceState(newState);

      if (this.mode === BotMode.PRESS && newState) {
        this.updateServiceState(false);
        this.switchState = false;
      } else {
        this.updateServiceState(newState);
        this.switchState = newState;
      }

      this.retryCount = 0;
      callback(HAPStatus.SUCCESS);
    } catch (e) {
      this.log.error(`${e}`);
      this.clean();
      if (this.retryCount >= this.scanRetries) {
        this.retryCount = 0;
        callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      } else {
        this.retryCount += 1;
        this.log.debug(`Retrying Handle Set Switch State :: ${this.bleMac} :: ${newStateString} :: ${this.retryCount}`);
        await this.handleSetSwitchValue(state, callback);
      }
    }
  };

  private init = async () => {
    this.log.debug(`Init :: ${this.bleMac}`);

    this.switchbotClient.onadvertisement = (data: AdvertisementData) => {
      if (data) {
        const { mode, state, battery } = data.serviceData;
        this.mode = mode ? BotMode.SWITCH : BotMode.PRESS;
        this.state = state;
        this.batteryLevel = battery;
        // this.log.debug(`On Advertisement :: ${this.bleMac} :: ${this.mode} :: ${this.state} :: ${this.batteryLevel}`);
      }
    };
    await this.findDevice();
  };

  private clean = () => {
    this.nodeCache.del(this.cacheKey);
    this.findingDevice = false;
  };

  private setDeviceState = async (state: boolean): Promise<void> => {
    const device = await this.findDevice();
    if (state) {
      await device.turnOn();
    } else {
      await device.turnOff();
    }
  };

  private updateServiceState = (state: boolean) => {
    if (this.runTimer) {
      clearTimeout(this.runTimer);
    }
    this.runTimer = setTimeout(() => {
      this.botService
        .getCharacteristic(this.hap.Characteristic.On)
        .updateValue(state);
    }, 500);
  };

  private scanForState = async (): Promise<void> => {
    try {
      if (!this.scanning) {
        this.scanning = true;
        await this.switchbotClient.startScan({ model: 'H', id: this.bleMac });
        await this.switchbotClient.wait(this.scanDuration);
        this.switchbotClient.stopScan();
        this.scanning = false;
      }
    } catch (e) {
      this.scanning = false;
      throw e;
    }
  };

  private getDeviceFromCache = () => this.nodeCache.get(this.cacheKey);

  private findDevice = async (): Promise<SwitchbotDeviceWoHand | null> => {
    const cachedBot = this.getDeviceFromCache();
    if (cachedBot) {
      this.log.debug(`Device from cache :: ${this.bleMac}`);
      return cachedBot;
    }

    if (this.findingDevice) {
      throw new Error(`Another process is already trying to find a device :: ${this.bleMac}`);
    }

    this.findingDevice = true;
    const devices: SwitchbotDeviceWoHand[] = await this.switchbotClient.discover({
      id: this.bleMac,
      duration: this.scanDuration,
      quick: true,
      model: 'H',
    });

    if (!devices || !devices.length) {
      await delay(this.scanCooldown);
    }

    if (devices && devices.length) {
      this.log.info(`Found Device :: ${this.bleMac}`);
      this.nodeCache.set(this.cacheKey, devices[0]);
      this.scanForState();
      this.findingDevice = false;
      return devices[0];
    }

    this.findingDevice = false;
    throw new Error(`Device Not Found :: ${this.bleMac}`);
  };

}