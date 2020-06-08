const { EventEmitter } = require('events')
const ethUtil = require('ethereumjs-util')
const Transaction = require('ethereumjs-tx')
const DcentConnector = require('dcent-web-connector')

const DefaultKeyPathString = `m/44'/60'/0'/0/0`
const keyringType = 'DCENT Hardware'
const DCENT_TIMEOUT = 60000
const DcentResult = require('./dcent-result')

let LOG
if (process.env.NODE_ENV !== 'production') {
  LOG = console.log.bind(console, '[LOG]')
} else {
  LOG = () => {}
}

class DcentKeyring extends EventEmitter {
  constructor (opts = {}) {
    super()
    this.type = keyringType
    this.accounts = []
    this.page = 0
    this.perPage = 1 // support only one account
    this.unlockedAccount = 0
    // this.paths = {}
    this.coinType = DcentConnector.coinType.ETHEREUM
    this.path = DefaultKeyPathString
    this.deserialize(opts)
    DcentConnector.setTimeOutMs(opts.timeOut || DCENT_TIMEOUT)
  }

  serialize () {
    return Promise.resolve({
      accounts: this.accounts,
      // page: this.page,
      // paths: this.paths,
      // perPage: this.perPage,
      unlockedAccount: this.unlockedAccount,
    })
  }

  deserialize (opts = {}) {
    this.accounts = opts.accounts || []
    // this.page = opts.page || 0
    // this.perPage = opts.perPage || 1
    return Promise.resolve()
  }

  isUnlocked () {
    LOG('isUnlocked - ', Boolean(this.accounts && this.accounts.length !== 0))
    return Boolean(this.accounts && this.accounts.length !== 0)
  }

  unlock () {
    LOG('unlock ENTER')
    if (this.isUnlocked()) {
      return Promise.resolve(this.accounts[0]) // return first account address
    }
    return new Promise((resolve, reject) => {
      DcentConnector.getAddress(
        this.coinType,
        this.path
      ).then((response) => {
        if (response.header.status === DcentResult.SUCCESS) {
          LOG('getAddress return - ', response.body.parameter.address)
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
    const txObj = this._generateTxObj(tx)
    LOG('signTransaction - address', address)
    LOG('signTransaction - tx', txObj)
    return new Promise((resolve, reject) => {
      this.unlock()
        .then((_) => {
          DcentConnector.getEthereumSignedTransaction(
            this.coinType,
            txObj.nonce,
            txObj.gasPrice,
            txObj.gasLimit,
            txObj.to,
            txObj.value,
            txObj.data,
            this.path, // key path
            txObj.chainId
          ).then((response) => {
            if (response.header.status === DcentResult.SUCCESS) {
              tx.v = response.body.parameter.sign_v
              tx.r = response.body.parameter.sign_r
              tx.s = response.body.parameter.sign_s
              const signedTx = new Transaction(tx)

              const addressSignedWith = ethUtil.toChecksumAddress(`0x${signedTx.from.toString('hex')}`)
              const correctAddress = ethUtil.toChecksumAddress(address)
              if (addressSignedWith !== correctAddress) {
                reject(new Error('signature doesnt match the right address'))
              }
              resolve(signedTx)
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
    return Promise.reject(new Error('Not supported on this device'))
  }

  exportAccount (address) {
    return Promise.reject(new Error('Not supported on this device'))
  }

  forgetDevice () {
    this.accounts = []
    this.page = 0
    this.unlockedAccount = 0
    // this.paths = {}
  }

  /* PRIVATE METHODS */
  _generateTxObj (tx) {
    const txObj = {}
    txObj.nonce = this._normalize(tx.nonce)
    txObj.nonce = (txObj.nonce === '0x') ? '0x0' : txObj.nonce
    txObj.gasPrice = this._normalize(tx.gasPrice)
    txObj.gasLimit = this._normalize(tx.gasLimit)
    txObj.to = this._normalize(tx.to)
    txObj.value = this._normalize(tx.value)
    txObj.value = (txObj.value === '0x') ? '0x0' : txObj.value
    txObj.data = this._normalize(tx.data)
    txObj.chainId = tx._chainId
    return txObj
  }

  _normalize (buf) {
    return ethUtil.bufferToHex(buf).toString()
  }

  // _addressFromIndex (pathBase, i) {
  //   const dkey = this.hdk.derive(`${pathBase}/${i}`)
  //   const address = ethUtil
  //     .publicToAddress(dkey.publicKey, true)
  //     .toString('hex')
  //   return ethUtil.toChecksumAddress(address)
  // }

  // _pathFromAddress (address) {
  //   const checksummedAddress = ethUtil.toChecksumAddress(address)
  //   let index = this.paths[checksummedAddress]
  //   if (typeof index === 'undefined') {
  //     for (let i = 0; i < MAX_INDEX; i++) {
  //       if (checksummedAddress === this._addressFromIndex(pathBase, i)) {
  //         index = i
  //         break
  //       }
  //     }
  //   }

  //   if (typeof index === 'undefined') {
  //     throw new Error('Unknown address')
  //   }
  //   return `${this.hdPath}/${index}`
  // }
}

DcentKeyring.type = keyringType
module.exports = DcentKeyring
