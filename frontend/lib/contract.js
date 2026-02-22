import { ethers } from 'ethers';

const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  '0x9A676e781A523b5d0C0e43731313A708CB607508';

const ABI = [
  // Owner / admin
  "function owner() view returns (address)",
  "function admins(address) view returns (bool)",
  "function addAdmin(address _a)",

  // Constituency
  "function addConstituency(string name) returns (uint256)",
  "function constituencies(uint256) view returns (uint256 id, string name)",
  "function nextConstituencyId() view returns (uint256)",

  // Candidate
  "function registerCandidate(string name, string party, uint256 constituencyId) returns (uint256)",
  "function getCandidate(uint256 candidateId) view returns (tuple(uint256 id, string name, string party, uint256 constituencyId, uint256 voteCount))",
  "function getCandidatesByConstituency(uint256 constituencyId) view returns (tuple(uint256 id, string name, string party, uint256 constituencyId, uint256 voteCount)[])",
  "function nextCandidateId() view returns (uint256)",

  // Election
  "function createElection(string name, uint256 startTime, uint256 endTime) returns (uint256)",
  "function startElection(uint256 electionId)",
  "function endElection(uint256 electionId)",
  "function nextElectionId() view returns (uint256)",

  // Voter
  "function registerVoter(address _voterAddress, bytes32 _hashedVoterId, uint256 _constituencyId, string _name)",
  "function getVoterStatus(address _voter) view returns (bool registered, bool hasVoted, uint256 votedCandidateId, uint256 constituencyId)",

  // Voting
  "function vote(uint256 electionId, uint256 candidateId, bytes32 providedHashedVoterId)",

  // Results
  "function getResults(uint256 electionId, uint256 constituencyId) view returns (tuple(uint256 id, string name, string party, uint256 constituencyId, uint256 voteCount)[])",

  // Events
  "event VoterRegistered(address indexed voter, uint256 constituencyId)",
  "event CandidateRegistered(uint256 indexed candidateId, string name, uint256 constituencyId)",
  "event ConstituencyAdded(uint256 indexed constituencyId, string name)",
  "event ElectionStarted(uint256 indexed electionId, uint256 startTime, uint256 endTime)",
  "event ElectionEnded(uint256 indexed electionId)",
  "event VoteCast(address indexed voter, uint256 indexed electionId, uint256 indexed candidateId)"
];

/**
 * Returns a BrowserProvider backed by MetaMask (window.ethereum).
 * Falls back to a JsonRpcProvider using the configured RPC URL.
 */
export function getProvider() {
  if (typeof window !== 'undefined' && window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }
  const rpcUrl =
    process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.sepolia.org';
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Returns a Contract instance connected to the given signerOrProvider.
 * If nothing is passed it defaults to the read-only provider.
 */
export async function getContract(signerOrProvider) {
  const provider = signerOrProvider || getProvider();
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
}

/**
 * Hashes a voter ID the same way the contract expects: keccak256(abi.encodePacked(rawVoterId))
 */
export function hashVoterId(rawVoterId) {
  return ethers.keccak256(ethers.toUtf8Bytes(rawVoterId));
}
