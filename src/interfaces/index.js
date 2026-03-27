export var Denomination;
(function (Denomination) {
    Denomination["USD"] = "USD";
    Denomination["EUR"] = "EUR";
    Denomination["GBP"] = "GBP";
})(Denomination || (Denomination = {}));
export var UpdateVaultOperationType;
(function (UpdateVaultOperationType) {
    UpdateVaultOperationType["increase_collateral"] = "increase_collateral";
    UpdateVaultOperationType["increase_debt"] = "increase_debt";
    UpdateVaultOperationType["pay_debt"] = "pay_debt";
    UpdateVaultOperationType["withdraw_collateral"] = "withdraw_collateral";
})(UpdateVaultOperationType || (UpdateVaultOperationType = {}));
export var FxDAOContracts;
(function (FxDAOContracts) {
    FxDAOContracts["VAULTS"] = "VAULTS";
    FxDAOContracts["SAFETY_POOL_USD"] = "SAFETY_POOL_USD";
    FxDAOContracts["SAFETY_POOL_EUR"] = "SAFETY_POOL_EUR";
    FxDAOContracts["STABLE_POOL_USD"] = "STABLE_POOL_USD";
})(FxDAOContracts || (FxDAOContracts = {}));
export var FxDAOVaultsContractMethods;
(function (FxDAOVaultsContractMethods) {
    FxDAOVaultsContractMethods["get_core_state"] = "get_core_state";
    FxDAOVaultsContractMethods["set_currency_rate"] = "set_currency_rate";
    FxDAOVaultsContractMethods["get_vault"] = "get_vault";
    FxDAOVaultsContractMethods["get_vaults"] = "get_vaults";
    FxDAOVaultsContractMethods["new_vault"] = "new_vault";
    FxDAOVaultsContractMethods["get_vaults_info"] = "get_vaults_info";
    FxDAOVaultsContractMethods["redeem"] = "redeem";
    FxDAOVaultsContractMethods["liquidate"] = "liquidate";
})(FxDAOVaultsContractMethods || (FxDAOVaultsContractMethods = {}));
export var FxDAOSafetyPoolContractMethods;
(function (FxDAOSafetyPoolContractMethods) {
    FxDAOSafetyPoolContractMethods["get_core_state"] = "get_core_state";
    FxDAOSafetyPoolContractMethods["get_core_stats"] = "get_core_stats";
    FxDAOSafetyPoolContractMethods["deposit"] = "deposit";
    FxDAOSafetyPoolContractMethods["get_deposit"] = "get_deposit";
    FxDAOSafetyPoolContractMethods["withdraw"] = "withdraw";
    FxDAOSafetyPoolContractMethods["withdraw_col"] = "withdraw_col";
    FxDAOSafetyPoolContractMethods["liquidate"] = "liquidate";
})(FxDAOSafetyPoolContractMethods || (FxDAOSafetyPoolContractMethods = {}));
