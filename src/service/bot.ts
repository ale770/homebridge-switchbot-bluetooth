
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
  private readonly nodeCache = new NodeCache({ stdTTL: 3600, useClones: false, deleteOnExpire: true });

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

  private readonly maxRetries = 3;
  private retryCount = 0;

  private mode = BotMode.PRESS;
  private state = true;
  private batteryLevel = 100;

  private switchState = false;

  private scanning = false;

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
      this.log.debug(`Handle Get Switch State :: ${this.bleMac} :: ${this.switchState}`);
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
    try {
      this.log.debug(`Handle Set Switch State :: ${this.bleMac} :: ${state}`);

      const newState = Boolean(state);

      if (newState === this.switchState) {
        this.botService
          .getCharacteristic(this.hap.Characteristic.On)
          .updateValue(newState);
        callback(HAPStatus.SUCCESS);
        this.retryCount = 0;
        return;
      }

      if (this.mode === BotMode.PRESS && !newState) {
        this.botService
          .getCharacteristic(this.hap.Characteristic.On)
          .updateValue(false);
        this.switchState = false;
        callback(HAPStatus.SUCCESS);
        this.retryCount = 0;
        return;
      }

      this.botService
        .getCharacteristic(this.hap.Characteristic.On)
        .updateValue(newState);

      await this.setState(newState);

      this.switchState = newState;

      if (this.mode === BotMode.PRESS && newState) {
        await delay(5000);
        this.botService
          .getCharacteristic(this.hap.Characteristic.On)
          .updateValue(false);
        this.switchState = false;
      }

      this.retryCount = 0;
      callback(HAPStatus.SUCCESS);
    } catch (e) {
      this.log.error(`${e}`);
      this.clean();
      if (this.retryCount >= this.maxRetries) {
        this.retryCount = 0;
        callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      } else {
        this.retryCount += 1;
        this.log.debug(`Retrying Handle Set Switch State :: ${this.bleMac} :: ${state} :: ${this.retryCount}`);
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
        this.log.debug(`On Advertisement :: ${this.bleMac} :: ${this.mode} :: ${this.state} :: ${this.batteryLevel}`);
      }
    };
    await this.findDevice();
  };

  private clean = () => {
    this.nodeCache.del(this.cacheKey);
    this.scanning = false;
  };

  private setState = async (state: boolean): Promise<void> => {
    const device = await this.findDevice();
    if (state) {
      await device.turnOn();
    } else {
      await device.turnOff();
    }
  };

  private scanForState = async (): Promise<void> => {
    if (!this.scanning) {
      this.scanning = true;
      await this.switchbotClient.startScan({ model: 'H', id: this.bleMac });
      await this.switchbotClient.wait(this.scanDuration);
      this.switchbotClient.stopScan();
      this.scanning = false;
    }
  };

  private getDeviceFromCache = () => this.nodeCache.get(this.cacheKey);

  private findDevice = async (): Promise<SwitchbotDeviceWoHand> => {
    const cachedBot = this.getDeviceFromCache();
    if (cachedBot) {
      this.log.debug(`Device from cache :: ${this.bleMac}`);
      return cachedBot;
    }

    for (let i = 0; i < this.scanRetries; i += 1) {
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
        this.log.info(`Found Device :: ${this.bleMac} :: ${i}`);
        this.nodeCache.set(this.cacheKey, devices[0]);
        this.scanForState();
        return devices[0];
      }
    }
    throw new Error(`Device Not Found :: ${this.bleMac}`);
  };
}