const { EventEmitter } = require('events')
const { TransactionFactory } = require('@ethereumjs/tx')
const ethUtil = require('ethereumjs-util')
const DcentConnector = require('dcent-web-connector')

const DefaultKeyPathString = `m/44'/60'/0'/0/0`
const keyringType = 'DCENT Hardware'
const DCENT_TIMEOUT = 60000
const DcentResult = {
  SUCCESS: 'success',
  ERROR: 'error',
}

let LOG
if (process.env.NODE_ENV !== 'production') {
  LOG = console.log.bind(console, '[LOG]')
} else {
  LOG = () => {}
}

const splitPath = path => {
  return path.split('/').filter(item => item.trim() !== '')
}
const hardenedIdx = [1, 2, 3]
const isHardened = idx => {
  return hardenedIdx.includes(idx)
}

const getFullPath = (path, idx) => {
  const pieces = splitPath(path)
  let fullpath = 'm'
  for (let i = 1; i < 6; i++) {
    if (i < pieces.length) {
      fullpath += `/${pieces[i]}`
    } else if (i === pieces.length) {
      fullpath += `/${idx}`
    } else {
      fullpath += `/0`
    }
    if (isHardened(i) && !fullpath.endsWith("'")) {
      fullpath += "'"
    }
  }
  return fullpath
}

const coinType = DcentConnector.coinType
const getCoinType = path => {
  let type
  switch (/m\/44'\/(\d+)'/g.exec(path)[1]) {
    case '0':
      type = coinType.BITCOIN
      break
    case '1':
      type = coinType.BITCOIN_TESTNET
      break
    case '60':
      type = coinType.ETHEREUM
      break
    case '137':
      type = coinType.RSK
      break
    case '144':
      type = coinType.RIPPLE
      break
    case '22':
      type = coinType.MONACOIN
      break
    case '8217':
      type = coinType.KLAYTN
      break
    default:
      throw new Error('Not Supported path')
  }
  return type
}

function isOldStyleEthereumjsTx (tx) {
  return typeof tx.getChainId === 'function'
}


class DcentKeyring extends EventEmitter {
  constructor (opts = {}) {
    super()
    this.type = keyringType
    this.accounts = []
    this._accounts = []
    this.page = 0
    this.perPage = 1 // support only one account
    this.unlockedAccount = 0
    // this.paths = {}
    this.deserialize(opts)
    DcentConnector.setTimeOutMs(opts.timeOut || DCENT_TIMEOUT)
  }

  serialize () {
    return Promise.resolve({
      accounts: this.accounts,
      _accounts: this._accounts,
      hdPath: this.hdPath,
      // page: this.page,
      // paths: this.paths,
      // perPage: this.perPage,
      unlockedAccount: this.unlockedAccount,
    })
  }

  deserialize (opts = {}) {
    this.accounts = opts.accounts || []
    this._accounts = opts._accounts || []
    this.hdPath = opts.hdPath || DefaultKeyPathString
    // this.page = opts.page || 0
    // this.perPage = opts.perPage || 1
    this.path = getFullPath(this.hdPath, 0)
    this.coinType = getCoinType(this.path)
    return Promise.resolve()
  }

  isUnlocked () {
    LOG('isUnlocked - ', Boolean(this._accounts && this._accounts.length !== 0))
    return Boolean(this._accounts && this._accounts.length !== 0)
  }

  unlock () {
    LOG('unlock ENTER')
    if (this.isUnlocked()) {
      return Promise.resolve(this._accounts[0]) // return first account address
    }
    return new Promise((resolve, reject) => {
      DcentConnector.getAddress(
        this.coinType,
        this.path
      ).then((response) => {
        if (response.header.status === DcentResult.SUCCESS) {
          LOG('getAddress return - ', response.body.parameter.address)
          this._accounts = [ response.body.parameter.address ]
          resolve(response.body.parameter.address) // return address of first account
        } else if (response.body.error) {
          reject(new Error(`${response.body.error.code} - ${response.body.error.message}`))
        } else {
          reject(new Error(`Unknown error - ${response}`))
        }
      }).catch((e) => {
        if (e.body.error) {
          reject(new Error(`${e.body.error.code} - ${e.body.error.message}`))
        } else {
          reject(new Error(`Unknown error - ${e}`))
        }
      }).finally((_) => {
        DcentConnector.popupWindowClose()
      })
    })
  }

  setAccountToUnlock (index) {
    LOG('setAccountToUnlock ENTER')
    this.unlockedAccount = parseInt(index, 10)
  }

  addAccounts (n = 1) {
    LOG('addAccounts ENTER')
    return new Promise((resolve, reject) => {
      this.unlock()
        .then((address) => {
          this.accounts = []
          this.accounts.push(address)
          this.page = 0
          LOG('addAccounts - ', this.accounts)
          resolve(this.accounts)
        })
        .catch((e) => {
          reject(e)
        })
    })
  }

  getFirstPage () {
    LOG('getFirstPage ENTER')
    this.page = 0
    return this.__getPage(1)
  }

