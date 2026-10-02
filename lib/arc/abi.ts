import { parseAbi } from 'viem';

export { erc20Abi } from 'viem';

export const memoAbi = parseAbi([
  'function memo(address target, bytes data, bytes32 memoId, bytes memoData)',
  'event Memo(address indexed sender, address indexed target, bytes32 callDataHash, bytes32 indexed memoId, bytes memo, uint256 memoIndex)',
]);

export const memoEvent = memoAbi[1];
