// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice $WIF exposes OpenZeppelin ERC20Burnable's burn (verified onchain, see docs/DEPLOYMENTS.md).
interface IWIF is IERC20 {
    function burn(uint256 amount) external;
}
