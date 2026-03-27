import { Denomination, UpdateVaultOperationType, VaultsContract, } from '../index';
import * as stellarSDK from '@stellar/stellar-sdk';
function readRequiredEnv(name) {
    const value = process.env[name];
    if (!value || value.trim() === '') {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value.trim();
}
function parseDenomination(value) {
    const upper = value.toUpperCase();
    if (!(upper in Denomination)) {
        throw new Error(`Invalid DENOMINATION "${value}". Use one of: ${Object.keys(Denomination).join(', ')}`);
    }
    return Denomination[upper];
}
function parseNetwork(value) {
    const upper = value.toUpperCase();
    if (upper === 'PUBLIC')
        return { networkName: upper, passphrase: stellarSDK.Networks.PUBLIC };
    if (upper === 'TESTNET')
        return { networkName: upper, passphrase: stellarSDK.Networks.TESTNET };
    throw new Error(`Invalid NETWORK "${value}". Use "PUBLIC" or "TESTNET".`);
}
async function waitForResult(server, hash) {
    for (let i = 0; i < 30; i += 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const txResult = await server.getTransaction(hash);
        if (txResult.status === stellarSDK.rpc.Api.GetTransactionStatus.SUCCESS)
            return;
        if (txResult.status === stellarSDK.rpc.Api.GetTransactionStatus.FAILED) {
            throw new Error(`Transaction failed: ${JSON.stringify(txResult)}`);
        }
        if (txResult.status === stellarSDK.rpc.Api.GetTransactionStatus.NOT_FOUND)
            continue;
    }
    throw new Error(`Timed out waiting for transaction result: ${hash}`);
}
async function main() {
    const rpcUrl = readRequiredEnv('RPC_URL');
    const network = parseNetwork(readRequiredEnv('NETWORK'));
    const contractId = readRequiredEnv('CONTRACT_ID');
    const secret = readRequiredEnv('SECRET');
    const simulationAccount = readRequiredEnv('SIMULATION_ACCOUNT');
    const denomination = parseDenomination(readRequiredEnv('DENOMINATION'));
    // XLM has 7 decimals (stroops). Default test amount is 100 XLM.
    const withdrawXlm = BigInt(process.env.WITHDRAW_XLM ?? '100');
    const amount = withdrawXlm * 10000000n;
    const server = new stellarSDK.rpc.Server(rpcUrl);
    const keypair = stellarSDK.Keypair.fromSecret(secret);
    const source = keypair.publicKey();
    const globalParams = {
        stellarSDK: {
            Account: stellarSDK.Account,
            Address: stellarSDK.Address,
            Contract: stellarSDK.Contract,
            xdr: stellarSDK.xdr,
            TransactionBuilder: stellarSDK.TransactionBuilder,
            rpc: stellarSDK.rpc,
            nativeToScVal: stellarSDK.nativeToScVal,
            scValToNative: stellarSDK.scValToNative,
            scValToBigInt: stellarSDK.scValToBigInt,
        },
        simulationAccount,
        contractId,
        defaultFee: process.env.DEFAULT_FEE ?? '100000',
        rpc: rpcUrl,
        allowHttp: rpcUrl.startsWith('http://'),
        network: network.passphrase,
    };
    const vaults = new VaultsContract(globalParams);
    const before = await vaults.getVault({ user: source, denomination });
    console.log(`Vault before -> collateral: ${before.total_collateral.toString()}, debt: ${before.total_debt.toString()}`);
    const { transactionXDR } = await vaults.updateVault({
        operationType: UpdateVaultOperationType.withdraw_collateral,
        caller: source,
        amount,
        denomination,
    });
    let tx = stellarSDK.TransactionBuilder.fromXDR(transactionXDR, network.passphrase);
    tx = await server.prepareTransaction(tx);
    tx.sign(keypair);
    const sendResponse = await server.sendTransaction(tx);
    if (sendResponse.status === 'ERROR') {
        throw new Error(`sendTransaction error: ${JSON.stringify(sendResponse)}`);
    }
    if (!sendResponse.hash) {
        throw new Error(`No transaction hash returned: ${JSON.stringify(sendResponse)}`);
    }
    await waitForResult(server, sendResponse.hash);
    const after = await vaults.getVault({ user: source, denomination });
    console.log(`Vault after  -> collateral: ${after.total_collateral.toString()}, debt: ${after.total_debt.toString()}`);
    console.log(`Success. Withdrawn ${withdrawXlm.toString()} XLM from vault (${denomination}).`);
}
main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
