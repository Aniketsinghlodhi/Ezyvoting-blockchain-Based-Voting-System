const hre = require('hardhat');
require('dotenv').config();

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);
  console.log('Account balance:', (await hre.ethers.provider.getBalance(deployer.address)).toString());

  const EzyVoting = await hre.ethers.getContractFactory('EzyVoting');
  const ezy = await EzyVoting.deploy();
  await ezy.waitForDeployment();
  const contractAddress = await ezy.getAddress();
  console.log('EzyVoting deployed to:', contractAddress);

  // Write address to JSON (used by frontend & backend)
  const fs = require('fs');
  const output = { contractAddress, network: hre.network.name, deployedAt: new Date().toISOString() };
  fs.writeFileSync('contract-address.json', JSON.stringify(output, null, 2));
  console.log('Contract address saved to contract-address.json');

  // Also write plain text for legacy scripts
  fs.writeFileSync('deployed-address.txt', contractAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
