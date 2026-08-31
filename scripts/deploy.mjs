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
contract BillReceiver {
  address public owner;
  string public billId;
  event BillPaid(address indexed payer, uint256 amount, uint256 timestamp);
  constructor(string memory _billId) { owner = msg.sender; billId = _billId; }
  receive() external payable { emit BillPaid(msg.sender, msg.value, block.timestamp); }
  function withdraw() external {
    require(msg.sender == owner, "not owner");
    (bool ok, ) = payable(owner).call{value: address(this).balance}("");
    require(ok, "withdraw failed");
  }
}`;

const input = {
  language: 'Solidity',
  sources: { 'BillReceiver.sol': { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
if (output.errors) {
  const fatal = output.errors.filter(e => e.severity === 'error');
  if (fatal.length) { console.error(fatal); process.exit(1); }
}
const artifact = output.contracts['BillReceiver.sol'].BillReceiver;
const bytecode = '0x' + artifact.evm.bytecode.object;
const abi = artifact.abi;

const pk = process.env.DEPLOYER_PK;
if (!pk) { console.error('missing DEPLOYER_PK'); process.exit(1); }
const account = privateKeyToAccount(pk.startsWith('0x') ? pk : '0x' + pk);
console.log('deployer:', account.address);

const wallet = createWalletClient({ account, chain: arc, transport: http() });
const pub = createPublicClient({ chain: arc, transport: http() });

const bal = await pub.getBalance({ address: account.address });
console.log('balance (raw):', bal.toString(), '=>', formatUnits(bal, 6), 'USDC (if 6dp)');

const bills = ['electric','water','internet','phone','netflix','spotify','steam','google','apple'];
const results = {};
for (const id of bills) {
  try {
    const hash = await wallet.deployContract({ abi, bytecode, args: [id] });
    console.log(id, 'tx:', hash);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    results[id] = receipt.contractAddress;
    console.log(id, '=>', receipt.contractAddress, 'status:', receipt.status);
  } catch (e) {
    console.error(id, 'FAILED:', e.shortMessage || e.message);
    results[id] = null;
  }
}
console.log('---RESULTS---');
console.log(JSON.stringify(results, null, 2));
