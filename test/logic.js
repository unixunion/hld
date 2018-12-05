'use strict';
/**
 * Write the unit tests for your transction processor functions here
 */

const AdminConnection = require('composer-admin').AdminConnection;
const BusinessNetworkConnection = require('composer-client').BusinessNetworkConnection;
const { BusinessNetworkDefinition, CertificateUtil, IdCard } = require('composer-common');
const path = require('path');

const chai = require('chai');
chai.should();
chai.use(require('chai-as-promised'));

const namespace = 'org.kindred.hldemo';
const assetType = 'AccountBalanceAsset';
const debitTransactionName = 'DebitTransaction';
const creditTransactionName = 'CreditTransaction';
const transferTransactionName = 'TransferTransaction';
const assetNS = namespace + '.' + assetType;
const participantType = 'IndividualParticipant';
const participantNS = namespace + '.' + participantType;

describe('#' + namespace, () => {
    // In-memory card store for testing so cards are not persisted to the file system
    const cardStore = require('composer-common').NetworkCardStoreManager.getCardStore( { type: 'composer-wallet-inmemory' } );

    // Embedded connection used for local testing
    const connectionProfile = {
        name: 'embedded',
        'x-type': 'embedded'
    };

    // Name of the business network card containing the administrative identity for the business network
    const adminCardName = 'admin';

    // Admin connection to the blockchain, used to deploy the business network
    let adminConnection;

    // This is the business network connection the tests will use.
    let businessNetworkConnection;

    // This is the factory for creating instances of types.
    let factory;

    // These are the identities for Alice and Bob.
    const aliceCardName = 'alice';
    const bobCardName = 'bob';

    // These are a list of receieved events.
    let events;

    let businessNetworkName;

    before(async () => {
        // Generate certificates for use with the embedded connection
        const credentials = CertificateUtil.generate({ commonName: 'admin' });

        // Identity used with the admin connection to deploy business networks
        const deployerMetadata = {
            version: 1,
            userName: 'PeerAdmin',
            roles: [ 'PeerAdmin', 'ChannelAdmin' ]
        };
        const deployerCard = new IdCard(deployerMetadata, connectionProfile);
        deployerCard.setCredentials(credentials);
        const deployerCardName = 'PeerAdmin';

        adminConnection = new AdminConnection({ cardStore: cardStore });

        await adminConnection.importCard(deployerCardName, deployerCard);
        await adminConnection.connect(deployerCardName);
    });

    /**
     *
     * @param {String} cardName The card name to use for this identity
     * @param {Object} identity The identity details
     */
    async function importCardForIdentity(cardName, identity) {
        const metadata = {
            userName: identity.userID,
            version: 1,
            enrollmentSecret: identity.userSecret,
            businessNetwork: businessNetworkName
        };
        const card = new IdCard(metadata, connectionProfile);
        await adminConnection.importCard(cardName, card);
    }

    // This is called before each test is executed.
    beforeEach(async () => {
        // Generate a business network definition from the project directory.
        let businessNetworkDefinition = await BusinessNetworkDefinition.fromDirectory(path.resolve(__dirname, '..'));
        businessNetworkName = businessNetworkDefinition.getName();
        await adminConnection.install(businessNetworkDefinition);
        const startOptions = {
            networkAdmins: [
                {
                    userName: 'admin',
                    enrollmentSecret: 'adminpw'
                }
            ]
        };
        const adminCards = await adminConnection.start(businessNetworkName, businessNetworkDefinition.getVersion(), startOptions);
        await adminConnection.importCard(adminCardName, adminCards.get('admin'));

        // Create and establish a business network connection
        businessNetworkConnection = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        businessNetworkConnection.on('event', event => {
            events.push(event);
        });
        await businessNetworkConnection.connect(adminCardName);

        // Get the factory for the business network.
        factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        const participantRegistry = await businessNetworkConnection.getParticipantRegistry(participantNS);
        // Create the participants.
        const alice = factory.newResource(namespace, participantType, 'alice@email.com');
        alice.firstName = 'Alice';
        alice.lastName = 'A';
        alice.dob = new Date();
        alice.identityNumber = '123456';

        const bob = factory.newResource(namespace, participantType, 'bob@email.com');
        bob.firstName = 'Bob';
        bob.lastName = 'B';
        bob.dob = new Date();
        bob.identityNumber = '123456';

        participantRegistry.addAll([alice, bob]);

        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        // Create the assets.
        const asset1 = factory.newResource(namespace, assetType, '1');
        asset1.owner = factory.newRelationship(namespace, participantType, 'alice@email.com');
        asset1.balance = 10;

        const asset2 = factory.newResource(namespace, assetType, '2');
        asset2.owner = factory.newRelationship(namespace, participantType, 'bob@email.com');
        asset2.balance = 20;

        assetRegistry.addAll([asset1, asset2]);

        // Issue the identities.
        let identity = await businessNetworkConnection.issueIdentity(participantNS + '#alice@email.com', 'alice1');
        await importCardForIdentity(aliceCardName, identity);
        identity = await businessNetworkConnection.issueIdentity(participantNS + '#bob@email.com', 'bob1');
        await importCardForIdentity(bobCardName, identity);
    });

    /**
     * Reconnect using a different identity.
     * @param {String} cardName The name of the card for the identity to use
     */
    async function useIdentity(cardName) {
        await businessNetworkConnection.disconnect();
        businessNetworkConnection = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        businessNetworkConnection.on('event', (event) => {
            events.push(event);
        });
        await businessNetworkConnection.connect(cardName);
        factory = businessNetworkConnection.getBusinessNetwork().getFactory();
    }

    it('Alice can read all account balances', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        const assets = await assetRegistry.getAll();

        // Validate the assets.
        assets.should.have.lengthOf(2);
        const asset1 = assets[0];
        asset1.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#alice@email.com');
        asset1.balance.should.equal(10);
        const asset2 = assets[1];
        asset2.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#bob@email.com');
        asset2.balance.should.equal(20);
    });

    it('Bob can read all account balances', async () => {
        // Use the identity for Bob.
        await useIdentity(bobCardName);
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        const assets = await assetRegistry.getAll();

        // Validate the assets.
        assets.should.have.lengthOf(2);
        const asset1 = assets[0];
        asset1.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#alice@email.com');
        asset1.balance.should.equal(10);
        const asset2 = assets[1];
        asset2.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#bob@email.com');
        asset2.balance.should.equal(20);
    });

    it('Alice can create and own an account', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Create the asset.
        let asset3 = factory.newResource(namespace, assetType, '3');
        asset3.owner = factory.newRelationship(namespace, participantType, 'alice@email.com');
        asset3.balance = 30;

        // Add the asset, then get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        await assetRegistry.add(asset3);

        // Validate the asset.
        asset3 = await assetRegistry.get('3');
        asset3.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#alice@email.com');
        asset3.balance.should.equal(30);
    });

    it('Alice cannot create accounts on behalf of Bob', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Create the asset.
        const asset3 = factory.newResource(namespace, assetType, '3');
        asset3.owner = factory.newRelationship(namespace, participantType, 'bob@email.com');
        asset3.balance = 30;

        // Try to add the asset, should fail.
        const assetRegistry = await  businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.add(asset3).should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Bob can create and own an account', async () => {
        // Use the identity for Bob.
        await useIdentity(bobCardName);

        // Create the asset.
        let asset4 = factory.newResource(namespace, assetType, '4');
        asset4.owner = factory.newRelationship(namespace, participantType, 'bob@email.com');
        asset4.balance = 40;

        // Add the asset, then get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        await assetRegistry.add(asset4);

        // Validate the asset.
        asset4 = await assetRegistry.get('4');
        asset4.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#bob@email.com');
        asset4.balance.should.equal(40);
    });

    it('Bob cannot create accounts on behalf of Alice', async () => {
        // Use the identity for Bob.
        await useIdentity(bobCardName);

        // Create the asset.
        const asset4 = factory.newResource(namespace, assetType, '4');
        asset4.owner = factory.newRelationship(namespace, participantType, 'alice@email.com');
        asset4.balance = 40;

        // Try to add the asset, should fail.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.add(asset4).should.be.rejectedWith(/does not have .* access to resource/);

    });

    it('Alice can not update her own balance balance directly', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Create the asset.
        let asset1 = factory.newResource(namespace, assetType, '1');
        asset1.owner = factory.newRelationship(namespace, participantType, 'alice@email.com');
        asset1.balance = 50;

        // Update the asset, then get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.update(asset1).should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Alice cannot update Bob\'s account balance directly', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Create the asset.
        const asset2 = factory.newResource(namespace, assetType, '2');
        asset2.owner = factory.newRelationship(namespace, participantType, 'bob@email.com');
        asset2.balance = 50;

        // Try to update the asset, should fail.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.update(asset2).should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Bob cannot update his own account balance directly', async () => {
        // Use the identity for Bob.
        await useIdentity(bobCardName);

        // Create the asset.
        let asset2 = factory.newResource(namespace, assetType, '2');
        asset2.owner = factory.newRelationship(namespace, participantType, 'bob@email.com');
        asset2.balance = 60;

        // Update the asset, then get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.update(asset2).should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Bob cannot modify Alice\'s account balance directly', async () => {
        // Use the identity for Bob.
        await useIdentity(bobCardName);

        // Create the asset.
        const asset1 = factory.newResource(namespace, assetType, '1');
        asset1.owner = factory.newRelationship(namespace, participantType, 'alice@email.com');
        asset1.balance = 60;

        // Update the asset, then get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.update(asset1).should.be.rejectedWith(/does not have .* access to resource/);

    });

    it('Alice cannot remove her account asset', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Remove the asset, then test the asset exists.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.remove('1').should.be.rejectedWith(/does not have .* access to resource/);
        // const exists = await assetRegistry.exists('1');
        // exists.should.be.false;
    });

    it('Alice cannot remove Bob\'s account asset', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Remove the asset, then test the asset exists.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.remove('2').should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Bob cannot remove his account assets', async () => {
        // Use the identity for Bob.
        await useIdentity(bobCardName);

        // Remove the asset, then test the asset exists.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.remove('2').should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Bob cannot remove Alice\'s assets', async () => {
        // Use the identity for Bob.
        await useIdentity(bobCardName);

        // Remove the asset, then test the asset exists.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.remove('1').should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Alice can debit her own accounts', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, debitTransactionName);
        transaction.asset = factory.newRelationship(namespace, assetType, '1');
        transaction.amount = 10;
        await businessNetworkConnection.submitTransaction(transaction);

        //businessNetworkConnection.submitTransaction(transaction).should.be.rejectedWith(/does not have .* access to resource/);

        // Get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        const asset1 = await assetRegistry.get('1');

        // Validate the asset.
        asset1.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#alice@email.com');
        asset1.balance.should.equal(0);

        // Validate the events.
        events.should.have.lengthOf(1);
        const event = events[0];
        event.eventId.should.be.a('string');
        event.timestamp.should.be.an.instanceOf(Date);
        event.asset.getFullyQualifiedIdentifier().should.equal(assetNS + '#1');
        event.oldBalance.should.equal(10);
        event.newBalance.should.equal(0);
    });

    it('Bob cannot debit Alice\'s accounts', async () => {
        // Use the identity for Alice.
        await useIdentity(bobCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, debitTransactionName);
        transaction.asset = factory.newRelationship(namespace, assetType, '1');
        transaction.amount = 10;
        businessNetworkConnection.submitTransaction(transaction).should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Alice cannot withdraw more than she has', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, debitTransactionName);
        transaction.asset = factory.newRelationship(namespace, assetType, '1');
        transaction.amount = 1000;
        await businessNetworkConnection.submitTransaction(transaction).should.be.rejectedWith(/insufficient funds/);

        // Validate the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        const asset1 = await assetRegistry.get('1');
        asset1.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#alice@email.com');
        asset1.balance.should.equal(10);
    });

    it('Alice cannot double debits', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Submit the transaction.
        const transaction1 = factory.newTransaction(namespace, debitTransactionName);
        transaction1.asset = factory.newRelationship(namespace, assetType, '1');
        transaction1.amount = 10;
        const transaction2 = factory.newTransaction(namespace, debitTransactionName);
        transaction2.asset = factory.newRelationship(namespace, assetType, '1');
        transaction2.amount = 10;

        // one should succeeed
        businessNetworkConnection.submitTransaction(transaction1);
        // imediately followed by a concurrent request that should fail
        await businessNetworkConnection.submitTransaction(transaction2).should.be.rejectedWith(/Document update conflict/);

        // Validate the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        const asset1 = await assetRegistry.get('1');
        asset1.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#alice@email.com');
        asset1.balance.should.equal(0);
    });

    it('Alice can credit/deposit into own account', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, creditTransactionName);
        transaction.asset = factory.newRelationship(namespace, assetType, '1');
        transaction.amount = 50;
        // console.log(JSON.stringify(transaction));
        await businessNetworkConnection.submitTransaction(transaction);

        // Get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        const asset1 = await assetRegistry.get('1');

        // Validate the asset.
        asset1.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#alice@email.com');
        asset1.balance.should.equal(60);

        // Validate the events.
        events.should.have.lengthOf(1);
        const event = events[0];
        event.eventId.should.be.a('string');
        event.timestamp.should.be.an.instanceOf(Date);
        event.asset.getFullyQualifiedIdentifier().should.equal(assetNS + '#1');
        event.oldBalance.should.equal(10);
        event.newBalance.should.equal(60);
    });

    it('Alice can transfer to Bobs account', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, transferTransactionName);
        transaction.accountFrom = factory.newRelationship(namespace, assetType, '1');
        transaction.accountTo = factory.newRelationship(namespace, assetType, '2');
        transaction.amount = 10;
        await businessNetworkConnection.submitTransaction(transaction);

        // Get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);

        // Validate the asset is 0
        const asset1 = await assetRegistry.get('1');
        asset1.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#alice@email.com');
        asset1.balance.should.equal(0);

        // validate bob has the moneys
        const asset2= await assetRegistry.get('2');
        asset2.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#bob@email.com');
        asset2.balance.should.equal(30);

        // Validate the events.
        events.should.have.lengthOf(2);
        const event1 = events[0];
        event1.eventId.should.be.a('string');
        event1.timestamp.should.be.an.instanceOf(Date);
        event1.asset.getFullyQualifiedIdentifier().should.equal(assetNS + '#1');
        event1.oldBalance.should.equal(10);
        event1.newBalance.should.equal(0);

        const event2 = events[1];
        event2.eventId.should.be.a('string');
        event2.timestamp.should.be.an.instanceOf(Date);
        event2.asset.getFullyQualifiedIdentifier().should.equal(assetNS + '#1');
        event2.oldBalance.should.equal(20);
        event2.newBalance.should.equal(30);
    });

    it('Alice cannot transfer more than she has to Bobs account', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, transferTransactionName);
        transaction.accountFrom = factory.newRelationship(namespace, assetType, '1');
        transaction.accountTo = factory.newRelationship(namespace, assetType, '2');
        transaction.amount = 100;
        businessNetworkConnection.submitTransaction(transaction).should.be.rejectedWith(/insufficient funds/);

        // Get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);

        // Validate the asset is 10
        const asset1 = await assetRegistry.get('1');
        asset1.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#alice@email.com');
        asset1.balance.should.equal(10);

        // validate bob still has 20
        const asset2= await assetRegistry.get('2');
        asset2.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#bob@email.com');
        asset2.balance.should.equal(20);
    });


    it('Alice cannot transfer from Bobs account to her own', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, transferTransactionName);
        transaction.accountFrom = factory.newRelationship(namespace, assetType, '2');
        transaction.accountTo = factory.newRelationship(namespace, assetType, '1');
        transaction.amount = 10;
        businessNetworkConnection.submitTransaction(transaction).should.be.rejectedWith(/does not have .* access to resource/);

        // Get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);

        // Validate the asset is 0
        const asset1 = await assetRegistry.get('1');
        asset1.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#alice@email.com');
        asset1.balance.should.equal(10);

        // validate bob has the moneys
        const asset2= await assetRegistry.get('2');
        asset2.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#bob@email.com');
        asset2.balance.should.equal(20);

    });


    it('Alice cannot exceed her credit limit', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, creditTransactionName);
        transaction.asset = factory.newRelationship(namespace, assetType, '1');
        transaction.amount = 5000;
        businessNetworkConnection.submitTransaction(transaction).should.be.rejectedWith(/credit limit exceeded/);
    });


    it('Alice cannot debit Bob\'s account', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, creditTransactionName);
        transaction.asset = factory.newRelationship(namespace, assetType, '2');
        transaction.amount = 50;
        businessNetworkConnection.submitTransaction(transaction).should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Bob can credit his own account', async () => {
        // Use the identity for Bob.
        await useIdentity(bobCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, creditTransactionName);
        transaction.asset = factory.newRelationship(namespace, assetType, '2');
        transaction.amount = 60;
        await businessNetworkConnection.submitTransaction(transaction);

        // Get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        const asset2 = await assetRegistry.get('2');

        // Validate the asset.
        asset2.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#bob@email.com');
        asset2.balance.should.equal(80);

        // Validate the events.
        events.should.have.lengthOf(1);
        const event = events[0];
        event.eventId.should.be.a('string');
        event.timestamp.should.be.an.instanceOf(Date);
        event.asset.getFullyQualifiedIdentifier().should.equal(assetNS + '#2');
        event.oldBalance.should.equal(20);
        event.newBalance.should.equal(80);
    });

    it('Bob cannot debit Alice\'s account', async () => {
        // Use the identity for Bob.
        await useIdentity(bobCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, creditTransactionName);
        transaction.asset = factory.newRelationship(namespace, assetType, '1');
        transaction.amount = 60;
        businessNetworkConnection.submitTransaction(transaction).should.be.rejectedWith(/does not have .* access to resource/);
    });

});
