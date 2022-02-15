
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>


# Homebridge SwitchBot Bluetooth Plugin

An attempt to make a more robust SwitchBot bluetooth plugin.

Supports: 
- [SwitchBot (Bot)](https://www.switch-bot.com/products/switchbot-bot)


## Installation

1. Search for "SwitchBot" on the plugin screen of [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x)
2. Find: `@ale770/homebridge-switchbot-bluetooth`
   - See noble [prerequisites](https://github.com/homebridge/noble#prerequisites) for your OS.
3. Click **Install**

## Configuration

```json
 "accessories": [
        {
            "name": "SwitchBot",
            "type": "bot",
            "deviceId": "XX:XX:XX:XX:XX:XX",
            "scanCooldown": 1000,
            "scanRetries": 5,
            "scanDuration": 5000,
            "accessory": "SwitchBot Bluetooth"
        }
    ]
```

### Configuration Properties
- `name` (Default: SwitchBot)
- `type` (Default: bot)
- `deviceId` (Required, see below)
- `scanCooldown` (Default: 1000 milliseconds)
- `scanDuration` (Default: 5000 milliseconds)
- `scanRetries` (Default: 5)

### You can find your deviceId from the SwitchBot App
  1. Download SwitchBot App on App Store or Google Play Store
  2. Register a SwitchBot account and log in into your account
  3. Click on Device wanting to connect too plugin
     - Click the Settings Gear
     - Click Device Info
     - Copy BLE Mac aka `deviceId`
  4. Input your `deviceId` into the Device Config




