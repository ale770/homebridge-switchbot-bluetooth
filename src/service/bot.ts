
// import NodeCache from 'node-cache';
import { HAP } from 'homebridge/lib/api';
import BluetoothClient from './bluetooth';

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
  // private readonly nodeCache = new NodeCache({ stdTTL: 60, useClones: false, deleteOnExpire: true });
  private readonly bluetoothClient;

  // private readonly cacheKey = 'mybot';

  private readonly hap;

  private readonly name: string;
  private readonly bleMac: string;
  private readonly mode: number;

  private readonly batteryService: Service;
  private readonly informationService: Service;
  private readonly botService: Service;

  private readonly log: Logging;

  // private retryCount = 0;

  private batteryLevel = 100;

  private switchState = false;

  private runTimer;

  constructor(
    hap: HAP,
    log: Logging,
    name: string,
    bleMac: string,
    mode: number,
  ) {
    this.hap = hap;
    this.log = log;
    this.name = name;
    this.bleMac = bleMac;
    this.mode = mode;

    this.bluetoothClient = new BluetoothClient(this.bleMac);

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
  }

  public getServices = () => ([this.botService, this.informationService, this.batteryService]);

  private handleGetBatteryLevel = () => this.batteryLevel;

  private handleGetSwitchValue = async (callback: CharacteristicGetCallback) => {
    try {
      const stateString = this.switchState ? 'ON' : 'OFF';
      this.log.debug(`Handle Get Switch State :: ${this.bleMac} :: ${stateString}`);
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
        // this.retryCount = 0;
        return;
      }

      if (this.mode === BotMode.PRESS && !newState) {
        this.updateServiceState(false);
        this.switchState = false;
        callback(HAPStatus.SUCCESS);
        // this.retryCount = 0;
        return;
      }

      await this.bluetoothClient.performAction(state);

      if (this.mode === BotMode.PRESS && newState) {
        this.updateServiceState(false);
        this.switchState = false;
      } else {
        this.updateServiceState(newState);
        this.switchState = newState;
      }

      // this.retryCount = 0;
      callback(HAPStatus.SUCCESS);
    } catch (e) {
      this.log.error(`${e}`);
      // if (this.retryCount >= this.scanRetries) {
      //   this.retryCount = 0;
      callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      // } else {
      //   this.retryCount += 1;
      //   this.log.debug(`Retrying Handle Set Switch State :: ${this.bleMac} :: ${newStateString} :: ${this.retryCount}`);
      //   await this.handleSetSwitchValue(state, callback);
      // }
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
}