  getNextPage () {
    LOG('getNextPage ENTER')
    return this.__getPage(1)
  }

  getPreviousPage () {
    LOG('getPreviousPage ENTER')
    return this.__getPage(-1)
  }

  __getPage (increment) {
    this.page = 1

    return new Promise((resolve, reject) => {
      this.unlock()
        .then((address) => {
          // support only 1 account
          const accounts = []
          accounts.push({
            address,
            balance: null,
            index: 0,
          })
          // this.paths[ethUtil.toChecksumAddress(address)] = 0
          LOG('__getPage return accounts - ', accounts)
          resolve(accounts)
        })
        .catch((e) => {
          reject(e)
        })
    })
  }

  getAccounts () {
    return Promise.resolve(this.accounts.slice())
  }

  removeAccount (address) {
    if (!this.accounts.map((a) => a.toLowerCase()).includes(address.toLowerCase())) {
      throw new Error(`Address ${address} not found in this keyring`)
    }
    this.accounts = this.accounts.filter((a) => a.toLowerCase() !== address.toLowerCase())
  }

  // tx is an instance of the ethereumjs-transaction class.
  signTransaction (address, tx) {
    console.log('signTransaction start')
    if (isOldStyleEthereumjsTx(tx)) { // old style transaction
      tx.v = ethUtil.bufferToHex(tx.getChainId())
      tx.r = '0x00'
      tx.s = '0x00'

      return this._signTransaction(address, tx.getChainId(), tx)
    }

    return this._signTransaction(
      address,
      tx.common.chainIdBN().toNumber(),
      tx
    )
  }

  _signTransaction (address, chainId, tx) {

    let transaction
    if (isOldStyleEthereumjsTx(tx)) {
      // legacy transaction from ethereumjs-tx package has no .toJSON() function,
      // so we need to convert to hex-strings manually manually
      transaction = {
        to: this._normalize(tx.to),
        value: this._normalize(tx.value),
        data: this._normalize(tx.data),
        chainId,
        nonce: this._normalize(tx.nonce),
        gasLimit: this._normalize(tx.gasLimit),
        gasPrice: this._normalize(tx.gasPrice),
      }
    } else {
      transaction = {
        ...tx.toJSON(),
        chainId,
        to: this._normalize(tx.to),
      }
    }
    transaction.nonce = (transaction.nonce === '0x') ? '0x0' : transaction.nonce
    transaction.value = (transaction.value === '0x') ? '0x0' : transaction.value

    const testtx = 'f9026a11843b9ae3c58307fba294a6b71e26c5e0845f74c812102ca7114b6a896ab280b902041688f0b9000000000000000000000000d9db270c1b5e3bd161e8c8503c55ceabee70955200000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000017ea009ce800000000000000000000000000000000000000000000000000000000000000164b63e800d0000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000140000000000000000000000000f48f2b2d2a534e402487b3ee7c18c33aec0fe5e4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000054b9c508ac61eaf2cd8f9ca510ec3897cfb093820000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002ca0b4428c9be64efa9c22c0214df63b658610dd4b17f52425d6efd3a6c963d2d25ba002db42e306bac0c454a03275cfb27fc6bee0a52dbc1241647a6b8cf861bd7c58'
    const but = Buffer.from(testtx, 'hex')
    const r = Buffer.from( ethUtil.stripHexPrefix('0x8bfc799b32458ab43507f54cf2ed6f69e86530ca466886383519d8069133c196'), 'hex')
    const s = Buffer.from('0x7bc4bdeffc12eb3c00b67275dba9dc8500067ea7d9ae4d7c818bba9cb08b0147', 'hex')
    const v = Buffer.from('0x2c', 'hex')
    LOG('r', r)
    LOG('s', s)
    LOG('r', v)
    LOG('Transaction', TransactionFactory.fromSerializedData(but))
    // const aaa = TransactionFactory.fromSerializedData(but)
    // const aaa = TransactionFactory.fromSerializedData(but)
    // LOG('aaa', aaa)
    // LOG('signTransaction - address', address)
    // LOG('signTransaction - transaction', transaction)
    return new Promise((resolve, reject) => {
      this.unlock()
        .then((_) => {
          DcentConnector.getEthereumSignedTransaction(
            this.coinType,
            transaction.nonce,
            transaction.gasPrice,
            transaction.gasLimit,
            transaction.to,
            transaction.value,
            transaction.data,
            this.path, // key path
            transaction.chainId
          ).then((response) => {
            console.log('response - ', response)
            if (response.header.status === DcentResult.SUCCESS) {
              const parameter = response.body.parameter
              console.log('parameter - ', parameter)
              console.log('parameter.signed - ', parameter.signed)
              console.log('parameter.sing_v - ', parameter.sign_v)
              console.log('parameter.sing_r - ', parameter.sign_r)
              console.log('parameter.sing_s - ', parameter.sign_s)
              const signedBuffer = Buffer.from(parameter.signed, 'hex')
              LOG('signedBuffer - ', signedBuffer)
              LOG('TransactionFactory', TransactionFactory)
              LOG('TransactionFactory', TransactionFactory.fromSerializedData)

              const tempTx = TransactionFactory.fromSerializedData(signedBuffer)
              console.log('tempTx - ', tempTx)

              let signedTx = tx
              if (isOldStyleEthereumjsTx(tx)) {
                signedTx.v = Buffer.from(ethUtil.stripHexPrefix(parameter.sign_v), 'hex')
                signedTx.r = Buffer.from(ethUtil.stripHexPrefix(parameter.sign_r), 'hex')
                signedTx.s = Buffer.from(ethUtil.stripHexPrefix(parameter.sign_s), 'hex')
              } else {
                signedTx = tempTx
              }

              const addressSignedWith = ethUtil.toChecksumAddress(
                ethUtil.addHexPrefix(
                  tempTx.getSenderAddress().toString('hex'),
                ),
              )
              const correctAddress = ethUtil.toChecksumAddress(address)
              if (addressSignedWith !== correctAddress) {
                reject(new Error("signature doesn't match the right address"))
              }
              console.log('signedTx - ', signedTx)
              resolve(signedTx)
            } else if (response.body.error) {
              reject(new Error(`${response.body.error.code} - ${response.body.error.message}`))
            } else {
              reject(new Error(`Unknown error - ${response}`))
            }

          }).catch((e) => {
            console.log('e - ', e)
            if (e.body.error) {
              reject(new Error(`${e.body.error.code} - ${e.body.error.message}`))
            } else {
              reject(new Error(`Unknown error - ${e}`))
            }
          }).finally((_) => {
            DcentConnector.popupWindowClose()
          })
        }).catch((e) => {
          if (e.body.error) {
            reject(new Error(`${e.body.error.code} - ${e.body.error.message}`))
          } else {
            reject(new Error(`Unknown error - ${e}`))
          }
        })
    })

  }

