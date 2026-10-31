// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IWIF} from "./interfaces/IWIF.sol";
import {ISeasonPot} from "./interfaces/ISeasonPot.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IColonyGameView} from "./interfaces/IColonyGameView.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {DrandVerifier} from "./DrandVerifier.sol";

/// @title ColonyGame
/// @notice Onchain ant-colony strategy game. Holds all game state. Every WIF payment is split
///         70% season pot / 20% burned / 10% treasury. Raid rolls come only from drand evmnet rounds
///         verified onchain, and rolls only ever move leaves, sugar and soldiers, never WIF.
/// @dev Colony NFTs cannot be transferred during a season (mint only). Timers use block.timestamp only.
contract ColonyGame is ERC721, EIP712, Ownable, ReentrancyGuard, IColonyGameView {
    using SafeERC20 for IWIF;

    // ================================================================== constants

    /// @dev Leaves and sugar are stored with 9 decimals so trail/farm output can accrue per second.
    uint256 internal constant RES = 1e9;

    // Founding
    uint32 internal constant START_WORKERS = 10;
    uint32 internal constant START_CHAMBERS = 2;
    uint256 internal constant START_LEAVES = 20;
    uint256 internal constant START_SUGAR = 20;
    uint32 internal constant WORKERS_PER_CHAMBER = 5;

    // Hand foraging
    uint256 internal constant LEAF_FORAGE = 6;
    uint256 internal constant SUGAR_FORAGE = 3;
    uint256 internal constant SUGAR_PER_WORKER_PCT = 8; // +0.08 sugar per worker, rounded down

    // Trails and farms: 0.0000115 per worker-second, up to 100 workers per building
    uint256 internal constant PRODUCTION_PER_WORKER_SEC = 11_500; // 0.0000115 * RES
    uint32 internal constant WORKERS_PER_BUILDING = 100;

    // Feeding
    uint256 internal constant FEED_LEAVES = 3;
    uint256 internal constant SUGAR_PER_NEW_WORKER = 2;

    // Queen survival (fixed, so the owner can never starve colonies by changing a parameter)
    uint256 public constant STARVE_AFTER = 72 hours;
    uint256 public constant REVIVE_WINDOW = 24 hours;

    // Score
    uint256 internal constant SCORE_PER_RAID_WIN = 25;
    uint256 internal constant SCORE_PER_GUARD_WIN = 10;

    // Avenge: a raided defender may raid the winner back once, free of their own raid cooldown, within this window
    uint256 public constant AVENGE_WINDOW = 24 hours;

    // Raids
    uint32 internal constant MIN_RAID_WORKERS = 10;
    uint256 internal constant MAX_SOLDIER_PCT = 30;
    uint8 internal constant MAX_OPEN_INCOMING = 2;
    uint256 internal constant LOOT_CAP_PER_SOLDIER = 5;
    uint256 public constant ROUND_DELAY = 30 seconds;
    uint256 public constant SETTLE_TIMEOUT = 48 hours;
    /// @dev Share of settle's measured execution gas that is refunded, in percent. Only the measured part counts
    ///      (no allowance for intrinsic or calldata gas), and it is scaled down, so storage-clearing gas refunds can
    ///      never push the refund above what the settler actually paid. Checked against a real testnet receipt.
    uint256 internal constant SETTLE_REFUND_PCT = 90;

    // Seasons
    uint256 public constant MAX_SEASON_LENGTH = 21 days;
    uint256 public constant MIN_SEASON_LENGTH = 1 days;

    // WIF split (percent)
    uint256 internal constant BURN_PCT = 20;
    uint256 internal constant TREASURY_PCT = 10;

    // ================================================================== tunable config

    /// @notice Every owner-tunable number. Each field is capped relative to its launch value
    ///         (see `_checkConfig`), and every change emits ConfigUpdated.
    struct Config {
        // Prices in WIF (18 decimals). Cap: 0.25x to 4x launch.
        uint256 foundPrice;
        uint256 feedPrice;
        uint256 speedUpPrice;
        uint256 shieldPrice;
        uint256 reviveBasePrice;
        uint256 revivePerWorkerPrice;
        // Cooldowns and windows in seconds. Cap: 0.25x to 4x launch, except where noted.
        uint64 leafForageCooldown;
        uint64 sugarForageCooldown;
        uint64 feedMinInterval;
        uint64 speedUpCooldown;
        uint64 raidCooldown;
        uint64 guardWindow; // 1 h to 8 h
        uint64 revealWindow;
        uint64 shieldDuration;
        uint64 shieldCooldown;
        uint64 seasonLength; // default for new seasons; 1 to 21 days
        // Raider win chance out of 100. Cap: 50 to 85.
        uint8 winOddsUnguarded;
        uint8 winOddsGuardedOther;
        // Voter's Pass discount on founding and feeding, in percent. Cap: 0 to 30.
        uint8 voterDiscountPct;
    }

    function launchConfig() public pure returns (Config memory c) {
        c.foundPrice = 1_500 ether;
        c.feedPrice = 100 ether;
        c.speedUpPrice = 300 ether;
        c.shieldPrice = 1_000 ether;
        c.reviveBasePrice = 2_000 ether;
        c.revivePerWorkerPrice = 20 ether;
        c.leafForageCooldown = 6 hours;
        c.sugarForageCooldown = 3 hours;
        c.feedMinInterval = 24 hours;
        c.speedUpCooldown = 24 hours;
        c.raidCooldown = 6 hours;
        c.guardWindow = 4 hours;
        c.revealWindow = 24 hours;
        c.shieldDuration = 8 hours;
        c.shieldCooldown = 24 hours;
        c.seasonLength = 7 days;
        c.winOddsUnguarded = 65;
        c.winOddsGuardedOther = 75;
        c.voterDiscountPct = 20;
    }

    Config internal config;

    function getConfig() external view returns (Config memory) {
        return config;
    }

    // ================================================================== state

    enum Status {
        None,
        Alive,
        Starving, // unfed for 72 h, revivable for 24 h
        Collapsed,
        SeasonOver
    }

    enum Resource {
        None,
        Leaves,
        Sugar
    }

    enum RaidStatus {
        None,
        Sealed,
        Revealed,
        Settled,
        Failed, // never revealed: soldiers lost
        Refunded // drand round not settled within 48 h: soldiers return
    }

    enum Outcome {
        None,
        RaiderWon,
        RaiderLost, // soldiers return, nothing taken
        Guarded // defender guarded the sealed target
    }

    struct Colony {
        address owner;
        uint32 season;
        uint32 workers; // all workers, including assigned ones and soldiers out on raids
        uint32 chambers;
        uint32 trails;
        uint32 farms;
        uint32 trailWorkers;
        uint32 farmWorkers;
        uint32 soldiersOut;
        uint32 feedCount;
        uint32 raidWinsPending;
        uint32 guardWinsPending;
        uint32 raidNonce;
        uint32 raidsWon; // settled raids won as raider
        uint32 raidsLost; // settled raids not won as raider
        uint32 raidsFaced; // settled raids against this colony
        uint32 raidsDefended; // settled raids against this colony that the raider did not win
        uint8 openIncoming;
        bool collapseMarked;
        uint128 leaves; // RES units
        uint128 sugar; // RES units
        uint64 foundedAt;
        uint64 lastFed; // queen timer
        uint64 lastFeedAt; // 0 until first feeding
        uint64 lastAccrual;
        uint64 lastLeafForage; // 0 = ready
        uint64 lastSugarForage;
        uint64 lastLeafSpeedUp;
        uint64 lastSugarSpeedUp;
        uint64 lastRaidLaunch;
        uint64 shieldUntil;
        uint64 lastShield;
        uint256 score;
    }

    struct Raid {
        uint64 raider;
        uint64 defender;
        uint32 soldiers;
        RaidStatus status;
        Resource guard;
        Resource target;
        Outcome outcome;
        uint64 launchedAt;
        uint64 round;
        bytes32 commitment;
    }

    IWIF public immutable wif;
    ISeasonPot public immutable pot;
    ITreasury public immutable treasury;

    uint64 public nextColonyId = 1;
    uint32 internal seasonNumber;
    mapping(uint32 => uint64) public seasonStart;
    mapping(uint32 => uint64) internal seasonEndStored;
    mapping(uint32 => uint32) public fedTwiceCount;

    mapping(uint64 => Colony) internal colonies;
    mapping(uint32 => mapping(address => uint64)) public colonyOf;
    mapping(uint256 => Raid) public raids;
    /// @dev Unresolved raids per colony (as raider or defender), for the collect-first rule.
    mapping(uint64 => uint256[]) internal activeRaids;
    mapping(uint256 => mapping(uint64 => uint256)) internal activeIndex; // raidId => colony => index + 1

    /// @notice Voter's Pass: Merkle root of every address that has voted in a World is Fair event.
    ///         Leaves follow OpenZeppelin StandardMerkleTree for one `address` value.
    bytes32 public voterRoot;
    /// @notice Address (besides the owner) allowed to post a new voter root, normally the keeper.
    address public voterRootSetter;
    /// @notice Set once a wallet proves it is on the voter list; permanent after that.
    mapping(address => bool) public hasVoterPass;
    /// @notice The wallet each voting address granted its pass to (itself if it played directly). One per voter.
    mapping(address => address) public voterUsed;
    /// @notice EIP-712 nonce for each voting address's LinkVoterPass signature.
    mapping(address => uint256) public voterNonce;
    /// @notice avengeUntil[defender][raider]: until when `defender` may avenge a raid that `raider` won (0 = none).
    mapping(address => mapping(address => uint64)) public avengeUntil;

    bytes32 internal constant LINK_VOTER_PASS_TYPEHASH = keccak256("LinkVoterPass(address gameWallet,uint256 nonce)");

    // ================================================================== events

    event ConfigUpdated(Config oldConfig, Config newConfig);
    event SeasonStarted(uint32 indexed season, uint64 start, uint64 end);
    event SeasonEndChanged(uint32 indexed season, uint64 oldEnd, uint64 newEnd);
    event Paid(
        uint64 indexed colonyId,
        address indexed player,
        bytes32 indexed action,
        uint256 amount,
        uint256 toPot,
        uint256 burned,
        uint256 toTreasury
    );
    // Every player-facing event names the colony owner's wallet, so the live feed and profiles need no extra reads.
    event ColonyFounded(
        uint64 indexed colonyId, address indexed owner, uint32 indexed season, uint64 foundedAt, uint32 seasonDay
    );
    event Tended(uint64 indexed colonyId, address indexed owner, uint256 leavesGained, uint256 sugarGained);
    event QueenFed(
        uint64 indexed colonyId,
        address indexed owner,
        uint32 workersAfter,
        uint32 born,
        uint32 died,
        uint256 scoreAdded,
        uint256 totalScore,
        uint64 fedUntil
    );
    event Built(
        uint64 indexed colonyId,
        address indexed owner,
        bytes32 indexed building,
        uint256 leavesCost,
        uint256 sugarCost,
        uint32 newCount
    );
    event WorkersAssigned(
        uint64 indexed colonyId, address indexed owner, uint32 trailWorkers, uint32 farmWorkers, uint32 idle
    );
    event SpedUp(uint64 indexed colonyId, address indexed owner, Resource forage);
    event Revived(uint64 indexed colonyId, address indexed owner);
    event Shielded(uint64 indexed colonyId, address indexed owner, uint64 until);
    event ColonyCollapsed(uint64 indexed colonyId, address indexed owner);
    /// @dev The target resource stays sealed until Revealed.
    event RaidLaunched(
        uint256 indexed raidId,
        uint64 indexed raider,
        uint64 indexed defender,
        address raiderOwner,
        address defenderOwner,
        uint32 soldiers,
        uint64 guardDeadline,
        bool isAvenge
    );
    event Guarded(uint256 indexed raidId, uint64 indexed defender, address indexed owner, Resource resource);
    event Revealed(uint256 indexed raidId, Resource target, uint64 round, uint64 roundTime);
    event RaidSettled(
        uint256 indexed raidId,
        uint64 indexed raider,
        uint64 indexed defender,
        address raiderOwner,
        address defenderOwner,
        Outcome outcome,
        uint256 roll,
        Resource lootResource,
        uint256 lootAmount,
        uint32 soldiersLost,
        uint64 round,
        address settler,
        uint256 refund
    );
    event RaidCollected(uint256 indexed raidId, RaidStatus status, uint32 soldiersLost);
    event AvengeGranted(address indexed defender, address indexed raider, uint256 indexed raidId, uint64 expiresAt);
    event VoterRootUpdated(bytes32 root, string listURI);
    event VoterRootSetterUpdated(address setter);
    event VoterPassGranted(address indexed player);
    event VoterPassLinked(address indexed voter, address indexed gameWallet);

    // ================================================================== errors

    error BadConfig();
    error BadSeasonEnd();
    error Soulbound();
    error AlreadyHasColony();
    error NoColony();
    error NotAlive();
    error NotStarving();
    error NotReady();
    error NotEnoughLeaves();
    error NotEnoughSugar();
    error TooManyWorkers();
    error BadResource();
    error NotRaider();
    error NotDefender();
    error CannotRaidSelf();
    error TooFewWorkers();
    error OutOfRange();
    error TargetShielded();
    error TargetBusy();
    error BadSoldiers();
    error CollectFirst();
    error WrongStatus();
    error GuardWindowClosed();
    error GuardWindowOpen();
    error AlreadyGuarded();
    error RevealWindowClosed();
    error BadCommitment();
    error RoundNotPublished();
    error SettleExpired();
    error BadSignature();
    error NothingToCollect();
    error NotVoterRootSetter();
    error NotOnVoterList();
    error VoterAlreadyUsed();
    error BadVoterSignature();
    error AlreadyHasPass();
    error NoAvenge();
    error NotYetAvailable();

    // ================================================================== setup

    constructor(IWIF wif_, ISeasonPot pot_, ITreasury treasury_, address owner_)
        ERC721("C0LONY", "C0L")
        EIP712("C0LONY", "1")
        Ownable(owner_)
    {
        wif = wif_;
        pot = pot_;
        treasury = treasury_;
        Config memory c = launchConfig();
        config = c;
        emit ConfigUpdated(c, c);
        seasonNumber = 1;
        seasonStart[1] = uint64(block.timestamp);
        seasonEndStored[1] = uint64(block.timestamp + c.seasonLength);
        emit SeasonStarted(1, seasonStart[1], seasonEndStored[1]);
    }

    // ================================================================== owner

    /// @notice Replace the tunable config. Every field must stay within its hard cap.
    function setConfig(Config calldata c) external onlyOwner {
        _syncSeason();
        _checkConfig(c);
        emit ConfigUpdated(config, c);
        config = c;
    }

    /// @notice Move the current season's end (e.g. to the hackathon final's close date).
    ///         It must stay in the future and within MAX_SEASON_LENGTH of the season start.
    function setCurrentSeasonEnd(uint64 newEnd) external onlyOwner {
        _syncSeason();
        uint32 s = seasonNumber;
        if (newEnd <= block.timestamp || newEnd > seasonStart[s] + MAX_SEASON_LENGTH) revert BadSeasonEnd();
        emit SeasonEndChanged(s, seasonEndStored[s], newEnd);
        seasonEndStored[s] = newEnd;
    }

    function _checkConfig(Config calldata c) internal pure {
        Config memory l = launchConfig();
        if (
            !_within4x(c.foundPrice, l.foundPrice) || !_within4x(c.feedPrice, l.feedPrice)
                || !_within4x(c.speedUpPrice, l.speedUpPrice) || !_within4x(c.shieldPrice, l.shieldPrice)
                || !_within4x(c.reviveBasePrice, l.reviveBasePrice)
                || !_within4x(c.revivePerWorkerPrice, l.revivePerWorkerPrice)
                || !_within4x(c.leafForageCooldown, l.leafForageCooldown)
                || !_within4x(c.sugarForageCooldown, l.sugarForageCooldown)
                || !_within4x(c.feedMinInterval, l.feedMinInterval) || !_within4x(c.speedUpCooldown, l.speedUpCooldown)
                || !_within4x(c.raidCooldown, l.raidCooldown) || !_within4x(c.revealWindow, l.revealWindow)
                || !_within4x(c.shieldDuration, l.shieldDuration) || !_within4x(c.shieldCooldown, l.shieldCooldown)
                || c.guardWindow < 1 hours || c.guardWindow > 8 hours || c.seasonLength < MIN_SEASON_LENGTH
                || c.seasonLength > MAX_SEASON_LENGTH || c.winOddsUnguarded < 50 || c.winOddsUnguarded > 85
                || c.winOddsGuardedOther < 50 || c.winOddsGuardedOther > 85 || c.voterDiscountPct > 30
        ) revert BadConfig();
        // A feed must stay possible before the queen starves.
        if (c.feedMinInterval >= STARVE_AFTER) revert BadConfig();
    }

    /// @notice Choose the address (besides the owner) that may post voter roots, normally the keeper.
    function setVoterRootSetter(address setter) external onlyOwner {
        voterRootSetter = setter;
        emit VoterRootSetterUpdated(setter);
    }

    /// @notice Post a new Voter's Pass Merkle root. `listURI` points at the published voter list.
    function setVoterRoot(bytes32 root, string calldata listURI) external {
        if (msg.sender != owner() && msg.sender != voterRootSetter) revert NotVoterRootSetter();
        voterRoot = root;
        emit VoterRootUpdated(root, listURI);
    }

    function _within4x(uint256 v, uint256 launch) internal pure returns (bool) {
        return v * 4 >= launch && v <= launch * 4;
    }

    // ================================================================== seasons

    /// @dev Materialises any seasons whose start has passed. Seasons are back to back.
    function _syncSeason() internal returns (uint32 s) {
        s = seasonNumber;
        while (block.timestamp >= seasonEndStored[s]) {
            uint64 start = seasonEndStored[s];
            ++s;
            seasonStart[s] = start;
            seasonEndStored[s] = start + config.seasonLength;
            emit SeasonStarted(s, start, seasonEndStored[s]);
        }
        seasonNumber = s;
    }

    function currentSeason() public view returns (uint32 s) {
        s = seasonNumber;
        uint256 end = seasonEndStored[s];
        while (block.timestamp >= end) {
            ++s;
            end += config.seasonLength;
        }
    }

    function seasonEnd(uint32 s) public view returns (uint64) {
        uint32 n = seasonNumber;
        if (s <= n) return seasonEndStored[s];
        return uint64(seasonEndStored[n] + uint256(s - n) * config.seasonLength);
    }

    // ================================================================== colony status helpers

    function _status(Colony storage c, uint32 current) internal view returns (Status) {
        if (c.owner == address(0)) return Status.None;
        if (c.season != current) return Status.SeasonOver;
        if (c.collapseMarked) return Status.Collapsed;
        if (block.timestamp <= c.lastFed + STARVE_AFTER) return Status.Alive;
        if (block.timestamp <= c.lastFed + STARVE_AFTER + REVIVE_WINDOW) return Status.Starving;
        return Status.Collapsed;
    }

    /// @dev Loads the caller's colony for this season and requires it to be alive.
    function _myAliveColony() internal returns (uint64 id, Colony storage c) {
        uint32 s = _syncSeason();
        id = colonyOf[s][msg.sender];
        if (id == 0) revert NoColony();
        c = colonies[id];
        if (_status(c, s) != Status.Alive) revert NotAlive();
    }

    /// @dev Credits trail and farm output since the last accrual.
    function _accrue(Colony storage c) internal {
        uint256 dt = block.timestamp - c.lastAccrual;
        if (dt > 0) {
            if (c.trailWorkers > 0) c.leaves += uint128(dt * c.trailWorkers * PRODUCTION_PER_WORKER_SEC);
            if (c.farmWorkers > 0) c.sugar += uint128(dt * c.farmWorkers * PRODUCTION_PER_WORKER_SEC);
            c.lastAccrual = uint64(block.timestamp);
        }
    }

    function _ready(uint64 last, uint64 cooldown) internal view returns (bool) {
        return last == 0 || block.timestamp >= uint256(last) + cooldown;
    }

    function _spend(Colony storage c, uint256 leavesUnits, uint256 sugarUnits) internal {
        if (c.leaves < leavesUnits) revert NotEnoughLeaves();
        if (c.sugar < sugarUnits) revert NotEnoughSugar();
        c.leaves -= uint128(leavesUnits);
        c.sugar -= uint128(sugarUnits);
    }

    function _idle(Colony storage c) internal view returns (uint32) {
        return c.workers - c.trailWorkers - c.farmWorkers - c.soldiersOut;
    }

    /// @dev Removes `n` home workers: idle first, then trail, then farm workers. Soldiers out are not touched.
    function _killHomeWorkers(Colony storage c, uint32 n) internal returns (uint32 killed) {
        uint32 idle = _idle(c);
        uint32 fromIdle = n < idle ? n : idle;
        n -= fromIdle;
        uint32 fromTrail = n < c.trailWorkers ? n : c.trailWorkers;
        n -= fromTrail;
        uint32 fromFarm = n < c.farmWorkers ? n : c.farmWorkers;
        c.trailWorkers -= fromTrail;
        c.farmWorkers -= fromFarm;
        killed = fromIdle + fromTrail + fromFarm;
        c.workers -= killed;
    }

    // ================================================================== payments

    /// @dev Pulls `amount` WIF from the caller and splits it 70% pot / 20% burn / 10% treasury.
    function _pay(uint64 colonyId, bytes32 action, uint256 amount) internal {
        wif.safeTransferFrom(msg.sender, address(this), amount);
        uint256 burned = amount * BURN_PCT / 100;
        uint256 toTreasury = amount * TREASURY_PCT / 100;
        uint256 toPot = amount - burned - toTreasury;
        wif.burn(burned);
        wif.safeTransfer(address(treasury), toTreasury);
        wif.safeTransfer(address(pot), toPot);
        pot.addFromGame(seasonNumber, toPot);
        emit Paid(colonyId, msg.sender, action, amount, toPot, burned, toTreasury);
    }

    // ================================================================== voter's pass

    /// @dev True if the caller holds a Voter's Pass, granting it first if `proof` is valid.
    ///      An empty or invalid proof simply returns false; it never reverts.
    /// @dev Direct path: the voting wallet itself plays and passes its proof. This uses up the voter's one grant,
    ///      so a voter who already linked the pass to another wallet gets no discount here (and never a revert).
    function _voterPass(bytes32[] calldata proof) internal returns (bool) {
        if (hasVoterPass[msg.sender]) return true;
        bytes32 root = voterRoot;
        if (proof.length == 0 || root == bytes32(0) || voterUsed[msg.sender] != address(0)) return false;
        if (!MerkleProof.verifyCalldata(proof, root, _voterLeaf(msg.sender))) return false;
        voterUsed[msg.sender] = msg.sender;
        hasVoterPass[msg.sender] = true;
        emit VoterPassGranted(msg.sender);
        return true;
    }

    /// @dev OpenZeppelin StandardMerkleTree leaf for a single `address` value.
    function _voterLeaf(address voter) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(voter))));
    }

    /// @notice Link a Voter's Pass from the wallet that voted to the wallet calling this (e.g. an embedded game
    ///         wallet). `signature` is the voting wallet's EIP-712 LinkVoterPass(gameWallet = caller, nonce) signature;
    ///         smart-contract wallets are supported through ERC-1271. Each voting address can grant the pass once.
    function claimVoterPass(address voterAddress, bytes32[] calldata proof, bytes calldata signature) external {
        if (voterUsed[voterAddress] != address(0)) revert VoterAlreadyUsed();
        if (hasVoterPass[msg.sender]) revert AlreadyHasPass();
        bytes32 root = voterRoot;
        if (root == bytes32(0) || !MerkleProof.verifyCalldata(proof, root, _voterLeaf(voterAddress))) {
            revert NotOnVoterList();
        }
        uint256 nonce = voterNonce[voterAddress];
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(LINK_VOTER_PASS_TYPEHASH, msg.sender, nonce)));
        if (!SignatureChecker.isValidSignatureNow(voterAddress, digest, signature)) revert BadVoterSignature();

        voterUsed[voterAddress] = msg.sender;
        voterNonce[voterAddress] = nonce + 1;
        hasVoterPass[msg.sender] = true;
        emit VoterPassLinked(voterAddress, msg.sender);
        emit VoterPassGranted(msg.sender);
    }

    function _discounted(uint256 price, bool pass) internal view returns (uint256) {
        return pass ? price * (100 - config.voterDiscountPct) / 100 : price;
    }

    /// @notice Founding and feeding prices for `player`, including their Voter's Pass discount if they hold one.
    function pricesFor(address player) external view returns (uint256 foundPrice, uint256 feedPrice) {
        bool pass = hasVoterPass[player];
        foundPrice = _discounted(config.foundPrice, pass);
        feedPrice = _discounted(config.feedPrice, pass);
    }

    // ================================================================== core loop

    /// @notice Found a colony for this season. One living colony per wallet; refounding after a collapse
    ///         is allowed and pays again. A wallet's first ever colony may receive a gas drip.
    /// @param voterProof Optional Voter's Pass proof (empty array for none).
    function foundColony(bytes32[] calldata voterProof) external nonReentrant returns (uint64 id) {
        uint32 s = _syncSeason();
        uint64 existing = colonyOf[s][msg.sender];
        if (existing != 0) {
            Colony storage old = colonies[existing];
            if (_status(old, s) != Status.Collapsed) revert AlreadyHasColony();
            _markCollapsed(existing, old);
        }

        id = nextColonyId++;
        Colony storage c = colonies[id];
        c.owner = msg.sender;
        c.season = s;
        c.workers = START_WORKERS;
        c.chambers = START_CHAMBERS;
        c.leaves = uint128(START_LEAVES * RES);
        c.sugar = uint128(START_SUGAR * RES);
        c.foundedAt = uint64(block.timestamp);
        c.lastFed = uint64(block.timestamp);
        c.lastAccrual = uint64(block.timestamp);
        colonyOf[s][msg.sender] = id;

        _pay(id, "found", _discounted(config.foundPrice, _voterPass(voterProof)));
        _mint(msg.sender, id);
        emit ColonyFounded(id, msg.sender, s, c.foundedAt, seasonDay(s, c.foundedAt));

        try treasury.drip(msg.sender) {} catch {}
    }

    /// @notice Collect every finished hand forage plus all trail and farm output, and restart the timers.
    function tend() external {
        (uint64 id, Colony storage c) = _myAliveColony();
        uint256 leavesBefore = c.leaves;
        uint256 sugarBefore = c.sugar;
        _accrue(c);
        Config storage cfg = config;
        if (_ready(c.lastLeafForage, cfg.leafForageCooldown)) _collectLeafForage(c);
        if (_ready(c.lastSugarForage, cfg.sugarForageCooldown)) _collectSugarForage(c);
        emit Tended(id, msg.sender, c.leaves - leavesBefore, c.sugar - sugarBefore);
    }

    function _collectLeafForage(Colony storage c) internal {
        c.leaves += uint128(LEAF_FORAGE * RES);
        c.lastLeafForage = uint64(block.timestamp);
    }

    function _collectSugarForage(Colony storage c) internal {
        c.sugar += uint128((SUGAR_FORAGE + uint256(c.workers) * SUGAR_PER_WORKER_PCT / 100) * RES);
        c.lastSugarForage = uint64(block.timestamp);
    }

    /// @notice Feed the queen: costs 3 leaves and the feed price. Every worker eats 1 sugar (a shortfall
    ///         kills that many workers), then new workers = min(surplus sugar / 2, free chamber space).
    /// @param voterProof Optional Voter's Pass proof (empty array for none).
    function feedQueen(bytes32[] calldata voterProof) external nonReentrant {
        (uint64 id, Colony storage c) = _myAliveColony();
        if (!_ready(c.lastFeedAt, config.feedMinInterval)) revert NotReady();
        _accrue(c);
        _spend(c, FEED_LEAVES * RES, 0);

        uint32 died;
        uint256 need = uint256(c.workers) * RES;
        if (c.sugar >= need) {
            c.sugar -= uint128(need);
        } else {
            uint32 shortfall = c.workers - uint32(c.sugar / RES);
            c.sugar = 0;
            died = _killHomeWorkers(c, shortfall);
        }

        uint32 born;
        uint32 capacity = c.chambers * WORKERS_PER_CHAMBER;
        if (capacity > c.workers) {
            uint256 affordable = c.sugar / (SUGAR_PER_NEW_WORKER * RES);
            uint256 space = capacity - c.workers;
            born = uint32(affordable < space ? affordable : space);
            c.sugar -= uint128(uint256(born) * SUGAR_PER_NEW_WORKER * RES);
            c.workers += born;
        }

        uint256 added =
            uint256(c.workers) + SCORE_PER_RAID_WIN * c.raidWinsPending + SCORE_PER_GUARD_WIN * c.guardWinsPending;
        c.score += added;
        c.raidWinsPending = 0;
        c.guardWinsPending = 0;
        c.lastFed = uint64(block.timestamp);
        c.lastFeedAt = uint64(block.timestamp);
        c.feedCount += 1;
        if (c.feedCount == 2) fedTwiceCount[c.season] += 1;

        _pay(id, "feed", _discounted(config.feedPrice, _voterPass(voterProof)));
        emit QueenFed(id, msg.sender, c.workers, born, died, added, c.score, c.lastFed + uint64(STARVE_AFTER));
    }

    function _max3(uint256 a, uint256 b, uint256 c) internal pure returns (uint256 m) {
        m = a > b ? a : b;
        if (c > m) m = c;
    }

    /// @notice Leaves needed for the next nest chamber: max(10, chambers, 0.2 x workers).
    function chamberCost(uint64 colonyId) public view returns (uint256) {
        Colony storage c = colonies[colonyId];
        return _max3(10, c.chambers, uint256(c.workers) / 5);
    }

    /// @notice Leaves needed for the next leafcutter trail: max(50, 2 x chambers, 0.5 x workers).
    function trailCost(uint64 colonyId) public view returns (uint256) {
        Colony storage c = colonies[colonyId];
        return _max3(50, 2 * uint256(c.chambers), uint256(c.workers) / 2);
    }

    /// @notice Leaves (and the same amount of sugar) for the next aphid farm: max(25, chambers, 0.25 x workers).
    function farmCost(uint64 colonyId) public view returns (uint256) {
        Colony storage c = colonies[colonyId];
        return _max3(25, c.chambers, uint256(c.workers) / 4);
    }

    function digChamber() external {
        (uint64 id, Colony storage c) = _myAliveColony();
        _accrue(c);
        uint256 cost = chamberCost(id);
        _spend(c, cost * RES, 0);
        c.chambers += 1;
        emit Built(id, msg.sender, "chamber", cost, 0, c.chambers);
    }

    function buildTrail() external {
        (uint64 id, Colony storage c) = _myAliveColony();
        _accrue(c);
        uint256 cost = trailCost(id);
        _spend(c, cost * RES, 0);
        c.trails += 1;
        emit Built(id, msg.sender, "trail", cost, 0, c.trails);
    }

    function buildFarm() external {
        (uint64 id, Colony storage c) = _myAliveColony();
        _accrue(c);
        uint256 cost = farmCost(id);
        _spend(c, cost * RES, cost * RES);
        c.farms += 1;
        emit Built(id, msg.sender, "farm", cost, cost, c.farms);
    }

    /// @notice Set how many workers run trails and farms. Free; collects accrued output first.
    function assignWorkers(uint32 trailWorkers, uint32 farmWorkers) external {
        (uint64 id, Colony storage c) = _myAliveColony();
        _accrue(c);
        if (trailWorkers > c.trails * WORKERS_PER_BUILDING || farmWorkers > c.farms * WORKERS_PER_BUILDING) {
            revert TooManyWorkers();
        }
        if (uint256(trailWorkers) + farmWorkers + c.soldiersOut > c.workers) revert TooManyWorkers();
        c.trailWorkers = trailWorkers;
        c.farmWorkers = farmWorkers;
        emit WorkersAssigned(id, msg.sender, trailWorkers, farmWorkers, _idle(c));
    }

    /// @notice Pay to finish a hand forage now and collect it. Once per 24 h per forage type.
    function speedUp(Resource forage) external nonReentrant {
        (uint64 id, Colony storage c) = _myAliveColony();
        Config storage cfg = config;
        _accrue(c);
        if (forage == Resource.Leaves) {
            if (!_ready(c.lastLeafSpeedUp, cfg.speedUpCooldown)) revert NotReady();
            c.lastLeafSpeedUp = uint64(block.timestamp);
            _collectLeafForage(c);
        } else if (forage == Resource.Sugar) {
            if (!_ready(c.lastSugarSpeedUp, cfg.speedUpCooldown)) revert NotReady();
            c.lastSugarSpeedUp = uint64(block.timestamp);
            _collectSugarForage(c);
        } else {
            revert BadResource();
        }
        _pay(id, "speedUp", cfg.speedUpPrice);
        emit SpedUp(id, msg.sender, forage);
    }

    /// @notice Revive a queen that has gone 72 h unfed, within the following 24 h. The colony is restored as it was.
    function revive() external nonReentrant {
        uint32 s = _syncSeason();
        uint64 id = colonyOf[s][msg.sender];
        if (id == 0) revert NoColony();
        Colony storage c = colonies[id];
        if (_status(c, s) != Status.Starving) revert NotStarving();
        c.lastFed = uint64(block.timestamp);
        _pay(id, "revive", config.reviveBasePrice + uint256(c.workers) * config.revivePerWorkerPrice);
        emit Revived(id, msg.sender);
    }

    /// @notice Make the colony unraidable for the shield duration. Raids already sealed still resolve.
    function shield() external nonReentrant {
        (uint64 id, Colony storage c) = _myAliveColony();
        Config storage cfg = config;
        if (!_ready(c.lastShield, cfg.shieldCooldown)) revert NotReady();
        c.lastShield = uint64(block.timestamp);
        c.shieldUntil = uint64(block.timestamp + cfg.shieldDuration);
        _pay(id, "shield", cfg.shieldPrice);
        emit Shielded(id, msg.sender, c.shieldUntil);
    }

    /// @notice Anyone can record a collapse (emits ColonyCollapsed and zeroes the colony).
    function pokeCollapse(uint64 colonyId) external {
        uint32 s = _syncSeason();
        Colony storage c = colonies[colonyId];
        if (_status(c, s) != Status.Collapsed || c.collapseMarked) revert WrongStatus();
        _markCollapsed(colonyId, c);
    }

    function _markCollapsed(uint64 id, Colony storage c) internal {
        if (c.collapseMarked) return;
        c.collapseMarked = true;
        c.workers = 0;
        c.chambers = 0;
        c.trails = 0;
        c.farms = 0;
        c.trailWorkers = 0;
        c.farmWorkers = 0;
        c.soldiersOut = 0;
        c.leaves = 0;
        c.sugar = 0;
        c.score = 0;
        c.raidWinsPending = 0;
        c.guardWinsPending = 0;
        emit ColonyCollapsed(id, c.owner);
    }

    // ================================================================== raids

    /// @notice Raid IDs are predictable per colony so the raider can sign the ID before launching.
    function nextRaidId(uint64 colonyId) public view returns (uint256) {
        return (uint256(colonyId) << 32) | colonies[colonyId].raidNonce;
    }

    /// @notice Commitment the raider must submit: keccak256(abi.encode(target, salt, raidId)).
    function commitmentFor(Resource target, bytes32 salt, uint256 raidId) public pure returns (bytes32) {
        return keccak256(abi.encode(target, salt, raidId));
    }

    /// @notice Seal a raid. Soldiers (up to 30% of idle workers) are locked until it resolves.
    function launchRaid(uint64 defenderId, uint32 soldiers, bytes32 commitment) external returns (uint256 raidId) {
        return _launchRaid(defenderId, soldiers, commitment, false);
    }

    /// @notice Avenge: raid back the wallet that won a raid against you, within 24 h of that settle.
    ///         Exactly like launchRaid against the raider's current colony (same soldier limits, range, shield,
    ///         guard window, reveal and drand settle, no bonus), except it neither needs nor restarts your own raid
    ///         cooldown. Usable once per grant.
    function avenge(address raider, uint32 soldiers, bytes32 commitment) external returns (uint256 raidId) {
        uint64 expires = avengeUntil[msg.sender][raider];
        if (expires == 0 || block.timestamp > expires) revert NoAvenge();
        delete avengeUntil[msg.sender][raider];
        return _launchRaid(colonyOf[_syncSeason()][raider], soldiers, commitment, true);
    }

    /// @notice Whether `defender` can still avenge a raid won by `raider`, and until when.
    function avengeAvailable(address defender, address raider) external view returns (bool, uint64 expiresAt) {
        expiresAt = avengeUntil[defender][raider];
        return (expiresAt != 0 && block.timestamp <= expiresAt, expiresAt);
    }

    function _launchRaid(uint64 defenderId, uint32 soldiers, bytes32 commitment, bool isAvenge)
        internal
        returns (uint256 raidId)
    {
        (uint64 id, Colony storage c) = _myAliveColony();
        if (defenderId == id) revert CannotRaidSelf();
        Colony storage d = colonies[defenderId];
        if (_status(d, seasonNumber) != Status.Alive) revert NotAlive();
        if (c.workers < MIN_RAID_WORKERS) revert TooFewWorkers();
        if (uint256(d.workers) * 2 < c.workers || d.workers > uint256(c.workers) * 2) revert OutOfRange();
        if (block.timestamp < d.shieldUntil) revert TargetShielded();
        if (d.openIncoming >= MAX_OPEN_INCOMING) revert TargetBusy();
        if (!isAvenge && !_ready(c.lastRaidLaunch, config.raidCooldown)) revert NotReady();
        if (soldiers == 0 || uint256(soldiers) * 100 > uint256(_idle(c)) * MAX_SOLDIER_PCT) revert BadSoldiers();
        if (_hasUncollected(id)) revert CollectFirst();

        raidId = nextRaidId(id);
        c.raidNonce += 1;
        if (!isAvenge) c.lastRaidLaunch = uint64(block.timestamp);
        c.soldiersOut += soldiers;
        d.openIncoming += 1;

        Raid storage r = raids[raidId];
        r.raider = id;
        r.defender = defenderId;
        r.soldiers = soldiers;
        r.status = RaidStatus.Sealed;
        r.launchedAt = uint64(block.timestamp);
        r.commitment = commitment;

        _addActive(id, raidId);
        _addActive(defenderId, raidId);
        emit RaidLaunched(
            raidId, id, defenderId, c.owner, d.owner, soldiers, uint64(block.timestamp + config.guardWindow), isAvenge
        );
    }

    /// @notice The defender may guard one resource once, during the guard window.
    function guard(uint256 raidId, Resource resource) external {
        Raid storage r = raids[raidId];
        if (r.status != RaidStatus.Sealed) revert WrongStatus();
        if (colonies[r.defender].owner != msg.sender) revert NotDefender();
        if (block.timestamp >= uint256(r.launchedAt) + config.guardWindow) revert GuardWindowClosed();
        if (r.guard != Resource.None) revert AlreadyGuarded();
        if (resource != Resource.Leaves && resource != Resource.Sugar) revert BadResource();
        r.guard = resource;
        emit Guarded(raidId, r.defender, msg.sender, resource);
    }

    /// @notice After the guard window, the raider reveals the target. The raid is assigned the first
    ///         drand round published at least 30 seconds from now.
    function reveal(uint256 raidId, Resource target, bytes32 salt) external {
        Raid storage r = raids[raidId];
        if (r.status != RaidStatus.Sealed) revert WrongStatus();
        if (colonies[r.raider].owner != msg.sender) revert NotRaider();
        uint256 windowEnd = uint256(r.launchedAt) + config.guardWindow;
        if (block.timestamp < windowEnd) revert GuardWindowOpen();
        if (block.timestamp >= windowEnd + config.revealWindow) revert RevealWindowClosed();
        if (target != Resource.Leaves && target != Resource.Sugar) revert BadResource();
        if (commitmentFor(target, salt, raidId) != r.commitment) revert BadCommitment();

        uint64 round = DrandVerifier.firstRoundAtOrAfter(block.timestamp + ROUND_DELAY);
        r.target = target;
        r.round = round;
        r.status = RaidStatus.Revealed;
        emit Revealed(raidId, target, round, uint64(DrandVerifier.roundTime(round)));
    }

    /// @notice Anyone can settle a revealed raid with the drand signature for its assigned round.
    ///         The roll is keccak256(signature, raidId). The settler's gas is refunded by the treasury (capped).
    function settle(uint256 raidId, bytes calldata signature) external nonReentrant {
        uint256 gasStart = gasleft();
        Raid storage r = raids[raidId];
        if (r.status != RaidStatus.Revealed) revert WrongStatus();
        uint256 roundTime = DrandVerifier.roundTime(r.round);
        if (block.timestamp < roundTime) revert RoundNotPublished();
        if (block.timestamp >= roundTime + SETTLE_TIMEOUT) revert SettleExpired();
        if (!DrandVerifier.verifyRound(r.round, signature)) revert BadSignature();

        uint256 rand = uint256(keccak256(abi.encodePacked(signature, raidId)));
        r.status = RaidStatus.Settled;
        Result memory res = _resolve(raidId, r, rand);
        r.outcome = res.outcome;
        _removeActive(r.raider, raidId);
        _removeActive(r.defender, raidId);

        uint256 gasUsed = (gasStart - gasleft()) * SETTLE_REFUND_PCT / 100;
        uint256 refund;
        try treasury.refundSettle(msg.sender, gasUsed) returns (uint256 amt) {
            refund = amt;
        } catch {}
        emit RaidSettled(
            raidId,
            r.raider,
            r.defender,
            colonies[r.raider].owner,
            colonies[r.defender].owner,
            res.outcome,
            res.roll,
            res.lootRes,
            res.loot,
            res.lost,
            r.round,
            msg.sender,
            refund
        );
    }

    /// @dev Applies a raid's outcome. One random number decides the roll, the percentage and (when guarded)
    ///      which resource the defender takes.
    struct Result {
        Outcome outcome;
        uint256 roll;
        Resource lootRes;
        uint256 loot;
        uint32 lost;
    }

    function _resolve(uint256 raidId, Raid storage r, uint256 rand) internal returns (Result memory res) {
        Colony storage a = colonies[r.raider];
        Colony storage d = colonies[r.defender];
        bool aLive = !a.collapseMarked && a.owner != address(0);
        bool dLive = !d.collapseMarked && d.owner != address(0);
        if (aLive) _accrue(a);
        if (dLive) _accrue(d);
        if (d.openIncoming > 0) d.openIncoming -= 1;

        res.roll = rand % 100 + 1;
        uint256 pctRand = (rand / 100) % 1000;
        d.raidsFaced += 1;

        if (r.guard == r.target) {
            res.outcome = Outcome.Guarded;
            res.lost = r.soldiers / 2;
            if (aLive && dLive) {
                res.lootRes = (rand / 100_000) % 2 == 0 ? Resource.Leaves : Resource.Sugar;
                uint256 pct = 10 + pctRand % 6; // 10-15%
                res.loot = _move(a, d, res.lootRes, pct, type(uint256).max);
                d.guardWinsPending += 1;
            }
        } else {
            uint8 odds = r.guard == Resource.None ? config.winOddsUnguarded : config.winOddsGuardedOther;
            if (res.roll <= odds) {
                res.outcome = Outcome.RaiderWon;
                if (aLive && dLive) {
                    res.lootRes = r.target;
                    uint256 pct = 20 + pctRand % 11; // 20-30%
                    res.loot = _move(d, a, res.lootRes, pct, uint256(r.soldiers) * LOOT_CAP_PER_SOLDIER * RES);
                }
                if (aLive) a.raidWinsPending += 1;
                uint64 expires = uint64(block.timestamp + AVENGE_WINDOW);
                avengeUntil[d.owner][a.owner] = expires;
                emit AvengeGranted(d.owner, a.owner, raidId, expires);
            } else {
                res.outcome = Outcome.RaiderLost;
            }
        }
        if (res.outcome == Outcome.RaiderWon) {
            a.raidsWon += 1;
        } else {
            a.raidsLost += 1;
            d.raidsDefended += 1;
        }

        if (aLive) {
            a.soldiersOut -= r.soldiers;
            a.workers -= res.lost;
        }
    }

    /// @dev Moves pct% of `from`'s stock of `res` to `to`, capped at `cap` (RES units).
    function _move(Colony storage from, Colony storage to, Resource res, uint256 pct, uint256 cap)
        internal
        returns (uint256 amount)
    {
        if (res == Resource.Leaves) {
            amount = uint256(from.leaves) * pct / 100;
            if (amount > cap) amount = cap;
            from.leaves -= uint128(amount);
            to.leaves += uint128(amount);
        } else {
            amount = uint256(from.sugar) * pct / 100;
            if (amount > cap) amount = cap;
            from.sugar -= uint128(amount);
            to.sugar += uint128(amount);
        }
    }

    /// @notice Close a raid that ended without a drand roll: never revealed in time (soldiers lost),
    ///         or revealed but not settled within 48 h of its round (soldiers return). Anyone can call.
    function collect(uint256 raidId) external {
        Raid storage r = raids[raidId];
        Colony storage a = colonies[r.raider];
        uint32 lost;
        if (r.status == RaidStatus.Sealed) {
            Config storage cfg = config;
            if (block.timestamp < uint256(r.launchedAt) + cfg.guardWindow + cfg.revealWindow) {
                revert NothingToCollect();
            }
            r.status = RaidStatus.Failed;
            lost = r.soldiers;
        } else if (r.status == RaidStatus.Revealed) {
            if (block.timestamp < DrandVerifier.roundTime(r.round) + SETTLE_TIMEOUT) revert NothingToCollect();
            r.status = RaidStatus.Refunded;
        } else {
            revert NothingToCollect();
        }
        if (!a.collapseMarked) {
            a.soldiersOut -= r.soldiers;
            a.workers -= lost;
        }
        Colony storage d = colonies[r.defender];
        if (d.openIncoming > 0) d.openIncoming -= 1;
        _removeActive(r.raider, raidId);
        _removeActive(r.defender, raidId);
        emit RaidCollected(raidId, r.status, lost);
    }

    /// @dev True if any of the colony's raids has ended but is not yet settled or collected.
    function _hasUncollected(uint64 colonyId) internal view returns (bool) {
        uint256[] storage list = activeRaids[colonyId];
        Config storage cfg = config;
        for (uint256 i; i < list.length; ++i) {
            Raid storage r = raids[list[i]];
            if (r.status == RaidStatus.Sealed) {
                if (block.timestamp >= uint256(r.launchedAt) + cfg.guardWindow + cfg.revealWindow) return true;
            } else if (block.timestamp >= DrandVerifier.roundTime(r.round)) {
                return true; // revealed and its round is out: settle it first
            }
        }
        return false;
    }

    function _addActive(uint64 colonyId, uint256 raidId) internal {
        activeRaids[colonyId].push(raidId);
        activeIndex[raidId][colonyId] = activeRaids[colonyId].length;
    }

    function _removeActive(uint64 colonyId, uint256 raidId) internal {
        uint256 idx = activeIndex[raidId][colonyId];
        if (idx == 0) return;
        uint256[] storage list = activeRaids[colonyId];
        uint256 lastId = list[list.length - 1];
        list[idx - 1] = lastId;
        activeIndex[lastId][colonyId] = idx;
        list.pop();
        delete activeIndex[raidId][colonyId];
    }

    // ================================================================== views

    struct ColonyView {
        uint64 id;
        Status status;
        Colony data;
        uint256 pendingLeaves; // trail output not yet accrued (RES units)
        uint256 pendingSugar; // farm output not yet accrued (RES units)
        uint256 capacity;
        uint32 idle;
    }

    function getColony(uint64 colonyId) public view returns (ColonyView memory v) {
        Colony storage c = colonies[colonyId];
        v.id = colonyId;
        v.status = _status(c, currentSeason());
        v.data = c;
        uint256 dt = block.timestamp - c.lastAccrual;
        if (c.owner != address(0) && !c.collapseMarked) {
            v.pendingLeaves = dt * c.trailWorkers * PRODUCTION_PER_WORKER_SEC;
            v.pendingSugar = dt * c.farmWorkers * PRODUCTION_PER_WORKER_SEC;
            v.idle = _idle(c);
        }
        v.capacity = uint256(c.chambers) * WORKERS_PER_CHAMBER;
    }

    /// @notice Day of the season (1 = first day) on which `at` falls.
    function seasonDay(uint32 season, uint64 at) public view returns (uint32) {
        uint64 start = seasonStart[season];
        return at < start ? 1 : uint32((at - start) / 1 days) + 1;
    }

    /// @notice Everything the profile screen shows for `player`'s colony this season (all zero if none).
    struct Profile {
        uint64 colonyId;
        Status status;
        uint32 season;
        uint32 ants; // all workers, including assigned ones and soldiers out
        uint256 capacity;
        uint32 chambers;
        uint32 trails;
        uint32 farms;
        uint32 trailWorkers;
        uint32 farmWorkers;
        uint32 soldiersOut;
        uint32 freeAnts;
        uint256 leaves; // RES units, including trail output not yet collected
        uint256 sugar; // RES units, including farm output not yet collected
        uint256 score;
        uint64 foundedAt;
        uint32 foundedDay;
        uint32 raidsWon;
        uint32 raidsLost;
        uint32 raidsDefended;
        uint32 raidsFaced;
        uint64 fedUntil; // the queen starves after this
        uint64 shieldUntil;
        bool hasVoterPass;
    }

    function getProfile(address player) external view returns (Profile memory p) {
        uint32 s = currentSeason();
        p.season = s;
        p.hasVoterPass = hasVoterPass[player];
        uint64 id = colonyOf[s][player];
        if (id == 0) return p;
        ColonyView memory v = getColony(id);
        Colony memory c = v.data;
        p.colonyId = id;
        p.status = v.status;
        p.ants = c.workers;
        p.capacity = v.capacity;
        p.chambers = c.chambers;
        p.trails = c.trails;
        p.farms = c.farms;
        p.trailWorkers = c.trailWorkers;
        p.farmWorkers = c.farmWorkers;
        p.soldiersOut = c.soldiersOut;
        p.freeAnts = v.idle;
        p.leaves = c.leaves + v.pendingLeaves;
        p.sugar = c.sugar + v.pendingSugar;
        p.score = c.score;
        p.foundedAt = c.foundedAt;
        p.foundedDay = seasonDay(c.season, c.foundedAt);
        p.raidsWon = c.raidsWon;
        p.raidsLost = c.raidsLost;
        p.raidsDefended = c.raidsDefended;
        p.raidsFaced = c.raidsFaced;
        p.fedUntil = c.lastFed + uint64(STARVE_AFTER);
        p.shieldUntil = c.shieldUntil;
    }

    function getActiveRaids(uint64 colonyId) external view returns (uint256[] memory) {
        return activeRaids[colonyId];
    }

    /// @notice Used by SeasonPot: a colony's season, score, whether it was fed twice, and whether it qualifies
    ///         (fed at least twice and queen fed within 72 h of the season's end).
    function colonyResult(uint64 colonyId)
        external
        view
        returns (uint32 season, uint256 score, bool fedTwice, bool qualifies)
    {
        Colony storage c = colonies[colonyId];
        season = c.season;
        score = c.score;
        fedTwice = c.feedCount >= 2;
        uint256 end = seasonEnd(season);
        qualifies = fedTwice && !c.collapseMarked && uint256(c.lastFed) + STARVE_AFTER >= end;
    }

    // ================================================================== locked colony NFT

    /// @dev A colony NFT is minted at founding and cannot move between wallets, so nobody can buy their way
    ///      into a season's pot. Minting (from = 0) and burning (to = 0) are allowed; this contract never burns.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    /// @notice Placeholder for the post-hackathon Season NFT unlock (docs/ROADMAP.md, "Season NFTs"): colonies
    ///         alive at a season's end become tradable. Not built yet, so it always reverts and nothing can unlock.
    function unlockSeasonNfts(uint32) external view onlyOwner {
        revert NotYetAvailable();
    }
}
