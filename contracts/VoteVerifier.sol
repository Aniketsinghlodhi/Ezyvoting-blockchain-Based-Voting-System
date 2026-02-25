// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Ballot.sol";
import "./VoterRegistry.sol";

/**
 * @title VoteVerifier
 * @notice Provides vote verification capabilities without revealing the actual vote.
 *         Voters can prove they participated and verify their receipt
 *         without exposing who they voted for.
 *
 * PRIVACY GUARANTEES:
 *   - Receipt verification: proves participation without revealing choice
 *   - Commit verification: proves a commit was made without revealing content
 *   - Election integrity: verifies tallies match reveal count
 */
contract VoteVerifier {
    VoterRegistry public voterRegistry;

    struct VerificationResult {
        bool isRegisteredVoter;
        bool hasCommitted;
        bool hasRevealed;
        bool receiptValid;
        uint256 commitTimestamp;
        bytes32 receiptHash;
    }

    event VerificationPerformed(
        address indexed verifier,
        address indexed ballot,
        address indexed voter,
        bool receiptValid,
        uint256 timestamp
    );

    constructor(address _voterRegistry) {
        require(_voterRegistry != address(0), "VV: invalid registry");
        voterRegistry = VoterRegistry(_voterRegistry);
    }

    /**
     * @notice Verify a voter's participation in an election using their receipt.
     * @param _ballot       Address of the Ballot contract
     * @param _voter        Address of the voter to verify
     * @param _receiptHash  The receipt hash the voter received during commit
     */
    function verifyVoterReceipt(
        address _ballot,
        address _voter,
        bytes32 _receiptHash
    ) external returns (VerificationResult memory result) {
        Ballot ballot = Ballot(_ballot);

        (bool registered, bool active,,) = voterRegistry.getVoterInfo(_voter);

        result.isRegisteredVoter = registered && active;

        (
            bool hasCommitted,
            bool hasRevealed,
            bytes32 storedReceipt,
            uint256 commitTimestamp
        ) = ballot.getVoterCommitStatus(_voter);

        result.hasCommitted = hasCommitted;
        result.hasRevealed = hasRevealed;
        result.commitTimestamp = commitTimestamp;
        result.receiptHash = storedReceipt;
        result.receiptValid = (storedReceipt == _receiptHash && _receiptHash != bytes32(0));

        emit VerificationPerformed(msg.sender, _ballot, _voter, result.receiptValid, block.timestamp);
        return result;
    }

    /**
     * @notice Verify election integrity: total reveals should match sum of candidate votes.
     * @param _ballot Address of the Ballot contract
     */
    function verifyElectionIntegrity(address _ballot)
        external
        view
        returns (
            bool isIntegrous,
            uint256 totalReveals,
            uint256 totalCandidateVotes,
            uint256 totalCommits
        )
    {
        Ballot ballot = Ballot(_ballot);

        (,,,,totalCommits, totalReveals,,,,, ) = ballot.getElectionInfo();

        Ballot.Candidate[] memory candidateList = ballot.getAllCandidates();
        totalCandidateVotes = 0;
        for (uint256 i = 0; i < candidateList.length; i++) {
            totalCandidateVotes += candidateList[i].voteCount;
        }

        isIntegrous = (totalReveals == totalCandidateVotes);
        return (isIntegrous, totalReveals, totalCandidateVotes, totalCommits);
    }

    /**
     * @notice Quick check: did a specific voter participate in an election?
     */
    function didVoterParticipate(address _ballot, address _voter)
        external
        view
        returns (bool committed, bool revealed)
    {
        Ballot ballot = Ballot(_ballot);
        (committed, revealed,,) = ballot.getVoterCommitStatus(_voter);
    }

    /**
     * @notice Get a summary of election results (only after tally phase).
     * @param _ballot Address of the Ballot contract
     */
    function getElectionSummary(address _ballot)
        external
        view
        returns (
            string memory name,
            uint256 totalVoters,
            uint256 totalRevealed,
            uint256 candidateCount,
            bool finalized,
            bool cancelled
        )
    {
        Ballot ballot = Ballot(_ballot);
        (
            ,
            string memory eName,
            ,
            ,
            ,
            uint256 reveals,
            uint256 candCount,
            ,
            bool isCancelled,
            bool isFinalized,

        ) = ballot.getElectionInfo();

        return (eName, ballot.getTotalCommitters(), reveals, candCount, isFinalized, isCancelled);
    }

    /**
     * @notice Compute a commit hash for client-side use.
     *         The voter creates hash(candidateId, secret) before submitting.
     */
    function computeCommitHash(uint256 _candidateId, bytes32 _secret)
        external
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(_candidateId, _secret));
    }
}
