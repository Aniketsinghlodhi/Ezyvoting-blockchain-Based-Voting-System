const { ethers } = require('ethers');

let provider, signer, contract;

// Minimal ABI for backend operations (registerVoter, views)
const CONTRACT_ABI = [
  "function owner() view returns (address)",
  "function admins(address) view returns (bool)",
  "function addAdmin(address _a)",
  "function addConstituency(string name) returns (uint256)",
  "function registerCandidate(string name, string party, uint256 constituencyId) returns (uint256)",
  "function registerVoter(address _voterAddress, bytes32 _hashedVoterId, uint256 _constituencyId, string _name)",
  "function createElection(string name, uint256 startTime, uint256 endTime) returns (uint256)",
  "function startElection(uint256 electionId)",
  "function endElection(uint256 electionId)",
  "function vote(uint256 electionId, uint256 candidateId, bytes32 providedHashedVoterId)",
  "function getCandidate(uint256 candidateId) view returns (tuple(uint256 id, string name, string party, uint256 constituencyId, uint256 voteCount))",
  "function getCandidatesByConstituency(uint256 constituencyId) view returns (tuple(uint256 id, string name, string party, uint256 constituencyId, uint256 voteCount)[])",
  "function getResults(uint256 electionId, uint256 constituencyId) view returns (tuple(uint256 id, string name, string party, uint256 constituencyId, uint256 voteCount)[])",
  "function getVoterStatus(address _voter) view returns (bool registered, bool hasVoted, uint256 votedCandidateId, uint256 constituencyId)",
  "function nextCandidateId() view returns (uint256)",
  "function nextConstituencyId() view returns (uint256)",
  "function nextElectionId() view returns (uint256)",
];

function init() {
  const rpc = process.env.RPC_URL;
  if (!rpc) {
    console.warn('[ethersService] RPC_URL not set — blockchain features disabled');
    return;
  }
  provider = new ethers.JsonRpcProvider(rpc);

  if (process.env.PRIVATE_KEY) {
    signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  }

  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (contractAddress) {
    contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer || provider);
    console.log(`[ethersService] Connected to contract ${contractAddress}`);
  } else {
    console.warn('[ethersService] CONTRACT_ADDRESS not set');
  }
}

function getContract() {
  if (!contract) init();
  return contract;
}

module.exports = { init, getContract };
