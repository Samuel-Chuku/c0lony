# Testnet play-throughs (Robinhood Chain testnet, 46630)

## Run 1 (retired contracts)

A full season played on 2026-10-30 against the testnet contracts in [DEPLOYMENTS.md](DEPLOYMENTS.md), with two throwaway player wallets, MockWIF and a real drand evmnet round. Testnet-only settings: a 1 h guard window and a 6 h feed interval, so both colonies could be fed twice in one day. Script: `keeper/scripts/testnet-loop.ts`.

| Time (UTC) | Step | Transaction |
| --- | --- | --- |
| 09:40 | owner set testnet config: guard window 1 h, feed interval 6 h | [`0x34129ea1…`](https://explorer.testnet.chain.robinhood.com/tx/0x34129ea1582bf827f2be15a90fdec56866c2e368ca679c5511c569c8d8649dfa) |
| 09:40 | player1 funded with 0.002 ETH, minted 100,000 mWIF, approved game | [`0xe14fb241…`](https://explorer.testnet.chain.robinhood.com/tx/0xe14fb2411dcff4328d20c84ec38bfcc55bd6fbcfae62bd9faf023f4c37a5f0b0) |
| 09:40 | player2 funded with 0.002 ETH, minted 100,000 mWIF, approved game | [`0x7cb784ab…`](https://explorer.testnet.chain.robinhood.com/tx/0x7cb784ab4edc16c39377fe446dad6f05a8168dcf52b3db348f1600749a49c7e2) |
| 09:40 | owner sponsored 8,600 mWIF into Season 1 | [`0xdb708aef…`](https://explorer.testnet.chain.robinhood.com/tx/0xdb708aef1bce46b176174e573034ac1c4bfc242cbb8f3b58c9c8e9633dba6991) |
| 09:40 | player1 founded colony #1 (drip received 0.00005 ETH) | [`0x26f7f1b1…`](https://explorer.testnet.chain.robinhood.com/tx/0x26f7f1b1c3123411b46be80523c073972606e5c1030ea27beeab667b6aef7002) |
| 09:40 | player2 founded colony #2 (drip received 0.00005 ETH) | [`0x98cfc2f6…`](https://explorer.testnet.chain.robinhood.com/tx/0x98cfc2f6d5fc1a5fe1bf342cdaa1c2edc2a962f46db65f0c59ded48347ca8e4e) |
| 09:40 | player1 tended and fed the queen | [`0xe9760836…`](https://explorer.testnet.chain.robinhood.com/tx/0xe9760836deb58d675fc85b8137d1f54086863f495edec354b2ea7b43c947e384) |
| 09:41 | player2 tended and fed the queen | [`0xdd4216d8…`](https://explorer.testnet.chain.robinhood.com/tx/0xdd4216d87d390c4ce20d07ac3d470a1473f91b4bf5df4c07899292162454665b) |
| 09:41 | player1 dug a nest chamber | [`0x5bac5cab…`](https://explorer.testnet.chain.robinhood.com/tx/0x5bac5cab770885c427e1b7f37eee4356565176d3d9e365ef4b87ad7e972c015c) |
| 09:41 | player1 sealed raid 4294967296 on colony #2 with 3 soldiers (target hidden) | [`0xf8a9139d…`](https://explorer.testnet.chain.robinhood.com/tx/0xf8a9139d344aee62d0bd11fd8134dae4e916738210b623def112d922b64ac768) |
| 09:41 | player2 guarded leaves | [`0xea6b4ce7…`](https://explorer.testnet.chain.robinhood.com/tx/0xea6b4ce7701b2d413dbddcc2ae090a5b8f91dd1dc9b3f7efba6e22285fbdb9bc) |
| 10:41 | player1 revealed target sugar; assigned drand round 21945280 | [`0x6dfb74e1…`](https://explorer.testnet.chain.robinhood.com/tx/0x6dfb74e103320ebd301e4efc0fe2b5cf29bebe391b0d6c7bc0eae7fde1dffa5a) |
| 10:42 | raid settled with drand round 21945280: RaiderWon, roll 8, loot 2.99 sugar (gas 525404 · paid 0.00000525404 ETH · refunded 0.00000559265 ETH (106.4%) · net 0.00000033861 ETH) | [`0x6fe1d2a3…`](https://explorer.testnet.chain.robinhood.com/tx/0x6fe1d2a3c519111ea1d318d12fd40a595d333667a4ace2cfb0a2f37dd61c443d) |
| 15:41 | player1 fed the queen a second time | [`0x5e1fef4d…`](https://explorer.testnet.chain.robinhood.com/tx/0x5e1fef4d706e31676348d1702edb77e1ede0be1b9a7ba2371ef7fe11f782302e) |
| 15:41 | player2 fed the queen a second time | [`0x3ed878f5…`](https://explorer.testnet.chain.robinhood.com/tx/0x3ed878f57c858648699d1d8851afc06fc72adf1a6144b136caae1a59b65a9ba2) |
| 15:41 | owner moved Season 1's end to 2 minutes from now | [`0xa22648a5…`](https://explorer.testnet.chain.robinhood.com/tx/0xa22648a5ff4131117689475f561cb89e7e6f5eba153f2471b01864938962c72d) |
| 15:43 | season 1 ended | [`0xdcd38805…`](https://explorer.testnet.chain.robinhood.com/tx/0xdcd38805f57e775f916e6b4f79456a20033002d13beb5107de546b7aaef1d9d7) |
| 15:43 | ranking submitted: #1 (score 49), #2 (score 20) | [`0x170382d5…`](https://explorer.testnet.chain.robinhood.com/tx/0x170382d5acb960ba1529f25e20d9013cbae60fe33304ebbe48cd290ae69b7f98) |
| 15:43 | player1 claimed 9388.695652173913043478 mWIF from Season 1 | [`0x52b66ddf…`](https://explorer.testnet.chain.robinhood.com/tx/0x52b66ddf6455f4512b4704e44f8bbbb409c16efc0337b4668f403cdcd73eddc1) |
| 15:43 | player2 claimed 1591.304347826086956521 mWIF from Season 1 | [`0x6bbfbc39…`](https://explorer.testnet.chain.robinhood.com/tx/0x6bbfbc39c4c726c1e704b56e36cdbd77472804500576092698beed94d0f80c7c) |

## What it showed

- **Every step works onchain:**
  - founding, with the 0.00005 ETH founder drip to each new wallet
  - tending and feeding
  - a sealed raid, a guard and a reveal
  - settlement with a real drand evmnet signature, verified onchain
  - second feedings, ending the season, the verified ranking and both claims
- **The pot paid out what it held.** Players claimed 9,388.70 and 1,591.30 mWIF, split by score (49 and 20).
- **The settle refund was 6% too high.** The L1 data fee part was exact (198,304 gas, read from ArbGasInfo). The execution part added a fixed allowance for intrinsic and calldata gas, which overstated this chain's actual execution cost by 33,861 gas. The refund came to 106.4% of what the settler paid, a profit of 0.00000034 ETH.
  - **Fix:** the refund now counts only the gas the contract measures itself, scaled to 90%, plus the exact L1 fee. On this transaction that pays back about 90% and never more than the actual cost.
  - This applies from the next deployment; the contracts above still have the old formula.

## Run 2 (current contracts)

The same season, played on 2026-10-30/31 against the current testnet contracts in [DEPLOYMENTS.md](DEPLOYMENTS.md), which include the refund fix and Voter's Pass linking. Player 2's pass came from a separate voting wallet: the voting wallet signed a `LinkVoterPass` message and player 2 submitted it.

| Step | Transactions |
| --- | --- |
| owner set testnet config: guard window 1 h, feed interval 6 h | [`0xfa47da70…`](https://explorer.testnet.chain.robinhood.com/tx/0xfa47da70520f8ae6d6ffa11c85cd7fea78d751304f93b81ef9de6472fee82a75) |
| player1 funded with 0.002 ETH, minted 100,000 mWIF, approved game | [`0x312f5b3c…`](https://explorer.testnet.chain.robinhood.com/tx/0x312f5b3cd10ae3ec4aa7902922bdd6c85f385a755ee0b406814c132da706a212) [`0xd85e76a2…`](https://explorer.testnet.chain.robinhood.com/tx/0xd85e76a22374c8f7896d9177df0c46782543536f022c222d5217ed4526ffc325) |
| player2 funded with 0.002 ETH, minted 100,000 mWIF, approved game | [`0xfd4c733a…`](https://explorer.testnet.chain.robinhood.com/tx/0xfd4c733af0acc8fec7d0c228f06713e82a842e04c087fce8373c23bdc4065a9e) [`0x864d96ee…`](https://explorer.testnet.chain.robinhood.com/tx/0x864d96ee78160f81628f3b5963a382f2b7d411c97502bb77feb8b7dc53d83c6f) |
| owner sponsored 8,600 mWIF into Season 1 | [`0xf14ff15a…`](https://explorer.testnet.chain.robinhood.com/tx/0xf14ff15a8deef37b0d502fdd31c74fa9e33b8a6485c5a8398d10adafbc575698) |
| owner posted the voter root; voting wallet signed LinkVoterPass; player2 claimed the Voter's Pass | [`0x327b1e91…`](https://explorer.testnet.chain.robinhood.com/tx/0x327b1e91d4fbe0fd2c886fe18bdbdaa8ff1735e47c026047fed733abf887c61d) [`0xf3386fea…`](https://explorer.testnet.chain.robinhood.com/tx/0xf3386fea04b2ae80c58254cbeeec6a6effbc2486ba635c158d379d181034b615) |
| player1 founded colony #1 for 1500 mWIF (drip received 0.00005 ETH) | [`0xbc1aebb7…`](https://explorer.testnet.chain.robinhood.com/tx/0xbc1aebb717a0a00f71020ebabd42fd2b7ce1bdc2f3dbf6d026a323509da0a1ec) |
| player2 founded colony #2 for 1200 mWIF (drip received 0.00005 ETH) | [`0xc08e6ed2…`](https://explorer.testnet.chain.robinhood.com/tx/0xc08e6ed22e9dea0620979cf9df27bb20140bfd8c3f49ae90f0995ea6e6280433) |
| player1 tended and fed the queen (tend 0x6b0239eee99e1b81d7f1d5a1df997f7b1e6fdf11b46792a33b07c46bec1759fc) | [`0x2f0b64a4…`](https://explorer.testnet.chain.robinhood.com/tx/0x2f0b64a493e3628d1ee504455e8e455e9bdb66728dc83c5b01c01c25db8cea92) |
| player2 tended and fed the queen (tend 0x722b143565f7bf8d8910ac5ac37560a45c183628ff8cb798618c599edafacfc2) | [`0x67964544…`](https://explorer.testnet.chain.robinhood.com/tx/0x6796454435222d74b3c3c9333962ed3e00799cfef81bda0e30ffe15c0484d51b) |
| player1 dug a nest chamber | [`0xa3d9f96e…`](https://explorer.testnet.chain.robinhood.com/tx/0xa3d9f96edd8dffa7e6fdf6b810a31087f90783dacab64ef9eb540a4dc9b7e956) |
| player1 sealed raid 4294967296 on colony #2 with 3 soldiers (target hidden) | [`0xc7e4f560…`](https://explorer.testnet.chain.robinhood.com/tx/0xc7e4f56017dc90819206f75baf006cbe12481451e65e1a999c50846422e0b0e5) |
| player2 guarded leaves | [`0x87423c10…`](https://explorer.testnet.chain.robinhood.com/tx/0x87423c106347a472859c1a2e4a72f40d735c9e9620b42d17abb1e8537851181e) |
| player1 revealed target sugar; assigned drand round 21955403 | [`0x8afcb76e…`](https://explorer.testnet.chain.robinhood.com/tx/0x8afcb76ebd7981786e05f745d13cb3c6e85c8149f3112f4ab5d123e73557c1d0) |
| raid settled with drand round 21955403: RaiderWon, roll 53, loot 3.25 sugar (gas 331946 · paid 0.00000331946 ETH · refunded 0.00000281012 ETH (84.7%) · net -0.00000050934 ETH) | [`0x0ac79aeb…`](https://explorer.testnet.chain.robinhood.com/tx/0x0ac79aebb389bc1026782b78fdfc25282de49c20b9a54856fe65a649e2347fb2) |
| player1 fed the queen a second time | [`0xcdf17055…`](https://explorer.testnet.chain.robinhood.com/tx/0xcdf17055440dabda0850d49e98348ee08eb02ca990f9ba419b2fc16a2604f96a) |
| player2 fed the queen a second time | [`0xde5b23a2…`](https://explorer.testnet.chain.robinhood.com/tx/0xde5b23a20719ea7244d1299d04ea3260ec9692b2b921f725425acc043257becd) |
| owner moved Season 1's end to 2 minutes from now | [`0x1baec00c…`](https://explorer.testnet.chain.robinhood.com/tx/0x1baec00cae5fa0d85f38bc67a206ce3bddcca162057e98a927f11e0c6f34b15e) |
| season 1 ended | [`0x681db659…`](https://explorer.testnet.chain.robinhood.com/tx/0x681db6597b9809d58036490b1b09c774d4c072ceef0a89e52d5f6e455221f13e) |
| ranking submitted: #1 (score 49), #2 (score 20) | [`0x98544626…`](https://explorer.testnet.chain.robinhood.com/tx/0x98544626a9ab9339b56cdded1d054e7b02e4fea2bcfce7234c98df555beef15b) |
| player1 claimed 9185.188405797101449275 mWIF from Season 1 | [`0xa279b148…`](https://explorer.testnet.chain.robinhood.com/tx/0xa279b14894be36cd3c57455427fe401778cede6db70cc9d5922e3c2f6bba370a) |
| player2 claimed 1556.811594202898550724 mWIF from Season 1 | [`0x84df0d80…`](https://explorer.testnet.chain.robinhood.com/tx/0x84df0d804e76caaa7583934a0377233260967955dea97ab22edda92b97c40cbd) |

### What it showed

- **Linking works onchain.** A wallet that never touched the game signed one EIP-712 message; player 2 then founded for 1,200 mWIF (20% off) while player 1 paid 1,500.
- **The settle refund is now below cost.** The settler paid 0.00000331946 ETH and got back 0.00000281012 ETH (84.7%), so settling costs the settler a little and can never earn a profit.
- **The money adds up.** Paid actions totalled 3,060 mWIF (two foundings and four feedings). The pot paid out 10,742 mWIF = the 8,600 seed + 70% of 3,060; the treasury received 306 mWIF (10%); the other 20% was burned.
