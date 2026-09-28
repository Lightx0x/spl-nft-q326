import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { address, createSolanaRpc } from "@solana/kit";
import {
  fetchMint,
  fetchToken,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { publicKey } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fetchMetadataFromSeeds } from "@metaplex-foundation/mpl-token-metadata";
import { fetchAsset, mplCore } from "@metaplex-foundation/mpl-core";

// Read-only checks against the accounts recorded in README.md. Nothing is signed or sent.
const RPC_URL = "https://api.devnet.solana.com";
const WALLET = address("4VymN5pAUeSWGQTJwkT6ZvJZh49Tn7Fy4j6L9KKSsn5a");
const RECIPIENT = address("FfKMDrTQiZpitWvPTYqBMHwzjdW2zh1D2pnQzcxYfH4a");
const MINT = address("2T1avQ2u7LxNWA4AmFXCmo5o2PPUsWiubKxUgVxAtLXc");
const WALLET_ATA = address("2F78Qb5QGfQjyGEjJMtATFSTgvzsvZypy6udbyizFDrP");
const RECIPIENT_ATA = address("4caMt8mxBHo5fxzHxfds5Td3HTXByPuMNxy7xJbRj7e1");
const NFT_ASSET = "HePYfTtdDEHZHfkDVm5i85cGWtpm1d35UfiphoYHeRbA";
const IMAGE_URI = "https://gateway.irys.xyz/oMKAcLb21uo64yZUQmBsrXd7KVfbsyiYME2rU1gHB3G";
const METADATA_URI = "https://gateway.irys.xyz/94RAp3gEMbGaijwogbYnV6fc2ac5T71AyxYhTbS7mnv1";

const ONE_TOKEN = 1_000_000n;
const TIMEOUT = { timeout: 30_000 };

const rpc = createSolanaRpc(RPC_URL);
const umi = createUmi(RPC_URL).use(mplCore());

describe("SPL token on devnet", () => {
  test("mint has 6 decimals, 1000 supply, and the wallet as mint authority", TIMEOUT, async () => {
    const { data } = await fetchMint(rpc, MINT);

    assert.equal(data.decimals, 6);
    assert.equal(data.supply, 1000n * ONE_TOKEN);
    assert.deepEqual(data.mintAuthority, { __option: "Some", value: WALLET });
  });

  test("metadata PDA holds the token name and symbol", TIMEOUT, async () => {
    const metadata = await fetchMetadataFromSeeds(umi, { mint: publicKey(MINT) });

    // Token Metadata pads strings with null bytes on-chain.
    assert.equal(metadata.name.replace(/\0/g, ""), "Tux Tux Coin");
    assert.equal(metadata.symbol.replace(/\0/g, ""), "TXC");
    assert.equal(metadata.updateAuthority, WALLET);
  });

  test("logged ATAs match the derived PDAs", TIMEOUT, async () => {
    const [walletAta] = await findAssociatedTokenPda({ mint: MINT, owner: WALLET, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const [recipientAta] = await findAssociatedTokenPda({ mint: MINT, owner: RECIPIENT, tokenProgram: TOKEN_PROGRAM_ADDRESS });

    assert.equal(walletAta, WALLET_ATA);
    assert.equal(recipientAta, RECIPIENT_ATA);
  });

  test("10 tokens moved from the wallet ATA to the recipient ATA", TIMEOUT, async () => {
    const [sender, recipient] = await Promise.all([
      fetchToken(rpc, WALLET_ATA),
      fetchToken(rpc, RECIPIENT_ATA),
    ]);

    assert.equal(sender.data.owner, WALLET);
    assert.equal(recipient.data.owner, RECIPIENT);
    assert.equal(sender.data.amount, 990n * ONE_TOKEN);
    assert.equal(recipient.data.amount, 10n * ONE_TOKEN);
  });
});

describe("NFT on devnet", () => {
  test("Core asset has the right name, metadata URI, and owner", TIMEOUT, async () => {
    const asset = await fetchAsset(umi, NFT_ASSET);

    assert.equal(asset.name, "Tux Tux");
    assert.equal(asset.uri, METADATA_URI);
    assert.equal(asset.owner, WALLET);
  });

  test("off-chain metadata JSON points at the uploaded image", TIMEOUT, async () => {
    const metadata = (await (await fetch(METADATA_URI)).json()) as {
      name: string;
      image: string;
      properties: { files: { uri: string }[] };
    };

    assert.equal(metadata.name, "Tux Tux");
    assert.equal(metadata.image, IMAGE_URI);
    assert.equal(metadata.properties.files[0].uri, IMAGE_URI);
  });

  test("uploaded image is served as a PNG", TIMEOUT, async () => {
    const response = await fetch(IMAGE_URI, { method: "HEAD" });

    assert.equal(response.ok, true);
    assert.match(response.headers.get("content-type") ?? "", /^image\/png/);
  });
});
