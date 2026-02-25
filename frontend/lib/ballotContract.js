/**
 * lib/ballotContract.js
 * Provides ethers.js helpers for the commit-reveal Ballot contracts.
 * Works alongside lib/contract.js (which handles the legacy EzyVoting contract).
 */

import { ethers } from "ethers";

// ── ABIs (human-readable) ──

const VOTER_REGISTRY_ABI = [
  "function owner() view returns (address)",
  "function admins(address) view returns (bool)",
  "function addAdmin(address _admin)",
  "function registerVoter(address _wallet, bytes32 _identityHash, uint256 _constituencyId)",
  "function deactivateVoter(address _wallet, string _reason)",
  "function reactivateVoter(address _wallet)",
  "function isEligible(address _wallet) view returns (bool)",
  "function getVoterConstituency(address _wallet) view returns (uint256)",
  "function getVoterInfo(address _wallet) view returns (bool registered, bool active, uint256 constituencyId, uint256 registeredAt)",
  "function getVoterCount() view returns (uint256)",
  "function verifyIdentity(address _wallet, bytes32 _identityHash) view returns (bool)",
  "function totalVoters() view returns (uint256)",
  "event VoterRegistered(address indexed wallet, uint256 constituencyId, uint256 timestamp)",
  "event VoterDeactivated(address indexed wallet, string reason)",
];

const ELECTION_FACTORY_ABI = [
  "function owner() view returns (address)",
  "function addAdmin(address _admin)",
  "function createElection(string _name, string _description, uint256 _commitDeadline, uint256 _revealDeadline, string[] _candidateNames, string[] _candidateParties, uint256 _constituencyId, uint8 _electionType) returns (uint256 electionId, address ballotAddress)",
  "function getElectionCount() view returns (uint256)",
  "function getElection(uint256 _index) view returns (uint256 id, string name, string description, address ballotAddress, uint256 createdAt, address createdBy, uint8 electionType)",
  "function getAllElections() view returns (tuple(uint256 id, string name, string description, address ballotAddress, uint256 createdAt, address createdBy, uint8 electionType)[])",
  "event ElectionCreated(uint256 indexed electionId, string name, address ballotAddress, uint256 commitDeadline, uint256 revealDeadline, address createdBy)",
];

const BALLOT_ABI = [
  "function commitVote(bytes32 _commitHash)",
  "function revealVote(uint256 _candidateId, bytes32 _secret)",
  "function finalize()",
  "function cancelElection(string _reason)",
  "function extendCommitDeadline(uint256 _newDeadline)",
  "function extendRevealDeadline(uint256 _newDeadline)",
  "function currentPhase() view returns (uint8)",
  "function getCandidateCount() view returns (uint256)",
  "function getCandidate(uint256 _id) view returns (uint256 id, string name, string party, uint256 voteCount)",
  "function getAllCandidates() view returns (tuple(uint256 id, string name, string party, uint256 voteCount)[])",
  "function getResults() view returns (tuple(uint256 id, string name, string party, uint256 voteCount)[])",
  "function getVoterCommitStatus(address _voter) view returns (bool hasCommitted, bool hasRevealed, bytes32 receiptHash, uint256 commitTimestamp)",
  "function verifyReceipt(address _voter, bytes32 _receiptHash) view returns (bool)",
  "function getElectionInfo() view returns (uint256 _electionId, string _name, uint256 _commitDeadline, uint256 _revealDeadline, uint256 _totalCommits, uint256 _totalReveals, uint256 _candidateCount, uint8 _phase, bool _isCancelled, bool _isFinalized, uint256 _constituencyId)",
  "function getTotalCommitters() view returns (uint256)",
  "function computeCommitHash(uint256 _candidateId, bytes32 _secret) pure returns (bytes32)",
  "event VoteCommitted(address indexed voter, bytes32 receiptHash, uint256 timestamp)",
  "event VoteRevealed(address indexed voter, uint256 timestamp)",
  "event ElectionFinalized(uint256 totalVotes, uint256 timestamp)",
];

const VOTE_VERIFIER_ABI = [
  "function verifyVoterReceipt(address _ballot, address _voter, bytes32 _receiptHash) returns (tuple(bool isRegisteredVoter, bool hasCommitted, bool hasRevealed, bool receiptValid, uint256 commitTimestamp, bytes32 receiptHash))",
  "function verifyElectionIntegrity(address _ballot) view returns (bool isIntegrous, uint256 totalReveals, uint256 totalCandidateVotes, uint256 totalCommits)",
  "function didVoterParticipate(address _ballot, address _voter) view returns (bool committed, bool revealed)",
  "function getElectionSummary(address _ballot) view returns (string name, uint256 totalVoters, uint256 totalRevealed, uint256 candidateCount, bool finalized, bool cancelled)",
  "function computeCommitHash(uint256 _candidateId, bytes32 _secret) pure returns (bytes32)",
];

// ── Address getters ──

export function getVoterRegistryAddress() {
  return process.env.NEXT_PUBLIC_VOTER_REGISTRY_ADDRESS || "";
}

export function getElectionFactoryAddress() {
  return process.env.NEXT_PUBLIC_ELECTION_FACTORY_ADDRESS || "";
}

export function getVoteVerifierAddress() {
  return process.env.NEXT_PUBLIC_VOTE_VERIFIER_ADDRESS || "";
}

// ── Provider / Signer ──

export function getProvider() {
  if (typeof window !== "undefined" && window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
  return new ethers.JsonRpcProvider(rpcUrl);
}

// ── Contract instances ──

export function getVoterRegistry(signerOrProvider) {
  const addr = getVoterRegistryAddress();
  if (!addr) return null;
  return new ethers.Contract(addr, VOTER_REGISTRY_ABI, signerOrProvider || getProvider());
}

export function getElectionFactory(signerOrProvider) {
  const addr = getElectionFactoryAddress();
  if (!addr) return null;
  return new ethers.Contract(addr, ELECTION_FACTORY_ABI, signerOrProvider || getProvider());
}

export function getBallot(ballotAddress, signerOrProvider) {
  return new ethers.Contract(ballotAddress, BALLOT_ABI, signerOrProvider || getProvider());
}

export function getVoteVerifier(signerOrProvider) {
  const addr = getVoteVerifierAddress();
  if (!addr) return null;
  return new ethers.Contract(addr, VOTE_VERIFIER_ABI, signerOrProvider || getProvider());
}

// ── Helpers ──

/**
 * Generate a cryptographically random secret for the commit-reveal scheme.
 * @returns {string} Hex-encoded bytes32 secret
 */
export function generateSecret() {
  return ethers.hexlify(ethers.randomBytes(32));
}

/**
 * Compute commit hash: keccak256(abi.encodePacked(candidateId, secret))
 * Matches the Solidity logic exactly.
 */
export function computeCommitHash(candidateId, secret) {
  return ethers.solidityPackedKeccak256(
    ["uint256", "bytes32"],
    [candidateId, secret]
  );
}

/**
 * Phase enum labels.
 */
export const PHASE_LABELS = ["COMMIT", "REVEAL", "TALLY"];

export function phaseLabel(phaseInt) {
  return PHASE_LABELS[phaseInt] || "UNKNOWN";
}
