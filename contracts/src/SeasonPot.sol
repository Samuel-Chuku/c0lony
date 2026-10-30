// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IColonyGameView} from "./interfaces/IColonyGameView.sol";

/// @title SeasonPot
/// @notice Holds each season's WIF prize pot. WIF leaves only through `claim` (to qualifying players)
///         and `rollUnclaimed` (into a later season's pot). There is no owner and no withdrawal.
/// @dev Payout: half the pot is split by score among all qualifying colonies, half by score among the
///      top 25% (rounded up). The ranking is not sorted onchain: anyone submits it in batches and the
///      contract checks the order, so only the one correct ranking can ever be accepted.
contract SeasonPot is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant CLAIM_PERIOD = 30 days;
    /// @notice Sponsors may fund the current season or one up to this many seasons ahead.
    uint32 public constant MAX_SEASONS_AHEAD = 52;
    uint256 public constant MAX_NAME_LENGTH = 64;

    IERC20 public immutable wif;
    address private immutable deployer;
    IColonyGameView public game;

    struct Season {
        uint256 pot; // total WIF for this season
        uint256 claimed; // WIF paid out so far
        uint256 sumAll; // total score of qualifying colonies
        uint256 sumTop; // total score of the top 25%
        uint256 lastKey; // ordering key of the last submitted colony
        uint32 target; // colonies that must be submitted (fed at least twice)
        uint32 submitted; // colonies submitted so far
        uint32 qualified; // qualifying colonies among them
        uint32 topCount; // size of the top 25%
        uint64 finalizedAt;
        bool ended;
        bool finalized;
        bool rolled;
    }

    mapping(uint32 => Season) public seasons;
    /// @notice 1-based rank of a qualifying colony in a season (0 = not ranked).
    mapping(uint32 => mapping(uint64 => uint32)) public rankOf;
    /// @dev Running total of qualifying scores by rank, so any prefix sum is O(1).
    mapping(uint32 => mapping(uint32 => uint256)) private prefixScore;
    mapping(uint32 => mapping(uint64 => bool)) public hasClaimed;

    event GameSet(address game);
    event Deposited(uint32 indexed season, address indexed from, uint256 amount, uint256 newPot);
    event Sponsored(uint32 indexed season, address indexed sponsor, uint256 amount, string name);
    event SeasonEnded(uint32 indexed season, uint256 pot, uint32 coloniesToRank);
    event RankingBatch(uint32 indexed season, uint32 submitted, uint32 target);
    event SeasonFinalized(uint32 indexed season, uint32 qualified, uint32 topCount, uint256 sumAll, uint256 sumTop);
    event Claimed(uint32 indexed season, uint64 indexed colonyId, address indexed player, uint256 amount);
    event UnclaimedRolled(uint32 indexed fromSeason, uint32 indexed toSeason, uint256 amount);

    error NotDeployer();
    error GameAlreadySet();
    error NotGame();
    error ZeroAmount();
    error NameTooLong();
    error SeasonNotOpen();
    error SeasonNotOver();
    error AlreadyEnded();
    error NotEnded();
    error AlreadyFinalized();
    error NotFinalized();
    error WrongSeason(uint64 colonyId);
    error NotFedTwice(uint64 colonyId);
    error BadOrder(uint64 colonyId);
    error TooMany();
    error NothingToClaim();
    error AlreadyClaimed();
    error AlreadyRolled();
    error ClaimPeriodActive();

    constructor(IERC20 wif_) {
        wif = wif_;
        deployer = msg.sender;
    }

    /// @notice One-time wiring to ColonyGame, done by the deployer right after deployment.
    function setGame(IColonyGameView game_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (address(game) != address(0)) revert GameAlreadySet();
        game = game_;
        emit GameSet(address(game_));
    }

    // ------------------------------------------------------------------ deposits

    /// @notice Called by ColonyGame after it has transferred the 70% share of a player's spend here.
    function addFromGame(uint32 season, uint256 amount) external {
        if (msg.sender != address(game)) revert NotGame();
        _credit(season, amount, msg.sender);
    }

    /// @notice Anyone can add WIF to the current or an upcoming season's pot. 100% goes to that pot.
    function sponsor(uint32 season, uint256 amount, string calldata name) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (bytes(name).length > MAX_NAME_LENGTH) revert NameTooLong();
        uint32 current = game.currentSeason();
        if (season < current || season > current + MAX_SEASONS_AHEAD || seasons[season].ended) {
            revert SeasonNotOpen();
        }
        uint256 beforeBal = wif.balanceOf(address(this));
        wif.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = wif.balanceOf(address(this)) - beforeBal;
        _credit(season, received, msg.sender);
        emit Sponsored(season, msg.sender, received, name);
    }

    function _credit(uint32 season, uint256 amount, address from) private {
        Season storage s = seasons[season];
        s.pot += amount;
        emit Deposited(season, from, amount, s.pot);
    }

    // ------------------------------------------------------------------ season end and ranking

    /// @notice Anyone can close a season once its end time has passed.
    function endSeason(uint32 season) external {
        if (block.timestamp < game.seasonEnd(season)) revert SeasonNotOver();
        Season storage s = seasons[season];
        if (s.ended) revert AlreadyEnded();
        s.ended = true;
        s.target = game.fedTwiceCount(season);
        emit SeasonEnded(season, s.pot, s.target);
        if (s.target == 0) _finalize(season, s);
    }

    /// @notice Submit the next batch of the season's ranking. Every colony that was fed at least twice
    ///         must appear exactly once: qualifying colonies first by score descending (ties by lower ID),
    ///         then the non-qualifying ones by ascending ID. Anyone may call; any other order reverts.
    function submitRanking(uint32 season, uint64[] calldata colonyIds) external {
        Season storage s = seasons[season];
        if (!s.ended) revert NotEnded();
        if (s.finalized) revert AlreadyFinalized();
        if (s.submitted + colonyIds.length > s.target) revert TooMany();

        uint256 lastKey = s.lastKey;
        uint32 submitted = s.submitted;
        uint32 qualified = s.qualified;
        uint256 sumAll = s.sumAll;

        for (uint256 i; i < colonyIds.length; ++i) {
            uint64 id = colonyIds[i];
            (uint32 cSeason, uint256 score, bool fedTwice, bool qualifies) = game.colonyResult(id);
            if (cSeason != season) revert WrongSeason(id);
            if (!fedTwice) revert NotFedTwice(id);

            uint256 key = _key(qualifies, score, id);
            if (submitted > 0 && key >= lastKey) revert BadOrder(id);
            lastKey = key;
            ++submitted;

            if (qualifies) {
                ++qualified;
                sumAll += score;
                prefixScore[season][qualified] = sumAll;
                rankOf[season][id] = qualified;
            }
        }

        s.lastKey = lastKey;
        s.submitted = submitted;
        s.qualified = qualified;
        s.sumAll = sumAll;
        emit RankingBatch(season, submitted, s.target);

        if (submitted == s.target) _finalize(season, s);
    }

    /// @dev Strictly descending keys encode: qualifying first, then higher score, then lower colony ID.
    ///      Non-qualifying colonies use score 0 so they are ordered by ascending ID only.
    function _key(bool qualifies, uint256 score, uint64 id) private pure returns (uint256) {
        uint256 s = qualifies ? score : 0;
        if (s > type(uint128).max) s = type(uint128).max;
        return (qualifies ? (1 << 255) : 0) | (s << 64) | (type(uint64).max - id);
    }

    function _finalize(uint32 season, Season storage s) private {
        s.finalized = true;
        s.finalizedAt = uint64(block.timestamp);
        s.topCount = (s.qualified + 3) / 4;
        s.sumTop = prefixScore[season][s.topCount];
        emit SeasonFinalized(season, s.qualified, s.topCount, s.sumAll, s.sumTop);
    }

    // ------------------------------------------------------------------ payout

    /// @notice What `colonyId` can claim from `season` (0 if not ranked, already claimed, or rolled).
    function claimable(uint32 season, uint64 colonyId) public view returns (uint256) {
        Season storage s = seasons[season];
        uint32 rank = rankOf[season][colonyId];
        if (!s.finalized || s.rolled || rank == 0 || hasClaimed[season][colonyId]) return 0;
        uint256 score = prefixScore[season][rank] - prefixScore[season][rank - 1];
        if (score == 0) return 0;
        uint256 half = s.pot / 2;
        uint256 amount = half * score / s.sumAll;
        if (rank <= s.topCount) amount += (s.pot - half) * score / s.sumTop;
        return amount;
    }

    /// @notice Pays the caller's share for `season` to the caller.
    function claim(uint32 season) external nonReentrant returns (uint256 amount) {
        Season storage s = seasons[season];
        if (!s.finalized) revert NotFinalized();
        if (s.rolled) revert AlreadyRolled();
        uint64 colonyId = game.colonyOf(season, msg.sender);
        if (hasClaimed[season][colonyId]) revert AlreadyClaimed();
        amount = claimable(season, colonyId);
        if (amount == 0) revert NothingToClaim();

        hasClaimed[season][colonyId] = true;
        s.claimed += amount;
        wif.safeTransfer(msg.sender, amount);
        emit Claimed(season, colonyId, msg.sender, amount);
    }

    /// @notice After the claim period, anyone can move a season's unclaimed WIF into the current season.
    function rollUnclaimed(uint32 season) external {
        Season storage s = seasons[season];
        if (!s.finalized) revert NotFinalized();
        if (s.rolled) revert AlreadyRolled();
        if (block.timestamp < s.finalizedAt + CLAIM_PERIOD) revert ClaimPeriodActive();
        s.rolled = true;
        uint256 amount = s.pot - s.claimed;
        uint32 to = game.currentSeason();
        emit UnclaimedRolled(season, to, amount);
        _credit(to, amount, address(this));
    }
}
