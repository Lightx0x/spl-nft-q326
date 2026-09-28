import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AccountRole,
  appendTransactionMessageInstructions,
  blockhash,
  createTransactionMessage,
  generateKeyPairSigner,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import {
  getCreateAccountInstruction,
  parseCreateAccountInstruction,
  SYSTEM_PROGRAM_ADDRESS,
} from "@solana-program/system";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenInstructionAsync,
  getInitializeMintInstruction,
  getMintSize,
  getMintToInstruction,
  getTransferCheckedInstruction,
  parseCreateAssociatedTokenInstruction,
  parseInitializeMintInstruction,
  parseMintToInstruction,
  parseTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  createSignerFromKeypair,
  generateSigner,
  signerIdentity,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createMetadataAccountV3,
  findMetadataPda,
  getCreateMetadataAccountV3InstructionDataSerializer,
  MPL_TOKEN_METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";

const DECIMALS = 6;
const ONE_TOKEN = 1_000_000n;

test("spl_init: mint account is 82 bytes", () => {
  assert.equal(getMintSize(), 82);
});

test("spl_init: createAccount allocates the mint and hands it to the Token Program", async () => {
  const payer = await generateKeyPairSigner();
  const mint = await generateKeyPairSigner();

  const ix = getCreateAccountInstruction({
    payer,
    newAccount: mint,
    lamports: 1_461_600n,
    space: getMintSize(),
    programAddress: TOKEN_PROGRAM_ADDRESS,
  });
  const parsed = parseCreateAccountInstruction(ix);

  assert.equal(ix.programAddress, SYSTEM_PROGRAM_ADDRESS);
  assert.equal(parsed.accounts.payer.address, payer.address);
  assert.equal(parsed.accounts.newAccount.address, mint.address);
  assert.equal(parsed.accounts.newAccount.role, AccountRole.WRITABLE_SIGNER);
  assert.equal(parsed.data.space, BigInt(getMintSize()));
  assert.equal(parsed.data.programAddress, TOKEN_PROGRAM_ADDRESS);
});

test("spl_init: initializeMint sets 6 decimals and the wallet as mint authority", async () => {
  const payer = await generateKeyPairSigner();
  const mint = await generateKeyPairSigner();

  const ix = getInitializeMintInstruction({
    mint: mint.address,
    decimals: DECIMALS,
    mintAuthority: payer.address,
  });
  const parsed = parseInitializeMintInstruction(ix);

  assert.equal(ix.programAddress, TOKEN_PROGRAM_ADDRESS);
  assert.equal(parsed.accounts.mint.address, mint.address);
  assert.equal(parsed.data.decimals, DECIMALS);
  assert.equal(parsed.data.mintAuthority, payer.address);
  assert.deepEqual(parsed.data.freezeAuthority, { __option: "None" });
});

test("spl_init: transaction is signed by both the payer and the new mint", async () => {
  const payer = await generateKeyPairSigner();
  const mint = await generateKeyPairSigner();

  const createAccountIx = getCreateAccountInstruction({
    payer,
    newAccount: mint,
    lamports: 1_461_600n,
    space: getMintSize(),
    programAddress: TOKEN_PROGRAM_ADDRESS,
  });
  const initMintIx = getInitializeMintInstruction({
    mint: mint.address,
    decimals: DECIMALS,
    mintAuthority: payer.address,
  });

  // Fake blockhash: signing happens offline, nothing is sent.
  const fakeBlockhash = {
    blockhash: blockhash("11111111111111111111111111111111"),
    lastValidBlockHeight: 0n,
  };

  const msg = createTransactionMessage({ version: 0 });
  const msgWithPayer = setTransactionMessageFeePayerSigner(payer, msg);
  const msgWithLifetime = setTransactionMessageLifetimeUsingBlockhash(fakeBlockhash, msgWithPayer);
  const txMessage = appendTransactionMessageInstructions([createAccountIx, initMintIx], msgWithLifetime);

  const signed = await signTransactionMessageWithSigners(txMessage);

  assert.deepEqual(
    Object.keys(signed.signatures).sort(),
    [payer.address, mint.address].sort(),
  );
  for (const signature of Object.values(signed.signatures)) {
    assert.ok(signature, "every required signer must have signed");
  }
});

