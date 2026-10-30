// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISeasonPot} from "./interfaces/ISeasonPot.sol";
import {IColonyGameView} from "./interfaces/IColonyGameView.sol";

/// @title Treasury
/// @notice Holds the 10% WIF cut and the ETH gas pool. ColonyGame can make it pay exactly two things:
///         a one-time founder gas drip and a capped refund of settlement gas. Both pause below a floor.
///         WIF above the owner-set reserve can be swept into next season's pot by anyone. The owner can
///         withdraw treasury ETH and WIF (every withdrawal emits an event), but has no access to the pot.
contract Treasury is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant DRIP_AMOUNT = 0.00005 ether;
    uint256 public constant MAX_DRIPS_PER_DAY = 25;
    uint256 public constant MAX_SETTLE_REFUND = 0.00005 ether;
    /// @notice Sponsorships pause when paying would leave less ETH than this.
    uint256 public constant ETH_FLOOR = 0.0003 ether;

    /// @dev Arbitrum ArbGasInfo precompile; getCurrentTxL1GasFees() is the current tx's L1 data fee in wei.
    address internal constant ARB_GAS_INFO = 0x000000000000000000000000000000000000006C;

    IERC20 public immutable wif;
    address public game;
    address public pot;
    /// @notice WIF kept back from sweeps.
    uint256 public wifReserve;

    mapping(address => bool) public dripped;
    mapping(uint256 => uint256) public dripsOnDay;

    event Wired(address game, address pot);
    event Dripped(address indexed player, uint256 amount);
    event DripSkipped(address indexed player, uint8 reason); // 1 already, 2 daily cap, 3 floor, 4 send failed
    event SettleRefunded(address indexed caller, uint256 amount, uint256 gasUsed, uint256 l1Fee);
    event SettleRefundSkipped(address indexed caller, uint256 amount);
    event ReserveSet(uint256 oldReserve, uint256 newReserve);
    event Swept(uint32 indexed season, uint256 amount);
    event EthWithdrawn(address indexed to, uint256 amount);
    event WifWithdrawn(address indexed to, uint256 amount);
    event EthReceived(address indexed from, uint256 amount);

    error NotGame();
    error AlreadyWired();
    error NothingToSweep();
    error SendFailed();
    error ZeroAddress();

    constructor(IERC20 wif_, address owner_, uint256 wifReserve_) Ownable(owner_) {
        wif = wif_;
        wifReserve = wifReserve_;
        emit ReserveSet(0, wifReserve_);
    }

    receive() external payable {
        emit EthReceived(msg.sender, msg.value);
    }

    /// @notice One-time wiring, done by the owner right after deployment.
    function wire(address game_, address pot_) external onlyOwner {
        if (game != address(0)) revert AlreadyWired();
        if (game_ == address(0) || pot_ == address(0)) revert ZeroAddress();
        game = game_;
        pot = pot_;
        emit Wired(game_, pot_);
    }

    modifier onlyGame() {
        if (msg.sender != game) revert NotGame();
        _;
    }

    // ------------------------------------------------------------------ sponsorships (ColonyGame only)

    /// @notice One-time ETH drip to a wallet founding its first colony. Never reverts; skips instead.
    function drip(address player) external onlyGame nonReentrant returns (bool sent) {
        uint256 day = block.timestamp / 1 days;
        if (dripped[player]) {
            emit DripSkipped(player, 1);
            return false;
        }
        if (dripsOnDay[day] >= MAX_DRIPS_PER_DAY) {
            emit DripSkipped(player, 2);
            return false;
        }
        if (address(this).balance < ETH_FLOOR + DRIP_AMOUNT) {
            emit DripSkipped(player, 3);
            return false;
        }
        dripped[player] = true;
        dripsOnDay[day] += 1;
        (sent,) = player.call{value: DRIP_AMOUNT, gas: 30_000}("");
        if (sent) {
            emit Dripped(player, DRIP_AMOUNT);
        } else {
            dripped[player] = false;
            dripsOnDay[day] -= 1;
            emit DripSkipped(player, 4);
        }
    }

    /// @notice Refunds the gas a settler spent: measured execution gas at the tx gas price, plus the
    ///         L1 data fee reported by ArbGasInfo, capped at MAX_SETTLE_REFUND. Never reverts; skips instead.
    function refundSettle(address caller, uint256 gasUsed) external onlyGame nonReentrant returns (uint256 refunded) {
        uint256 l1Fee = _l1Fee();
        uint256 amount = gasUsed * tx.gasprice + l1Fee;
        if (amount > MAX_SETTLE_REFUND) amount = MAX_SETTLE_REFUND;
        if (amount == 0) return 0;
        if (address(this).balance < ETH_FLOOR + amount) {
            emit SettleRefundSkipped(caller, amount);
            return 0;
        }
        (bool ok,) = caller.call{value: amount, gas: 30_000}("");
        if (!ok) {
            emit SettleRefundSkipped(caller, amount);
            return 0;
        }
        emit SettleRefunded(caller, amount, gasUsed, l1Fee);
        return amount;
    }

    /// @dev Low-level call so a missing precompile (local tests, other chains) yields 0 instead of reverting.
    function _l1Fee() internal view returns (uint256 fee) {
        (bool ok, bytes memory data) = ARB_GAS_INFO.staticcall(abi.encodeWithSignature("getCurrentTxL1GasFees()"));
        if (ok && data.length == 32) fee = abi.decode(data, (uint256));
    }

    // ------------------------------------------------------------------ sweep (anyone)

    /// @notice Moves WIF above the reserve into next season's pot.
    function sweepToPot() external nonReentrant returns (uint256 amount) {
        uint256 bal = wif.balanceOf(address(this));
        if (bal <= wifReserve) revert NothingToSweep();
        amount = bal - wifReserve;
        uint32 next = IColonyGameView(game).currentSeason() + 1;
        wif.forceApprove(pot, amount);
        ISeasonPot(pot).sponsor(next, amount, "Treasury surplus");
        emit Swept(next, amount);
    }

    // ------------------------------------------------------------------ owner

    function setWifReserve(uint256 newReserve) external onlyOwner {
        emit ReserveSet(wifReserve, newReserve);
        wifReserve = newReserve;
    }

    function withdrawEth(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert SendFailed();
        emit EthWithdrawn(to, amount);
    }

    function withdrawWif(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        wif.safeTransfer(to, amount);
        emit WifWithdrawn(to, amount);
    }
}
