import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { SafeAmount } from "@stabbleorg/anchor-contrib";
import { Pool, PoolData, PoolToken, PoolTokenData } from "./base-pool";
import { Vault } from "./vault";
import { STABLE_SWAP_ID } from "../programs";
import { BasicMath, StableMath } from "../utils";

export type StablePoolTokenData = PoolTokenData;

export type StablePoolData = PoolData & {
  ampInitialFactor: number; // u16
  ampTargetFactor: number; // u16
  rampStartTs: BN; // i64
  rampStopTs: BN; // i64
  tokens: StablePoolTokenData[];
};

export class StablePool implements Pool<StablePoolData> {
  static POOL_TOKEN_DECIMALS = 9;
  static POOL_TOKEN_SIZE = 32 + 1 + 1 + 8 + 8 + 8;

  static MIN_AMP = 1;
  static MAX_AMP = 8000;

  static MIN_SWAP_FEE = 0.000001;
  static MAX_SWAP_FEE = 0.01;

  static MAX_TOKENS = 5;

  data: StablePoolData;

  constructor(
    readonly vault: Vault,
    readonly address: PublicKey,
    data: StablePoolData,
  ) {
    if (!vault.address.equals(data.vault)) throw Error("Vault address does not match");
    this.data = data;
  }

  get vaultAddress(): PublicKey {
    return this.data.vault;
  }

  get ownerAddress(): PublicKey {
    return this.data.owner;
  }

  get mintAddress(): PublicKey {
    return this.data.mint;
  }

  get authorityAddress(): PublicKey {
    return StablePool.getAuthorityAddress(this.address);
  }

  get amplification(): number {
    const currentTs = new Date().getTime() / 1000;

    if (currentTs <= this.data.rampStartTs.toNumber()) return this.data.ampInitialFactor;
    if (currentTs >= this.data.rampStopTs.toNumber()) return this.data.ampTargetFactor;

    const rampElapsed = currentTs - this.data.rampStartTs.toNumber();
    const rampDuration = this.data.rampStopTs.toNumber() - this.data.rampStartTs.toNumber();
    if (this.data.ampInitialFactor <= this.data.ampTargetFactor) {
      const ampOffset = ((this.data.ampTargetFactor - this.data.ampInitialFactor) * rampElapsed) / rampDuration;
      return this.data.ampInitialFactor + ampOffset;
    } else {
      const ampOffset = ((this.data.ampInitialFactor - this.data.ampTargetFactor) * rampElapsed) / rampDuration;
      return this.data.ampInitialFactor - ampOffset;
    }
  }

  get swapFee(): number {
    return SafeAmount.toNano(this.data.swapFee);
  }

  get isActive(): boolean {
    return this.data.isActive;
  }

  get tokens(): PoolToken[] {
    return this.data.tokens.map((token) => {
      const balance = token.scalingUp ? token.balance.div(token.scalingFactor) : token.balance.mul(token.scalingFactor);
      return {
        mintAddress: token.mint,
        balance: {
          amount: balance.toString(),
          decimals: token.decimals,
          uiAmount: SafeAmount.toUiAmount(balance, token.decimals),
          uiAmountString: SafeAmount.toUiAmountString(balance, token.decimals),
        },
      };
    });
  }

  get balances(): number[] {
    return this.tokens.map((token) => token.balance.uiAmount!);
  }

  refreshData(updatedData: Partial<StablePoolData>) {
    if (updatedData.tokens !== undefined) {
      const tokens = this.data.tokens.map((token, index) => ({
        ...token,
        balance: updatedData.tokens![index].balance,
      }));
      delete updatedData.tokens;
      this.data = { ...this.data, ...updatedData, tokens };
    } else {
      this.data = { ...this.data, ...updatedData };
    }
  }

