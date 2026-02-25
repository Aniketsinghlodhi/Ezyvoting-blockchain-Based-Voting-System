// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title VoterRegistry
 * @notice Manages voter registration, eligibility, and one-person-one-wallet enforcement.
 *         Stores only hashed identity data on-chain for privacy.
 */
contract VoterRegistry {
    address public owner;
    mapping(address => bool) public admins;

    struct Voter {
        address wallet;
        bytes32 identityHash;     // keccak256(national ID / Aadhaar)
        uint256 constituencyId;
        bool isRegistered;
        bool isActive;            // can be deactivated for fraud
        uint256 registeredAt;
    }

    mapping(address => Voter) private voters;
    mapping(bytes32 => bool) private identityUsed; // prevent duplicate identity registration
    address[] private voterList;

    uint256 public totalVoters;

    // Events
    event VoterRegistered(address indexed wallet, uint256 constituencyId, uint256 timestamp);
    event VoterDeactivated(address indexed wallet, string reason);
    event VoterReactivated(address indexed wallet);
    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);

    modifier onlyOwner() {
        require(msg.sender == owner, "VR: only owner");
        _;
    }

    modifier onlyAdmin() {
        require(admins[msg.sender] || msg.sender == owner, "VR: only admin");
        _;
    }

    constructor() {
        owner = msg.sender;
        admins[msg.sender] = true;
    }

    function addAdmin(address _admin) external onlyOwner {
        require(_admin != address(0), "VR: zero address");
        admins[_admin] = true;
        emit AdminAdded(_admin);
    }

    function removeAdmin(address _admin) external onlyOwner {
        require(_admin != owner, "VR: cannot remove owner");
        admins[_admin] = false;
        emit AdminRemoved(_admin);
    }

    /**
     * @notice Register a voter. One identity hash maps to one wallet only.
     * @param _wallet         Voter's Ethereum wallet address
     * @param _identityHash   keccak256 hash of the voter's real-world identity
     * @param _constituencyId Constituency the voter belongs to
     */
    function registerVoter(
        address _wallet,
        bytes32 _identityHash,
        uint256 _constituencyId
    ) external onlyAdmin {
        require(_wallet != address(0), "VR: zero address");
        require(!voters[_wallet].isRegistered, "VR: wallet already registered");
        require(!identityUsed[_identityHash], "VR: identity already used");
        require(_constituencyId > 0, "VR: invalid constituency");

        voters[_wallet] = Voter({
            wallet: _wallet,
            identityHash: _identityHash,
            constituencyId: _constituencyId,
            isRegistered: true,
            isActive: true,
            registeredAt: block.timestamp
        });

        identityUsed[_identityHash] = true;
        voterList.push(_wallet);
        totalVoters++;

        emit VoterRegistered(_wallet, _constituencyId, block.timestamp);
    }

    function deactivateVoter(address _wallet, string calldata _reason) external onlyAdmin {
        require(voters[_wallet].isRegistered, "VR: not registered");
        voters[_wallet].isActive = false;
        emit VoterDeactivated(_wallet, _reason);
    }

    function reactivateVoter(address _wallet) external onlyAdmin {
        require(voters[_wallet].isRegistered, "VR: not registered");
        voters[_wallet].isActive = true;
        emit VoterReactivated(_wallet);
    }

    // --- View functions ---

    function isEligible(address _wallet) external view returns (bool) {
        Voter storage v = voters[_wallet];
        return v.isRegistered && v.isActive;
    }

    function getVoterConstituency(address _wallet) external view returns (uint256) {
        return voters[_wallet].constituencyId;
    }

    function getVoterInfo(address _wallet)
        external
        view
        returns (
            bool registered,
            bool active,
            uint256 constituencyId,
            uint256 registeredAt
        )
    {
        Voter storage v = voters[_wallet];
        return (v.isRegistered, v.isActive, v.constituencyId, v.registeredAt);
    }

    function getVoterCount() external view returns (uint256) {
        return totalVoters;
    }

    function getVoterAtIndex(uint256 _index) external view returns (address) {
        require(_index < voterList.length, "VR: index out of bounds");
        return voterList[_index];
    }

    function verifyIdentity(address _wallet, bytes32 _identityHash) external view returns (bool) {
        return voters[_wallet].identityHash == _identityHash;
    }
}
