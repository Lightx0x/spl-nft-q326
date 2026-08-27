import {
	createSignerFromKeypair,
	publicKey,
	signerIdentity,
} from "@metaplex-foundation/umi";
import wallet from "../../devnet-wallet.json";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
	createMetadataAccountV3,
	CreateMetadataAccountV3InstructionAccounts,
	CreateMetadataAccountV3InstructionArgs,
	DataV2Args,
} from "@metaplex-foundation/mpl-token-metadata";
import bs58 from "bs58";

//paste your mint address got from spl_init.ts
const mint = publicKey("2T1avQ2u7LxNWA4AmFXCmo5o2PPUsWiubKxUgVxAtLXc");

const umi = createUmi("https://api.devnet.solana.com");

const keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(wallet));
const signer = createSignerFromKeypair(umi, keypair);

umi.use(signerIdentity(signer));

(async () => {
	try {
		const accounts: CreateMetadataAccountV3InstructionAccounts = {
			mint,
			mintAuthority: signer,
		};

		//change the metadata
		const data: DataV2Args = {
			name: "Tux Tux Coin",
			symbol: "TXC",
			uri: "",
			sellerFeeBasisPoints: 0,
			creators: null,
			collection: null,
			uses: null,
		};

		const args: CreateMetadataAccountV3InstructionArgs = {
			data,
			isMutable: true,
			collectionDetails: null,
		};

		const tx = createMetadataAccountV3(umi, {
			...accounts,
			...args,
		});

		const result = await tx.sendAndConfirm(umi);
		console.log("signature: ", bs58.encode(Buffer.from(result.signature)));
	} catch (error) {
		console.log("error", error);
	}
})();

//3iiCtTtsAbuDKd46E3iPcQYvvvMcrXJpUKjYwyHLiGuXEZA5rw7zyBRLFjUN6sB3pGvGvnjMRcMFvbWUMnsGPZp7
