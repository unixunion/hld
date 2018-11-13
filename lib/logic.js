/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';
/**
 * Write your transction processor functions here
 */


/**
 * debit transaction
 * @param {org.kindred.hwn.DebitTransaction} debitTransaction
 * @transaction
 */
async function debitTransaction(tx) {
    const oldValue = tx.asset.balance;      // note the balance
    const newValue = oldValue - tx.amount;  // calculate the new value

    // if insufficient funds
    if (newValue<0) {
        throw new Error('insufficient funds');
    } else {
        // prepare the new balance for the asset
        tx.asset.balance = newValue;

        // Get the asset registry for the asset.
        const assetRegistry = await getAssetRegistry('org.kindred.hwn.AccountBalanceAsset');
        // Update the asset in the asset registry.
        await assetRegistry.update(tx.asset);

        // Emit an event for the modified asset.
        let event = getFactory().newEvent('org.kindred.hwn', 'BalanceChangedEvent');
        event.asset = tx.asset;
        event.oldBalance = oldValue;
        event.newBalance = newValue;
        emit(event);
    }
}

/**
 * credit transaction
 * @param {org.kindred.hwn.CreditTransaction} creditTransaction
 * @transaction
 */
async function creditTransaction(tx) {
    // Save the old value of the asset.
    const oldValue = tx.asset.balance;

    // calculate the new value
    const newValue = tx.amount + oldValue;

    // check credit limits
    if (newValue>tx.asset.owner.creditLimit) {
        throw new Error('credit limit exceeded');
    } else {
        // prepare the new balance for the asset
        tx.asset.balance = newValue;

        // Get the asset registry for the asset.
        const assetRegistry = await getAssetRegistry('org.kindred.hwn.AccountBalanceAsset');
        // Update the asset in the asset registry.
        await assetRegistry.update(tx.asset);

        // Emit an event for the modified asset.
        let event = getFactory().newEvent('org.kindred.hwn', 'BalanceChangedEvent');
        event.asset = tx.asset;
        event.oldBalance = oldValue;
        event.newBalance = newValue;
        emit(event);
    }
}


/**
 * transfer transaction
 * @param {org.kindred.hwn.TransferTransaction} transferTransaction
 * @transaction
 */
async function transferTransaction(tx) {
    // Save the old value of the asset.
    const fromBalance = tx.accountFrom.balance;
    const toBalance = tx.accountTo.balance;

    if ( tx.amount>0 && tx.amount <= fromBalance ) {

        tx.accountFrom.balance-=tx.amount;
        tx.accountTo.balance+=tx.amount;

        const assetRegistry = await getAssetRegistry('org.kindred.hwn.AccountBalanceAsset');
        await assetRegistry.update(tx.accountFrom);
        await assetRegistry.update(tx.accountTo);

        // Emit an event for the modified FROM account.
        let event1 = getFactory().newEvent('org.kindred.hwn', 'BalanceChangedEvent');
        event1.asset = tx.accountFrom;
        event1.oldBalance = fromBalance;
        event1.newBalance = fromBalance-tx.amount;
        emit(event1);

        // Emit an event for the modified TO account.
        let event2 = getFactory().newEvent('org.kindred.hwn', 'BalanceChangedEvent');
        event2.asset = tx.accountFrom;
        event2.oldBalance = toBalance;
        event2.newBalance = toBalance+tx.amount;
        emit(event2);

    } else {
        throw new Error('insufficient funds');
    }

}
