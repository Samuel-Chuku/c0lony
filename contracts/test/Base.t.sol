// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ColonyGame} from "../src/ColonyGame.sol";
import {SeasonPot} from "../src/SeasonPot.sol";
import {Treasury} from "../src/Treasury.sol";
import {DrandVerifier} from "../src/DrandVerifier.sol";
import {MockWIF} from "../src/mocks/MockWIF.sol";
import {IWIF} from "../src/interfaces/IWIF.sol";
import {ISeasonPot} from "../src/interfaces/ISeasonPot.sol";
import {ITreasury} from "../src/interfaces/ITreasury.sol";
import {IColonyGameView} from "../src/interfaces/IColonyGameView.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Stand-in for Arbitrum's ArbGasInfo precompile at 0x6c (Robinhood Chain has the real one).
contract MockArbGasInfo {
    uint256 public fee;

    function setFee(uint256 f) external {
        fee = f;
    }

    function getCurrentTxL1GasFees() external view returns (uint256) {
        return fee;
    }
}

/// @dev Exposes internal raid maths so it can be fuzzed with arbitrary random numbers.
contract ColonyGameHarness is ColonyGame {
    constructor(IWIF w, ISeasonPot p, ITreasury t, address o) ColonyGame(w, p, t, o) {}

    function resolveWith(uint256 raidId, uint256 rand) external returns (Result memory) {
        Raid storage r = raids[raidId];
        r.status = RaidStatus.Settled;
        Result memory res = _resolve(r, rand);
        _removeActive(r.raider, raidId);
        _removeActive(r.defender, raidId);
        return res;
    }

    function setStock(uint64 id, uint128 leaves, uint128 sugar) external {
        colonies[id].leaves = leaves;
        colonies[id].sugar = sugar;
    }

    function setWorkers(uint64 id, uint32 workers, uint32 chambers) external {
        colonies[id].workers = workers;
        colonies[id].chambers = chambers;
    }
}

abstract contract Base is Test {
    using stdJson for string;

    uint256 internal constant RES = 1e9;
    address internal constant ARB_GAS_INFO = 0x000000000000000000000000000000000000006C;

    MockWIF internal wif;
    Treasury internal treasury;
    SeasonPot internal pot;
    ColonyGameHarness internal game;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal keeper = makeAddr("keeper");

    // First fixture round; the game is deployed 6 hours before it is published.
    uint64 internal constant ROUND_DAY0 = 21737304;
    uint256 internal T0;

    mapping(uint64 => bytes) internal sigOf;
    bytes32[] internal NO_PROOF;

    function setUp() public virtual {
        _loadRounds();
        T0 = DrandVerifier.roundTime(ROUND_DAY0) - 6 hours;
        vm.warp(T0);

        wif = new MockWIF();
        treasury = new Treasury(IERC20(address(wif)), owner, 0);
        pot = new SeasonPot(IERC20(address(wif)));
        game = new ColonyGameHarness(IWIF(address(wif)), ISeasonPot(address(pot)), ITreasury(address(treasury)), owner);
        pot.setGame(IColonyGameView(address(game)));
        vm.prank(owner);
        treasury.wire(address(game), address(pot));
        vm.deal(address(treasury), 0.002 ether);

        MockArbGasInfo m = new MockArbGasInfo();
        vm.etch(ARB_GAS_INFO, address(m).code);

        address[4] memory players = [alice, bob, carol, keeper];
        for (uint256 i; i < players.length; ++i) {
            wif.mint(players[i], 1_000_000 ether);
            vm.prank(players[i]);
            wif.approve(address(game), type(uint256).max);
            vm.prank(players[i]);
            wif.approve(address(pot), type(uint256).max);
        }
    }

    function _loadRounds() internal {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/drand_evmnet_rounds.json"));
        uint256[] memory rounds = json.readUintArray(".roundNumbers");
        bytes[] memory sigs = json.readBytesArray(".signatures");
        for (uint256 i; i < rounds.length; ++i) {
            sigOf[uint64(rounds[i])] = sigs[i];
        }
    }

    function _setL1Fee(uint256 fee) internal {
        MockArbGasInfo(ARB_GAS_INFO).setFee(fee);
    }

    // ------------------------------------------------------------------ helpers

    function _found(address who) internal returns (uint64 id) {
        vm.prank(who);
        id = game.foundColony(NO_PROOF);
    }

    function _feed(address who) internal {
        vm.prank(who);
        game.feedQueen(NO_PROOF);
    }

    function _salt(address who, uint256 raidId) internal pure returns (bytes32) {
        return keccak256(abi.encode("salt", who, raidId));
    }

    function _launch(address raider, uint64 raiderId, uint64 defenderId, uint32 soldiers, ColonyGame.Resource target)
        internal
        returns (uint256 raidId)
    {
        raidId = game.nextRaidId(raiderId);
        bytes32 commitment = game.commitmentFor(target, _salt(raider, raidId), raidId);
        vm.prank(raider);
        game.launchRaid(defenderId, soldiers, commitment);
    }

    /// @dev Warps so that reveal is assigned exactly `round`, then reveals.
    function _revealAtRound(address raider, uint256 raidId, ColonyGame.Resource target, uint64 round) internal {
        vm.warp(DrandVerifier.roundTime(round) - game.ROUND_DELAY());
        vm.prank(raider);
        game.reveal(raidId, target, _salt(raider, raidId));
    }

    function _settle(address who, uint256 raidId, uint64 round) internal {
        vm.warp(DrandVerifier.roundTime(round) + 60);
        vm.prank(who);
        game.settle(raidId, sigOf[round]);
    }

    function _colony(uint64 id) internal view returns (ColonyGame.ColonyView memory) {
        return game.getColony(id);
    }

    function _workers(uint64 id) internal view returns (uint32) {
        return game.getColony(id).data.workers;
    }

    function _leaves(uint64 id) internal view returns (uint256) {
        return game.getColony(id).data.leaves;
    }

    function _sugar(uint64 id) internal view returns (uint256) {
        return game.getColony(id).data.sugar;
    }
}
