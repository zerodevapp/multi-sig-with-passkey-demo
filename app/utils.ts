import {
  WebAuthnKey,
} from "@zerodev/multi-chain-weighted-validator";
import {
  WebAuthnMode,
  toWebAuthnKey
} from "@zerodev/webauthn-key";
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
import { KERNEL_V3_1 } from '@zerodev/sdk/constants';

export const PASSKEY_URL =
  "https://passkeys.zerodev.app/api/v3/eb928232-8e0d-4756-996b-c8ae6147677c";
export const BUNDLER_URL =
  "https://rpc.zerodev.app/api/v2/bundler/eb928232-8e0d-4756-996b-c8ae6147677c";
export const PAYMASTER_URL =
  "https://rpc.zerodev.app/api/v2/paymaster/eb928232-8e0d-4756-996b-c8ae6147677c";
export const chainConfig: {
  [key: Chain["id"]]: {
    bundler: string;
    paymaster: string;
  };
} = {
  [sepolia.id]: {
    bundler:
      "https://rpc.zerodev.app/api/v2/bundler/eb928232-8e0d-4756-996b-c8ae6147677c",
    paymaster:
      "https://rpc.zerodev.app/api/v2/paymaster/eb928232-8e0d-4756-996b-c8ae6147677c",
  },
  [baseSepolia.id]: {
    bundler:
      "https://rpc.zerodev.app/api/v2/bundler/a637b264-19cb-4a5d-9929-9b706fe10acc",
    paymaster:
      "https://rpc.zerodev.app/api/v2/paymaster/a637b264-19cb-4a5d-9929-9b706fe10acc",
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
  return await toWebAuthnKey({
    passkeyName,
    passkeyServerUrl: PASSKEY_URL,
    mode: WebAuthnMode.Register,
    passkeyServerHeaders: {}
  });
};

export const loginAndFetchPassKeyPublicKey = async (
  passkeyName: string
): Promise<WebAuthnKey> => {
  return await toWebAuthnKey({
    passkeyName,
    passkeyServerUrl: PASSKEY_URL,
    mode: WebAuthnMode.Login,
    passkeyServerHeaders: {}
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
      kernelVersion: KERNEL_V3_1
    },
  );

  const account = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: multiSigValidator,
    },
    kernelVersion: KERNEL_V3_1
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
