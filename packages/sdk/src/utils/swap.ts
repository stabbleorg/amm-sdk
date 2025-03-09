import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey, Signer, TransactionInstruction, TransactionSignature } from "@solana/web3.js";
import { FloatLike, TransactionArgs } from "@stabbleorg/anchor-contrib";
import { Pool, StablePool, StablePoolData, WeightedPool, WeightedPoolData } from "../accounts";
import { StableSwapContext, WeightedSwapContext } from "../programs";
import { createMemoInstruction } from "./memo";

export type BatchSwapRoute = {
  pool: Pool<StablePoolData | WeightedPoolData>;
  mintInAddress: PublicKey;
  mintOutAddress: PublicKey;
  amountOut: FloatLike;
};

export type SwapArgs = {
  pool: Pool<StablePoolData | WeightedPoolData>;
  mintInAddress: PublicKey;
  mintOutAddress: PublicKey;
  amountIn: FloatLike;
  minimumAmountOut: FloatLike;
  referrer?: string;
};

export type SwapInstructionArgs = {
  pool: Pool<StablePoolData | WeightedPoolData>;
  mintInAddress: PublicKey;
  mintOutAddress: PublicKey;
  tokenInAddress?: PublicKey;
  tokenOutAddress?: PublicKey;
  tokenInProgramId?: PublicKey;
  tokenOutProgramId?: PublicKey;
  amountIn?: FloatLike;
  minimumAmountOut?: FloatLike;
};