  getSpotPrice(tokenInAddress: PublicKey, tokenOutAddress: PublicKey): number {
    const tokenInIndex = this.tokens.findIndex((token) => token.mintAddress.equals(tokenInAddress));
    if (tokenInIndex === -1) return 0;
    const tokenOutIndex = this.tokens.findIndex((token) => token.mintAddress.equals(tokenOutAddress));
    if (tokenOutIndex === -1) return 0;

    const balances = this.data.tokens.map((token) => SafeAmount.toNano(token.balance));

    const balanceRatio = StableMath.calcSpotPrice(balances, this.amplification, tokenInIndex, tokenOutIndex);

    const tokenIn = this.data.tokens[tokenInIndex];
    const tokenOut = this.data.tokens[tokenOutIndex];

    const scalingFactorIn = tokenIn.scalingFactor.toNumber();
    const scalingFactorOut = tokenOut.scalingFactor.toNumber();

    const scalingRatio =
      (tokenOut.scalingUp ? 1 / scalingFactorOut : scalingFactorOut) /
      (tokenIn.scalingUp ? 1 / scalingFactorIn : scalingFactorIn);

    const price = balanceRatio * scalingRatio;

    if (tokenIn.decimals === tokenOut.decimals) return price;

    const decimalRatio = 10 ** (tokenIn.decimals - tokenOut.decimals);
    return price * decimalRatio;
  }

  getSwapAmountOut(tokenInAddress: PublicKey, tokenOutAddress: PublicKey, amountIn: number): number {
    const tokenInIndex = this.tokens.findIndex((token) => token.mintAddress.equals(tokenInAddress));
    if (tokenInIndex === -1) return 0;
    const tokenOutIndex = this.tokens.findIndex((token) => token.mintAddress.equals(tokenOutAddress));
    if (tokenOutIndex === -1) return 0;

    const balances = this.data.tokens.map((token) => SafeAmount.toNano(token.balance));

    const tokenIn = this.data.tokens[tokenInIndex];
    const u64AmountIn = SafeAmount.toU64Amount(amountIn, tokenIn.decimals);
    const balanceIn = SafeAmount.toNano(
      tokenIn.scalingUp ? u64AmountIn.mul(tokenIn.scalingFactor) : u64AmountIn.div(tokenIn.scalingFactor),
    );

    const balanceOut = StableMath.calcOutGivenIn(
      balances,
      this.amplification,
      tokenInIndex,
      tokenOutIndex,
      balanceIn,
      this.swapFee,
    );

    if (balanceOut < 0) return 0;

    const tokenOut = this.data.tokens[tokenOutIndex];
    const u64BalanceOut = SafeAmount.toGiga(balanceOut);
    const amountOut = SafeAmount.toUiAmount(
      tokenOut.scalingUp ? u64BalanceOut.div(tokenOut.scalingFactor) : u64BalanceOut.mul(tokenOut.scalingFactor),
      tokenOut.decimals,
    );

    return amountOut;
  }

  getPostAmountOut(tokenInAddress: PublicKey, tokenOutAddress: PublicKey, amountIn: number, amountOut: number): number {
    const tokenInIndex = this.tokens.findIndex((token) => token.mintAddress.equals(tokenInAddress));
    const tokenOutIndex = this.tokens.findIndex((token) => token.mintAddress.equals(tokenOutAddress));

    if (tokenInIndex === -1 || tokenOutIndex === -1) {
      return 0;
    }

    const tokenIn = this.data.tokens[tokenInIndex];
    const u64AmountIn = SafeAmount.toU64Amount(amountIn, tokenIn.decimals);
    const balanceIn = tokenIn.scalingUp
      ? u64AmountIn.mul(tokenIn.scalingFactor)
      : u64AmountIn.div(tokenIn.scalingFactor);

    const tokenOut = this.data.tokens[tokenOutIndex];
    const u64AmountOut = SafeAmount.toU64Amount(amountOut, tokenOut.decimals);
    const balanceOut = tokenOut.scalingUp
      ? u64AmountOut.mul(tokenOut.scalingFactor)
      : u64AmountOut.div(tokenOut.scalingFactor);

    tokenIn.balance = tokenIn.balance.add(balanceIn);
    tokenOut.balance = tokenOut.balance.sub(balanceOut);

    const postAmountOut = this.getSwapAmountOut(tokenInAddress, tokenOutAddress, amountIn);

    tokenIn.balance = tokenIn.balance.sub(balanceIn);
    tokenOut.balance = tokenOut.balance.add(balanceOut);

    return postAmountOut;
  }

