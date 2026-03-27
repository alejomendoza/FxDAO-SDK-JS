import { nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { VaultsErrors } from './errors/vaults';
export function calculateVaultIndex(params) {
    return (params.collateral * 1000000000n) / params.debt;
}
export function generateOptionalVaultKeyScVal(vaultKey) {
    const struct = [];
    struct.push(xdr.ScVal.scvSymbol(vaultKey[0]));
    if (vaultKey[0] === 'Some') {
        struct.push(xdr.ScVal.scvMap([
            new xdr.ScMapEntry({
                key: xdr.ScVal.scvSymbol('account'),
                val: nativeToScVal(vaultKey[1].account, { type: 'address' }),
            }),
            new xdr.ScMapEntry({
                key: xdr.ScVal.scvSymbol('denomination'),
                val: nativeToScVal(vaultKey[1].denomination, { type: 'symbol' }),
            }),
            new xdr.ScMapEntry({
                key: xdr.ScVal.scvSymbol('index'),
                val: nativeToScVal(vaultKey[1].index, { type: 'u128' }),
            }),
        ]));
    }
    return xdr.ScVal.scvVec(struct);
}
export var ParseErrorType;
(function (ParseErrorType) {
    ParseErrorType[ParseErrorType["vault"] = 0] = "vault";
    ParseErrorType[ParseErrorType["safety_pool"] = 1] = "safety_pool";
    ParseErrorType[ParseErrorType["stable_pool"] = 2] = "stable_pool";
    ParseErrorType[ParseErrorType["governance"] = 3] = "governance";
})(ParseErrorType || (ParseErrorType = {}));
export function parseError(type, response) {
    console.error(response.error);
    const error = errorCodeFromSimulated(response);
    let message;
    if (error === 10) {
        message = 'Not enough funds, make sure you have enough funds to complete the process';
    }
    else {
        switch (type) {
            case ParseErrorType.vault:
                message = VaultsErrors[error] || 'Unhandled error, please contact support (Code: Vault-00)';
                break;
            default:
                message = 'Unhandled error';
                break;
        }
    }
    return {
        error,
        message,
        diagnostic: response.error,
    };
}
export function errorCodeFromSimulated(response) {
    let errorCode;
    try {
        const errorCodeVal = response.events
            .slice(-1)[0]
            .event()
            .body()
            .value()
            .data()
            .value()
            .slice(-1)[0]
            .value();
        errorCode = scValToNative(errorCodeVal);
    }
    catch (e) {
        errorCode = -1;
    }
    return errorCode;
}