export class Swap {
  static async batch({
    weightedSwap,
    stableSwap,
    routes,
    amountIn,
    minimumAmountOut,
    referrer,
    priorityLevel,
    maxPriorityMicroLamports,
    altAccounts,
  }: TransactionArgs<{
    weightedSwap: WeightedSwapContext;
    stableSwap: StableSwapContext;
    routes: Omit<BatchSwapRoute, "amountOut">[];
    amountIn: FloatLike;
    minimumAmountOut: FloatLike;
    referrer?: string;
  }>): Promise<TransactionSignature> {
    if (!weightedSwap.walletAddress.equals(stableSwap.walletAddress)) throw Error("Singers does not match");

    // direct swap
    if (routes.length === 1) {
      const args: TransactionArgs<SwapArgs> = {
        pool: routes[0].pool,
        mintInAddress: routes[0].mintInAddress,
        mintOutAddress: routes[0].mintOutAddress,
        amountIn,
        minimumAmountOut,
        referrer,
        priorityLevel,
        altAccounts,
      };

      if (routes[0].pool instanceof StablePool) {
        return stableSwap.swap(args);
      } else if (routes[0].pool instanceof WeightedPool) {
        return weightedSwap.swap(args);
      } else {
        throw Error("Path not found");
      }
    }
    // 2-hop swap
    else if (routes.length === 2) {
      const signers: Signer[] = [];
      const instructions: TransactionInstruction[] = [];
      const closeInstructions: TransactionInstruction[] = [];

      if (referrer) instructions.push(createMemoInstruction(referrer));

      let tokenInAddress, tokenInProgramId;
      if (routes[0].mintInAddress.equals(NATIVE_MINT)) {
        tokenInProgramId = TOKEN_PROGRAM_ID;

        const keypair = Keypair.generate();
        signers.push(keypair);
        tokenInAddress = keypair.publicKey;
        instructions.push(
          ...weightedSwap.createTokenAccountInstructions(tokenInAddress),
          ...weightedSwap.transferWSOLInstructions(tokenInAddress, amountIn),
        );
        closeInstructions.push(weightedSwap.closeTokenAccountInstruction(tokenInAddress));
      }

      let tokenOutAddress, tokenOutProgramId;
      {
        const account = await weightedSwap.provider.connection.getAccountInfo(routes[0].mintOutAddress);
        tokenOutProgramId = account!.owner;

        const keypair = Keypair.generate();
        signers.push(keypair);
        tokenOutAddress = keypair.publicKey;
        instructions.push(
          ...weightedSwap.createTokenAccountInstructions(tokenOutAddress, routes[0].mintOutAddress, tokenOutProgramId),
        );
        closeInstructions.push(weightedSwap.closeTokenAccountInstruction(tokenOutAddress, tokenOutProgramId));
      }

      const args0: SwapInstructionArgs = {
        pool: routes[0].pool,
        mintInAddress: routes[0].mintInAddress,
        mintOutAddress: routes[0].mintOutAddress,
        amountIn,
        tokenInAddress,
        tokenOutAddress,
        tokenInProgramId,
        tokenOutProgramId,
      };

      if (routes[0].pool instanceof WeightedPool) {
        instructions.push(...(await weightedSwap.swapInstructions(args0)));
      } else if (routes[0].pool instanceof StablePool) {
        instructions.push(...(await stableSwap.swapInstructions(args0)));
      } else {
        throw Error("Path not found");
      }

      tokenInAddress = tokenOutAddress;
      tokenInProgramId = tokenOutProgramId;
      if (routes[1].mintOutAddress.equals(NATIVE_MINT)) {
        tokenOutProgramId = TOKEN_PROGRAM_ID;

        const keypair = Keypair.generate();
        signers.push(keypair);
        tokenOutAddress = keypair.publicKey;
        instructions.push(...weightedSwap.createTokenAccountInstructions(tokenOutAddress, routes[1].mintOutAddress));
        closeInstructions.push(weightedSwap.closeTokenAccountInstruction(tokenOutAddress));
      } else {
        tokenOutAddress = undefined;
        tokenOutProgramId = undefined;
      }

      const args1: SwapInstructionArgs = {
        pool: routes[1].pool,
        mintInAddress: routes[1].mintInAddress,
        mintOutAddress: routes[1].mintOutAddress,
        minimumAmountOut,
        tokenInAddress,
        tokenOutAddress,
        tokenInProgramId,
        tokenOutProgramId,
      };

      if (routes[1].pool instanceof WeightedPool) {
        instructions.push(...(await weightedSwap.swapInstructions(args1)));
      } else if (routes[1].pool instanceof StablePool) {
        instructions.push(...(await stableSwap.swapInstructions(args1)));
      } else {
        throw Error("Path not found");
      }

      return weightedSwap.sendSmartTransaction(
        [...instructions, ...closeInstructions],
        signers,
        altAccounts,
        priorityLevel,
        maxPriorityMicroLamports,
      );
    }
    // 3-hop swap
    else if (routes.length === 3) {
      const signers: Signer[] = [];
      const instructions: TransactionInstruction[] = [];
      const closeInstructions: TransactionInstruction[] = [];

      let shouldSplit = false;

      if (referrer) instructions.push(createMemoInstruction(referrer));

      let tokenInAddress, tokenInProgramId;
      if (routes[0].mintInAddress.equals(NATIVE_MINT)) {
        tokenInProgramId = TOKEN_PROGRAM_ID;

        const keypair = Keypair.generate();
        signers.push(keypair);
        tokenInAddress = keypair.publicKey;
        instructions.push(
          ...weightedSwap.createTokenAccountInstructions(tokenInAddress),
          ...weightedSwap.transferWSOLInstructions(tokenInAddress, amountIn),
        );
        closeInstructions.push(weightedSwap.closeTokenAccountInstruction(tokenInAddress));
        shouldSplit = true;
      }

      let tokenOutAddress, tokenOutProgramId;
      {
        const account = await weightedSwap.provider.connection.getAccountInfo(routes[0].mintOutAddress);
        tokenOutProgramId = account!.owner;

        const keypair = Keypair.generate();
        signers.push(keypair);
        tokenOutAddress = keypair.publicKey;
        instructions.push(
          ...weightedSwap.createTokenAccountInstructions(tokenOutAddress, routes[0].mintOutAddress, tokenOutProgramId),
        );
        closeInstructions.push(weightedSwap.closeTokenAccountInstruction(tokenOutAddress, tokenOutProgramId));
      }

      const args0: SwapInstructionArgs = {
        pool: routes[0].pool,
        mintInAddress: routes[0].mintInAddress,
        mintOutAddress: routes[0].mintOutAddress,
        amountIn,
        tokenInAddress,
        tokenOutAddress,
        tokenInProgramId,
        tokenOutProgramId,
      };

      if (routes[0].pool instanceof WeightedPool) {
        instructions.push(...(await weightedSwap.swapInstructions(args0)));
      } else if (routes[0].pool instanceof StablePool) {
        instructions.push(...(await stableSwap.swapInstructions(args0)));
      } else {
        throw Error("Path not found");
      }

      tokenInAddress = tokenOutAddress;
      tokenInProgramId = tokenOutProgramId;
      {
        const account = await weightedSwap.provider.connection.getAccountInfo(routes[1].mintOutAddress);
        tokenOutProgramId = account!.owner;

        const keypair = Keypair.generate();
        signers.push(keypair);
        tokenOutAddress = keypair.publicKey;
        instructions.push(
          ...weightedSwap.createTokenAccountInstructions(tokenOutAddress, routes[1].mintOutAddress, tokenOutProgramId),
        );
        closeInstructions.push(weightedSwap.closeTokenAccountInstruction(tokenOutAddress, tokenOutProgramId));
      }

      const args1: SwapInstructionArgs = {
        pool: routes[1].pool,
        mintInAddress: routes[1].mintInAddress,
        mintOutAddress: routes[1].mintOutAddress,
        tokenInAddress,
        tokenOutAddress,
        tokenInProgramId,
        tokenOutProgramId,
      };

      if (routes[1].pool instanceof WeightedPool) {
        instructions.push(...(await weightedSwap.swapInstructions(args1)));
      } else if (routes[1].pool instanceof StablePool) {
        instructions.push(...(await stableSwap.swapInstructions(args1)));
      } else {
        throw Error("Path not found");
      }

      tokenInAddress = tokenOutAddress;
      tokenInProgramId = tokenOutProgramId;
      if (routes[2].mintOutAddress.equals(NATIVE_MINT)) {
        const keypair = Keypair.generate();
        signers.push(keypair);
        tokenOutAddress = keypair.publicKey;
        instructions.push(...weightedSwap.createTokenAccountInstructions(tokenOutAddress, routes[2].mintOutAddress));
        closeInstructions.push(weightedSwap.closeTokenAccountInstruction(tokenOutAddress));
      } else {
        tokenOutAddress = undefined;
        tokenOutProgramId = undefined;
      }

      const args2: SwapInstructionArgs = {
        pool: routes[2].pool,
        mintInAddress: routes[2].mintInAddress,
        mintOutAddress: routes[2].mintOutAddress,
        minimumAmountOut,
        tokenInAddress,
        tokenOutAddress,
        tokenInProgramId,
        tokenOutProgramId,
      };
      if (routes[2].pool instanceof WeightedPool) {
        instructions.push(...(await weightedSwap.swapInstructions(args2)));
      } else if (routes[2].pool instanceof StablePool) {
        instructions.push(...(await stableSwap.swapInstructions(args2)));
      } else {
        throw Error("Path not found");
      }

      if (shouldSplit) {
        const signature = await weightedSwap.sendSmartTransaction(
          instructions,
          signers,
          altAccounts,
          priorityLevel,
          maxPriorityMicroLamports,
        );

        if (signature) {
          return weightedSwap.sendSmartTransaction(
            closeInstructions,
            [],
            altAccounts,
            priorityLevel,
            maxPriorityMicroLamports,
          );
        }

        return "";
      }

      return weightedSwap.sendSmartTransaction(
        [...instructions, ...closeInstructions],
        signers,
        altAccounts,
        priorityLevel,
        maxPriorityMicroLamports,
      );
    }
    // 4-hop swap
    else {
      throw Error("Path not supported");
    }
  }

