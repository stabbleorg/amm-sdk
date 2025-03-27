import BN from "bn.js";
import { PublicKey, TokenAmount } from "@solana/web3.js";
import { Vault } from "./vault";

export type PoolTokenData = {
  mint: PublicKey;
  decimals: number; // u8
  scalingUp: boolean;
  scalingFactor: BN; // u64
  balance: BN; // u64
};

export type PoolData = {
  owner: PublicKey;
  vault: PublicKey;
  mint: PublicKey;
  // authorityBump: number;
  isActive: boolean;
  swapFee: BN; // u64
  pendingOwner: PublicKey | null;
  maxSupply: BN; // u64
};

export type PoolToken = {
  mintAddress: PublicKey;
  balance: TokenAmount;
};

export interface Pool<T> {
  readonly address: PublicKey;

  readonly vault: Vault;

  data: T;

  get vaultAddress(): PublicKey;

  get ownerAddress(): PublicKey;

  get mintAddress(): PublicKey;

  get authorityAddress(): PublicKey;

  get swapFee(): number;

  get maxSupply(): number;

  get isActive(): boolean;

  get tokens(): PoolToken[];

  get balances(): number[];

  refreshData(updatedData: Partial<T>): void;

  getSpotPrice(tokenInAddress: PublicKey, tokenOutAddress: PublicKey): number;

  /**
   * Get estimated swap amount out given amount in
   * @param {PublicKey} tokenInAddress Token mint address being sold
   * @param {PublicKey} tokenOutAddress Token mint address being bought
   * @param {number} amountIn Token amount being sold
   * @returns {number} Estimated token amount out
   */
  getSwapAmountOut(tokenInAddress: PublicKey, tokenOutAddress: PublicKey, amountIn: number): number;

  /**
   * Get estimated post amount out given amount in and estimated swap amount out
   * @param {PublicKey} tokenInAddress Token mint address being sold
   * @param {PublicKey} tokenOutAddress Token mint address being bought
   * @param {number} amountIn Token amount being sold
   * @param {number} amountOut Estimated token amount bought
   * @returns {number} Estimated token amount out
   */
  getPostAmountOut(tokenInAddress: PublicKey, tokenOutAddress: PublicKey, amountIn: number, amountOut: number): number;

  /**
   * Get estimated withdrawal amounts given LP amount
   * @param {number} amountIn LP token amount being burnt
   * @param {number} totalSupply LP token supply
   * @param {PublicKey} tokenAddress Optional token mint address for single sided withdraw
   * @returns {number[]} Estimated token amounts out
   */
  getWithdrawalAmountsOut(amountIn: number, totalSupply: number, tokenAddress?: PublicKey): number[];

  /**
   * Get estimated withdrawal amounts given LP amount
   * @param {number[]} amountsIn token amounts being deposited
   * @param {number} totalSupply LP token supply
   * @param {PublicKey} tokenAddress Optional token mint address for single sided deposit
   * @returns {number} Estimated LP token amount out
   */
  getPoolTokenAmountOut(amountsIn: number[], totalSupply: number, tokenAddress?: PublicKey): number;
}
