// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Courier} from "../src/Courier.sol";

/// @notice Deploys the Courier (WIF sends with gas paid in WIF). It has no owner and nothing to wire.
///         Refuses to run on mainnet (4663) unless ALLOW_MAINNET=true.
///
/// Testnet: forge script script/DeployCourier.s.sol --rpc-url robinhood_testnet --broadcast
contract DeployCourier is Script {
    uint256 internal constant TESTNET = 46630;
    uint256 internal constant MAINNET = 4663;
    address internal constant MAINNET_WIF = 0x5173b8eA6923c2d40267890D45C46a3480954773;
    address internal constant TESTNET_WIF = 0xC7524F3D78E5f6150aff0Eac811e9Bd0D0Fd9B68; // MockWIF

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address wif;
        if (block.chainid == MAINNET) {
            require(vm.envOr("ALLOW_MAINNET", false), "mainnet deploy needs ALLOW_MAINNET=true");
            wif = MAINNET_WIF;
        } else {
            require(block.chainid == TESTNET || block.chainid == 31337, "unknown chain");
            wif = vm.envOr("WIF_ADDRESS_TESTNET", TESTNET_WIF);
        }
        vm.startBroadcast(pk);
        Courier courier = new Courier(IERC20(wif));
        vm.stopBroadcast();
        console.log("chain id", block.chainid);
        console.log("WIF     ", wif);
        console.log("Courier ", address(courier));
    }
}