  static searchRoutes({
    pools,
    mintInAddress,
    mintOutAddress,
    amountIn,
    maxDepth = 3,
    directRoutesOnly = false,
  }: {
    pools: Pool<StablePoolData | WeightedPoolData>[];
    mintInAddress: PublicKey;
    mintOutAddress: PublicKey;
    amountIn: number;
    maxDepth?: number;
    directRoutesOnly?: boolean;
  }): { routes: BatchSwapRoute[]; amountOut: number; spotPrice: number } {
    if (directRoutesOnly) maxDepth = 1;

    let routes: BatchSwapRoute[] = [];
    let amountOut = 0;

    // R0 routes
    const pools_R0 = pools
      .filter(
        (p) =>
          p.tokens.some((token) => token.mintAddress.equals(mintInAddress)) &&
          p.tokens.some((token) => token.mintAddress.equals(mintOutAddress)),
      )
      .sort(
        (p1, p2) =>
          p2.getSwapAmountOut(mintInAddress, mintOutAddress, amountIn) -
          p1.getSwapAmountOut(mintInAddress, mintOutAddress, amountIn),
      );
    if (pools_R0.length > 0) {
      const pool = pools_R0[0];
      amountOut = pool.getSwapAmountOut(mintInAddress, mintOutAddress, amountIn);
      routes = [{ pool, mintInAddress, mintOutAddress, amountOut }];
    }

    if (maxDepth > 1) {
      // R1 routes
      const pools_R1 = pools
        .filter((p) => pools_R0.map((r0) => !p.address.equals(r0.address)))
        .filter((p) => p.tokens.some((token) => token.mintAddress.equals(mintInAddress)));

      // R2 routes
      const pools_R2 = pools
        .filter((p) => pools_R0.map((r0) => !p.address.equals(r0.address)))
        .filter((p) => pools_R1.map((r1) => !p.address.equals(r1.address)));

      for (const r1 of pools_R1) {
        for (const t1 of r1.tokens.filter((t) => !t.mintAddress.equals(mintInAddress))) {
          const amountOut_R1 = r1.getSwapAmountOut(mintInAddress, t1.mintAddress, amountIn);

          for (const r2 of pools_R2) {
            for (const t2 of r2.tokens.filter((t) => !t.mintAddress.equals(t1.mintAddress))) {
              const amountOut_R2 = r2.getSwapAmountOut(t1.mintAddress, t2.mintAddress, amountOut_R1);

              if (t2.mintAddress.equals(mintOutAddress)) {
                if (amountOut_R2 > amountOut) {
                  routes = [
                    { pool: r1, mintInAddress, mintOutAddress: t1.mintAddress, amountOut: amountOut_R1 },
                    { pool: r2, mintInAddress: t1.mintAddress, mintOutAddress, amountOut: amountOut_R2 },
                  ];
                  amountOut = amountOut_R2;
                }
              } else if (maxDepth > 2) {
                // R3 routes
                const pools_R3 = pools_R2
                  .filter((p) => !p.address.equals(r2.address))
                  .filter(
                    (p) =>
                      p.tokens.some((t) => t.mintAddress.equals(t2.mintAddress)) &&
                      p.tokens.some((t) => t.mintAddress.equals(mintOutAddress)),
                  );
                for (const r3 of pools_R3) {
                  const amountOut_R3 = r3.getSwapAmountOut(t2.mintAddress, mintOutAddress, amountOut_R2);
                  if (amountOut_R3 > amountOut) {
                    routes = [
                      { pool: r1, mintInAddress, mintOutAddress: t1.mintAddress, amountOut: amountOut_R1 },
                      {
                        pool: r2,
                        mintInAddress: t1.mintAddress,
                        mintOutAddress: t2.mintAddress,
                        amountOut: amountOut_R2,
                      },
                      { pool: r3, mintInAddress: t2.mintAddress, mintOutAddress, amountOut: amountOut_R3 },
                    ];
                    amountOut = amountOut_R3;
                  }
                }
              }
            }
          }
        }
      }
    }

    const spotPrice = routes.reduce(
      (price, route) => price * route.pool.getSpotPrice(route.mintInAddress, route.mintOutAddress),
      1,
    );

    return { routes, amountOut, spotPrice };
  }
}
