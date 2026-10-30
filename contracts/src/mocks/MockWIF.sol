// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @notice Testnet-only stand-in for $WIF. Same burn interface as the real token; anyone can mint.
contract MockWIF is ERC20, ERC20Burnable {
    constructor() ERC20("Mock World is Flat", "mWIF") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
