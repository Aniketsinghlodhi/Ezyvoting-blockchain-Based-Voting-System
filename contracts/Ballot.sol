// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./VoterRegistry.sol";

/**
 * @title Ballot
 * @notice Manages a single election with commit-reveal voting scheme.
 *
 * COMMIT-REVEAL FLOW:
 *   1. Commit Phase: voter submits hash(candidateId, secret) — vote is hidden
 *   2. Reveal Phase: voter reveals candidateId + secret — contract verifies hash
 *   3. Tally Phase: results computed from verified reveals
 *
 * This prevents front-running, ensures privacy during voting,
 * and provides verifiable results afterward.
 */
contract Ballot {
    // --- Types ---
    enum Phase { COMMIT, REVEAL, TALLY }

    struct Candidate {
        uint256 id;
        string name;
        string party;
        uint256 voteCount;
    }

    struct VoteCommit {
        bytes32 commitHash;
        bool hasCommitted;
        bool hasRevealed;
        uint256 revealedCandidateId;
        uint256 commitTimestamp;
        bytes32 receiptHash;      // voter receipt for verification
    }

    // --- State ---
    uint256 public electionId;
    string public electionName;
    VoterRegistry public voterRegistry;
    address public admin;
    uint256 public constituencyId;    // 0 = general election (all constituencies)

    uint256 public commitDeadline;
    uint256 public revealDeadline;
    bool public isCancelled;
    bool public isFinalized;

    Candidate[] public candidates;
    mapping(address => VoteCommit) private commits;
    address[] private commitAddresses;  // for enumeration

    uint256 public totalCommits;
    uint256 public totalReveals;

    // --- Events ---
    event VoteCommitted(address indexed voter, bytes32 receiptHash, uint256 timestamp);
    event VoteRevealed(address indexed voter, uint256 timestamp);
    event ElectionFinalized(uint256 totalVotes, uint256 timestamp);
    event ElectionCancelled(string reason, uint256 timestamp);

    // --- Modifiers ---
    modifier onlyAdmin() {
        require(msg.sender == admin, "Ballot: only admin");
        _;
    }

    modifier inPhase(Phase _phase) {
        require(currentPhase() == _phase, "Ballot: wrong phase");
        _;
    }

    modifier notCancelled() {
        require(!isCancelled, "Ballot: election cancelled");
        _;
    }

    constructor(
        uint256 _electionId,
        string memory _name,
        address _voterRegistry,
        uint256 _commitDeadline,
        uint256 _revealDeadline,
        string[] memory _candidateNames,
        string[] memory _candidateParties,
        uint256 _constituencyId,
        address _admin
    ) {
        electionId = _electionId;
        electionName = _name;
        voterRegistry = VoterRegistry(_voterRegistry);
        commitDeadline = _commitDeadline;
        revealDeadline = _revealDeadline;
        constituencyId = _constituencyId;
        admin = _admin;

        for (uint256 i = 0; i < _candidateNames.length; i++) {
            candidates.push(Candidate({
                id: i + 1,
                name: _candidateNames[i],
                party: _candidateParties[i],
                voteCount: 0
            }));
        }
    }

    // --- Core Functions ---

    /**
     * @notice Phase 1: Commit a hidden vote.
     * @param _commitHash  keccak256(abi.encodePacked(candidateId, secret))
     *                     where secret is a random bytes32 chosen by the voter
     */
    function commitVote(bytes32 _commitHash) external inPhase(Phase.COMMIT) notCancelled {
        require(_commitHash != bytes32(0), "Ballot: empty hash");
        require(!commits[msg.sender].hasCommitted, "Ballot: already committed");

        // Check voter eligibility
        require(voterRegistry.isEligible(msg.sender), "Ballot: not eligible");

        // If constituency-specific, check voter belongs to this constituency
        if (constituencyId > 0) {
            require(
                voterRegistry.getVoterConstituency(msg.sender) == constituencyId,
                "Ballot: wrong constituency"
            );
        }

        // Generate receipt hash for the voter to verify later
        bytes32 receiptHash = keccak256(abi.encodePacked(
            msg.sender,
            _commitHash,
            block.timestamp,
            electionId
        ));

        commits[msg.sender] = VoteCommit({
            commitHash: _commitHash,
            hasCommitted: true,
            hasRevealed: false,
            revealedCandidateId: 0,
            commitTimestamp: block.timestamp,
            receiptHash: receiptHash
        });

        commitAddresses.push(msg.sender);
        totalCommits++;

        emit VoteCommitted(msg.sender, receiptHash, block.timestamp);
    }

    /**
     * @notice Phase 2: Reveal your vote by providing the original candidateId and secret.
     * @param _candidateId  The candidate the voter voted for
     * @param _secret       The random secret used during commit
     */
    function revealVote(uint256 _candidateId, bytes32 _secret) external inPhase(Phase.REVEAL) notCancelled {
        VoteCommit storage vc = commits[msg.sender];
        require(vc.hasCommitted, "Ballot: no commit found");
        require(!vc.hasRevealed, "Ballot: already revealed");
        require(_candidateId >= 1 && _candidateId <= candidates.length, "Ballot: invalid candidate");

        // Verify the commit hash matches
        bytes32 expectedHash = keccak256(abi.encodePacked(_candidateId, _secret));
        require(expectedHash == vc.commitHash, "Ballot: hash mismatch");

        vc.hasRevealed = true;
        vc.revealedCandidateId = _candidateId;
        candidates[_candidateId - 1].voteCount++;
        totalReveals++;

        emit VoteRevealed(msg.sender, block.timestamp);
    }

    /**
     * @notice Finalize the election after reveal phase ends. Anyone can call this.
     */
    function finalize() external {
        require(block.timestamp > revealDeadline, "Ballot: reveal not ended");
        require(!isFinalized, "Ballot: already finalized");
        require(!isCancelled, "Ballot: cancelled");

        isFinalized = true;
        emit ElectionFinalized(totalReveals, block.timestamp);
    }

    /**
     * @notice Admin can cancel the election in case of issues.
     */
    function cancelElection(string calldata _reason) external onlyAdmin notCancelled {
        isCancelled = true;
        emit ElectionCancelled(_reason, block.timestamp);
    }

    /**
     * @notice Extend the commit deadline (admin only, can only extend, not shorten).
     */
    function extendCommitDeadline(uint256 _newDeadline) external onlyAdmin {
        require(_newDeadline > commitDeadline, "Ballot: can only extend");
        require(_newDeadline < revealDeadline, "Ballot: must be before reveal");
        commitDeadline = _newDeadline;
    }

    /**
     * @notice Extend the reveal deadline (admin only).
     */
    function extendRevealDeadline(uint256 _newDeadline) external onlyAdmin {
        require(_newDeadline > revealDeadline, "Ballot: can only extend");
        revealDeadline = _newDeadline;
    }

    // --- View Functions ---

    function currentPhase() public view returns (Phase) {
        if (block.timestamp <= commitDeadline) return Phase.COMMIT;
        if (block.timestamp <= revealDeadline) return Phase.REVEAL;
        return Phase.TALLY;
    }

    function getCandidateCount() external view returns (uint256) {
        return candidates.length;
    }

    function getCandidate(uint256 _id)
        external
        view
        returns (uint256 id, string memory name, string memory party, uint256 voteCount)
    {
        require(_id >= 1 && _id <= candidates.length, "Ballot: invalid id");
        Candidate storage c = candidates[_id - 1];
        return (c.id, c.name, c.party, c.voteCount);
    }

    function getAllCandidates() external view returns (Candidate[] memory) {
        return candidates;
    }

    /**
     * @notice Get results (only meaningful after reveal phase).
     */
    function getResults() external view returns (Candidate[] memory) {
        require(
            block.timestamp > revealDeadline || isFinalized,
            "Ballot: results not available yet"
        );
        return candidates;
    }

    /**
     * @notice Get voter's commit status (without revealing the vote).
     */
    function getVoterCommitStatus(address _voter)
        external
        view
        returns (
            bool hasCommitted,
            bool hasRevealed,
            bytes32 receiptHash,
            uint256 commitTimestamp
        )
    {
        VoteCommit storage vc = commits[_voter];
        return (vc.hasCommitted, vc.hasRevealed, vc.receiptHash, vc.commitTimestamp);
    }

    /**
     * @notice Verify a voter's receipt hash.
     */
    function verifyReceipt(address _voter, bytes32 _receiptHash) external view returns (bool) {
        return commits[_voter].receiptHash == _receiptHash && _receiptHash != bytes32(0);
    }

    function getElectionInfo()
        external
        view
        returns (
            uint256 _electionId,
            string memory _name,
            uint256 _commitDeadline,
            uint256 _revealDeadline,
            uint256 _totalCommits,
            uint256 _totalReveals,
            uint256 _candidateCount,
            Phase _phase,
            bool _isCancelled,
            bool _isFinalized,
            uint256 _constituencyId
        )
    {
        return (
            electionId,
            electionName,
            commitDeadline,
            revealDeadline,
            totalCommits,
            totalReveals,
            candidates.length,
            currentPhase(),
            isCancelled,
            isFinalized,
            constituencyId
        );
    }

    function getTotalCommitters() external view returns (uint256) {
        return commitAddresses.length;
    }

    /**
     * @notice Helper: generate the commit hash off-chain or verify it on-chain.
     */
    function computeCommitHash(uint256 _candidateId, bytes32 _secret) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(_candidateId, _secret));
    }
}
