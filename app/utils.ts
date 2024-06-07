import {
  toWebAuthnPubKey,
  WebAuthnMode,
  WebAuthnKey,
} from "@zerodev/multi-chain-weighted-validator";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { Address, Chain, createPublicClient, http } from "viem";
import { baseSepolia, sepolia } from "viem/chains";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless";
import { WeightedSigner } from "@zerodev/multi-chain-weighted-validator";
import {
  createMultiChainWeightedValidator,
  createMultiChainWeightedKernelAccountClient,
} from "@zerodev/multi-chain-weighted-validator";

export const PASSKEY_URL =
  "https://passkeys.zerodev.app/api/v3/d6304566-6855-4db5-8dfe-58b8809f0857";
export const BUNDLER_URL =
  "https://rpc.zerodev.app/api/v2/bundler/d6304566-6855-4db5-8dfe-58b8809f0857";
export const PAYMASTER_URL =
  "https://rpc.zerodev.app/api/v2/paymaster/d6304566-6855-4db5-8dfe-58b8809f0857";
export const chainConfig: {
  [key: Chain["id"]]: {
    bundler: string;
    paymaster: string;
  };
} = {
  [sepolia.id]: {
    bundler:
      "https://rpc.zerodev.app/api/v2/bundler/d6304566-6855-4db5-8dfe-58b8809f0857",
    paymaster:
      "https://rpc.zerodev.app/api/v2/paymaster/d6304566-6855-4db5-8dfe-58b8809f0857",
  },
  [baseSepolia.id]: {
    bundler:
      "https://rpc.zerodev.app/api/v2/bundler/9c00e33d-d76d-4f83-8668-f13659dac9fb",
    paymaster:
      "https://rpc.zerodev.app/api/v2/paymaster/9c00e33d-d76d-4f83-8668-f13659dac9fb",
  },
};
export const entryPoint = ENTRYPOINT_ADDRESS_V07;
export const chain = sepolia;
export const publicClient = createPublicClient({
  transport: http(BUNDLER_URL),
  chain,
});

export const registerAndFetchPassKeyPublicKey = async (
  passkeyName: string
): Promise<WebAuthnKey> => {
  return await toWebAuthnPubKey({
    passkeyName,
    passkeyServerUrl: PASSKEY_URL,
    mode: WebAuthnMode.Register,
  });
};

export const loginAndFetchPassKeyPublicKey = async (
  passkeyName: string
): Promise<WebAuthnKey> => {
  return await toWebAuthnPubKey({
    passkeyName,
    passkeyServerUrl: PASSKEY_URL,
    mode: WebAuthnMode.Login,
  });
};

export const createMultiChainWeightedAccountAndClient = async (
  signer: WeightedSigner,
  ecdsaSignerAddress: Address,
  publicKey: WebAuthnKey,
  chain: Chain
) => {
  const publicClient = createPublicClient({
    transport: http(chainConfig[chain.id].bundler),
    chain,
  });
  const multiSigValidator = await createMultiChainWeightedValidator(
    publicClient,
    {
      entryPoint,
      signer,
      config: {
        threshold: 100,
        signers: [
          {
            publicKey: ecdsaSignerAddress,
            weight: 50,
          },
          {
            publicKey,
            weight: 50,
          },
        ],
      },
    }
  );

  const account = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: multiSigValidator,
    },
  });

  const paymasterClient = createZeroDevPaymasterClient({
    entryPoint,
    chain,
    transport: http(chainConfig[chain.id].paymaster),
  });

  const client = createMultiChainWeightedKernelAccountClient({
    account,
    entryPoint,
    chain,
    bundlerTransport: http(chainConfig[chain.id].bundler),
    middleware: {
      sponsorUserOperation: paymasterClient.sponsorUserOperation,
    },
  });
  return { account, client };
};
