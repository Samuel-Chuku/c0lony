// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ColonyGame} from "../src/ColonyGame.sol";
import {SeasonPot} from "../src/SeasonPot.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockWIF} from "../src/mocks/MockWIF.sol";
import {IWIF} from "../src/interfaces/IWIF.sol";
import {ISeasonPot} from "../src/interfaces/ISeasonPot.sol";
import {ITreasury} from "../src/interfaces/ITreasury.sol";
import {IColonyGameView} from "../src/interfaces/IColonyGameView.sol";

/// @notice Deploys and wires Treasury, SeasonPot and ColonyGame (DrandVerifier is deployed as a linked
///         library automatically). On testnet (46630) it also deploys MockWIF. Refuses to run on mainnet
///         (4663) unless ALLOW_MAINNET=true.
///
/// Testnet:  forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast --disable-code-size-limit
/// (Robinhood Chain accepts contracts above 24 KB; ColonyGame is ~26 KB. See docs/DEPLOYMENTS.md.)
contract Deploy is Script {
    uint256 internal constant TESTNET = 46630;
    uint256 internal constant MAINNET = 4663;
    address internal constant MAINNET_WIF = 0x5173b8eA6923c2d40267890D45C46a3480954773;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        uint256 reserve = vm.envOr("TREASURY_WIF_RESERVE", uint256(0));
        uint256 treasuryEth = vm.envOr("TREASURY_ETH_WEI", uint256(0));

        if (block.chainid == MAINNET) {
            require(vm.envOr("ALLOW_MAINNET", false), "mainnet deploy needs ALLOW_MAINNET=true");
        } else {
            require(block.chainid == TESTNET || block.chainid == 31337, "unknown chain");
        }

        vm.startBroadcast(pk);

        address wif;
        if (block.chainid == MAINNET) {
            wif = MAINNET_WIF;
        } else {
            wif = vm.envOr("WIF_ADDRESS_TESTNET", address(0));
            if (wif == address(0)) wif = address(new MockWIF());
        }

        Treasury treasury = new Treasury(IERC20(wif), deployer, reserve);
        SeasonPot pot = new SeasonPot(IERC20(wif));
        ColonyGame game = new ColonyGame(IWIF(wif), ISeasonPot(address(pot)), ITreasury(address(treasury)), deployer);
        pot.setGame(IColonyGameView(address(game)));
        treasury.wire(address(game), address(pot));
        if (treasuryEth > 0) {
            (bool ok,) = address(treasury).call{value: treasuryEth}("");
            require(ok, "treasury funding failed");
        }

        vm.stopBroadcast();

        console.log("chain id      ", block.chainid);
        console.log("deployer/owner", deployer);
        console.log("WIF           ", wif);
        console.log("Treasury      ", address(treasury));
        console.log("SeasonPot     ", address(pot));
        console.log("ColonyGame    ", address(game));
        console.log("Season 1 ends ", game.seasonEnd(1));
    }
}
