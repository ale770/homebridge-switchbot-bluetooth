import noble from '@abandonware/noble';

const PRIMARY_UUID = 'cba20d00224d11e69fb80002a5d5c51b';
const CHARACTERISTIC_UUID = 'cba20002224d11e69fb80002a5d5c51b';

const CHAR_ON = [0x57, 0x01, 0x01];

export default class BluetoothClient {
  private readonly bleMac;
  private initialized = false;
  private deviceFound = false;

  constructor(bleMac: string) {
    this.bleMac = bleMac;

    noble.on('discover', async (peripheral) => {
      console.log('discover')
      await noble.stopScanningAsync();
      await peripheral.connectAsync();
      const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync([PRIMARY_UUID], [CHARACTERISTIC_UUID]);
      // const batteryLevel = (await characteristics[0].readAsync())[0];
      await characteristics[0].writeAsync(Buffer.from(CHAR_ON), false);

      // console.log(`${peripheral.address} (${peripheral.advertisement.localName}): ${batteryLevel}%`);

      await peripheral.disconnectAsync();
    });
  }

  private init = async () => {
    return new Promise((resolve, reject) => {
      switch (noble.state) {
        case 'poweredOn':
          resolve(true);
          break;
        case 'unsupported':
        case 'unauthorized':
        case 'poweredOff':
          reject(new Error('Failed to initialize the Noble object: ' + noble.state));
          break;
        default: // 'resetting', 'unknown'
          noble.once('stateChange', (state) => {
            if (state === 'poweredOn') {
              resolve(true);
            } else {
              reject(new Error('Failed to initialize the Noble object: ' + state));
            }
          });
      }
    });
  };

  performAction = async (action: string) => {
    console.log(action);
    await this.init();
    console.log('init done')
    // await noble.stopScanningAsync();
    await noble.startScanningAsync([PRIMARY_UUID], false);
  };

  // private handleCommunication = async (action: string, characteristic: Bluez.Characteristic) => {
  //   // get a write socket
  //   const writer = await characteristic.AcquireWrite();
  //   writer.write(Buffer.from(CHAR_ON));
  //   writer.end();
  // };

  // private handleServiceAndCharacteristic = async (device: Bluez.Device): Promise<Bluez.Characteristic> => {
  //   // get the Service
  //   const service = await device.getService(PRIMARY_UUID);
  //   if (!service) {
  //     throw new Error('No Service found');
  //   }
  //   // get the Characteristic from the Service
  //   const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
  //   if (!characteristic) {
  //     throw new Error('No Characteristic found');
  //   }
  //   return characteristic;
  // };

  // private handleDevice = async (address, props): Promise<Bluez.Device> => {
  //   const device = await this.bluetooth.getDevice(address);
  //   if (!props.Connected) {
  //     await device.Connect();
  //   }
  //   return device;
  // };

  // private scanForDevice = async () => {
  //   if (this.initialized) {
  //     throw new Error('Bluetooth already initialized');
  //   }
  //   this.bluetooth.init().then(async () => {
  //     this.initialized = true;
  //     // listen on first bluetooth adapter
  //     this.adapter = await this.bluetooth.getAdapter();
  //     if (!this.deviceFound) {
  //       await this.adapter.StartDiscovery();
  //     }
  //   });
  // };

  // private closeConnection = async (device: Bluez.Device) => {
  //   if (this.adapter && await this.adapter.Discovering()) {
  //     await this.adapter.StopDiscovery();
  //   }
  //   if (device && await device.Connected()) {
  //     await device.Disconnect();
  //   }
  // };
}