test("spl_metadata: metadata goes to the Token Metadata PDA of the mint", () => {
  const umi = createUmi("http://127.0.0.1:8899");
  const wallet = generateSigner(umi);
  umi.use(signerIdentity(createSignerFromKeypair(umi, wallet)));
  const mint = generateSigner(umi).publicKey;

  const [ix] = createMetadataAccountV3(umi, {
    mint,
    mintAuthority: wallet,
    data: {
      name: "Tux Tux Coin",
      symbol: "TXC",
      uri: "",
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
    },
    isMutable: true,
    collectionDetails: null,
  }).getInstructions();

  const [metadataPda] = findMetadataPda(umi, { mint });
  const [data] = getCreateMetadataAccountV3InstructionDataSerializer().deserialize(
    ix.data,
  );

  assert.equal(ix.programId, MPL_TOKEN_METADATA_PROGRAM_ID);
  assert.equal(ix.keys[0].pubkey, metadataPda);
  assert.equal(data.data.name, "Tux Tux Coin");
  assert.equal(data.data.symbol, "TXC");
  assert.equal(data.isMutable, true);
});

test("spl_mint: ATA is deterministic per (owner, mint) and unique per owner", async () => {
  const mint = (await generateKeyPairSigner()).address;
  const alice = (await generateKeyPairSigner()).address;
  const bob = (await generateKeyPairSigner()).address;

  const [aliceAta1] = await findAssociatedTokenPda({ mint, owner: alice, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  const [aliceAta2] = await findAssociatedTokenPda({ mint, owner: alice, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  const [bobAta] = await findAssociatedTokenPda({ mint, owner: bob, tokenProgram: TOKEN_PROGRAM_ADDRESS });

  assert.equal(aliceAta1, aliceAta2);
  assert.notEqual(aliceAta1, bobAta);
});

test("spl_mint: createAssociatedToken creates the same ATA that findAssociatedTokenPda derives", async () => {
  const signer = await generateKeyPairSigner();
  const mint = (await generateKeyPairSigner()).address;

  const [ata] = await findAssociatedTokenPda({ mint, owner: signer.address, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  const ix = await getCreateAssociatedTokenInstructionAsync({
    payer: signer,
    mint,
    owner: signer.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const parsed = parseCreateAssociatedTokenInstruction(ix);

  assert.equal(ix.programAddress, ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
  assert.equal(parsed.accounts.ata.address, ata);
  assert.equal(parsed.accounts.owner.address, signer.address);
});

test("spl_mint: mintTo mints 1000 whole tokens (1000 * 10^6 base units) into the ATA", async () => {
  const signer = await generateKeyPairSigner();
  const mint = (await generateKeyPairSigner()).address;
  const [ata] = await findAssociatedTokenPda({ mint, owner: signer.address, tokenProgram: TOKEN_PROGRAM_ADDRESS });

  const parsed = parseMintToInstruction(
    getMintToInstruction({ mint, token: ata, mintAuthority: signer, amount: 1000n * ONE_TOKEN }),
  );

  assert.equal(parsed.data.amount, 1_000_000_000n);
  assert.equal(parsed.accounts.token.address, ata);
  assert.equal(parsed.accounts.mintAuthority.role, AccountRole.READONLY_SIGNER);
});

test("spl_transfer: transferChecked moves 10 tokens from sender ATA to recipient ATA", async () => {
  const signer = await generateKeyPairSigner();
  const recipient = (await generateKeyPairSigner()).address;
  const mint = (await generateKeyPairSigner()).address;
  const [fromAta] = await findAssociatedTokenPda({ mint, owner: signer.address, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  const [toAta] = await findAssociatedTokenPda({ mint, owner: recipient, tokenProgram: TOKEN_PROGRAM_ADDRESS });

  const parsed = parseTransferCheckedInstruction(
    getTransferCheckedInstruction({
      source: fromAta,
      mint,
      destination: toAta,
      authority: signer,
      amount: 10n * ONE_TOKEN,
      decimals: DECIMALS,
    }),
  );

  assert.equal(parsed.accounts.source.address, fromAta);
  assert.equal(parsed.accounts.destination.address, toAta);
  assert.equal(parsed.data.amount, 10_000_000n);
  assert.equal(parsed.data.decimals, DECIMALS);
});
