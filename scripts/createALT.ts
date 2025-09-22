import fs from "fs";
import { AddressLookupTableProgram, Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js"

const RPC_URL = "https://api.mainnet-beta.solana.com"
const KP_FPATH = "alt_admin.json"

const TABLE_ADDRESS = "6BjuNU4HzNBevtXDJveiHHRF9D4QWucjxLpUwo4VsNfF"

const ALT_ADDRESSES_X = [
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "ComputeBudget111111111111111111111111111111",
  "11111111111111111111111111111111",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",  // token-2022 program
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",  // token program
  "vo1tWgqZMjG61Z2T9qUaMYKqZ75CYzMuaZ2LZP1n7HV",  // stabble vault program
  "w8edo9a9TDw52c1rBmVbP6dNakaAuFiPjDd52ZJwwVi",  // stabble vault account
  "7HkzG4LYyCJSrD3gopPQv3VVzQQKbHBZcm9fbjj5fuaH", // stabble vault authority 2

  //Tokens
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "So11111111111111111111111111111111111111112",
  "STBuyENwJ1GP4yNZCjwavn92wYLEY3t5S1kVS5kwyS1",  // STB Mint
  "6ogzHhzdrQr9Pgv6hZ2MNze7UrzBMAFyBBWUYp1Fhitx", // retardio
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // jup
  "CPcf58MNikQw2G23kTVWQevRDeFDpdxMH7KkR7Lhpump", //doby
  "zBTCug3er3tLyffELcvDNrKkCymbPWysGcWihESYfLg", // zbtc
  "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE", // orca
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", // ray
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // bonk

  // Vaults
  "GccQVsvMnFNM3DGjJT9TN1MNTLHn3umWbD7V1KXsCEL9",
  "7qF3xhzfwxsDBDgYococ9ZZECEmfq2R7Tos5RsEnjPqf",
  "2PkFYJpyum86qkAM46hZ7bNvUGq157RoaPKFrgTAWLub",
  "GvNR6b4nDjGJiwFj44uoxW8E7FPVgbLHm3HaBDRhVbT3",


  // Pools
  "Cfaxuh2PEevrdaaMzBZadZc68cmz2tB5GgenK9vaYYaT",
  "ASUXpwE84MKGmaTp2Sxd9ZE15qfENwS8oBH7UUkk1AwB",
  "8Nf7fVi3tfSGCZzVmsc1Niw6N3ZhaQuiLuKexSz7NbdK",
  "4aoFPvAHgPo7W4Cckut1tjUAsfhYVsmoJwuqwRbmYsAy",
  "AMuuywfbfFxi9BsJ55RJNaDBQythdRcmL6oaM7CpnkKH",
  "21Wic6asgZ3Rk81LzAsFiAWp6oCVRWQwFeRpA7YcjnDk",
  "8ED3VpgKGAZjPt6aBgpvc62EQH48U7XY3QG1M6w2oeYP",
  "HGaS81Ejydkr4dsNPq2h3NQcQY5AsGijzYjP675YGSha",
  "AeUJLexL6tUo8o6vY1mCiLWQ4xTy1SUAWoLF9WoRCcPc",
  "HoAHDQss5qzYkoKPXtRJRHCQrUWxcHvs4vmZ8QsN4nSq", // stabble wsol vault
  "swapFpHZwjELNnjvThjajtiVmkz3yPQEHjLtka2fwHW",  // weighted swap program
  "64vvmxBSBAYS7uwYWTNvoPekVS6emVXFXVjjhWGJ4GLA", // stabble SOL-USDC LP token
  "JV4MkRFn58xpyrhF2oDxQYwnq5jFVzTQUKcUzce1FQA",   // SOL-USDC pool
  "3a5z3jdAasnzeKgaKtxXZ326ghK1L2exxwhWgEB6qR1D", // stabble (SOL-USDC) Mint Authority
  // Gov
  "veSTB2CqekLUzVevEs9mx5mpdE9odxHhFHmcGtX1D9k", // vote-escrowed STB (veSTB)
  "GovSTBshDa7PyWDzDqmWnHRa9qvZzCD8uQ4wyLRniS2h", // something gov related
  "gov3LSmekCKmzLnKJ87csYdef5QNYM2G3kNDbhZekkA", // governo program
  "CeWD1MJ5GLHkAcQqDDnKVB8zNKajwfHrjN6hyys1UugT", // something rewarder related
  // Reward
  "rev31KMq4qzt1y1iw926p694MHVVWT57caQrsHLFA4x", // rewaredr program - I think
  "GiXKtJYdmrfNvXkxjXkn3TaNAjmWETwBRj8xqBJWAi5P", // rewarder related
]

const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(KP_FPATH, 'utf-8'))));

async function signSendAndConfirm(connection: Connection, ixs: TransactionInstruction[], payer: Keypair) {

  const latestBlockHash = await connection.getLatestBlockhash();
  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: latestBlockHash.blockhash,
    instructions: ixs,
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);

  tx.sign([payer]);

  const sig = await connection.sendTransaction(tx);

  let result = await connection.confirmTransaction({
    blockhash: (await connection.getLatestBlockhash()).blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    signature: sig,
  });

  return result
}

(async () => {
  const connection = new Connection(RPC_URL);

  const lookupTableAddress = new PublicKey(TABLE_ADDRESS);

  // const [lookupTableIx, lookupTableAddress] =
  //   AddressLookupTableProgram.createLookupTable({
  //     authority: payer.publicKey,
  //     payer: payer.publicKey,
  //     recentSlot: (await connection.getSlot()),
  //   });

  // console.log("lookup table address:", lookupTableAddress.toBase58());

  // let result = await signSendAndConfirm(connection, [lookupTableIx], payer);

  // await new Promise((r) => setTimeout(r, 2000));

  // console.log("ALT ix result", result);

  const extendInstruction = AddressLookupTableProgram.extendLookupTable({
    payer: payer.publicKey,
    authority: payer.publicKey,
    lookupTable: lookupTableAddress,
    addresses: ALT_ADDRESSES_X.slice(21, 41).map((pubkey) => new PublicKey(pubkey)),
  });

  let extendResult = await signSendAndConfirm(connection, [extendInstruction], payer);

  console.log("Extend ALT ix result", extendResult);

  // get the table from the cluster
  const lookupTableAccount = (
    await connection.getAddressLookupTable(lookupTableAddress)
  ).value;

  console.log("Table address from cluster:", lookupTableAccount?.key.toBase58());

})();
