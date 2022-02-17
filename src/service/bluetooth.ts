import Bluez from 'bluez';

const PRIMARY_UUID = 'cba20d00-224d-11e6-9fb8-0002a5d5c51b';
const CHARACTERISTIC_UUID = 'cba20002-224d-11e6-9fb8-0002a5d5c51b';

const CHAR_ON = [0x57, 0x01, 0x01];

export default class BluetoothClient {

  private readonly bluetooth = new Bluez();
  private readonly bleMac;
  private initialized = false;
  private deviceFound = false;
  private adapter: Bluez.Adapter | null = null;

  constructor(bleMac: string) {
    this.bleMac = bleMac;
  }

  performAction = async (action: string) => {
    return new Promise((resolve, reject) => {
      try {
        this.bluetooth.on('device', async (address, props) => {
          if (address !== this.bleMac) {
            return;
          }
          this.deviceFound = true;
          const device = await this.handleDevice(address, props);
          device.on('PropertiesChanged', async (props) => {
            if (props.ServicesResolved) {
              const characteristic = await this.handleServiceAndCharacteristic(device);
              await this.handleCommunication(action, characteristic);
              await this.closeConnection(device);
              resolve(true);
            }
          });
        });
        this.scanForDevice();
      } catch (e) {
        reject(e);
      }
    });
  };

  private handleCommunication = async (action: string, characteristic: Bluez.Characteristic) => {
    // get a write socket
    const writer = await characteristic.AcquireWrite();
    writer.write(Buffer.from(CHAR_ON));
    writer.end();
  };

  private handleServiceAndCharacteristic = async (device: Bluez.Device): Promise<Bluez.Characteristic> => {
    // get the Service
    const service = await device.getService(PRIMARY_UUID);
    if (!service) {
      throw new Error('No Service found');
    }
    // get the Characteristic from the Service
    const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
    if (!characteristic) {
      throw new Error('No Characteristic found');
    }
    return characteristic;
  };

  private handleDevice = async (address, props): Promise<Bluez.Device> => {
    const device = await this.bluetooth.getDevice(address);
    if (!props.Connected) {
      await device.Connect();
    }
    return device;
  };

  private scanForDevice = async () => {
    if (this.initialized) {
      throw new Error('Bluetooth already initialized');
    }
    this.bluetooth.init().then(async () => {
      this.initialized = true;
      // listen on first bluetooth adapter
      this.adapter = await this.bluetooth.getAdapter();
      if (!this.deviceFound) {
        await this.adapter.StartDiscovery();
      }
    });
  };

  private closeConnection = async (device: Bluez.Device) => {
    if (this.adapter && await this.adapter.Discovering()) {
      await this.adapter.StopDiscovery();
    }
    if (device && await device.Connected()) {
      await device.Disconnect();
    }
  };
}

