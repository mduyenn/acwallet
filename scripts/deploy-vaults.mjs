import solc from 'solc';
import { createWalletClient, createPublicClient, http, defineChain, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const arc = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
});

const source = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract YieldVault {
  address public owner;
  string public strategyId;
  mapping(address => uint256) public deposits;
  uint256 public totalDeposited;
  event Deposited(address indexed user, uint256 amount, uint256 timestamp);
  event Withdrawn(address indexed user, uint256 amount);
  constructor(string memory _strategyId) { owner = msg.sender; strategyId = _strategyId; }
  function deposit() public payable {
    deposits[msg.sender] += msg.value;
    totalDeposited += msg.value;
    emit Deposited(msg.sender, msg.value, block.timestamp);
  }
  receive() external payable { deposit(); }
  function withdraw(uint256 amount) external {
    require(deposits[msg.sender] >= amount, "insufficient");
    deposits[msg.sender] -= amount;
    totalDeposited -= amount;
    (bool ok, ) = payable(msg.sender).call{value: amount}("");
    require(ok, "withdraw failed");
    emit Withdrawn(msg.sender, amount);
  }
}`;

const input = {
  language: 'Solidity',
  sources: { 'YieldVault.sol': { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const fatal = (output.errors || []).filter((e) => e.severity === 'error');
if (fatal.length) { console.error(fatal); process.exit(1); }
const artifact = output.contracts['YieldVault.sol'].YieldVault;
const bytecode = '0x' + artifact.evm.bytecode.object;
const abi = artifact.abi;

const pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!pk) { console.error('missing DEPLOYER_PRIVATE_KEY'); process.exit(1); }
const account = privateKeyToAccount(pk.startsWith('0x') ? pk : '0x' + pk);
console.log('deployer:', account.address);

const wallet = createWalletClient({ account, chain: arc, transport: http() });
const pub = createPublicClient({ chain: arc, transport: http() });
console.log('balance:', formatUnits(await pub.getBalance({ address: account.address }), 6), 'USDC');

const ids = ['aave-usdc', 'morpho-usdc', 'spark-dai', 'compound-usdc', 'pendle-fixed', 'arc-staking'];
const results = {};
for (const id of ids) {
  try {
    const hash = await wallet.deployContract({ abi, bytecode, args: [id] });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    results[id] = receipt.contractAddress;
    console.log(id, '=>', receipt.contractAddress, receipt.status);
  } catch (e) {
    console.error(id, 'FAILED:', e.shortMessage || e.message);
    results[id] = null;
  }
}
console.log('---RESULTS---');
console.log(JSON.stringify(results, null, 2));
