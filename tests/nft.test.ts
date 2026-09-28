import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGenericFile,
  createSignerFromKeypair,
  generateSigner,
  signerIdentity,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  create,
  getCreateV2InstructionDataSerializer,
  MPL_CORE_PROGRAM_ID,
  mplCore,
} from "@metaplex-foundation/mpl-core";

function offlineUmi() {
  const umi = createUmi("http://127.0.0.1:8899");
  const wallet = generateSigner(umi);
  umi.use(signerIdentity(createSignerFromKeypair(umi, wallet)));
  umi.use(mplCore());
  return { umi, wallet };
}

test("nft_image: image file carries its name and PNG content type for Irys", () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  const file = createGenericFile(bytes, "tuxtux", { contentType: "image/png" });

  assert.equal(file.fileName, "tuxtux");
  assert.equal(file.contentType, "image/png");
  assert.deepEqual(file.buffer, bytes);
});

test("nft_mint: create targets the Core program with the NFT name and metadata URI", () => {
  const { umi } = offlineUmi();
  const asset = generateSigner(umi);
  const uri = "https://gateway.irys.xyz/94RAp3gEMbGaijwogbYnV6fc2ac5T71AyxYhTbS7mnv1";

  const [ix] = create(umi, { asset, name: "Tux Tux", uri }).getInstructions();
  const [data] = getCreateV2InstructionDataSerializer().deserialize(ix.data);

  assert.equal(ix.programId, MPL_CORE_PROGRAM_ID);
  assert.equal(data.name, "Tux Tux");
  assert.equal(data.uri, uri);
});

test("nft_mint: the new asset account must sign, and the wallet pays", () => {
  const { umi, wallet } = offlineUmi();
  const asset = generateSigner(umi);

  const [ix] = create(umi, { asset, name: "Tux Tux", uri: "https://example.com" }).getInstructions();
  const assetKey = ix.keys.find((k) => k.pubkey === asset.publicKey);
  const payerKey = ix.keys.find((k) => k.pubkey === wallet.publicKey);

  assert.ok(assetKey?.isSigner, "asset must be a signer");
  assert.ok(payerKey?.isSigner, "wallet must be a signer");
});
