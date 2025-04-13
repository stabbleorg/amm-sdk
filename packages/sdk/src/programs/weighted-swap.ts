import BN from "bn.js";
import { Program, Provider } from "@coral-xyz/anchor";
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as MPL_TOKEN_METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  AuthorityType,
  MintLayout,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMint2Instruction,
  createSetAuthorityInstruction,
  unpackMint,
} from "@solana/spl-token";
import {
  AccountMeta,
  Keypair,
  PublicKey,
  Signer,
  SystemProgram,
  TransactionInstruction,
  TransactionSignature,
} from "@solana/web3.js";
import {
  DataUpdatedEvent,
  SIMULATED_SIGNATURE,
  FloatLike,
  SafeAmount,
  TransactionArgs,
  WalletContext,
  TOKEN_MINT_RENT_FEE_LAMPORTS,
  AddressWithTransactionSignature,
} from "@stabbleorg/anchor-contrib";
import { AMM_VAULT_PROGRAM_ID } from "./vault";
import { Vault, WeightedPool, WeightedPoolData } from "../accounts";
import { SwapInstructionArgs, SwapArgs } from "../utils";
import { type WeightedSwap as IDLType } from "../generated/weighted_swap";
import IDL from "../generated/idl/weighted_swap.json";

/**
 * @deprecated Use `WEIGHTED_SWAP_PROGRAM_ID` instead.
 */
export const WEIGHTED_SWAP_ID = new PublicKey(IDL.address);
export const WEIGHTED_SWAP_PROGRAM_ID = new PublicKey(IDL.address);

export type WeightedSwapProgram = Program<IDLType>;

export class WeightedSwapContext<T extends Provider = Provider> extends WalletContext<T> {
  readonly program: WeightedSwapProgram;

  constructor(provider: T) {
    super(provider);
    this.program = new Program(IDL, provider);
  }

  async loadPool(address: PublicKey, vault?: Vault): Promise<WeightedPool> {
    const poolData = await this.program.account.pool.fetch(address);

    if (!vault) {
      const vaultData = await this.program.account.vault.fetch(poolData.vault);
      vault = new Vault(poolData.vault, vaultData);
    }

    return new WeightedPool(vault, address, poolData);
  }

  async loadPools(vault: Vault): Promise<WeightedPool[]> {
    const accounts = await this.program.account.pool.all([
      {
        memcmp: {
          offset: 40, // 8 + 32
          bytes: vault.address.toBase58(),
        },
      },
    ]);
    return accounts.map((data) => new WeightedPool(vault, data.publicKey, data.account));
  }