  signMessage (withAccount, data) {
    return this.signPersonalMessage(withAccount, data)
  }

  // For personal_sign, we need to prefix the message:
  signPersonalMessage (withAccount, message) {
    LOG('signPersonalMessage - withAccount', withAccount)
    LOG('signPersonalMessage - message', message)
    return new Promise((resolve, reject) => {
      this.unlock()
        .then((_) => {
          DcentConnector.getEthereumSignedMessage(
            message,
            this.path
          ).then((response) => {
            if (response.header.status === DcentResult.SUCCESS) {
              if (response.body.parameter.address !== ethUtil.toChecksumAddress(withAccount)) {
                reject(new Error('signature doesnt match the right address'))
              }
              resolve(response.body.parameter.sign)
            } else if (response.body.error) {
              reject(new Error(`${response.body.error.code} - ${response.body.error.message}`))
            } else {
              reject(new Error(`Unknown error - ${response}`))
            }
          }).catch((e) => {
            if (e.body.error) {
              reject(new Error(`${e.body.error.code} - ${e.body.error.message}`))
            } else {
              reject(new Error(`Unknown error - ${e}`))
            }
          }).finally((_) => {
            DcentConnector.popupWindowClose()
          })

        }).catch((e) => {
          if (e.body.error) {
            reject(new Error(`${e.body.error.code} - ${e.body.error.message}`))
          } else {
            reject(new Error(`Unknown error - ${e}`))
          }
        })
    })
  }

  signTypedData (withAccount, typedData) {
    // Waiting on dcent to enable this
    LOG('signPersonalMessage - withAccount', withAccount)
    LOG('signTypedData - typedData', typedData)

    return new Promise((resolve, reject) => {
      this.unlock()
        .then((_) => {
          DcentConnector.getEthereumSignedTypedData(
            typedData,
            this.path
          ).then((response) => {
            if (response.header.status === DcentResult.SUCCESS) {
              if (response.body.parameter.address !== ethUtil.toChecksumAddress(withAccount)) {
                reject(new Error('signature doesnt match the right address'))
              }
              resolve(response.body.parameter.sign)
            } else if (response.body.error) {
              reject(new Error(`${response.body.error.code} - ${response.body.error.message}`))
            } else {
              reject(new Error(`Unknown error - ${response}`))
            }
          }).catch((e) => {
            if (e.body.error) {
              reject(new Error(`${e.body.error.code} - ${e.body.error.message}`))
            } else {
              reject(new Error(`Unknown error - ${e}`))
            }
          }).finally((_) => {
            DcentConnector.popupWindowClose()
          })

        }).catch((e) => {
          if (e.body.error) {
            reject(new Error(`${e.body.error.code} - ${e.body.error.message}`))
          } else {
            reject(new Error(`Unknown error - ${e}`))
          }
        })
    })
  }

  exportAccount (address) {
    return Promise.reject(new Error('Not supported on this device'))
  }

  forgetDevice () {
    this.accounts = []
    this._accounts = []
    this.page = 0
    this.unlockedAccount = 0
    // this.paths = {}
  }

  /* PRIVATE METHODS */

  _normalize (buf) {
    return ethUtil.bufferToHex(buf).toString()
  }

}

DcentKeyring.type = keyringType
module.exports = DcentKeyring
