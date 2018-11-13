
# Hyperledger Demo

Hyperledger Demo


## Installing Dependencies

    npm install


## Testing

    npm test


## Deploying


### Packaging

    composer archive create -t dir -n .


### Installing a network first time

    composer network install --card PeerAdmin@hlfv1 --archiveFile hld@0.0.2.bna

    composer network start --networkName hld --networkVersion 0.0.2 --networkAdmin admin --networkAdminEnrollSecret adminpw --card PeerAdmin@hlfv1 --file networkadmin.card

    composer card import --file networkadmin.card

    composer network ping --card admin@hld


### Upgrading an existing network

Use the peeradmin card to upgrade the network!

    composer archive create -t dir -n .

    composer network install --card PeerAdmin@hlfv1 --archiveFile hld@0.0.4.bna

    composer network upgrade  --networkName hld --network-version 0.0.4 --card PeerAdmin@hlfv1


## Rest Service

    composer-rest-server -c admin@hld -n never -u true -w true