  async initialize({
    vault,
    keypair = Keypair.generate(),
    poolMintKP = Keypair.generate(),
    mintAddresses,
    maxCaps,
    weights,
    swapFee,
    name = "",
    symbol = "",
    uri = "",
    altAccounts,
    priorityLevel,
    maxPriorityMicroLamports,
    simulate,
  }: TransactionArgs<{
    vault: Vault;
    keypair?: Keypair;
    poolMintKP?: Keypair;
    mintAddresses: PublicKey[];
    maxCaps?: FloatLike[];
    weights: FloatLike[];
    swapFee: FloatLike;
    name?: string;
    symbol?: string;
    uri?: string;
  }>): Promise<AddressWithTransactionSignature> {
    // https://www.anchor-lang.com/docs/references/space#type-chart
    const size = this.program.account.pool.size + (4 + WeightedPool.POOL_TOKEN_SIZE * mintAddresses.length) + 8;
    const poolAuthorityAddress = WeightedPool.getAuthorityAddress(keypair.publicKey);
    const mintAccounts = await this.provider.connection.getMultipleAccountsInfo(mintAddresses);
    const mints = mintAccounts.map((account, index) => unpackMint(mintAddresses[index], account!, account!.owner));

    const [metadataAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), MPL_TOKEN_METADATA_PROGRAM_ID.toBytes(), poolMintKP.publicKey.toBytes()],
      MPL_TOKEN_METADATA_PROGRAM_ID,
    );

    const instructions: TransactionInstruction[] = [
      SystemProgram.createAccount({
        fromPubkey: this.walletAddress,
        newAccountPubkey: poolMintKP.publicKey,
        space: MintLayout.span,
        lamports: TOKEN_MINT_RENT_FEE_LAMPORTS,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(
        poolMintKP.publicKey,
        WeightedPool.POOL_TOKEN_DECIMALS,
        this.walletAddress,
        this.walletAddress,
      ),
      createCreateMetadataAccountV3Instruction(
        {
          metadata: metadataAddress,
          mint: poolMintKP.publicKey,
          mintAuthority: this.walletAddress,
          payer: this.walletAddress,
          updateAuthority: this.walletAddress,
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name,
              symbol,
              uri,
              sellerFeeBasisPoints: 0,
              creators: null,
              collection: null,
              uses: null,
            },
            isMutable: true,
            collectionDetails: null,
          },
        },
      ),
      createSetAuthorityInstruction(
        poolMintKP.publicKey,
        this.walletAddress,
        AuthorityType.MintTokens,
        poolAuthorityAddress,
      ),
      createSetAuthorityInstruction(poolMintKP.publicKey, this.walletAddress, AuthorityType.FreezeAccount, null),
      SystemProgram.createAccount({
        fromPubkey: this.walletAddress,
        newAccountPubkey: keypair.publicKey,
        space: size,
        lamports: await this.provider.connection.getMinimumBalanceForRentExemption(size),
        programId: this.program.programId,
      }),
      await this.program.methods
        .initialize(
          SafeAmount.toGiga(swapFee),
          weights.map((weight) => SafeAmount.toGiga(weight)),
          mints.map((mint, index) =>
            maxCaps ? SafeAmount.toU64Amount(maxCaps[index], mint.decimals) : new BN(mint.supply.toString()),
          ),
        )
        .accountsStrict({
          owner: this.walletAddress,
          mint: poolMintKP.publicKey,
          pool: keypair.publicKey,
          poolAuthority: poolAuthorityAddress,
          withdrawAuthority: vault.withdrawAuthorityAddress,
          vault: vault.address,
        })
        .remainingAccounts(mintAddresses.map((pubkey) => ({ isSigner: false, isWritable: false, pubkey })))
        .instruction(),
    ];

    const signature = await this.sendSmartTransaction(
      instructions,
      [keypair, poolMintKP],
      altAccounts,
      priorityLevel,
      maxPriorityMicroLamports,
      simulate,
    );

    return { address: keypair.publicKey, signature };
  }

  async deposit({
    pool,
    mintAddresses,
    amounts,
    minimumAmountOut = 0,
    preTxBuffers = [],
    altAccounts = [],
    priorityLevel,
    maxPriorityMicroLamports,
    simulate,
  }: TransactionArgs<{
    pool: WeightedPool;
    mintAddresses: PublicKey[];
    amounts: FloatLike[];
    minimumAmountOut?: FloatLike;
    preTxBuffers?: Buffer[];
  }>): Promise<TransactionSignature> {
    const instructions: TransactionInstruction[] = [];
    const signers: Signer[] = [];
    const userRemainingAccounts: AccountMeta[] = [];
    const vaultRemainingAccounts: AccountMeta[] = [];

    if (preTxBuffers.length) {
      for (const preTxBuffer of preTxBuffers) {
        const { instructions: ixs, addressLookupTableAccounts: alts } =
          await this.getInstructionsFromBuffer(preTxBuffer);
        instructions.push(...ixs);
        if (alts) altAccounts.push(...alts);
      }
    }

    const { address: userPoolTokenAddress, instruction: createUserPoolTokenInstruction } =
      await this.getOrCreateAssociatedTokenAddressInstruction(pool.mintAddress);
    if (createUserPoolTokenInstruction) instructions.push(createUserPoolTokenInstruction);

    let index = 0;
    for (const mintAddress of mintAddresses) {
      let vaultTokenAddress = pool.vault.getAuthorityTokenAddress(mintAddress);

      if (mintAddress.equals(NATIVE_MINT)) {
        const keypair = Keypair.generate();
        signers.push(keypair);
        instructions.push(
          ...this.createTokenAccountInstructions(keypair.publicKey),
          ...this.transferWSOLInstructions(keypair.publicKey, amounts[index]),
        );
        userRemainingAccounts.push({ isSigner: false, isWritable: true, pubkey: keypair.publicKey });
      } else {
        const account = await this.provider.connection.getAccountInfo(mintAddress);
        const tokenProgramId = account!.owner;

        const userTokenAddress = this.getAssociatedTokenAddress(mintAddress, tokenProgramId);
        userRemainingAccounts.push({ isSigner: false, isWritable: true, pubkey: userTokenAddress });

        vaultTokenAddress = pool.vault.getAuthorityTokenAddress(mintAddress, tokenProgramId);
      }

      vaultRemainingAccounts.push({ isSigner: false, isWritable: true, pubkey: vaultTokenAddress });

      index++;
    }

    instructions.push(
      await this.program.methods
        .deposit(
          amounts.map((amount, index) =>
            SafeAmount.toU64Amount(
              amount,
              pool.data.tokens.find((data) => data.mint.equals(mintAddresses[index]))!.decimals,
            ),
          ),
          SafeAmount.toU64Amount(minimumAmountOut, WeightedPool.POOL_TOKEN_DECIMALS),
        )
        .accountsStrict({
          user: this.walletAddress,
          userPoolToken: userPoolTokenAddress,
          mint: pool.mintAddress,
          pool: pool.address,
          poolAuthority: pool.authorityAddress,
          vault: pool.vault.address,
          vaultAuthority: pool.vault.authorityAddress,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenProgram2022: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          ...userRemainingAccounts,
          ...vaultRemainingAccounts,
          ...mintAddresses.map((pubkey) => ({ isSigner: false, isWritable: false, pubkey })),
        ])
        .instruction(),
    );

    if (signers.length) instructions.push(this.closeTokenAccountInstruction(signers[0].publicKey));

    return this.sendSmartTransaction(
      instructions,
      signers,
      altAccounts,
      priorityLevel,
      maxPriorityMicroLamports,
      simulate,
    );
  }

  async withdraw({
    pool,
    mintAddresses,
    amount,
    minimumAmountsOut,
    altAccounts,
    priorityLevel,
    maxPriorityMicroLamports,
    simulate,
  }: TransactionArgs<{
    pool: WeightedPool;
    mintAddresses: PublicKey[];
    amount: FloatLike;
    minimumAmountsOut?: FloatLike[];
  }>): Promise<TransactionSignature> {
    const instructions: TransactionInstruction[] = [];
    const signers: Signer[] = [];
    const userRemainingAccounts: AccountMeta[] = [];
    const vaultRemainingAccounts: AccountMeta[] = [];

    const userPoolTokenAddress = this.getAssociatedTokenAddress(pool.mintAddress);

    for (const mintAddress of mintAddresses) {
      let vaultTokenAddress = pool.vault.getAuthorityTokenAddress(mintAddress);

      if (mintAddress.equals(NATIVE_MINT)) {
        const keypair = Keypair.generate();
        signers.push(keypair);
        instructions.push(...this.createTokenAccountInstructions(keypair.publicKey, mintAddress));
        userRemainingAccounts.push({ isSigner: false, isWritable: true, pubkey: keypair.publicKey });
      } else {
        const account = await this.provider.connection.getAccountInfo(mintAddress);
        const tokenProgramId = account!.owner;

        const { address: userTokenAddress, instruction: createUserTokenInstruction } =
          await this.getOrCreateAssociatedTokenAddressInstruction(
            mintAddress,
            this.walletAddress,
            false,
            tokenProgramId,
          );
        if (createUserTokenInstruction) instructions.push(createUserTokenInstruction);
        userRemainingAccounts.push({ isSigner: false, isWritable: true, pubkey: userTokenAddress });

        vaultTokenAddress = pool.vault.getAuthorityTokenAddress(mintAddress, tokenProgramId);
      }

      vaultRemainingAccounts.push({ isSigner: false, isWritable: true, pubkey: vaultTokenAddress });
    }

    instructions.push(
      await this.program.methods
        .withdraw(
          SafeAmount.toU64Amount(amount, WeightedPool.POOL_TOKEN_DECIMALS),
          minimumAmountsOut !== undefined
            ? minimumAmountsOut.map((amount, index) =>
                SafeAmount.toU64Amount(
                  amount,
                  pool.data.tokens.find((data) => data.mint.equals(mintAddresses[index]))!.decimals,
                ),
              )
            : Array(mintAddresses.length).fill(new BN(0)),
        )
        .accountsStrict({
          user: this.walletAddress,
          userPoolToken: userPoolTokenAddress,
          mint: pool.mintAddress,
          pool: pool.address,
          withdrawAuthority: pool.vault.withdrawAuthorityAddress,
          vault: pool.vault.address,
          vaultAuthority: pool.vault.authorityAddress,
          vaultProgram: AMM_VAULT_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenProgram2022: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          ...userRemainingAccounts,
          ...vaultRemainingAccounts,
          ...mintAddresses.map((pubkey) => ({ isSigner: false, isWritable: false, pubkey })),
        ])
        .instruction(),
    );

    if (signers.length) instructions.push(this.closeTokenAccountInstruction(signers[0].publicKey));

    return this.sendSmartTransaction(
      instructions,
      signers,
      altAccounts,
      priorityLevel,
      maxPriorityMicroLamports,
      simulate,
    );
  }

  async swap({
    pool,
    mintInAddress,
    mintOutAddress,
    amountIn,
    minimumAmountOut,
    altAccounts,
    priorityLevel,
    maxPriorityMicroLamports,
    simulate,
  }: TransactionArgs<SwapArgs>): Promise<TransactionSignature> {
    const instructions: TransactionInstruction[] = [];
    const signers: Signer[] = [];

    let tokenInAddress, tokenInProgramId;
    if (mintInAddress.equals(NATIVE_MINT)) {
      tokenInProgramId = TOKEN_PROGRAM_ID;

      const keypair = Keypair.generate();
      instructions.push(
        ...this.createTokenAccountInstructions(keypair.publicKey),
        ...this.transferWSOLInstructions(keypair.publicKey, amountIn),
      );
      signers.push(keypair);
      tokenInAddress = keypair.publicKey;
    }

    let tokenOutAddress, tokenOutProgramId;
    if (mintOutAddress.equals(NATIVE_MINT)) {
      tokenOutProgramId = TOKEN_PROGRAM_ID;

      const keypair = Keypair.generate();
      signers.push(keypair);
      instructions.push(...this.createTokenAccountInstructions(keypair.publicKey, mintOutAddress));
      signers.push(keypair);
      tokenOutAddress = keypair.publicKey;
    }

    instructions.push(
      ...(await this.swapInstructions({
        pool,
        mintInAddress,
        mintOutAddress,
        amountIn,
        minimumAmountOut,
        tokenInAddress,
        tokenOutAddress,
        tokenInProgramId,
        tokenOutProgramId,
      })),
    );

    // close intermediate WSOL token accounts
    if (tokenInAddress) instructions.push(this.closeTokenAccountInstruction(tokenInAddress));
    if (tokenOutAddress) instructions.push(this.closeTokenAccountInstruction(tokenOutAddress));

    return this.sendSmartTransaction(
      instructions,
      signers,
      altAccounts,
      priorityLevel,
      maxPriorityMicroLamports,
      simulate,
    );
  }

  async swapInstructions({
    pool,
    mintInAddress,
    mintOutAddress,
    tokenInAddress,
    tokenOutAddress,
    tokenInProgramId,
    tokenOutProgramId,
    amountIn,
    minimumAmountOut,
  }: SwapInstructionArgs): Promise<TransactionInstruction[]> {
    const tokenIn = pool.tokens.find((token) => token.mintAddress.equals(mintInAddress));
    if (!tokenIn) throw Error("Path not found");
    const tokenOut = pool.tokens.find((token) => token.mintAddress.equals(mintOutAddress));
    if (!tokenOut) throw Error("Path not found");

    if (!tokenInProgramId) {
      const mintIn = await this.provider.connection.getAccountInfo(mintInAddress);
      if (!mintIn) throw Error("Invalid token input");
      tokenInProgramId = mintIn.owner;
    }

    if (!tokenOutProgramId) {
      const mintOut = await this.provider.connection.getAccountInfo(mintOutAddress);
      if (!mintOut) throw Error("Invalid token input");
      tokenOutProgramId = mintOut.owner;
    }

    const instructions: TransactionInstruction[] = [];

    let userTokenInAddress: PublicKey;
    if (tokenInAddress) {
      userTokenInAddress = tokenInAddress;
    } else {
      const { address: userTokenAddress, instruction: createUserTokenInstruction } =
        await this.getOrCreateAssociatedTokenAddressInstruction(
          mintInAddress,
          this.walletAddress,
          true,
          tokenInProgramId,
        );
      if (createUserTokenInstruction) {
        instructions.push(createUserTokenInstruction);
      }
      userTokenInAddress = userTokenAddress;
    }

    let userTokenOutAddress: PublicKey;
    if (tokenOutAddress) {
      userTokenOutAddress = tokenOutAddress;
    } else {
      const { address: userTokenAddress, instruction: createUserTokenInstruction } =
        await this.getOrCreateAssociatedTokenAddressInstruction(
          mintOutAddress,
          this.walletAddress,
          true,
          tokenOutProgramId,
        );
      if (createUserTokenInstruction) {
        instructions.push(createUserTokenInstruction);
      }
      userTokenOutAddress = userTokenAddress;
    }

    instructions.push(
      await this.program.methods
        .swapV2(
          amountIn ? SafeAmount.toU64Amount(amountIn, tokenIn.balance.decimals) : null,
          SafeAmount.toU64Amount(minimumAmountOut || 0, tokenOut.balance.decimals),
        )
        .accountsStrict({
          user: this.walletAddress,
          mintIn: mintInAddress,
          mintOut: mintOutAddress,
          userTokenIn: userTokenInAddress,
          userTokenOut: userTokenOutAddress,
          vaultTokenIn: pool.vault.getAuthorityTokenAddress(mintInAddress, tokenInProgramId),
          vaultTokenOut: pool.vault.getAuthorityTokenAddress(mintOutAddress, tokenOutProgramId),
          beneficiaryTokenOut: pool.vault.getBeneficiaryTokenAddress(mintOutAddress, tokenOutProgramId),
          pool: pool.address,
          withdrawAuthority: pool.vault.withdrawAuthorityAddress,
          vault: pool.vault.address,
          vaultAuthority: pool.vault.authorityAddress,
          vaultProgram: AMM_VAULT_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .instruction(),
    );

    return instructions;
  }

  async changeSwapFee({
    pool,
    swapFee,
    altAccounts,
    priorityLevel,
    maxPriorityMicroLamports,
    simulate,
  }: TransactionArgs<{ pool: WeightedPool; swapFee: FloatLike }>): Promise<TransactionSignature> {
    const instruction = await this.program.methods
      .changeSwapFee(SafeAmount.toGiga(swapFee))
      .accountsStrict({
        owner: this.walletAddress,
        pool: pool.address,
      })
      .instruction();

    return this.sendSmartTransaction([instruction], [], altAccounts, priorityLevel, maxPriorityMicroLamports, simulate);
  }

  async changeMaxSupply({
    pool,
    maxSupply,
    altAccounts,
    priorityLevel,
    maxPriorityMicroLamports,
    simulate,
  }: TransactionArgs<{ pool: WeightedPool; maxSupply: FloatLike }>): Promise<TransactionSignature> {
    const instruction = await this.program.methods
      .changeMaxSupply(SafeAmount.toU64Amount(maxSupply, WeightedPool.POOL_TOKEN_DECIMALS))
      .accountsStrict({
        owner: this.walletAddress,
        pool: pool.address,
      })
      .instruction();

    return this.sendSmartTransaction([instruction], [], altAccounts, priorityLevel, maxPriorityMicroLamports, simulate);
  }

  async shutdown({
    pool,
    altAccounts,
    priorityLevel,
    maxPriorityMicroLamports,
    simulate,
  }: TransactionArgs<{ pool: WeightedPool }>): Promise<TransactionSignature> {
    const instruction = await this.program.methods
      .shutdown()
      .accountsStrict({
        owner: pool.ownerAddress,
        pool: pool.address,
      })
      .instruction();

    return this.sendSmartTransaction([instruction], [], altAccounts, priorityLevel, maxPriorityMicroLamports, simulate);
  }

  async transferOwner({
    pool,
    ownerAddress,
    altAccounts,
    priorityLevel,
    maxPriorityMicroLamports,
    simulate,
  }: TransactionArgs<{ pool: WeightedPool; ownerAddress: PublicKey }>): Promise<TransactionSignature> {
    const instruction = await this.program.methods
      .transferOwner(ownerAddress)
      .accountsStrict({
        owner: this.walletAddress,
        pool: pool.address,
      })
      .instruction();

    return this.sendSmartTransaction([instruction], [], altAccounts, priorityLevel, maxPriorityMicroLamports, simulate);
  }
}

export class WeightedSwapListener {
  private _poolUpdatedListener?: number;
  private _poolBalancesUpdatedListener?: number;

  constructor(readonly program: WeightedSwapProgram) {}

  addPoolListener(callback: (event: DataUpdatedEvent<Partial<WeightedPoolData>>) => void) {
    this.removePoolListener();

    this._poolUpdatedListener = this.program.addEventListener(
      "poolUpdatedEvent",
      (event: DataUpdatedEvent<Partial<WeightedPoolData>>, _slot: number, signature: TransactionSignature) => {
        if (signature !== SIMULATED_SIGNATURE) {
          callback(event);
        }
      },
    );

    this._poolBalancesUpdatedListener = this.program.addEventListener(
      "poolBalanceUpdatedEvent",
      (event: DataUpdatedEvent<{ balances: BN[] }>, _slot: number, signature: TransactionSignature) => {
        if (event.data && signature !== SIMULATED_SIGNATURE) {
          callback({
            pubkey: event.pubkey,
            data: {
              tokens: event.data.balances.map((balance) => ({
                balance,
                decimals: 9, // dummy
                mint: event.pubkey, // dummy
                scalingFactor: new BN(1000), // dummy
                scalingUp: true, // dummy
                weight: new BN(0), // dummy
              })),
            },
          });
        }
      },
    );
  }

  removePoolListener() {
    if (this._poolUpdatedListener !== undefined) {
      this.program.removeEventListener(this._poolUpdatedListener);
      delete this._poolUpdatedListener;
    }

    if (this._poolBalancesUpdatedListener !== undefined) {
      this.program.removeEventListener(this._poolBalancesUpdatedListener);
      delete this._poolBalancesUpdatedListener;
    }
  }
}