  getWithdrawalAmountsOut(amountIn: number, totalSupply: number, tokenAddress?: PublicKey): number[] {
    if (tokenAddress) {
      const tokenIndex = this.tokens.findIndex((token) => token.mintAddress.equals(tokenAddress));

      if (tokenIndex === -1) return [0];

      const balances = this.data.tokens.map((token) => SafeAmount.toNano(token.balance));
      const currentInvariant = StableMath.calcInvariant(balances, this.amplification);

      const balanceOut = StableMath.calcTokenOutGivenExactPoolTokenIn(
        balances,
        this.amplification,
        tokenIndex,
        amountIn,
        totalSupply,
        currentInvariant,
        this.swapFee,
      );

      const tokenOut = this.data.tokens[tokenIndex];
      const u64BalanceOut = SafeAmount.toGiga(balanceOut);
      const amountOut = SafeAmount.toUiAmount(
        tokenOut.scalingUp ? u64BalanceOut.div(tokenOut.scalingFactor) : u64BalanceOut.mul(tokenOut.scalingFactor),
        tokenOut.decimals,
      );

      return [amountOut];
    }

    return BasicMath.calcProportionalAmountsOut(this.balances, amountIn, totalSupply);
  }

  getPoolTokenAmountOut(amountsIn: number[], totalSupply: number, tokenAddress?: PublicKey): number {
    const balances = this.data.tokens.map((token) => SafeAmount.toNano(token.balance));
    const currentInvariant = StableMath.calcInvariant(balances, this.amplification);

    if (tokenAddress) {
      const tokenIndex = this.tokens.findIndex((token) => token.mintAddress.equals(tokenAddress));
      if (tokenIndex === -1) return 0;

      const amounts = Array(this.tokens.length).fill(0);

      const token = this.data.tokens[tokenIndex];
      const u64Amount = SafeAmount.toU64Amount(amountsIn[0], token.decimals);
      amounts[tokenIndex] = SafeAmount.toNano(
        token.scalingUp ? u64Amount.mul(token.scalingFactor) : u64Amount.div(token.scalingFactor),
      );

      return StableMath.calcPoolTokenOutGivenExactTokensIn(
        balances,
        this.amplification,
        amounts,
        totalSupply,
        currentInvariant,
        this.swapFee,
      );
    }

    const amounts = amountsIn.map((amountIn, index) => {
      const token = this.data.tokens[index];
      const u64Amount = SafeAmount.toU64Amount(amountIn, token.decimals);
      return SafeAmount.toNano(
        token.scalingUp ? u64Amount.mul(token.scalingFactor) : u64Amount.div(token.scalingFactor),
      );
    });

    return StableMath.calcPoolTokenOutGivenExactTokensIn(
      balances,
      this.amplification,
      amounts,
      totalSupply,
      currentInvariant,
      this.swapFee,
    );
  }

  static getAuthorityAddress(poolAddress: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from("pool_authority"), poolAddress.toBuffer()], STABLE_SWAP_ID)[0];
  }

  static getWithdrawAuthorityAddress(vaultAddress: PublicKey): PublicKey {
    return StablePool.getWithdrawAuthorityAddressAndBump(vaultAddress)[0];
  }

  static getWithdrawAuthorityAddressAndBump(vaultAddress: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("withdraw_authority"), vaultAddress.toBuffer()],
      STABLE_SWAP_ID,
    );
  }
}
