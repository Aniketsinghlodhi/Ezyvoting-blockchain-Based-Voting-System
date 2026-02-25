// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Ballot.sol";
import "./VoterRegistry.sol";

/**
 * @title ElectionFactory
 * @notice Creates and manages elections. Each election deploys a new Ballot contract.
 *         Supports constituency-based and general elections.
 */
contract ElectionFactory {
    address public owner;
    mapping(address => bool) public admins;
    VoterRegistry public voterRegistry;

    struct ElectionInfo {
        uint256 id;
        string name;
        string description;
        address ballotAddress;
        uint256 createdAt;
        address createdBy;
        ElectionType electionType;
    }

    enum ElectionType { GENERAL, CONSTITUENCY }

    ElectionInfo[] public elections;
    uint256 public nextElectionId = 1;

    // Events
    event ElectionCreated(
        uint256 indexed electionId,
        string name,
        address ballotAddress,
        uint256 commitDeadline,
        uint256 revealDeadline,
        address createdBy
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "EF: only owner");
        _;
    }

    modifier onlyAdmin() {
        require(admins[msg.sender] || msg.sender == owner, "EF: only admin");
        _;
    }

    constructor(address _voterRegistry) {
        require(_voterRegistry != address(0), "EF: invalid registry");
        owner = msg.sender;
        admins[msg.sender] = true;
        voterRegistry = VoterRegistry(_voterRegistry);
    }

    function addAdmin(address _admin) external onlyOwner {
        admins[_admin] = true;
    }

    /**
     * @notice Create a new election that deploys a Ballot contract.
     * @param _name             Election name
     * @param _description      Election description
     * @param _commitDeadline   Timestamp when commit phase ends
     * @param _revealDeadline   Timestamp when reveal phase ends (must be after commit)
     * @param _candidateNames   Array of candidate names
     * @param _candidateParties Array of candidate party names
     * @param _constituencyId   0 for general election, >0 for constituency-specific
     * @param _electionType     GENERAL or CONSTITUENCY
     */
    function createElection(
        string calldata _name,
        string calldata _description,
        uint256 _commitDeadline,
        uint256 _revealDeadline,
        string[] calldata _candidateNames,
        string[] calldata _candidateParties,
        uint256 _constituencyId,
        ElectionType _electionType
    ) external onlyAdmin returns (uint256 electionId, address ballotAddress) {
        require(bytes(_name).length > 0, "EF: empty name");
        require(_commitDeadline > block.timestamp, "EF: commit deadline must be future");
        require(_revealDeadline > _commitDeadline, "EF: reveal must be after commit");
        require(_candidateNames.length > 0, "EF: need candidates");
        require(_candidateNames.length == _candidateParties.length, "EF: name/party mismatch");

        electionId = nextElectionId++;

        // Deploy a new Ballot contract for this election
        Ballot ballot = new Ballot(
            electionId,
            _name,
            address(voterRegistry),
            _commitDeadline,
            _revealDeadline,
            _candidateNames,
            _candidateParties,
            _constituencyId,
            msg.sender
        );

        ballotAddress = address(ballot);

        elections.push(ElectionInfo({
            id: electionId,
            name: _name,
            description: _description,
            ballotAddress: ballotAddress,
            createdAt: block.timestamp,
            createdBy: msg.sender,
            electionType: _electionType
        }));

        emit ElectionCreated(
            electionId,
            _name,
            ballotAddress,
            _commitDeadline,
            _revealDeadline,
            msg.sender
        );

        return (electionId, ballotAddress);
    }

    // --- View functions ---

    function getElectionCount() external view returns (uint256) {
        return elections.length;
    }

    function getElection(uint256 _index)
        external
        view
        returns (
            uint256 id,
            string memory name,
            string memory description,
            address ballotAddress,
            uint256 createdAt,
            address createdBy,
            ElectionType electionType
        )
    {
        require(_index < elections.length, "EF: invalid index");
        ElectionInfo storage e = elections[_index];
        return (e.id, e.name, e.description, e.ballotAddress, e.createdAt, e.createdBy, e.electionType);
    }

    function getElectionByBallot(address _ballot) external view returns (uint256) {
        for (uint256 i = 0; i < elections.length; i++) {
            if (elections[i].ballotAddress == _ballot) return elections[i].id;
        }
        revert("EF: ballot not found");
    }

    function getAllElections() external view returns (ElectionInfo[] memory) {
        return elections;
    }
}
