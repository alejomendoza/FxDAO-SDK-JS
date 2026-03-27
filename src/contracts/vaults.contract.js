import { FxDAOVaultsContractMethods, UpdateVaultOperationType, } from '../interfaces';
import { calculateVaultIndex, generateOptionalVaultKeyScVal, parseError, ParseErrorType } from '../utils';
import { Contract } from '@stellar/stellar-sdk';
export class VaultsContract {
    globalParams;
    constructor(globalParams) {
        this.globalParams = globalParams;
    }
    get server() {
        return new this.globalParams.stellarSDK.rpc.Server(this.globalParams.rpc, {
            allowHttp: !!this.globalParams.allowHttp,
        });
    }
    get contract() {
        return new this.globalParams.stellarSDK.Contract(this.globalParams.contractId);
    }
    async calculateDepositRatio(params) {
        const currencyRate = this.globalParams.stellarSDK.nativeToScVal(params.currencyRate, { type: 'u128' });
        const collateral = this.globalParams.stellarSDK.nativeToScVal(params.collateral, { type: 'u128' });
        const debt = this.globalParams.stellarSDK.nativeToScVal(params.debt, { type: 'u128' });
        const account = new this.globalParams.stellarSDK.Account(this.globalParams.simulationAccount, '0');
        const tx = new this.globalParams.stellarSDK.TransactionBuilder(account, {
            fee: this.globalParams.defaultFee,
            networkPassphrase: this.globalParams.network,
        })
            .addOperation(this.contract.call('calculate_deposit_ratio', currencyRate, collateral, debt))
            .setTimeout(210)
            .build();
        const responseValue = await this.server.simulateTransaction(tx).then(response => {
            if (this.globalParams.stellarSDK.rpc.Api.isSimulationError(response))
                throw response.error;
            if (!response.result)
                throw new Error();
            return this.globalParams.stellarSDK.xdr.ScVal.fromXDR(response.result.retval.toXDR());
        });
        return this.globalParams.stellarSDK.scValToBigInt(responseValue);
    }
    async setPriceRate(params) {
        const account = await this.server.getAccount(params.sourceAccount);
        const rate = this.globalParams.stellarSDK.nativeToScVal(params.rate, { type: 'u128' });
        const denomination = this.globalParams.stellarSDK.nativeToScVal(params.denomination, { type: 'symbol' });
        const tx = new this.globalParams.stellarSDK.TransactionBuilder(account, {
            fee: this.globalParams.defaultFee,
            networkPassphrase: this.globalParams.network,
            memo: params.memo,
        })
            .setTimeout(0)
            .addOperation(this.contract.call(FxDAOVaultsContractMethods.set_currency_rate, denomination, rate))
            .build();
        return { transactionXDR: tx.toXDR() };
    }
    async newVault(params) {
        const coreState = await this.getCoreState();
        const fee = (params.collateralAmount * coreState.fee) / 10000000n;
        const vaultCollateral = params.collateralAmount - fee;
        const prevKey = await this.findPrevVaultKey({
            account: new this.globalParams.stellarSDK.Address(params.caller),
            denomination: params.denomination,
            targetIndex: (vaultCollateral * 1000000000n) / params.initialDebt,
            vaultExists: false,
        });
        const account = await this.server.getAccount(params.caller);
        const prev_key = generateOptionalVaultKeyScVal(prevKey);
        const caller = this.globalParams.stellarSDK.nativeToScVal(account.accountId(), { type: 'address' });
        const initial_debt = this.globalParams.stellarSDK.nativeToScVal(params.initialDebt, { type: 'u128' });
        const collateral_amount = this.globalParams.stellarSDK.nativeToScVal(params.collateralAmount, {
            type: 'u128',
        });
        const denomination = this.globalParams.stellarSDK.nativeToScVal(params.denomination, { type: 'symbol' });
        const tx = new this.globalParams.stellarSDK.TransactionBuilder(account, {
            fee: this.globalParams.defaultFee,
            networkPassphrase: this.globalParams.network,
            memo: params.memo,
        })
            .setTimeout(0)
            .addOperation(this.contract.call(FxDAOVaultsContractMethods.new_vault, prev_key, caller, initial_debt, collateral_amount, denomination))
            .build();
        return { transactionXDR: tx.toXDR() };
    }
    async updateVault(params) {
        const currentVault = await this.getVault({
            denomination: params.denomination,
            user: params.caller,
        });
        const prevKey = await this.findPrevVaultKey({
            account: new this.globalParams.stellarSDK.Address(params.caller),
            denomination: currentVault.denomination,
            targetIndex: currentVault.index,
            vaultExists: true,
        });
        const vaultKey = {
            account: currentVault.account,
            denomination: currentVault.denomination,
            index: currentVault.index,
        };
        const updatedVault = {
            account: currentVault.account,
            denomination: currentVault.denomination,
            index: currentVault.index,
            next_key: currentVault.next_key,
            total_collateral: currentVault.total_collateral,
            total_debt: currentVault.total_debt,
        };
        switch (params.operationType) {
            case UpdateVaultOperationType.increase_collateral:
                updatedVault.total_collateral += params.amount;
                updatedVault.index = calculateVaultIndex({
                    debt: updatedVault.total_debt,
                    collateral: updatedVault.total_collateral,
                });
                break;
            case UpdateVaultOperationType.increase_debt:
                updatedVault.total_debt += params.amount;
                updatedVault.index = calculateVaultIndex({
                    debt: updatedVault.total_debt,
                    collateral: updatedVault.total_collateral,
                });
                break;
            case UpdateVaultOperationType.pay_debt:
                updatedVault.total_debt -= params.amount;
                updatedVault.index =
                    updatedVault.total_debt > 0n
                        ? calculateVaultIndex({
                            debt: updatedVault.total_debt,
                            collateral: updatedVault.total_collateral,
                        })
                        : 0n;
                break;
            case UpdateVaultOperationType.withdraw_collateral:
                updatedVault.total_collateral -= params.amount;
                updatedVault.index = calculateVaultIndex({
                    debt: updatedVault.total_debt,
                    collateral: updatedVault.total_collateral,
                });
                break;
            default:
                throw new Error(`Operation type "${params.operationType}" is not supported`);
        }
        let newPrevKey;
        if (updatedVault.index === 0n) {
            newPrevKey = ['None'];
        }
        else if (!!prevKey[1] &&
            prevKey[1].index < updatedVault.index &&
            !!currentVault.next_key[1] &&
            updatedVault.index < currentVault.next_key[1].index) {
            newPrevKey = prevKey;
        }
        else {
            newPrevKey = await this.findPrevVaultKey({
                account: new this.globalParams.stellarSDK.Address(params.caller),
                denomination: updatedVault.denomination,
                targetIndex: updatedVault.index,
                vaultExists: false,
            });
        }
        const prev_key = generateOptionalVaultKeyScVal(prevKey);
        const vault_key = this.globalParams.stellarSDK.xdr.ScVal.scvMap([
            new this.globalParams.stellarSDK.xdr.ScMapEntry({
                key: this.globalParams.stellarSDK.xdr.ScVal.scvSymbol('account'),
                val: this.globalParams.stellarSDK.nativeToScVal(vaultKey.account, { type: 'address' }),
            }),
            new this.globalParams.stellarSDK.xdr.ScMapEntry({
                key: this.globalParams.stellarSDK.xdr.ScVal.scvSymbol('denomination'),
                val: this.globalParams.stellarSDK.xdr.ScVal.scvSymbol(vaultKey.denomination),
            }),
            new this.globalParams.stellarSDK.xdr.ScMapEntry({
                key: this.globalParams.stellarSDK.xdr.ScVal.scvSymbol('index'),
                val: this.globalParams.stellarSDK.nativeToScVal(vaultKey.index, { type: 'u128' }),
            }),
        ]);
        const new_prev_key = generateOptionalVaultKeyScVal(newPrevKey);
        const amount = this.globalParams.stellarSDK.nativeToScVal(params.amount, { type: 'u128' });
        const account = await this.server.getAccount(params.caller);
        const tx = new this.globalParams.stellarSDK.TransactionBuilder(account, {
            fee: this.globalParams.defaultFee,
            networkPassphrase: this.globalParams.network,
            memo: params.memo,
        })
            .addOperation(this.contract.call(params.operationType, prev_key, vault_key, new_prev_key, amount))
            .setTimeout(0)
            .build();
        return { transactionXDR: tx.toXDR() };
    }
    async redeem(params) {
        const account = await this.server.getAccount(params.caller);
        const caller = this.globalParams.stellarSDK.nativeToScVal(account.accountId(), { type: 'address' });
        const denomination = this.globalParams.stellarSDK.nativeToScVal(params.denomination, { type: 'symbol' });
        const vaultsInfo = await this.getVaultsInfo({ denomination: params.denomination });
        const vaults = await this.getVaults({ total: 1, denomination: params.denomination, onlyToLiquidate: false });
        const lowestVault = vaults.pop();
        if (!lowestVault)
            throw new Error(`There are no ${params.denomination} vaults.`);
        if (params.amount > lowestVault.total_debt)
            throw new Error(`Amount is bigger thant the vault's debt`);
        if (lowestVault.total_debt !== params.amount &&
            lowestVault.total_debt - params.amount < vaultsInfo.min_debt_creation)
            throw new Error(`Vault's min deb will be under the minimum allowed`);
        const currentRate = await this.getCurrencyRate(params);
        let newPrevKey;
        if (params.amount === lowestVault.total_debt) {
            newPrevKey = ['None'];
        }
        else {
            const collateralToRedeem = (params.amount * 10000000n) / currentRate.price;
            newPrevKey = await this.findPrevVaultKey({
                account: new this.globalParams.stellarSDK.Address(params.caller),
                denomination: params.denomination,
                targetIndex: calculateVaultIndex({
                    collateral: lowestVault.total_collateral - collateralToRedeem,
                    debt: lowestVault.total_debt - params.amount,
                }),
                vaultExists: false,
            });
        }
        const tx = new this.globalParams.stellarSDK.TransactionBuilder(account, {
            fee: this.globalParams.defaultFee,
            networkPassphrase: this.globalParams.network,
            memo: params.memo,
        })
            .setTimeout(0)
            .addOperation(this.contract.call(FxDAOVaultsContractMethods.redeem, caller, denomination, generateOptionalVaultKeyScVal(newPrevKey), this.globalParams.stellarSDK.nativeToScVal(params.amount, { type: 'u128' })))
            .build();
        return { transactionXDR: tx.toXDR() };
    }
    async liquidate(params) {
        const account = await this.server.getAccount(params.caller);
        const liquidator = this.globalParams.stellarSDK.nativeToScVal(account.accountId(), { type: 'address' });
        const denomination = this.globalParams.stellarSDK.nativeToScVal(params.denomination, { type: 'symbol' });
        const total_vaults_to_liquidate = this.globalParams.stellarSDK.nativeToScVal(params.totalVaults, {
            type: 'u32',
        });
        const tx = new this.globalParams.stellarSDK.TransactionBuilder(account, {
            fee: this.globalParams.defaultFee,
            networkPassphrase: this.globalParams.network,
            memo: params.memo,
        })
            .setTimeout(0)
            .addOperation(this.contract.call(FxDAOVaultsContractMethods.liquidate, liquidator, denomination, total_vaults_to_liquidate))
            .build();
        return { transactionXDR: tx.toXDR() };
    }
    // --- Pure View functions
    async getCoreState() {
        const tx = new this.globalParams.stellarSDK.TransactionBuilder(new this.globalParams.stellarSDK.Account(this.globalParams.simulationAccount, '0'), {
            fee: this.globalParams.defaultFee,
            networkPassphrase: this.globalParams.network,
        })
            .addOperation(this.contract.call(FxDAOVaultsContractMethods.get_core_state))
            .setTimeout(0)
            .build();
        const simulated = await this.server.simulateTransaction(tx);
        if (this.globalParams.stellarSDK.rpc.Api.isSimulationError(simulated))
            throw parseError(ParseErrorType.vault, simulated);
        if (!simulated.result)
            throw new Error('No core state value was returned.');
        const xdrVal = simulated.result.retval.toXDR('base64');
        const scVal = this.globalParams.stellarSDK.xdr.ScVal.fromXDR(xdrVal, 'base64');
        return this.globalParams.stellarSDK.scValToNative(scVal);
    }
    async getCurrencyRate(params) {
        const coreState = await this.getCoreState();
        const oracle = new Contract(coreState.oracle);
        const tx = new this.globalParams.stellarSDK.TransactionBuilder(new this.globalParams.stellarSDK.Account(this.globalParams.simulationAccount, '0'), { fee: this.globalParams.defaultFee, networkPassphrase: this.globalParams.network })
            .addOperation(oracle.call('lastprice', new this.globalParams.stellarSDK.Address(this.globalParams.contractId).toScVal(), this.globalParams.stellarSDK.xdr.ScVal.scvVec([
            this.globalParams.stellarSDK.nativeToScVal('Other', { type: 'symbol' }),
            this.globalParams.stellarSDK.nativeToScVal(params.denomination, { type: 'symbol' }),
        ])))
            .setTimeout(0)
            .build();
        const simulated = await this.server.simulateTransaction(tx);
        if (this.globalParams.stellarSDK.rpc.Api.isSimulationError(simulated))
            throw parseError(ParseErrorType.vault, simulated);
        if (!simulated.result)
            throw new Error('No core state value was returned.');
        const xdrVal = simulated.result.retval.toXDR('base64');
        const scVal = this.globalParams.stellarSDK.xdr.ScVal.fromXDR(xdrVal, 'base64');
        return this.globalParams.stellarSDK.scValToNative(scVal);
    }
    async getVaultsInfo(params) {
        const denomination = this.globalParams.stellarSDK.nativeToScVal(params.denomination, { type: 'symbol' });
        const tx = new this.globalParams.stellarSDK.TransactionBuilder(new this.globalParams.stellarSDK.Account(this.globalParams.simulationAccount, '0'), {
            fee: this.globalParams.defaultFee,
            networkPassphrase: this.globalParams.network,
        })
            .addOperation(this.contract.call(FxDAOVaultsContractMethods.get_vaults_info, denomination))
            .setTimeout(0)
            .build();
        const simulated = await this.server.simulateTransaction(tx);
        if (this.globalParams.stellarSDK.rpc.Api.isSimulationError(simulated))
            throw parseError(ParseErrorType.vault, simulated);
        if (!simulated.result)
            throw new Error('');
        const xdrVal = simulated.result.retval.toXDR('base64');
        const scVal = this.globalParams.stellarSDK.xdr.ScVal.fromXDR(xdrVal, 'base64');
        return this.globalParams.stellarSDK.scValToNative(scVal);
    }
    async findPrevVaultKey(params) {
        let prevKeyValue = ['None'];
        if (params.vaultExists) {
            let found = false;
            while (!found) {
                const vaults = await this.getVaults({
                    onlyToLiquidate: false,
                    denomination: params.denomination,
                    prevKey: prevKeyValue,
                    total: 15,
                });
                if (vaults.length === 0) {
                    found = true;
                    break;
                }
                for (const vault of vaults) {
                    if (vault.account === params.account.toString()) {
                        found = true;
                        break;
                    }
                    prevKeyValue = [
                        'Some',
                        {
                            index: vault.index,
                            denomination: vault.denomination,
                            account: vault.account,
                        },
                    ];
                    if (vault.next_key[0] === 'None' || vault.next_key[1].account === params.account.toString()) {
                        found = true;
                        break;
                    }
                }
            }
        }
        else {
            const vaultsInfo = await this.getVaultsInfo({ denomination: params.denomination });
            /**
             * There are four cases when using the lowest key:
             * - If the lowest key is "None" it means there is no Vault created
             * - If the index of the lowest key is higher than the index we are looking for it means this new vault will be the new lowest key
             * - If the lowest key is owned by the account and it has the same index, we return none since this account if going to still be the lowest key
             */
            if (vaultsInfo.lowest_key[0] === 'None' || vaultsInfo.lowest_key[1].index > params.targetIndex) {
                return ['None'];
            }
            const lowestVault = await this.getVault({
                user: vaultsInfo.lowest_key[1].account,
                denomination: params.denomination,
            });
            if (vaultsInfo.lowest_key[1].index === params.targetIndex &&
                (lowestVault.next_key[0] === 'None' || lowestVault.next_key[1]?.index > params.targetIndex)) {
                return ['None'];
            }
            /**
             * If lowest key has an existing "next_key" value, we check these cases:
             * - if the next key is "None", we return the current lowest as the prevKey
             * - If the next keu index is higher than the target we also return the lowest key
             */
            if (lowestVault.next_key[0] === 'None' || lowestVault.next_key[1].index >= params.targetIndex) {
                return vaultsInfo.lowest_key;
            }
            prevKeyValue = vaultsInfo.lowest_key;
            let found = false;
            while (!found) {
                const vaults = await this.getVaults({
                    onlyToLiquidate: false,
                    denomination: params.denomination,
                    prevKey: prevKeyValue,
                    total: 15,
                });
                if (vaults.length === 0) {
                    found = true;
                    break;
                }
                for (const vault of vaults) {
                    // This shouldn't happen but just in case
                    if (prevKeyValue[0] === 'Some' && prevKeyValue[1].account === vault.account) {
                        continue;
                    }
                    // If the vault is the same as ours, we ignore it because it can't be a prev vault
                    if (vault.account.toString() === params.account.toString()) {
                        continue;
                    }
                    prevKeyValue = [
                        'Some',
                        {
                            account: vault.account,
                            denomination: vault.denomination,
                            index: vault.index,
                        },
                    ];
                    if (vault.next_key[0] === 'None' || vault.next_key[1].index >= params.targetIndex) {
                        found = true;
                        break;
                    }
                }
                // If the number of vaults we got is lower than those we requested is because there are no more options there.
                if (vaults.length < 15) {
                    found = true;
                }
            }
        }
        return prevKeyValue;
    }
    async getVault(params) {
        const user = this.globalParams.stellarSDK.nativeToScVal(params.user, { type: 'address' });
        const denomination = this.globalParams.stellarSDK.nativeToScVal(params.denomination, { type: 'symbol' });
        const tx = new this.globalParams.stellarSDK.TransactionBuilder(new this.globalParams.stellarSDK.Account(this.globalParams.simulationAccount, '0'), {
            fee: this.globalParams.defaultFee,
            networkPassphrase: this.globalParams.network,
        })
            .addOperation(this.contract.call(FxDAOVaultsContractMethods.get_vault, user, denomination))
            .setTimeout(0)
            .build();
        const simulated = await this.server.simulateTransaction(tx);
        if (this.globalParams.stellarSDK.rpc.Api.isSimulationError(simulated))
            throw parseError(ParseErrorType.vault, simulated);
        if (!simulated.result)
            throw new Error('');
        const xdrVal = simulated.result.retval.toXDR('base64');
        const scVal = this.globalParams.stellarSDK.xdr.ScVal.fromXDR(xdrVal, 'base64');
        return this.globalParams.stellarSDK.scValToNative(scVal);
    }
    async getVaults(params) {
        const prev_key = generateOptionalVaultKeyScVal(params.prevKey || ['None']);
        const denomination = this.globalParams.stellarSDK.nativeToScVal(params.denomination, { type: 'symbol' });
        const total = this.globalParams.stellarSDK.nativeToScVal(params.total, { type: 'u32' });
        const only_to_liquidate = this.globalParams.stellarSDK.nativeToScVal(params.onlyToLiquidate, {
            type: 'bool',
        });
        const account = new this.globalParams.stellarSDK.Account(this.globalParams.simulationAccount, '0');
        const tx = new this.globalParams.stellarSDK.TransactionBuilder(account, {
            fee: this.globalParams.defaultFee,
            networkPassphrase: this.globalParams.network,
            memo: params.memo,
        })
            .setTimeout(0)
            .addOperation(this.contract.call(FxDAOVaultsContractMethods.get_vaults, prev_key, denomination, total, only_to_liquidate))
            .build();
        const simulated = await this.server.simulateTransaction(tx);
        if (this.globalParams.stellarSDK.rpc.Api.isSimulationError(simulated))
            throw parseError(ParseErrorType.vault, simulated);
        if (!simulated.result)
            throw new Error('');
        // We do this in order to avoid wierd errors with libraries sharing the Stellar SDK
        const xdrVal = simulated.result.retval.toXDR('base64');
        const scVal = this.globalParams.stellarSDK.xdr.ScVal.fromXDR(xdrVal, 'base64');
        return this.globalParams.stellarSDK.scValToNative(scVal);
    }
}
export var FindPrevVaultKeyType;
(function (FindPrevVaultKeyType) {
    FindPrevVaultKeyType[FindPrevVaultKeyType["new_vault"] = 0] = "new_vault";
    FindPrevVaultKeyType[FindPrevVaultKeyType["update_vault"] = 1] = "update_vault";
    FindPrevVaultKeyType[FindPrevVaultKeyType["remove_vault"] = 2] = "remove_vault";
})(FindPrevVaultKeyType || (FindPrevVaultKeyType = {}));
