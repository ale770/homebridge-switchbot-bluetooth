import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  Logging,
  Service,
} from 'homebridge';

import { Bot } from './service/bot';

const AccessoryType = {
  BOT: 'bot',
};

export = (api: API) => {
  api.registerAccessory('homebridge-switchbot-bluetooth', 'SwitchBot Bluetooth', SwitchBotAccessory);
};

class SwitchBotAccessory implements AccessoryPlugin {
  private readonly log: Logging;

  private readonly config: {
    name: string;
    type: string;
    deviceId: string;
    scanRetries: number;
    scanDuration: number;
    scanCooldown: number;
  };

  services: Service[];

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.services = [];
    this.config = {
      name: config.name || 'SwitchBot',
      deviceId: config.deviceId,
      type: config.type,
      scanCooldown: config.scanCooldown || 1000,
      scanRetries: config.scanRetries || 5,
      scanDuration: config.scanDuration || 5000,
    };

    if (this.config.type === AccessoryType.BOT) {
      const botAccessory = new Bot(
        api.hap,
        this.log,
        this.config.name,
        this.config.deviceId,
        this.config.scanCooldown,
        this.config.scanRetries,
        this.config.scanDuration,
      );
      this.services = botAccessory.getServices();
    } else {
      this.log.error(`Accessory type ${this.config.type} not supported`);
    }
  }

  getServices(): Service[] {
    return this.services;
  }
}