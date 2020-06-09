# eth-dcent-keyring
An implementation of MetaMask's [Keyring interface](https://github.com/MetaMask/eth-simple-keyring#the-keyring-class-protocol), that uses a D'CENT hardware wallet for all cryptographic operations.

In most regards, it works in the same way as [eth-hd-keyring](https://github.com/MetaMask/eth-hd-keyring), but using a D'CENT device. However there are a number of differences:

- Because the keys are stored in the device, operations that rely on the device will fail if there is no D'CENT device attached, or a different D'CENT device is attached.
- It does not support `signTypedData` or `exportAccount` methods, because D'CENT devices do not support these operations.
- It works the firmware version 1.3.0+ for D'CENT Biometric device
- It returns only one account. 

## Testing
Run the following command:

```
npm run test
```

## Attributions
This code was inspired by [eth-ledger-keyring](https://github.com/jamespic/eth-ledger-keyring), [eth-trezor-keyring](https://github.com/MetaMask/eth-trezor-keyring) and [eth-hd-keyring](https://github.com/MetaMask/eth-hd-keyring).