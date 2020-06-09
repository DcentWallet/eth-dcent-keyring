global.window = require('./window.shim')
global.navigator = require('./navigator.shim')
global.self = require('./self.shim')

const chai = require('chai')
const spies = require('chai-spies')

const { expect } = chai
const EthereumTx = require('ethereumjs-tx')
const assert = require('assert')
const DcentConnector = require('dcent-web-connector')

const DcentKeyring = require('..')

const fakeTx = new EthereumTx({
  nonce: '0x00',
  gasPrice: '0x09184e72a000',
  gasLimit: '0x2710',
  to: '0x0000000000000000000000000000000000000000',
  value: '0x00',
  data: '0x7f7465737432000000000000000000000000000000000000000000000000000000600057',
  // EIP 155 chainId - mainnet: 1, ropsten: 3
  chainId: 1,
})
const fakeAccounts = [
  '0xF30952A1c534CDE7bC471380065726fa8686dfB3',
]

chai.use(spies)

describe('DcentKeyring', function () {

  let keyring

  beforeEach(async function () {
    keyring = new DcentKeyring({timeOut: 2000})

    keyring.deserialize({
      accounts: [fakeAccounts[0]],
    })
  })

  describe('Keyring.type', function () {
    it('is a class property that returns the type string.', function (done) {
      const { type } = DcentKeyring
      assert.equal(typeof type, 'string')
      done()
    })

    it('returns the correct value', function (done) {
      const { type } = keyring
      const correct = DcentKeyring.type
      assert.equal(type, correct)
      done()
    })
  })

  describe('serialize', function () {
    it('serializes an instance', function (done) {
      keyring.serialize()
        .then((output) => {
          assert.equal(Array.isArray(output.accounts), true)
          assert.equal(output.accounts.length, 1)
          done()
        })
    })
  })

  describe('deserialize', function () {
    it('serializes what it deserializes', function (done) {

      keyring.deserialize({
        accounts: [],
      })
        .then(() => {
          return keyring.serialize()
        }).then((serialized) => {
          assert.equal(serialized.accounts.length, 0, 'restores 0 accounts')
          done()
        })
    })
  })


  describe('isUnlocked', function () {
    it('should return true ', function (done) {
      assert.equal(keyring.isUnlocked(), true)
      done()
    })
  })

  describe('unlock', function () {

    chai.spy.on(DcentConnector, 'getAddress')

    it('should call DcentConnector.getAddress if we dont unlock', function (done) {

      keyring.removeAccount(fakeAccounts[0])
      // there is no account !!
      keyring.unlock().catch((e) => {
          // because we're trying to open the dcent popup in node
        // it will throw an exception
      }).finally(() => {
        expect(DcentConnector.getAddress).to.have.been.called()
        done()
      })
    })
  })

  describe('setAccountToUnlock', function () {
    it('should set unlockedAccount', function (done) {
      keyring.setAccountToUnlock(0)
      assert.equal(keyring.unlockedAccount, 0)
      done()
    })
  })

  describe('addAccounts', function () {
    describe('with no arguments', function () {
      it('returns a single account', function (done) {
        keyring.setAccountToUnlock(0)
        keyring.addAccounts()
          .then((accounts) => {
            assert.equal(accounts.length, 1)
            done()
          })
      })
    })

    describe('with a numeric argument', function () {
      it('returns that number of accounts', function (done) {
        keyring.setAccountToUnlock(0)
        keyring.addAccounts(5)
          .then((accounts) => {
            assert.equal(accounts.length, 1) // only support 1 account
            done()
          })
      })

      it('returns the expected accounts', function (done) {
        keyring.setAccountToUnlock(0)
        keyring.addAccounts(0)
          .then((accounts) => {
            assert.equal(accounts.length, 1)
            done()
          })
      })
    })
  })

  describe('removeAccount', function () {
    describe('if the account exists', function () {
      it('should remove that account', function (done) {
        keyring.setAccountToUnlock(0)
        keyring.addAccounts()
          .then(async (accounts) => {
            assert.equal(accounts.length, 1)
            keyring.removeAccount(accounts[0])
            const accountsAfterRemoval = await keyring.getAccounts()
            assert.equal(accountsAfterRemoval.length, 0)
            done()
          })
      })
    })

    describe('if the account does not exist', function () {
      it('should throw an error', function (done) {
        const unexistingAccount = '0x0000000000000000000000000000000000000000'
        expect((_) => {
          keyring.removeAccount(unexistingAccount)
        }).to.throw(`Address ${unexistingAccount} not found in this keyring`)
        done()
      })
    })
  })

  describe('getFirstPage', function () {
    it('should set the currentPage to 1', async function () {
      await keyring.getFirstPage()
      assert.equal(keyring.page, 1)
    })

    it('should return the list of accounts for current page', async function () {

      const accounts = await keyring.getFirstPage()

      expect(accounts.length, keyring.perPage)
    })
  })

  describe('getNextPage', function () {

    it('should return the list of accounts for current page', async function () {
      const accounts = await keyring.getNextPage()
      expect(accounts.length, keyring.perPage)
    })

    it('should be able to advance to the next page', async function () {
      // manually advance 1 page
      await keyring.getNextPage()

      const accounts = await keyring.getNextPage()
      expect(accounts.length, keyring.perPage)
    })
  })

  describe('getPreviousPage', function () {

    it('should return the list of accounts for current page', async function () {
      // manually advance 1 page
      await keyring.getNextPage()
      const accounts = await keyring.getPreviousPage()

      expect(accounts.length, keyring.perPage)
    })


    it('should be able to go back to the previous page', async function () {
      // manually advance 1 page
      await keyring.getNextPage()
      const accounts = await keyring.getPreviousPage()

      expect(accounts.length, keyring.perPage)
    })
  })

  describe('getAccounts', function () {
    const accountIndex = 0
    let accounts = []
    beforeEach(async function () {
      keyring.setAccountToUnlock(accountIndex)
      await keyring.addAccounts()
      accounts = await keyring.getAccounts()
    })

    it('returns an array of accounts', function (done) {
      assert.equal(Array.isArray(accounts), true)
      assert.equal(accounts.length, 1)
      done()
    })
  })

  describe('signTransaction', function () {
    it('should call DcentConnector.getEthereumSignedTransaction', function (done) {

      chai.spy.on(DcentConnector, 'getEthereumSignedTransaction')

      keyring.signTransaction(fakeAccounts[0], fakeTx).catch((e) => {
        // we expect this to be rejected because
        // we are trying to open a popup from node
        expect(DcentConnector.getEthereumSignedTransaction).to.have.been.called()
        done()
      })
    })
  })

  describe('signMessage', function () {
    it('should call DcentConnector.getEthereumSignedMessage', function (done) {
      const sandbox = chai.spy.sandbox()
      sandbox.on(DcentConnector, 'getEthereumSignedMessage')
      keyring.signPersonalMessage(fakeAccounts[0], '0x546f2061766f6964206469676974616c2063617420627572676c6172732c207369676e2062656c6f7720746f2061757468656e74696361746520776974682043727970746f4b6974746965732e').catch((e) => {
        // we expect this to be rejected because
        // we are trying to open a popup from node
        expect(DcentConnector.getEthereumSignedMessage).to.have.been.called()
        sandbox.restore()
        done()
      })
    })
  })

  describe('signPersonalMessage', function () {
    it('should call DcentConnector.getEthereumSignedMessage', function (done) {

      const sandbox = chai.spy.sandbox()
      sandbox.on(DcentConnector, 'getEthereumSignedMessage')
      keyring.signPersonalMessage(fakeAccounts[0], '0x546f2061766f6964206469676974616c2063617420627572676c6172732c207369676e2062656c6f7720746f2061757468656e74696361746520776974682043727970746f4b6974746965732e').catch((e) => {
        // we expect this to be rejected because
        // we are trying to open a popup from node
        expect(DcentConnector.getEthereumSignedMessage).to.have.been.called()
        sandbox.restore()
        done()
      })
    })
  })

  describe('signTypedData', function () {
    it('should throw an error because it is not supported', async function () {
      let error = null
      try {
        await keyring.signTypedData()
      } catch (e) {
        error = e
      }

      expect(error instanceof Error, true)
      expect(error.toString(), 'Not supported on this device')
    })
  })

  describe('exportAccount', function () {
    it('should throw an error because it is not supported', async function () {
      let error = null
      try {
        await keyring.exportAccount()
      } catch (e) {
        error = e
      }

      expect(error instanceof Error, true)
      expect(error.toString(), 'Not supported on this device')
    })
  })

  describe('forgetDevice', function () {
    it('should clear the content of the keyring', async function () {
      // Add an account
      keyring.setAccountToUnlock(0)
      await keyring.addAccounts()

      // Wipe the keyring
      keyring.forgetDevice()

      const accounts = await keyring.getAccounts()

      assert.equal(keyring.isUnlocked(), false)
      assert.equal(accounts.length, 0)
    })
  })
})
